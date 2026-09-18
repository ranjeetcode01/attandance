import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contractors,
  holidays,
  labourEntries,
  labourers,
  labourSheets,
  projects,
  punches,
  requests,
  sites,
  users,
  userSites,
  type AppSettings,
  type Role,
} from "@/db/schema";
import {
  dailyRate,
  isCounted,
  otCost,
  paidDays,
  summarizeDay,
  workedDays,
  type DayContext,
  type DaySummary,
} from "./attendance";
import { getSettings } from "./settings";
import { photoUrl } from "./storage";
import { addDays, dateRange, todayIST } from "./time";

export type SiteInfo = typeof sites.$inferSelect & { projectName: string; projectCode: string };

export async function loadSites(): Promise<SiteInfo[]> {
  const db = await getDb();
  const rows = await db
    .select({ site: sites, projectName: projects.name, projectCode: projects.code })
    .from(sites)
    .innerJoin(projects, eq(sites.projectId, projects.id))
    .orderBy(asc(projects.name), asc(sites.name));
  return rows.map((r) => ({ ...r.site, projectName: r.projectName, projectCode: r.projectCode }));
}

async function baseContext(from: string, to: string) {
  const db = await getDb();
  const [settings, siteList, hol, leaves] = await Promise.all([
    getSettings(),
    loadSites(),
    db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))),
    db
      .select()
      .from(requests)
      .where(and(eq(requests.kind, "leave"), eq(requests.status, "approved"), lte(requests.fromDate, to), gte(requests.toDate, from))),
  ]);
  const siteMap = new Map(siteList.map((s) => [s.id, s]));
  const holidayMap = new Map(hol.map((h) => [h.date, h.name]));
  const leaveMap = new Map<number, Set<string>>();
  for (const l of leaves) {
    const set = leaveMap.get(l.userId) ?? new Set<string>();
    for (const d of dateRange(l.fromDate, l.toDate)) set.add(d);
    leaveMap.set(l.userId, set);
  }
  const today = todayIST();
  const now = Date.now();
  const dayCtx = (userId: number, date: string): DayContext => ({
    settings,
    today,
    now,
    holiday: holidayMap.has(date),
    leave: leaveMap.get(userId)?.has(date) ?? false,
    shiftStartFor: (siteId) => (siteId != null ? siteMap.get(siteId)?.shiftStart : undefined) ?? "09:00",
  });
  return { settings, siteList, siteMap, holidayMap, dayCtx, today, now };
}

type PunchRow = typeof punches.$inferSelect;

async function loadPunchRows(from: string, to: string, userIds?: number[]) {
  const db = await getDb();
  const conds = [gte(punches.workDate, from), lte(punches.workDate, to)];
  if (userIds) {
    if (!userIds.length) return [] as PunchRow[];
    conds.push(inArray(punches.userId, userIds));
  }
  return db.select().from(punches).where(and(...conds)).orderBy(asc(punches.punchTime));
}

function groupPunches(rows: PunchRow[]) {
  const map = new Map<number, Map<string, PunchRow[]>>();
  for (const r of rows) {
    const byDate = map.get(r.userId) ?? new Map<string, PunchRow[]>();
    const list = byDate.get(r.workDate) ?? [];
    list.push(r);
    byDate.set(r.workDate, list);
    map.set(r.userId, byDate);
  }
  return map;
}

export type UserLite = { id: number; empCode: string; name: string; role: Role; designation: string; wageType: "monthly" | "daily"; wageAmount: number };

async function listPeople(opts: { projectId?: number; siteId?: number; includeIds?: number[] } = {}) {
  const db = await getDb();
  const cols = {
    id: users.id,
    empCode: users.empCode,
    name: users.name,
    role: users.role,
    designation: users.designation,
    wageType: users.wageType,
    wageAmount: users.wageAmount,
  };
  let people: UserLite[] = await db
    .select(cols)
    .from(users)
    .where(
      opts.includeIds?.length
        ? or(and(eq(users.active, true), ne(users.role, "admin")), inArray(users.id, opts.includeIds))
        : and(eq(users.active, true), ne(users.role, "admin")),
    )
    .orderBy(asc(users.name));
  if (opts.projectId || opts.siteId) {
    const links = await db
      .select({ userId: userSites.userId })
      .from(userSites)
      .innerJoin(sites, eq(userSites.siteId, sites.id))
      .where(opts.siteId ? eq(sites.id, opts.siteId) : eq(sites.projectId, opts.projectId!));
    const allowed = new Set(links.map((l) => l.userId));
    people = people.filter((p) => allowed.has(p.id));
  }
  return people;
}

