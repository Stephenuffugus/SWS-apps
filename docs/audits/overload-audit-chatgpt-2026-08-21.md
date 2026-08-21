# ChatGPT QA audit: Overload, 2026-08-21

Verbatim conversion of the report Stephen received on 2026-08-21
(source file: OVERLOAD_Deep_QA_Audit.docx), extracted the same day so it is greppable
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


OVERLOAD
Deep QA, Debugging, UX, and Product Audit
Source-first independent audit • 2026-08-21
Project
OVERLOAD
Live URL
https://skywolfstudio.com/overload/
Source
overload-qa-package.zip supplied in this conversation
Audit stance
Source-first. Findings labeled CONFIRMED, PACKAGE/REPRODUCTION, or DEVICE/HUMAN TEST REQUIRED.
Executive Summary
OVERLOAD has a strong, unusually coherent product concept: the prescription is the interface, and the core gym loop is genuinely compact. The current source is small enough to reason about directly, and several important behaviors are already covered by a 68-assertion jsdom harness.
I would not ship the current build as a store/TWA candidate yet. Multiple release-blocking or high-severity defects are outside the existing regression coverage.
The most urgent issue is in sw.js: on activation, OVERLOAD deletes every cache on the entire skywolfstudio.com origin except its own current cache. Because Cache Storage is origin-wide, an OVERLOAD update can erase offline caches belonging to sibling apps.
Other high-severity findings affect imported data safety, exact barbell prescriptions, historical exercise identity, persistence failures, rest-timer lifecycle, and rep logging coverage.
The supplied handoff is good enough for an independent source audit, but it is not fully reproducible as packaged: the test imports jsdom without dependency metadata, and the ZIP omits files required by the service-worker pre-cache.
Ranked Findings
ID
Severity
Disposition
Finding
OL-001
BLOCKER
CONFIRMED
Service worker activation deletes sibling-app caches across the shared origin
OL-002
HIGH
CONFIRMED
Imported/stored data is not deeply sanitized; malformed history can brick startup and untrusted backup fields reach innerHTML
OL-003
HIGH
CONFIRMED
Plate math can silently disagree with the prescribed barbell weight
OL-004
HIGH
CONFIRMED
Exercise swaps rewrite historical identity and contaminate e1RM history
OL-005
HIGH
CONFIRMED BY SOURCE
Rest overlay can be bypassed by keyboard, allowing overlapping timers and an orphan interval
OL-006
HIGH
CONFIRMED
localStorage write failures are swallowed, allowing silent data loss and false restore success
OL-007
HIGH
PRODUCT / SAFETY
85% swap weight is transferred across exercises with radically different loading scales
OL-008
MEDIUM-HIGH
CONFIRMED
Configurable rep ranges can exceed the reps the one-tap chip UI can record
OL-009
MEDIUM
CONFIRMED
Keyboard activation of the settings gear can also launch the workout
OL-010
MEDIUM
CONFIRMED
Numeric input constraints are not consistently enforced in JavaScript
OL-011
MEDIUM
CONFIRMED
7-day trend is point-to-point, can use less than 7 days, and can advise from insufficient data
OL-012
MEDIUM
CONFIRMED
Reset-all violates the stated Undo interaction invariant
OL-013
MEDIUM
CONFIRMED
Service worker caches non-success responses and uses index.html as an arbitrary asset fallback
OL-014
MEDIUM
CONFIRMED
Manifest icons are not all included in the offline shell
OL-015
MEDIUM
PACKAGE/REPRODUCTION
Regression harness is not runnable from the ZIP as documented
OL-016
MEDIUM
PACKAGE/REPRODUCTION
ZIP omits assets required by the service-worker install path
OL-017
LOW-MEDIUM
DEVICE TEST REQUIRED
Rest-end beep may be blocked when AudioContext is first created at timer completion
OL-018
LOW-MEDIUM
DEVICE LIMITATION
navigator.vibrate() is unsupported in Safari/iOS
OL-019
LOW-MEDIUM
CONFIRMED BY SOURCE
Modal/focus behavior is incomplete for settings and rest overlays
OL-020
PASS
VERIFIED BY SOURCE
Manifest identity is unique to /overload/
OL-021
PASS
VERIFIED BY SOURCE
Default service-worker control scope is limited to /overload/
Detailed Findings
OL-001 — Service worker activation deletes sibling-app caches
Severity: BLOCKER  |  Disposition: CONFIRMED
Source: sw.js lines 12-16
The activate handler deletes every cache key where k !== CACHE. It does not check whether the cache belongs to OVERLOAD.
I reproduced the logic with portal-v4, hush-v7, overload-v8, overload-v9, and other-app-cache. It deleted every name except overload-v9.
Impact: an OVERLOAD install/update can remove offline assets for unrelated Sky Wolf Studio apps on the shared origin.
Minimum correction / direction: Only delete stale caches in OVERLOAD's own namespace, such as old overload-* keys.
Regression tests:
Seed sibling cache names and stale OVERLOAD names; assert only stale overload-* entries are deleted.
OL-002 — Import/load sanitation is incomplete
Severity: HIGH  |  Disposition: CONFIRMED
Source: index.html lines 411-437, 535-554, 808-839, 854-875
load() validates only part of the nested schema. History entries survive if they merely contain a reps array; date, w, reps values, and verdict are not rebuilt safely. Weigh-in objects are also not deeply rebuilt.
renderHist() calls h.verdict.toUpperCase() without confirming verdict exists. A history entry {reps:[8]} can pass load() and then throw during initialization.
Program IDs, outcomes, history fields, and body-fat values can flow into innerHTML/HTML attributes without output encoding. A crafted backup should be treated as untrusted file input.
Minimum correction / direction: Deeply rebuild imported/stored objects with strict enums, bounded finite numbers, valid dates, safe IDs, and safe DOM rendering.
Regression tests:
Missing verdict must not throw.
HTML-looking imported strings must remain text and never create DOM/event handlers.
Invalid dates/reps/outcomes must be normalized or dropped.
OL-003 — Plate math can disagree with the prescription
Severity: HIGH  |  Disposition: CONFIRMED
Source: index.html lines 467-486, 647-660, 788-793
A 135 lb bench with early multiple failures deloads to 122.5 lb.
plateMath(122.5) prints 35 + 2.5 / side, which totals 120 lb with a 45 lb bar. The function silently discards the unrepresentable 1.25 lb per-side remainder.
Arbitrary starting decimals and swap/deload rounding can generate other non-loadable barbell totals.
Minimum correction / direction: Create one loadability invariant and apply it to starting weight, +/- adjustment, deload, swap, and warm-up. Never print plate math unless the represented plates sum exactly to the prescription.
Regression tests:
For every generated barbell weight, decomposed plate total must equal the prescription exactly.
OL-004 — Exercise swaps corrupt historical identity
Severity: HIGH  |  Disposition: CONFIRMED
Source: index.html lines 508-512, 739-748, 788-793, 830-839
History entries do not store exercise identity.
doSwap() mutates p.ex. renderHist() then labels every old history entry with the current p.ex.
e1rmSeries() continues across the unchanged history array, so unlike exercises can be plotted as one strength line.
Minimum correction / direction: Store immutable exercise identity on each history record and segment/reset e1RM across exercise changes.
Regression tests:
Record exercise A, swap to B, assert A history still says A and B e1RM excludes A.
OL-005 — Rest mode can create overlapping/orphan timers
Severity: HIGH  |  Disposition: CONFIRMED BY SOURCE
Source: index.html lines 173-179, 715-736
Rest opens without moving focus, so the previously focused set button remains active behind the overlay.
logSet() does not reject input while resting. restStart() starts a new interval without clearing an existing one.
Because restIv stores only the newest interval ID, an older interval can become orphaned and repeatedly trigger beep/vibrate after its deadline.
Minimum correction / direction: Make rest an explicit single-active state: block set logging while active, clear before start, focus the rest control, and restore focus when rest ends.
Regression tests:
Press Enter twice on the same focused set control without restEnd(); assert one set only and one interval only.
OL-006 — Persistence failure is silent
Severity: HIGH  |  Disposition: CONFIRMED
Source: index.html lines 411-439, 867-875, 897-902
save() catches localStorage errors and does nothing.
Restore catches setItem failure, then still renders and shows 'Backup restored.' and returns true.
A local-first app therefore can appear to save while work is not durable.
Minimum correction / direction: Make persistence success/failure observable and never announce success until the write is known to have succeeded.
Regression tests:
Stub setItem to throw during create, finish, delete, and restore; assert no false success.
OL-007 — 85% swap weight is unsafe across unlike lifts
Severity: HIGH  |  Disposition: PRODUCT / SAFETY
Source: index.html lines 758-793
Same-muscle alternatives have different equipment and loading scales.
A 225 lb bench can randomly become a Cable Fly at roughly 192.5 lb under the current universal 85% rule.
This is consistent with the pinned product rule, so it requires a deliberate algorithm decision rather than a local code patch.
Minimum correction / direction: Use exercise-specific conservative mapping or a tap-only first-load confirmation on swap.
OL-008 — Rep UI cannot represent every allowed range
Severity: MEDIUM-HIGH  |  Disposition: CONFIRMED
Source: index.html lines 614-615, 653-655, 681-704
Settings allow 1-30 through 30-30, but workout chips expose only the 11 values immediately below repMax plus the HIT button.
For 1-30, the user can log 30 or 29 down to 19, but cannot log 1-18.
Minimum correction / direction: Either constrain range width to the one-tap UI's capacity or adapt the chip layout while preserving one-tap logging.
Regression tests:
Generate allowed rep ranges and assert every reportable rep is representable.
OL-009 — Settings gear keyboard event also starts workout
Severity: MEDIUM  |  Disposition: CONFIRMED
Source: index.html lines 543-562
The due card acts as a button and contains a real gear button.
Mouse handling ignores gear-origin clicks, but the parent keydown handler does not ignore gear-origin Enter/Space.
Keyboard activation can call startWorkout() before the gear's native click opens settings.
Minimum correction / direction: Avoid nested button semantics or ignore keyboard events originating from .gear.
Regression tests:
Focus gear; dispatch Enter and Space; assert workout does not start.
OL-010 — Numeric limits are inconsistently enforced
Severity: MEDIUM  |  Disposition: CONFIRMED
Source: index.html lines 247-259, 647-660, 798-806
Starting weight max=2000 is not enforced by the click handler. A larger value can exist live and later be silently clamped on reload.
Bodyweight max=1500 is not enforced in JavaScript.
Body-fat max=80 is not enforced; negative nonzero values can also be saved.
Minimum correction / direction: Validate and normalize in JavaScript at the state boundary, not only with HTML attributes.
Regression tests:
Out-of-range values must be rejected or normalized consistently before save.
OL-011 — 7-day trend can overstate certainty
Severity: MEDIUM  |  Disposition: CONFIRMED
Source: index.html lines 808-828
The metric is last point minus one point at/before seven days; if none exists, it uses the first point.
With one weigh-in it reports 0 / 7d and 'Holding'. With only a few days of data it can still label the delta / 7d.
This is not a rolling or smoothed 7-day trend.
Minimum correction / direction: Require sufficient elapsed time/data before weekly guidance and either rename the metric or calculate a real rolling trend.
OL-012 — Reset-all breaks the Undo house rule
Severity: MEDIUM  |  Disposition: CONFIRMED
Source: index.html lines 897-902
The handoff requires destructive actions to use Undo rather than confirm.
Reset-all uses confirm and explicitly says it cannot be undone.
Minimum correction / direction: Snapshot the prior state, reset, and offer Undo using the same forgiving pattern as lift deletion.
OL-013 — Service-worker response handling is too broad
Severity: MEDIUM  |  Disposition: CONFIRMED
Source: sw.js lines 23-40
Network responses are cached without checking res.ok.
Arbitrary same-origin asset fetch failures fall back to index.html, which can return HTML to font/image/JS requests.
Minimum correction / direction: Cache only appropriate successful responses and use request-type-appropriate offline fallbacks.
Regression tests:
Assert 404/500 responses are not cached; asset failure must not return HTML.
OL-014 — Offline shell omits manifest icons
Severity: MEDIUM  |  Disposition: CONFIRMED
Source: manifest.webmanifest lines 10-14; sw.js lines 4-8
Manifest references maskable and Apple touch icons that are not in SHELL.
This weakens the claim of a complete offline/install shell.
Minimum correction / direction: Make the shell/manifest asset list intentional and testable.
OL-015 — Test harness packaging is not reproducible
Severity: MEDIUM  |  Disposition: PACKAGE/REPRODUCTION
Source: test/overload.test.mjs lines 1-8; README/handoff
The docs say plain Node/no dependencies, but the test imports jsdom.
No package.json, lockfile, vendored module, or jsdom version is included.
The documented command fails in a clean environment with ERR_MODULE_NOT_FOUND.
Minimum correction / direction: Include a minimal pinned dev dependency and exact install/test command, or make the harness dependency-free.
OL-016 — QA ZIP omits service-worker shell assets
Severity: MEDIUM  |  Disposition: PACKAGE/REPRODUCTION
Source: sw.js SHELL and manifest references
Missing from ZIP: icon.svg, icon-192.png, icon-512.png, four WOFF2 fonts, maskable icon, and Apple touch icon.
Because service-worker install uses cache.addAll(SHELL), the package cannot reproduce the PWA install path locally.
Minimum correction / direction: Include all shell-required assets in the next handoff, even if marketing/media assets stay omitted.
OL-017 — Rest beep needs real-device verification
Severity: LOW-MEDIUM  |  Disposition: DEVICE TEST REQUIRED
Source: index.html lines 448-460, 725-735
AudioContext is first created at timer completion rather than inside the user's set tap.
Browser Web Audio autoplay policies can require create/resume from user activation, and resume rejection is ignored.
Minimum correction / direction: Prime/resume audio from a user gesture and verify foreground/background/lock behavior on target devices.
OL-018 — Vibration is not cross-platform
Severity: LOW-MEDIUM  |  Disposition: DEVICE LIMITATION
Source: index.html line 461
Feature detection is safe, but Safari/iOS currently does not support Navigator.vibrate().
Treat haptics as an Android/compatible-browser enhancement rather than a universal rest-end signal.
Minimum correction / direction: Keep beep/visual completion reliable even when vibration is unavailable.
OL-019 — Modal focus behavior is incomplete
Severity: LOW-MEDIUM  |  Disposition: CONFIRMED BY SOURCE
Source: index.html lines 336-338, 568-575, rest CSS
Settings is aria-modal but focus is not moved, trapped, or restored.
Rest overlay also leaves focus behind it, directly contributing to OL-005.
Minimum correction / direction: Implement predictable modal focus entry/exit and test with keyboard, TalkBack, and VoiceOver.
Verified Good / Non-Findings
Manifest identity is already unique: start_url './', scope './', id '/overload/'. This is the correct direction for the known fleet identity collision.
Default service-worker control scope is limited to /overload/. The blocker is cache deletion, not page-control scope.
The verdict decision order matches the pinned rules on static review.
Session +/- weight uses W.w and does not mutate the stored prescription until finish.
The current render-then-show order preserves the verdict/result card.
Regression Tests to Add
1. Cache namespace isolation across sibling apps.
2. Deep storage/import coercion for missing/invalid nested fields.
3. Backup injection safety: HTML-like strings must never create DOM/event handlers.
4. Barbell loadability invariant across create/progress/deload/swap/adjust/warm-up.
5. Swap history identity and e1RM segmentation.
6. Persistence failure behavior when localStorage throws.
7. Rest lifecycle: one active timer, no set logging while rest is active.
8. Rep UI coverage for every allowed configuration.
9. Gear keyboard Enter/Space does not start workout.
10. Reset-all Undo restores exact prior state.
11. Bodyweight/body-fat bounds enforced in JavaScript.
12. Trend with insufficient elapsed time does not claim /7d guidance.
13. Service worker does not cache non-OK responses.
14. Offline shell contains every required resource.
15. Duplicate/missing program IDs regenerate uniquely.
16. Settings modal focus enters, remains inside, and returns to the trigger.
17. Audio after lock/background/foreground transition.
DEVICE/HUMAN TEST REQUIRED Matrix
Area
Android Chrome
Android PWA
TWA
iPhone Safari
iPhone PWA
Rest beep: foreground timer
Required
Required
Required
Required
Required
Rest beep: lock/background
Required
Required
Required
Required
Required
Vibration
Required
Required
Required
Expected unsupported
Expected unsupported
Backup download
Required
Required
Required
Required
Required
Restore file picker
Required
Required
Required
Required
Required
Install affordance
Required
Required
N/A
Required
Required
Safe-area/nav layout
Required
Required
Required
Required
Required
Screen reader
TalkBack
TalkBack
TalkBack
VoiceOver
VoiceOver
Offline cold start
Required
Required
Required
Required
Required
Release Acceptance Criteria
1. OVERLOAD activation cannot delete any non-OVERLOAD cache.
2. A malformed or stale overload.v2 object cannot throw during initialization.
3. Imported backup content cannot create markup or executable event handlers.
4. Every barbell weight shown by the engine has an exact plate representation under the supported plate model.
5. Exercise swaps preserve historical exercise identity and do not mix unlike lifts in e1RM.
6. Persistence failures are visible and no success message is shown unless data was actually stored.
7. Rest mode permits only one active timer and blocks accidental set logging until rest is ended/skipped.
8. Every allowed rep range is fully loggable, or unsupported ranges are prevented.
9. The regression suite runs from a clean package with pinned dependency instructions.
10. The local PWA package includes every pre-cached shell resource.
11. Reset-all has Undo consistent with the house interaction rule.
12. Android/TWA and iOS device tests pass for backup/restore, offline cold start, rest timer, audio, and install behavior.
Package Completeness Assessment
Complete enough for independent source-level QA: YES.
The package contains the real single-file app, service worker, manifest, privacy page, shared SWS UI helper, handoff, and regression source.
Complete enough for clean independent test/PWA reproduction: NO.
No package.json or pinned jsdom dependency even though the test imports jsdom.
No lockfile or dependency version.
Missing pre-cached fonts.
Missing icons required by sw.js.
Missing additional manifest icons.
Exact Live URL
https://skywolfstudio.com/overload/
The URL resolved successfully during this audit and the rendered text/content matched the supplied project at a high level. The public crawler did not expose enough JavaScript source to prove byte-for-byte parity with the ZIP, so source-level findings are grounded in the supplied handoff.
External Compatibility References
MDN, CacheStorage — https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage
MDN, ServiceWorkerContainer.register() — https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
MDN, Web Audio API best practices — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
MDN, Autoplay guide — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
MDN, Navigator.vibrate() — https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
Can I Use, Vibration API — https://caniuse.com/vibration
