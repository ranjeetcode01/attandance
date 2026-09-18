import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db";
import {
  contractors,
  labourEntries,
  labourers,
  labourSheets,
  punches,
  requests,
  sites,
  userSites,
  type AppSettings,
} from "@/db/schema";
import { audit } from "./audit";
import type { CurrentUser } from "./auth";
import { FIELD_MANAGER_ROLES, MANAGER_ROLES } from "./auth";
import { FLAG_INFO, hasSevereFlag } from "./defaults";
import { fenceCheck, haversineM } from "./geo";
import { PhotoError, saveJpegDataUrl } from "./storage";
import type { labourPayload, punchPayload, requestPayload, SyncResult } from "./sync-schema";
import { addDays, istDate, todayIST } from "./time";

// Error the phone should NOT retry (bad data, no permission). Network/server errors are retried.
export class RejectError extends Error {}

const SKEW_TOLERANCE_MS = 2 * 60_000;
const TAMPER_TOLERANCE_MS = 2 * 60_000;

type LastSync = { serverTime: number; deviceTime: number } | null | undefined;

/**
 * Works out the real time of an offline record.
 * If the phone clock is off by a constant amount, (receivedAt − sentAt) reveals the
 * offset and is applied to the record's device time.
 */
function correctTime(deviceTime: number, sentAt: number, receivedAt: number, lastSync: LastSync) {
  const flags: string[] = [];
  const skew = receivedAt - sentAt;
  let time = deviceTime;
  if (Math.abs(skew) > SKEW_TOLERANCE_MS) {
    time = deviceTime + skew;
    flags.push("CLOCK_SKEW");
  }
  if (lastSync) {
    // The phone clock went backwards since it last talked to the server.
    if (deviceTime < lastSync.deviceTime - TAMPER_TOLERANCE_MS) flags.push("CLOCK_TAMPER");
    // The record claims a time earlier than a moment the phone was already online.
    else if (time < lastSync.serverTime - TAMPER_TOLERANCE_MS) flags.push("CLOCK_TAMPER");
  }
  if (time > receivedAt + TAMPER_TOLERANCE_MS) {
    flags.push("CLOCK_TAMPER");
    time = receivedAt;
  }
  return { time, skew, flags };
}

function syncAgeFlags(time: number, receivedAt: number, settings: AppSettings) {
  const age = receivedAt - time;
  const flags: string[] = [];
  if (age > SKEW_TOLERANCE_MS) flags.push("OFFLINE");
  if (age > settings.syncWindowHours * 3600_000) flags.push("LATE_SYNC");
  return flags;
}

const uniq = (flags: string[]) => [...new Set(flags)];

async function loadSite(siteId: number) {
  const db = await getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!site || !site.active) throw new RejectError("Site not found or inactive.");
  return site;
}

async function isAssigned(user: CurrentUser, siteId: number) {
  if (MANAGER_ROLES.includes(user.role)) return true;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(userSites)
    .where(and(eq(userSites.userId, user.id), eq(userSites.siteId, siteId)));
  return !!row;
}

async function savePhoto(dataUrl: string, folder: "selfies" | "labour", time: number) {
  try {
    return await saveJpegDataUrl(dataUrl, folder, istDate(time).slice(0, 7));
  } catch (err) {
    if (err instanceof PhotoError) throw new RejectError(err.message);
    throw err;
  }
}

function describe(flags: string[], okText: string) {
  const severe = flags.filter((f) => FLAG_INFO[f]?.severe);
  if (!severe.length) return okText;
  return `Sent for review: ${severe.map((f) => FLAG_INFO[f].label).join(", ")}`;
}

// ---------------------------------------------------------------- punches

