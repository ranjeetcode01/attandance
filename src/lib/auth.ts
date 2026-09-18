import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { users, type Role } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session-token";

export type CurrentUser = {
  id: number;
  empCode: string;
  name: string;
  role: Role;
  designation: string;
  mustChangePassword: boolean;
  sessionIssuedAt: number;
};

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export async function createSession(user: { id: number; sessionVersion: number; role: Role }) {
  const token = await signSession({ uid: user.id, sv: user.sessionVersion, role: user.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, session.uid)).limit(1);
  if (!u || !u.active || u.sessionVersion !== session.sv) return null;
  return {
    id: u.id,
    empCode: u.empCode,
    name: u.name,
    role: u.role,
    designation: u.designation,
    mustChangePassword: u.mustChangePassword,
    sessionIssuedAt: (session.iat ?? 0) * 1000,
  };
});

export const MANAGER_ROLES: Role[] = ["admin", "pm"];
export const FIELD_MANAGER_ROLES: Role[] = ["admin", "pm", "supervisor"];

export function homeFor(role: Role) {
  return MANAGER_ROLES.includes(role) ? "/admin" : "/w";
}

// For pages and server actions.
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

// For route handlers: returns null instead of redirecting.
export async function apiUser(roles?: Role[]): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  return user;
}

// Keeps field users signed in: re-issue the 30-day cookie once it is a week old.
export async function refreshSessionIfOld(user: CurrentUser) {
  if (Date.now() - user.sessionIssuedAt < 7 * 24 * 3600_000) return;
  const db = await getDb();
  const [u] = await db.select({ id: users.id, sessionVersion: users.sessionVersion, role: users.role }).from(users).where(eq(users.id, user.id));
  if (u) await createSession(u);
}

// Simple in-memory login throttle (single server install).
const attempts = new Map<string, { count: number; until: number }>();
export function loginThrottle(key: string) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.until > now && rec.count >= 5) {
    return { blocked: true, retryInMin: Math.ceil((rec.until - now) / 60_000) };
  }
  return { blocked: false, retryInMin: 0 };
}
export function loginFailed(key: string) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.until < now) attempts.set(key, { count: 1, until: now + 10 * 60_000 });
  else rec.count += 1;
  if (attempts.size > 5000) attempts.clear();
}
export function loginSucceeded(key: string) {
  attempts.delete(key);
}
