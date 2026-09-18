import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type Role = "admin" | "pm" | "supervisor" | "staff";
export type WageType = "monthly" | "daily";
export type PunchType = "IN" | "OUT";
export type ReviewStatus = "ok" | "pending" | "approved" | "rejected";
export type LabourStatus = "P" | "H" | "A";

export type AppSettings = {
  companyName: string;
  shortName: string;
  brandColor: string;
  // builtin = bundled JNT logo, custom = uploaded file (served by /brand/logo), none = generic pin icon
  logo: "builtin" | "custom" | "none";
  logoVersion: number;
  logoExt: "" | "png" | "jpg" | "webp";
  fenceMode: "block" | "flag";
  accuracyToleranceM: number;
  maxAccuracyM: number;
  requireSelfie: boolean;
  syncWindowHours: number;
  graceMinutes: number;
  fullDayHours: number;
  halfDayHours: number;
  otEnabled: boolean;
  otAfterHours: number;
  otMultiplier: number;
  salaryDivisor: number;
  weeklyOffDay: number; // 0 = Sunday … 6 = Saturday, -1 = none
  trades: string[];
  photoRetentionMonths: number; // older selfies/group photos are deleted to keep disk small; 0 = keep forever
};

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<AppSettings>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  empCode: text("emp_code").notNull().unique(),
  name: text("name").notNull(),
  mobile: text("mobile").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("staff"),
  designation: text("designation").notNull().default(""),
  wageType: text("wage_type").$type<WageType>().notNull().default("monthly"),
  wageAmount: real("wage_amount").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(1),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  builder: text("builder").notNull().default(""),
  reraNo: text("rera_no").notNull().default(""),
  city: text("city").notNull().default(""),
  address: text("address").notNull().default(""),
  status: text("status").$type<"active" | "on_hold" | "completed">().notNull().default("active"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// A site is one geofenced location inside a project (tower, wing, block, site office).
export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    radiusM: integer("radius_m").notNull().default(200),
    shiftStart: text("shift_start").notNull().default("09:00"),
    shiftEnd: text("shift_end").notNull().default("18:00"),
    areas: jsonb("areas").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sites_project_idx").on(t.projectId)],
);

export const userSites = pgTable(
  "user_sites",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.siteId] })],
);

export const contractors = pgTable("contractors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  firmName: text("firm_name").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const labourers = pgTable(
  "labourers",
  {
    id: serial("id").primaryKey(),
    contractorId: integer("contractor_id")
      .notNull()
      .references(() => contractors.id),
    name: text("name").notNull(),
    trade: text("trade").notNull(),
    dailyWage: real("daily_wage").notNull().default(0),
    mobile: text("mobile").notNull().default(""),
    idLast4: text("id_last4").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("labourers_contractor_idx").on(t.contractorId)],
);

export type PunchMeta = {
  userAgent?: string;
  gpsTime?: number;
  lastSyncServerTime?: number;
  lastSyncDeviceTime?: number;
  skewMs?: number;
  mock?: boolean;
  requestId?: string;
};

// Raw punch events. The id is generated on the phone so offline retries are idempotent.
export const punches = pgTable(
  "punches",
  {
    id: uuid("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    siteId: integer("site_id").references(() => sites.id),
    type: text("type").$type<PunchType>().notNull(),
    source: text("source").$type<"app" | "regularization" | "admin">().notNull().default("app"),
    deviceTime: ts("device_time").notNull(),
    sentAt: ts("sent_at"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    punchTime: ts("punch_time").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracy: real("accuracy"),
    distanceM: real("distance_m"),
    insideFence: boolean("inside_fence"),
    offline: boolean("offline").notNull().default(false),
    selfiePath: text("selfie_path"),
    selfieHash: text("selfie_hash"),
    workArea: text("work_area").notNull().default(""),
    note: text("note").notNull().default(""),
    deviceId: text("device_id"),
    sessionId: text("session_id"),
    perfNow: doublePrecision("perf_now"),
    seq: integer("seq"),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("ok"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note").notNull().default(""),
    meta: jsonb("meta").$type<PunchMeta>().notNull().default({}),
  },
  (t) => [
    index("punches_user_date_idx").on(t.userId, t.workDate),
    index("punches_date_idx").on(t.workDate),
    index("punches_site_date_idx").on(t.siteId, t.workDate),
    index("punches_review_idx").on(t.reviewStatus),
    index("punches_hash_idx").on(t.selfieHash),
    index("punches_device_idx").on(t.deviceId, t.seq),
  ],
);

// One sheet per date + site + contractor, filled by a supervisor for labour without phones.
export const labourSheets = pgTable(
  "labour_sheets",
  {
    id: uuid("id").primaryKey(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    contractorId: integer("contractor_id")
      .notNull()
      .references(() => contractors.id),
    markedBy: integer("marked_by")
      .notNull()
      .references(() => users.id),
    deviceTime: ts("device_time").notNull(),
    punchTime: ts("punch_time").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracy: real("accuracy"),
    distanceM: real("distance_m"),
    insideFence: boolean("inside_fence"),
    offline: boolean("offline").notNull().default(false),
    photoPath: text("photo_path"),
    ppeChecked: boolean("ppe_checked").notNull().default(false),
    toolboxTalk: boolean("toolbox_talk").notNull().default(false),
    note: text("note").notNull().default(""),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("ok"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note").notNull().default(""),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("labour_sheet_unique").on(t.workDate, t.siteId, t.contractorId),
    index("labour_sheet_date_idx").on(t.workDate),
  ],
);

// Named labour rows have labourerId set and count = 1.
// Headcount rows (unregistered labour) have labourerId null, a trade and a count.
export const labourEntries = pgTable(
  "labour_entries",
  {
    id: serial("id").primaryKey(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => labourSheets.id, { onDelete: "cascade" }),
    labourerId: integer("labourer_id").references(() => labourers.id),
    trade: text("trade").notNull(),
    count: integer("count").notNull().default(1),
    status: text("status").$type<LabourStatus>().notNull().default("P"),
    otHours: real("ot_hours").notNull().default(0),
    rate: real("rate").notNull().default(0),
  },
  (t) => [index("labour_entries_sheet_idx").on(t.sheetId)],
);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").$type<"regularization" | "leave">().notNull(),
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    leaveType: text("leave_type").notNull().default(""),
    siteId: integer("site_id").references(() => sites.id),
    inTime: text("in_time").notNull().default(""),
    outTime: text("out_time").notNull().default(""),
    reason: text("reason").notNull(),
    status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("requests_user_idx").on(t.userId), index("requests_status_idx").on(t.status)],
);

export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull().unique(),
  name: text("name").notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_at_idx").on(t.at)],
);
