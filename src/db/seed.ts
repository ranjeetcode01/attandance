import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { addDays, istDate, istMoment, todayIST, weekday } from "@/lib/time";
import * as s from "./schema";

type DB = PgliteDatabase<typeof s>;

export async function seedIfEmpty(db: DB, opts: { demo: boolean }) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.users);
  if (count > 0) return;

  await db.insert(s.settings).values({ id: 1, data: DEFAULT_SETTINGS }).onConflictDoNothing();

  const adminPassword = process.env.ADMIN_PASSWORD || "admin@123";
  await db.insert(s.users).values({
    empCode: "ADMIN",
    name: "Administrator",
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: "admin",
    designation: "Administrator",
    mustChangePassword: !process.env.ADMIN_PASSWORD,
  });
  console.log(`[seed] Admin user created → login ID: ADMIN  password: ${process.env.ADMIN_PASSWORD ? "(from ADMIN_PASSWORD)" : adminPassword}`);

  for (const [date, name] of [
    ["2026-01-26", "Republic Day"],
    ["2026-05-01", "Maharashtra Day"],
    ["2026-08-15", "Independence Day"],
    ["2026-10-02", "Gandhi Jayanti"],
    ["2026-12-25", "Christmas"],
  ]) {
    await db.insert(s.holidays).values({ date, name }).onConflictDoNothing();
  }

  if (opts.demo) {
    await seedDemo(db);
    console.log("[seed] Demo data added. Demo users: PM01 / SUP01 / EMP01 … password: pass@123");
  }
}

