import { saveUser } from "@/app/admin/actions/masters";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import type { users } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/defaults";
import type { SiteInfo } from "@/lib/reports";

type User = typeof users.$inferSelect;

export function UserForm({ user, sites, assigned }: { user?: User; sites: SiteInfo[]; assigned: Set<number> }) {
  return (
    <form action={saveUser} className="space-y-4">
      {user && <input type="hidden" name="id" value={user.id} />}
      <input type="hidden" name="sitesSubmitted" value="1" />
      <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Employee code (login ID) *</label>
          <input name="empCode" defaultValue={user?.empCode} className="input uppercase" required pattern="[A-Za-z0-9_\-]{2,20}" />
        </div>
        <div>
          <label className="label">Full name *</label>
          <input name="name" defaultValue={user?.name} className="input" required />
        </div>
        <div>
          <label className="label">Mobile (can also log in)</label>
          <input name="mobile" defaultValue={user?.mobile ?? ""} className="input" inputMode="numeric" pattern="\d{10}" />
        </div>
        <div>
          <label className="label">Designation</label>
          <input name="designation" defaultValue={user?.designation} className="input" placeholder="Site Engineer" />
        </div>
        <div>
          <label className="label">Role</label>
          <select name="role" defaultValue={user?.role ?? "staff"} className="input">
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Wage type</label>
          <select name="wageType" defaultValue={user?.wageType ?? "monthly"} className="input">
            <option value="monthly">Monthly salary</option>
            <option value="daily">Daily wage</option>
          </select>
        </div>
        <div>
          <label className="label">Salary / wage (₹) — for project costing</label>
          <input name="wageAmount" type="number" min={0} step="any" defaultValue={user?.wageAmount ?? 0} className="input" />
        </div>
        <div>
          <label className="label">{user ? "Reset password (leave blank to keep)" : "Starting password *"}</label>
          <input name="password" type="text" autoComplete="off" className="input" minLength={6} required={!user} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={user?.active ?? true} className="h-4 w-4 accent-[var(--brand)]" />
          Active (can log in)
        </label>
        <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">
          Role: <b>Site Staff</b> punches only · <b>Supervisor</b> also marks labour · <b>Project Manager</b> sees admin reports and approves · <b>Admin</b> full setup.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Assigned sites</h2>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" name="siteIds" value={s.id} defaultChecked={assigned.has(s.id)} className="h-4 w-4 accent-[var(--brand)]" />
              {s.projectName} · {s.name}
              {!s.active && <span className="text-xs text-muted">(inactive)</span>}
            </label>
          ))}
          {!sites.length && <p className="text-sm text-muted">Create a site first.</p>}
        </div>
      </section>
      <ConfirmSubmit>{user ? "Save changes" : "Create user"}</ConfirmSubmit>
    </form>
  );
}
