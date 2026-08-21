# READ ME FIRST, for the auditor (ChatGPT)

You are auditing GROCERY LIST, a shared-household PWA by Sky Wolf Studio
(SWS Strategic Media LLC). This package contains the complete real source
INCLUDING the Firestore security rules, not a scrape of the public page.
Audit the code you can read; label anything that truly needs a second
device or human eyes as DEVICE/HUMAN TEST REQUIRED rather than guessing. A
previous audit of our Hush app in this exact format was excellent because
it verified findings against source and ran the tests; please work the
same way.

Live at: https://skywolfstudio.com/grocery-list/

## What this app is

One live list for the whole household. The owner signs in once (Google,
Firebase Auth) and shares a link; everyone else, partner, kids, roommates,
opens the link with no account and sees every change in real time. Add
from the couch, check off at the store. The done-checkbox is deliberately
open to every link-holder, and the security rules enforce that the toggle
cannot smuggle any other change. "Clear checked" also resets the board's
entry counter so a long-lived list never hits the engine's 500-ever cap.

This is Engine 1 skin `grocery` on a shared Firebase project. Four sibling
apps share the engine and the same rules file: signup-sheets, grocery-list,
caregiver-log, team-parent. This is the ONLY app family in the fleet that
touches a server; everything else the studio ships is local-only.

Free, no ads, no account needed for family members, tip jar revenue.
It has real daily users right now, including the owner's household.

## Package contents

- index.html : shell, styles, crawlable copy
- app.js : UI and flows
- data.js : the Firebase data layer (this is the app's own copy)
- helpers.js : shared helpers
- firebase-config.js : the public web config (not a secret, already served
  to every visitor; do not report its presence as a leak)
- firestore.rules : the REAL deployed security rules, shared by the four
  Engine 1 skins. This is the most important file in the package.
- sws-prefs.js : shared studio settings dialog component (fleet-wide)
- sws-ui.js : shared studio UI component (fleet-wide)
- sw.js, manifest.webmanifest, privacy.html, README.md
- vendor-qrcode.js : vendored third-party QR library, skim only
- test/grocery.test.mjs : end-to-end integration test, runs against the
  Firebase emulators, green at packaging time. From the engine app dir:
  `npx firebase emulators:exec --only firestore,auth --project demo-signup
  "node test/grocery.test.mjs"`
- test/rules.test.mjs : the security-rules test suite for the shared rules

## Hard constraints, do not recommend against them

- No framework, no build step, no analytics. Firebase (Auth + Firestore)
  is the only backend and stays. Fixes should be small invariants,
  validation, rules tightening, and lifecycle corrections, not a rewrite.
- The no-account experience for link-holders is the product. Do not
  propose sign-in for family members.
- The open done-toggle for anonymous link-holders is a deliberate design,
  enforced narrowly in rules. Audit its enforcement, not its existence.
- House interaction pattern: destructive actions get Undo, not a confirm.
- House voice: no em or en dashes in any copy you suggest.

## Context that should aim your attention

- SECURITY RULES FIRST. The rules file gates strangers on the internet
  from a family's grocery data. Hunt for: writes the rules allow that the
  UI never sends (the classic gap), the done-toggle smuggling class, join
  code brute-force surface, the 500-entry counter reset path, cross-skin
  interference (four skins share the rules), and anything a hostile
  link-holder could do to the owner's board.
- The share link is the whole product. Audit what rides in it, what a
  leaked link exposes, and whether revocation exists and works.
- Real-time listeners: reconnection, offline queueing, two devices editing
  the same item, stale snapshot overwrites, listener leaks.
- Sign-in truthfulness: this origin had a live outage where auth domains
  broke sign-in silently. Check how auth failures surface to the user.
- The app is served from a shared origin with roughly 30 sibling apps.
  Check that sw.js can never touch a sibling's caches, and how the worker
  treats Firestore/auth network traffic (it must never cache it).
- This app is a candidate for Google Play packaging as a TWA. Anything
  that would embarrass a store listing matters, and a listed app with a
  server component will get its privacy claims read closely: privacy.html
  and the in-app copy must match actual data flows exactly.

## Known open issues, verify and extend rather than rediscover

- The shared settings dialog (sws-prefs.js) glitches when changing a
  setting: the user reports it "glitches out" and must press okay and
  reopen it to see the applied state. Reported on this app on a real
  phone, 2026-08-21, not yet diagnosed. Finding the root cause is worth
  real report space; the component is shared by seven-plus apps.
- The parent portal manifest claims scope "/" and id "/" while child app
  manifests carry no id, so installing an individual app can resolve to
  the portal identity. A fix is planned (unique id per app manifest). You
  may validate or critique the fix direction.

## What we want back

Same shape as your Hush v2 report: an executive summary with a ranked
findings table (ID, severity, disposition), per-finding source locations
and reproduction, a regression-test list, honest DEVICE TEST REQUIRED
labels, and release acceptance criteria. Verify against the included
source, rules, and tests before calling anything confirmed.
