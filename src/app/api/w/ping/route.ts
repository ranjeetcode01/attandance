export const dynamic = "force-dynamic";

// Lightweight clock + connectivity check for the worker app. No auth needed.
export function GET() {
  return Response.json({ serverTime: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
