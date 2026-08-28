/* Diamond Rules service worker: offline once installed, and the page itself
   is network first so a fix never strands on a stale phone. Bump CACHE with
   every shipped change or nobody who already installed ever receives it. */
var CACHE = 'diamond-v23';
var ASSETS = [
  './',
  'index.html',
  'icon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
  'fonts/anton.woff2',
  'fonts/nunito.woff2',
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
        /* caches.keys() is origin wide and every app in the studio shares
           skywolfstudio.com, so an unfiltered sweep here deletes the offline
           caches of Hush, Grocery List and everything else the visitor has
           installed. Only ever delete this app's own older versions. */
        if (k.indexOf('diamond-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  var isPage = req.mode === 'navigate' || url.pathname.endsWith('/index.html');
  if (isPage) {
    /* network first: a live phone always gets the newest build */
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./'); }); })
    );
    return;
  }
  /* everything else: cache first, refresh in the background */
  e.respondWith(
    caches.match(req).then(function (m) {
      var net = fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return m; });
      return m || net;
    })
  );
});
