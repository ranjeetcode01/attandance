import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labourSheets, punches } from "@/db/schema";
import { apiUser, MANAGER_ROLES } from "@/lib/auth";
import { isPhotoPath, readPhoto } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const user = await apiUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const rel = (await ctx.params).path.join("/");
  if (!isPhotoPath(rel)) return new Response("Not found", { status: 404 });

  if (!MANAGER_ROLES.includes(user.role)) {
    const db = await getDb();
    const [own] = await db
      .select({ id: punches.id })
      .from(punches)
      .where(and(eq(punches.selfiePath, rel), eq(punches.userId, user.id)))
      .limit(1);
    const [ownSheet] = own
      ? [own]
      : await db
          .select({ id: labourSheets.id })
          .from(labourSheets)
          .where(and(eq(labourSheets.photoPath, rel), eq(labourSheets.markedBy, user.id)))
          .limit(1);
    if (!ownSheet) return new Response("Forbidden", { status: 403 });
  }

  const photo = await readPhoto(rel);
  if (!photo) return new Response("Photo expired or missing", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
