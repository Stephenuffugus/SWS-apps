/* Scan to PDF service worker — fully offline. Bump VERSION on deploy. */
const VERSION = 'scan-v13';
const ASSETS = ["./","./app.js","./apple-touch-icon.png","./helpers.js","./icon.svg","./index.html","./manifest.webmanifest","./pdf.js","./vendor-pdf-lib.js", "./fonts/space-grotesk-latin.woff2", "./sws-prefs.js", "./sws-ui.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k.startsWith('scan-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((cached) => {
    const fetched = fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || fetched;
  }));
});
