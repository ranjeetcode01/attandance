"use client";

// time = GPS fix timestamp (from the phone), receivedAt = when the app got it (Date.now()).
export type Fix = { lat: number; lng: number; accuracy: number; time: number; receivedAt: number };

type Listener = { onFix: (f: Fix) => void; onError: (msg: string, code: number) => void };

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 60_000, maximumAge: 0 };
const listeners = new Set<Listener>();
let watchId: number | null = null;
let last: Fix | null = null;

export function geoErrorText(err: { code?: number; message?: string }): string {
  if (err.code === 1) return "Location permission denied. Allow location for this app in phone settings.";
  if (err.code === 2) return "Location unavailable. Turn on GPS / Location.";
  if (err.code === 3) return "GPS is taking too long. Move to open sky and try again.";
  return err.message || "Could not get location.";
}

const supported = () => typeof navigator !== "undefined" && "geolocation" in navigator;

// One shared watch for the whole app. Restarting it is the reliable way to get a
// fresh fix: getCurrentPosition() can hang while another watch is active.
function startWatch() {
  if (!supported()) return;
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      last = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, time: p.timestamp, receivedAt: Date.now() };
      for (const l of [...listeners]) l.onFix(last);
    },
    (e) => {
      for (const l of [...listeners]) l.onError(geoErrorText(e), e.code);
    },
    OPTIONS,
  );
}

function stopIfIdle() {
  if (listeners.size === 0 && watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function watchFix(onFix: (f: Fix) => void, onError: (msg: string) => void) {
  if (!supported()) {
    queueMicrotask(() => onError("This phone/browser has no GPS support."));
    return () => {};
  }
  const l: Listener = { onFix, onError };
  listeners.add(l);
  if (last) {
    const cached = last;
    queueMicrotask(() => onFix(cached));
  }
  if (watchId == null) startWatch();
  return () => {
    listeners.delete(l);
    stopIfIdle();
  };
}

// A fix no older than `maxAgeMs`. GPS works without internet; the first fix may be slow offline.
export function freshFix(maxAgeMs = 15_000, timeoutMs = 25_000): Promise<Fix> {
  if (last && Date.now() - last.receivedAt < maxAgeMs && last.accuracy <= 100) return Promise.resolve(last);
  if (!supported()) return Promise.reject(new Error("This phone/browser has no GPS support."));
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      listeners.delete(l);
      stopIfIdle();
    };
    const l: Listener = {
      onFix: (f) => {
        done();
        resolve(f);
      },
      onError: (msg, code) => {
        if (code === 3) return; // keep waiting until our own timeout
        done();
        reject(new Error(msg));
      },
    };
    const timer = setTimeout(() => {
      done();
      // A slightly older fix is better than failing the punch.
      if (last && Date.now() - last.receivedAt < 120_000) resolve(last);
      else reject(new Error(geoErrorText({ code: 3 })));
    }, timeoutMs);
    listeners.add(l);
    startWatch();
  });
}
