"use server";

import { eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createSession, homeFor, loginFailed, loginSucceeded, loginThrottle, verifyPassword } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const loginId = String(form.get("loginId") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!loginId || !password) return { error: "Enter your ID and password." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}:${loginId.toUpperCase()}`;
  const throttle = loginThrottle(key);
  if (throttle.blocked) return { error: `Too many attempts. Try again in ${throttle.retryInMin} min.` };

  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.empCode, loginId.toUpperCase()), eq(users.mobile, loginId)))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    loginFailed(key);
    return { error: "Wrong ID or password." };
  }
  if (!user.active) return { error: "Your account is disabled. Contact admin." };

  loginSucceeded(key);
  await createSession(user);
  await audit(user.id, "login", "user", user.id, { ip });
  redirect(user.mustChangePassword ? "/account?first=1" : homeFor(user.role));
}
