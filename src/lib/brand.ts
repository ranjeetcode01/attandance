import type { AppSettings } from "@/db/schema";

export const BUILTIN_LOGO = "/brand/jnt-logo.svg";
// Mark without the company-name line, for tight spaces such as the phone app header.
export const BUILTIN_LOGO_COMPACT = "/brand/jnt-mark.svg";

// Public URL of the company logo, or null when the generic app mark should be shown.
export function logoUrl(s: Pick<AppSettings, "logo" | "logoVersion">, variant: "full" | "compact" = "full"): string | null {
  if (s.logo === "custom" && s.logoVersion) return `/brand/logo?v=${s.logoVersion}`;
  if (s.logo === "builtin") return variant === "compact" ? BUILTIN_LOGO_COMPACT : BUILTIN_LOGO;
  return null;
}
