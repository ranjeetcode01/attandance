import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Flash, PageHeader } from "@/components/admin/bits";
import { getDb } from "@/db";
import { users, userSites } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/defaults";
import { loadSites } from "@/lib/reports";
import { UserForm } from "./user-form";

export const metadata: Metadata = { title: "Staff & logins" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireUser(["admin"]);
  const db = await getDb();
  const [rows, links, sites] = await Promise.all([db.select().from(users).orderBy(asc(users.name)), db.select().from(userSites), loadSites()]);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader title="Staff & logins" subtitle={`${rows.filter((r) => r.active).length} active users`} />
      <Flash searchParams={searchParams} />
      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID / mobile</th>
              <th>Role</th>
              <th>Sites</th>
              <th className="text-right">Wage</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const mine = links.filter((l) => l.userId === u.id).map((l) => siteName.get(l.siteId));
              return (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted">{u.designation}</div>
                  </td>
                  <td className="text-xs">
                    <div className="font-mono">{u.empCode}</div>
                    <div className="text-muted">{u.mobile ?? "—"}</div>
                  </td>
                  <td className="text-xs">
                    {ROLE_LABELS[u.role]}
                    {!u.active && <span className="ml-1 badge bg-slate-200 text-slate-600">disabled</span>}
                  </td>
                  <td className="text-xs">{u.role === "admin" || u.role === "pm" ? <span className="text-muted">all sites</span> : mine.join(", ") || <span className="text-red-600">none</span>}</td>
                  <td className="text-right text-xs tabular-nums">
                    {u.wageAmount ? `₹${u.wageAmount.toLocaleString("en-IN")}/${u.wageType === "daily" ? "day" : "month"}` : "—"}
                  </td>
                  <td className="text-right">
                    <Link href={`/admin/users/${u.id}`} className="btn btn-ghost btn-sm">
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Add user</h2>
      <UserForm sites={sites} assigned={new Set()} />
    </>
  );
}
