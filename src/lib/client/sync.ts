"use client";

import type { SyncItem, SyncResult } from "@/lib/sync-schema";
import { doneAdd, getDeviceId, outboxAll, outboxDelete, outboxPut, saveClock, type OutboxItem } from "./store";

export type SyncOutcome = { sent: number; failed: number; offline: boolean; authRequired: boolean; results: SyncResult[] };

let running: Promise<SyncOutcome> | null = null;

export function syncNow(): Promise<SyncOutcome> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

async function run(): Promise<SyncOutcome> {
  const out: SyncOutcome = { sent: 0, failed: 0, offline: false, authRequired: false, results: [] };
  const deviceId = await getDeviceId();
  const items = (await outboxAll()).filter((i) => !i.failed);

  for (const item of items) {
    const { label, createdAt, attempts, lastError, failed, ...wire } = item;
    void lastError;
    void failed;
    let res: Response;
    try {
      res = await fetch("/api/w/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ deviceId, sentAt: Date.now(), item: wire }),
      });
    } catch {
      out.offline = true;
      break;
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: SyncResult;
      error?: string;
      retry?: boolean;
      auth?: boolean;
      serverTime?: number;
    };
    if (typeof data.serverTime === "number") await saveClock(data.serverTime);

    if (res.ok && data.result) {
      await doneAdd({
        id: item.id,
        kind: item.kind,
        label,
        message: data.result.message,
        status: data.result.status,
        flags: data.result.flags,
        createdAt,
        syncedAt: Date.now(),
      });
      await outboxDelete(item.id);
      out.sent++;
      out.results.push(data.result);
    } else if (res.status === 401) {
      out.authRequired = true;
      break;
    } else if (data.retry === false) {
      await outboxPut({ ...item, attempts: attempts + 1, failed: true, lastError: data.error ?? `Error ${res.status}` });
      out.failed++;
    } else {
      await outboxPut({ ...item, attempts: attempts + 1, lastError: data.error ?? `Error ${res.status}` });
      break;
    }
  }

  if (out.sent === 0 && !out.offline) {
    // Nothing to send: still learn the server clock when possible.
    try {
      const r = await fetch("/api/w/ping", { cache: "no-store" });
      const j = (await r.json()) as { serverTime?: number };
      if (j.serverTime) await saveClock(j.serverTime);
    } catch {
      out.offline = true;
    }
  }
  return out;
}

export async function enqueue(item: SyncItem, label: string) {
  const entry = { ...item, label, createdAt: Date.now(), attempts: 0 } as OutboxItem;
  await outboxPut(entry);
  requestBackgroundSync();
  return entry;
}

export async function retryFailed(id: string) {
  const all = await outboxAll();
  const item = all.find((i) => i.id === id);
  if (item) await outboxPut({ ...item, failed: false, lastError: undefined });
}

function requestBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("outbox-sync"))
    .catch(() => {});
}
