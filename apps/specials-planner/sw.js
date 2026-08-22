/* Specials Planner service worker, cache-first shell for offline use.
   Bump CACHE on every deploy so users pick up new versions. */
const CACHE = 'specials-planner-v40';
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'fonts/fraunces-latin.woff2', 'fonts/spline-sans-latin.woff2', "./sws-prefs.js", "./sws-ui.js", "./sws-backup.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    /* caches.keys() is ORIGIN-wide. This origin hosts thirty sibling apps, so
       deleting every key that is not ours wipes their offline shells the first
       time anyone opens the planner. Only ever delete our own namespace. */
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('specials-planner-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  /* The PAGE is fetched network-first. Cache-first served the previous
     index.html on the FIRST load after every deploy, the browser only
     discovers a new sw.js during that same navigation, so the fix always
     appeared one visit late and looked exactly like "nothing changed".
     Assets below stay cache-first; only the document leads with the network,
     and it still falls back to the cache the moment there is no signal. */
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
  // Never intercept cross-origin traffic (Google auth/API for the Drive feature)
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
