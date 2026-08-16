# Trackfit and the studio — decision

Written 2026-08-16, after four independent analysis passes over
`github.com/Stephenuffugus/trackfit` (pnpm monorepo, Vite + React 18 + TS,
7 packages, 207 files) and this repo.

Every claim below marked **verified** was checked against source or the live
production bundle. Claims marked *judgement* are opinion and yours to overrule.

---

## The short answer

**Move the brand and the domain. Do not move the repository. Keep it off Play.**

"Move it into the apps studio" turns out to mean three separable things, and
they have different answers:

| | Verdict |
|---|---|
| One company, one front door, one set of practices | **yes** |
| Off `trackfit.stevieweedseed.com` onto a studio domain | **yes, and it gets more expensive the longer you wait** |
| Same git repo, served from `sws-apps-9646d.web.app/trackfit/` | **no** |
| Sky Wolf Studios Play account | **no — not in year one** |

---

## What is *not* a reason to say no

The mechanical objections everyone expects don't exist. **Verified:**

- `vite.config.ts` already reads `VITE_BASE_PATH`, written for an earlier
  GitHub Pages subpath. `VITE_BASE_PATH=/trackfit/ pnpm build` produces a
  correct bundle; every asset 200s under the subpath.
- The manifest already uses `"start_url": "./"` and `"scope": "./"`.
- **There is no router anywhere** in `apps/web/src` or `packages` — so
  `firebase.json` would need no `rewrites` block.
- The service worker self-scopes to `/trackfit/`; offline survives untouched.
- 964K across 12 files makes it the *second*-largest app here. signup-sheets
  is 1558K. Size is not an honest objection.

So the answer has to be made on brand and operations grounds, not technical ones.

## Why the subpath still loses

Vendoring a Vite `dist/` into a repo whose entire selling point is "no build
step" replaces a CI-gated automatic deploy with a human remembering six steps
in the right order across two repos and two package managers. **The failure
mode is a silently stale `/trackfit/` that nobody notices, because the service
worker keeps serving the cached copy.**

The best argument *for* the subpath is that `localStorage['sws.prefs']` is
origin-scoped, so only a shared origin shares the comfort settings. It loses
anyway: *judgement* — there is close to zero audience overlap between a
56–64-year-old model railroader and a teacher in August. A subdomain is a
separate origin too, so the prefs cost is identical either way, and a
subdomain keeps CI and keeps the brand boundary enforced by DNS instead of by
discipline.

## Do the domain move before the first sale

**Verified:** Founder licences live in origin-scoped `localStorage` under
`trackfit.premium.v1`, and installed PWAs are origin-keyed. The paid base is
zero today, so a domain move right now deactivates nothing. After the first
sale it needs a licence-migration path that does not exist.

Mechanically it is one line: edit `apps/web/public/CNAME`, add the DNS record,
let Pages re-issue HTTPS.

---

## The promise question, answered precisely

I expected the paid tier to break the studio promise. **It doesn't.** Measured
clause by clause against the live production bundle, not the source:

| Clause | Trackfit | Evidence |
|---|---|---|
| Nothing leaves your device | **true**, once the font fix lands | only two `fetch(` sites in the bundle: Vite's own polyfill, and photo-ID which is dead behind two unset env vars |
| No account | **true — and more true than four apps here** | activation is a code SHA-256'd in-browser against an embedded allowlist; no server, works offline |
| No ads | **true today** | `affiliate_tag` is a field on the returned object, never appended to a URL; the live Amazon link is a bare `/s` |
| No subscription | **true and deliberate** | `VITE_PREMIUM_MONTHLY_URL` is empty; that audience resents recurring billing |

The Tally telemetry POST is **not in production** — tree-shaken out because
`App.tsx:927` disables `<PremiumPricingTest>`.

**Trackfit breaks exactly one studio sentence, and it isn't in the trust
badge.** It is `hub.mjs` / `apps/index.html`: *"Every app here is free and
always will be."* Which is why the recommendation is a footer cross-link under
a separate heading rather than a card in the grid — a cross-link claims
nothing, so that line stays true.

### Never port to Trackfit

The `.trust` badge, the tip jar, and `design/privacy.mjs`. That generator
hardcodes "There is no data to sell" and "collects no personal information
from anyone, of any age" — it cannot be pointed at a paid app. Ship the same
*component shape* with true Trackfit copy instead.

---