// ---------------------------------------------------------------- muster

export type MusterTotals = { P: number; HD: number; MO: number; SH: number; A: number; L: number; H: number; WO: number; late: number; otMin: number; workMin: number; worked: number; paid: number };

export async function musterReport(from: string, to: string, filter: { projectId?: number; siteId?: number } = {}) {
  const ctx = await baseContext(from, to);
  const rows = await loadPunchRows(from, to);
  const people = await listPeople({ ...filter, includeIds: filter.projectId || filter.siteId ? undefined : [...new Set(rows.map((r) => r.userId))] });
  const grouped = groupPunches(rows);
  const days = dateRange(from, to);

  const result = people.map((u) => {
    const byDate = grouped.get(u.id);
    const totals: MusterTotals = { P: 0, HD: 0, MO: 0, SH: 0, A: 0, L: 0, H: 0, WO: 0, late: 0, otMin: 0, workMin: 0, worked: 0, paid: 0 };
    const cells = days.map((d) => {
      const s = summarizeDay(d, byDate?.get(d) ?? [], ctx.dayCtx(u.id, d));
      // Future days are shown (planned week off / leave) but never counted.
      if (d > ctx.today) return s;
      if (s.status === "ON") totals.P++;
      else if (s.status) totals[s.status]++;
      if (s.lateMin) totals.late++;
      totals.otMin += s.otMin;
      totals.workMin += s.workMin;
      totals.worked += workedDays(s.status);
      totals.paid += paidDays(s.status, u.wageType);
      return s;
    });
    return { user: u, cells, totals };
  });
  return { days, rows: result, settings: ctx.settings, holidays: ctx.holidayMap };
}

// Last N days for one person (worker app history tab).
export async function userHistory(userId: number, days: number) {
  const to = todayIST();
  const from = addDays(to, -(days - 1));
  const ctx = await baseContext(from, to);
  const rows = await loadPunchRows(from, to, [userId]);
  const byDate = groupPunches(rows).get(userId);
  return dateRange(from, to)
    .reverse()
    .map((d) => {
      const list = byDate?.get(d) ?? [];
      const s = summarizeDay(d, list, ctx.dayCtx(userId, d));
      return {
        date: d,
        status: s.status,
        firstIn: s.firstIn,
        lastOut: s.lastOut,
        workMin: s.workMin,
        lateMin: s.lateMin,
        otMin: s.otMin,
        pending: s.pendingReview,
        sites: [...new Set(list.map((p) => (p.siteId ? ctx.siteMap.get(p.siteId)?.name : null)).filter(Boolean))] as string[],
      };
    });
}

// ---------------------------------------------------------------- daily register

export async function dailyRegister(date: string, filter: { projectId?: number; siteId?: number } = {}) {
  const ctx = await baseContext(date, date);
  const db = await getDb();
  const rows = await loadPunchRows(date, date);
  const people = await listPeople({ ...filter, includeIds: filter.projectId || filter.siteId ? undefined : [...new Set(rows.map((r) => r.userId))] });
  const grouped = groupPunches(rows);
  const reviewerIds = [...new Set(rows.map((r) => r.reviewedBy).filter((x): x is number => x != null))];
  const reviewers = reviewerIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds)) : [];
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name]));

  return {
    settings: ctx.settings,
    holiday: ctx.holidayMap.get(date) ?? null,
    rows: people.map((u) => {
      const list = grouped.get(u.id)?.get(date) ?? [];
      return {
        user: u,
        summary: summarizeDay(date, list, ctx.dayCtx(u.id, date)),
        punches: list.map((p) => ({
          ...p,
          siteName: p.siteId ? ctx.siteMap.get(p.siteId)?.name ?? "?" : "—",
          projectName: p.siteId ? ctx.siteMap.get(p.siteId)?.projectName ?? "" : "",
          selfieUrl: photoUrl(p.selfiePath),
          reviewerName: p.reviewedBy ? reviewerName.get(p.reviewedBy) ?? "" : "",
        })),
      };
    }),
  };
}

