// Offline cache for the agenda app. Bump VERSION when any file changes.
const VERSION = "agenda-v11";
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

// ---------- reminder notifications sent from the server ----------
const SB_URL = "https://liltsgeczpyhombdlliz.supabase.co", SB_KEY = "sb_publishable_zj7hN2shGMwuRuV6AvQ6uQ_d0oNPPks";

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "أجندتي", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "🔔 تذكير بمهمة", {
    body: d.body || "لديك مهمة معلقة",
    tag: d.tag || "agenda",
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 150, 300, 150, 300],
    dir: "rtl", lang: "ar",
    icon: "icon-192.png", badge: "icon-192.png",
    data: { id: d.id, space: d.space },
    actions: d.id ? [{ action: "snooze", title: "غفوة 10 دقائق" }, { action: "done", title: "تمت ✓" }] : []
  }));
});

self.addEventListener("notificationclick", e => {
  const n = e.notification, d = n.data || {};
  n.close();
  if ((e.action === "done" || e.action === "snooze") && d.id && d.space) {
    e.waitUntil(fetch(SB_URL + "/rest/v1/rpc/agenda_task_action", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
      body: JSON.stringify({ p_space: d.space, p_id: d.id, p_action: e.action, p_minutes: 10 })
    }).catch(() => {}).then(() => self.clients.matchAll({ type: "window" })).then(list => list.forEach(c => c.postMessage({ type: "agenda-sync" }))));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
