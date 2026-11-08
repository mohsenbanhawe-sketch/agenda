// Offline cache for the agenda app. Bump VERSION when any file changes.
const VERSION = "agenda-v5";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];

// Fetch past the browser's HTTP cache so an update never stores a stale copy.
const fresh = url => fetch(new Request(url, { cache: "reload" }));

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(FILES.map(u => fresh(u).then(res => { if (res.ok) return c.put(u, res); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // The page itself: newest version when online (3 s limit), saved copy when offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([
          fresh("./"),
          new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 3000))
        ]);
        if (res && res.ok) { cache.put("./", res.clone()); return res; }
        throw new Error("bad");
      } catch (err) {
        return (await cache.match("./")) || (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // Icons and manifest: saved copy first, refreshed in the background.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
