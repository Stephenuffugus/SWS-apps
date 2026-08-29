/* Beacon service worker: offline once installed, page network-first so a fix
   never strands on a stale device. Bump CACHE with every shipped change or
   nobody who already installed will ever receive it.

   Note this worker will never run on the hardware Beacon was written for.
   iOS 9 has no service worker at all, which is fine: the app needs the network
   to send anyway, and the outbox is what carries a message across a gap. This
   is here for the modern half of the audience, where an installed page that
   opens instantly is worth having. */
var CACHE = 'beacon-v3';
var ASSETS = [
  './',
  'index.html',
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
        if (k.indexOf('beacon-') === 0 && k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  /* Never touch Discord. A cached POST-adjacent response would be worse than
     useless, and a message must always go to the live network. */
  if (req.url.indexOf('discord') !== -1) return;

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
