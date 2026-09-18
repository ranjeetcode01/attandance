import "server-only";
import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { settings, type AppSettings } from "@/db/schema";
import { DEFAULT_SETTINGS } from "./defaults";

export const getSettings = cache(async (): Promise<AppSettings> => {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return { ...DEFAULT_SETTINGS, ...(row?.data ?? {}) };
});

// Merges only the given keys in one statement, so two admins saving different
// sections (e.g. logo upload and rules) cannot overwrite each other.
export async function patchSettings(patch: Partial<AppSettings>) {
  const db = await getDb();
  await db
    .insert(settings)
    .values({ id: 1, data: { ...DEFAULT_SETTINGS, ...patch } })
    .onConflictDoUpdate({
      target: settings.id,
      set: { data: sql`${settings.data} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() },
    });
}
