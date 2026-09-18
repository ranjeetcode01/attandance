// All attendance dates are Indian Standard Time (UTC+05:30, no DST),
// independent of the server's own timezone.
export const IST_OFFSET_MIN = 330;
const OFFSET_MS = IST_OFFSET_MIN * 60_000;

const toMs = (v: number | Date) => (typeof v === "number" ? v : v.getTime());

export function istDate(v: number | Date): string {
  return new Date(toMs(v) + OFFSET_MS).toISOString().slice(0, 10);
}

export function istTime(v: number | Date): string {
  return new Date(toMs(v) + OFFSET_MS).toISOString().slice(11, 16);
}

export function istDateTime(v: number | Date): string {
  const iso = new Date(toMs(v) + OFFSET_MS).toISOString();
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export function todayIST(): string {
  return istDate(Date.now());
}

export function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00+05:30`);
}

// "2026-09-16" + "09:30" → epoch ms of that IST moment
export function istMoment(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00+05:30`);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtMinutes(min: number): string {
  if (!min || min < 0) return "0h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}-${m}-${y}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayName(date: string): string {
  return WEEKDAYS[weekday(date)];
}

export const isDateStr = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const isMonthStr = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