// ---------------------------------------------------------------- review queue

export async function reviewQueue(limit = 200) {
  const db = await getDb();
  const siteList = await loadSites();
  const siteMap = new Map(siteList.map((s) => [s.id, s]));
  const pendingPunches = await db
    .select({ punch: punches, userName: users.name, empCode: users.empCode })
    .from(punches)
    .innerJoin(users, eq(punches.userId, users.id))
    .where(eq(punches.reviewStatus, "pending"))
    .orderBy(desc(punches.punchTime))
    .limit(limit);
  const pendingSheets = await db
    .select({ sheet: labourSheets, markedByName: users.name, contractorName: contractors.firmName })
    .from(labourSheets)
    .innerJoin(users, eq(labourSheets.markedBy, users.id))
    .innerJoin(contractors, eq(labourSheets.contractorId, contractors.id))
    .where(eq(labourSheets.reviewStatus, "pending"))
    .orderBy(desc(labourSheets.punchTime))
    .limit(limit);
  return {
    punches: pendingPunches.map((r) => ({
      ...r.punch,
      userName: r.userName,
      empCode: r.empCode,
      site: r.punch.siteId ? siteMap.get(r.punch.siteId) ?? null : null,
      selfieUrl: photoUrl(r.punch.selfiePath),
    })),
    sheets: pendingSheets.map((r) => ({
      ...r.sheet,
      markedByName: r.markedByName,
      contractorName: r.contractorName,
      site: siteMap.get(r.sheet.siteId) ?? null,
      photoUrl: photoUrl(r.sheet.photoPath),
    })),
  };
}

// ---------------------------------------------------------------- labour

export type LabourSheetView = Awaited<ReturnType<typeof labourSheetsReport>>["sheets"][number];

export async function labourSheetsReport(from: string, to: string, filter: { siteId?: number; contractorId?: number; projectId?: number } = {}) {
  const db = await getDb();
  const settings = await getSettings();
  const siteList = await loadSites();
  const siteMap = new Map(siteList.map((s) => [s.id, s]));
  const conds = [gte(labourSheets.workDate, from), lte(labourSheets.workDate, to)];
  if (filter.siteId) conds.push(eq(labourSheets.siteId, filter.siteId));
  if (filter.contractorId) conds.push(eq(labourSheets.contractorId, filter.contractorId));
  if (filter.projectId) {
    const ids = siteList.filter((s) => s.projectId === filter.projectId).map((s) => s.id);
    conds.push(inArray(labourSheets.siteId, ids.length ? ids : [-1]));
  }
  const sheetRows = await db
    .select({ sheet: labourSheets, markedByName: users.name, contractor: contractors })
    .from(labourSheets)
    .innerJoin(users, eq(labourSheets.markedBy, users.id))
    .innerJoin(contractors, eq(labourSheets.contractorId, contractors.id))
    .where(and(...conds))
    .orderBy(desc(labourSheets.workDate));
  const ids = sheetRows.map((r) => r.sheet.id);
  const entries = ids.length
    ? await db
        .select({ entry: labourEntries, labourName: labourers.name })
        .from(labourEntries)
        .leftJoin(labourers, eq(labourEntries.labourerId, labourers.id))
        .where(inArray(labourEntries.sheetId, ids))
    : [];
  const bySheet = new Map<string, (typeof entries)[number][]>();
  for (const e of entries) {
    const list = bySheet.get(e.entry.sheetId) ?? [];
    list.push(e);
    bySheet.set(e.entry.sheetId, list);
  }

  const sheets = sheetRows.map((r) => {
    const list = bySheet.get(r.sheet.id) ?? [];
    let manDays = 0;
    let cost = 0;
    let present = 0;
    let absent = 0;
    const trades: Record<string, number> = {};
    for (const { entry: e } of list) {
      const d = labourDays(e.status) * e.count;
      manDays += d;
      cost += d * e.rate + otCost(e.otHours * 60, e.rate, settings) * e.count;
      if (e.status === "A") absent += e.count;
      else {
        present += e.count;
        trades[e.trade] = (trades[e.trade] ?? 0) + e.count;
      }
    }
    return {
      ...r.sheet,
      markedByName: r.markedByName,
      contractorName: r.contractor.firmName || r.contractor.name,
      site: siteMap.get(r.sheet.siteId) ?? null,
      photoUrl: photoUrl(r.sheet.photoPath),
      entries: list.map((x) => ({ ...x.entry, labourName: x.labourName })),
      manDays,
      cost,
      present,
      absent,
      trades,
      counted: isCounted(r.sheet.reviewStatus),
    };
  });
  return { sheets, settings };
}

