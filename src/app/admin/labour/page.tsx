import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Empty, ExportLink, intParam, PageHeader, param, qs } from "@/components/admin/bits";
import { Photo } from "@/components/admin/photo";
import { Flags, inr, ReviewBadge } from "@/components/ui";
import { getDb } from "@/db";
import { contractors } from "@/db/schema";
import { labourSheetsReport, loadSites } from "@/lib/reports";
import { addDays, fmtDate, isDateStr, istTime, todayIST } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Labour sheets" };

export default async function LabourPage({ searchParams }: PageProps<"/admin/labour">) {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const sp = await searchParams;
  const today = todayIST();
  const from = isDateStr(param(sp.from)) ? param(sp.from)! : addDays(today, -6);
  const to = isDateStr(param(sp.to)) ? param(sp.to)! : today;
  const siteId = intParam(sp.site);
  const contractorId = intParam(sp.contractor);
  const db = await getDb();
  const [{ sheets }, sites, cs] = await Promise.all([
    labourSheetsReport(from, to, { siteId, contractorId }),
    loadSites(),
    db.select().from(contractors).orderBy(asc(contractors.firmName)),
  ]);

  const counted = sheets.filter((s) => s.counted);
  const totals = counted.reduce(
    (a, s) => ({ present: a.present + s.present, manDays: a.manDays + s.manDays, cost: a.cost + s.cost }),
    { present: 0, manDays: 0, cost: 0 },
  );
  const tradeTotals: Record<string, number> = {};
  for (const s of counted) for (const [t, n] of Object.entries(s.trades)) tradeTotals[t] = (tradeTotals[t] ?? 0) + n;

  // Daily labour report grid: date × site
  const days = [...new Set(counted.map((s) => s.workDate))].sort().reverse();
  const siteIds = [...new Set(counted.map((s) => s.siteId))];

  return (
    <>
      <PageHeader
        title="Labour sheets"
        subtitle={`${fmtDate(from)} → ${fmtDate(to)} · ${counted.length} sheets · ${totals.manDays} man-days · wages ${inr(totals.cost)}`}
        actions={<ExportLink href={`/api/export/labour${qs({ from, to, site: siteId, contractor: contractorId })}`} />}
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
        <div>
          <label className="label">Contractor</label>
          <select name="contractor" defaultValue={contractorId ?? ""} className="input">
            <option value="">All contractors</option>
            {cs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firmName || c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">Show</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <h2 className="px-4 pt-3 pb-2 text-sm font-semibold">Daily labour report (present count)</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                {siteIds.map((id) => (
                  <th key={id} className="text-right">
                    {sites.find((s) => s.id === id)?.name}
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const row = siteIds.map((id) => counted.filter((s) => s.workDate === d && s.siteId === id).reduce((a, s) => a + s.present, 0));
                return (
                  <tr key={d}>
                    <td className="whitespace-nowrap">{fmtDate(d)}</td>
                    {row.map((n, i) => (
                      <td key={siteIds[i]} className={`text-right tabular-nums ${n ? "" : "text-amber-600"}`}>
                        {n || "—"}
                      </td>
                    ))}
                    <td className="text-right font-semibold tabular-nums">{row.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!days.length && <Empty>No labour sheets in this range.</Empty>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Present by trade (total headcount-days)</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(tradeTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <li key={t} className="flex justify-between">
                  <span>{t}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <section className="card mt-4 overflow-x-auto">
        <h2 className="px-4 pt-3 pb-2 text-sm font-semibold">Sheets</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date / site</th>
              <th>Contractor</th>
              <th>Marked</th>
              <th className="text-right">P</th>
              <th className="text-right">A</th>
              <th className="text-right">Man-days</th>
              <th className="text-right">Wages</th>
              <th>Safety</th>
              <th>Status</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.id} className={s.counted ? "" : "bg-amber-50/50"}>
                <td className="whitespace-nowrap">
                  <div className="font-medium">{fmtDate(s.workDate)}</div>
                  <div className="text-xs text-muted">
                    {s.site?.projectName} · {s.site?.name}
                  </div>
                </td>
                <td>
                  {s.contractorName}
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer">{s.entries.length} rows</summary>
                    <ul className="mt-1 space-y-0.5">
                      {s.entries.map((e) => (
                        <li key={e.id}>
                          {e.labourName ?? `${e.count} × ${e.trade} (headcount)`} · {e.labourName ? `${e.trade} · ` : ""}
                          <b className={e.status === "A" ? "text-red-600" : e.status === "H" ? "text-amber-600" : "text-emerald-700"}>{e.status}</b>
                          {e.otHours > 0 && ` · OT ${e.otHours}h`} · ₹{e.rate}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="text-xs whitespace-nowrap">
                  {s.markedByName}
                  <div className="text-muted">
                    {istTime(s.punchTime)}
                    {s.offline && " · offline"}
                  </div>
                </td>
                <td className="text-right tabular-nums">{s.present}</td>
                <td className="text-right tabular-nums">{s.absent}</td>
                <td className="text-right tabular-nums">{s.manDays}</td>
                <td className="text-right tabular-nums">{inr(s.cost)}</td>
                <td className="text-xs whitespace-nowrap">
                  {s.ppeChecked ? "PPE ✓" : <span className="text-red-600">PPE ✗</span>} · {s.toolboxTalk ? "TBT ✓" : <span className="text-amber-600">TBT ✗</span>}
                </td>
                <td>
                  <ReviewBadge status={s.reviewStatus} />
                  <Flags flags={s.flags} hideInfo />
                </td>
                <td>
                  <Photo src={s.photoUrl} alt="Group photo" size={40} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sheets.length && <Empty>No labour sheets in this range.</Empty>}
      </section>
    </>
  );
}
