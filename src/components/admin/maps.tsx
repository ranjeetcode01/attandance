"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

// Default: OpenStreetMap tiles (free, no key; admin screens only, so usage stays light).
// Another provider (e.g. MapTiler with a free key) can be set with the two env vars.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER: [number, number] = [19.076, 72.8777];

type LeafletModule = typeof Leaflet;
async function loadLeaflet(): Promise<LeafletModule> {
  const mod = (await import("leaflet")) as LeafletModule & { default?: LeafletModule };
  return mod.default ?? mod;
}

function addBaseLayer(L: LeafletModule, map: Leaflet.Map) {
  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTR,
    maxZoom: 19,
    // The app sends no Referer to other sites (Referrer-Policy: same-origin), but the
    // OSM tile servers block requests without one — send just our origin for tiles.
    referrerPolicy: "strict-origin-when-cross-origin",
  }).addTo(map);
}

function brandColor(el: HTMLElement) {
  return getComputedStyle(el).getPropertyValue("--brand").trim() || "#c84508";
}

export type MapSite = { lat: number; lng: number; radiusM: number; label: string };
export type MapPoint = { lat: number; lng: number; label: string; inside: boolean; open: boolean };

export function SitesMap({ sites, points = [], height = 360 }: { sites: MapSite[]; points?: MapPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: Leaflet.Map | undefined;
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !ref.current) return;
      const color = brandColor(ref.current);
      map = L.map(ref.current, { scrollWheelZoom: false });
      addBaseLayer(L, map);
      const bounds = L.latLngBounds([]);
      for (const s of sites) {
        L.circle([s.lat, s.lng], { radius: s.radiusM, color, weight: 2, fillOpacity: 0.08 }).bindTooltip(s.label).addTo(map);
        bounds.extend([s.lat, s.lng]);
      }
      for (const p of points) {
        L.circleMarker([p.lat, p.lng], {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillColor: !p.inside ? "#dc2626" : p.open ? "#059669" : "#475569",
          fillOpacity: 1,
        })
          .bindTooltip(p.label)
          .addTo(map);
        bounds.extend([p.lat, p.lng]);
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.25), { maxZoom: 17 });
      else map.setView(DEFAULT_CENTER, 10);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [sites, points]);
  return <div ref={ref} style={{ height }} className="w-full overflow-hidden rounded-xl" />;
}

// Parses "19.21, 72.97" or a Google Maps link containing @lat,lng / q=lat,lng.
function parseCoords(text: string): [number, number] | null {
  const m = text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export function GeofenceEditor({ lat: lat0, lng: lng0, radiusM: r0, others }: { lat: number; lng: number; radiusM: number; others: MapSite[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: LeafletModule; map: Leaflet.Map; circle: Leaflet.Circle; dot: Leaflet.CircleMarker } | null>(null);
  const [lat, setLat] = useState(lat0);
  const [lng, setLng] = useState(lng0);
  const [radius, setRadius] = useState(r0);
  const [paste, setPaste] = useState("");
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const hasPoint = !(lat === 0 && lng === 0);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !ref.current) return;
      const color = brandColor(ref.current);
      const map = L.map(ref.current);
      addBaseLayer(L, map);
      for (const s of others) {
        L.circle([s.lat, s.lng], { radius: s.radiusM, color: "#64748b", weight: 1, dashArray: "4 4", fillOpacity: 0.04 }).bindTooltip(s.label).addTo(map);
      }
      const start: [number, number] = lat0 || lng0 ? [lat0, lng0] : DEFAULT_CENTER;
      const circle = L.circle(start, { radius: r0, color, weight: 2, fillOpacity: 0.12 }).addTo(map);
      const dot = L.circleMarker(start, { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      map.setView(start, lat0 || lng0 ? 17 : 11);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        setLat(Number(e.latlng.lat.toFixed(6)));
        setLng(Number(e.latlng.lng.toFixed(6)));
      });
      mapRef.current = { L, map, circle, dot };
    });
    return () => {
      cancelled = true;
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
    // map is created once; later changes are applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !hasPoint) return;
    m.circle.setLatLng([lat, lng]);
    m.circle.setRadius(radius);
    m.dot.setLatLng([lat, lng]);
  }, [lat, lng, radius, hasPoint]);

  function centerOn(la: number, ln: number) {
    setLat(Number(la.toFixed(6)));
    setLng(Number(ln.toFixed(6)));
    mapRef.current?.map.setView([la, ln], 17);
  }

  function useMyLocation() {
    setGpsMsg("Getting location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        centerOn(p.coords.latitude, p.coords.longitude);
        setGpsMsg(`Set from your GPS (±${Math.round(p.coords.accuracy)} m)`);
      },
      () => setGpsMsg("Could not read your location."),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  return (
    <div className="space-y-3">
      <div ref={ref} className="h-80 w-full overflow-hidden rounded-xl ring-1 ring-line" />
      <p className="text-xs text-muted">Click on the map to set the site centre. Dashed circles are other sites.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Latitude</label>
          <input name="lat" className="input" type="number" step="0.000001" value={lat} onChange={(e) => setLat(Number(e.target.value))} required />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input name="lng" className="input" type="number" step="0.000001" value={lng} onChange={(e) => setLng(Number(e.target.value))} required />
        </div>
        <div>
          <label className="label">Radius: {radius} m</label>
          <input name="radiusM" type="range" min={30} max={1000} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-[var(--brand)]" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={useMyLocation}>
          Use my current location
        </button>
        <input className="input max-w-xs py-1 text-xs" placeholder="Paste Google Maps link or 'lat, lng'" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const c = parseCoords(paste);
            if (c) {
              centerOn(c[0], c[1]);
              setGpsMsg("Location set from pasted text");
            } else setGpsMsg("No coordinates found in that text.");
          }}
        >
          Apply
        </button>
        {gpsMsg && <span className="text-xs text-muted">{gpsMsg}</span>}
      </div>
    </div>
  );
}
