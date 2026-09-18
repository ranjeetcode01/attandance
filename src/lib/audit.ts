import "server-only";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(actorId: number | null, action: string, entity: string, entityId: string | number, data: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(auditLogs).values({ actorId, action, entity, entityId: String(entityId), data });
}
