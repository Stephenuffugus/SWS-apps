# ChatGPT QA audit: Cross Off, 2026-08-21

Verbatim conversion of the report Stephen received on 2026-08-21
(source file: Cross_Off_QA_Debugging_Audit_v2.docx), extracted the same day so it is greppable
and can never be trapped in a chat window.

The auditor was given a code-level source package, not the public page. The
orientation it was handed is preserved beside this file at
docs/audits/package-readme-*-2026-08-21.md; read that before judging any
finding here.

BODY IS VERBATIM EXTERNAL TEXT. It is a third-party record, so it is left
exactly as written, including any em or en dashes. Treat it like a vendor
file: the house no-dashes rule still governs everything WE write, and no
phrasing should be copied out of here into our own copy without rewriting.

Every finding below is a LEAD, not a truth, until verified against source.
Verification status is tracked in docs/audits/VERDICTS-2026-08-21.md.

---


CROSS OFF
Deep QA, Debugging, UX, PWA, Data-Safety and Release Audit
Sky Wolf Studio | Source package reviewed 2026-08-21
Release recommendation: Do not treat this build as data-safe until CO-001 through CO-006 are resolved and the rollover/storage regressions pass. The app concept and core interaction model are strong, but several current failure paths can silently lose work or damage sibling-app offline caches.
1. Scope and verification status
Inspected the full contents of cross-off-qa-package.zip: index.html, sw.js, sws-ui.js, manifest.webmanifest, privacy.html, README.md, HANDOFF.md, READ_ME_FIRST_FOR_CHATGPT.md, and test/cross-off.test.mjs.
The app source is a single-file vanilla PWA with localStorage persistence under crossoff.v1. No framework rewrite is recommended.
The test file contains 83 explicit ok(...) assertions, matching the handoff claim numerically.
Independent execution of node test/cross-off.test.mjs was blocked because the test imports jsdom, but jsdom is not included and the package says the test is plain Node with no dependencies. The 83-green claim therefore could not be independently verified from this package.
The package also omits local assets referenced by index.html, manifest.webmanifest, and sw.js, including icons and both font files. This prevents a self-contained offline-install validation from the handoff package.
Findings marked CONFIRMED are source-confirmed logic defects. Findings marked DEVICE/HUMAN TEST REQUIRED need a real browser, phone, assistive technology, or live host to validate behavior beyond what source alone can prove.
2. Ranked findings
ID
Severity
Finding
Disposition
CO-001
CRITICAL
Silent storage failure can make new work disappear
FIX BEFORE RELEASE
CO-002
HIGH
Corrupt or unreadable saved data is overwritten by the seeded notebook
FIX BEFORE RELEASE
CO-003
HIGH
A save made after midnight can suppress the next automatic morning flip
FIX BEFORE RELEASE
CO-004
HIGH
Flip Undo can erase edits made after the flip
FIX BEFORE RELEASE
CO-005
HIGH
Multiple tabs use last-write-wins and can silently lose edits
FIX BEFORE RELEASE
CO-006
HIGH
Service worker activation deletes sibling-app caches on the shared origin
FIX BEFORE RELEASE
CO-007
MEDIUM
Backward clock or timezone date changes are treated as a new day
FIX BEFORE STORE RELEASE
CO-008
MEDIUM
Stale uid values can create duplicate task or page IDs
FIX BEFORE STORE RELEASE
CO-009
MEDIUM
Persisted add priority can disagree with the visible selected priority
FIX SOON
CO-010
MEDIUM
Deleting or archiving a page can leave timer intervals alive
FIX SOON
CO-011
MEDIUM
No user backup/restore path exists for a local-only, growing notebook
ADD RESILIENCE
CO-012
MEDIUM
Modal, flip-back, and focus overlays need keyboard/AT containment review
DEVICE/HUMAN TEST REQUIRED
CO-013
QA BLOCKER
Regression harness is not self-contained despite package instructions
FIX HANDOFF/CI
CO-014
QA BLOCKER
QA package omits assets required for PWA/offline validation
FIX HANDOFF PACKAGE
CO-015
LOW
Manual Fresh Page toast calls the current page Yesterday
COPY FIX
CO-016
LOW
Service worker returns index.html as fallback for failed asset requests
HARDEN OFFLINE PATH
3. Detailed findings
CO-001  Silent storage failure can make new work disappear
Severity
CRITICAL
Source
index.html:677-690; privacy.html:35-36
Disposition
CONFIRMED - fix before release
Problem: save() catches every exception from JSON serialization or localStorage.setItem() and deliberately does nothing. The UI continues to mutate the in-memory state as though the save succeeded. There is no persistent warning, no retry state, and no read-only mode.
Why it matters: This is the clearest trust-breaking failure in the app. QuotaExceededError, blocked storage, browser policy, storage corruption, or an implementation failure can leave the user working for minutes or hours. Closing or killing the PWA then discards those changes. The privacy page explicitly describes an in-memory fallback, but the user is not told that the fallback is temporary.
Reproduction: Force localStorage.setItem to throw, or fill the origin close to its localStorage quota. Add or cross off a task. The UI changes. Reopen the app. The newest work is absent, with no warning having appeared.
Recommended fix: Make save() return success/failure and surface a persistent, non-expiring storage error. Do not present the app as safely persisted while storage is unhealthy. If storage is unavailable on first boot, either operate in an explicitly labeled temporary-session mode or block durable-note behavior until the user acknowledges it. Keep the zero-backend design.
Regression tests: Inject a throwing setItem. Verify the app exposes a persistent error, does not claim work is safe, and does not silently continue as durable storage. Test QuotaExceededError specifically. Test recovery after storage becomes writable again.
CO-002  Corrupt or unreadable saved data is overwritten by the seeded notebook
Severity
HIGH
Source
index.html:691-720 and 1742-1754
Disposition
CONFIRMED - fix before release
Problem: load() returns false for malformed JSON, unexpected shapes that throw, or a state with zero pages. Boot interprets any false result as a first run, seeds Home and Errands, and immediately save()s them back to crossoff.v1.
Why it matters: A partially corrupt but recoverable notebook can be destroyed by the recovery path itself. The raw bytes that might have been repairable are replaced by samples. For an app whose only copy lives locally, this is unacceptable failure behavior.
Reproduction: Set crossoff.v1 to malformed JSON or to a shape that causes unpackPage to throw, then reload. load() falls into catch, returns false, and the first-run branch seeds and saves a new notebook over the same key.
Recommended fix: Separate first-run, unavailable-storage, and corrupt-data states. Never overwrite a non-empty raw value after a parse/validation failure. Preserve the original string in a recovery key when possible, and show a recovery/export action. Normalize malformed substructures defensively instead of letting one bad page invalidate the whole notebook.
Regression tests: Malformed JSON survives untouched. A null page or malformed past entry does not trigger whole-notebook replacement. Recovery copy is created when storage is writable. A genuinely empty key still seeds normally.
CO-003  A save made after midnight can suppress the next automatic morning flip
Severity
HIGH
Source
index.html:683, 1765-1785; HANDOFF.md:40-45, 84-86
Disposition
CONFIRMED - fix before release
Problem: doneDate doubles as the notebook work-date marker, but every save() writes doneDate: todayStr(). The rollover watcher intentionally does not run while the user is actively using the app. Therefore, if the app remains visible across midnight and any mutation saves after midnight, doneDate advances even though the page has not been flipped.
Why it matters: If the user then closes the app before a foreground rollover check or hidden 60-second tick runs, the next boot sees doneDate equal to today and skips morningFlip(). Yesterday's crossed-off page remains visible. This recreates the exact graveyard behavior the 2026-08-19 user test was meant to eliminate.
Reproduction: Keep the PWA visible through midnight. Before midnight, cross off at least one task. After midnight, add/edit/cross off anything so save() runs. Close the app before a rollover check. Reopen the same morning. The completed work can remain on the live page because the persisted date was already advanced.
Recommended fix: Stop deriving the logical work date inside save(). Persist a state.workDate (or equivalent) that changes only when rollover is actually processed. On first run set it to today. On load restore it from the saved date. On a forward day transition, capture old workDate, set the new workDate as part of the rollover transaction, reset doneToday, then flip exactly once. A normal edit after midnight must not advance workDate by itself.
Regression tests: Active across midnight, save at 00:01, close within seconds, reopen: exactly one flip. Sleep through midnight: one flip. Stay visible for 20 minutes after midnight: later hide/show still produces one flip. Existing same-day saves do not flip.
CO-004  Flip Undo can erase edits made after the flip
Severity
HIGH
Source
index.html:851-861 and 869-883
Disposition
CONFIRMED - fix before release
Problem: freshPage() and morningFlip() capture whole task-array snapshots. Their Undo handlers later replace p.tasks with those snapshots. Nothing invalidates the Undo when the user edits the fresh page after the flip.
Why it matters: The morning toast lasts 9 seconds. A user can immediately add a new task or edit a carried task, then tap Undo. The whole task array is replaced and those post-flip edits disappear. This is silent data loss caused by the safety mechanism itself.
Reproduction: Trigger a fresh or morning flip. Before the Undo expires, add a task or modify a carried task. Then tap Undo. The handler assigns p.tasks=snapshot and discards the newer mutation.
Recommended fix: Make flip Undo conflict-safe. The smallest safe rule is to invalidate the pending flip Undo on the next mutation after the flip. A stronger option is a revision number: capture the revision at flip time and only allow snapshot restore if no later mutation occurred. Do not silently merge by guessing.
Regression tests: Immediate Undo restores exactly. Add/edit/cross-off after flip, then attempt Undo: the app must not erase the later work. Multi-page morning Undo must follow the same rule.
CO-005  Multiple tabs use last-write-wins and can silently lose edits
Severity
HIGH
Source
index.html:677-690; no storage event, revision, lock, or BroadcastChannel handling exists
Disposition
CONFIRMED - fix before release
Problem: Each tab loads a private in-memory copy of the full notebook. Every save serializes and overwrites the entire crossoff.v1 value. A second tab does not know that the first tab changed storage.
Why it matters: Two tabs opened from the same starting state can each make a valid edit. Whichever tab saves last overwrites the other tab's change. The same race can occur around morningFlip, making the highest-risk lifecycle path even less deterministic.
Reproduction: Open Cross Off in two tabs. Add task A in tab A. Without reloading tab B, add task B in tab B. Reload tab A. Depending on save order, one task is missing.
Recommended fix: Add a minimal concurrency guard. Recommended: persist a revision, remember the loaded revision per tab, and refuse to overwrite when storage contains a newer revision. Use the storage event or BroadcastChannel to mark a tab stale and auto-refresh only when no edit field/sheet is active. Favor conflict prevention over silent last-write-wins.
Regression tests: Two-tab independent adds do not lose either edit. Two tabs hitting new-day logic do not duplicate or overwrite flips. A stale tab cannot save over a newer revision without an explicit safe refresh path.
CO-006  Service worker activation deletes sibling-app caches on the shared origin
Severity
HIGH
Source
sw.js:11-15
Disposition
CONFIRMED - fix before release
Problem: On activate, Cross Off deletes every Cache Storage entry whose key is not exactly cross-off-v10. On a shared skywolfstudio.com origin with many sibling apps, that includes caches owned by other apps.
Why it matters: Installing or updating Cross Off can silently destroy offline caches for unrelated products. It does not erase their localStorage, but it can break their offline start and force redownloads. The package explicitly warned that this must never happen.
Reproduction: Create sentinel caches named for two sibling apps, then activate a new Cross Off service worker. The current filter deletes every sentinel because each key differs from CACHE.
Recommended fix: Only delete this app's old cache versions. For example, delete keys that start with a Cross Off namespace such as 'cross-off-' and are not the current CACHE. Never perform an origin-wide cache purge.
Regression tests: Create several sibling sentinel caches plus cross-off-v9 and cross-off-v10. Activate v10/v11. Only the obsolete cross-off cache is deleted. All sibling caches survive.
CO-007  Backward clock or timezone date changes are treated as a new day
Severity
MEDIUM
Source
index.html:669 and 1775-1785
Disposition
CONFIRMED logic - device/timezone test required
Problem: checkNewDay() tests only t===dayNow. Any different local calendar date, including a date that moved backward because of a timezone change or manual clock correction, is treated as a new day.
Why it matters: Completed work can be archived under the wrong day, doneToday can reset unexpectedly, and a traveler crossing a date boundary westward can get an involuntary page flip. Reversing the clock again can create confusing history.
Reproduction: Complete a task, then move the device date backward one day and trigger visibilitychange/pageshow. Because the date differs, the function resets the count and calls morningFlip(was).
Recommended fix: Track a logical workDate and only run the morning transition when the new local date is strictly later than the workDate. If the date moves backward, preserve the current page and wait until local time catches up or the user deliberately performs a fresh page.
Regression tests: Forward one day flips once. Backward one day does not flip. Travel west across midnight does not archive a page as a future date. Return east does not double-flip. Test DST spring/fall even though the current date-string logic should be less sensitive to one-hour shifts.
CO-008  Stale uid values can create duplicate task or page IDs
Severity
MEDIUM
Source
index.html:665, 696, 800-803, 843, 1685-1687
Disposition
CONFIRMED - harden load
Problem: load() trusts d.uid directly. It does not reconcile uid against IDs already present in active or archived pages. A stale or partially migrated save can therefore issue an ID that is already in use.
Why it matters: Duplicate IDs break assumptions in findTask(), rowFor(), timer interval keys, page restoration, and event targeting. The wrong task can be edited, timed, or redrawn.
Reproduction: Take a valid saved state with existing IDs greater than 1, reduce uid to 1, reload, then create new tasks/pages. New IDs can collide with existing IDs.
Recommended fix: After loading and normalizing pages, recompute uid as the maximum of the stored uid and every active/archived page and task ID. Reject non-finite/non-positive IDs or remap them during normalization.
Regression tests: Stale uid lower than live IDs self-heals. Duplicate IDs in a corrupt save are repaired deterministically. Restoring an archived page cannot reintroduce collisions.
CO-009  Persisted add priority can disagree with the visible selected priority
Severity
MEDIUM
Source
index.html:568-571, 713, 1689-1694, 1758-1763
Disposition
CONFIRMED - fix soon
Problem: state.addPri is loaded from storage and used by parseLine(), but the boot path never synchronizes the NOW/TODAY/SOON button classes to that loaded value. The markup always starts with TODAY visually selected. The priority click handler also does not save immediately.
Why it matters: After a prior session persists NOW or SOON, the next session can visually show TODAY while newly typed tasks are assigned the hidden stored priority. This is a direct UI-to-data mismatch.
Reproduction: Select NOW, add a task so the state is saved, then reload. The UI markup returns to TODAY selected while state.addPri can remain 1. Type another unprefixed task: it uses state.addPri, not the visible selection.
Recommended fix: On boot, set selected and aria-pressed state from state.addPri. Save immediately when the default priority changes if persistence is intentional. If persistence is not intended, stop storing addPri and always reset state.addPri to 2.
Regression tests: Reload after choosing each priority. Visual selection, accessibility state, state.addPri, and created-task pri must always agree.
CO-010  Deleting or archiving a page can leave timer intervals alive
Severity
MEDIUM
Source
index.html:1183-1211, 1349-1387; compare task delete at 1129-1135
Disposition
CONFIRMED - fix soon
Problem: Task deletion calls stopTick(task), but page archive/delete removes a whole page without stopping timers for its tasks. Existing setInterval callbacks retain references to removed task objects.
Why it matters: A timer from a deleted or shelved page can continue consuming resources and can buzz after the page is no longer visible. It may also call save() from a ghost object when it crosses zero.
Reproduction: Start a countdown on a task, then archive or delete its page before the deadline. The timer interval remains in ticks unless another path explicitly stops it.
Recommended fix: Create a clearPageTimers(page) helper and call it before page removal. For archive, define one product rule: either cancel timers when shelving, or pause them explicitly. Do not allow hidden intervals to keep running accidentally.
Regression tests: Delete a timed page: no later buzz and no interval remains. Archive a timed page: behavior matches the documented rule. Restore archived page: no duplicate interval is created.
CO-011  No user backup/restore path exists for a local-only, growing notebook
Severity
MEDIUM
Source
Storage model in index.html:670-688 and HANDOFF.md:71-86; no export/import UI or code present
Disposition
PRODUCT RESILIENCE - strongly recommended
Problem: All pages, archived pages, 120 days of per-page history, notes, steps, records, and raw highlighter point arrays are stored in one localStorage JSON value. There is no download/export, import, or recovery UI.
Why it matters: The design promise that the publisher never receives the list is good, but it also means browser-data clearing, device loss, storage corruption, or quota exhaustion can destroy the only copy. History can become sizable. A synthetic 3-page notebook with 120 days, 20 completed tasks per day, and modest 24-point strokes is roughly 3.9 MiB of JSON, near common localStorage limits. Five such pages is roughly 6.4 MiB.
Reproduction: Use the app heavily for months, archive pages, or create many strokes. Observe the single serialized value growing. Clear site storage or hit quota. There is no supported recovery from the user's own backup because no backup can be created.
Recommended fix: Add a small Backup / Restore section in page settings rather than a new major workflow. Export one versioned JSON file locally. On import, validate and normalize first, preserve the current notebook as a recovery copy, then replace only after successful parse. No account or server is needed.
Regression tests: Export/import roundtrip preserves page order, past ink, chores, step state, records, colors, archived pages, and timers according to policy. Invalid backup never overwrites current data. Older schema versions migrate additively.
CO-012  Modal, flip-back, and focus overlays need keyboard and assistive-technology containment review
Severity
MEDIUM
Source
index.html:589-620, 997-1020, 1236-1284, 1441-1484
Disposition
DEVICE/HUMAN TEST REQUIRED
Problem: The bottom sheet has role=dialog and aria-modal=true, but there is no focus trap or background inerting. The flip-back viewer and focus screen are visual full-screen overlays without dialog semantics, focus containment, or a stored/returned focus target equivalent to the sheet.
Why it matters: Keyboard and screen-reader users can potentially tab into controls hidden behind an overlay, lose context, or exit a viewer with focus landing unpredictably. The privacy page makes specific accessibility claims, so these paths should be tested, not assumed.
Reproduction: Open each overlay with keyboard only and continue tabbing beyond its last control. Repeat with TalkBack/VoiceOver. Verify where focus starts, whether background controls are reachable, and where focus returns on close.
Recommended fix: Use inert on the background while modal overlays are open, or implement a minimal focus trap. Give flip-back/focus appropriate dialog/region semantics and an accessible label. Save and restore the initiating focus element for all overlays.
Regression tests: Keyboard-only pass for sheet, flip-back, and focus. TalkBack and VoiceOver pass. Escape/close returns focus to the initiating control. No hidden background controls are announced while a modal overlay is active.
CO-013  Regression harness is not self-contained despite package instructions
Severity
QA BLOCKER
Source
test/cross-off.test.mjs:1-4; READ_ME_FIRST_FOR_CHATGPT.md package/test instructions
Disposition
FIX HANDOFF/CI
Problem: The handoff says node test/cross-off.test.mjs is plain Node with no dependencies. The test imports JSDOM from jsdom. The package includes no package.json, lockfile, node_modules, or vendored jsdom.
Why it matters: An auditor or clean CI runner cannot reproduce the claimed 83-green result. This weakens confidence precisely where the app is asking for source-verified findings.
Reproduction: Run node test/cross-off.test.mjs in a clean directory containing only this package. Node throws ERR_MODULE_NOT_FOUND for jsdom.
Recommended fix: Either include a dev-only package.json/lockfile and document npm ci followed by npm test, or replace the harness with a dependency-free runner if that is truly required. Do not call it no-dependency while importing jsdom.
Regression tests: Fresh clone/package plus one documented command runs all existing assertions. CI uses the same command. Test count and pass/fail status are printed.
CO-014  QA package omits assets required for PWA/offline validation
Severity
QA BLOCKER
Source
index.html:18-30; sw.js:4-9; manifest.webmanifest icons
Disposition
FIX HANDOFF PACKAGE; live status unproven
Problem: The ZIP does not contain icon.svg, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png, either self-hosted font, or marketing/stripe-thumbnail.png. Several of these are in the service-worker precache list.
Why it matters: caches.addAll(SHELL) is all-or-nothing. In a directory that truly lacked one of those precached files, service-worker installation would reject and offline start would fail. The live server may contain the files, but this handoff cannot prove it.
Reproduction: Unzip the package and compare referenced local paths with included files. The listed assets are absent.
Recommended fix: Include every local runtime asset needed by index, manifest, and service worker in the QA package. For release QA, add a static asset-integrity test that fails when any precache URL or manifest icon is missing.
Regression tests: Clean package starts from local HTTP server with zero 404s. Service worker reaches activated state. Offline reload succeeds. Manifest icons resolve. Font requests resolve.
CO-015  Manual Fresh Page toast calls the current page Yesterday
Severity
LOW
Source
index.html:851-861
Disposition
COPY FIX
Problem: freshPage() is explicitly the manual mid-day fresh start, but its toast says, "Yesterday is in the flip-back pile."
Why it matters: At noon, this is factually wrong and can make the flip-back pile feel date-shifted even though flipPage() stamps todayStr().
Reproduction: Tap Fresh Page during the same day. Read the toast.
Recommended fix: Use neutral wording such as "Previous page is in the flip-back pile, ink and all." Keep morningFlip copy specific to yesterday/new day.
Regression tests: Manual fresh page copy is time-neutral. Morning automatic flip still explains yesterday clearly.
CO-016  Service worker returns index.html as fallback for failed asset requests
Severity
LOW
Source
sw.js:33-40
Disposition
HARDEN OFFLINE PATH
Problem: For any same-origin non-navigation GET, a network failure falls back to caches.match(index.html). That can return HTML when the browser asked for JavaScript, a font, image, or other asset.
Why it matters: If an expected asset is absent from cache, the wrong-content fallback can create MIME/parser errors that obscure the true missing-asset condition. It is unnecessary for non-navigation requests.
Reproduction: Request an uncached same-origin asset while offline under the controlled scope. The catch path can answer with the HTML shell.
Recommended fix: Use the HTML fallback only for navigation requests. For assets, return the cached asset if present, otherwise let the request fail cleanly or provide a type-appropriate fallback only where intentionally designed.
Regression tests: Offline missing asset does not receive text/html unless it was a navigation request.
4. Things that are already solid
The three hard-won interaction invariants are present in source: no render() on resize, touch-action:pan-y with direction locking, and the 350 ms sheet ghost-click guard.
Normal user task and step text is rendered with textContent. sws-ui.js also uses replaceChildren(document.createTextNode(msg)) for toast content. Standard UI input paths therefore avoid straightforward HTML injection.
Task deletion stops its timer before removal. The page-level removal paths simply need the same lifecycle discipline.
Manifest identity is app-specific with id /cross-off/ and scope ./, which is the right direction for the known fleet-wide install identity issue.
The inspected runtime contains no analytics SDK, tracker, account flow, or automatic outbound user-data request. The Stripe tip jar is an explicit external link, not an automatic data call.
Timer deadlines are persisted as wall-clock deadlines, and expired timers are loaded with buzzed=true so reopening the app does not immediately buzz for a deadline that passed while away.
Morning flip operates across all active pages that contain completed work and preserves archived ink snapshots. Chore steps are intentionally reset when a completed chore is rewritten.
Reduced-motion handling exists for confetti and several animations. The gesture is not the only completion path because the edit sheet can auto-stroke a task.
5. Regression tests to add
Storage exception: setItem throws QuotaExceededError. No silent durable-edit illusion is allowed.
Corrupt JSON: original raw save is preserved and not replaced by samples.
Corrupt shape: null page, missing tasks, malformed past entry, malformed stroke, invalid timer duration, and invalid records do not destroy the whole notebook.
Midnight active-use case: save after local midnight before any rollover callback, close immediately, reopen, and verify exactly one fresh-page flip.
Midnight no-edit case: leave app visible across midnight, then background/foreground and verify one flip.
Device asleep through midnight: foreground hours later and verify one flip and correct work-date stamp.
Date moves backward: no automatic flip and no doneToday reset caused solely by backward local date.
Timezone east/west boundary changes: no double flip and no future-dated past entry.
Two tabs add different tasks from the same base revision: neither edit may be silently lost.
Two tabs encounter the same new day: one logical rollover, no duplicate history, no last-writer loss.
Flip Undo after post-flip mutation: Undo is disabled/invalidated or otherwise preserves the newer work.
Stale uid lower than existing IDs: new IDs remain unique across active and archived pages.
Persisted addPri reload: visual selected state, aria state, state.addPri, and new task priority match.
Delete/archive page with running timers: no ghost interval or buzz after removal.
Service-worker cache namespace: sibling cache sentinels survive Cross Off update; only obsolete cross-off-* keys are deleted.
Service-worker asset integrity: every SHELL URL returns 2xx before deployment.
Offline first reload after one successful online load works with network disabled.
Backup export/import roundtrip if CO-011 is implemented, including archived pages and past stroke ink.
Keyboard and TalkBack/VoiceOver overlay traversal: no focus escape into hidden background UI.
6. DEVICE/HUMAN TEST REQUIRED matrix
Area
Test
Pass condition
Midnight lifecycle
Real Android PWA open before midnight, continue using after midnight, close within 60 seconds, reopen. Repeat with device asleep at midnight.
Exactly one correct flip
Timezone/clock
Travel simulation east and west across local date boundary, manual date backward/forward, DST transition dates.
No backward flip or double flip
Gestures
Slow vertical scroll beginning on a canvas, short tap, diagonal motion, half stroke, full stroke, rotation, keyboard opening/closing.
No scroll lock or accidental cross-off
Offline/PWA
Install/update, airplane mode reload, cold launch after service-worker activation, update from prior cache version.
Offline shell reliable
Shared origin
Install/update Cross Off after sibling apps have populated caches.
Sibling caches survive
Accessibility
TalkBack Android and VoiceOver iOS for tabs, rows, edit sheet, flip-back, focus mode, undo toast.
No hidden-focus escape; labels useful
TWA/store
Manifest icons, maskable icon, start URL, Digital Asset Links, privacy URL, no console/runtime errors.
Store-ready
Long-history performance
Several pages with months of history, many strokes, rapid add/edit/cross-off on midrange phone.
No perceptible save jank
7. Recommended implementation order
Fix save/load safety first: explicit storage health, no corrupt-state overwrite, schema normalization, and a recovery path.
Decouple logical workDate from wall-clock save time and add the midnight regression before touching other rollover behavior.
Make flip Undo revision-safe so it cannot overwrite work created after the flip.
Add cross-tab revision/conflict protection.
Fix the service-worker cache deletion filter before the next deployment. This is a small change with fleet-wide impact.
Reconcile uid on load, synchronize addPri UI state, and clean up page timers.
Add local backup/restore and long-history storage tests.
Finish the accessibility containment pass and real-device lifecycle matrix.
Repair the QA package/CI so the test claim is reproducible by anyone from a clean checkout.
8. Code-level invariants for the coding agent
Do not introduce a framework, backend, analytics, or build-time dependency into the runtime.
Do not change the settled ADHD rulings: no guilt mechanics, automatic new-day behavior with Undo, no destructive confirmation dialog, no overdue labeling.
Keep the resize, canvas gesture, and sheet ghost-click invariants exactly intact.
Treat persistence as a transaction boundary: a mutation is not "safe" unless durable storage accepted it.
Treat workDate as logical state. A normal save must never advance it across midnight on its own.
Treat whole-snapshot Undo as conditional. Never restore a snapshot over newer user work.
Treat cache deletion as namespace-scoped. Cross Off may clean only Cross Off cache keys.
Treat any cross-tab stale state as a conflict, not permission to overwrite.
9. Minimal patch sketches
Service-worker cache cleanup:
caches.keys().then(keys => Promise.all(
  keys
    .filter(k => k.startsWith('cross-off-') && k !== CACHE)
    .map(k => caches.delete(k))
))
Logical date rule:
// Persist a logical page/work date, not todayStr() on every save.
state.workDate = loaded.doneDate || todayStr();

