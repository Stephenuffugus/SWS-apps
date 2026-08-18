/* Cross Off service worker — cache-first shell for offline use.
   Bump CACHE on every deploy so users pick up new versions. */
const CACHE = 'cross-off-v4';
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'icon.svg',
  'icon-192.png', 'icon-512.png', 'sws-ui.js',
  'fonts/caveat-700-latin.woff2', 'fonts/patrick-hand-latin.woff2'];
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

  /* The PAGE is fetched network-first: cache-first serves the previous
     index.html on the first load after every deploy, which looks exactly
     like "nothing changed". Assets stay cache-first. */
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
