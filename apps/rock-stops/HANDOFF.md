# ROCK STOPS (built as Float) — HANDOFF v2.1.0
Rockhounding field log · single-file vanilla HTML/CSS/JS PWA · local-first
Owner: Stephen (SWS Strategic Media LLC / Lucid Winds). Co-user: Jessie.
Target deploy: GitHub Pages or Firebase Hosting → lucidwinds.com portfolio → app store wrap.

## WHAT THIS IS
`index.html` is the complete, working app. One file, zero dependencies, zero network calls.
Open it in a mobile browser and it runs. All data in IndexedDB (in-memory fallback with a
visible warning if IDB is unavailable). Logic assertions run from this repo — see TEST HARNESS.

Lives at `apps/rock-stops/` in the SWS-apps repo and is served at `/rock-stops/`. Renamed from Float 2026-08-18; internal keys (float-db, app:"float", float.dev.unlocked) deliberately kept. It is **app 24 and in
development**: a passphrase gate (`wolfden`, same as the arcade) sits in front of it. The gate is
a curtain, not security — the passphrase is in the source of a file anyone can read — and its own
copy says so. It does not need to be security: nothing is behind it but this device's own
IndexedDB. Delete `devgate` and the one line in `app.boot()` on the day it goes public.

Siblings now: `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-{192,512}.png`,
`icon-maskable-512.png`, `test/float.test.mjs`.

## CURRENT STATE — WHAT WORKS
- **Field mode** (`#/field`, dark UI): live camera viewfinder (getUserMedia, environment cam),
  guide-square crop on capture (82% of short side), torch toggle (capability-gated), screen
  wake lock, GPS watch with accuracy pill, material chips (recency-ordered), file-input
  fallback for desktop/no-permission, session strip showing strata swatches of this session's finds.
- **Labeling queue** (`#/queue`): one-at-a-time naming, color-match suggestions from labeled
  finds (tap to accept label+material in one go), "same as last" chip, recent-label chips,
  skip, live badge count on the tab.
- **Collection** (`#/collection`): grid with thumbs + strata strips, text search, material
  filter chips, favorites filter, capped render at 120 cards (see NEXT: virtualize).
- **Specimen detail** (`#/find/:id`): photo pager (swipe, tap to zoom-fit), inline editing
  (name/material/notes autosave on change), favorite star, GPS with Google Maps link,
  "similar colors in your collection" (top-4 above 0.35), add photo, soft delete.
- **Sites & trips** (`#/trips`): site CRUD (landType/collectStatus are user notes, disclaimed
  in-UI, never asserted as legal fact), start/end trips, active-trip banner, trip log with
  merged strata per trip, quick "no site" trip.
- **Stats** (`#/stats`): counts, by-material bars, "collection strata" — merged dominant-color
  fingerprint of the whole collection.
- **Backup** (`#/more`): full JSON export/import including photos as base64. Merge on import,
  replace mode exists in code (`backup.deserialize(data,'replace')`). Foreign files rejected.
- **Map** (`#/map`): every site and every un-sited find plotted in real Web Mercator on a
  canvas — pan, pinch/wheel zoom, fit-all, a true scale bar and a graticule. Tap a pin for the
  site sheet (name, find count, coordinates, photo strip) and through to `#/site/:id` for
  everything found there. **Deliberately no basemap tiles** — see MAP below.
- **Site detail** (`#/site/:id`): every find from one place, as a grid.
- **Trip detail** (`#/trip/:id`): the trip as a timeline in the order things were found, with
  time, thumbnail, label, material and zone. Tap any trip-log row to reach it.
- **Walked track**: while Field mode is open on an active trip, positions are appended to
  `trip.track` as `[lat, lon, isoTime]`. Throttled to 15m of movement (a stationary phone would
  otherwise write a fix every few seconds), fixes worse than 50m accuracy are dropped rather than
  drawn as a spike, capped at 2000 points with the oldest dropped, and the debounced write is
  flushed when Field mode is left so the last stretch is never lost. Drawn under the pins on the
  map; trip detail totals it by summing legs, not start-to-end, because rockhounding is a walk
  back and forth along a bar.
- **Sites carry coordinates and zones**: set a site's position from GPS or by typing it, and
  name zones (north wall, tailings, creek bend). Zone chips appear in field mode when the
  active trip's site has any, and the picked zone sticks between shots.
- **Provenance on matches**: "similar colors in your collection" names the *site* each match
  came from. This is the point of the feature — standing in the garden holding a rock, the
  question is where you picked it up, not which photo it resembles.
- **CSV export** (`#/more`): labels, materials, sites, zones, dates, coordinates. No photos.
  Formula-injection prefixed, UTF-8 BOM.
- **Share a find** (detail view): Web Share with the photo, falling back to text, falling back
  to clipboard. **Never includes coordinates** — a share sheet is exactly where a location
  would leak without anyone deciding to.
