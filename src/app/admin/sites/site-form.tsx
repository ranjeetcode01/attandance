import { asc, eq } from "drizzle-orm";
import { saveSite } from "@/app/admin/actions/masters";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { GeofenceEditor } from "@/components/admin/maps";
import { getDb } from "@/db";
import { projects, users, userSites, type sites } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/defaults";
import { loadSites } from "@/lib/reports";

type Site = typeof sites.$inferSelect;

export async function SiteForm({ site, projectId }: { site?: Site; projectId?: number }) {
  const db = await getDb();
  const [projectRows, people, assigned, allSites] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.name)),
    db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    site ? db.select().from(userSites).where(eq(userSites.siteId, site.id)) : Promise.resolve([]),
    loadSites(),
  ]);
  const assignedIds = new Set(assigned.map((a) => a.userId));
  const others = allSites.filter((s) => s.id !== site?.id).map((s) => ({ lat: s.lat, lng: s.lng, radiusM: s.radiusM, label: `${s.projectName} · ${s.name}` }));

  return (
    <form action={saveSite} className="space-y-4">
      {site && <input type="hidden" name="id" value={site.id} />}
      <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Project *</label>
          <select name="projectId" defaultValue={site?.projectId ?? projectId} className="input" required>
            {projectRows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Site name *</label>
          <input name="name" defaultValue={site?.name} className="input" placeholder="Tower A / Wing C / Site office" required />
        </div>
        <div>
          <label className="label">Shift start</label>
          <input type="time" name="shiftStart" defaultValue={site?.shiftStart ?? "09:00"} className="input" />
        </div>
        <div>
          <label className="label">Shift end</label>
          <input type="time" name="shiftEnd" defaultValue={site?.shiftEnd ?? "18:00"} className="input" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label">Work areas (floors / zones) — comma or new line separated</label>
          <textarea name="areas" defaultValue={site?.areas.join("\n") ?? "Basement\nPodium\nFloor 1–10\nFloor 11–20\nTerrace"} className="input min-h-20" />
        </div>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="active" defaultChecked={site?.active ?? true} className="h-4 w-4 accent-[var(--brand)]" />
          Site active
        </label>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Geofence</h2>
        <GeofenceEditor lat={site?.lat ?? 0} lng={site?.lng ?? 0} radiusM={site?.radiusM ?? 200} others={others} />
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Who can punch at this site</h2>
        <p className="mb-3 text-xs text-muted">Admins and project managers can punch at any site.</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {people
            .filter((u) => u.role !== "admin")
            .map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" name="userIds" value={u.id} defaultChecked={assignedIds.has(u.id)} className="h-4 w-4 accent-[var(--brand)]" />
                <span>
                  {u.name} <span className="text-xs text-muted">· {ROLE_LABELS[u.role]}</span>
                </span>
              </label>
            ))}
        </div>
      </section>

      <ConfirmSubmit>{site ? "Save site" : "Create site"}</ConfirmSubmit>
    </form>
  );
}
