"use client";

import { useEffect, useMemo, useState } from "react";
import { ReviewBadge, Flags } from "@/components/ui";
import { freshFix, watchFix, type Fix } from "@/lib/client/geo";
import type { Photo } from "@/lib/client/image";
import { getClock, nextSeq, SESSION_ID, uuid, type OutboxItem } from "@/lib/client/store";
import { enqueue } from "@/lib/client/sync";
import { fenceCheck, fmtDistance, nearestSite } from "@/lib/geo";
import { istDate, istDateTime, istTime, todayIST } from "@/lib/time";
import { CameraSheet } from "./camera";
import type { Boot, Notify } from "./types";

type TimelineEntry = {
  id: string;
  type: "IN" | "OUT";
  siteId: number | null;
  time: number;
  state: "synced" | "queued" | "failed";
  reviewStatus?: string;
  flags?: string[];
  workArea?: string;
  error?: string;
};

export function PunchTab({ boot, outbox, notify, afterQueue }: { boot: Boot; outbox: OutboxItem[]; notify: Notify; afterQueue: () => void }) {
  const { settings, sites, user } = boot;
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [chosenSite, setChosenSite] = useState<number | null>(null);
  const [area, setArea] = useState("");
  const [note, setNote] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      watchFix(
        (f) => {
          setFix(f);
          setGpsError(null);
        },
        setGpsError,
      ),
    [],
  );

  const today = todayIST();
  const timeline = useMemo<TimelineEntry[]>(() => {
    const server: TimelineEntry[] =
      boot.today === today
        ? boot.todayPunches.map((p) => ({ id: p.id, type: p.type, siteId: p.siteId, time: p.punchTime, state: "synced", reviewStatus: p.reviewStatus, flags: p.flags, workArea: p.workArea }))
        : [];
    const known = new Set(server.map((s) => s.id));
    const queued: TimelineEntry[] = outbox
      .filter((i): i is Extract<OutboxItem, { kind: "punch" }> => i.kind === "punch")
      .filter((i) => !known.has(i.id) && istDate(i.payload.deviceTime) === today)
      .map((i) => ({
        id: i.id,
        type: i.payload.type,
        siteId: i.payload.siteId,
        time: i.payload.deviceTime,
        state: i.failed ? "failed" : "queued",
        workArea: i.payload.workArea,
        error: i.lastError,
      }));
    return [...server, ...queued].sort((a, b) => a.time - b.time);
  }, [boot, outbox, today]);

  const counted = timeline.filter((e) => e.state !== "failed" && e.reviewStatus !== "rejected");
  const last = counted[counted.length - 1];
  const nextType: "IN" | "OUT" = last?.type === "IN" ? "OUT" : "IN";
  const openSiteId = nextType === "OUT" ? last?.siteId ?? null : null;

  const nearest = fix ? nearestSite(sites, fix.lat, fix.lng) : null;
  const siteId = chosenSite ?? openSiteId ?? nearest?.site.id ?? sites[0]?.id ?? null;
  const site = sites.find((s) => s.id === siteId) ?? null;
  const fence = site && fix ? fenceCheck(site, fix.lat, fix.lng, fix.accuracy, settings.accuracyToleranceM) : null;
  const blockMode = settings.fenceMode === "block";

  let blockReason: string | null = null;
  if (!site) blockReason = "No site is assigned to you. Contact your manager.";
  else if (blockMode && !fix) blockReason = gpsError ?? "Waiting for GPS…";
  else if (blockMode && fence && !fence.inside) blockReason = `You are ${fmtDistance(fence.distanceM)} from ${site.name}. Go inside the site boundary (${site.radiusM} m).`;

  function watermark() {
    return [
      `${user.name} (${user.empCode})`,
      `${nextType} · ${site?.projectName ?? ""} / ${site?.name ?? ""}${area ? ` · ${area}` : ""}`,
      `${istDateTime(Date.now())} IST`,
      fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} ±${Math.round(fix.accuracy)}m` : "GPS not available",
    ];
  }

  function start() {
    if (blockReason) return notify(blockReason, "warn");
    if (settings.requireSelfie) setCamera(true);
    else void submit(null);
  }

  async function submit(photo: Photo | null) {
    if (!site) return;
    setCamera(false);
    setBusy(true);
    try {
      let f: Fix | null = null;
      try {
        f = await freshFix();
      } catch (e) {
        if (blockMode) return notify((e as Error).message, "error");
      }
      if (blockMode && f && !fenceCheck(site, f.lat, f.lng, f.accuracy, settings.accuracyToleranceM).inside) {
        return notify(`Outside ${site.name} boundary. Punch not saved.`, "error");
      }
      const clock = await getClock();
      const type = nextType;
      await enqueue(
        {
          id: uuid(),
          kind: "punch",
          payload: {
            type,
            siteId: site.id,
            workArea: area,
            note: note.trim(),
            lat: f?.lat ?? null,
            lng: f?.lng ?? null,
            accuracy: f ? Math.round(f.accuracy) : null,
            gpsTime: f?.time ?? null,
            deviceTime: Date.now(),
            seq: await nextSeq(),
            sessionId: SESSION_ID,
            perfNow: performance.now(),
            lastSync: clock ?? null,
            selfie: photo?.dataUrl ?? null,
            selfieRawHash: photo?.rawHash ?? null,
          },
        },
        `Punch ${type} · ${site.name}`,
      );
      setNote("");
      notify(navigator.onLine ? `${type} saved ✓ Sending…` : `${type} saved on phone ✓ Will sync when network returns.`, "ok");
      afterQueue();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-muted">Your location</div>
            {fix ? (
              fence && site ? (
                <div className={`mt-0.5 font-semibold ${fence.inside ? "text-emerald-700" : "text-red-700"}`}>
                  {fence.inside ? `Inside ${site.name}` : `Outside ${site.name}`} · {fmtDistance(fence.distanceM)}
                </div>
              ) : (
                <div className="mt-0.5 font-semibold">GPS ready</div>
              )
            ) : (
              <div className="mt-0.5 font-semibold text-amber-700">{gpsError ?? "Getting GPS…"}</div>
            )}
            {fix && (
              <div className="text-xs text-muted">
                Accuracy ±{Math.round(fix.accuracy)} m{fix.accuracy > settings.maxAccuracyM ? " — weak, move to open area" : ""}
              </div>
            )}
          </div>
          <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${!fix ? "animate-pulse bg-amber-400" : fence?.inside ? "bg-emerald-500" : "bg-red-500"}`} />
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="label">Site</label>
            <select className="input py-2.5 text-base" value={siteId ?? ""} onChange={(e) => setChosenSite(Number(e.target.value))} disabled={nextType === "OUT" && openSiteId != null}>
              {sites.map((s) => {
                const d = fix ? fenceCheck(s, fix.lat, fix.lng, fix.accuracy, settings.accuracyToleranceM) : null;
                return (
                  <option key={s.id} value={s.id}>
                    {s.projectName} · {s.name}
                    {d ? ` (${fmtDistance(d.distanceM)}${d.inside ? " ✓" : ""})` : ""}
                  </option>
                );
              })}
            </select>
            {nextType === "OUT" && openSiteId != null && <p className="mt-1 text-xs text-muted">Punch OUT here first to switch site.</p>}
          </div>

          {site && site.areas.length > 0 && (
            <div>
              <label className="label">Working at (tower / floor)</label>
              <div className="flex flex-wrap gap-1.5">
                {site.areas.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setArea(area === a ? "" : a)}
                    className={`rounded-full border px-3 py-1 text-sm ${area === a ? "border-brand bg-brand text-white" : "border-line bg-white text-ink"}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <input className="input" placeholder={nextType === "IN" ? "Today's plan (optional)" : "Work done today (optional)"} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>

        <button
          onClick={start}
          disabled={busy || !site}
          className={`mt-4 flex w-full flex-col items-center rounded-2xl py-5 text-white shadow-md transition active:scale-[0.99] disabled:opacity-50 ${
            blockReason ? "bg-slate-400" : nextType === "IN" ? "bg-emerald-600" : "bg-brand"
          }`}
        >
          <span className="text-2xl font-bold">{busy ? "Saving…" : `Punch ${nextType}`}</span>
          <span className="text-sm opacity-90">{nextType === "IN" ? "हाज़िरी लगाएँ" : "काम ख़त्म — OUT"}</span>
        </button>
        {blockReason && <p className="mt-2 text-center text-sm text-red-700">{blockReason}</p>}
        {site && (
          <p className="mt-2 text-center text-xs text-muted">
            Shift {site.shiftStart}–{site.shiftEnd} · {settings.requireSelfie ? "Selfie required" : "No selfie needed"}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Today</h2>
        {timeline.length === 0 && <p className="text-sm text-muted">No punch yet today.</p>}
        <ol className="space-y-2">
          {timeline.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className={`mt-0.5 w-11 shrink-0 rounded-md py-0.5 text-center text-xs font-bold text-white ${e.type === "IN" ? "bg-emerald-600" : "bg-slate-700"}`}>{e.type}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{istTime(e.time)}</span>
                  <span className="text-muted">
                    {sites.find((s) => s.id === e.siteId)?.name ?? ""}
                    {e.workArea ? ` · ${e.workArea}` : ""}
                  </span>
                  {e.state === "queued" && <span className="badge bg-amber-100 text-amber-800">Waiting to sync</span>}
                  {e.state === "failed" && <span className="badge bg-red-100 text-red-700">Not accepted</span>}
                  {e.state === "synced" && e.reviewStatus && <ReviewBadge status={e.reviewStatus} />}
                </div>
                {e.flags && <Flags flags={e.flags} hideInfo />}
                {e.error && <p className="text-xs text-red-700">{e.error}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {camera && (
        <CameraSheet title={`Selfie for ${nextType}`} facing="user" watermark={watermark} maxSide={480} onCapture={(p) => void submit(p)} onClose={() => setCamera(false)} />
      )}
    </div>
  );
}
