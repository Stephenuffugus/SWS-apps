/* Packing List service worker, fully offline. Bump VERSION on deploy. */
const VERSION = 'pack-v28';
const ASSETS = ["./","./app.js","./apple-touch-icon.png","./helpers.js","./icon.svg","./index.html","./manifest.webmanifest","./vendor-qrcode.js", "./sws-prefs.js", "./sws-ui.js", "./sws-backup.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k.startsWith('pack-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  /* The PAGE is fetched network-first. Cache-first served the previous
     index.html on the FIRST load after every deploy, the browser only
     discovers a new sw.js during that same navigation, so a fix always
     appeared one visit late and looked exactly like "nothing changed".
     Assets stay cache-first; only the document leads with the network, and it
     still falls back to the cache the moment there is no signal. */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((cached) => {
    const fetched = fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || fetched;
  }));
});
