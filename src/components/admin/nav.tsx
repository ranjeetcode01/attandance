"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand";

export type NavItem = { href: string; label: string; badge?: number; group?: string };

export function AdminNav({ items, title, subtitle, userName, logo }: { items: NavItem[]; title: string; subtitle: string; userName: string; logo: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const links = items.map((item, i) => {
    const header = item.group && item.group !== items[i - 1]?.group ? item.group : null;
    return (
      <div key={item.href}>
        {header && <div className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{header}</div>}
        <Link
          href={item.href}
          onClick={() => setOpen(false)}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isActive(item.href) ? "bg-brand text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
        >
          {item.label}
          {!!item.badge && <span className={`rounded-full px-1.5 text-[11px] leading-5 ${isActive(item.href) ? "bg-white text-brand" : "bg-red-600 text-white"}`}>{item.badge}</span>}
        </Link>
      </div>
    );
  });

  // The logo has dark text, so it sits on a white chip against the dark sidebar.
  const brand = (compact: boolean) =>
    logo ? (
      <div className={`flex min-w-0 items-center gap-2.5 px-3 ${compact ? "" : "flex-col items-stretch"}`}>
        <Link href="/admin" className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${compact ? "h-9 max-w-32 px-2" : "h-16 px-3"}`}>
          <BrandLogo src={logo} alt={subtitle} className={compact ? "h-7 max-w-full" : "h-12 max-w-full"} />
        </Link>
        <div className={`min-w-0 truncate text-sm font-semibold text-white ${compact ? "" : "text-center"}`}>{title}</div>
      </div>
    ) : (
      <div className="flex min-w-0 items-center gap-2.5 px-3">
        <BrandLogo src={null} alt="" className="h-8" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          <div className="truncate text-[11px] text-slate-400">{subtitle}</div>
        </div>
      </div>
    );

  const footer = (
    <div className="mt-6 border-t border-white/10 px-3 pt-4 text-sm">
      <div className="mb-2 truncate text-slate-400">{userName}</div>
      <div className="flex gap-2">
        <Link href="/account" className="btn btn-sm flex-1 bg-white/10 text-white hover:bg-white/20">
          Account
        </Link>
        <form action="/api/auth/logout" method="post" className="flex-1">
          <button className="btn btn-sm w-full bg-white/10 text-white hover:bg-white/20">Log out</button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto bg-slate-900 py-4 lg:flex print:hidden">
        {brand(false)}
        <nav className="mt-4 flex-1 space-y-0.5 px-2">{links}</nav>
        {footer}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-3 py-2 lg:hidden print:hidden">
        {brand(true)}
        <button className="btn btn-sm bg-white/10 text-white" onClick={() => setOpen(true)} aria-label="Open menu">
          Menu
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-slate-900 py-4">
            {brand(false)}
            <nav className="mt-4 flex-1 space-y-0.5 px-2">{links}</nav>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
