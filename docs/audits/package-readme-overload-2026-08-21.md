# READ ME FIRST, for the auditor (ChatGPT)

You are auditing OVERLOAD, a strength-training PWA by Sky Wolf Studio
(SWS Strategic Media LLC). This package contains the complete real source,
not a scrape of the public page. Audit the code you can read; label anything
that truly needs a phone, a gym, or human eyes as DEVICE/HUMAN TEST REQUIRED
rather than guessing. A previous audit of our Hush app in this exact format
was excellent because it verified findings against source and ran the tests;
please work the same way.

Live at: https://skywolfstudio.com/overload/

## What this app is

A progressive-overload strength tracker built around one inversion of the
category: the engine writes the next workout, so logging collapses to one
tap per set. It prescribes weight x rep range x sets on a 3-day clock,
judges every session (ADD WEIGHT / ADD REPS / CONSOLIDATE / DELOAD minus
10 percent), offers a swap after three stalled sessions, does plate math
for barbell lifts, and tracks the bodyweight trend with cut-aware guidance.

Free, no ads, no account, no server. Everything persists to localStorage
under `overload.v2` on the device, with JSON backup and restore in the
Trend view. Revenue is a tip jar only.

## Package contents

- index.html : the entire app (CSS + JS inline), single file by design
- sw.js : service worker
- manifest.webmanifest, privacy.html
- sws-ui.js : shared studio UI component (used across the fleet)
- README.md, HANDOFF.md : product intent and architecture notes
- test/overload.test.mjs : 68 assertions, all green at packaging time.
  Run: `node test/overload.test.mjs` (plain Node, no dependencies)

## Hard constraints, do not recommend against them

- Zero runtime dependencies, no build step, no framework, no analytics, no
  backend. Fixes should be small invariants, validation, and lifecycle
  corrections, never a rewrite or a library.
- Local-first is the product identity. Do not propose accounts or cloud.
- House interaction pattern: destructive actions get Undo, not a confirm.
- House voice: no em or en dashes in any copy you suggest.

## Context that should aim your attention

- The app is served from a shared origin with roughly 30 sibling apps.
  Check that sw.js can never touch a sibling's caches (an early app here
  once shipped an activate handler that wiped every cache on the origin).
- This app is a candidate for Google Play packaging as a TWA. Anything that
  would embarrass a store listing matters: privacy claims that do not match
  behavior, silent data loss, broken offline start, misleading copy.
- The prescription engine is the product. Hunt hardest for correctness bugs
  in judgment thresholds, deload math, plate math rounding, the 3-day
  clock across midnight and DST, and stall/swap counting. Time-boundary
  bugs are a known failure class in this fleet.
- localStorage schema is `overload.v2`. Check the load path against
  corrupt, truncated, or stale-schema saves, and the backup/restore round
  trip. A junk save must degrade to defaults, never to broken state.

## Known open issues fleet-wide, do not spend report space rediscovering

- The parent portal manifest claims scope "/" and id "/" while child app
  manifests carry no id, so installing an individual app can resolve to the
  portal identity. A fix is planned (unique id per app manifest). You may
  validate or critique the fix direction.

## What we want back

Same shape as your Hush v2 report: an executive summary with a ranked
findings table (ID, severity, disposition), per-finding source locations
and reproduction, a regression-test list, honest DEVICE TEST REQUIRED
labels, and release acceptance criteria. Verify against the included
source and tests before calling anything confirmed.
