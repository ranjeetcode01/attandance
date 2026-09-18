import { asc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { saveContractor } from "@/app/admin/actions/masters";
import { Flash, PageHeader } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { getDb } from "@/db";
import { contractors, labourers } from "@/db/schema";
import { requireUser, MANAGER_ROLES } from "@/lib/auth";

export const metadata: Metadata = { title: "Contractors & labour" };

export default async function ContractorsPage({ searchParams }: PageProps<"/admin/contractors">) {
  await requireUser(MANAGER_ROLES);
  const db = await getDb();
  const [rows, counts] = await Promise.all([
    db.select().from(contractors).orderBy(asc(contractors.firmName)),
    db
      .select({ contractorId: labourers.contractorId, total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${labourers.active})::int` })
      .from(labourers)
      .groupBy(labourers.contractorId),
  ]);
  const countOf = new Map(counts.map((c) => [c.contractorId, c]));

  return (
    <>
      <PageHeader title="Contractors & labour" subtitle="Labour without smartphones is marked by the site supervisor, contractor-wise." />
      <Flash searchParams={searchParams} />
      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Firm</th>
              <th>Contact</th>
              <th>GSTIN</th>
              <th className="text-right">Labour</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <td className="font-medium">{c.firmName || c.name}</td>
                <td className="text-xs">
                  {c.name}
                  <div className="text-muted">{c.mobile}</div>
                </td>
                <td className="font-mono text-xs">{c.gstin || "—"}</td>
                <td className="text-right tabular-nums">
                  {countOf.get(c.id)?.active ?? 0}
                  <span className="text-xs text-muted"> / {countOf.get(c.id)?.total ?? 0}</span>
                </td>
                <td className="text-right">
                  <Link href={`/admin/contractors/${c.id}`} className="btn btn-ghost btn-sm">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="text-center text-muted">
                  No contractors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card mt-6 p-4">
        <h2 className="mb-3 text-sm font-semibold">Add contractor</h2>
        <form action={saveContractor} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="firmName" className="input" placeholder="Firm name" />
          <input name="name" className="input" placeholder="Contact person *" required />
          <input name="mobile" className="input" placeholder="Mobile" inputMode="numeric" />
          <input name="gstin" className="input uppercase" placeholder="GSTIN (optional)" />
          <input type="hidden" name="active" value="on" />
          <ConfirmSubmit>Add contractor</ConfirmSubmit>
        </form>
      </section>
    </>
  );
}
