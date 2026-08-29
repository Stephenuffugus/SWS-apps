/* Music Studio service worker: offline once installed, page network-first so a fix
   never strands on a stale device. Bump CACHE with every shipped change or
   nobody who already installed will ever receive it.

   The whole app is one 228KB file with no assets and no network calls of its
   own, so once this is installed the studio works with the wifi off entirely,
   which is the point: a sequencer you can open on a bus. */
var CACHE = 'studio-v1';
var ASSETS = [
  './',
  'index.html',
  'icon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* Only ever delete OUR old caches. Three apps in this fleet once wiped
           every sibling app's cache on activation because this test was absent. */
        if (k.indexOf('studio-') === 0 && k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  /* Google Fonts is the one external thing this app loads. Let it cache like
     any other asset; if it never arrives the CSS falls back and the studio is
     merely less pretty, not broken. */

  if (req.mode === 'navigate' || /\.html$/.test(req.url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req).then(function (m) {
        return m || caches.match('index.html');
      }); })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (m) {
      return m || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
