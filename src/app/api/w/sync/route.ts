import { apiUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { syncBody } from "@/lib/sync-schema";
import { processLabour, processPunch, processRequest, RejectError } from "@/lib/sync-server";

// Receives one queued item from the phone's offline outbox.
// `retry: false` tells the phone to stop retrying and show the error instead.
export async function POST(request: Request) {
  const user = await apiUser();
  if (!user) return Response.json({ error: "Session expired. Please log in again.", retry: true, auth: true }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const parsed = syncBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid data: " + parsed.error.issues[0]?.message, retry: false }, { status: 422 });
  }
  const { item, deviceId, sentAt } = parsed.data;
  const settings = await getSettings();

  try {
    const result =
      item.kind === "punch"
        ? await processPunch(user, item.id, item.payload, {
            deviceId,
            sentAt,
            settings,
            userAgent: request.headers.get("user-agent") ?? "",
          })
        : item.kind === "labour"
          ? await processLabour(user, item.id, item.payload, { sentAt, settings })
          : await processRequest(user, item.id, item.payload);
    return Response.json({ ok: true, result, serverTime: Date.now() });
  } catch (err) {
    if (err instanceof RejectError) {
      return Response.json({ error: err.message, retry: false, serverTime: Date.now() }, { status: 422 });
    }
    console.error("[sync]", err);
    return Response.json({ error: "Server error, will retry.", retry: true }, { status: 500 });
  }
}
