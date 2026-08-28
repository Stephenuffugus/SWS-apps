/* Off the Ball service worker: offline once installed, and the page itself is
   network first so a fix never strands on a stale phone. Bump CACHE with
   every shipped change or nobody who already installed ever receives it. */
var CACHE = 'otb-v1';
var ASSETS = [
  './',
  'index.html',
  'icon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'manifest.webmanifest',
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
           skywolfstudio.com, so an unfiltered sweep here would delete the
           offline caches of every other app the visitor has installed.
           Only ever delete this app's own older versions. */
        if (k.indexOf('otb-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   /* the fonts look after themselves */

  /* The PAGE is network first. Cache first served the previous index.html on
     the first load after every deploy, because the browser only discovers a
     new sw.js during that same navigation, so a fix always arrived one open
     late. */
  var isPage = req.mode === 'navigate' || url.pathname.endsWith('/index.html');
  if (isPage) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('./'); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (m) {
      return m || fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copy = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return r;
      });
    })
  );
});