- **First run**: a one-time welcome that states the loop (shoot → name → find out where it came
  from) and the privacy promise, then gets out of the way. The default route is a live camera,
  which is right for the hundredth use and wrong for the first.
- **PWA**: real `manifest.webmanifest` (TWA/PWABuilder-ready), real icons including a maskable
  one, `sw.js` cache-first over the shell so it genuinely runs with no signal, and
  `navigator.storage.persist()` requested once after the first find. Installable, standalone,
  safe-area padding, reduced-motion respected, focus-visible styles.
- **Collection paging**: 60 per page with an IntersectionObserver sentinel, and ObjectURLs
  tracked and revoked. The old hard 120-card cap silently hid the rest of the collection.

## MAP — WHY THERE ARE NO TILES
The obvious build is Leaflet over OpenStreetMap. It is the one thing this app must not do: a
tile map requests images for the rectangle you are looking at, so opening your map hands a
third-party server your IP alongside the precise coordinates of every spot you have found
anything at. Rockhounding locations are the thing people guard hardest, and "your spots never
leave your device" would stop being true at the exact moment you looked at them. It would also
break this file's own rule about network calls.

So the map is drawn from the user's own points. What it gives up is roads and terrain; what it
keeps is that the map of your spots exists only on your phone. If a basemap is ever wanted, the
honest shape is an explicit opt-in stating what it sends and to whom, defaulting off.

Sites are created before you know where the middle of them is, so a site with no coordinates
takes the centroid of its finds — usually a truer centre than wherever you parked. Finds with no
site still plot, as amber dots, because seeing them is generally how a place gets named.

## MATCH PIPELINE — IMPLEMENTED VS SEAM
Stage 1 (SHIPPED): CIELAB 8×8×8 histogram (512 bins), center-weighted sampling (~20k px),
sqrt-compressed Uint8 storage (linear byte scale clips peaked histograms — this bug was
caught and fixed in v1, regression test exists), Bhattacharyya similarity, margin-based
confidence (top>0.55 AND margin>0.06 → "Likely match", else "Similar colors").

Stage 0 (SHIPPED): zone narrowing. Zones are created on the site editor, picked in field mode,
stored on `find.zoneId`, and the queue ranks inside the zone when it holds at least 3 labeled
finds — falling back to the whole collection below that, and labelling which pool the answer
came from. v1 testing showed zone-scoped top-1 = 12/12 vs whole-collection 9/12.

Stage 2 (SEAM): DINOv2-small embeddings via transformers.js. `find.embedding` field exists
(intended: Int8Array values + per-vector float scale). Load transformers.js lazily from CDN
behind a settings flag; fuse as `0.35*colorScore + 0.65*cosine(embedding)`; keep margin
confidence logic. MUST degrade gracefully offline — color-only is the floor.

## ARCHITECTURE MAP (all inside the single <script>)
1. core: `$ $$ el esc uid nowISO fmt* bus toast router` — hash router `#/route/arg`
2. db: promise-wrapped IDB (`db.put/get/all/del/clear`), stores: sites/trips/finds/photos/settings,
   `useMem` fallback flag, `settings` k/v cache
3. domain: MATERIALS/LAND_TYPES/COLLECT_STATUS, `newSite/newTrip/newFind` — all records carry
   id/createdAt/updatedAt/deleted (sync-ready; deletes are soft everywhere)
4. color: `rgbToLab labToBin histFromPixels packHist unpackHist histSimilarity rankByColor
   extractStrata strataCSS processImage savePhoto photoURL`
   - images: original ≤2048px jpeg q.86, thumb 320px q.8, analysis on 256px copy
   - strata = 5-cluster k-means-lite in RGB, edge pixels excluded, the app's signature visual
5. views: `field queue collection detail trips stats more backup`
6. shell: `app` — tab bar, badge, route dispatch, `field.leave()` releases camera/GPS/wakelock
   on navigation away

## DESIGN TOKENS (do not drift)
limestone #EDEEEA (light bg) · basalt #161B19 (field/tabs) · basalt2 #232B28 ·
serpentine #3E7A6B (primary) · serp-deep #2E5C51 · agate #C9873B (badges/matches/accent) ·
iron #A64B3C (destructive) · ink #22271F · mist #7E877F · line #D8DAD3
Display: Iowan Old Style/Palatino/Georgia stack. Data: ui-monospace. Body: system-ui.
System stacks are deliberate — offline-first, no webfont fetch. Signature element: the
strata strip (dominant-color bands from the actual photo) on cards, detail, sessions, trips,
stats. Field mode is dark; everything else limestone light. Tap targets ≥46px.

## TEST HARNESS
Two suites, both picked up by `npm test` from the repo root.

