import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Empty, PageHeader } from "@/components/admin/bits";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { istDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireUser(["admin"]);
  const db = await getDb();
  const rows = await db
    .select({ log: auditLogs, actor: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .orderBy(desc(auditLogs.at))
    .limit(300);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Last 300 changes: logins, approvals, manual punches, master data." />
      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ log, actor }) => (
              <tr key={log.id}>
                <td className="text-xs whitespace-nowrap tabular-nums">{istDateTime(log.at)}</td>
                <td className="text-xs">{actor ?? "system"}</td>
                <td className="font-mono text-xs">{log.action}</td>
                <td className="max-w-xl truncate font-mono text-[11px] text-muted" title={JSON.stringify(log.data)}>
                  {log.entity}#{log.entityId} {Object.keys(log.data).length ? JSON.stringify(log.data) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No activity yet.</Empty>}
      </section>
    </>
  );
}
