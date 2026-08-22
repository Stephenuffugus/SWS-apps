/* Grade Sheet, offline first.
   The whole app is cached so it runs with the network off, which is both the
   feature (a school basement, a locked-down machine) and the proof: an app
   that works with Wi-Fi off is an app that cannot be sending grades anywhere. */
/* One constant, not two. design/bump-sw.mjs rewrites the first `VERSION` or
   `CACHE` it finds, so a worker that declares both ends up with a bumped name
   nothing reads and a cache name that never moves, the exact silent-stale
   failure the bump script exists to prevent. */
const CACHE = 'gradesheet-v13';
const ASSETS = [
  './', './index.html', './app.js', './grade.js', './roster.js', './store.js',
  './manifest.webmanifest', './icon.svg', './privacy.html',
  './sws-prefs.js', './sws-ui.js', "./fonts/fraunces-latin.woff2", "./sws-backup.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gradesheet-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
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
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html'))));
});
