"use client";

import { useEffect, useMemo, useState } from "react";
import { freshFix, watchFix, type Fix } from "@/lib/client/geo";
import type { Photo } from "@/lib/client/image";
import { getClock, kvGet, kvSet, uuid, type OutboxItem } from "@/lib/client/store";
import { enqueue } from "@/lib/client/sync";
import { fenceCheck, fmtDistance, nearestSite } from "@/lib/geo";
import { addDays, fmtDate, istDateTime, todayIST } from "@/lib/time";
import { CameraSheet } from "./camera";
import type { Boot, Notify } from "./types";

type Mark = { status: "P" | "H" | "A"; ot: number };
type Headcount = { key: string; trade: string; count: number; rate: number; ot: number };
type Draft = { marks: Record<number, Mark>; headcount: Headcount[]; ppe: boolean; toolbox: boolean; note: string };

const STATUS_NEXT: Record<Mark["status"], Mark["status"]> = { P: "H", H: "A", A: "P" };
const STATUS_STYLE: Record<Mark["status"], string> = {
  P: "bg-emerald-600 text-white",
  H: "bg-amber-500 text-white",
  A: "bg-red-600 text-white",
};
const OT_STEPS = [0, 1, 2, 3, 4];
const NO_LABOUR: Boot["crew"][number]["labour"] = [];

