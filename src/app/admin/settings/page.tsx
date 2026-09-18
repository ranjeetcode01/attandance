import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { addHoliday, deleteHoliday, purgePhotosNow, setLogoMode, updateSettings, uploadLogo } from "@/app/admin/actions/settings";
import { BrandLogo } from "@/components/brand";
import { Flash, PageHeader } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { getDb } from "@/db";
import { holidays } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logoUrl } from "@/lib/brand";
import { getSettings } from "@/lib/settings";
import { storage, storageUsageBytes } from "@/lib/storage";
import { fmtDate, weekdayName } from "@/lib/time";
import { LogoUploadForm } from "./logo-upload";

export const metadata: Metadata = { title: "Settings" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireUser(["admin"]);
  const s = await getSettings();
  const db = await getDb();
  const [hol, bytes] = await Promise.all([db.select().from(holidays).orderBy(asc(holidays.date)), storageUsageBytes()]);

  return (
    <>
      <PageHeader title="Settings" />
      <Flash searchParams={searchParams} />

      <section className="card mb-4 grid gap-4 p-4 lg:grid-cols-[auto_1fr]">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Company logo</h2>
          <div className="flex h-24 w-64 items-center justify-center rounded-xl border border-line bg-white p-3">
            <BrandLogo src={logoUrl(s)} alt={s.companyName} className="h-16 max-w-full" />
          </div>
          <p className="mt-1 text-xs text-muted">
            Now showing: {s.logo === "builtin" ? "built-in JNT logo" : s.logo === "custom" ? "uploaded logo" : "no logo (generic icon)"}
          </p>
        </div>
        <div className="space-y-3">
          <LogoUploadForm action={uploadLogo} />
          <form action={setLogoMode} className="flex flex-wrap gap-2">
            {s.logoExt && s.logo !== "custom" && (
              <ConfirmSubmit className="btn btn-secondary btn-sm" name="mode" value="custom">
                Use uploaded logo
              </ConfirmSubmit>
            )}
            {s.logo !== "builtin" && (
              <ConfirmSubmit className="btn btn-secondary btn-sm" name="mode" value="builtin">
                Use built-in JNT logo
              </ConfirmSubmit>
            )}
            {s.logo !== "none" && (
              <ConfirmSubmit className="btn btn-secondary btn-sm" name="mode" value="none">
                Hide logo
              </ConfirmSubmit>
            )}
          </form>
          <p className="text-xs text-muted">
            The logo appears on the login page, admin menu and the site app. Phone home-screen icons are generated at build time — see README (<code>npm run icons</code>).
          </p>
        </div>
      </section>

      <form action={updateSettings} className="space-y-4">
        <section className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Company (white-label)</h2>
          <Field label="Company name">
            <input name="companyName" defaultValue={s.companyName} className="input" />
          </Field>
          <Field label="App name">
            <input name="shortName" defaultValue={s.shortName} className="input" />
          </Field>
          <Field label="Brand colour" hint="Buttons and highlights">
            <input name="brandColor" type="color" defaultValue={s.brandColor} className="input h-10 p-1" />
          </Field>
        </section>

        <section className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Geofence & anti-fraud</h2>
          <Field label="Outside the fence" hint="Block = app will not allow the punch. Flag = allowed but sent for review.">
            <select name="fenceMode" defaultValue={s.fenceMode} className="input">
              <option value="block">Block punch</option>
              <option value="flag">Allow & flag for review</option>
            </select>
          </Field>
          <Field label="GPS accuracy benefit (m)" hint="Extra distance allowed for weak GPS">
            <input name="accuracyToleranceM" type="number" min={0} max={500} defaultValue={s.accuracyToleranceM} className="input" />
          </Field>
          <Field label="Flag weak GPS above (m)">
            <input name="maxAccuracyM" type="number" min={10} max={2000} defaultValue={s.maxAccuracyM} className="input" />
          </Field>
          <Field label="Offline sync window (hours)" hint="Offline punches synced later than this go for review">
            <input name="syncWindowHours" type="number" min={1} max={336} defaultValue={s.syncWindowHours} className="input" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireSelfie" defaultChecked={s.requireSelfie} className="h-4 w-4 accent-[var(--brand)]" />
            Selfie required on every punch
          </label>
        </section>

        <section className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Attendance rules</h2>
          <Field label="Late after (grace minutes)" hint="Shift start time is set per site">
            <input name="graceMinutes" type="number" min={0} max={180} defaultValue={s.graceMinutes} className="input" />
          </Field>
          <Field label="Full day = at least (hours)">
            <input name="fullDayHours" type="number" step="0.5" min={1} max={16} defaultValue={s.fullDayHours} className="input" />
          </Field>
          <Field label="Half day = at least (hours)" hint="Less than this = short hours (not paid)">
            <input name="halfDayHours" type="number" step="0.5" min={0.5} max={12} defaultValue={s.halfDayHours} className="input" />
          </Field>
          <Field label="Weekly off">
            <select name="weeklyOffDay" defaultValue={s.weeklyOffDay} className="input">
              <option value={-1}>No weekly off</option>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="otEnabled" defaultChecked={s.otEnabled} className="h-4 w-4 accent-[var(--brand)]" />
            Calculate overtime
          </label>
          <Field label="OT after (hours worked)">
            <input name="otAfterHours" type="number" step="0.5" min={1} max={16} defaultValue={s.otAfterHours} className="input" />
          </Field>
          <Field label="OT rate multiplier" hint="2 = double the hourly rate">
            <input name="otMultiplier" type="number" step="0.25" min={0} max={5} defaultValue={s.otMultiplier} className="input" />
          </Field>
          <Field label="Monthly salary ÷ days" hint="Used for daily cost of monthly staff">
            <input name="salaryDivisor" type="number" min={20} max={31} defaultValue={s.salaryDivisor} className="input" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Labour trades (comma or new line)">
              <textarea name="trades" defaultValue={s.trades.join(", ")} className="input min-h-16" />
            </Field>
          </div>
        </section>

        <section className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Storage (keeps server cost low)</h2>
          <Field label="Delete photos older than (months)" hint="0 = keep forever. Attendance records are never deleted.">
            <input name="photoRetentionMonths" type="number" min={0} max={120} defaultValue={s.photoRetentionMonths} className="input" />
          </Field>
          <div className="text-sm">
            <div className="label">Photos stored now ({storage.name === "blob" ? "blob storage" : "server disk"})</div>
            <div className="font-semibold">{(bytes / 1024 / 1024).toFixed(1)} MB</div>
          </div>
        </section>

        <ConfirmSubmit>Save settings</ConfirmSubmit>
      </form>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Holidays</h2>
          <ul className="mb-3 divide-y divide-line text-sm">
            {hol.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-1.5">
                <span>
                  {fmtDate(h.date)} <span className="text-muted">({weekdayName(h.date)})</span> — {h.name}
                </span>
                <form action={deleteHoliday}>
                  <input type="hidden" name="id" value={h.id} />
                  <ConfirmSubmit className="btn btn-ghost btn-sm" confirmText={`Remove ${h.name}?`}>
                    Remove
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
          <form action={addHoliday} className="flex flex-wrap gap-2">
            <input type="date" name="date" className="input w-auto" required />
            <input name="name" className="input w-auto flex-1" placeholder="Holiday name" required />
            <ConfirmSubmit>Add</ConfirmSubmit>
          </form>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Clean up old photos now</h2>
          <p className="mb-3 text-sm text-muted">Removes selfies and group photos older than {s.photoRetentionMonths || "∞"} months. This also runs daily if the cleanup cron is set up.</p>
          <form action={purgePhotosNow}>
            <ConfirmSubmit className="btn btn-danger" confirmText="Delete old photos permanently?">
              Delete old photos
            </ConfirmSubmit>
          </form>
        </section>
      </div>
    </>
  );
}
