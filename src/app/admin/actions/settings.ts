"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { holidays } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { getSettings, patchSettings } from "@/lib/settings";
import { LOGO_MAX_BYTES, PhotoError, pruneLogos, purgeOldPhotos, saveLogo, withLogoLock } from "@/lib/storage";
import { back, bool, num, str } from "./util";

const clamp = (v: number, min: number, max: number, fallback: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

export async function updateSettings(form: FormData) {
  const me = await requireUser(["admin"]);
  const cur = await getSettings();
  const color = str(form, "brandColor");
  const trades = str(form, "trades")
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  // Logo fields are not part of this form and are left untouched.
  const next = {
    companyName: str(form, "companyName") || cur.companyName,
    shortName: str(form, "shortName") || cur.shortName,
    brandColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : cur.brandColor,
    fenceMode: str(form, "fenceMode") === "flag" ? ("flag" as const) : ("block" as const),
    accuracyToleranceM: clamp(num(form, "accuracyToleranceM"), 0, 500, cur.accuracyToleranceM),
    maxAccuracyM: clamp(num(form, "maxAccuracyM"), 10, 2000, cur.maxAccuracyM),
    requireSelfie: bool(form, "requireSelfie"),
    syncWindowHours: clamp(num(form, "syncWindowHours"), 1, 24 * 14, cur.syncWindowHours),
    graceMinutes: clamp(num(form, "graceMinutes"), 0, 180, cur.graceMinutes),
    fullDayHours: clamp(num(form, "fullDayHours"), 1, 16, cur.fullDayHours),
    halfDayHours: clamp(num(form, "halfDayHours"), 0.5, 12, cur.halfDayHours),
    otEnabled: bool(form, "otEnabled"),
    otAfterHours: clamp(num(form, "otAfterHours"), 1, 16, cur.otAfterHours),
    otMultiplier: clamp(num(form, "otMultiplier"), 0, 5, cur.otMultiplier),
    salaryDivisor: clamp(num(form, "salaryDivisor"), 20, 31, cur.salaryDivisor),
    weeklyOffDay: clamp(num(form, "weeklyOffDay"), -1, 6, cur.weeklyOffDay),
    trades: trades.length ? trades.slice(0, 60) : cur.trades,
    photoRetentionMonths: clamp(num(form, "photoRetentionMonths"), 0, 120, cur.photoRetentionMonths),
  };
  if (next.halfDayHours >= next.fullDayHours) back("/admin/settings", { err: "Half-day hours must be less than full-day hours." });
  await patchSettings(next);
  await audit(me.id, "settings.update", "settings", 1, next);
  revalidatePath("/", "layout");
  back("/admin/settings", { ok: "Settings saved." });
}

export async function uploadLogo(form: FormData) {
  const me = await requireUser(["admin"]);
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) back("/admin/settings", { err: "Choose a logo image to upload." });
  if (file.size > LOGO_MAX_BYTES) back("/admin/settings", { err: "Logo must be smaller than 500 KB." });
  const bytes = Buffer.from(await file.arrayBuffer());
  const error = await withLogoLock(async () => {
    const version = Date.now();
    try {
      const ext = await saveLogo(bytes, version);
      await patchSettings({ logo: "custom", logoExt: ext, logoVersion: version });
      await pruneLogos(version);
      await audit(me.id, "settings.logo_upload", "settings", 1, { ext, bytes: file.size, version });
      return null;
    } catch (e) {
      if (e instanceof PhotoError) return e.message;
      throw e;
    }
  });
  if (error) back("/admin/settings", { err: error });
  revalidatePath("/", "layout");
  back("/admin/settings", { ok: "Logo uploaded." });
}

export async function setLogoMode(form: FormData) {
  const me = await requireUser(["admin"]);
  const mode = str(form, "mode");
  if (mode !== "builtin" && mode !== "none" && mode !== "custom") back("/admin/settings", { err: "Unknown logo option." });
  const missing = await withLogoLock(async () => {
    const cur = await getSettings();
    if (mode === "custom" && !cur.logoExt) return true;
    await patchSettings({ logo: mode });
    return false;
  });
  if (missing) back("/admin/settings", { err: "Upload a logo first." });
  await audit(me.id, "settings.logo_mode", "settings", 1, { mode });
  revalidatePath("/", "layout");
  back("/admin/settings", { ok: "Logo setting saved." });
}

export async function addHoliday(form: FormData) {
  const me = await requireUser(["admin"]);
  const date = str(form, "date");
  const name = str(form, "name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) back("/admin/settings", { err: "Holiday date and name are required." });
  const db = await getDb();
  await db.insert(holidays).values({ date, name }).onConflictDoUpdate({ target: holidays.date, set: { name } });
  await audit(me.id, "holiday.add", "holiday", date, { name });
  back("/admin/settings", { ok: `Holiday ${name} saved.` });
}

export async function deleteHoliday(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = num(form, "id");
  const db = await getDb();
  await db.delete(holidays).where(eq(holidays.id, id));
  await audit(me.id, "holiday.delete", "holiday", id);
  back("/admin/settings", { ok: "Holiday removed." });
}

export async function purgePhotosNow() {
  const me = await requireUser(["admin"]);
  const settings = await getSettings();
  const removed = await purgeOldPhotos(settings.photoRetentionMonths);
  await audit(me.id, "photos.purge", "storage", "", { removed, months: settings.photoRetentionMonths });
  back("/admin/settings", { ok: removed ? `Removed ${removed} old photo month folder(s).` : "Nothing old enough to remove." });
}
