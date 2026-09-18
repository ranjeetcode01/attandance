"use client";

import { useState } from "react";
import { uuid, type OutboxItem } from "@/lib/client/store";
import { enqueue } from "@/lib/client/sync";
import { addDays, fmtDate, todayIST } from "@/lib/time";
import type { Boot, Notify } from "./types";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

export function RequestsTab({ boot, outbox, notify, afterQueue }: { boot: Boot; outbox: OutboxItem[]; notify: Notify; afterQueue: () => void }) {
  const today = todayIST();
  const [kind, setKind] = useState<"regularization" | "leave">("regularization");
  const [date, setDate] = useState(addDays(today, -1));
  const [siteId, setSiteId] = useState<number>(boot.sites[0]?.id ?? 0);
  const [inTime, setInTime] = useState("09:00");
  const [outTime, setOutTime] = useState("18:00");
  const [fromDate, setFromDate] = useState(addDays(today, 1));
  const [toDate, setToDate] = useState(addDays(today, 1));
  const [leaveType, setLeaveType] = useState("Casual");
  const [reason, setReason] = useState("");

  const queued = outbox.filter((i): i is Extract<OutboxItem, { kind: "request" }> => i.kind === "request");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) return notify("Please write a proper reason.", "warn");
    if (kind === "regularization") {
      if (!siteId) return notify("Select a site.", "warn");
      if (inTime && outTime && outTime <= inTime) return notify("OUT time must be after IN time.", "warn");
      await enqueue(
        { id: uuid(), kind: "request", payload: { kind, date, siteId, inTime, outTime, reason: reason.trim() } },
        `Missed punch request · ${fmtDate(date)}`,
      );
    } else {
      if (toDate < fromDate) return notify("End date is before start date.", "warn");
      await enqueue(
        { id: uuid(), kind: "request", payload: { kind, fromDate, toDate, leaveType, reason: reason.trim() } },
        `Leave request · ${fmtDate(fromDate)} – ${fmtDate(toDate)}`,
      );
    }
    setReason("");
    notify("Request saved ✓", "ok");
    afterQueue();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`btn ${kind === "regularization" ? "btn-primary" : "btn-secondary"}`} onClick={() => setKind("regularization")}>
            Missed punch
          </button>
          <button type="button" className={`btn ${kind === "leave" ? "btn-primary" : "btn-secondary"}`} onClick={() => setKind("leave")}>
            Leave
          </button>
        </div>

        {kind === "regularization" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={date} max={today} min={addDays(today, -31)} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Site</label>
                <select className="input" value={siteId} onChange={(e) => setSiteId(Number(e.target.value))}>
                  {boot.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">IN time (blank if IN was done)</label>
                <input type="time" className="input" value={inTime} onChange={(e) => setInTime(e.target.value)} />
              </div>
              <div>
                <label className="label">OUT time (blank if OUT was done)</label>
                <input type="time" className="input" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="label">Leave type</label>
              <select className="input" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {["Casual", "Sick", "Earned", "Unpaid", "Comp-off"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="label">Reason</label>
          <textarea className="input min-h-20" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <button className="btn btn-primary w-full py-3">Send request</button>
      </form>

      <section className="card divide-y divide-line">
        <h2 className="px-4 py-3 text-sm font-semibold">My requests</h2>
        {queued.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span>{q.label}</span>
            <span className={`badge ${q.failed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{q.failed ? "Not accepted" : "Waiting to sync"}</span>
          </div>
        ))}
        {boot.requests.map((r) => (
          <div key={r.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">
                {r.kind === "leave" ? `${r.leaveType} leave · ${fmtDate(r.fromDate)}${r.toDate !== r.fromDate ? ` – ${fmtDate(r.toDate)}` : ""}` : `Missed punch · ${fmtDate(r.fromDate)} (${r.inTime || "—"} / ${r.outTime || "—"})`}
              </span>
              <span className={`badge ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
            </div>
            <p className="text-xs text-muted">{r.reason}</p>
            {r.reviewNote && <p className="text-xs text-ink">Manager: {r.reviewNote}</p>}
          </div>
        ))}
        {!queued.length && !boot.requests.length && <p className="px-4 py-3 text-sm text-muted">No requests yet.</p>}
      </section>
    </div>
  );
}
