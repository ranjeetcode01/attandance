import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { labourSheets, punches, requests } from "@/db/schema";
import { AdminNav, type NavItem } from "@/components/admin/nav";
import { MANAGER_ROLES, requireUser } from "@/lib/auth";
import { logoUrl } from "@/lib/brand";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser(MANAGER_ROLES);
  const settings = await getSettings();
  const db = await getDb();
  const [pendingPunches, pendingSheets, pendingRequests] = await Promise.all([
    db.$count(punches, eq(punches.reviewStatus, "pending")),
    db.$count(labourSheets, eq(labourSheets.reviewStatus, "pending")),
    db.$count(requests, eq(requests.status, "pending")),
  ]);

  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard", group: "Today" },
    { href: "/admin/attendance", label: "Daily register", group: "Today" },
    { href: "/admin/review", label: "Review queue", badge: pendingPunches + pendingSheets, group: "Today" },
    { href: "/admin/requests", label: "Requests", badge: pendingRequests, group: "Today" },
    { href: "/admin/labour", label: "Labour sheets", group: "Reports" },
    { href: "/admin/muster", label: "Monthly muster", group: "Reports" },
    { href: "/admin/costing", label: "Project labour cost", group: "Reports" },
    ...(user.role === "admin"
      ? [
          { href: "/admin/projects", label: "Projects & sites", group: "Setup" },
          { href: "/admin/users", label: "Staff & logins", group: "Setup" },
        ]
      : []),
    { href: "/admin/contractors", label: "Contractors & labour", group: "Setup" },
    ...(user.role === "admin"
      ? [
          { href: "/admin/settings", label: "Settings", group: "Setup" },
          { href: "/admin/audit", label: "Audit log", group: "Setup" },
        ]
      : []),
    { href: "/w", label: "Open site app", group: "Field" },
  ];

  return (
    <div style={{ "--brand": settings.brandColor } as React.CSSProperties} className="min-h-dvh">
      <AdminNav items={items} title={settings.shortName} subtitle={settings.companyName} userName={`${user.name} · ${user.role.toUpperCase()}`} logo={logoUrl(settings)} />
      <div className="lg:pl-60">
        {user.mustChangePassword && (
          <a href="/account?first=1" className="block bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden">
            You are using a default password. Change it now →
          </a>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