`test/float.browser.mjs` — 19 assertions in a real browser, via `design/harness.mjs`. Everything
here needs a real engine: canvas layout, IndexedDB, Blobs. Every assertion exists because
something actually broke — `fit()` keyed its scale off `pins.length === 1` rather than the
extent, so a site with one pin and a kilometre of walked track drew the track straight off the
top of the map; `fit()` also ran before the canvas had layout; and the backup had to keep zones,
site coordinates, `zoneId` and packed histograms across a wipe and restore, none of which
existed when the format was written. It also asserts the app makes **no failed requests at
all**, which matters more here than anywhere else in the portfolio.

`test/float.test.mjs` — 56 assertions in jsdom for the pure functions. It loads the real shipped `index.html` in jsdom and appends one extra
`<script>` that hands the top-level bindings out to `window.__float`, because a classic script's
`const` never lands on `window`. Nothing is exported into production to make this work.

Covers: palette contrast against both grounds, Lab maths (tuple return, not an object), bin range, histogram normalisation and
centre-weighted sampling, sqrt pack/unpack round-trip and the peaked-histogram regression,
similarity ordering, ranking, the deliberate not-confident case, strata clustering and CSS,
the persisted-record contract (`db.put` stamps createdAt/updatedAt; createdAt survives an edit),
the Mercator projection including the pole clamp, great-circle distance against the 111 km/degree
check, `siteCoord` centroid fallback and its flags, and the dev gate.

The original harness — `p1_core.js p2_color.js p3_field.js p4_collection.js p5_more.js`
concatenated → `all.js` → injected into `shell.html` at `//APPJS`, then
`cat all.js t_post.js > runtest.js` → 54 assertions: Lab math, bin edges,
histogram normalization, sqrt pack/unpack round-trip (L1 < 0.02), quantization regression,
similarity ordering, ranking + margin confidence, strata clustering, memory-store CRUD,
settings persistence, full backup serialize→clear→restore round-trip with hist re-match.
KEEP THIS GREEN. Add assertions when touching color math or backup format.
Note: exact-color candidates land in the same Lab bin → zero margin → not confident. That
is correct behavior; don't "fix" it.

## BUILD-OUT PLAN
DONE: service worker · real manifest + icons · `storage.persist()` · zone UI (Stage 0) ·
collection pagination + ObjectURL revoke · share a find · trip detail timeline · CSV export ·
map + site detail · provenance on matches · dev gate · first-run welcome · walked track ·
privacy page · contrast fix + guard · jsdom and browser test suites.

REMAINING, priority order:
1. **Stage 2 DINOv2** — transformers.js embeddings behind a settings flag,
   "Better matching (downloads ~90MB model once)". Web Worker; never block the queue UI.
   Fuse `0.35*colorScore + 0.65*cosine(embedding)`; keep the margin confidence logic.
   MUST degrade gracefully offline — colour-only is the floor. **Weigh this honestly before
   building**: 90MB over a phone connection for a field app is a real cost, and the flag has to
   state it plainly. Colour matching plus zone narrowing is already good enough that this may
   never earn its download.
2. **Android share-target** in the manifest, now that it is a real file.
3. **Zone-aware map** — draw zone sub-pins once a site has several and enough finds to place them.
4. **Enrollment coach** — first-run: shoot 3 angles of a known specimen to seed the catalog.

## CUT: ID ASSIST — decided 2026-08-16, do not revisit without new information
"What is this?" → a vision API was on the plan and is now cut. Honest mineral ID is not
something a local model can do, and the version that would work needs a network call, an API
key and a per-use cost — which breaks the zero-network rule, the no-account rule and the free
rule in one feature. A wrong confident answer about a rock is also worse than no answer:
people would repeat it. Rockhounds already have identification apps and their own eyes; Float's
job is the record, not the verdict. The `IdentificationAttempt` shape and the `identifyFind()`
seam are deliberately NOT stubbed, so nobody half-builds it later by accident.

What Float does instead is the thing an ID app cannot: it tells you **where a rock came from**,
because it is the only thing that was standing there when you picked it up.

## DEPLOY NOTES
- GitHub Pages: drop `index.html` (+ `sw.js` when built) in repo root. HTTPS required for
  camera/GPS/wake-lock — Pages provides it. localhost also works for dev.
- iOS Safari quirks: wake lock iOS 16.4+; torch generally unavailable; `capture` attr on the
  fallback input opens camera directly. WebXR still unsupported — AR overlay stays deferred.
- App store wrap: PWABuilder or Capacitor. Camera/location permission strings will be needed
  in the native shells. Data-URI manifest may need to become a real file for TWA/PWABuilder —
  extract it verbatim from the <head>.
- Storage: request persistent storage on first find:
  `navigator.storage?.persist?.()` — not yet called, add in step 1.

## HARD RULES
- Single file stays single file (sw.js is the only sanctioned sibling).
- No frameworks, no build step beyond concatenation, no analytics, no network calls without
  an explicit feature flag the user turned on.
- Never assert collecting legality; land info is user notes with the in-UI disclaimer.
- Soft deletes only; every record keeps id/createdAt/updatedAt/deleted for future sync.
- Don't break the backup format; version it (`version` field) if fields change and keep
  import backward-compatible.
