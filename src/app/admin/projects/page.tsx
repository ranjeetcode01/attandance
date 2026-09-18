import { asc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { saveProject } from "@/app/admin/actions/masters";
import { Flash, PageHeader } from "@/components/admin/bits";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { getDb } from "@/db";
import { projects, userSites } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadSites } from "@/lib/reports";

export const metadata: Metadata = { title: "Projects & sites" };

type ProjectRow = typeof projects.$inferSelect;

function ProjectFields({ p }: { p?: ProjectRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div>
        <label className="label">Code *</label>
        <input name="code" defaultValue={p?.code} className="input uppercase" required maxLength={20} placeholder="SKY-THN" />
      </div>
      <div className="lg:col-span-2">
        <label className="label">Project name *</label>
        <input name="name" defaultValue={p?.name} className="input" required placeholder="Skyline Residency" />
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" defaultValue={p?.status ?? "active"} className="input">
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div>
        <label className="label">Builder / client</label>
        <input name="builder" defaultValue={p?.builder} className="input" />
      </div>
      <div>
        <label className="label">RERA no.</label>
        <input name="reraNo" defaultValue={p?.reraNo} className="input" />
      </div>
      <div>
        <label className="label">City</label>
        <input name="city" defaultValue={p?.city} className="input" />
      </div>
      <div>
        <label className="label">Address</label>
        <input name="address" defaultValue={p?.address} className="input" />
      </div>
    </div>
  );
}

const STATUS_STYLE = { active: "bg-emerald-100 text-emerald-800", on_hold: "bg-amber-100 text-amber-800", completed: "bg-slate-200 text-slate-700" };

export default async function ProjectsPage({ searchParams }: PageProps<"/admin/projects">) {
  await requireUser(["admin"]);
  const db = await getDb();
  const [projectRows, sites, counts] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.name)),
    loadSites(),
    db.select({ siteId: userSites.siteId, n: sql<number>`count(*)::int` }).from(userSites).groupBy(userSites.siteId),
  ]);
  const staffCount = new Map(counts.map((c) => [c.siteId, c.n]));

  return (
    <>
      <PageHeader title="Projects & sites" subtitle="A project (real-estate development) has one or more geofenced sites — towers, wings, site office." />
      <Flash searchParams={searchParams} />

      <div className="space-y-4">
        {projectRows.map((p) => {
          const ps = sites.filter((s) => s.projectId === p.id);
          return (
            <section key={p.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{p.name}</h2>
                    <span className="text-xs text-muted">{p.code}</span>
                    <span className={`badge ${STATUS_STYLE[p.status]}`}>{p.status.replace("_", " ")}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {[p.builder, p.city, p.reraNo && `RERA ${p.reraNo}`].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Link href={`/admin/sites/new?project=${p.id}`} className="btn btn-secondary btn-sm">
                  + Add site
                </Link>
              </div>
              <div className="overflow-x-auto border-t border-line">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Location</th>
                      <th className="text-right">Radius</th>
                      <th>Shift</th>
                      <th className="text-right">Staff</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ps.map((s) => (
                      <tr key={s.id}>
                        <td className="font-medium">{s.name}</td>
                        <td className="text-xs">
                          <a className="text-sky-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}>
                            {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                          </a>
                        </td>
                        <td className="text-right tabular-nums">{s.radiusM} m</td>
                        <td className="tabular-nums">
                          {s.shiftStart}–{s.shiftEnd}
                        </td>
                        <td className="text-right tabular-nums">{staffCount.get(s.id) ?? 0}</td>
                        <td>{s.active ? <span className="badge bg-emerald-100 text-emerald-800">active</span> : <span className="badge bg-slate-200 text-slate-600">inactive</span>}</td>
                        <td className="text-right">
                          <Link href={`/admin/sites/${s.id}`} className="btn btn-ghost btn-sm">
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {!ps.length && (
                      <tr>
                        <td colSpan={7} className="text-center text-muted">
                          No sites yet — add one to start attendance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <details className="border-t border-line px-4 py-3">
                <summary className="cursor-pointer text-sm text-muted">Edit project details</summary>
                <form action={saveProject} className="mt-3 space-y-3">
                  <ProjectFields p={p} />
                  <ConfirmSubmit>Save project</ConfirmSubmit>
                </form>
              </details>
            </section>
          );
        })}
      </div>

      <section className="card mt-6 p-4">
        <h2 className="mb-3 text-sm font-semibold">New project</h2>
        <form action={saveProject} className="space-y-3">
          <ProjectFields />
          <ConfirmSubmit>Create project</ConfirmSubmit>
        </form>
      </section>
    </>
  );
}
