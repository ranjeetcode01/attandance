"use client";

import { useEffect, useState } from "react";
import { Flags, ReviewBadge } from "@/components/ui";
import { doneAll, getClock, getDeviceId, onStoreChange, outboxDelete, type ClockSample, type DoneItem, type OutboxItem } from "@/lib/client/store";
import { retryFailed } from "@/lib/client/sync";
import { istDateTime } from "@/lib/time";

export function SyncTab({ outbox, online, syncing, lastSync, onSync }: { outbox: OutboxItem[]; online: boolean; syncing: boolean; lastSync: number | null; onSync: () => void }) {
  const [done, setDone] = useState<DoneItem[]>([]);
  const [device, setDevice] = useState<{ id: string; clock?: ClockSample } | null>(null);

  useEffect(() => {
    const load = () => {
      doneAll().then(setDone);
      Promise.all([getDeviceId(), getClock()]).then(([id, clock]) => setDevice({ id, clock }));
    };
    load();
    return onStoreChange(load);
  }, []);

  const pending = outbox.filter((i) => !i.failed);
  const failed = outbox.filter((i) => i.failed);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={`font-semibold ${online ? "text-emerald-700" : "text-amber-700"}`}>{online ? "Online" : "Offline — data is safe on this phone"}</div>
            <div className="text-xs text-muted">Last sync: {lastSync ? istDateTime(lastSync) : "never"}</div>
          </div>
          <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Punches are saved on the phone first and sent automatically when network is available. Do not clear browser data or uninstall the app while items are waiting.
        </p>
      </section>

      <section className="card divide-y divide-line">
        <h2 className="px-4 py-3 text-sm font-semibold">Waiting to send ({pending.length})</h2>
        {pending.map((i) => (
          <div key={i.id} className="px-4 py-2.5 text-sm">
            <div className="font-medium">{i.label}</div>
            <div className="text-xs text-muted">
              Saved {istDateTime(i.createdAt)}
              {i.attempts > 0 && ` · ${i.attempts} tries`}
              {i.lastError && <span className="text-red-700"> · {i.lastError}</span>}
            </div>
          </div>
        ))}
        {!pending.length && <p className="px-4 py-3 text-sm text-muted">Nothing pending. All data sent ✓</p>}
      </section>

      {failed.length > 0 && (
        <section className="card divide-y divide-line border-red-200">
          <h2 className="px-4 py-3 text-sm font-semibold text-red-700">Not accepted by server ({failed.length})</h2>
          {failed.map((i) => (
            <div key={i.id} className="px-4 py-2.5 text-sm">
              <div className="font-medium">{i.label}</div>
              <div className="text-xs text-red-700">{i.lastError}</div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => retryFailed(i.id).then(onSync)}>
                  Try again
                </button>
                <button
                  className="btn btn-ghost btn-sm text-red-700"
                  onClick={() => {
                    if (confirm("Delete this record from the phone? It will not be sent.")) void outboxDelete(i.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card divide-y divide-line">
        <h2 className="px-4 py-3 text-sm font-semibold">Recently sent</h2>
        {done.slice(0, 20).map((d) => (
          <div key={d.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{d.label}</span>
              {d.kind !== "request" && <ReviewBadge status={d.status} />}
            </div>
            <div className="text-xs text-muted">
              {d.message} · saved {istDateTime(d.createdAt)} · sent {istDateTime(d.syncedAt)}
            </div>
            <Flags flags={d.flags} hideInfo />
          </div>
        ))}
        {!done.length && <p className="px-4 py-3 text-sm text-muted">No history on this phone yet.</p>}
      </section>

      {device && (
        <p className="text-center text-[11px] text-muted">
          Device {device.id.slice(0, 8)}
          {device.clock && ` · clock offset ${Math.round((device.clock.serverTime - device.clock.deviceTime) / 1000)}s`}
        </p>
      )}
    </div>
  );
}
