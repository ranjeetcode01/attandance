import "server-only";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Photo/logo storage.
 *
 * Disk (default): files live under STORAGE_DIR — free, used on a VPS or the client's own server.
 * Vercel Blob:    used automatically when BLOB_READ_WRITE_TOKEN is set, because serverless
 *                 hosting has no writable disk.
 * Files are always served through the app (/api/files, /brand/logo), never by a public URL.
 */

const MAX_BYTES = 600 * 1024;
const REL_PATH = /^(selfies|labour)\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const typeOf = (rel: string) => TYPES[rel.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export type PhotoFolder = "selfies" | "labour";
export type StoredFile = { bytes: Buffer; type: string };

export class PhotoError extends Error {}

type Driver = {
  readonly name: "disk" | "blob";
  put(rel: string, bytes: Buffer, type: string): Promise<void>;
  get(rel: string): Promise<StoredFile | null>;
  remove(rels: string[]): Promise<void>;
  list(prefix: string): Promise<{ path: string; size: number }[]>;
};

// ---------------------------------------------------------------- disk driver

// Runtime data, not code: the turbopackIgnore markers keep the build from tracing
// (and shipping) the whole project because of these dynamic paths.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "files"));
const inStorage = (rel: string) => path.join(/*turbopackIgnore: true*/ ROOT, rel);

const diskDriver: Driver = {
  name: "disk",
  async put(rel, bytes) {
    const abs = inStorage(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, abs);
  },
  async get(rel) {
    const bytes = await fs.readFile(inStorage(rel)).catch(() => null);
    return bytes ? { bytes, type: typeOf(rel) } : null;
  },
  async remove(rels) {
    for (const rel of rels) await fs.rm(inStorage(rel), { force: true });
  },
  async list(prefix) {
    const out: { path: string; size: number }[] = [];
    const walk = async (rel: string) => {
      const entries = await fs.readdir(inStorage(rel), { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const child = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(child);
        else if (child.startsWith(prefix)) out.push({ path: child, size: (await fs.stat(inStorage(child))).size });
      }
    };
    await walk("");
    return out;
  },
};

// ---------------------------------------------------------------- Vercel Blob driver

const BLOB_ACCESS = (process.env.BLOB_ACCESS === "public" ? "public" : "private") as "private" | "public";

const blobDriver: Driver = {
  name: "blob",
  async put(rel, bytes, type) {
    const { put } = await import("@vercel/blob");
    await put(rel, bytes, { access: BLOB_ACCESS, contentType: type, addRandomSuffix: false, allowOverwrite: true });
  },
  async get(rel) {
    const { get } = await import("@vercel/blob");
    const res = await get(rel, { access: BLOB_ACCESS }).catch(() => null);
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.stream as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return { bytes: Buffer.concat(chunks), type: typeOf(rel) };
  },
  async remove(rels) {
    if (!rels.length) return;
    const { del } = await import("@vercel/blob");
    await del(rels);
  },
  async list(prefix) {
    const { list } = await import("@vercel/blob");
    const out: { path: string; size: number }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      out.push(...page.blobs.map((b) => ({ path: b.pathname, size: b.size })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  },
};

export const storage: Driver = process.env.BLOB_READ_WRITE_TOKEN ? blobDriver : diskDriver;

// ---------------------------------------------------------------- photos

export async function saveJpegDataUrl(dataUrl: string, folder: PhotoFolder, month: string) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new PhotoError("Photo must be a JPEG image.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > MAX_BYTES) throw new PhotoError("Photo is too large.");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new PhotoError("Photo is not a valid JPEG.");

  const rel = `${folder}/${month}/${randomUUID()}.jpg`;
  await storage.put(rel, bytes, "image/jpeg");
  return { path: rel, hash: createHash("sha256").update(bytes).digest("hex") };
}

export function isPhotoPath(rel: string) {
  return REL_PATH.test(rel);
}

export async function readPhoto(rel: string): Promise<StoredFile | null> {
  return isPhotoPath(rel) ? storage.get(rel) : null;
}

export function photoUrl(rel: string | null | undefined) {
  return rel ? `/api/files/${rel}` : null;
}

// Deletes whole month folders older than `months`. Returns the number of files removed.
export async function purgeOldPhotos(months: number): Promise<number> {
  if (!months || months <= 0) return 0;
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const cutoffKey = cutoff.toISOString().slice(0, 7);
  let removed = 0;
  for (const folder of ["selfies", "labour"] as const) {
    const old = (await storage.list(`${folder}/`)).filter((f) => {
      const month = f.path.split("/")[1] ?? "";
      return /^\d{4}-\d{2}$/.test(month) && month < cutoffKey;
    });
    for (let i = 0; i < old.length; i += 100) {
      await storage.remove(old.slice(i, i + 100).map((f) => f.path));
      removed += Math.min(100, old.length - i);
    }
  }
  return removed;
}

export async function storageUsageBytes(): Promise<number> {
  return (await storage.list("")).reduce((total, f) => total + f.size, 0);
}

// ---------------------------------------------------------------- company logo
// One file per upload (branding/logo-<version>.<ext>): a new upload never overwrites
// the file an older ?v= URL points to, and old files are pruned only afterwards.

export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type LogoExt = keyof typeof LOGO_TYPES;
const isLogoExt = (ext: string): ext is LogoExt => ext === "png" || ext === "jpg" || ext === "webp";
const logoPath = (version: number, ext: LogoExt) => `branding/logo-${version}.${ext}`;

// Detect the real type from the file bytes (never trust the browser's MIME type).
// SVG is deliberately not accepted: it can carry scripts.
function sniffImage(b: Buffer): LogoExt | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function saveLogo(bytes: Buffer, version: number): Promise<LogoExt> {
  if (bytes.length > LOGO_MAX_BYTES) throw new PhotoError("Logo must be smaller than 500 KB.");
  const ext = sniffImage(bytes);
  if (!ext) throw new PhotoError("Logo must be a PNG, JPG or WEBP image.");
  await storage.put(logoPath(version, ext), bytes, LOGO_TYPES[ext]);
  return ext;
}

export async function readLogo(version: number, ext: string): Promise<StoredFile | null> {
  if (!isLogoExt(ext) || !Number.isSafeInteger(version)) return null;
  return storage.get(logoPath(version, ext));
}

// Deletes every stored logo except the one in use.
export async function pruneLogos(keepVersion: number) {
  const stale = (await storage.list("branding/")).filter((f) => /^branding\/logo[-.]/.test(f.path) && !f.path.startsWith(`branding/logo-${keepVersion}.`));
  await storage.remove(stale.map((f) => f.path));
}

// Logo changes run one at a time (per server instance).
let logoQueue: Promise<unknown> = Promise.resolve();
export function withLogoLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = logoQueue.then(fn, fn);
  logoQueue = run.catch(() => {});
  return run;
}
