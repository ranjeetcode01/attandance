import { getSettings } from "@/lib/settings";
import { readLogo } from "@/lib/storage";

// Never run at build time: the handler reads the database.
export const dynamic = "force-dynamic";

// Uploaded company logo. Public on purpose: the login page shows it before sign-in.
export async function GET(request: Request) {
  const settings = await getSettings();
  if (settings.logo !== "custom" || !settings.logoExt) return new Response("No logo", { status: 404 });
  const logo = await readLogo(settings.logoVersion, settings.logoExt);
  if (!logo) return new Response("No logo", { status: 404 });

  // Versioned URLs (?v=) never change, so they can be cached for a year.
  const v = new URL(request.url).searchParams.get("v");
  const cache = v === String(settings.logoVersion) ? "public, max-age=31536000, immutable" : "no-cache";
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.type,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
