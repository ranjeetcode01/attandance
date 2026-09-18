import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.number().int().positive();
const photo = z.string().max(900_000).nullable();

// Last moment the phone talked to the server, as seen by both clocks.
const lastSync = z.object({ serverTime: z.number(), deviceTime: z.number() }).nullable().optional();

export const punchPayload = z.object({
  type: z.enum(["IN", "OUT"]),
  siteId: id,
  workArea: z.string().max(80).default(""),
  note: z.string().max(500).default(""),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy: z.number().min(0).max(1_000_000).nullable(),
  gpsTime: z.number().nullable().optional(),
  deviceTime: z.number().int(),
  seq: z.number().int().nonnegative(),
  sessionId: z.string().max(64),
  perfNow: z.number().nonnegative(),
  lastSync,
  selfie: photo,
  selfieRawHash: z.string().max(128).nullable().optional(),
  mock: z.boolean().optional(),
});

export const labourPayload = z.object({
  date: dateStr,
  siteId: id,
  contractorId: id,
  entries: z
    .array(z.object({ labourerId: id, status: z.enum(["P", "H", "A"]), otHours: z.number().min(0).max(16) }))
    .max(500),
  headcount: z
    .array(
      z.object({
        trade: z.string().trim().min(1).max(40),
        count: z.number().int().min(1).max(500),
        rate: z.number().min(0).max(100_000),
        otHours: z.number().min(0).max(16),
      }),
    )
    .max(50),
  photo,
  ppeChecked: z.boolean(),
  toolboxTalk: z.boolean(),
  note: z.string().max(500).default(""),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy: z.number().min(0).max(1_000_000).nullable(),
  deviceTime: z.number().int(),
  lastSync,
});

export const requestPayload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("regularization"),
    date: dateStr,
    siteId: id,
    inTime: hhmm.or(z.literal("")),
    outTime: hhmm.or(z.literal("")),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    kind: z.literal("leave"),
    fromDate: dateStr,
    toDate: dateStr,
    leaveType: z.string().trim().min(1).max(40),
    reason: z.string().trim().min(5).max(500),
  }),
]);

export const syncItem = z.discriminatedUnion("kind", [
  z.object({ id: z.uuid(), kind: z.literal("punch"), payload: punchPayload }),
  z.object({ id: z.uuid(), kind: z.literal("labour"), payload: labourPayload }),
  z.object({ id: z.uuid(), kind: z.literal("request"), payload: requestPayload }),
]);

export const syncBody = z.object({
  deviceId: z.string().min(8).max(64),
  sentAt: z.number().int(),
  item: syncItem,
});

export type PunchPayload = z.input<typeof punchPayload>;
export type LabourPayload = z.input<typeof labourPayload>;
export type RequestPayload = z.input<typeof requestPayload>;
export type SyncItem = z.input<typeof syncItem>;

export type SyncResult = {
  id: string;
  kind: "punch" | "labour" | "request";
  status: string;
  flags: string[];
  message: string;
  punchTime?: number;
  workDate?: string;
};
