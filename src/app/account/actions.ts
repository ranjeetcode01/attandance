"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createSession, hashPassword, homeFor, requireUser, verifyPassword } from "@/lib/auth";

export type PwState = { error?: string };

export async function changePasswordAction(_prev: PwState, form: FormData): Promise<PwState> {
  const me = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next.length < 6) return { error: "New password must be at least 6 characters." };
  if (next !== confirm) return { error: "New passwords do not match." };
  if (next === current) return { error: "New password must be different." };

  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, me.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { error: "Current password is wrong." };

  // Bumping the session version signs the user out on every other device.
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, me.id))
    .returning();
  await createSession(updated);
  await audit(me.id, "password.change", "user", me.id);
  redirect(homeFor(updated.role));
}