export function labourDays(status: string) {
  return status === "P" ? 1 : status === "H" ? 0.5 : 0;
}

// ---------------------------------------------------------------- project costing

export type CostLine = { staffDays: number; staffCost: number; labourDays: number; labourCost: number };
const emptyLine = (): CostLine => ({ staffDays: 0, staffCost: 0, labourDays: 0, labourCost: 0 });

export async function projectCostReport(from: string, to: string) {
  const ctx = await baseContext(from, to);
  const rows = await loadPunchRows(from, to);
  const people = await listPeople({ includeIds: [...new Set(rows.map((r) => r.userId))] });
  const grouped = groupPunches(rows);
  const bySite = new Map<number, CostLine>();
  const line = (siteId: number) => {
    let l = bySite.get(siteId);
    if (!l) bySite.set(siteId, (l = emptyLine()));
    return l;
  };
  const staffRows: { user: UserLite; days: number; cost: number; otMin: number }[] = [];

  for (const u of people) {
    const rate = dailyRate(u.wageType, u.wageAmount, ctx.settings);
    let uDays = 0;
    let uCost = 0;
    let uOt = 0;
    for (const [date, list] of grouped.get(u.id) ?? []) {
      const s = summarizeDay(date, list, ctx.dayCtx(u.id, date));
      const days = workedDays(s.status);
      const cost = days * rate + otCost(s.otMin, rate, ctx.settings);
      const totalMin = Object.values(s.siteMinutes).reduce((a, b) => a + b, 0);
      if (!totalMin) continue;
      for (const [siteId, min] of Object.entries(s.siteMinutes)) {
        const share = min / totalMin;
        const l = line(Number(siteId));
        l.staffDays += days * share;
        l.staffCost += cost * share;
      }
      uDays += days;
      uCost += cost;
      uOt += s.otMin;
    }
    if (uDays || uCost) staffRows.push({ user: u, days: uDays, cost: uCost, otMin: uOt });
  }

  const { sheets } = await labourSheetsReport(from, to);
  const byContractor = new Map<string, { name: string; days: number; cost: number; sheets: number }>();
  let pendingSheets = 0;
  for (const sh of sheets) {
    if (!sh.counted) {
      pendingSheets++;
      continue;
    }
    const l = line(sh.siteId);
    l.labourDays += sh.manDays;
    l.labourCost += sh.cost;
    const c = byContractor.get(sh.contractorName) ?? { name: sh.contractorName, days: 0, cost: 0, sheets: 0 };
    c.days += sh.manDays;
    c.cost += sh.cost;
    c.sheets++;
    byContractor.set(sh.contractorName, c);
  }

  const byProject = new Map<number, { projectId: number; code: string; name: string; total: CostLine; sites: { site: SiteInfo; line: CostLine }[] }>();
  for (const [siteId, l] of bySite) {
    const site = ctx.siteMap.get(siteId);
    if (!site) continue;
    const p = byProject.get(site.projectId) ?? { projectId: site.projectId, code: site.projectCode, name: site.projectName, total: emptyLine(), sites: [] };
    p.sites.push({ site, line: l });
    p.total.staffDays += l.staffDays;
    p.total.staffCost += l.staffCost;
    p.total.labourDays += l.labourDays;
    p.total.labourCost += l.labourCost;
    byProject.set(site.projectId, p);
  }

  return {
    projects: [...byProject.values()].sort((a, b) => b.total.staffCost + b.total.labourCost - (a.total.staffCost + a.total.labourCost)),
    contractors: [...byContractor.values()].sort((a, b) => b.cost - a.cost),
    staff: staffRows.sort((a, b) => b.cost - a.cost),
    pendingSheets,
    settings: ctx.settings,
  };
}

// ---------------------------------------------------------------- dashboard

