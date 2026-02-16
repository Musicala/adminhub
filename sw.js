/* sw.js — Practicantes · Musicala (PWA)
   Estrategia:
   - Precachéa archivos core (sin romperse si falta alguno)
   - Navegación: network-first con fallback offline a index.html
   - Assets same-origin: stale-while-revalidate
*/
const BUILD = "2026-02-15.1";
const VERSION = "v3-" + BUILD;
const CACHE_STATIC = `practicantes-static-${VERSION}`;
const CACHE_RUNTIME = `practicantes-runtime-${VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];


self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);

    // No usamos addAll porque si falta 1 archivo, se cae toda la instalación.
    await Promise.allSettled(
      CORE_ASSETS.map(async (url) => {
        try { await cache.add(url); } catch (_) {}
      })
    );

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k === CACHE_STATIC || k === CACHE_RUNTIME) ? null : caches.delete(k))
    );
    self.clients.claim();

    // Avisar a las pestañas abiertas que hay una versión activa
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "SW_ACTIVATED", version: VERSION });
    }
})());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navegación (cambiar vistas, refresh, deep links)
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match("./index.html")) || (await caches.match("./")) ||
          new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // Archivos del mismo dominio: Stale-While-Revalidate
  if (sameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_RUNTIME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          return null;
        }
      })();

      return cached || (await fetchPromise) || new Response("", { status: 504 });
    })());
    return;
  }

  // Externo (Firebase CDN, etc): passthrough
});
