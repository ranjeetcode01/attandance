import type { Metadata } from "next";
import Link from "next/link";
import { Empty, ExportLink, intParam, PageHeader, param, qs } from "@/components/admin/bits";
import { statusCellClass } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/attendance";
import { loadSites, musterReport } from "@/lib/reports";
import { fmtMinutes, isMonthStr, istTime, monthDays, todayIST, weekday, weekdayName } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Monthly muster" };

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function MusterPage({ searchParams }: PageProps<"/admin/muster">) {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const sp = await searchParams;
  const today = todayIST();
  const month = isMonthStr(param(sp.month)) ? param(sp.month)! : today.slice(0, 7);
  const projectId = intParam(sp.project);
  const days = monthDays(month);
  const from = days[0];
  const to = days[days.length - 1];
  const [data, sites] = await Promise.all([musterReport(from, to, { projectId }), loadSites()]);
  const projects = [...new Map(sites.map((s) => [s.projectId, s.projectName])).entries()];
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title="Monthly muster"
        subtitle={`${monthLabel} · P present · HD half day · MO missed OUT · SH short hours · A absent · L leave · H holiday · WO week off`}
        actions={<ExportLink href={`/api/export/muster${qs({ month, project: projectId })}`} />}
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3 print:hidden" method="get">
        <Link className="btn btn-secondary" href={`/admin/muster${qs({ month: shiftMonth(month, -1), project: projectId })}`}>
          ←
        </Link>
        <div>
          <label className="label">Month</label>
          <input type="month" name="month" defaultValue={month} max={today.slice(0, 7)} className="input" />
        </div>
        {month < today.slice(0, 7) && (
          <Link className="btn btn-secondary" href={`/admin/muster${qs({ month: shiftMonth(month, 1), project: projectId })}`}>
            →
          </Link>
        )}
        <div>
          <label className="label">Project (assigned staff)</label>
          <select name="project" defaultValue={projectId ?? ""} className="input">
            <option value="">All staff</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">Show</button>
      </form>

      <section className="card overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-muted">
              <th className="sticky left-0 z-10 min-w-44 border-b border-line bg-slate-50 px-3 py-2 text-left">Name</th>
              {days.map((d) => (
                <th key={d} className={`border-b border-line px-0.5 py-1 text-center font-medium ${data.holidays.has(d) || weekday(d) === data.settings.weeklyOffDay ? "bg-slate-100" : ""}`}>
                  <div>{d.slice(8)}</div>
                  <div className="text-[9px] font-normal">{weekdayName(d).slice(0, 2)}</div>
                </th>
              ))}
              {["P", "HD", "A", "L", "Late", "OT", "Worked", "Paid"].map((h) => (
                <th key={h} className="border-b border-l border-line px-2 py-1 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.user.id} className="hover:bg-slate-50">
                <td className="sticky left-0 z-10 border-b border-line bg-white px-3 py-1.5">
                  <div className="font-medium">{r.user.name}</div>
                  <div className="text-[10px] text-muted">
                    {r.user.empCode} · {r.user.designation}
                  </div>
                </td>
                {r.cells.map((c) => (
                  <td key={c.date} className="border-b border-line p-0.5 text-center">
                    {c.status ? (
                      <span
                        className={`block rounded py-1 font-semibold ${statusCellClass(c.status)} ${c.lateMin ? "ring-1 ring-orange-400" : ""}`}
                        title={`${STATUS_LABEL[c.status]}${c.firstIn ? ` · ${istTime(c.firstIn)}–${c.lastOut ? istTime(c.lastOut) : "?"}` : ""}${c.workMin ? ` · ${fmtMinutes(c.workMin)}` : ""}${c.lateMin ? ` · late ${c.lateMin}m` : ""}${c.pendingReview ? ` · ${c.pendingReview} in review` : ""}`}
                      >
                        {c.status === "ON" ? "P" : c.status}
                      </span>
                    ) : null}
                  </td>
                ))}
                <td className="border-b border-l border-line px-2 text-right tabular-nums">{r.totals.P}</td>
                <td className="border-b border-line px-2 text-right tabular-nums">{r.totals.HD + r.totals.MO + r.totals.SH}</td>
                <td className="border-b border-line px-2 text-right tabular-nums">{r.totals.A}</td>
                <td className="border-b border-line px-2 text-right tabular-nums">{r.totals.L}</td>
                <td className="border-b border-line px-2 text-right tabular-nums">{r.totals.late}</td>
                <td className="border-b border-line px-2 text-right tabular-nums">{r.totals.otMin ? fmtMinutes(r.totals.otMin) : ""}</td>
                <td className="border-b border-line px-2 text-right font-semibold tabular-nums">{r.totals.worked}</td>
                <td className="border-b border-line px-2 text-right font-semibold tabular-nums">{r.totals.paid}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && <Empty>No staff found.</Empty>}
      </section>
      <p className="mt-2 text-xs text-muted">
        Orange ring = late. Paid days include holidays, week offs and approved leave for monthly staff. Salary divisor: {data.settings.salaryDivisor}.
      </p>
    </>
  );
}
