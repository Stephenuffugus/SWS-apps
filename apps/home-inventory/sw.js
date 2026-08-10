/* Home Inventory service worker — the app is local-first; cache everything,
   including the vendored pdf-lib, so exports work fully offline. */
const VERSION = 'inventory-v16';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './model.js',
  './pdf.js',
  './zip.js',
  './store.js',
  './vendor-pdf-lib.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png', "./fonts/space-grotesk-latin.woff2", "./sws-prefs.js", "./sws-ui.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('inventory-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
