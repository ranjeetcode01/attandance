import { timingSafeEqual } from "node:crypto";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { purgeOldPhotos } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cleanup of old photos.
// Self-hosted cron (see DEPLOY.md): curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/cleanup
// Vercel Cron calls the same path with GET and the same Authorization header.
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSettings();
  const removed = await purgeOldPhotos(settings.photoRetentionMonths);
  if (removed) await audit(null, "photos.purge", "storage", "", { removed, months: settings.photoRetentionMonths, by: "cron" });
  return Response.json({ ok: true, removed });
}

export const GET = run;
export const POST = run;
