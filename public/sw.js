/* CutPro Studio service worker — offline-capable app shell.
   Strategy: icons/manifest/logo → cache-first; JS/CSS chunks & navigations →
   network-first with cache fallback (fresh in dev, offline-capable in prod). */
const VERSION = "cutpro-v3";
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-256.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(CORE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, cacheKey) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches
          .open(VERSION)
          .then((c) => c.put(cacheKey, copy))
          .catch(() => {});
      }
      return res;
    })
    .catch(() =>
      caches.match(cacheKey).then((hit) => hit || Response.error())
    );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // never intercept the AI API
  if (url.pathname.startsWith("/api/")) return;

  // rarely-changing assets → cache-first
  const isStable =
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/logo.svg";
  if (isStable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches
              .open(VERSION)
              .then((c) => c.put(req, copy))
              .catch(() => {});
            return res;
          })
      )
    );
    return;
  }

  // hashed/dev chunks → network-first (fresh always, cached when offline)
  if (url.pathname.startsWith("/_next/") || url.pathname === "/logo.svg") {
    event.respondWith(networkFirst(req, req));
    return;
  }

  // app navigations → network-first, offline fallback to cached shell
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "/"));
  }
});