## The urgent thing, which has nothing to do with the studio

**Trackfit charges $19 for a feature that invents data and never says so.**

Verified directly in `apps/web/src/lib/identify-piece.ts`:

- `:202` — `const baseConfidences = [0.95, 0.72, 0.55];`
- `:55` — `AUTO_FILL_CONFIDENCE_THRESHOLD = 0.85`

Top-1 always clears the threshold, so the stub **silently auto-fills a made-up
piece into the user's row**. The result carries `fromStub: true` — and grep
across `apps/web/src` and `packages` returns three hits, all inside
`identify-piece.ts` itself (`:41` declares it, `:294` and `:322` set it).
**No component anywhere reads it.** The user is never told.

Photo-ID is the headline premium unlock, with a 3-call trial that then fires
`trackfit:open-upgrade` at the Payhip modal.

*Judgement:* this is a refund and consumer-protection problem before it is a
brand problem, and it sits far worse next to a studio built on verifiable
honesty than the paid model ever could. **Take photo-ID off the premium list
until the Cloudflare Worker is funded and live** — it's already written,
Haiku 4.5, roughly $0.005–0.012/call. Keep selling the inventory PDF and the
full eight-vendor list; both are real and work today.

---

## Play: out, and it isn't close

All four passes agreed independently.

**Verified:** the live bundle carries `VITE_PREMIUM_ENABLED:"true"` and
`VITE_PREMIUM_LIFETIME_URL:"https://payhip.com/b/zpHqr"`. A Payhip out-link
that unlocks digital features is a Payments violation plus anti-steering, and
**Play enforces payments at account level**. `PLAY-LAUNCH-DECISION.md` §3 keeps
all 23 tip jars legal on exactly one clause — the payment "does not grant
access to any digital content or services." Trackfit is that clause's
counterexample. A violation carried in by Trackfit takes the other listings
with it.

It also isn't ready on its own terms: one confirmed human user, a library
still marked `data_quality: "unverified-draft"`, no TWA scaffolding of any
kind, and its own runbook names forums as the real distribution plan.

**One myth worth dropping:** the domain mismatch is *not* the webview-wrapper
violation — that clause reads "without permission from the website owner," and
a verified `assetlinks.json` **is** that permission. The real hazard is that
assetlinks verification fails *soft*: get it wrong and the app still runs, it
just shows an address bar reading `trackfit.stevieweedseed.com` to a
68-year-old model railroader. Fixed by the domain move.

### A structural hazard to remember if it ever does go to Play

`deploy.yml` passes `VITE_USE_REAL_PHOTO_ID` and `VITE_PHOTO_ID_PROXY_URL` in
**from repo secrets**. Flipping one secret turns the app from sending nothing
into POSTing a user's photo to a Worker that forwards to Anthropic — no code
change, no PR, no review. If a listing ever exists, that toggle silently makes
its Data Safety declaration false. Hard-code the flag in source so flipping it
requires a commit.

Scope correction, because this is easy to over-fear: **Data Safety is declared
per listing.** Adding Trackfit anywhere does not touch any other app's
declaration. The contamination path is the *account*, via payments — not the form.

---

## Making it read as Sky Wolf Studios

The surprise: **Trackfit is not a Tailwind app.** 384 `className` values, one
Tailwind utility hit (and that one is a custom class). Every class is
semantic/BEM, and the 2710-line stylesheet is 8 custom properties with alpha
shades — architecturally the same shape as `studio.css`. It also independently
converged on our palette: its accent is OKLCH hue **37.6** against
specials-planner's 38, and its paper is hue 83 against our `PAPER_HUE = 78`.

### Do these regardless of every other decision — about an hour

These aren't branding. They're defects our own build gate would have refused
to ship, in an app whose audience is 56–64:

1. **Three colours.** `--rule` #c9bfa8 is **1.57:1** and it is the border on
   every text input — WCAG 2.2 SC 1.4.11 wants 3:1 for a control boundary. We
   already ship #998a73 at 3.06:1 for the same skin.
2. **Delete six `outline: none`** (`index.css` 1004, 1052, 1078, 1753, 2411,
   2648). Only one is repaired. The worst is `.settings-trigger` — **the gear
   that opens the accessibility panel signals keyboard focus by colour alone.**
3. **Input font-size 14px → 16px** (`index.css:65`) — trips iOS Safari
   zoom-on-focus.
