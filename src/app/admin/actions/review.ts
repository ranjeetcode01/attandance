"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { labourSheets, punches, requests, sites, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";
import { istDate, istMoment, todayIST } from "@/lib/time";
import { back, returnPath, str } from "./util";

type Decision = "approved" | "rejected";
const decisionOf = (form: FormData): Decision => (str(form, "decision") === "rejected" ? "rejected" : "approved");

export async function reviewPunches(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  // "quick" is a per-row approve button; otherwise the checked ids are used.
  const quick = str(form, "quick");
  const idList = (quick ? [quick] : form.getAll("id").map(String)).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const decision = quick ? "approved" : decisionOf(form);
  const note = str(form, "note").slice(0, 300);
  const path = returnPath(form, "/admin/review");
  if (!idList.length) back(path, { err: "Select at least one punch." });
  if (decision === "rejected" && !note) back(path, { err: "Write a reason when rejecting." });
  const db = await getDb();
  await db
    .update(punches)
    .set({ reviewStatus: decision, reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note })
    .where(inArray(punches.id, idList));
  await audit(me.id, `punch.${decision}`, "punch", idList.join(","), { note });
  revalidatePath("/admin", "layout");
  back(path, { ok: `${idList.length} punch${idList.length > 1 ? "es" : ""} ${decision}.` });
}

export async function reviewSheet(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  const id = str(form, "id");
  const decision = decisionOf(form);
  const note = str(form, "note").slice(0, 300);
  const path = returnPath(form, "/admin/review");
  if (decision === "rejected" && !note) back(path, { err: "Write a reason when rejecting." });
  const db = await getDb();
  await db
    .update(labourSheets)
    .set({ reviewStatus: decision, reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note })
    .where(eq(labourSheets.id, id));
  await audit(me.id, `labour_sheet.${decision}`, "labour_sheet", id, { note });
  revalidatePath("/admin", "layout");
  back(path, { ok: `Labour sheet ${decision}.` });
}

export async function reviewRequest(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  const id = str(form, "id");
  const decision = decisionOf(form);
  const note = str(form, "note").slice(0, 300);
  const path = returnPath(form, "/admin/requests");
  const db = await getDb();
  const [req] = await db.select().from(requests).where(eq(requests.id, id));
  if (!req || req.status !== "pending") back(path, { err: "Request already handled." });
  if (req.userId === me.id && me.role !== "admin") back(path, { err: "You cannot approve your own request." });
  if (decision === "rejected" && !note) back(path, { err: "Write a reason when rejecting." });

  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set({ status: decision, reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note })
      .where(and(eq(requests.id, id), eq(requests.status, "pending")));

    // An approved missed-punch request becomes real punches.
    if (decision === "approved" && req.kind === "regularization") {
      const rows = (
        [
          ["IN", req.inTime],
          ["OUT", req.outTime],
        ] as const
      )
        .filter(([, t]) => t)
        .map(([type, t]) => {
          const at = new Date(istMoment(req.fromDate, t));
          return {
            id: randomUUID(),
            userId: req.userId,
            siteId: req.siteId,
            type,
            source: "regularization" as const,
            deviceTime: at,
            punchTime: at,
            workDate: req.fromDate,
            note: `Regularized: ${req.reason}`.slice(0, 500),
            reviewStatus: "approved" as const,
            reviewedBy: me.id,
            reviewedAt: new Date(),
            reviewNote: note,
          };
        });
      if (rows.length) await tx.insert(punches).values(rows);
    }
  });
  await audit(me.id, `request.${decision}`, "request", id, { kind: req.kind, note });
  revalidatePath("/admin", "layout");
  back(path, { ok: `Request ${decision}.` });
}

// Manual correction by a manager (e.g. phone lost). Recorded as source=admin and audited.
export async function addManualPunch(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  const path = returnPath(form, "/admin/attendance");
  const userId = Number(str(form, "userId"));
  const siteId = Number(str(form, "siteId"));
  const date = str(form, "date");
  const time = str(form, "time");
  const type = str(form, "type") === "OUT" ? "OUT" : "IN";
  const note = str(form, "note");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) back(path, { err: "Enter a valid date and time." });
  if (date > todayIST()) back(path, { err: "Date cannot be in the future." });
  if (note.length < 5) back(path, { err: "Write a reason for the manual entry." });
  const db = await getDb();
  const [[u], [s]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)),
    db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)),
  ]);
  if (!u || !s) back(path, { err: "Select a person and site." });
  const at = new Date(istMoment(date, time));
  const id = randomUUID();
  await db.insert(punches).values({
    id,
    userId,
    siteId,
    type,
    source: "admin",
    deviceTime: at,
    punchTime: at,
    workDate: istDate(at),
    note: `Manual: ${note}`.slice(0, 500),
    reviewStatus: "approved",
    reviewedBy: me.id,
    reviewedAt: new Date(),
  });
  await audit(me.id, "punch.manual", "punch", id, { userId, siteId, date, time, type, note });
  revalidatePath("/admin", "layout");
  back(path, { ok: `Manual ${type} added.` });
}
