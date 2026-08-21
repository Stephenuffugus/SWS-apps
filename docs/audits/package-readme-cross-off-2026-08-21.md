# READ ME FIRST, for the auditor (ChatGPT)

You are auditing CROSS OFF, a to-do PWA by Sky Wolf Studio (SWS Strategic
Media LLC). This package contains the complete real source, not a scrape of
the public page. Audit the code you can read; label anything that truly
needs a phone or human eyes as DEVICE/HUMAN TEST REQUIRED rather than
guessing. A previous audit of our Hush app in this exact format was
excellent because it verified findings against source and ran the tests;
please work the same way.

Live at: https://skywolfstudio.com/cross-off/

## What this app is

A paper to-do list you cross off with real highlighters. Priorities
auto-group (NOW / TODAY / SOON), beat-the-clock countdowns with personal
records, a focus screen, a multi-page notebook, and the morning page-flip:
on a new day the app flips the page all by itself. Yesterday's marked-up
page goes to a flip-back pile with its ink intact, unfinished tasks carry
forward with nothing said about it, and daily chores rewrite themselves
onto the fresh page.

Built deliberately for ADHD users: no overdue labels, no dying streaks, no
guilt copy, zero onboarding. Free, no ads, no account, no server, local
storage only, tip jar revenue.

## Package contents

- index.html : the entire app (CSS + JS inline), single file by design
- sw.js : service worker
- manifest.webmanifest, privacy.html
- sws-ui.js : shared studio UI component (used across the fleet)
- README.md, HANDOFF.md : product intent and architecture notes
- test/cross-off.test.mjs : 83 assertions, all green at packaging time.
  Run: `node test/cross-off.test.mjs` (plain Node, no dependencies)

## Hard constraints, do not recommend against them

- Zero runtime dependencies, no build step, no framework, no analytics, no
  backend. Fixes should be small invariants, validation, and lifecycle
  corrections, never a rewrite or a library.
- The ADHD design rulings are settled product decisions, not oversights:
  automatic behavior plus Undo beats offering choices; no guilt mechanics;
  destructive actions get Undo, not a confirm. Audit within them.
- House voice: no em or en dashes in any copy you suggest.

## Context that should aim your attention

- The app is in a live user test right now with a real user, so data-loss
  and trust bugs outrank everything else. One silent loss of a page or a
  task ends usage for this audience.
- The midnight page-flip is the riskiest logic in the app. PWAs stay alive
  for days, so the day boundary is watched by a rollover watcher rather
  than assumed at load. Stress it: app left open across midnight, device
  asleep at midnight, timezone changes, DST, clock changes, multiple tabs,
  a flip firing twice, a flip firing while the user is mid-edit, and
  carry-forward or chore-rewrite running twice. Time-boundary bugs are a
  known failure class in this fleet.
- Check the flip-back pile and personal records against corrupt or stale
  localStorage saves, and any backup/restore or export paths.
- The app is served from a shared origin with roughly 30 sibling apps.
  Check that sw.js can never touch a sibling's caches.
- This app is a candidate for Google Play packaging as a TWA. Anything that
  would embarrass a store listing matters: privacy claims that do not match
  behavior, silent data loss, broken offline start, misleading copy.

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