4. **Commit the self-hosted fonts** (below).
5. **Colophon:** "A tool by Sky Wolf Studios · SWS Strategic Media LLC."

### Worth doing later, in this order

1. **`--ui-scale` and the comfort panel.** The only item that's a product
   improvement rather than branding. Trackfit already has the right
   architecture — `lib/prefs.ts` writes to `<html>` before hydration, same
   discipline we use. Gated on converting ~60 `font-size` declarations from px
   to rem. **Worth knowing: Trackfit's current control is already broken this
   way** — `SettingsMenu.tsx:277` promises "increases body text by 25%" and
   delivers **6%**, moving ten selectors while forty sub-16px sizes stay put.
2. **A skins row.** Tested: an 8-line row plus a new `inkHue` axis gives 24
   skins, **1622/1622 contrast checks pass**, and all 23 existing
   `design/out/*.css` come out **byte-identical**. Fixes all three colours by
   construction and brings a real dark mode — canvas #10141d with a faint grid,
   *which is literally a blueprint*, in an app that currently has zero
   `prefers-color-scheme` rules. The new axis is needed because `build.mjs:117`
   tints ink toward the accent and would otherwise paint a **rust** blueprint grid.
3. **`studio.css`'s print block** — free, and Trackfit has **zero** `@media
   print` rules today.

**Open both apps side by side before taking #2.** Every colour claim here is
computed from source; nobody has actually looked at hue 38 + navy ink + `r: 0`
in a browser.

**One real collision:** IBM Plex Mono. There is no `--font-mono` token in
`studio.css` (`.tnum` is the only mono-adjacent line) and Trackfit uses Plex
Mono in 20+ rules for its bill-of-lading register. *Judgement:* add the token —
bill-splitter, home-inventory and moving-boxes all have ledger content that
`.tnum` only half-serves. Don't try to express it as a fourth `voice`;
Trackfit needs mono *and* Fraunces *and* a sans simultaneously.

**On "preserve the blueprint aesthetic":** adopting the *method* is not drift.
The proposal generates a Trackfit-specific skin that keeps the blueprint
identity. Adopting `.trust` would be drift. Those are different things.

---

## Already done, sitting uncommitted in the Trackfit repo

Trackfit loaded Fraunces + IBM Plex Mono + IBM Plex Sans **from Google Fonts on
every cold load** — telling `fonts.gstatic.com` the user's IP before anything
rendered, and breaking the app in a basement with no signal, which is exactly
where it is meant to be used.

Self-hosted all four faces, latin subsets, **152 kB** (Fraunces was already in
`design/fonts/` — we use it too). Removed the now-dead Google runtime-caching
rules from the Workbox config, which would have re-enabled the request the
moment a stylesheet referenced them again.

**Verified in a real browser: zero external requests.**

Uncommitted in `/tmp/trackfit`: `M apps/web/index.html`,
`M apps/web/vite.config.ts`, `?? apps/web/public/fonts/`. **This needs pushing
to `Stephenuffugus/trackfit` — it will be lost when the codespace closes.**

---

## Also worth doing

- **Delete `/tmp/trackfit/index.html` and `trackfit-1.html`.** Neither is
  deployed (`deploy.yml:94` uploads `apps/web/dist` only). They're superficially
  perfect studio-format single-file PWAs, which is the trap — v0.2 against
  v0.3.5, four packages behind, with live `TODO(curves)`, and curves are the
  2D half of the problem domain. Two Trackfits giving different answers to the
  same question is worse than one. Git history keeps them.
- **Correct `trackfit-strategy.md` §2.1/§3.5.** TrackPlanner.app shipped **Kato
  Unitrack in January 2026**, runs on phones, is free, and no longer calls
  itself beta. Both sections rest on the opposite, and Kato Unitrack N is the
  largest library here at 56 pieces. Quoting a competitor's missing feature they
  shipped seven months ago is exactly the error this audience punishes. Re-centre
  on the near-miss solver ("you'd need a 2.375-inch piece") — still unmatched.
  Bonus: RailScanPro is rolling-stock only at **$19/month** against $19 once.
  That contrast is a better headline than anything in the current pitch.

---

## Deliberately not recommended

Merging the repos · applying `apply.mjs` to Trackfit · serving from
`sws-apps-9646d.web.app/trackfit/` · giving Trackfit a hub card · putting
`.trust` or a tip jar on it · any Play listing in year one.
