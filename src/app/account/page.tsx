import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "@/lib/defaults";
import { homeFor, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser();
  const settings = await getSettings();
  const first = (await searchParams).first === "1" || user.mustChangePassword;

  return (
    <main className="mx-auto max-w-md px-4 py-10" style={{ "--brand": settings.brandColor } as React.CSSProperties}>
      <Link href={homeFor(user.role)} className="text-sm text-muted hover:text-ink">
        ← Back
      </Link>
      <div className="card mt-3 p-6">
        <h1 className="text-lg font-semibold">{user.name}</h1>
        <p className="text-sm text-muted">
          {user.empCode} · {ROLE_LABELS[user.role]} {user.designation && `· ${user.designation}`}
        </p>
        {first && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Please set a new password before continuing.
          </p>
        )}
        <h2 className="mt-6 mb-3 text-sm font-semibold">Change password</h2>
        <PasswordForm />
        <form action="/api/auth/logout" method="post" className="mt-6 border-t border-line pt-4">
          <button className="btn btn-secondary w-full">Log out</button>
        </form>
      </div>
    </main>
  );
}