export async function processPunch(
  user: CurrentUser,
  id: string,
  p: z.output<typeof punchPayload>,
  ctx: { deviceId: string; sentAt: number; settings: AppSettings; userAgent: string },
): Promise<SyncResult> {
  const db = await getDb();
  const existing = await db.select().from(punches).where(eq(punches.id, id));
  if (existing[0]) {
    if (existing[0].userId !== user.id) throw new RejectError("Duplicate record id.");
    return punchResult(existing[0]);
  }

  const { settings } = ctx;
  const receivedAt = Date.now();
  const site = await loadSite(p.siteId);
  const t = correctTime(p.deviceTime, ctx.sentAt, receivedAt, p.lastSync);
  const flags = [...t.flags, ...syncAgeFlags(t.time, receivedAt, settings)];
  const workDate = istDate(t.time);

  if (!(await isAssigned(user, site.id))) flags.push("SITE_NOT_ASSIGNED");
  if (p.mock) flags.push("MOCK_LOCATION");

  let distanceM: number | null = null;
  let insideFence: boolean | null = null;
  if (p.lat == null || p.lng == null) {
    flags.push("NO_LOCATION");
  } else {
    const fc = fenceCheck(site, p.lat, p.lng, p.accuracy ?? 0, settings.accuracyToleranceM);
    distanceM = Math.round(fc.distanceM);
    insideFence = fc.inside;
    if (!fc.inside) flags.push("OUTSIDE_FENCE");
    if ((p.accuracy ?? 0) > settings.maxAccuracyM) flags.push("LOW_ACCURACY");
  }

  // Same device: sequence numbers must move forward in time, and within one app
  // session the wall clock must advance at the same rate as the monotonic clock.
  const [prevOnDevice] = await db
    .select()
    .from(punches)
    .where(and(eq(punches.deviceId, ctx.deviceId), lt(punches.seq, p.seq)))
    .orderBy(desc(punches.seq))
    .limit(1);
  if (prevOnDevice) {
    const prevDevice = prevOnDevice.deviceTime.getTime();
    if (p.deviceTime < prevDevice - TAMPER_TOLERANCE_MS) flags.push("CLOCK_TAMPER");
    if (prevOnDevice.sessionId === p.sessionId && prevOnDevice.perfNow != null) {
      const wall = p.deviceTime - prevDevice;
      const mono = p.perfNow - prevOnDevice.perfNow;
      if (Math.abs(wall - mono) > TAMPER_TOLERANCE_MS) flags.push("CLOCK_TAMPER");
    }
  }

  // Previous punch of this user: travel speed and IN/OUT order.
  const [prevPunch] = await db
    .select()
    .from(punches)
    .where(and(eq(punches.userId, user.id), lt(punches.punchTime, new Date(t.time)), ne(punches.reviewStatus, "rejected")))
    .orderBy(desc(punches.punchTime))
    .limit(1);
  if (prevPunch && p.lat != null && p.lng != null && prevPunch.lat != null && prevPunch.lng != null) {
    const km = haversineM(prevPunch.lat, prevPunch.lng, p.lat, p.lng) / 1000;
    const hours = Math.max((t.time - prevPunch.punchTime.getTime()) / 3600_000, 1 / 60);
    if (km > 5 && km / hours > 150) flags.push("IMPOSSIBLE_TRAVEL");
  }
  const sameDayPrev = prevPunch && prevPunch.workDate === workDate ? prevPunch : null;
  if (p.type === "IN" && sameDayPrev?.type === "IN") flags.push("DUPLICATE_IN");
  if (p.type === "OUT" && (!sameDayPrev || sameDayPrev.type === "OUT")) flags.push("OUT_WITHOUT_IN");

  let selfiePath: string | null = null;
  let selfieHash: string | null = null;
  if (p.selfie) {
    const saved = await savePhoto(p.selfie, "selfies", t.time);
    selfiePath = saved.path;
    selfieHash = p.selfieRawHash || saved.hash;
    const [reused] = await db
      .select({ id: punches.id })
      .from(punches)
      .where(and(isNotNull(punches.selfieHash), eq(punches.selfieHash, selfieHash)))
      .limit(1);
    if (reused) flags.push("SELFIE_REUSED");
  } else if (settings.requireSelfie) {
    flags.push("NO_SELFIE");
  }

  const finalFlags = uniq(flags);
  const [row] = await db
    .insert(punches)
    .values({
      id,
      userId: user.id,
      siteId: site.id,
      type: p.type,
      source: "app",
      deviceTime: new Date(p.deviceTime),
      sentAt: new Date(ctx.sentAt),
      receivedAt: new Date(receivedAt),
      punchTime: new Date(t.time),
      workDate,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      distanceM,
      insideFence,
      offline: finalFlags.includes("OFFLINE"),
      selfiePath,
      selfieHash,
      workArea: p.workArea,
      note: p.note,
      deviceId: ctx.deviceId,
      sessionId: p.sessionId,
      perfNow: p.perfNow,
      seq: p.seq,
      flags: finalFlags,
      reviewStatus: hasSevereFlag(finalFlags) ? "pending" : "ok",
      meta: {
        userAgent: ctx.userAgent.slice(0, 300),
        gpsTime: p.gpsTime ?? undefined,
        lastSyncServerTime: p.lastSync?.serverTime,
        lastSyncDeviceTime: p.lastSync?.deviceTime,
        skewMs: t.skew,
        mock: p.mock,
      },
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    const [again] = await db.select().from(punches).where(eq(punches.id, id));
    return punchResult(again);
  }
  return punchResult(row, site.name);
}

function punchResult(row: typeof punches.$inferSelect, siteName?: string): SyncResult {
  const label = `${row.type} ${siteName ? `at ${siteName} ` : ""}recorded`;
  return {
    id: row.id,
    kind: "punch",
    status: row.reviewStatus,
    flags: row.flags,
    message: describe(row.flags, label),
    punchTime: row.punchTime.getTime(),
    workDate: row.workDate,
  };
}

// ---------------------------------------------------------------- labour sheets

export async function processLabour(
  user: CurrentUser,
  id: string,
  p: z.output<typeof labourPayload>,
  ctx: { sentAt: number; settings: AppSettings },
): Promise<SyncResult> {
  if (!FIELD_MANAGER_ROLES.includes(user.role)) throw new RejectError("Only supervisors can mark labour attendance.");
  const db = await getDb();
  const [existing] = await db.select().from(labourSheets).where(eq(labourSheets.id, id));
  if (existing) return labourResult(existing, "Labour sheet already saved");

  const receivedAt = Date.now();
  const site = await loadSite(p.siteId);
  const [contractor] = await db.select().from(contractors).where(eq(contractors.id, p.contractorId));
  if (!contractor) throw new RejectError("Contractor not found.");

  const t = correctTime(p.deviceTime, ctx.sentAt, receivedAt, p.lastSync);
  const flags = [...t.flags, ...syncAgeFlags(t.time, receivedAt, ctx.settings)];
  if (!(await isAssigned(user, site.id))) flags.push("SITE_NOT_ASSIGNED");

  const actualDate = istDate(t.time);
  if (p.date > actualDate || p.date < addDays(actualDate, -1)) flags.push("DATE_MISMATCH");
  if (p.date > todayIST()) throw new RejectError("Cannot mark labour for a future date.");

  let distanceM: number | null = null;
  let insideFence: boolean | null = null;
  if (p.lat == null || p.lng == null) flags.push("NO_LOCATION");
  else {
    const fc = fenceCheck(site, p.lat, p.lng, p.accuracy ?? 0, ctx.settings.accuracyToleranceM);
    distanceM = Math.round(fc.distanceM);
    insideFence = fc.inside;
    if (!fc.inside) flags.push("OUTSIDE_FENCE");
  }

  const ids = p.entries.map((e) => e.labourerId);
  const known = ids.length
    ? await db
        .select()
        .from(labourers)
        .where(and(inArray(labourers.id, ids), eq(labourers.contractorId, contractor.id)))
    : [];
  const byId = new Map(known.map((l) => [l.id, l]));
  if (byId.size !== new Set(ids).size) throw new RejectError("Some labourers do not belong to this contractor.");

  const photo = p.photo ? await savePhoto(p.photo, "labour", t.time) : null;
  const finalFlags = uniq(flags);
  const values = {
    workDate: p.date,
    siteId: site.id,
    contractorId: contractor.id,
    markedBy: user.id,
    deviceTime: new Date(p.deviceTime),
    punchTime: new Date(t.time),
    receivedAt: new Date(receivedAt),
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    distanceM,
    insideFence,
    offline: finalFlags.includes("OFFLINE"),
    photoPath: photo?.path ?? null,
    ppeChecked: p.ppeChecked,
    toolboxTalk: p.toolboxTalk,
    note: p.note,
    flags: finalFlags,
    reviewStatus: hasSevereFlag(finalFlags) ? ("pending" as const) : ("ok" as const),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: "",
    updatedAt: new Date(),
  };

  const sheet = await db.transaction(async (tx) => {
    const [prior] = await tx
      .select()
      .from(labourSheets)
      .where(and(eq(labourSheets.workDate, p.date), eq(labourSheets.siteId, site.id), eq(labourSheets.contractorId, contractor.id)));
    let sheetRow: typeof labourSheets.$inferSelect;
    if (prior) {
      // A newer submission for the same day/site/contractor replaces the old one.
      [sheetRow] = await tx.update(labourSheets).set(values).where(eq(labourSheets.id, prior.id)).returning();
      await tx.delete(labourEntries).where(eq(labourEntries.sheetId, prior.id));
    } else {
      [sheetRow] = await tx.insert(labourSheets).values({ id, ...values }).returning();
    }
    const rows = [
      ...p.entries.map((e) => {
        const l = byId.get(e.labourerId)!;
        return { sheetId: sheetRow.id, labourerId: l.id, trade: l.trade, count: 1, status: e.status, otHours: e.status === "A" ? 0 : e.otHours, rate: l.dailyWage };
      }),
      ...p.headcount.map((h) => ({ sheetId: sheetRow.id, labourerId: null, trade: h.trade, count: h.count, status: "P" as const, otHours: h.otHours, rate: h.rate })),
    ];
    if (rows.length) await tx.insert(labourEntries).values(rows);
    return { row: sheetRow, replaced: !!prior };
  });

  if (sheet.replaced) await audit(user.id, "labour.resubmit", "labour_sheet", sheet.row.id, { date: p.date, siteId: site.id });
  const present = p.entries.filter((e) => e.status !== "A").length + p.headcount.reduce((a, h) => a + h.count, 0);
  return labourResult(sheet.row, `Labour sheet saved (${present} present)`);
}

function labourResult(row: typeof labourSheets.$inferSelect, okText: string): SyncResult {
  return {
    id: row.id,
    kind: "labour",
    status: row.reviewStatus,
    flags: row.flags,
    message: describe(row.flags, okText),
    punchTime: row.punchTime.getTime(),
    workDate: row.workDate,
  };
}

// ---------------------------------------------------------------- requests

export async function processRequest(user: CurrentUser, id: string, p: z.output<typeof requestPayload>): Promise<SyncResult> {
  const db = await getDb();
  const [existing] = await db.select().from(requests).where(eq(requests.id, id));
  if (existing) {
    return { id, kind: "request", status: existing.status, flags: [], message: "Request already submitted" };
  }
  const today = todayIST();
  if (p.kind === "regularization") {
    if (p.date > today) throw new RejectError("Cannot regularize a future date.");
    if (!p.inTime && !p.outTime) throw new RejectError("Enter IN time, OUT time or both.");
    if (p.inTime && p.outTime && p.outTime <= p.inTime) throw new RejectError("OUT time must be after IN time.");
    await loadSite(p.siteId);
    await db.insert(requests).values({
      id,
      userId: user.id,
      kind: "regularization",
      fromDate: p.date,
      toDate: p.date,
      siteId: p.siteId,
      inTime: p.inTime,
      outTime: p.outTime,
      reason: p.reason,
    });
  } else {
    if (p.toDate < p.fromDate) throw new RejectError("Leave end date is before start date.");
    if (p.toDate > addDays(p.fromDate, 60)) throw new RejectError("Leave cannot be longer than 60 days.");
    await db.insert(requests).values({
      id,
      userId: user.id,
      kind: "leave",
      fromDate: p.fromDate,
      toDate: p.toDate,
      leaveType: p.leaveType,
      reason: p.reason,
    });
  }
  return { id, kind: "request", status: "pending", flags: [], message: "Request sent to manager" };
}
