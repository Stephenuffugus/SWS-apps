/* Caregiver Log service worker, offline-first shell. Bump VERSION on deploy. */
const VERSION = 'care-v27';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './helpers.js',
  './firebase-config.js',
  './vendor-qrcode.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js', "./fonts/fraunces-latin.woff2", "./sws-prefs.js", "./sws-ui.js", "./sws-backup.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('care-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const cacheable = url.origin === location.origin || url.hostname === 'www.gstatic.com';
  if (e.request.method !== 'GET' || !cacheable) return;

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
  e.respondWith(
    caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then((cached) => {
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
