# Handoff, written 2026-08-21 by the Fable 5 session, for the next session on Opus 5

Stephen is switching the session model to Opus 5 to conserve Fable usage. You
are the same continuing effort. Read this file first, then
docs/PLAN-2026-08-21.md (its build queue still stands and this file does not
repeat all of it). The money-first constraint is unchanged: no funds, revenue
is the top priority, default to $0 paths.

Everything in this file was verified against source or by running suites
today, 2026-08-21. Nothing below is taken on ChatGPT's word alone.

## 1. Ground truth at time of writing

- Working tree clean on `main` at 66cde13. Nothing uncommitted except the
  files this handoff session adds (this file, the two audit conversions, a
  memory update).
- All suites green, run today:
  - `cd apps/seating-chart && npm test` (model + pdf + smoke, all pass)
  - `node apps/hush/tests/hush_tests.mjs` : 132 ok, 0 red
  - `node apps/hush/tests/hush_audit.js apps/hush/index.html` : 155 ok
  - NOTE: AUDIT-NOTES.md and older docs say `scripts/hush_audit.js`. It moved.
    It lives at `apps/hush/tests/hush_audit.js` now.
- Hush is at shell v12, footer build tag present, canonical points at
  skywolfstudio.com/hush (correct, it moved home), `user-scalable=no` already
  removed, faint-text contrast already raised.
- Auth authorized-domains outage is fixed and verified. Play org is VERIFIED,
  packaging is unblocked, and as of 2026-08-21 Stephen has PAID for and set
  up the Google Play store account. His words: he wants to upload an app,
  "but i want to make sure its good first". So the first-upload gate is:
  the chosen app's audit report worked through, the two triage bugs in
  section 2 fixed (the install-identity one directly affects TWA
  packaging), then the packaging toolchain. He is having ChatGPT audit the
  three apps the household actually uses (see section 7); the first listing
  will likely come from those three, but that choice is his to make, do not
  assume it.
- Both ChatGPT audits now exist as greppable markdown in docs/audits/
  (converted today from the docx, which also remain):
  - docs/audits/seating-chart-audit-2026-08-20.md
  - docs/audits/hush-audit-v2-2026-08-20.md

## 2. New from Stephen, reported live while this handoff was written. Triage these first.

Two reports from Stephen's own phone, 2026-08-21. Both touch the apps he and
his partner actually use daily, so they outrank the queue below. Initial
source reconnaissance is done; neither is fixed yet.

**2a. Settings dialog glitches in the grocery app.** His words: changing a
setting "makes it glitch out and i have to click okay and reopen them". He
checked grocery only. Reconnaissance: grocery-list uses the SHARED
`sws-prefs.js` / `#swsPrefs` dialog component, and a comment at
grocery-list/index.html:1028 says at least seven apps embed the same
component. So first reproduce in grocery-list (change a comfort setting,
watch the dialog), find the fault in sws-prefs.js, and then check every app
that carries the component, because the fix is fleet-wide. Symptom pattern
(re-render stomping the open dialog while a pref applies) is a guess, not a
finding; verify before fixing.

**2b. Installing an individual app to the home screen picks up the wrong
identity.** His words: he taps the add-to-device arrow and it seems to save
"under the same thumbnail as the parent app studio button". Requirement,
his ruling: someone saving an individual app must get THAT app's thumbnail
on their home screen, and tapping it must open just that app.
Reconnaissance, confirmed in source today:

- `apps/manifest.webmanifest` (the portal) declares `"id": "/"` and
  `"scope": "/"`, which covers the entire origin. Every child app's URL sits
  inside the installed portal's scope.
- Child manifests (checked grocery-list) have `start_url: "./"` and
  `scope: "./"` but NO `id` field.

That combination is the classic cause: with the portal installed, the
browser treats child-app pages as already belonging to the portal app, so
the install affordance resolves to the parent identity instead of offering
the child as its own app. Fix direction to verify on a real phone: give
every app manifest an explicit unique `id` (e.g. "/grocery-list/"), give the
portal its `id` too, and consider whether the portal's scope should stay "/"
at all, since a launcher does not need to claim the whole origin. Test the
repaired flow on Android Chrome and iOS Safari before calling it done, and
remember cache bumps for any served manifest change. This matters double
because the Play packaging work (below) wraps these same manifests into
TWAs.

## 3. The strategic call, in order

Stephen asked this session to assess the best next course of action for
cleanup and UI smoothing plus the two audits. The assessment (the two triage
items above come first):