export async function dashboardData() {
  const today = todayIST();
  const weekStart = addDays(today, -6);
  const ctx = await baseContext(weekStart, today);
  const db = await getDb();
  const rows = await loadPunchRows(weekStart, today);
  const people = await listPeople();
  const grouped = groupPunches(rows);
  const userName = new Map(people.map((p) => [p.id, p.name]));

  const summaries = people.map((u) => ({ user: u, s: summarizeDay(today, grouped.get(u.id)?.get(today) ?? [], ctx.dayCtx(u.id, today)) }));
  const count = (pred: (s: DaySummary) => boolean) => summaries.filter((x) => pred(x.s)).length;

  const { sheets } = await labourSheetsReport(weekStart, today);
  const todaySheets = sheets.filter((s) => s.workDate === today);
  const labourByTrade: Record<string, number> = {};
  for (const sh of todaySheets) for (const [t, n] of Object.entries(sh.trades)) labourByTrade[t] = (labourByTrade[t] ?? 0) + n;

  // Latest punch per person today, for the map and the per-site "on site now" list.
  const latest = new Map<number, PunchRow>();
  for (const r of rows) if (r.workDate === today && isCounted(r.reviewStatus)) latest.set(r.userId, r);

  const siteCards = ctx.siteList
    .filter((s) => s.active)
    .map((site) => {
      const onSite = summaries.filter((x) => x.s.status === "ON" && latest.get(x.user.id)?.siteId === site.id).map((x) => x.user.name);
      const visited = new Set(rows.filter((r) => r.workDate === today && r.siteId === site.id).map((r) => r.userId)).size;
      const labour = todaySheets.filter((sh) => sh.siteId === site.id).reduce((a, sh) => a + sh.present, 0);
      return { site, onSite, visited, labour };
    });

  const trend = dateRange(weekStart, today).map((d) => {
    let present = 0;
    for (const u of people) {
      const list = grouped.get(u.id)?.get(d) ?? [];
      if (list.some((p) => isCounted(p.reviewStatus))) present++;
    }
    const labour = sheets.filter((s) => s.workDate === d && s.counted).reduce((a, s) => a + s.present, 0);
    return { date: d, present, labour };
  });

  const [pendingPunches, pendingSheets, pendingRequests] = await Promise.all([
    db.$count(punches, eq(punches.reviewStatus, "pending")),
    db.$count(labourSheets, eq(labourSheets.reviewStatus, "pending")),
    db.$count(requests, eq(requests.status, "pending")),
  ]);

  const recent = rows
    .filter((r) => r.workDate === today)
    .sort((a, b) => b.punchTime.getTime() - a.punchTime.getTime())
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      name: userName.get(r.userId) ?? "?",
      type: r.type,
      time: r.punchTime.getTime(),
      siteName: r.siteId ? ctx.siteMap.get(r.siteId)?.name ?? "" : "",
      flags: r.flags,
      reviewStatus: r.reviewStatus,
      offline: r.offline,
      selfieUrl: photoUrl(r.selfiePath),
    }));

  const mapPoints = [...latest.values()]
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({ lat: r.lat!, lng: r.lng!, label: `${userName.get(r.userId) ?? "?"} · ${r.type}`, inside: r.insideFence !== false, open: r.type === "IN" }));

  return {
    today,
    settings: ctx.settings as AppSettings,
    holiday: ctx.holidayMap.get(today) ?? null,
    kpi: {
      staff: people.length,
      present: count((s) => ["P", "HD", "MO", "SH", "ON"].includes(s.status)),
      onSite: count((s) => s.status === "ON"),
      late: count((s) => s.lateMin > 0),
      absent: count((s) => s.status === "A"),
      leave: count((s) => s.status === "L"),
      labour: todaySheets.reduce((a, s) => a + s.present, 0),
      pendingPunches,
      pendingSheets,
      pendingRequests,
    },
    lateList: summaries.filter((x) => x.s.lateMin > 0).map((x) => ({ name: x.user.name, lateMin: x.s.lateMin })),
    absentList: summaries.filter((x) => x.s.status === "A").map((x) => x.user.name),
    labourByTrade,
    siteCards,
    trend,
    recent,
    map: {
      sites: ctx.siteList.filter((s) => s.active).map((s) => ({ lat: s.lat, lng: s.lng, radiusM: s.radiusM, label: `${s.projectName} · ${s.name}` })),
      points: mapPoints,
    },
  };
}
