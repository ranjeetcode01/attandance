import Link from "next/link";
import { PageHeader } from "@/components/admin/bits";
import { SitesMap } from "@/components/admin/maps";
import { Photo } from "@/components/admin/photo";
import { Flags, ReviewBadge, Stat } from "@/components/ui";
import { dashboardData } from "@/lib/reports";
import { fmtDate, istTime, weekdayName } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const d = await dashboardData();
  const maxTrend = Math.max(1, ...d.trend.map((t) => Math.max(t.present, t.labour)));
  const trades = Object.entries(d.labourByTrade).sort((a, b) => b[1] - a[1]);
  const pendingReview = d.kpi.pendingPunches + d.kpi.pendingSheets;

  return (
    <>
      <PageHeader
        title="Today on site"
        subtitle={`${weekdayName(d.today)}, ${fmtDate(d.today)}${d.holiday ? ` · Holiday: ${d.holiday}` : ""}`}
        actions={
          <>
            <Link href="/admin/attendance" className="btn btn-secondary">
              Daily register
            </Link>
            <Link href="/admin/review" className="btn btn-primary">
              Review queue {pendingReview > 0 && `(${pendingReview})`}
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Staff present" value={`${d.kpi.present}/${d.kpi.staff}`} hint={`${d.kpi.onSite} on site now`} tone="good" />
        <Stat label="Late today" value={d.kpi.late} tone={d.kpi.late ? "warn" : undefined} />
        <Stat label="Absent" value={d.kpi.absent} hint={d.kpi.leave ? `${d.kpi.leave} on leave` : undefined} tone={d.kpi.absent ? "bad" : undefined} />
        <Stat label="Labour on site" value={d.kpi.labour} hint="from supervisor sheets" />
        <Stat label="Needs review" value={pendingReview} hint={`${d.kpi.pendingPunches} punches · ${d.kpi.pendingSheets} sheets`} tone={pendingReview ? "warn" : undefined} />
        <Stat label="Pending requests" value={d.kpi.pendingRequests} tone={d.kpi.pendingRequests ? "warn" : undefined} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">Live map</h2>
            <span className="text-xs text-muted">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />
              on site · <span className="mx-1 inline-block h-2 w-2 rounded-full bg-slate-600" />
              punched out · <span className="mx-1 inline-block h-2 w-2 rounded-full bg-red-600" />
              outside fence
            </span>
          </div>
          <SitesMap sites={d.map.sites} points={d.map.points} height={340} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Last 7 days</h2>
          <div className="flex h-40 items-end gap-2">
            {d.trend.map((t) => (
              <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t bg-brand" style={{ height: `${(t.present / maxTrend) * 100}%` }} title={`${t.present} staff`} />
                  <div className="w-1/2 rounded-t bg-slate-400" style={{ height: `${(t.labour / maxTrend) * 100}%` }} title={`${t.labour} labour`} />
                </div>
                <span className="text-[10px] text-muted">{weekdayName(t.date)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand" /> staff present · <span className="mx-1 inline-block h-2 w-2 rounded-sm bg-slate-400" /> labour present
          </p>

          <h2 className="mt-5 mb-2 text-sm font-semibold">Labour by trade (today)</h2>
          {trades.length === 0 && <p className="text-sm text-muted">No labour sheet yet today.</p>}
          <ul className="space-y-1.5">
            {trades.map(([t, n]) => (
              <li key={t} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 truncate">{t}</span>
                <span className="h-2 rounded bg-slate-300" style={{ width: `${(n / trades[0][1]) * 100}%` }} />
                <span className="tabular-nums text-muted">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="card overflow-x-auto xl:col-span-2">
          <h2 className="px-4 pt-3 pb-2 text-sm font-semibold">Sites</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Project / site</th>
                <th>On site now</th>
                <th className="text-right">Staff visited</th>
                <th className="text-right">Labour</th>
              </tr>
            </thead>
            <tbody>
              {d.siteCards.map((c) => (
                <tr key={c.site.id}>
                  <td>
                    <div className="font-medium">{c.site.name}</div>
                    <div className="text-xs text-muted">{c.site.projectName}</div>
                  </td>
                  <td className="text-xs">{c.onSite.length ? c.onSite.join(", ") : <span className="text-muted">—</span>}</td>
                  <td className="text-right tabular-nums">{c.visited}</td>
                  <td className="text-right tabular-nums">{c.labour || <span className="text-amber-700">not marked</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Late ({d.lateList.length})</h2>
          <ul className="mb-4 space-y-1 text-sm">
            {d.lateList.map((l) => (
              <li key={l.name} className="flex justify-between">
                <span>{l.name}</span>
                <span className="text-orange-700 tabular-nums">{l.lateMin} min</span>
              </li>
            ))}
            {!d.lateList.length && <li className="text-muted">Nobody late 👍</li>}
          </ul>
          <h2 className="mb-2 text-sm font-semibold">Absent ({d.absentList.length})</h2>
          <p className="text-sm text-muted">{d.absentList.join(", ") || "—"}</p>
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="px-4 pt-3 pb-2 text-sm font-semibold">Latest punches</h2>
        <ul className="divide-y divide-line">
          {d.recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2">
              <Photo src={r.selfieUrl} alt={r.name} size={40} />
              <span className={`w-10 rounded py-0.5 text-center text-xs font-bold text-white ${r.type === "IN" ? "bg-emerald-600" : "bg-slate-700"}`}>{r.type}</span>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{r.name}</span> <span className="text-muted">· {r.siteName}</span>
                <div>
                  <Flags flags={r.flags} />
                </div>
              </div>
              <span className="text-sm tabular-nums">{istTime(r.time)}</span>
              <ReviewBadge status={r.reviewStatus} />
            </li>
          ))}
          {!d.recent.length && <li className="px-4 py-6 text-center text-sm text-muted">No punches yet today.</li>}
        </ul>
      </section>
    </>
  );
}
