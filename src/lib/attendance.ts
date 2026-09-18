import type { AppSettings, PunchType, ReviewStatus, WageType } from "@/db/schema";
import { istMoment, weekday } from "./time";

export type DayPunch = {
  type: PunchType;
  punchTime: Date;
  siteId: number | null;
  reviewStatus: ReviewStatus;
};

// P present · HD half day · MO missed OUT · SH short hours · ON on site now (today)
// A absent · L leave · H holiday · WO weekly off · "" future
export type DayStatus = "P" | "HD" | "MO" | "SH" | "ON" | "A" | "L" | "H" | "WO" | "";

export const STATUS_LABEL: Record<DayStatus, string> = {
  P: "Present",
  HD: "Half day",
  MO: "Missed OUT",
  SH: "Short hours",
  ON: "On site",
  A: "Absent",
  L: "Leave",
  H: "Holiday",
  WO: "Week off",
  "": "",
};

export type DaySummary = {
  date: string;
  status: DayStatus;
  firstIn: number | null;
  lastOut: number | null;
  workMin: number;
  lateMin: number;
  otMin: number;
  siteMinutes: Record<number, number>;
  firstSiteId: number | null;
  offDayWork: boolean;
  pendingReview: number;
};

export type DayContext = {
  settings: AppSettings;
  today: string;
  now: number;
  holiday: boolean;
  leave: boolean;
  shiftStartFor: (siteId: number | null) => string;
};

export const isCounted = (s: ReviewStatus) => s === "ok" || s === "approved";

export function summarizeDay(date: string, all: DayPunch[], ctx: DayContext): DaySummary {
  const { settings } = ctx;
  const valid = all.filter((p) => isCounted(p.reviewStatus)).sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
  const pendingReview = all.filter((p) => p.reviewStatus === "pending").length;
  const weeklyOff = settings.weeklyOffDay >= 0 && weekday(date) === settings.weeklyOffDay;
  const offDay = ctx.holiday || weeklyOff;

  const siteMinutes: Record<number, number> = {};
  const addSite = (siteId: number | null, min: number) => {
    if (siteId != null) siteMinutes[siteId] = (siteMinutes[siteId] ?? 0) + min;
  };

  let open: DayPunch | null = null;
  let workMin = 0;
  let completed = 0;
  let firstIn: number | null = null;
  let lastOut: number | null = null;
  let firstSiteId: number | null = null;

  for (const p of valid) {
    const t = p.punchTime.getTime();
    if (p.type === "IN") {
      if (firstIn == null) {
        firstIn = t;
        firstSiteId = p.siteId;
      }
      // IN at a new site without OUT at the old one: the old stint ends here.
      if (open) {
        const min = (t - open.punchTime.getTime()) / 60_000;
        workMin += min;
        addSite(open.siteId, min);
        completed++;
      }
      open = p;
    } else if (open) {
      const min = (t - open.punchTime.getTime()) / 60_000;
      workMin += min;
      addSite(open.siteId, min);
      completed++;
      lastOut = t;
      open = null;
    }
  }

  const fullMin = settings.fullDayHours * 60;
  const halfMin = settings.halfDayHours * 60;
  let status: DayStatus;

  if (!valid.length) {
    if (date > ctx.today) status = ctx.leave ? "L" : ctx.holiday ? "H" : weeklyOff ? "WO" : "";
    else status = ctx.holiday ? "H" : weeklyOff ? "WO" : ctx.leave ? "L" : "A";
  } else if (open && date === ctx.today) {
    const running = Math.max(0, (ctx.now - open.punchTime.getTime()) / 60_000);
    workMin += running;
    addSite(open.siteId, running);
    status = "ON";
  } else {
    if (open) {
      // Missed OUT: credit half a day to the site where the open stint started.
      if (completed === 0 || workMin < halfMin) {
        addSite(open.siteId, Math.max(0, halfMin - workMin));
        workMin = Math.max(workMin, halfMin);
        status = "MO";
      } else {
        status = workMin >= fullMin ? "P" : "HD";
      }
    } else {
      status = workMin >= fullMin ? "P" : workMin >= halfMin ? "HD" : "SH";
    }
  }

  let lateMin = 0;
  if (firstIn != null && !offDay) {
    const shiftStart = istMoment(date, ctx.shiftStartFor(firstSiteId));
    const diff = (firstIn - shiftStart) / 60_000;
    if (diff > settings.graceMinutes) lateMin = Math.round(diff);
  }

  let otMin = 0;
  if (settings.otEnabled && status !== "MO" && status !== "ON" && valid.length) {
    otMin = offDay ? workMin : Math.max(0, workMin - settings.otAfterHours * 60);
  }

  return {
    date,
    status,
    firstIn,
    lastOut,
    workMin: Math.round(workMin),
    lateMin,
    otMin: Math.round(otMin),
    siteMinutes,
    firstSiteId,
    offDayWork: offDay && valid.length > 0,
    pendingReview,
  };
}

// Days worked (used for daily-wage pay and project costing).
export function workedDays(status: DayStatus): number {
  switch (status) {
    case "P":
    case "ON":
      return 1;
    case "HD":
    case "MO":
      return 0.5;
    default:
      return 0;
  }
}

// Paid days: monthly staff are also paid for holidays, week offs and approved leave.
export function paidDays(status: DayStatus, wageType: WageType): number {
  const worked = workedDays(status);
  if (worked) return worked;
  if (wageType === "monthly" && (status === "L" || status === "H" || status === "WO")) return 1;
  return 0;
}

export function dailyRate(wageType: WageType, wageAmount: number, settings: AppSettings) {
  return wageType === "daily" ? wageAmount : wageAmount / (settings.salaryDivisor || 26);
}

export function otCost(otMin: number, rate: number, settings: AppSettings) {
  return (otMin / 60) * (rate / (settings.fullDayHours || 8)) * settings.otMultiplier;
}
