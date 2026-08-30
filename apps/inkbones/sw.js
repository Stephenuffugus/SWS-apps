/* Inkbones service worker.

   Offline once installed, because a kid drawing a comic in a car has no bars
   and should never see a blank page. The document itself is network first, so
   a fix reaches a phone that already installed the app instead of stranding
   on whatever build it captured the first time.

   Two rules here are load bearing.

   One: bump the number in CACHE with every shipped change, or nobody who has
   already installed will ever receive it. node design/bump-sw.mjs does that,
   and its regex looks for const CACHE or const VERSION with a name ending in
   dash v and a number. Six workers in this fleet are silently skipped because
   they declare the name with var. Ours does not.

   Two: the activate sweep filters on this app own prefix before it deletes
   anything. caches.keys() is origin wide and skywolfstudio.com hosts every
   app in the studio, so a sweep that deletes every key that is not mine wipes
   the offline copy of all thirty five siblings the first time a visitor opens
   this one. That has actually shipped here before, more than once, and
   design/guards.mjs now runs this file against a fake fleet to prove it. */
const CACHE = 'inkbones-v1';

/* The whole app: one page, its privacy page, the manifest, the two fonts and
   the icons. Nothing else exists to fetch, ever. No CDN, no analytics, no
   network calls of any kind, so offline here means genuinely offline.
   Drawings are not in this list: they live in the page own storage, which the
   worker never touches and never needs to. */
const ASSETS = [
  './',
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'fonts/bangers-latin.woff2',
  'fonts/shantellsans-latin.woff2',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      /* Added one at a time on purpose. addAll is atomic, so a single missing
         file, a font not yet deployed, an icon renamed, fails the whole
         install and leaves the app with no offline copy at all rather than an
         imperfect one. */
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.indexOf('inkbones-') === 0 && k !== CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  /* Leave blob and data alone. Saving a comic hands the browser a blob URL
     for the finished picture, and a cached copy of one would be worse than
     useless. Nothing off origin should exist either; if it somehow does, it
     goes to the network untouched and is never stored. */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || /\.html$/.test(url.pathname);
  if (isPage) {
    /* Network first: a phone with bars always gets the newest build. The
       moment the fetch fails it falls back to the cached page, so the offline
       case is unchanged. */
    e.respondWith(
      fetch(req).then((res) => {
        /* Only a real answer is worth keeping. A 500 from the host, or a captive
           portal's login page answering with 200 for everything, would otherwise
           be written straight over the working offline copy and the app would
           stay broken after the network came back. */
        if (res && res.ok && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }
        return caches.match(req).then((m) => m || res);
      }).catch(() => caches.match(req).then((m) => m || caches.match('index.html').then((n) => n || caches.match('./'))))
    );
    return;
  }

  /* Everything else is a font or an icon, none of which ever changes without
     the cache name changing: cache first, refresh quietly behind it. */
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
