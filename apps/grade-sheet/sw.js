/* Grade Sheet — offline first.
   The whole app is cached so it runs with the network off, which is both the
   feature (a school basement, a locked-down machine) and the proof: an app
   that works with Wi-Fi off is an app that cannot be sending grades anywhere. */
/* One constant, not two. design/bump-sw.mjs rewrites the first `VERSION` or
   `CACHE` it finds, so a worker that declares both ends up with a bumped name
   nothing reads and a cache name that never moves — the exact silent-stale
   failure the bump script exists to prevent. */
const CACHE = 'gradesheet-v1';
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
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html'))));
});
