/* sw.js — Musicala Admin Hub (PWA)
   Estrategia:
   - Instala y activa de inmediato la nueva version.
   - Navegacion y archivos principales: network-first con cache no-store.
   - Assets secundarios: cache con actualizacion en segundo plano.
*/
const BUILD = "2026-07-17.1";
const VERSION = "admin-hub-" + BUILD;
const CACHE_STATIC = `musicala-admin-static-${VERSION}`;
const CACHE_RUNTIME = `musicala-admin-runtime-${VERSION}`;

const CORE_ASSETS = [
  `./?v=${BUILD}`,
  `./index.html?v=${BUILD}`,
  `./styles.css?v=${BUILD}`,
  `./app.js?v=${BUILD}`,
  `./manifest.webmanifest?v=${BUILD}`,
  `./reset.html?v=${BUILD}`,
  "./logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

const NETWORK_FIRST_PATHS = new Set([
  new URL("./", self.location.href).pathname,
  new URL("./index.html", self.location.href).pathname,
  new URL("./styles.css", self.location.href).pathname,
  new URL("./app.js", self.location.href).pathname,
  new URL("./manifest.webmanifest", self.location.href).pathname,
  new URL("./reset.html", self.location.href).pathname,
  new URL("./sw.js", self.location.href).pathname
]);

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "CLEAR_CACHE") {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    })());
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await Promise.allSettled(
      CORE_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (response.ok) await cache.put(url, response.clone());
        } catch (_) {}
      })
    );
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => (key === CACHE_STATIC || key === CACHE_RUNTIME) ? null : caches.delete(key))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "SW_ACTIVATED", version: VERSION, build: BUILD });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(`./index.html?v=${BUILD}`, fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(`./index.html?v=${BUILD}`)) ||
          (await caches.match("./index.html")) ||
          new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "reload" });
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match(url.pathname)) || new Response("", { status: 504 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchAndStore = (async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return null;
      }
    })();
    return cached || (await fetchAndStore) || new Response("", { status: 504 });
  })());
});