1. **Play packaging stays the number one build item.** It is the only thing
   in the queue that creates a revenue channel, it is fully unblocked, and no
   audit finding touches it. Follow design/findings/PLAY-LAUNCH-DECISION.md
   items 5 to 9: JDK 17 exactly (box has JDK 25, the classic failure),
   `npm i -g @bubblewrap/cli@1.25.0` pinned, first AAB on internal testing,
   then Play App Signing SHA-256 into apps/.well-known/assetlinks.json,
   redeploy, statement API check. First listing choice waits on Jessie or
   Stephen just picks.
2. **Seating chart trust work, small and surgical** (section 4). The audit's
   P0 category is mostly already built; the real remaining gaps are about a
   day of work and they close the "one silent data loss kills trust" class
   before any Play listing sends strangers at the app.
3. **Hush Phase 2, overnight reliability** (section 5). Mechanical, well
   specified, no design decisions needed, extends an already-strong suite.
4. **Fleet UI smoothing pass** (section 6). Two confirmed defects found by
   grep today plus a short checklist. Cheap, do it in the cracks.
5. **Hush trial rework** (section 5, phase 1). Real work under Stephen's
   recorded rulings. Its own session; do not start it as a side quest.
6. **Sub Plans audit report** when Stephen brings it back. Verify against
   source before implementing anything, same discipline as Hush.

## 4. Seating chart: the audit verified against source

ChatGPT audited only the live public page and honestly labeled almost
everything TEST REQUIRED or FEATURE GAP CANDIDATE. Today's source read shows
most of its P0 list already exists. Do not rebuild these.

**Already built, confirmed in source (apps/seating-chart/):**

- Stable IDs everywhere: `newId()` = crypto.randomUUID slice 8 (model.js:9).
  Records are never keyed by display name. Schema tag `v: 1` on the project.
- Full-event JSON backup export (Print tab) and import (home screen), with
  the house export-then-ask tip-jar pattern.
- Paste import with party, meal, dietary columns, dupe detection against
  existing names, MAX_PASTE 1000 (model.js, app.js:305 area).
- Rules engine: together / apart / mustTable, violation surfacing via
  `validate()`, `placementOk()`, `autoArrange()`.
- Occupancy counts, unassigned pool, guest search over name and party, RSVP
  tracking, attending count.
- Three PDF exports: entrance list, escort cards, caterer sheet. The caterer
  sheet counts attending-but-unseated guests on purpose.
- Undo-not-confirm on every destructive action (delete event, delete
  occupied table, unseat all, unseat guest), matching the house pattern.
  Deleting an occupied table returns guests to the pool and undo restores
  tables, assignments, and rules exactly (app.js:820 area). QA-004/005 pass
  by design.
- Save-failure toast: "Couldn't save to this device... Export a backup file
  now" (app.js:60). QA-039 partially satisfied.
- Table-only assignment model (guests map to tables, not chairs). The
  audit's section 5.6 asks for exactly this as a mode; it is the design.
- H1 plus real crawlable copy shipped 2026-08-20 (index.html:1409 onward),
  so C-01/C-02 are already answered.
- Test suites: model, pdf, smoke, all green.

**Confirmed real gaps, in the order I would build them:**

1. **Import overwrite without a recovery snapshot.** `importFile()`
   (app.js:171) keeps the incoming `obj.id`, so re-importing a backup of an
   event that already exists on the device silently replaces the stored copy.
   Restoring a backup is the intent, but stash the replaced copy first and
   offer undo, same as every other destructive action.
2. **Import validation is shallow.** Only the top-level shape is checked;
   malformed guest/table/rule records ride straight in. Run every record
   through the same normalization the paste path uses, drop or repair bad
   ones, and report what was dropped. Mirrors the Hush sanitiser lesson:
   every door into the store gets the same armor.
3. **Two-tab clobber (QA-012).** `updatedAt` exists but nothing compares it.
   Cheapest honest fix: on save, read the stored `updatedAt` first and warn
   when it is newer than the copy in memory. Same class as the Hush two-tab
   note; the origin has a documented clobber history.
