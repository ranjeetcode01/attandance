import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { forceLogout } from "@/app/admin/actions/masters";
import { BackLink, Flash, PageHeader } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { getDb } from "@/db";
import { punches, users, userSites } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadSites } from "@/lib/reports";
import { istDateTime } from "@/lib/time";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  await requireUser(["admin"]);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, Number(id)));
  if (!user) notFound();
  const [links, sites, devices] = await Promise.all([
    db.select().from(userSites).where(eq(userSites.userId, user.id)),
    loadSites(),
    db
      .selectDistinctOn([punches.deviceId], { deviceId: punches.deviceId, at: punches.receivedAt, meta: punches.meta })
      .from(punches)
      .where(eq(punches.userId, user.id))
      .orderBy(punches.deviceId, desc(punches.receivedAt))
      .limit(10),
  ]);

  return (
    <>
      <BackLink href="/admin/users">Staff & logins</BackLink>
      <PageHeader
        title={user.name}
        subtitle={`${user.empCode} · created ${istDateTime(user.createdAt)}`}
        actions={
          <form action={forceLogout}>
            <input type="hidden" name="id" value={user.id} />
            <ConfirmSubmit className="btn btn-secondary" confirmText="Sign this user out on all phones?">
              Sign out all devices
            </ConfirmSubmit>
          </form>
        }
      />
      <Flash searchParams={searchParams} />
      <UserForm user={user} sites={sites} assigned={new Set(links.map((l) => l.siteId))} />

      <section className="card mt-6 p-4">
        <h2 className="mb-2 text-sm font-semibold">Phones used for punching</h2>
        <ul className="space-y-1 text-xs">
          {devices
            .filter((d) => d.deviceId)
            .map((d) => (
              <li key={d.deviceId}>
                <span className="font-mono">{d.deviceId!.slice(0, 8)}</span> · last {istDateTime(d.at)} · <span className="text-muted">{d.meta.userAgent?.slice(0, 90) ?? ""}</span>
              </li>
            ))}
          {!devices.some((d) => d.deviceId) && <li className="text-muted">No app punches yet.</li>}
        </ul>
        <p className="mt-2 text-xs text-muted">Many different phones for one person can mean buddy punching.</p>
      </section>
    </>
  );
}
