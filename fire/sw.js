// מהמדורה למעצמה — service worker: התקנה לטלפון ומשחק גם בלי אינטרנט.
// הרשת קודמת (תמיד הגרסה האחרונה), ובלי רשת — מהמטמון. נוגע רק במטמונים שמתחילים ב-"fire-".
const CACHE = "fire-1.0.0";
const SHELL = ["./", "./index.html", "./style.css", "./js/engine.js", "./js/game.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("fire-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
});
