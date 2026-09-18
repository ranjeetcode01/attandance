"use client";

import { StatusBadge } from "@/components/ui";
import { fmtMinutes, istTime, weekdayName } from "@/lib/time";
import type { Boot } from "./types";

export function HistoryTab({ boot }: { boot: Boot }) {
  const month = boot.today.slice(0, 7);
  const thisMonth = boot.history.filter((h) => h.date.startsWith(month));
  const count = (s: string) => thisMonth.filter((h) => h.status === s).length;

  return (
    <div className="space-y-4">
      <section className="card grid grid-cols-4 gap-2 p-4 text-center">
        {[
          ["Present", count("P") + count("ON"), "text-emerald-700"],
          ["Half", count("HD") + count("MO"), "text-amber-700"],
          ["Absent", count("A"), "text-red-700"],
          ["Late", thisMonth.filter((h) => h.lateMin > 0).length, "text-orange-700"],
        ].map(([label, value, cls]) => (
          <div key={label as string}>
            <div className={`text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
        <p className="col-span-4 mt-1 text-xs text-muted">This month so far</p>
      </section>

      <section className="card divide-y divide-line">
        {boot.history.map((h) => (
          <div key={h.date} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-12 shrink-0 text-center">
              <div className="text-lg leading-5 font-semibold tabular-nums">{h.date.slice(8)}</div>
              <div className="text-[11px] text-muted">{weekdayName(h.date)}</div>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              {h.firstIn ? (
                <div className="tabular-nums">
                  {istTime(h.firstIn)} → {h.lastOut ? istTime(h.lastOut) : "—"}
                  <span className="ml-2 text-muted">{fmtMinutes(h.workMin)}</span>
                </div>
              ) : (
                <div className="text-muted">No punch</div>
              )}
              <div className="truncate text-xs text-muted">
                {h.sites.join(", ")}
                {h.lateMin > 0 && <span className="text-orange-700"> · Late {h.lateMin}m</span>}
                {h.otMin > 0 && <span className="text-sky-700"> · OT {fmtMinutes(h.otMin)}</span>}
                {h.pending > 0 && <span className="text-amber-700"> · {h.pending} in review</span>}
              </div>
            </div>
            <StatusBadge status={h.status} />
          </div>
        ))}
      </section>
      <p className="text-center text-xs text-muted">Wrong entry or missed punch? Raise a request from the Requests tab.</p>
    </div>
  );
}
