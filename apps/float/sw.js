/* Float service worker — the only sanctioned sibling of index.html.
   Bump VERSION on every deploy.

   Cache-first for the shell, and the shell is the whole app: one HTML file,
   one manifest, one icon. There is nothing else to fetch, ever — no CDN, no
   fonts, no tiles, no analytics — so "offline" here means genuinely offline,
   in a gravel pit with no bars, which is where this app is used.

   Photos and finds are NOT cached here. They live in IndexedDB, which the
   service worker never touches and never needs to. */
const VERSION = 'float-v5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './privacy.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      /* Individually, so one missing optional icon cannot fail the whole
         install and leave the app with no offline copy at all. */
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('float-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // nothing off-origin should exist; if it does, do not cache it

  /* A navigation always resolves to the shell, so a deep link like #/map
     opens offline exactly as it does online — but it asks the NETWORK first.
     Serving the cached shell first meant the previous build was handed back on
     the first load after every deploy, because the browser only discovers a
     new sw.js during that same navigation. Offline is unchanged: the moment
     the fetch fails it falls straight back to the cached shell. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
