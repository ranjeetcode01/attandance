import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contractors, labourers, punches, requests, userSites } from "@/db/schema";
import { apiUser, FIELD_MANAGER_ROLES, MANAGER_ROLES, refreshSessionIfOld } from "@/lib/auth";
import { logoUrl } from "@/lib/brand";
import { labourSheetsReport, loadSites, userHistory } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { photoUrl } from "@/lib/storage";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

// Everything the worker app needs to run offline for the day.
export async function GET() {
  const user = await apiUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  await refreshSessionIfOld(user);

  const db = await getDb();
  const settings = await getSettings();
  const today = todayIST();
  const isManager = MANAGER_ROLES.includes(user.role);
  const isFieldManager = FIELD_MANAGER_ROLES.includes(user.role);

  const allSites = (await loadSites()).filter((s) => s.active);
  let mySites = allSites;
  if (!isManager) {
    const links = await db.select({ siteId: userSites.siteId }).from(userSites).where(eq(userSites.userId, user.id));
    const ids = new Set(links.map((l) => l.siteId));
    mySites = allSites.filter((s) => ids.has(s.id));
  }

  let crew: { id: number; name: string; firmName: string; labour: { id: number; name: string; trade: string; dailyWage: number }[] }[] = [];
  let labourToday: { siteId: number; contractorId: number; present: number; reviewStatus: string }[] = [];
  if (isFieldManager) {
    const cs = await db.select().from(contractors).where(eq(contractors.active, true)).orderBy(asc(contractors.firmName));
    const ls = await db.select().from(labourers).where(eq(labourers.active, true)).orderBy(asc(labourers.name));
    crew = cs.map((c) => ({
      id: c.id,
      name: c.name,
      firmName: c.firmName,
      labour: ls.filter((l) => l.contractorId === c.id).map((l) => ({ id: l.id, name: l.name, trade: l.trade, dailyWage: l.dailyWage })),
    }));
    const siteIds = new Set(mySites.map((s) => s.id));
    const { sheets } = await labourSheetsReport(today, today);
    labourToday = sheets
      .filter((s) => siteIds.has(s.siteId))
      .map((s) => ({ siteId: s.siteId, contractorId: s.contractorId, present: s.present, reviewStatus: s.reviewStatus }));
  }

  const todayPunches = await db
    .select()
    .from(punches)
    .where(and(eq(punches.userId, user.id), eq(punches.workDate, today)))
    .orderBy(asc(punches.punchTime));
  const myRequests = await db.select().from(requests).where(eq(requests.userId, user.id)).orderBy(desc(requests.createdAt)).limit(20);

  return Response.json(
    {
      serverTime: Date.now(),
      today,
      user: { id: user.id, name: user.name, empCode: user.empCode, role: user.role, designation: user.designation, mustChangePassword: user.mustChangePassword },
      settings: {
        companyName: settings.companyName,
        shortName: settings.shortName,
        brandColor: settings.brandColor,
        logoUrl: logoUrl(settings),
        logoCompactUrl: logoUrl(settings, "compact"),
        fenceMode: settings.fenceMode,
        accuracyToleranceM: settings.accuracyToleranceM,
        maxAccuracyM: settings.maxAccuracyM,
        requireSelfie: settings.requireSelfie,
        syncWindowHours: settings.syncWindowHours,
        trades: settings.trades,
      },
      sites: mySites.map((s) => ({
        id: s.id,
        name: s.name,
        projectName: s.projectName,
        lat: s.lat,
        lng: s.lng,
        radiusM: s.radiusM,
        areas: s.areas,
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
      })),
      crew,
      labourToday,
      todayPunches: todayPunches.map((p) => ({
        id: p.id,
        type: p.type,
        siteId: p.siteId,
        punchTime: p.punchTime.getTime(),
        reviewStatus: p.reviewStatus,
        flags: p.flags,
        workArea: p.workArea,
        selfieUrl: photoUrl(p.selfiePath),
      })),
      history: await userHistory(user.id, 31),
      requests: myRequests.map((r) => ({
        id: r.id,
        kind: r.kind,
        fromDate: r.fromDate,
        toDate: r.toDate,
        leaveType: r.leaveType,
        inTime: r.inTime,
        outTime: r.outTime,
        reason: r.reason,
        status: r.status,
        reviewNote: r.reviewNote,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
