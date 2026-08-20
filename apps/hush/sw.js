/* HUSH service worker — offline shell for a single self-contained app.

   Rewritten 2026-08-16. The original had three problems that matter on a
   shared origin, all of which this fleet has been bitten by before:

   1. Its activate handler deleted EVERY cache whose key was not its own.
      caches.keys() is ORIGIN-wide, so on lucidwinds.com it would have wiped
      PadLab and every satellite the first time anyone opened Hush. It now
      only ever deletes hush-* caches.
   2. Navigations were served cache-first, so a returning visitor could sit on
      old HTML indefinitely. They are network-first with an explicit
      cache:'no-cache' refetch, because this host's stale-while-revalidate
      will otherwise hand back day-old HTML.
   3. The fetch fallback could resolve to undefined, and respondWith(undefined)
      is a black screen. Every path here settles with a real Response.

   Bump SHELL_VERSION on every deploy, AND the ?v= on the registration in
   index.html in lockstep — this host edge-pins bare sw.js URLs for 7 days. */

const SHELL_VERSION = "hush-shell-v9";
const NAV_TIMEOUT_MS = 8000;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_VERSION)
      // one at a time: addAll fails the whole install if any single asset 404s
      .then(cache => Promise.all(
        SHELL_ASSETS.map(url =>
          fetch(url, { cache: "no-cache", credentials: "same-origin" })
            .then(res => (res && res.ok) ? cache.put(url, res) : null)
            .catch(() => null)
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k =>
          // ONLY our own caches. Everything else on this origin belongs to
          // another app and is none of our business.
          k.indexOf("hush-") === 0 && k !== SHELL_VERSION
        ).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Something real to paint when network and cache have both gone.
function offlineFallback() {
  return new Response(
    "<!DOCTYPE html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
    "<body style='background:#0a0d14;color:#e8eaf0;font-family:system-ui;display:flex;align-items:center;" +
    "justify-content:center;height:100vh;margin:0;text-align:center'><div><h1 style='color:#8fb9a8'>Hush</h1>" +
    "<p>Can't reach the app right now.<br>Check your connection and reload.</p></div></body>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function navTimeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve(null), ms));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
          .then(res => {
            if (res && res.redirected) return Response.redirect(res.url);
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(SHELL_VERSION).then(c => c.put("./index.html", copy)).catch(() => {});
              return res;
            }
            return res || null;
          })
          .catch(() => null),
        navTimeout(NAV_TIMEOUT_MS)
      ]).then(res =>
        res ||
        caches.match("./index.html").then(hit =>
          hit || caches.match("./").then(h2 => h2 || offlineFallback())
        )
      )
    );
    return;
  }

  // Same-origin subresources (manifest, icons) — cache-first, refresh behind.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(hit => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(SHELL_VERSION).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit || new Response("", { status: 504 }));
        return hit || network;
      })
    );
  }
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
