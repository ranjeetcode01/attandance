"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { contractors, labourers, projects, sites, users, userSites, type Role, type WageType } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { back, bool, ids, num, returnPath, str } from "./util";

const ROLES: Role[] = ["admin", "pm", "supervisor", "staff"];
const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return err?.code === "23505" || err?.cause?.code === "23505" || /unique/i.test(err?.message ?? "");
};

// ---------------------------------------------------------------- projects

export async function saveProject(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = num(form, "id");
  const data = {
    code: str(form, "code").toUpperCase(),
    name: str(form, "name"),
    builder: str(form, "builder"),
    reraNo: str(form, "reraNo"),
    city: str(form, "city"),
    address: str(form, "address"),
    status: (["active", "on_hold", "completed"].includes(str(form, "status")) ? str(form, "status") : "active") as "active" | "on_hold" | "completed",
  };
  if (!data.code || !data.name) back("/admin/projects", { err: "Project code and name are required." });
  const db = await getDb();
  try {
    if (id > 0) {
      await db.update(projects).set(data).where(eq(projects.id, id));
      await audit(me.id, "project.update", "project", id, data);
    } else {
      const [p] = await db.insert(projects).values(data).returning();
      await audit(me.id, "project.create", "project", p.id, data);
    }
  } catch (e) {
    if (isUniqueViolation(e)) back("/admin/projects", { err: `Project code ${data.code} already exists.` });
    throw e;
  }
  revalidatePath("/admin", "layout");
  back("/admin/projects", { ok: `Project ${data.name} saved.` });
}

// ---------------------------------------------------------------- sites

export async function saveSite(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = num(form, "id");
  const lat = num(form, "lat");
  const lng = num(form, "lng");
  const radiusM = Math.round(num(form, "radiusM"));
  const areas = str(form, "areas")
    .split(/[\n,]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 40);
  const data = {
    projectId: num(form, "projectId"),
    name: str(form, "name"),
    lat,
    lng,
    radiusM,
    shiftStart: str(form, "shiftStart") || "09:00",
    shiftEnd: str(form, "shiftEnd") || "18:00",
    areas,
    active: bool(form, "active"),
  };
  const path = id > 0 ? `/admin/sites/${id}` : "/admin/sites/new";
  if (!data.name || !(data.projectId > 0)) back(path, { err: "Project and site name are required." });
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || (lat === 0 && lng === 0)) back(path, { err: "Set the site location on the map." });
  if (!(radiusM >= 30 && radiusM <= 5000)) back(path, { err: "Radius must be between 30 m and 5000 m." });
  if (!/^\d{2}:\d{2}$/.test(data.shiftStart) || !/^\d{2}:\d{2}$/.test(data.shiftEnd)) back(path, { err: "Shift time must be HH:MM." });

  const db = await getDb();
  const assigned = ids(form, "userIds");
  const siteId = await db.transaction(async (tx) => {
    let sid = id;
    if (id > 0) await tx.update(sites).set(data).where(eq(sites.id, id));
    else [{ id: sid }] = await tx.insert(sites).values(data).returning({ id: sites.id });
    await tx.delete(userSites).where(eq(userSites.siteId, sid));
    if (assigned.length) await tx.insert(userSites).values(assigned.map((userId) => ({ userId, siteId: sid })));
    return sid;
  });
  await audit(me.id, id > 0 ? "site.update" : "site.create", "site", siteId, { ...data, assigned });
  revalidatePath("/admin", "layout");
  back(`/admin/sites/${siteId}`, { ok: "Site saved." });
}

// ---------------------------------------------------------------- users