4. **Capacity reduction below occupancy (QA-006).** Currently allowed and
   surfaced only as a violation in the panel. That is defensible, but an
   inline warning at the moment of the edit ("this table has 10 seated,
   dropping to 8 leaves 2 flagged") costs little and matches the audit's
   competitor-review evidence that silent capacity misfits scare users.
5. **Port the audit's QA-001..021 into test/model.test.mjs where not already
   covered.** Several pass today (identity through rename, duplicate names,
   occupied-table delete); pin them so they stay true. The hostile-input rows
   (QA-017 special characters, QA-018 long text, QA-020 numeric abuse) are
   cheap table-driven cases.
6. **Version snapshots / duplicate event.** The one P0 audit feature with no
   foundation yet. A "Duplicate event" button is most of the user value for a
   fraction of the cost of full undo/redo history; do that first and defer
   the general history stack.

**Real but deferred (P1/P2, post-revenue):** structured groups instead of
free-text party (C-04), dietary chips instead of "separate with ;" text
(C-03, confirmed at index.html:1462), CSV file import (paste covers the
core), floor-plan objects/backgrounds/rotation, QR seat finder,
collaboration. The audit's section 5 is a good roadmap when the app earns
investment; none of it blocks launch.

## 5. Hush: what remains from the code-level audit

apps/hush/AUDIT-NOTES.md is the authoritative fix ledger. Summary: the
2026-08-16 pass (S1..S12) plus Phase 0 rounds 2/2b on 2026-08-20 shipped
HUSH-001, 002, 003, 007, 008, 010, 011, 012, 013, 016, 018, 022, 024, 025,
030, 031, plus Stephen's rulings (reset asks first, build tag in footer).
Suites 132 + 155, 25 mutations caught, shell v12.

**Remaining, phase 2 (overnight reliability, mechanical, no rulings needed):**

- HUSH-014 program fades scheduled on the AudioContext clock (the sleep
  timer already does this; programs still tick on JS).
- HUSH-015 cancel look-ahead generations on rapid heart/slow-wave toggles.
- HUSH-017 `disposeOnEnded()` helper for one-shot node chains.
- HUSH-019 idempotent WakeLockManager (race is real: start(), openViz(), and
  visibility restore all request independently).
- HUSH-020 storage-degraded truthfulness: failed writes must not let stale
  localStorage shadow newer memory; surface a degraded-save warning.
- HUSH-021 route calibration tone through a bounded safety bus.
- HUSH-023 measure before touching (suspend-context-after-stop is a battery
  question, not a code question).

**Remaining, phase 1 (trial rework, its own session, rulings recorded):**

- Stephen's rulings from 2026-08-20 night, do not relitigate: trial nights do
  NOT lock controls; deviated nights get flagged and excluded from primary
  analysis with an explanation. Reset keeps total erase but asks first
  (shipped).
- HUSH-004 canonical sleepDate (assignment at 22:00 and the morning log must
  join; this silently discards ordinary nights today, it is the worst open
  Hush bug).
- HUSH-005 deviation flagging per the ruling.
- HUSH-006 trial-specific front door that does not reveal the arm label.
- HUSH-009 block-aware paired analysis instead of pooled permutation.
- HUSH-032 reproducible power simulation script.

**Remaining, phase 3 (quick, fold into the fleet UI pass):**

- HUSH-027 H1 and publisher naming (confirmed still absent today).
- HUSH-028 rename "Export everything" honestly (buttons at index.html:609)
  or build the real full backup including S and trialArchive.
- HUSH-029 "X nights" habit copy counts daytime taps as nights.
- HUSH-026 is largely resolved by the move home (canonical is
  skywolfstudio.com/hush, correct); the remaining piece is the stale
  lucidwinds.com/hush mirror, which needs a push this codespace cannot make
  (plan item 5).

**R-01..R-10 device/listening list needs Stephen's ears and hardware. Do not
fake any of it in code.**

## 6. Fleet UI smoothing pass, findings and checklist

Found by grep today, confirmed, cheap to fix:

- **rock-stops has `user-scalable=no`** in its viewport meta. Same
  accessibility defect just fixed on Hush (HUSH-024). Remove it, bump its
  cache if it has a worker.
- **astravault, hush, rock-stops have no H1.** Every other app has one. Add
  visible or visually-hidden H1s with publisher naming (HUSH-027 pattern).
- All apps have canonicals (checked, none missing).

Checklist for the rest of the pass, distilled from what both audits kept
repeating and what the house already believes:

- Save state must be visible: every app that persists should surface save
  failure the way seating-chart and Hush now do. Grep for bare
  `localStorage.setItem` / store writes with no catch-and-toast.
- Contrast: Hush's faint-text lesson (alpha .34 read at 2.68:1). Check the
  other dark-shell apps for text tokens under 4.5:1 before someone files it.
- Undo, not confirm, for destructive actions, everywhere. Hush's reset is
  the one deliberate exception by ruling (total erase asks first).
- Dialogs: focus trap, Escape, focus restore. Seating chart is the model.
- Mobile keyboard must not bury Save/Cancel (audit UX table, worth one
  phone-width pass over the form-heavy apps: grade-sheet, signup-sheets,
  sitter-sheet, team-parent).
- Touch targets 44px for primary controls.

## 7. Audit strategy: decided and in motion

Stephen ruled on 2026-08-21: ChatGPT audits the three apps the household
actually uses, **Overload, Cross Off, and Grocery List**. This session built
all three code-level packages the same day and handed him the zips. Each
zip carries a READ_ME_FIRST_FOR_CHATGPT.md orientation; the exact text
ChatGPT was given is preserved in the repo at
docs/audits/package-readme-{overload,cross-off,grocery-list}-2026-08-21.md.
Read those before verifying any returned finding, so you know what context
the auditor had. Baselines at packaging time, all run and green: overload
68 assertions, cross-off 83, grocery integration suite 5 against the
emulators (`npx firebase emulators:exec --only firestore,auth --project
demo-signup "node test/grocery.test.mjs"` from apps/signup-sheets/).
The grocery package includes the real firestore.rules and rules.test.mjs;
its readme aims the auditor at the rules first, and discloses the two known
fleet bugs (section 2) so report space goes to diagnosis, not rediscovery.

So the pending-report shelf is now four: Sub Plans, Overload, Cross Off,
Grocery List. When each lands: verify every finding against source before
implementing, same discipline that caught Hush's wrong-invariant test.

Do not commission more audits beyond these until one of the small utilities
is chosen for a Play listing.

Lesson to keep applying: **the code-level audit format (send the source
package) is dramatically better than the public-page format.** The seating
chart audit guessed and was mostly already-built; the Hush v2 audit read
source and found 32 real things. Always send the package. Include
READ_ME_FIRST_FOR_CHATGPT.md style orientation, it visibly helped.

Also: every ChatGPT finding still gets verified against source before
implementation. That discipline caught the wrong-invariant test (HUSH-001)
and is recorded as the reason round 2 went well.

## 8. What we need from Stephen

1. **Verdicts already queued in the plan:** ears on Hush v12 (footer must say
   build v12; heartbeat volume placement question), Jessie on Sub Plans and
   listing order, the mom's Cross Off morning test result.
2. **The four ChatGPT reports** as they come back: Sub Plans, Overload,
   Cross Off, Grocery List (packages delivered to Stephen 2026-08-21).
3. **During packaging:** Play Console clicks, and any stored-credential
   writes go through the established path: we hand him a ready script, he
   runs it with `! node <path>`, we verify via public read.
4. **A push of the lucid-winds repo** from a session with a token that can
   (plan item 5, d13da3fd Hush countdown repair plus pointing
   lucidwinds.com/hush at the new home).

## 9. Gotchas so you do not relearn them

- **No em or en dashes anywhere.** Copy, comments, docs, commit messages,
  listings. Standalone "—" UI value placeholders and vendor files are the
  only exceptions. The audit conversions in docs/audits/ were checked: they
  contain none.
- **`node --check` lies about ES modules.** It exits 0 without parsing any
  `.js` containing `import`. Copy to `.mjs` to force module parsing.
- **Automated text sweeps** must not touch regex character classes, fixtures,
  or string literals compared against stored data. Run every app's tests
  before deploying a sweep. Grep the sweep commit, not just the tree.
- **Firebase deploys:** rules deploy command and tip-jar wiring pattern are
  in memory (sws-apps-launch-state). Hosting is Firebase; lucidwinds.com is
  Hostinger push-to-main, and this codespace cannot push that repo.
- **Stephen's art is sacred:** generators read his art from disk, never
  replace with placeholders, and check deploy-vs-HEAD before debugging
  "broken".
- **Extracting docx:** no pandoc on this box. Python zipfile + strip tags
  works fine; recipe is in the git history of this handoff commit.
- **Hush test paths moved:** tests live under apps/hush/tests/ (both
  hush_tests.mjs and hush_audit.js). Older docs point at scripts/.
- **jsdom/pdf-lib for seating-chart tests** resolve through a symlinked
  node_modules into an older session scratchpad
  (apps/seating-chart/node_modules is a symlink). If tests ever fail with
  MODULE_NOT_FOUND, that link rotted; `npm i` locally to rebuild it.
