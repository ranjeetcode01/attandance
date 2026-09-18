import type { DayStatus } from "@/lib/attendance";
import type { Role } from "@/db/schema";

export type BootSite = {
  id: number;
  name: string;
  projectName: string;
  lat: number;
  lng: number;
  radiusM: number;
  areas: string[];
  shiftStart: string;
  shiftEnd: string;
};

export type BootCrew = {
  id: number;
  name: string;
  firmName: string;
  labour: { id: number; name: string; trade: string; dailyWage: number }[];
};

export type Boot = {
  serverTime: number;
  today: string;
  user: { id: number; name: string; empCode: string; role: Role; designation: string; mustChangePassword: boolean };
  settings: {
    companyName: string;
    shortName: string;
    brandColor: string;
    logoUrl: string | null;
    logoCompactUrl?: string | null; // missing in boot data cached by older app versions
    fenceMode: "block" | "flag";
    accuracyToleranceM: number;
    maxAccuracyM: number;
    requireSelfie: boolean;
    syncWindowHours: number;
    trades: string[];
  };
  sites: BootSite[];
  crew: BootCrew[];
  labourToday: { siteId: number; contractorId: number; present: number; reviewStatus: string }[];
  todayPunches: {
    id: string;
    type: "IN" | "OUT";
    siteId: number | null;
    punchTime: number;
    reviewStatus: string;
    flags: string[];
    workArea: string;
    selfieUrl: string | null;
  }[];
  history: {
    date: string;
    status: DayStatus;
    firstIn: number | null;
    lastOut: number | null;
    workMin: number;
    lateMin: number;
    otMin: number;
    pending: number;
    sites: string[];
  }[];
  requests: {
    id: string;
    kind: "regularization" | "leave";
    fromDate: string;
    toDate: string;
    leaveType: string;
    inTime: string;
    outTime: string;
    reason: string;
    status: string;
    reviewNote: string;
  }[];
};

export type Notify = (text: string, tone?: "ok" | "warn" | "error") => void;
