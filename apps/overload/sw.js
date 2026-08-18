/* OVERLOAD service worker — cache-first shell for offline basement gyms.
   Bump CACHE on every deploy so users pick up new versions. */
const CACHE = 'overload-v1';
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'icon.svg',
  'icon-192.png', 'icon-512.png', 'sws-ui.js',
  'fonts/big-shoulders-600-latin.woff2', 'fonts/big-shoulders-800-latin.woff2',
  'fonts/plex-mono-400-latin.woff2', 'fonts/plex-mono-600-latin.woff2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  /* Document network-first (a deploy shows on the first load), assets
     cache-first (the gym has no signal). */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
