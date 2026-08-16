# FLOAT — HANDOFF v2.0.0
Rockhounding field log · single-file vanilla HTML/CSS/JS PWA · local-first
Owner: Stephen (SWS Strategic Media LLC / Lucid Winds). Co-user: Jessie.
Target deploy: GitHub Pages or Firebase Hosting → lucidwinds.com portfolio → app store wrap.

## WHAT THIS IS
`index.html` is the complete, working app. One file, zero dependencies, zero network calls.
Open it in a mobile browser and it runs. All data in IndexedDB (in-memory fallback with a
visible warning if IDB is unavailable). 54/54 logic assertions passing (see TEST HARNESS).

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
- **PWA**: inline data-URI manifest + SVG icon, installable, standalone display, safe-area
  padding throughout, reduced-motion respected, focus-visible styles.

## MATCH PIPELINE — IMPLEMENTED VS SEAM
Stage 1 (SHIPPED): CIELAB 8×8×8 histogram (512 bins), center-weighted sampling (~20k px),
sqrt-compressed Uint8 storage (linear byte scale clips peaked histograms — this bug was
caught and fixed in v1, regression test exists), Bhattacharyya similarity, margin-based
confidence (top>0.55 AND margin>0.06 → "Likely match", else "Similar colors").

Stage 0 (SEAM): zone narrowing. `site.zones[]` and `find.zoneId` exist in the data model
but no UI. v1 testing showed zone-scoped top-1 = 12/12 vs whole-collection 9/12.

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
Repo layout during dev: `p1_core.js p2_color.js p3_field.js p4_collection.js p5_more.js`
concatenated → `all.js` → injected into `shell.html` at `//APPJS`.
`cat all.js t_post.js > runtest.js && node runtest.js` → 54 assertions: Lab math, bin edges,
histogram normalization, sqrt pack/unpack round-trip (L1 < 0.02), quantization regression,
similarity ordering, ranking + margin confidence, strata clustering, memory-store CRUD,
settings persistence, full backup serialize→clear→restore round-trip with hist re-match.
KEEP THIS GREEN. Add assertions when touching color math or backup format.
Note: exact-color candidates land in the same Lab bin → zero margin → not confident. That
is correct behavior; don't "fix" it.

## BUILD-OUT PLAN (priority order)
1. **Service worker** — single-file constraint means SW ships as a second file at deploy
   time (`sw.js`: cache-first for `index.html`). Register conditionally:
   `if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{})`.
   Without it the PWA still installs but needs one online load per session on some platforms.
2. **Stage 2 DINOv2** — as specced above. Settings toggle "Better matching (downloads ~90MB
   model once)". Web Worker for embedding compute; never block the queue UI.
3. **Zone UI (Stage 0)** — zone chips on site edit, zone picker in field mode when the active
   trip's site has zones, scope match ranking to zone first with whole-collection fallback.
4. **Collection virtualization** — the 120-card cap is a stopgap. IntersectionObserver
   pagination. Also revoke ObjectURLs on card removal (currently leaked per render; fine at
   this scale, fix before 1k finds).
5. **Share/export a find** — Web Share API with photo file (`navigator.share({files})`),
   Android share-target in manifest (needs real manifest file at deploy, not data URI —
   convert then).
6. **ID assist seam** — "What is this?" button on detail → Anthropic vision API. Keep it a
   seam: one `identifyFind(find)` function, feature-flagged, graceful offline. Results stored
   as IdentificationAttempt-shaped notes, never overwriting the user's label.
7. **Enrollment coach** — first-run flow: shoot 3 angles of a known specimen to seed the
   match catalog. v1 spec point 9.
8. **Trip detail view** — tap a trip log row → finds from that trip on a timeline.
9. **CSV export** (labels/materials/coords, no photos) for spreadsheet people.

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
