"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SyncItem } from "@/lib/sync-schema";

// Keep DB_NAME / store names in sync with public/sw.js (background sync).
export const DB_NAME = "site-attendance";
const DB_VERSION = 1;

export type OutboxItem = SyncItem & {
  label: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  failed?: boolean;
};

export type DoneItem = {
  id: string;
  kind: SyncItem["kind"];
  label: string;
  message: string;
  status: string;
  flags: string[];
  createdAt: number;
  syncedAt: number;
};

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  outbox: { key: string; value: OutboxItem; indexes: { byCreated: number } };
  done: { key: string; value: DoneItem; indexes: { bySynced: number } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore("kv");
        d.createObjectStore("outbox", { keyPath: "id" }).createIndex("byCreated", "createdAt");
        d.createObjectStore("done", { keyPath: "id" }).createIndex("bySynced", "syncedAt");
      },
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("kv", key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown) {
  await (await db()).put("kv", value, key);
}

export async function outboxAll(): Promise<OutboxItem[]> {
  return (await db()).getAllFromIndex("outbox", "byCreated");
}

export async function outboxPut(item: OutboxItem) {
  await (await db()).put("outbox", item);
  emitChange();
}

export async function outboxDelete(id: string) {
  await (await db()).delete("outbox", id);
  emitChange();
}

export async function doneAdd(item: DoneItem) {
  const d = await db();
  await d.put("done", item);
  // keep only the latest 60 results
  const keys = await d.getAllKeysFromIndex("done", "bySynced");
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) await d.delete("done", k);
  emitChange();
}

export async function doneAll(): Promise<DoneItem[]> {
  return (await (await db()).getAllFromIndex("done", "bySynced")).reverse();
}

// ---- device identity & clocks ------------------------------------------

export function uuid(): string {
  // randomUUID only exists on HTTPS/localhost; getRandomValues works everywhere.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function getDeviceId(): Promise<string> {
  let id = await kvGet<string>("deviceId");
  if (!id) {
    id = uuid();
    await kvSet("deviceId", id);
  }
  return id;
}

export async function nextSeq(): Promise<number> {
  const d = await db();
  const tx = d.transaction("kv", "readwrite");
  const cur = ((await tx.store.get("seq")) as number | undefined) ?? 0;
  await tx.store.put(cur + 1, "seq");
  await tx.done;
  return cur + 1;
}

// One id per page load; lets the server compare wall-clock vs monotonic time.
export const SESSION_ID = typeof window === "undefined" ? "" : uuid();

export type ClockSample = { serverTime: number; deviceTime: number };

export async function saveClock(serverTime: number) {
  const sample: ClockSample = { serverTime, deviceTime: Date.now() };
  await kvSet("clock", sample);
  return sample;
}

export const getClock = () => kvGet<ClockSample>("clock");

// ---- change notifications -------------------------------------------------

const listeners = new Set<() => void>();
export function onStoreChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function emitChange() {
  for (const fn of listeners) fn();
}
