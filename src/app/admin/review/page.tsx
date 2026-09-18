import type { Metadata } from "next";
import { reviewPunches, reviewSheet } from "@/app/admin/actions/review";
import { Empty, Flash, PageHeader } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Photo } from "@/components/admin/photo";
import { Flags } from "@/components/ui";
import { fmtDistance } from "@/lib/geo";
import { reviewQueue } from "@/lib/reports";
import { fmtDate, istDateTime } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewPage({ searchParams }: PageProps<"/admin/review">) {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const q = await reviewQueue();

  return (
    <>
      <PageHeader title="Review queue" subtitle="Punches and labour sheets that failed an automatic check. Approved items count in attendance; rejected items do not." />
      <Flash searchParams={searchParams} />

      <form action={reviewPunches} className="card">
        <input type="hidden" name="_back" value="/admin/review" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Punches ({q.punches.length})</h2>
          {q.punches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <input name="note" className="input w-64 py-1.5" placeholder="Note (required to reject)" maxLength={300} />
              <ConfirmSubmit className="btn btn-success btn-sm" name="decision" value="approved" confirmText="Approve selected punches?">
                Approve selected
              </ConfirmSubmit>
              <ConfirmSubmit className="btn btn-danger btn-sm" name="decision" value="rejected" confirmText="Reject selected punches? They will not count as attendance.">
                Reject selected
              </ConfirmSubmit>
            </div>
          )}
        </div>
        <ul className="divide-y divide-line">
          {q.punches.map((p) => {
            const lagMin = Math.round((p.receivedAt.getTime() - p.punchTime.getTime()) / 60_000);
            return (
              <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <input type="checkbox" name="id" value={p.id} className="mt-1 h-4 w-4 accent-[var(--brand)]" aria-label="Select" />
                <Photo src={p.selfieUrl} alt={p.userName} size={72} />
                <div className="min-w-0 flex-1 text-sm">
                  <div>
                    <span className={`mr-1 rounded px-1.5 text-xs font-bold text-white ${p.type === "IN" ? "bg-emerald-600" : "bg-slate-700"}`}>{p.type}</span>
                    <span className="font-semibold">{p.userName}</span> <span className="text-muted">({p.empCode})</span> ·{" "}
                    <span className="tabular-nums">{istDateTime(p.punchTime)}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {p.site ? `${p.site.projectName} · ${p.site.name}` : "No site"}
                    {p.workArea && ` · ${p.workArea}`}
                    {p.distanceM != null && p.site && (
                      <>
                        {" "}
                        · <span className={p.insideFence ? "" : "font-semibold text-red-700"}>{fmtDistance(p.distanceM)}</span> from centre (fence {p.site.radiusM} m)
                      </>
                    )}
                    {p.accuracy != null && ` · GPS ±${Math.round(p.accuracy)} m`}
                    {p.lat != null && (
                      <>
                        {" · "}
                        <a className="text-sky-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}>
                          open map
                        </a>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    Phone time {istDateTime(p.deviceTime)} · received {istDateTime(p.receivedAt)}
                    {lagMin > 2 && ` (${lagMin >= 120 ? `${Math.round(lagMin / 60)} h` : `${lagMin} min`} later)`}
                    {p.meta.skewMs != null && Math.abs(p.meta.skewMs) > 120_000 && ` · phone clock off by ${Math.round(p.meta.skewMs / 60_000)} min`}
                  </div>
                  <div className="mt-1">
                    <Flags flags={p.flags} />
                  </div>
                  {p.note && <div className="mt-1 text-xs">“{p.note}”</div>}
                </div>
                <ConfirmSubmit className="btn btn-secondary btn-sm" name="quick" value={p.id}>
                  Approve
                </ConfirmSubmit>
              </li>
            );
          })}
        </ul>
        {!q.punches.length && <Empty>No punches waiting for review ✓</Empty>}
      </form>

      <section className="card mt-4">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Labour sheets ({q.sheets.length})</h2>
        <ul className="divide-y divide-line">
          {q.sheets.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <Photo src={s.photoUrl} alt="Group photo" size={72} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">
                  {s.contractorName} · {fmtDate(s.workDate)}
                </div>
                <div className="text-xs text-muted">
                  {s.site ? `${s.site.projectName} · ${s.site.name}` : ""} · marked by {s.markedByName} at {istDateTime(s.punchTime)}
                  {s.distanceM != null && ` · ${fmtDistance(s.distanceM)} from centre`}
                </div>
                <div className="mt-1">
                  <Flags flags={s.flags} />
                </div>
              </div>
              <form action={reviewSheet} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="_back" value="/admin/review" />
                <input name="note" className="input w-48 py-1.5" placeholder="Note (to reject)" maxLength={300} />
                <ConfirmSubmit className="btn btn-success btn-sm" name="decision" value="approved">
                  Approve
                </ConfirmSubmit>
                <ConfirmSubmit className="btn btn-danger btn-sm" name="decision" value="rejected" confirmText="Reject this labour sheet?">
                  Reject
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
        {!q.sheets.length && <Empty>No labour sheets waiting for review ✓</Empty>}
      </section>
    </>
  );
}
