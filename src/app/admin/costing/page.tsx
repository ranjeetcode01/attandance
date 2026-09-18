import type { Metadata } from "next";
import { Empty, ExportLink, PageHeader, param, qs } from "@/components/admin/bits";
import { inr, Stat } from "@/components/ui";
import { projectCostReport } from "@/lib/reports";
import { fmtDate, fmtMinutes, isDateStr, monthDays, todayIST } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Project labour cost" };

const r1 = (n: number) => Math.round(n * 10) / 10;

export default async function CostingPage({ searchParams }: PageProps<"/admin/costing">) {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const sp = await searchParams;
  const today = todayIST();
  const days = monthDays(today.slice(0, 7));
  const from = isDateStr(param(sp.from)) ? param(sp.from)! : days[0];
  const to = isDateStr(param(sp.to)) ? param(sp.to)! : today;
  const data = await projectCostReport(from, to);

  const grand = data.projects.reduce(
    (a, p) => ({ staff: a.staff + p.total.staffCost, labour: a.labour + p.total.labourCost, staffDays: a.staffDays + p.total.staffDays, labourDays: a.labourDays + p.total.labourDays }),
    { staff: 0, labour: 0, staffDays: 0, labourDays: 0 },
  );
  const max = Math.max(1, ...data.projects.map((p) => p.total.staffCost + p.total.labourCost));

  return (
    <>
      <PageHeader
        title="Project labour cost"
        subtitle={`${fmtDate(from)} → ${fmtDate(to)} · site-wise cost from attendance — feeds order/project profit analysis`}
        actions={<ExportLink href={`/api/export/cost${qs({ from, to })}`} />}
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <div>
          <label className="label">From</label>
          <input type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={to} max={today} className="input" />
        </div>
        <button className="btn btn-primary">Show</button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total labour cost" value={inr(grand.staff + grand.labour)} />
        <Stat label="Own staff" value={inr(grand.staff)} hint={`${r1(grand.staffDays)} man-days`} />
        <Stat label="Contract labour" value={inr(grand.labour)} hint={`${r1(grand.labourDays)} man-days`} />
        <Stat label="Sheets not counted" value={data.pendingSheets} hint="pending/rejected review" tone={data.pendingSheets ? "warn" : undefined} />
      </div>

      <section className="card mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Project / site</th>
              <th className="text-right">Staff days</th>
              <th className="text-right">Staff cost</th>
              <th className="text-right">Labour days</th>
              <th className="text-right">Labour cost</th>
              <th className="text-right">Total</th>
              <th className="w-40"></th>
            </tr>
          </thead>
          {data.projects.map((p) => {
            const total = p.total.staffCost + p.total.labourCost;
            return (
              <tbody key={p.projectId} className="border-t-2 border-line">
                <tr className="bg-slate-50 font-semibold">
                  <td>
                    {p.name} <span className="text-xs font-normal text-muted">{p.code}</span>
                  </td>
                  <td className="text-right tabular-nums">{r1(p.total.staffDays)}</td>
                  <td className="text-right tabular-nums">{inr(p.total.staffCost)}</td>
                  <td className="text-right tabular-nums">{r1(p.total.labourDays)}</td>
                  <td className="text-right tabular-nums">{inr(p.total.labourCost)}</td>
                  <td className="text-right tabular-nums">{inr(total)}</td>
                  <td>
                    <div className="flex h-2 overflow-hidden rounded bg-slate-100" style={{ width: `${(total / max) * 100}%` }}>
                      <div className="bg-brand" style={{ width: `${(p.total.staffCost / (total || 1)) * 100}%` }} />
                      <div className="flex-1 bg-slate-400" />
                    </div>
                  </td>
                </tr>
                {p.sites.map(({ site, line }) => (
                  <tr key={site.id}>
                    <td className="pl-8 text-muted">{site.name}</td>
                    <td className="text-right tabular-nums">{r1(line.staffDays)}</td>
                    <td className="text-right tabular-nums">{inr(line.staffCost)}</td>
                    <td className="text-right tabular-nums">{r1(line.labourDays)}</td>
                    <td className="text-right tabular-nums">{inr(line.labourCost)}</td>
                    <td className="text-right tabular-nums">{inr(line.staffCost + line.labourCost)}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
        {!data.projects.length && <Empty>No attendance in this range.</Empty>}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="px-4 pt-3 pb-2 text-sm font-semibold">Contractor wage bill</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Contractor</th>
                <th className="text-right">Sheets</th>
                <th className="text-right">Man-days</th>
                <th className="text-right">Wages</th>
              </tr>
            </thead>
            <tbody>
              {data.contractors.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="text-right tabular-nums">{c.sheets}</td>
                  <td className="text-right tabular-nums">{r1(c.days)}</td>
                  <td className="text-right tabular-nums">{inr(c.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.contractors.length && <Empty>No labour sheets.</Empty>}
        </section>
        <section className="card overflow-x-auto">
          <h2 className="px-4 pt-3 pb-2 text-sm font-semibold">Staff cost</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="text-right">Days</th>
                <th className="text-right">OT</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr key={s.user.id}>
                  <td>
                    {s.user.name} <span className="text-xs text-muted">{s.user.wageType === "daily" ? `₹${s.user.wageAmount}/day` : `₹${s.user.wageAmount.toLocaleString("en-IN")}/month`}</span>
                  </td>
                  <td className="text-right tabular-nums">{s.days}</td>
                  <td className="text-right tabular-nums">{s.otMin ? fmtMinutes(s.otMin) : "—"}</td>
                  <td className="text-right tabular-nums">{inr(s.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <p className="mt-3 text-xs text-muted">
        Staff cost = days worked × daily rate (monthly salary ÷ {data.settings.salaryDivisor}) + OT × {data.settings.otMultiplier}, split across sites by time spent. Labour cost = man-days × wage + OT. Paid holidays and leave are overhead and are not charged to projects.
      </p>
    </>
  );
}
