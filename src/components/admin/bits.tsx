import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export async function Flash({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  if (!ok && !err) return null;
  return <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${err ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{err ?? ok}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function ExportLink({ href, children = "Export Excel" }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} className="btn btn-secondary">
      {children}
    </a>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-2 inline-block text-sm text-muted hover:text-ink">
      ← {children}
    </Link>
  );
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
export const intParam = (v: string | string[] | undefined) => {
  const s = param(v);
  return s && /^\d+$/.test(s) ? Number(s) : undefined;
};