export function LabourTab({ boot, outbox, notify, afterQueue }: { boot: Boot; outbox: OutboxItem[]; notify: Notify; afterQueue: () => void }) {
  const { sites, crew, settings } = boot;
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [chosenSite, setChosenSite] = useState<number | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [contractorId, setContractorId] = useState<number | null>(crew[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft>({ marks: {}, headcount: [], ppe: false, toolbox: false, note: "" });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchFix(setFix, () => {}), []);

  // Until the supervisor picks one, use the site they are standing in (or nearest).
  const nearest = fix ? nearestSite(sites, fix.lat, fix.lng) : null;
  const siteId = chosenSite ?? nearest?.site.id ?? sites[0]?.id ?? null;
  const site = sites.find((s) => s.id === siteId) ?? null;
  const fence = site && fix ? fenceCheck(site, fix.lat, fix.lng, fix.accuracy, settings.accuracyToleranceM) : null;
  const contractor = crew.find((c) => c.id === contractorId) ?? null;
  const draftKey = `labourDraft:${date}:${siteId}:${contractorId}`;

  // Restore any unsent draft for this date/site/contractor.
  useEffect(() => {
    let alive = true;
    kvGet<Draft>(draftKey).then((d) => {
      if (!alive) return;
      setDraft(d ?? { marks: {}, headcount: [], ppe: false, toolbox: false, note: "" });
      setPhoto(null);
      setLoadedKey(draftKey);
    });
    return () => {
      alive = false;
    };
  }, [draftKey]);

  useEffect(() => {
    if (loadedKey === draftKey) void kvSet(draftKey, draft);
  }, [draft, draftKey, loadedKey]);

  const labour = contractor?.labour ?? NO_LABOUR;
  const markOf = (id: number): Mark => draft.marks[id] ?? { status: "P", ot: 0 };
  const setMark = (id: number, m: Mark) => setDraft((d) => ({ ...d, marks: { ...d.marks, [id]: m } }));

  const totals = useMemo(() => {
    let p = 0, h = 0, a = 0, cost = 0;
    for (const l of labour) {
      const m = draft.marks[l.id] ?? { status: "P", ot: 0 };
      if (m.status === "P") p++;
      else if (m.status === "H") h++;
      else a++;
      cost += (m.status === "P" ? 1 : m.status === "H" ? 0.5 : 0) * l.dailyWage;
    }
    const extra = draft.headcount.reduce((s, x) => s + x.count, 0);
    cost += draft.headcount.reduce((s, x) => s + x.count * x.rate, 0);
    return { p, h, a, extra, cost };
  }, [labour, draft]);

  const already = boot.today === today && date === today ? boot.labourToday.find((x) => x.siteId === siteId && x.contractorId === contractorId) : undefined;
  const queued = outbox.some((i) => i.kind === "labour" && i.payload.date === date && i.payload.siteId === siteId && i.payload.contractorId === contractorId);

  const visible = labour.filter((l) => !search || `${l.name} ${l.trade}`.toLowerCase().includes(search.toLowerCase()));

  function setAll(status: Mark["status"]) {
    setDraft((d) => ({ ...d, marks: Object.fromEntries(labour.map((l) => [l.id, { status, ot: status === "A" ? 0 : (d.marks[l.id]?.ot ?? 0) }])) }));
  }

  async function submit() {
    if (!site || !contractor) return;
    if (labour.length === 0 && draft.headcount.length === 0) return notify("Add at least one labourer or headcount row.", "warn");
    setBusy(true);
    try {
      let f: Fix | null = null;
      try {
        f = await freshFix();
      } catch (e) {
        if (settings.fenceMode === "block") return notify((e as Error).message, "error");
      }
      if (settings.fenceMode === "block" && f) {
        const fc = fenceCheck(site, f.lat, f.lng, f.accuracy, settings.accuracyToleranceM);
        if (!fc.inside) return notify(`You are ${fmtDistance(fc.distanceM)} from ${site.name}. Mark labour from inside the site.`, "error");
      }
      await enqueue(
        {
          id: uuid(),
          kind: "labour",
          payload: {
            date,
            siteId: site.id,
            contractorId: contractor.id,
            entries: labour.map((l) => {
              const m = markOf(l.id);
              return { labourerId: l.id, status: m.status, otHours: m.status === "A" ? 0 : m.ot };
            }),
            headcount: draft.headcount.filter((h) => h.count > 0 && h.trade).map((h) => ({ trade: h.trade, count: h.count, rate: h.rate, otHours: h.ot })),
            photo: photo?.dataUrl ?? null,
            ppeChecked: draft.ppe,
            toolboxTalk: draft.toolbox,
            note: draft.note.trim(),
            lat: f?.lat ?? null,
            lng: f?.lng ?? null,
            accuracy: f ? Math.round(f.accuracy) : null,
            deviceTime: Date.now(),
            lastSync: (await getClock()) ?? null,
          },
        },
        `Labour · ${contractor.firmName || contractor.name} · ${site.name} · ${fmtDate(date)}`,
      );
      await kvSet(draftKey, null);
      setDraft({ marks: {}, headcount: [], ppe: false, toolbox: false, note: "" });
      setPhoto(null);
      notify(`Labour sheet saved ✓ (${totals.p + totals.h + totals.extra} present)`, "ok");
      afterQueue();
    } finally {
      setBusy(false);
    }
  }

  if (!crew.length) return <p className="card p-4 text-sm text-muted">No contractors added yet. Ask admin to add contractors and labour.</p>;
  if (!sites.length) return <p className="card p-4 text-sm text-muted">No site assigned to you.</p>;

  return (
    <div className="space-y-4 pb-28">
      <section className="card grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2 flex gap-2">
          {[today, addDays(today, -1)].map((d) => (
            <button key={d} onClick={() => setDate(d)} className={`btn flex-1 ${date === d ? "btn-primary" : "btn-secondary"}`}>
              {d === today ? "Today" : "Yesterday"} · {fmtDate(d).slice(0, 5)}
            </button>
          ))}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Site</label>
          <select className="input py-2.5" value={siteId ?? ""} onChange={(e) => setChosenSite(Number(e.target.value))}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.projectName} · {s.name}
              </option>
            ))}
          </select>
          <p className={`mt-1 text-xs ${!fence ? "text-muted" : fence.inside ? "text-emerald-700" : "text-red-700"}`}>
            {!fence ? "Getting GPS…" : `${fence.inside ? "Inside" : "Outside"} · ${fmtDistance(fence.distanceM)} from centre`}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Contractor</label>
          <select className="input py-2.5" value={contractorId ?? ""} onChange={(e) => setContractorId(Number(e.target.value))}>
            {crew.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firmName || c.name} ({c.labour.length})
              </option>
            ))}
          </select>
        </div>
        {(already || queued) && (
          <p className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {queued ? "A sheet for this contractor is waiting to sync." : `Already marked today (${already!.present} present).`} Submitting again will replace it.
          </p>
        )}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="input flex-1" placeholder="Search name / trade" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex gap-1">
            <button className="btn btn-secondary btn-sm" onClick={() => setAll("P")}>All P</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAll("A")}>All A</button>
          </div>
        </div>
        <p className="mb-2 text-xs text-muted">Tap status to change: P → H (half) → A. Tap OT to add overtime hours.</p>
        <ul className="divide-y divide-line">
          {visible.map((l) => {
            const m = markOf(l.id);
            return (
              <li key={l.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.name}</div>
                  <div className="text-xs text-muted">{l.trade}</div>
                </div>
                <button
                  className={`h-9 rounded-lg border px-2 text-xs ${m.ot ? "border-sky-600 bg-sky-50 text-sky-800" : "border-line text-muted"}`}
                  disabled={m.status === "A"}
                  onClick={() => setMark(l.id, { ...m, ot: OT_STEPS[(OT_STEPS.indexOf(m.ot) + 1) % OT_STEPS.length] })}
                >
                  OT {m.ot ? `${m.ot}h` : "—"}
                </button>
                <button className={`h-9 w-11 rounded-lg text-sm font-bold ${STATUS_STYLE[m.status]}`} onClick={() => setMark(l.id, { status: STATUS_NEXT[m.status], ot: STATUS_NEXT[m.status] === "A" ? 0 : m.ot })}>
                  {m.status}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="py-3 text-sm text-muted">No labour found for this contractor.</li>}
        </ul>
      </section>

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Extra headcount (not registered)</h3>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setDraft((d) => ({ ...d, headcount: [...d.headcount, { key: uuid(), trade: settings.trades[0] ?? "Helper", count: 1, rate: 600, ot: 0 }] }))}
          >
            + Add
          </button>
        </div>
        {draft.headcount.length === 0 && <p className="text-xs text-muted">Use this when the contractor brings extra workers who are not in the list.</p>}
        <div className="space-y-2">
          {draft.headcount.map((h, i) => {
            const update = (patch: Partial<Headcount>) => setDraft((d) => ({ ...d, headcount: d.headcount.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
            return (
              <div key={h.key} className="grid grid-cols-[1fr_4rem_5rem_auto] items-end gap-2">
                <div>
                  <label className="label">Trade</label>
                  <select className="input" value={h.trade} onChange={(e) => update({ trade: e.target.value })}>
                    {settings.trades.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Count</label>
                  <input className="input" type="number" inputMode="numeric" min={1} max={500} value={h.count} onChange={(e) => update({ count: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} />
                </div>
                <div>
                  <label className="label">Rate ₹</label>
                  <input className="input" type="number" inputMode="numeric" min={0} value={h.rate} onChange={(e) => update({ rate: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
                <button className="btn btn-ghost btn-sm mb-1" onClick={() => setDraft((d) => ({ ...d, headcount: d.headcount.filter((_, j) => j !== i) }))}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="text-sm font-semibold">Safety & proof</h3>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={draft.ppe} onChange={(e) => setDraft((d) => ({ ...d, ppe: e.target.checked }))} />
          PPE checked (helmet, shoes, harness)
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={draft.toolbox} onChange={(e) => setDraft((d) => ({ ...d, toolbox: e.target.checked }))} />
          Toolbox talk done
        </label>
        <input className="input" placeholder="Note (optional)" maxLength={500} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        <div className="flex items-center gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.dataUrl} alt="Group" className="h-16 w-24 rounded-lg object-cover" />
          ) : (
            <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-slate-100 text-xs text-muted">No photo</div>
          )}
          <button className="btn btn-secondary" onClick={() => setCamera(true)}>
            {photo ? "Retake group photo" : "Take group photo"}
          </button>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg px-3">
        <div className="card flex items-center gap-3 p-3 shadow-lg">
          <div className="flex-1 text-xs leading-5">
            <span className="font-semibold text-emerald-700">P {totals.p}</span> · <span className="font-semibold text-amber-600">H {totals.h}</span> ·{" "}
            <span className="font-semibold text-red-600">A {totals.a}</span>
            {totals.extra > 0 && <> · +{totals.extra}</>}
            <div className="text-muted">Wages ≈ ₹{Math.round(totals.cost).toLocaleString("en-IN")}</div>
          </div>
          <button className="btn btn-primary px-5 py-3" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : "Submit sheet"}
          </button>
        </div>
      </div>

      {camera && site && contractor && (
        <CameraSheet
          title="Group photo"
          facing="environment"
          maxSide={800}
          watermark={() => [`${contractor.firmName || contractor.name} · ${site.projectName} / ${site.name}`, `${istDateTime(Date.now())} IST · by ${boot.user.name}`]}
          onCapture={(p) => {
            setPhoto(p);
            setCamera(false);
          }}
          onClose={() => setCamera(false)}
        />
      )}
    </div>
  );
}
