/* Signup Sheets service worker — offline-first shell so sheets stay readable
   with no signal (Firestore's local cache supplies the data). Bump VERSION
   on each deploy. */
const VERSION = 'signup-v18';
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
  'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js', "./fonts/space-grotesk-latin.woff2", "./sws-prefs.js", "./sws-ui.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('signup-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const cacheable = url.origin === location.origin || url.hostname === 'www.gstatic.com';
  // Never intercept Firestore/Auth traffic — the SDK manages its own offline story.
  if (e.request.method !== 'GET' || !cacheable) return;
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
