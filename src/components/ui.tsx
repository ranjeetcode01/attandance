import { STATUS_LABEL, type DayStatus } from "@/lib/attendance";
import { FLAG_INFO } from "@/lib/defaults";

const STATUS_STYLE: Record<DayStatus, string> = {
  P: "bg-emerald-100 text-emerald-800",
  ON: "bg-sky-100 text-sky-800",
  HD: "bg-amber-100 text-amber-800",
  MO: "bg-orange-100 text-orange-800",
  SH: "bg-orange-100 text-orange-800",
  A: "bg-red-100 text-red-700",
  L: "bg-violet-100 text-violet-800",
  H: "bg-slate-200 text-slate-700",
  WO: "bg-slate-100 text-slate-600",
  "": "bg-transparent text-slate-300",
};

export function StatusBadge({ status, short = false }: { status: DayStatus; short?: boolean }) {
  if (!status) return <span className="text-slate-300">·</span>;
  return <span className={`badge ${STATUS_STYLE[status]}`}>{short ? status : STATUS_LABEL[status]}</span>;
}

export function statusCellClass(status: DayStatus) {
  return STATUS_STYLE[status];
}

const REVIEW_STYLE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-700",
};

const REVIEW_TEXT: Record<string, string> = { ok: "Verified", approved: "Approved", pending: "In review", rejected: "Rejected" };

export function ReviewBadge({ status }: { status: string }) {
  return <span className={`badge ${REVIEW_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>{REVIEW_TEXT[status] ?? status}</span>;
}

export function Flags({ flags, hideInfo = false }: { flags: string[]; hideInfo?: boolean }) {
  const list = flags.filter((f) => !hideInfo || FLAG_INFO[f]?.severe);
  if (!list.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((f) => (
        <span key={f} className={`badge ${FLAG_INFO[f]?.severe ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
          {FLAG_INFO[f]?.label ?? f}
        </span>
      ))}
    </span>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-ink";
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
