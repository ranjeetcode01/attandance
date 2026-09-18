/* Site Attendance service worker
 * - keeps the worker app (/w) and its JS/CSS available offline
 * - sends the offline outbox in the background when the network returns (Android Chrome)
 * IndexedDB names must match src/lib/client/store.ts
 */
const VERSION = "v3";
const STATIC_CACHE = `sa-static-${VERSION}`;
const PAGE_CACHE = `sa-pages-${VERSION}`;
const OFFLINE_PAGES = ["/w"];
// Small files the /w header needs even on the very first offline open.
const PRECACHE_STATIC = ["/brand/jnt-mark.svg", "/brand/jnt-logo.svg", "/icons/icon-192.png"];
const STATIC_MAX_ENTRIES = 250;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGE_CACHE);
      const statics = await caches.open(STATIC_CACHE);
      const get = async (cache, path, key) => {
        try {
          const res = await fetch(path, { credentials: "same-origin" });
          if (res.ok && !res.redirected) await cache.put(key, res);
        } catch {
          /* offline during install — cached on next visit */
        }
      };
      for (const path of OFFLINE_PAGES) await get(pages, path, path);
      for (const path of PRECACHE_STATIC) await get(statics, path, new URL(path, self.location.origin).href);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const old = keys.filter((k) => k.startsWith("sa-") && k !== STATIC_CACHE && k !== PAGE_CACHE);
      // Carry over JS/CSS/logo files cached by the previous version (JS/CSS URLs are
      // content-hashed, logos are refreshed in the background), so an app update does not
      // leave the next offline open without them.
      const statics = await caches.open(STATIC_CACHE);
      for (const name of old.filter((k) => k.startsWith("sa-static-"))) {
        const prev = await caches.open(name);
        for (const req of await prev.keys()) {
          if (await statics.match(req)) continue;
          const res = await prev.match(req);
          if (res) await statics.put(req, res);
        }
      }
      await Promise.all(old.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CACHE_URLS") {
    event.waitUntil(cacheUrls(event.data.urls || []));
  }
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
// Company logo: kept for offline use but refreshed in the background (same URL can change).
const isBrand = (url) => url.pathname.startsWith("/brand/");

async function cacheUrls(urls) {
  const staticCache = await caches.open(STATIC_CACHE);
  const pageCache = await caches.open(PAGE_CACHE);
  for (const u of urls) {
    const url = new URL(u, self.location.origin);
    if (url.origin !== self.location.origin) continue;
    const stat = isStatic(url) || isBrand(url);
    const cache = stat ? staticCache : pageCache;
    const key = stat ? url.href : url.pathname;
    if (stat && (await cache.match(key))) continue;
    try {
      const res = await fetch(url.href, { credentials: "same-origin" });
      if (res.ok && !res.redirected) await cache.put(key, res);
    } catch {
      /* ignore */
    }
  }
  await trim(staticCache, STATIC_MAX_ENTRIES);
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // the app handles API failures itself

  if (isStatic(url)) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" && OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(networkFirstPage(req, url.pathname));
  } else if (isBrand(url) || ["/manifest.webmanifest", "/icon.png", "/apple-icon.png"].includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}

async function networkFirstPage(req, key) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000))]);
    if (res.ok && !res.redirected && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    return new Response(
      '<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:2rem;text-align:center"><h2>No internet</h2><p>Open the app once with internet so it can work offline.</p><button onclick="location.reload()">Retry</button></body>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

// ---------------------------------------------------------------- background sync

self.addEventListener("sync", (event) => {
  if (event.tag === "outbox-sync") event.waitUntil(flushOutbox());
});

function reqToPromise(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb() {
  return new Promise((resolve) => {
    const r = indexedDB.open("site-attendance");
    // Never create the database here — the page owns the schema.
    r.onupgradeneeded = () => r.transaction.abort();
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("outbox")) {
        db.close();
        resolve(null);
      } else resolve(db);
    };
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
}

const store = (db, name, mode) => db.transaction(name, mode).objectStore(name);

async function flushOutbox() {
  const db = await openDb();
  if (!db) return;
  try {
    const items = (await reqToPromise(store(db, "outbox", "readonly").getAll())).filter((i) => !i.failed).sort((a, b) => a.createdAt - b.createdAt);
    if (!items.length) return;
    const deviceId = await reqToPromise(store(db, "kv", "readonly").get("deviceId"));
    if (!deviceId) return;
    let sent = 0;
    for (const item of items) {
      const { label, createdAt, attempts, lastError, failed, ...wire } = item;
      const res = await fetch("/api/w/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ deviceId, sentAt: Date.now(), item: wire }),
      }); // a network error rejects → the browser retries this sync later
      const data = await res.json().catch(() => ({}));
      if (typeof data.serverTime === "number") {
        await reqToPromise(store(db, "kv", "readwrite").put({ serverTime: data.serverTime, deviceTime: Date.now() }, "clock"));
      }
      if (res.ok && data.result) {
        await reqToPromise(
          store(db, "done", "readwrite").put({
            id: item.id,
            kind: item.kind,
            label,
            message: data.result.message,
            status: data.result.status,
            flags: data.result.flags,
            createdAt,
            syncedAt: Date.now(),
          }),
        );
        await reqToPromise(store(db, "outbox", "readwrite").delete(item.id));
        sent++;
      } else if (res.status === 401) {
        break;
      } else if (data.retry === false) {
        await reqToPromise(store(db, "outbox", "readwrite").put({ ...item, attempts: attempts + 1, failed: true, lastError: data.error || `Error ${res.status}` }));
      } else {
        await reqToPromise(store(db, "outbox", "readwrite").put({ ...item, attempts: attempts + 1, lastError: data.error || `Error ${res.status}` }));
        throw new Error("server busy, retry later");
      }
      void lastError;
      void failed;
    }
    if (sent) {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "SYNCED", sent }));
    }
  } finally {
    db.close();
  }
}
