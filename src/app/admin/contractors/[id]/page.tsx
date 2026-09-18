import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { importLabour, saveContractor, saveLabourer, toggleLabourer } from "@/app/admin/actions/masters";
import { BackLink, Flash, PageHeader } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { getDb } from "@/db";
import { contractors, labourers } from "@/db/schema";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Contractor" };

export default async function ContractorPage({ params, searchParams }: PageProps<"/admin/contractors/[id]">) {
  await requireUser(MANAGER_ROLES);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(contractors).where(eq(contractors.id, Number(id)));
  if (!c) notFound();
  const [rows, settings] = await Promise.all([
    db.select().from(labourers).where(eq(labourers.contractorId, c.id)).orderBy(asc(labourers.name)),
    getSettings(),
  ]);
  const back = `/admin/contractors/${c.id}`;
  const tradeOptions = (
    <datalist id="trades">
      {settings.trades.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );

  return (
    <>
      <BackLink href="/admin/contractors">Contractors</BackLink>
      <PageHeader title={c.firmName || c.name} subtitle={`${rows.filter((r) => r.active).length} active labourers`} />
      <Flash searchParams={searchParams} />
      {tradeOptions}

      <details className="card mb-4 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Contractor details</summary>
        <form action={saveContractor} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input type="hidden" name="id" value={c.id} />
          <input name="firmName" defaultValue={c.firmName} className="input" placeholder="Firm name" />
          <input name="name" defaultValue={c.name} className="input" placeholder="Contact person" required />
          <input name="mobile" defaultValue={c.mobile} className="input" placeholder="Mobile" />
          <input name="gstin" defaultValue={c.gstin} className="input uppercase" placeholder="GSTIN" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={c.active} className="h-4 w-4 accent-[var(--brand)]" /> Active
          </label>
          <ConfirmSubmit>Save</ConfirmSubmit>
        </form>
      </details>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Trade</th>
              <th>Daily wage ₹</th>
              <th>Mobile</th>
              <th>ID last 4</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className={l.active ? "" : "opacity-50"}>
                <td colSpan={5} className="p-0">
                  <form action={saveLabourer} className="grid grid-cols-[1.4fr_1fr_0.7fr_1fr_0.6fr_auto] items-center gap-2 px-3 py-1.5">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="contractorId" value={c.id} />
                    <input type="hidden" name="active" value={l.active ? "on" : ""} />
                    <input name="name" defaultValue={l.name} className="input py-1" required />
                    <input name="trade" defaultValue={l.trade} list="trades" className="input py-1" />
                    <input name="dailyWage" type="number" min={0} defaultValue={l.dailyWage} className="input py-1" />
                    <input name="mobile" defaultValue={l.mobile} className="input py-1" />
                    <input name="idLast4" defaultValue={l.idLast4} maxLength={4} className="input py-1" />
                    <ConfirmSubmit className="btn btn-secondary btn-sm">Save</ConfirmSubmit>
                  </form>
                </td>
                <td>
                  <form action={toggleLabourer}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="contractorId" value={c.id} />
                    <input type="hidden" name="_back" value={back} />
                    <ConfirmSubmit className="btn btn-ghost btn-sm">{l.active ? "Deactivate" : "Activate"}</ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  No labour added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Add one labourer</h2>
          <form action={saveLabourer} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="contractorId" value={c.id} />
            <input name="name" className="input" placeholder="Name *" required />
            <input name="trade" className="input" placeholder="Trade" list="trades" defaultValue={settings.trades[0]} />
            <input name="dailyWage" type="number" min={0} className="input" placeholder="Daily wage ₹" />
            <input name="mobile" className="input" placeholder="Mobile" inputMode="numeric" />
            <input name="idLast4" className="input" placeholder="Aadhaar/ID last 4 digits" maxLength={4} inputMode="numeric" />
            <ConfirmSubmit>Add</ConfirmSubmit>
          </form>
        </section>
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Bulk add (paste from Excel)</h2>
          <p className="mb-2 text-xs text-muted">One per line: Name, Trade, Daily wage, Mobile</p>
          <form action={importLabour} className="space-y-2">
            <input type="hidden" name="contractorId" value={c.id} />
            <textarea name="rows" className="input min-h-32 font-mono text-xs" placeholder={"Raju Yadav, Helper, 600, 9876543210\nMukesh Paswan, Welder, 900"} required />
            <ConfirmSubmit confirmText="Import these labourers?">Import</ConfirmSubmit>
          </form>
        </section>
      </div>
      <p className="mt-3 text-xs text-muted">Only store the last 4 digits of Aadhaar/ID — never the full number.</p>
    </>
  );
}