export async function saveUser(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = num(form, "id");
  const role = str(form, "role") as Role;
  const data = {
    empCode: str(form, "empCode").toUpperCase(),
    name: str(form, "name"),
    mobile: str(form, "mobile") || null,
    role: ROLES.includes(role) ? role : ("staff" as Role),
    designation: str(form, "designation"),
    wageType: (str(form, "wageType") === "daily" ? "daily" : "monthly") as WageType,
    wageAmount: Math.max(0, num(form, "wageAmount") || 0),
    active: bool(form, "active"),
  };
  const path = id > 0 ? `/admin/users/${id}` : "/admin/users";
  if (!/^[A-Z0-9_-]{2,20}$/.test(data.empCode)) back(path, { err: "Employee code: 2–20 letters/numbers." });
  if (!data.name) back(path, { err: "Name is required." });
  if (data.mobile && !/^\d{10}$/.test(data.mobile)) back(path, { err: "Mobile must be 10 digits." });
  if (id === me.id && (data.role !== "admin" || !data.active)) back(path, { err: "You cannot remove your own admin access." });

  const db = await getDb();
  const password = str(form, "password");
  if (password && password.length < 6) back(path, { err: "Password must be at least 6 characters." });
  if (!(id > 0) && !password) back(path, { err: "Set a starting password (min 6 characters)." });
  const passwordHash = password ? await hashPassword(password) : null;
  const assigned = ids(form, "siteIds");
  let userId = id;
  try {
    if (id > 0) {
      const patch: Partial<typeof users.$inferInsert> = { ...data };
      if (passwordHash) {
        patch.passwordHash = passwordHash;
        patch.mustChangePassword = true;
      }
      const [before] = await db.select().from(users).where(eq(users.id, id));
      // Role change, deactivation or password reset signs the user out everywhere.
      if (password || !data.active || before?.role !== data.role) {
        await db.update(users).set({ ...patch, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
      } else {
        await db.update(users).set(patch).where(eq(users.id, id));
      }
    } else {
      [{ id: userId }] = await db
        .insert(users)
        .values({ ...data, passwordHash: passwordHash!, mustChangePassword: true })
        .returning({ id: users.id });
    }
  } catch (e) {
    if (isUniqueViolation(e)) back(path, { err: "Employee code or mobile already used by another user." });
    throw e;
  }
  if (form.has("sitesSubmitted")) {
    await db.delete(userSites).where(eq(userSites.userId, userId));
    if (assigned.length) await db.insert(userSites).values(assigned.map((siteId) => ({ userId, siteId })));
  }
  await audit(me.id, id > 0 ? "user.update" : "user.create", "user", userId, { ...data, passwordReset: !!password, sites: assigned });
  revalidatePath("/admin", "layout");
  back(`/admin/users/${userId}`, { ok: id > 0 ? "User updated." : "User created. Share the ID and password with them." });
}

export async function forceLogout(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = num(form, "id");
  const db = await getDb();
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
  await audit(me.id, "user.force_logout", "user", id);
  back(`/admin/users/${id}`, { ok: "User signed out from all devices." });
}

// ---------------------------------------------------------------- contractors & labour

export async function saveContractor(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  const id = num(form, "id");
  const data = {
    name: str(form, "name"),
    firmName: str(form, "firmName"),
    mobile: str(form, "mobile"),
    gstin: str(form, "gstin").toUpperCase(),
    active: bool(form, "active"),
  };
  const path = id > 0 ? `/admin/contractors/${id}` : "/admin/contractors";
  if (!data.name) back(path, { err: "Contractor name is required." });
  const db = await getDb();
  let cid = id;
  if (id > 0) await db.update(contractors).set(data).where(eq(contractors.id, id));
  else [{ id: cid }] = await db.insert(contractors).values(data).returning({ id: contractors.id });
  await audit(me.id, id > 0 ? "contractor.update" : "contractor.create", "contractor", cid, data);
  back(`/admin/contractors/${cid}`, { ok: "Contractor saved." });
}

export async function saveLabourer(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  const id = num(form, "id");
  const contractorId = num(form, "contractorId");
  const data = {
    contractorId,
    name: str(form, "name"),
    trade: str(form, "trade") || "Helper",
    dailyWage: Math.max(0, num(form, "dailyWage") || 0),
    mobile: str(form, "mobile"),
    idLast4: str(form, "idLast4").slice(-4),
    active: form.has("active") ? bool(form, "active") : true,
  };
  const path = `/admin/contractors/${contractorId}`;
  if (!data.name) back(path, { err: "Labour name is required." });
  const db = await getDb();
  if (id > 0) await db.update(labourers).set(data).where(and(eq(labourers.id, id), eq(labourers.contractorId, contractorId)));
  else await db.insert(labourers).values(data);
  await audit(me.id, id > 0 ? "labour.update" : "labour.create", "labourer", id > 0 ? id : data.name, data);
  back(path, { ok: `${data.name} saved.` });
}

// Paste rows "Name, Trade, Daily wage, Mobile" (one per line) to add many labourers at once.
export async function importLabour(form: FormData) {
  const me = await requireUser(MANAGER_ROLES);
  const contractorId = num(form, "contractorId");
  const path = `/admin/contractors/${contractorId}`;
  const rows = str(form, "rows")
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((c) => c.trim()))
    .filter((c) => c[0] && !/^name$/i.test(c[0]))
    .slice(0, 500)
    .map(([name, trade, wage, mobile]) => ({
      contractorId,
      name,
      trade: trade || "Helper",
      dailyWage: Math.max(0, Number(wage) || 0),
      mobile: (mobile ?? "").replace(/\D/g, "").slice(-10),
    }));
  if (!rows.length) back(path, { err: "Nothing to import." });
  const db = await getDb();
  await db.insert(labourers).values(rows);
  await audit(me.id, "labour.import", "contractor", contractorId, { count: rows.length });
  back(path, { ok: `${rows.length} labourers imported.` });
}

export async function toggleLabourer(form: FormData) {
  await requireUser(MANAGER_ROLES);
  const id = num(form, "id");
  const contractorId = num(form, "contractorId");
  const db = await getDb();
  await db
    .update(labourers)
    .set({ active: sql`not ${labourers.active}` })
    .where(and(eq(labourers.id, id), eq(labourers.contractorId, contractorId)));
  back(returnPath(form, `/admin/contractors/${contractorId}`), { ok: "Labour status changed." });
}