// Small deterministic PRNG so demo data looks the same on every fresh install.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedDemo(db: DB) {
  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const pass = await bcrypt.hash("pass@123", 10);

  const people = await db
    .insert(s.users)
    .values([
      { empCode: "PM01", name: "Rakesh Mehta", mobile: "9800000001", role: "pm" as const, designation: "Project Manager", wageAmount: 85000 },
      { empCode: "SUP01", name: "Imran Shaikh", mobile: "9800000002", role: "supervisor" as const, designation: "Site Supervisor", wageAmount: 32000 },
      { empCode: "SUP02", name: "Sandeep Patil", mobile: "9800000003", role: "supervisor" as const, designation: "Site Supervisor", wageAmount: 30000 },
      { empCode: "EMP01", name: "Amit Verma", mobile: "9800000004", role: "staff" as const, designation: "Site Engineer", wageAmount: 45000 },
      { empCode: "EMP02", name: "Pooja Nair", mobile: "9800000005", role: "staff" as const, designation: "Safety Officer", wageAmount: 38000 },
      { empCode: "EMP03", name: "Vikas Yadav", mobile: "9800000006", role: "staff" as const, designation: "Fire Technician", wageAmount: 24000 },
      { empCode: "EMP04", name: "Rohit Jadhav", mobile: "9800000007", role: "staff" as const, designation: "Fire Technician", wageAmount: 23000 },
      { empCode: "EMP05", name: "Salim Khan", mobile: "9800000008", role: "staff" as const, designation: "Electrician", wageType: "daily" as const, wageAmount: 950 },
      { empCode: "EMP06", name: "Deepak Gupta", mobile: "9800000009", role: "staff" as const, designation: "Storekeeper", wageAmount: 20000 },
    ].map((u) => ({ ...u, passwordHash: pass })))
    .returning({ id: s.users.id, empCode: s.users.empCode, role: s.users.role });
  const byCode = Object.fromEntries(people.map((p) => [p.empCode, p.id]));

  const [skyline, green] = await db
    .insert(s.projects)
    .values([
      { code: "SKY-THN", name: "Skyline Residency", builder: "Skyline Developers LLP", reraNo: "P51700012345", city: "Thane", address: "Ghodbunder Road, Thane West" },
      { code: "GVT-KHR", name: "Green Valley Towers", builder: "Green Valley Realty", reraNo: "P52000054321", city: "Navi Mumbai", address: "Sector 35, Kharghar" },
    ])
    .returning({ id: s.projects.id });

  const floors = ["Basement", "Podium", "Floor 1–10", "Floor 11–20", "Floor 21+", "Terrace", "Pump Room"];
  const siteRows = await db
    .insert(s.sites)
    .values([
      { projectId: skyline.id, name: "Tower A", lat: 19.2183, lng: 72.9781, radiusM: 150, areas: floors },
      { projectId: skyline.id, name: "Tower B", lat: 19.2194, lng: 72.9799, radiusM: 150, areas: floors },
      { projectId: green.id, name: "Wing C", lat: 19.033, lng: 73.0697, radiusM: 180, areas: floors, shiftStart: "08:30", shiftEnd: "17:30" },
      { projectId: green.id, name: "Site Office", lat: 19.0322, lng: 73.0685, radiusM: 100, areas: ["Office", "Store"], shiftStart: "09:30", shiftEnd: "18:30" },
    ])
    .returning();
  const [towerA, towerB, wingC, office] = siteRows;

  const assign: Record<string, number[]> = {
    PM01: siteRows.map((x) => x.id),
    SUP01: [towerA.id, towerB.id],
    SUP02: [wingC.id, office.id],
    EMP01: [towerA.id, towerB.id],
    EMP02: siteRows.map((x) => x.id),
    EMP03: [towerA.id],
    EMP04: [wingC.id],
    EMP05: [towerB.id, wingC.id],
    EMP06: [office.id],
  };
  await db.insert(s.userSites).values(
    Object.entries(assign).flatMap(([code, ids]) => ids.map((siteId) => ({ userId: byCode[code], siteId }))),
  );

  const [c1, c2] = await db
    .insert(s.contractors)
    .values([
      { name: "Ramesh Yadav", firmName: "Shree Ganesh Fire Services", mobile: "9811100001", gstin: "27ABCDE1234F1Z5" },
      { name: "Suresh Kumar", firmName: "Maa Durga Labour Supply", mobile: "9811100002" },
    ])
    .returning({ id: s.contractors.id });

  const firstNames = ["Raju", "Mukesh", "Sunil", "Ajay", "Babu", "Dinesh", "Kishan", "Manoj", "Pappu", "Ravi", "Shankar", "Gopal", "Harish", "Lalit", "Naresh", "Om"];
  const lastNames = ["Yadav", "Paswan", "Mandal", "Singh", "Ram", "Kumar", "Sahu", "Majhi"];
  const wageFor: Record<string, number> = { "Fire Fitter": 850, "Pipe Fitter": 800, Welder: 900, Electrician: 850, Helper: 600, Mason: 800, Carpenter: 800, "Bar Bender": 750, Painter: 700, Plumber: 800 };
  const labourRows = await db
    .insert(s.labourers)
    .values(
      firstNames.map((fn, i) => {
        const trade = i < 8 ? pick(["Fire Fitter", "Pipe Fitter", "Welder", "Helper", "Helper"]) : pick(["Mason", "Carpenter", "Bar Bender", "Helper", "Painter"]);
        return {
          contractorId: i < 8 ? c1.id : c2.id,
          name: `${fn} ${pick(lastNames)}`,
          trade,
          dailyWage: wageFor[trade] ?? 650,
          mobile: rand() > 0.5 ? `97${String(Math.floor(rand() * 1e8)).padStart(8, "0")}` : "",
          idLast4: String(1000 + Math.floor(rand() * 8999)),
        };
      }),
    )
    .returning();

  // ---- 21 days of history + today ----
  const today = todayIST();
  const punchRows: (typeof s.punches.$inferInsert)[] = [];
  const staffCodes = ["SUP01", "SUP02", "EMP01", "EMP02", "EMP03", "EMP04", "EMP05", "EMP06"];
  const siteById = new Map(siteRows.map((x) => [x.id, x]));
  const jitter = (v: number, m: number) => v + ((rand() - 0.5) * 2 * m) / 111_000;

  for (let back = 21; back >= 0; back--) {
    const date = addDays(today, -back);
    if (weekday(date) === 0) continue;
    for (const code of staffCodes) {
      if (rand() < 0.08) continue; // absent
      const userId = byCode[code];
      const site = siteById.get(pick(assign[code]))!;
      const inMin = 8 * 60 + 40 + Math.floor(rand() * 60);
      const inAt = istMoment(date, `${String(Math.floor(inMin / 60)).padStart(2, "0")}:${String(inMin % 60).padStart(2, "0")}`);
      const outAt = inAt + (7.5 + rand() * 3) * 3600_000;
      const offline = rand() < 0.15;
      const outside = rand() < 0.03;
      const base = {
        userId,
        siteId: site.id,
        workDate: istDate(inAt),
        workArea: pick(site.areas),
        deviceId: `demo-${code}`,
        accuracy: 8 + Math.floor(rand() * 30),
      };
      punchRows.push({
        ...base,
        id: randomUUID(),
        type: "IN",
        deviceTime: new Date(inAt),
        punchTime: new Date(inAt),
        receivedAt: new Date(inAt + (offline ? 3 * 3600_000 : 2000)),
        lat: jitter(site.lat, outside ? 900 : 60),
        lng: jitter(site.lng, outside ? 900 : 60),
        distanceM: outside ? 850 : Math.floor(rand() * 60),
        insideFence: !outside,
        offline,
        flags: [...(offline ? ["OFFLINE"] : []), ...(outside ? ["OUTSIDE_FENCE"] : [])],
        reviewStatus: outside ? (back > 3 ? "approved" : "pending") : "ok",
      });
      const isToday = back === 0;
      const missedOut = !isToday && rand() < 0.04;
      if ((!isToday || outAt < Date.now()) && !missedOut && !(isToday && rand() < 0.6)) {
        punchRows.push({
          ...base,
          id: randomUUID(),
          type: "OUT",
          deviceTime: new Date(outAt),
          punchTime: new Date(outAt),
          receivedAt: new Date(outAt + 2000),
          lat: jitter(site.lat, 50),
          lng: jitter(site.lng, 50),
          distanceM: Math.floor(rand() * 50),
          insideFence: true,
          flags: [],
          reviewStatus: "ok",
        });
      }
    }
  }
  // drop today's punches that would be in the future
  const now = Date.now();
  const rows = punchRows.filter((p) => (p.punchTime as Date).getTime() <= now);
  for (let i = 0; i < rows.length; i += 200) await db.insert(s.punches).values(rows.slice(i, i + 200));

  // Labour sheets: every working day, each contractor at one site per project.
  const plan = [
    { contractorId: c1.id, siteId: towerA.id, markedBy: byCode.SUP01, labour: labourRows.filter((l) => l.contractorId === c1.id) },
    { contractorId: c2.id, siteId: wingC.id, markedBy: byCode.SUP02, labour: labourRows.filter((l) => l.contractorId === c2.id) },
  ];
  for (let back = 21; back >= 0; back--) {
    const date = addDays(today, -back);
    if (weekday(date) === 0) continue;
    const at = istMoment(date, "10:15");
    if (at > now) continue;
    for (const p of plan) {
      const site = siteById.get(p.siteId)!;
      const id = randomUUID();
      await db.insert(s.labourSheets).values({
        id,
        workDate: date,
        siteId: p.siteId,
        contractorId: p.contractorId,
        markedBy: p.markedBy,
        deviceTime: new Date(at),
        punchTime: new Date(at),
        receivedAt: new Date(at + 1000),
        lat: jitter(site.lat, 40),
        lng: jitter(site.lng, 40),
        accuracy: 15,
        distanceM: 30,
        insideFence: true,
        ppeChecked: rand() > 0.1,
        toolboxTalk: rand() > 0.3,
      });
      await db.insert(s.labourEntries).values([
        ...p.labour.map((l) => {
          const r = rand();
          const status: s.LabourStatus = r < 0.1 ? "A" : r < 0.18 ? "H" : "P";
          return {
            sheetId: id,
            labourerId: l.id,
            trade: l.trade,
            status,
            otHours: status === "P" && rand() < 0.2 ? 2 : 0,
            rate: l.dailyWage,
          };
        }),
        { sheetId: id, trade: "Helper", count: 2 + Math.floor(rand() * 4), status: "P" as const, rate: 550 },
      ]);
    }
  }

  await db.insert(s.requests).values([
    {
      id: randomUUID(),
      userId: byCode.EMP03,
      kind: "regularization",
      fromDate: addDays(today, -2),
      toDate: addDays(today, -2),
      siteId: towerA.id,
      inTime: "09:05",
      outTime: "18:10",
      reason: "Phone battery dead at site, could not punch.",
    },
    {
      id: randomUUID(),
      userId: byCode.EMP04,
      kind: "leave",
      fromDate: addDays(today, 3),
      toDate: addDays(today, 4),
      leaveType: "Casual",
      reason: "Family function in village.",
    },
  ]);
}
