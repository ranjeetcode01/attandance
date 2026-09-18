import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { logoUrl } from "@/lib/brand";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const settings = await getSettings();
  const logo = logoUrl(settings);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10" style={{ "--brand": settings.brandColor } as React.CSSProperties}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo src={logo} alt={settings.companyName} className={logo ? "mb-4 h-20 max-w-full" : "mb-3 h-14"} />
          <h1 className="text-xl font-semibold">{settings.shortName}</h1>
          {!logo && <p className="text-sm text-muted">{settings.companyName}</p>}
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted">Forgot password? Ask your admin to reset it.</p>
      </div>
    </main>
  );
}
