"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand";
import { kvGet, kvSet, onStoreChange, outboxAll, saveClock, type OutboxItem } from "@/lib/client/store";
import { syncNow } from "@/lib/client/sync";
import { HistoryTab } from "./history-tab";
import { LabourTab } from "./labour-tab";
import { PunchTab } from "./punch-tab";
import { RequestsTab } from "./requests-tab";
import { SyncTab } from "./sync-tab";
import type { Boot, Notify } from "./types";

type Tab = "punch" | "labour" | "history" | "requests" | "sync";
type Toast = { id: number; text: string; tone: "ok" | "warn" | "error" };
type InstallEvent = Event & { prompt: () => Promise<void> };

const TONE: Record<Toast["tone"], string> = {
  ok: "bg-emerald-700",
  warn: "bg-amber-600",
  error: "bg-red-700",
};

export function WorkerApp() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootState, setBootState] = useState<"loading" | "ready" | "offline-empty">("loading");
  const [tab, setTab] = useState<Tab>("punch");
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const bootLoadedAt = useRef(0);
  const router = useRouter();

  const notify: Notify = useCallback((text, tone = "ok") => {
    const id = Date.now();
    setToast({ id, text, tone });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4500);
  }, []);

  const loadBoot = useCallback(async () => {
    try {
      const res = await fetch("/api/w/bootstrap", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Boot;
      await kvSet("boot", data);
      await saveClock(data.serverTime);
      bootLoadedAt.current = Date.now();
      setBoot(data);
      setBootState("ready");
      setOnline(true);
    } catch {
      setOnline(false);
      setBootState((s) => (s === "loading" ? "offline-empty" : s));
    }
  }, [router]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await syncNow();
      setOnline(!r.offline);
      if (!r.offline) {
        const now = Date.now();
        setLastSync(now);
        void kvSet("lastSync", now);
      }
      if (r.authRequired) notify("Session expired. Log in again — your saved punches are safe.", "error");
      const review = r.results.find((x) => x.status === "pending");
      if (review) notify(review.message, "warn");
      else if (r.failed) notify("Some records were not accepted. See Sync tab.", "error");
      else if (r.sent) notify(`${r.sent} record${r.sent > 1 ? "s" : ""} synced ✓`, "ok");
      if (r.sent > 0) await loadBoot();
    } finally {
      setSyncing(false);
    }
  }, [loadBoot, notify]);

  // Initial load: cached data first so the app opens instantly offline.
  useEffect(() => {
    kvGet<Boot>("boot")
      .then((cached) => {
        if (cached) {
          setBoot((b) => b ?? cached);
          setBootState((s) => (s === "loading" ? "ready" : s));
        }
        return loadBoot();
      })
      .then(runSync);
    kvGet<number>("lastSync").then((v) => v && setLastSync(v));

    const refreshOutbox = () => outboxAll().then(setOutbox);
    refreshOutbox();
    const unsub = onStoreChange(refreshOutbox);

    const goOnline = () => {
      setOnline(true);
      void runSync();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void runSync();
      if (Date.now() - bootLoadedAt.current > 5 * 60_000) void loadBoot();
    };
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeinstallprompt", onInstall);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        outboxAll().then((items) => {
          if (items.some((i) => !i.failed)) void runSync();
        });
      }
    }, 60_000);

    registerServiceWorker(() => {
      refreshOutbox();
      void loadBoot();
    });

    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [loadBoot, runSync]);

  const afterQueue = useCallback(() => void runSync(), [runSync]);

  if (!boot) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        {bootState === "offline-empty" ? (
          <>
            <p className="font-semibold">No internet</p>
            <p className="text-sm text-muted">Open the app once with internet so it can save your sites on this phone. After that it works offline.</p>
            <button className="btn btn-primary" onClick={() => void loadBoot()}>
              Try again
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </div>
    );
  }

  const isFieldManager = ["admin", "pm", "supervisor"].includes(boot.user.role);
  const headerLogo = boot.settings.logoCompactUrl ?? boot.settings.logoUrl ?? null;
  const pendingCount = outbox.filter((i) => !i.failed).length;
  const failedCount = outbox.filter((i) => i.failed).length;
  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "punch", label: "Punch", icon: <IconPin /> },
    ...(isFieldManager ? [{ key: "labour" as const, label: "Labour", icon: <IconUsers /> }] : []),
    { key: "history", label: "History", icon: <IconCalendar /> },
    { key: "requests", label: "Requests", icon: <IconNote /> },
    { key: "sync", label: "Sync", icon: <IconSync />, badge: pendingCount + failedCount },
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24" style={{ "--brand": boot.settings.brandColor } as React.CSSProperties}>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <div className="flex items-center gap-3">
          {/* Compact mark with a hard width cap so the user's name always has room. */}
          <BrandLogo src={headerLogo} alt={boot.settings.companyName} className={headerLogo ? "h-7 max-w-[4.5rem] object-left" : "h-8"} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{boot.user.name}</div>
            <div className="truncate text-xs text-muted">
              {boot.user.empCode} · {boot.settings.shortName}
            </div>
          </div>
          <button
            onClick={() => setTab("sync")}
            aria-label={`${online ? "Online" : "Offline"}${pendingCount ? `, ${pendingCount} waiting to sync` : ""}`}
            className={`badge shrink-0 ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}
          >
            <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
            {/* On very narrow phones only the coloured dot and the count are shown. */}
            <span className="max-[399px]:hidden">{online ? "Online" : "Offline"}</span>
            {pendingCount > 0 && (
              <span>
                <span className="max-[399px]:hidden"> · </span>
                {pendingCount}
                <span className="max-[399px]:hidden"> pending</span>
              </span>
            )}
          </button>
          {["admin", "pm"].includes(boot.user.role) ? (
            <Link href="/admin" className="btn btn-ghost btn-sm shrink-0">
              Admin
            </Link>
          ) : (
            <Link href="/account" className="btn btn-ghost btn-sm shrink-0" aria-label="Account">
              <IconUser />
            </Link>
          )}
        </div>
        {install && (
          <button
            className="btn btn-secondary btn-sm mt-2 w-full"
            onClick={async () => {
              await install.prompt();
              setInstall(null);
            }}
          >
            Install app on this phone
          </button>
        )}
      </header>

      {boot.user.mustChangePassword && (
        <Link href="/account?first=1" className="mx-3 mt-3 block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Please change your password →
        </Link>
      )}

      <main className="p-3">
        {tab === "punch" && <PunchTab boot={boot} outbox={outbox} notify={notify} afterQueue={afterQueue} />}
        {tab === "labour" && isFieldManager && <LabourTab boot={boot} outbox={outbox} notify={notify} afterQueue={afterQueue} />}
        {tab === "history" && <HistoryTab boot={boot} />}
        {tab === "requests" && <RequestsTab boot={boot} outbox={outbox} notify={notify} afterQueue={afterQueue} />}
        {tab === "sync" && <SyncTab outbox={outbox} online={online} syncing={syncing} lastSync={lastSync} onSync={() => void runSync()} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${tab === t.key ? "text-brand" : "text-muted"}`}>
              {t.icon}
              {t.label}
              {!!t.badge && <span className="absolute top-1.5 right-[calc(50%-1.25rem)] min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{t.badge}</span>}
            </button>
          ))}
        </div>
      </nav>

      {toast && (
        <div className="fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 mx-auto max-w-md" role="status">
          <div className={`rounded-xl px-4 py-3 text-sm text-white shadow-lg ${TONE[toast.tone]}`} onClick={() => setToast(null)}>
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

function registerServiceWorker(onSynced: () => void) {
  if (!("serviceWorker" in navigator)) return;
  const enabled = process.env.NODE_ENV === "production" || localStorage.getItem("enable-sw") === "1";
  if (!enabled) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    return;
  }
  // Ask the service worker to cache everything this page loaded so it opens without network next time.
  const sendCacheList = (worker: ServiceWorker | null | undefined) => {
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && (u.includes("/_next/static/") || u.includes("/icons/") || u.includes("/brand/")));
    worker?.postMessage({ type: "CACHE_URLS", urls: [location.pathname, ...urls] });
  };
  // After an app update the new worker takes over a moment later; send it the list too,
  // otherwise it starts with an empty cache.
  navigator.serviceWorker.addEventListener("controllerchange", () => sendCacheList(navigator.serviceWorker.controller));
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then(async () => {
      const reg = await navigator.serviceWorker.ready;
      sendCacheList(navigator.serviceWorker.controller ?? reg.active);
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "SYNCED") onSynced();
  });
}

const iconProps = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IconPin = () => (
  <svg {...iconProps}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
const IconUsers = () => (
  <svg {...iconProps}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
  </svg>
);
const IconCalendar = () => (
  <svg {...iconProps}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const IconNote = () => (
  <svg {...iconProps}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h5" />
  </svg>
);
const IconSync = () => (
  <svg {...iconProps}>
    <path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9" />
    <path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" />
  </svg>
);
const IconUser = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
