import type { Metadata } from "next";
import Link from "next/link";
import { addManualPunch } from "@/app/admin/actions/review";
import { Empty, ExportLink, Flash, intParam, PageHeader, param, qs } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Photo } from "@/components/admin/photo";
import { Flags, ReviewBadge, StatusBadge } from "@/components/ui";
import { fmtDistance } from "@/lib/geo";
import { dailyRegister, loadSites } from "@/lib/reports";
import { addDays, fmtDate, fmtMinutes, isDateStr, istTime, todayIST, weekdayName } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Daily register" };

export default async function AttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const sp = await searchParams;
  const today = todayIST();
  const date = isDateStr(param(sp.date)) ? param(sp.date)! : today;
  const projectId = intParam(sp.project);
  const siteId = intParam(sp.site);
  const [data, sites] = await Promise.all([dailyRegister(date, { projectId, siteId }), loadSites()]);
  const projects = [...new Map(sites.map((s) => [s.projectId, s.projectName])).entries()];
  const filterQs = { project: projectId, site: siteId };

  const counts = { P: 0, HD: 0, A: 0, ON: 0, late: 0 };
  for (const r of data.rows) {
    if (r.summary.status === "P") counts.P++;
    if (r.summary.status === "HD" || r.summary.status === "MO" || r.summary.status === "SH") counts.HD++;
    if (r.summary.status === "A") counts.A++;
    if (r.summary.status === "ON") counts.ON++;
    if (r.summary.lateMin) counts.late++;
  }

  return (
    <>
      <PageHeader
        title="Daily register"
        subtitle={`${weekdayName(date)}, ${fmtDate(date)}${data.holiday ? ` · Holiday: ${data.holiday}` : ""} — ${counts.P} present · ${counts.ON} on site · ${counts.HD} half/short · ${counts.A} absent · ${counts.late} late`}
        actions={<ExportLink href={`/api/export/daily${qs({ date, ...filterQs })}`} />}
      />
      <Flash searchParams={searchParams} />

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <Link className="btn btn-secondary" href={`/admin/attendance${qs({ date: addDays(date, -1), ...filterQs })}`}>
          ←
        </Link>
        <div>
          <label className="label">Date</label>
          <input type="date" name="date" defaultValue={date} max={today} className="input" />
        </div>
        {date < today && (
          <Link className="btn btn-secondary" href={`/admin/attendance${qs({ date: addDays(date, 1), ...filterQs })}`}>
            →
          </Link>
        )}
        <div>
          <label className="label">Project</label>
          <select name="project" defaultValue={projectId ?? ""} className="input">
            <option value="">All projects</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Site</label>
          <select name="site" defaultValue={siteId ?? ""} className="input">
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.projectName} · {s.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">Show</button>
      </form>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>In → Out</th>
              <th className="text-right">Work</th>
              <th className="text-right">Late</th>
              <th className="text-right">OT</th>
              <th>Punches</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(({ user, summary, punches }) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted">
                    {user.empCode} · {user.designation}
                  </div>
                </td>
                <td>
                  <StatusBadge status={summary.status} />
                  {summary.pendingReview > 0 && <div className="mt-1 text-[11px] text-amber-700">{summary.pendingReview} in review</div>}
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  {summary.firstIn ? istTime(summary.firstIn) : "—"} → {summary.lastOut ? istTime(summary.lastOut) : "—"}
                </td>
                <td className="text-right tabular-nums">{summary.workMin ? fmtMinutes(summary.workMin) : "—"}</td>
                <td className={`text-right tabular-nums ${summary.lateMin ? "text-orange-700" : "text-muted"}`}>{summary.lateMin ? `${summary.lateMin}m` : "—"}</td>
                <td className="text-right tabular-nums">{summary.otMin ? fmtMinutes(summary.otMin) : "—"}</td>
                <td className="min-w-[22rem]">
                  <div className="space-y-1.5">
                    {punches.map((p) => (
                      <div key={p.id} className={`flex items-start gap-2 ${p.reviewStatus === "rejected" ? "opacity-50" : ""}`}>
                        <Photo src={p.selfieUrl} alt={`${user.name} ${p.type}`} size={36} />
                        <div className="text-xs leading-5">
                          <span className={`mr-1 rounded px-1 font-bold text-white ${p.type === "IN" ? "bg-emerald-600" : "bg-slate-700"}`}>{p.type}</span>
                          <span className="font-semibold tabular-nums">{istTime(p.punchTime)}</span> · {p.siteName}
                          {p.workArea && ` · ${p.workArea}`}
                          {p.distanceM != null && <span className="text-muted"> · {fmtDistance(p.distanceM)}</span>}
                          {p.source !== "app" && <span className="text-muted"> · {p.source}</span>}{" "}
                          <ReviewBadge status={p.reviewStatus} />
                          {p.lat != null && (
                            <a className="ml-1 text-sky-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}>
                              map
                            </a>
                          )}
                          <div>
                            <Flags flags={p.flags} />
                          </div>
                          {p.note && <div className="text-muted">“{p.note}”</div>}
                          {p.reviewNote && <div className="text-muted">Review: {p.reviewNote} {p.reviewerName && `— ${p.reviewerName}`}</div>}
                        </div>
                      </div>
                    ))}
                    {!punches.length && <span className="text-xs text-muted">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && <Empty>No staff found for this filter.</Empty>}
      </section>

      <details className="card mt-4 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Add manual punch (phone lost / app issue)</summary>
        <form action={addManualPunch} className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <input type="hidden" name="_back" value={`/admin/attendance${qs({ date, ...filterQs })}`} />
          <div className="lg:col-span-2">
            <label className="label">Person</label>
            <select name="userId" className="input" required>
              {data.rows.map((r) => (
                <option key={r.user.id} value={r.user.id}>
                  {r.user.name} ({r.user.empCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Site</label>
            <select name="siteId" className="input" required>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select name="type" className="input">
              <option>IN</option>
              <option>OUT</option>
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" name="date" defaultValue={date} max={today} className="input" required />
          </div>
          <div>
            <label className="label">Time</label>
            <input type="time" name="time" defaultValue="09:00" className="input" required />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <label className="label">Reason (saved in audit log)</label>
            <input name="note" className="input" required minLength={5} />
          </div>
          <div className="flex items-end">
            <ConfirmSubmit confirmText="Add this manual punch?">Add punch</ConfirmSubmit>
          </div>
        </form>
      </details>
    </>
  );
}
