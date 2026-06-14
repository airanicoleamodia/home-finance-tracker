// Offline-friendly service worker.
// NOTE: bump CACHE on every meaningful change so old caches are purged on activate.
const CACHE = "hft-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  // Never touch non-GET or cross-origin (e.g. Supabase API) requests.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // App shell / HTML navigations: network-first so a new deploy is picked up
  // immediately; fall back to cache only when offline. This is what prevents
  // the app from getting "stuck" on an old cached build.
  const isHTML =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
  if (isHTML) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/index.html")))
    );
    return;
  }

  // Other same-origin assets (content-hashed JS/CSS, icons): cache-first is safe
  // because their filenames change when the content changes.
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
    )
  );
});
