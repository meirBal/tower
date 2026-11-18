// Pay or Wait (iPhone web app) — service worker: installs to the home screen and shows push notifications.
// The page itself always comes from the network when there is one; Supabase calls never go through here.
const CACHE = "pow-12";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-180.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pow-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
    .catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
});

// push from the pow edge function: {title, body}
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data ? e.data.text() : "Pay or Wait" }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || "Pay or Wait", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: "pow-" + Date.now() });
    // an open app refreshes right away
    for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage("refresh");
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow("./");
  })());
});
