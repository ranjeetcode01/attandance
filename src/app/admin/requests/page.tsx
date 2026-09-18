import { desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { reviewRequest } from "@/app/admin/actions/review";
import { Empty, Flash, PageHeader, param } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { getDb } from "@/db";
import { requests, sites, users } from "@/db/schema";
import { dateRange, fmtDate, istDateTime } from "@/lib/time";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Requests" };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  // Pages render in parallel with the layout, so each page checks access itself.
  await requireUser(MANAGER_ROLES);
  const sp = await searchParams;
  const show = param(sp.show) === "all" ? "all" : "pending";
  const db = await getDb();
  const rows = await db
    .select({ r: requests, userName: users.name, empCode: users.empCode, siteName: sites.name })
    .from(requests)
    .innerJoin(users, eq(requests.userId, users.id))
    .leftJoin(sites, eq(requests.siteId, sites.id))
    .where(show === "pending" ? eq(requests.status, "pending") : undefined)
    .orderBy(desc(requests.createdAt))
    .limit(200);
  const reviewerIds = [...new Set(rows.map((x) => x.r.reviewedBy).filter((x): x is number => x != null))];
  const reviewers = reviewerIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds)) : [];
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name]));

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Missed-punch corrections and leave. Approving a missed punch creates the punch automatically."
        actions={
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            <Link href="/admin/requests" className={`btn btn-sm ${show === "pending" ? "btn-primary" : "btn-ghost"}`}>
              Pending
            </Link>
            <Link href="/admin/requests?show=all" className={`btn btn-sm ${show === "all" ? "btn-primary" : "btn-ghost"}`}>
              All
            </Link>
          </div>
        }
      />
      <Flash searchParams={searchParams} />
      <section className="card divide-y divide-line">
        {rows.map(({ r, userName, empCode, siteName }) => (
          <div key={r.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{userName}</span>
                <span className="text-muted">({empCode})</span>
                <span className={`badge ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </div>
              <div className="mt-0.5">
                {r.kind === "leave" ? (
                  <>
                    <b>{r.leaveType} leave</b> · {fmtDate(r.fromDate)}
                    {r.toDate !== r.fromDate && ` → ${fmtDate(r.toDate)}`} ({dateRange(r.fromDate, r.toDate).length} day{r.fromDate !== r.toDate ? "s" : ""})
                  </>
                ) : (
                  <>
                    <b>Missed punch</b> · {fmtDate(r.fromDate)} at {siteName ?? "?"} · IN {r.inTime || "—"} · OUT {r.outTime || "—"}
                  </>
                )}
              </div>
              <div className="text-xs text-muted">
                “{r.reason}” · raised {istDateTime(r.createdAt)}
              </div>
              {r.status !== "pending" && (
                <div className="text-xs text-muted">
                  {r.status} by {r.reviewedBy ? reviewerName.get(r.reviewedBy) : "?"}
                  {r.reviewedAt && ` on ${istDateTime(r.reviewedAt)}`}
                  {r.reviewNote && ` — ${r.reviewNote}`}
                </div>
              )}
            </div>
            {r.status === "pending" && (
              <form action={reviewRequest} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="_back" value="/admin/requests" />
                <input name="note" className="input w-52 py-1.5" placeholder="Note (required to reject)" maxLength={300} />
                <ConfirmSubmit className="btn btn-success btn-sm" name="decision" value="approved">
                  Approve
                </ConfirmSubmit>
                <ConfirmSubmit className="btn btn-danger btn-sm" name="decision" value="rejected">
                  Reject
                </ConfirmSubmit>
              </form>
            )}
          </div>
        ))}
        {!rows.length && <Empty>{show === "pending" ? "No pending requests ✓" : "No requests yet."}</Empty>}
      </section>
    </>
  );
}
