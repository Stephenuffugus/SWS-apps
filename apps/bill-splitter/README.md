# Bill Splitter

Split a dinner bill or trip expenses in seconds. **No account, no ads, no server —
nothing leaves your device.** A free tool by SWS Strategic Media LLC.

## The one rule that must never break

This app does **arithmetic** and hands off to payment apps via links
(Venmo / Cash App / PayPal.me), always with a copy-the-amount fallback.
It must **never** hold, transfer, or escrow funds — no in-app payments, no wallet,
no balances, no "we'll collect and distribute." Custody is what triggers money
transmitter registration, PCI scope, and KYC. No custody → none of it applies.

All payment deep links live in the single `Pay` module in `index.html`.
Schemes change; update them there and nowhere else.

## How it works

- **Vanilla HTML/CSS/JS PWA. No build step.** Open `index.html` — that's the app.
- **All state lives in the URL** — compressed JSON in the hash fragment
  (deflate via the native `CompressionStream` API, base64url-encoded, `#1.…`;
  falls back to uncompressed `#0.…` on old browsers). Hash fragments are never
  sent to any server, which is both the privacy story and why no backend exists.
- **IndexedDB** caches your own splits locally ("Saved" tab) plus recent names
  and payment handles for quick re-adds.
- **Money math** is integer cents everywhere, with largest-remainder allocation
  so per-person shares always sum exactly to the total.
- **Settle-up minimization** (trip mode): greedy matching over net balances,
  guaranteed ≤ n−1 transfers.
- **QR sharing** uses a vendored copy of
  [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  (MIT, Kazuhiko Arase) in `vendor-qrcode.js` — bundled locally so it works offline.

## Run locally

Any static file server:

```sh
cd apps/bill-splitter
python3 -m http.server 8080
# open http://localhost:8080
```

(Opening `index.html` via `file://` also works; the service worker just won't register.)

## Tests

```sh
cd apps/bill-splitter
npm i --no-save jsdom     # only dev dependency, only needed for the smoke test
node test/unit.mjs        # money math, settle-up, codec, sanitizer (incl. fuzz)
node test/smoke.mjs       # drives the real UI in jsdom
```

## Deploy

Copy the five files to any static host (Cloudflare Pages, Netlify, GitHub Pages…).
No server config needed. Bump `VERSION` in `sw.js` on each deploy so clients pick
up the new build.

## Configure

Edit the `CONFIG` block at the top of the script in `index.html`:

- `tipUrl` — paste a Ko-fi / PayPal / Stripe payment-link URL to show the
  tip-jar button (hidden while empty).
- `appName`, `orgName`, `tagline` — branding.

## Deliberately not built

Accounts, friend graphs, notifications, payment reminders, social feeds,
expense-history sync. Per the product doc: every one of those is why the
incumbents got bad.
