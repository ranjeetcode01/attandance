import fs from "node:fs";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

// Both drivers expose the same query-builder API; the PGlite type is used as the common one.
export type DB = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __saDb?: Promise<DB> };

// DATABASE_URL set  → real PostgreSQL (production).
// DATABASE_URL empty → embedded PGlite under .data/ (local dev, or very small single-server installs).
export function getDb(): Promise<DB> {
  if (!g.__saDb) {
    g.__saDb = init().catch((err) => {
      g.__saDb = undefined;
      throw err;
    });
  }
  return g.__saDb;
}

async function init(): Promise<DB> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;
  if (!url && process.env.VERCEL) {
    // Serverless has no persistent disk: the embedded database would be lost on every deploy.
    throw new Error("DATABASE_URL is required on Vercel — add a PostgreSQL database (e.g. Neon) to the project.");
  }
  let db: DB;

  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const serverless = !!process.env.VERCEL;
    const client = postgres(url, {
      // Serverless: one connection per instance, and no prepared statements because
      // pooled endpoints (Neon/pgbouncer in transaction mode) do not support them.
      max: Number(process.env.DATABASE_POOL_MAX ?? (serverless ? 1 : 5)),
      prepare: process.env.DATABASE_PREPARE ? process.env.DATABASE_PREPARE === "1" : !serverless,
      idle_timeout: serverless ? 20 : undefined,
      connect_timeout: 15,
      onnotice: () => {},
    });
    const pg = drizzle(client, { schema });
    if (process.env.AUTO_MIGRATE !== "0") {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(pg, { migrationsFolder });
    }
    db = pg as unknown as DB;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dataDir, { recursive: true });
    const client = await PGlite.create(dataDir);
    db = drizzle(client, { schema });
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder });
  }

  // Demo data only on a fresh non-production database unless asked for explicitly.
  const demo = (process.env.SEED_DEMO ?? (url || process.env.NODE_ENV === "production" ? "0" : "1")) === "1";
  await seedIfEmpty(db, { demo });
  return db;
}