// save():
doneDate: state.workDate

// rollover: only when today > workDate
const next = todayStr();
if (next > state.workDate) {
  const prior = state.workDate;
  state.workDate = next;
  state.doneToday = 0;
  morningFlip(prior);
}
Corrupt-save rule:
if (raw) {
  try { data = JSON.parse(raw); }
  catch (err) {
    // Never overwrite raw here. Preserve/export/recover it.
    return { status: 'corrupt', raw };
  }
}
Revision-safe save rule:
// Sketch only: compare persisted revision before replacing the whole notebook.
if (diskRevision > stateRevision) {
  markTabStale();
  return false;
}
stateRevision += 1;
writeState();
10. Release acceptance criteria
PASS: CO-001 through CO-006 are fixed and covered by automated regressions.
PASS: No storage exception can occur without a visible, persistent user-facing warning.
PASS: A corrupt non-empty crossoff.v1 value is never silently replaced by seeded sample data.
PASS: The active-across-midnight, asleep-at-midnight, and reopen-after-midnight tests all produce exactly one correct flip.
PASS: Backward date/timezone movement does not trigger a new-day flip.
PASS: Flip Undo cannot erase any mutation performed after the flip.
PASS: Two tabs cannot silently overwrite each other.
PASS: Cross Off service-worker activation deletes only obsolete cross-off-* caches.
PASS: Every service-worker shell URL and manifest icon resolves successfully in the release package/live host.
PASS: The existing 83 assertions plus the new regression suite run from a clean checkout using one documented command.
PASS: A real Android PWA passes scroll/highlighter/keyboard/rotation tests without regressing the three hard-won invariants.
PASS: TalkBack or VoiceOver plus keyboard testing confirms that modal overlays contain focus and return it correctly.
PASS: Privacy copy remains accurate after any persistence/backup changes. A local file backup remains on-device unless the user explicitly shares it.
11. Final assessment
Cross Off does not need a rewrite. The core product direction, highlighter interaction, no-shame design, focus/timer idea, and morning page concept are coherent. The risk is concentrated in lifecycle and persistence edges: the exact places where a local-only PWA has to be unusually conservative.
The best next build is therefore a trust build, not a feature build. Make storage failure loud, make corrupted saves recoverable, make the work date transactional, make Undo conflict-safe, prevent stale tabs from overwriting newer state, and constrain cache deletion to Cross Off. Once those are green, the remaining work is mostly hardening, accessibility, and packaging.
