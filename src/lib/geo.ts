export type GeoSite = { id: number; lat: number; lng: number; radiusM: number };

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// GPS accuracy is a radius of uncertainty, so a reading is given the benefit of
// that doubt up to `toleranceM` before being called outside the fence.
export function fenceCheck(site: GeoSite, lat: number, lng: number, accuracy: number, toleranceM: number) {
  const distanceM = haversineM(site.lat, site.lng, lat, lng);
  const slack = Math.min(Math.max(accuracy || 0, 0), toleranceM);
  return { distanceM, inside: distanceM - slack <= site.radiusM };
}

export function nearestSite<T extends GeoSite>(sites: T[], lat: number, lng: number) {
  let best: { site: T; distanceM: number } | null = null;
  for (const site of sites) {
    const distanceM = haversineM(site.lat, site.lng, lat, lng);
    if (!best || distanceM < best.distanceM) best = { site, distanceM };
  }
  return best;
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
