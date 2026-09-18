import type { AppSettings } from "@/db/schema";

export const DEFAULT_TRADES = [
  "Fire Fitter",
  "Pipe Fitter",
  "Welder",
  "Electrician",
  "Plumber",
  "Mason",
  "Carpenter",
  "Bar Bender",
  "Painter",
  "Helper",
];

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: "JNT Fire Engineers Pvt Ltd",
  shortName: "JNT Site Attendance",
  // Darker shade of the JNT logo orange so white button text stays readable (contrast 4.9:1).
  brandColor: "#C84508",
  logo: "builtin",
  logoVersion: 0,
  logoExt: "",
  fenceMode: "block",
  accuracyToleranceM: 50,
  maxAccuracyM: 150,
  requireSelfie: true,
  syncWindowHours: 24,
  graceMinutes: 15,
  fullDayHours: 8,
  halfDayHours: 4,
  otEnabled: true,
  otAfterHours: 9,
  otMultiplier: 2,
  salaryDivisor: 26,
  weeklyOffDay: 0,
  trades: DEFAULT_TRADES,
  photoRetentionMonths: 6,
};

export const ROLE_LABELS = {
  admin: "Admin",
  pm: "Project Manager",
  supervisor: "Site Supervisor",
  staff: "Site Staff",
} as const;

// Human readable text for every integrity flag the server can raise.
export const FLAG_INFO: Record<string, { label: string; severe: boolean }> = {
  OUTSIDE_FENCE: { label: "Outside site geofence", severe: true },
  CLOCK_TAMPER: { label: "Phone clock was changed", severe: true },
  LATE_SYNC: { label: "Synced after allowed window", severe: true },
  SELFIE_REUSED: { label: "Same selfie used again", severe: true },
  IMPOSSIBLE_TRAVEL: { label: "Impossible travel speed", severe: true },
  SITE_NOT_ASSIGNED: { label: "Site not assigned to user", severe: true },
  MOCK_LOCATION: { label: "Fake GPS app detected", severe: true },
  NO_SELFIE: { label: "Selfie missing", severe: true },
  NO_LOCATION: { label: "Location missing", severe: true },
  DATE_MISMATCH: { label: "Sheet date differs from actual date", severe: true },
  OFFLINE: { label: "Marked offline", severe: false },
  CLOCK_SKEW: { label: "Phone clock was wrong (auto-corrected)", severe: false },
  LOW_ACCURACY: { label: "Weak GPS accuracy", severe: false },
  DUPLICATE_IN: { label: "IN again without OUT", severe: false },
  OUT_WITHOUT_IN: { label: "OUT without IN", severe: false },
};

export function hasSevereFlag(flags: string[]) {
  return flags.some((f) => FLAG_INFO[f]?.severe);
}
