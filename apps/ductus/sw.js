/* DUCTUS service worker (the Saccade pattern): offline once installed, and the page itself is network first so a fix
   never strands on a stale phone. Bump CACHE with every shipped change (and BUILD in src/build.mjs) or nobody who
   already installed ever receives it. */
var CACHE = 'ductus-v1';
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
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    /* caches.keys() is origin wide and every app in the studio shares skywolfstudio.com: only ever delete this app's own older versions */
    return Promise.all(keys.map(function (k) { if (k.indexOf('ductus-') === 0 && k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var isPage = req.mode === 'navigate' || url.pathname.slice(-10) === 'index.html' || url.pathname.slice(-1) === '/';
  if (isPage) {
    /* network first with a timeout; a hung fetch must never leave a black screen (the fleet's service worker law) */
    e.respondWith(new Promise(function (resolve) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; caches.match('index.html').then(function (c) { resolve(c || fetch(req)); }); } }, 3500);
      fetch(req).then(function (r) {
        if (done) return; done = true; clearTimeout(t);
        if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put('index.html', copy); }); }
        resolve(r);
      }).catch(function () { if (done) return; done = true; clearTimeout(t); caches.match('index.html').then(function (c) { resolve(c || Response.error()); }); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (c) { return c || fetch(req).then(function (r) { if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (cc) { cc.put(req, copy); }); } return r; }); }));
});
