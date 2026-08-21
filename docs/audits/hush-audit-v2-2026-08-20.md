# ChatGPT code-level QA audit: Hush, v2, 2026-08-20

Plain-text conversion of Hush_Code_Level_QA_Audit_v2.docx (same folder),
extracted 2026-08-21. This one DID see the real source package and supersedes
the pre-source Hush audit. Fix state as of 2026-08-21 is tracked in
apps/hush/AUDIT-NOTES.md and docs/HANDOFF-2026-08-21-OPUS.md.


LUCID WINDS / SKY WOLF STUDIO
Hush Sound Machine
Code-Level QA, Debugging & Product Audit
Based on the actual Hush source package, not just the public page
Prepared August 20, 2026  |  Supersedes the pre-source Hush audit
IMPORTANT FOR THE CODING AGENT
Use this document instead of blindly implementing the earlier 20-page pre-source audit. The first audit was intentionally speculative because the live page could not be fetched. This version was produced after inspecting the real Hush source, running both included test suites and the mutation self-test, and performing targeted headless Chromium runtime checks. Several earlier recommendations are now known to be unnecessary because Hush already implements them well.

Scope limit
I can inspect source and execute browser logic, but I cannot physically listen through the target phone/speaker, receive a real phone call, lock a physical iPhone, or run an eight-hour battery test in this environment. Anything that truly requires ears, Bluetooth hardware, lock-screen behavior, SPL calibration, or overnight device measurement is labeled DEVICE/LISTENING TEST REQUIRED rather than invented as a confirmed bug.



1. Executive Summary
The good news: Hush is much more sophisticated than the first external audit could see. It already has a strong Web Audio engine, procedural sound generation, an AudioContext-clock sleep fade, safe share-link whitelisting, local-state sanitization, a prefix-safe service worker, Media Session support, privacy-conscious microphone routing, and unusually serious automated tests.
The bad news: the code-level pass found several real defects the existing tests do not protect, including one safety-critical volume-cap bug, multiple trial/data-integrity problems, two confirmed simple-mode transport bugs, an adaptive-masking truthfulness bug, and overnight scheduling/memory risks.
Highest-priority confirmed defect
Adaptive masking can defeat the nursery volume cap. With the cap ON, volume ring at 100%, and maximum adaptive lift, targetGain() returns 1.0 (full output), even though the same capped state without adaptive lift returns 0.34. The current test suite explicitly checks only that adaptive lift stays below 1.0, so the test currently blesses the wrong safety invariant.

Pri
ID
Finding
Severity
Disposition
P0
HUSH-001
Adaptive masking can bypass nursery cap
CRITICAL
Fix before release
P0
HUSH-002
Simple-mode START/timer/full-screen can play a different sound than the recommendation
HIGH
Confirmed runtime
P0
HUSH-003
Manual Stop leaves a phantom timer; restart no longer has a deadline
HIGH
Confirmed runtime
P0
HUSH-004
Trial assignments and morning logs use different calendar-night keys
CRITICAL
Confirmed source
P0
HUSH-005
Trial sound can be changed after assignment and still counted
HIGH
Confirmed source
P0
HUSH-006
Blind trial UI is not truly label-blind once controls are opened
HIGH
Confirmed design
P0
HUSH-007
Same sound can be selected for both trial arms
HIGH
Confirmed source
P0
HUSH-008
Trial keeps assigning beyond planned sample size
HIGH
Confirmed source
P0
HUSH-009
Primary permutation analysis ignores block-randomized repeated-measures design
HIGH
Method mismatch
P1
HUSH-010
Trial/night storage is loaded without validation or migration
HIGH
Confirmed source
P1
HUSH-011
Manual/imported sleep metrics lack centralized range/date validation
HIGH
Confirmed source
P1
HUSH-012
Reset everything does not erase trial/history data
HIGH
Confirmed source
P1
HUSH-013
Adaptive masking stays visibly ON after microphone permission fails
HIGH
Confirmed runtime
P1
HUSH-014
Program fades still depend on throttled JavaScript ticks
HIGH
Confirmed architecture
P1
HUSH-015
Look-ahead audio events can survive rapid off/on or restart transitions
HIGH
Confirmed risk
P1
HUSH-016
Visualizer event queues can grow all night while RAF is suspended
HIGH
Confirmed source
P1
HUSH-017
One-shot Web Audio nodes lack deterministic disconnect cleanup
MEDIUM
Soak risk
P1
HUSH-018
start() resumes suspended but not interrupted contexts
HIGH
Confirmed source
P1
HUSH-019
Wake-lock requests are not idempotent and can race
HIGH
Confirmed source
P1
HUSH-020
localStorage write failure can expose stale state and is silent to user
HIGH
Confirmed source
P1
HUSH-021
Calibration test tone bypasses the app safety/limiter chain
MEDIUM
Confirmed architecture
P1
HUSH-022
Service worker can activate after incomplete shell precache
MEDIUM
Confirmed source
P2
HUSH-023
Stopped app keeps Web Audio graph running
MEDIUM
Battery test required
P1
HUSH-024
Pinch zoom is disabled
HIGH
Confirmed accessibility
P1
HUSH-025
Faint text contrast is about 2.68:1
HIGH
Confirmed accessibility
P1
HUSH-026
Canonical URL points to skywolfstudio.com while supplied live URL is lucidwinds.com
HIGH
Confirmed config
P2
HUSH-027
No H1; public/manifest naming is too generic for crowded Hush category
MEDIUM
Confirmed markup
P2
HUSH-028
“Export everything” does not export everything
MEDIUM
Confirmed source
P2
HUSH-029
“X nights” habit counter counts calendar-day selections, not nights
MEDIUM
Confirmed source
P1
HUSH-030
Cochrane 2015 music citation has the wrong study/participant count
HIGH
Externally verified
P1
HUSH-031
50 dBA / AAP nursery wording is too absolute and partly outdated
HIGH
Externally verified
P2
HUSH-032
Trial power simulation claims are not reproducible from shipped package
MEDIUM
Evidence reproducibility
2. What Was Actually Tested
Ran node hush/tests/hush_tests.mjs: 119 assertions passed, 0 failed.
Ran node hush/tests/hush_tests.mjs --selftest: all 22 intentional source mutations were caught. This is a strong test-quality practice.
Ran node scripts/hush_audit.js hush/index.html: 155 assertions passed, 0 failed.
Loaded the actual index.html in headless Chromium and started Web Audio successfully; no page-level JavaScript exceptions were observed in the targeted sessions.
Ran focused runtime proofs for the simple-mode start mismatch, phantom timer state, and denied-microphone adaptive-mask state.
Rendered the UI at 320x568, 375x667, and 1365x768. No document-level horizontal overflow was found in those viewports.
Performed static semantic/accessibility checks: no duplicate IDs, all range controls have accessible labels, but there is no H1 and pinch zoom is disabled.
Calculated contrast for --faint on #0E1220: approximately 2.68:1. --dim is approximately 5.57:1.
Runtime proof: conflicting first-run play paths
At the audit time, pickTonight() recommended “newborn.” Before playback: noise=brown, preset=null, tonight=newborn. Clicking the circular START produced noise=brown, preset=null. Clicking the recommendation Play produced preset=newborn. Clicking the 20-minute timer while stopped also started the default/current brown state rather than the recommendation.

Runtime proof: phantom timer
After starting a 20-minute timer, stopping with the circular control left S.timer=20 while timerEnd=0. The UI continued to show “20 min” and both timer grids showed 20 as selected. Starting again produced playing=true with S.timer=20 but timerEnd=0, so there was no actual stop deadline.

Runtime proof: adaptive switch lies after permission failure
With microphone access unavailable/denied, toggling Adaptive masking resulted in S.adapt=true, S.micOn=false, micInit=false, and aria-pressed=true while the meter message correctly said microphone access was declined.

3. Systems That Are Already Good: Do Not Rewrite Blindly
Sleep timer fade architecture: the audible fade is scheduled on the AudioContext clock and wall clock remains deadline authority. This directly solves browser timer throttling for the normal sleep timer.
Main saved state sanitization: sanitiseSaved() type-checks, range-clamps, drops unknown keys, and enum validation runs after tables exist.
Share links: whitelisted state only; protected keys such as volume, cap, mic and mode cannot be injected.
Preset volume behavior while already playing: current user volume is held so changing sound cannot unexpectedly raise the room level.
Noise-source switching: 120 ms equal-power crossfade with cleanup of the replaced long-running source.
Service-worker cache ownership: activate deletes only hush-* caches, which is essential on the shared origin.
Microphone privacy path: the meter MediaStreamSource connects to an analyser and is deliberately not connected to destination.
Offline-first architecture is already present. Hush is zero-dependency and procedural; do not add a framework or external audio CDN merely because it is fashionable.
Media Session support already exists. The earlier pre-source recommendation to “add Media Session” is stale.
iOS screen-lock limitation is currently disclosed rather than faked. Keep that honesty until physical-device testing supports a stronger claim.
Existing mutation self-test is valuable. Extend it; do not replace it with snapshot-only tests.
4. Confirmed Code Findings and Required Fixes
HUSH-001 - Adaptive masking defeats the nursery volume cap
Severity: CRITICAL
Status: CONFIRMED CODE DEFECT
Source location: index.html 1110-1120, 1524-1526, 1664-1674; hush_tests.mjs 270-284
Finding. targetGain() multiplies the nominal cap factor (0.34) by adaptGain and only then clamps to 1.0. adaptGain can rise to 3.5. Therefore “cap ON” is not a final ceiling.
Why it matters. The UI describes the cap as limiting maximum output and specifically recommends leaving it on for babies/toddlers. A safety control that can be bypassed by another feature is a release blocker.
Reproduction / proof. Preserve the current capped loudness curve, but make the cap the final ceiling after adaptive/program multipliers. Also decide whether adaptive masking is allowed to raise level while the nursery cap is on; if yes, it must still never exceed the capped ceiling.
Required fix. The included test currently asserts only that adaptive lift cannot exceed 1.0. At volume=100, cap=true, progGain=1, adaptGain=3.5, targetGain() returns 1.0. Without adaptive lift the same state returns 0.34.
Regression test. Change the test from “adaptive <= 1.0” to “with cap ON, every combination of vol/prog/adapt is <= 0.34.” Add a property-style sweep over vol 0..100 and adapt 1..3.5.
function targetGain() {
  const capMax = S.cap ? 0.34 : 1.0;
  if (!playing) return 0;
  const requested = Math.pow(S.vol/100, 2) * capMax * progGain * adaptGain;
  return clamp(Math.min(requested, capMax), 0, capMax);
}
HUSH-002 - Simple mode has multiple start authorities that can play different sounds
Severity: HIGH
Status: CONFIRMED RUNTIME DEFECT
Source location: index.html 735-746, 1475-1508, 1544-1549, 2069-2074, 3327-3342, 3400-3427
Finding. The recommendation card is driven by pickTonight(), but the dominant circular START calls start() directly. start() plays whatever is currently in S. The timer also auto-starts via start(), and Full screen auto-starts via start(). Only the recommendation Play goes through playAnything(tonightPick.id).
Why it matters. The simple-mode promise is “one recommendation, one button,” yet first-run users can hear a different sound depending on which obvious control they touch. This damages trust and habit-building.
Reproduction / proof. Create one simple-mode start authority, for example playSimplePrimary(). Core START and any start-on-timer/full-screen behavior must route through it. Better: timer chips should configure the timer without silently starting audio; opening Full screen should visualize the selected/current sound and, if it starts playback, use the same primary choice.
Required fix. Headless Chromium proof: recommendation=newborn, initial state noise=brown/preset=null. Circular START played brown/preset=null. Recommendation Play set preset=newborn. A 20-minute timer from stopped also started brown/preset=null.
Regression test. On a clean state at each mocked hour, assert that #core, #tonightGo, timer-start (if retained), and Full screen start all resolve to the same intended sound ID/config.
HUSH-003 - Manual Stop leaves a phantom timer with no deadline
Severity: HIGH
Status: CONFIRMED RUNTIME DEFECT
Source location: index.html 1494-1506, 1544-1587, 1961-1965
Finding. stop() calls clearTimer(), but clearTimer() clears timerEnd without setting S.timer=0. Timer buttons and subtitles are painted from S.timer, so the app can display an active 20/45/90-minute timer that no longer exists.
Why it matters. A user can stop, restart, and reasonably believe the displayed timer will stop the sound. It will not, because timerEnd is zero and start() has nothing to re-arm.
Reproduction / proof. Separate “selected timer duration” from “active timer” if you want to remember a preference. Otherwise user Stop must set S.timer=0, persist it, clear pressed states, and repaint both timer UIs. Do not display a duration as active without a real deadline.
Required fix. Runtime proof: after 20-minute timer -> Stop, S.timer remained 20 while timerEnd became 0. Restart preserved S.timer=20 and timerEnd=0.
Regression test. Timer 20 -> Stop -> Start must either show Off and run indefinitely, or intentionally re-arm a fresh 20-minute deadline. Never show 20 with timerEnd=0.
HUSH-004 - Trial assignment dates and morning-log dates are offset across midnight
Severity: CRITICAL
Status: CONFIRMED CODE DEFECT
Source location: index.html 2745-2778, 2946-2955, 3030-3036, 3300-3301
Finding. tonightArm() assigns the arm using today() at playback start. Morning logs and imported sleep sessions are labeled by the morning/wake date. A normal 10 PM Aug 20 trial start is assigned Aug 20, while the Aug 21 morning log/import is keyed Aug 21.
Why it matters. armData() joins by exact date, so ordinary overnight sessions can fail to join the randomized arm. The “real experiment” can silently discard the very nights it is supposed to analyze.
Reproduction / proof. Define one canonical sleepDate/nightKey used everywhere. For trial starts, a session beginning after noon should normally map to the next local calendar day; after midnight maps to the same morning date. Persist startedAt plus sleepDate so DST/calendar behavior is auditable. Migrate existing assignments conservatively.
Required fix. The source explicitly says imported nights are “labelled by the morning you woke,” while tonightArm() uses today() at the bedtime start.
Regression test. Mock Aug 20 22:00 assignment + Aug 21 07:00 manual/imported log. They must join to the same arm. Add tests across midnight, month/year boundary, and DST.
HUSH-005 - A trial night can change sound after assignment and still count as the assigned arm
Severity: HIGH
Status: CONFIRMED SCIENTIFIC-INTEGRITY DEFECT
Source location: index.html 1483-1486, 1791-1810, 1848-1889, 2613-2630, 2763-2778
Finding. start() applies the randomized arm, but the user can subsequently change presets, noise, tuning, pulse, character, voice, program, adaptive masking and other sound-defining controls. The assignment record is not invalidated and the morning value still counts under the original arm.
Why it matters. This contaminates the trial. A night credited to A may actually have spent most of the night on B or on a custom configuration.
Reproduction / proof. During an active trial session, either lock all treatment-defining controls or maintain an immutable assigned-config snapshot and mark the night deviated if any treatment key changes. Exclude deviated nights from primary analysis and tell the user why. Volume/timer policy should be explicitly decided and consistent across arms.
Required fix. 
Regression test. Start trial arm A -> change any treatment-defining key -> save morning log. That record must be marked deviated and excluded (or the UI must have prevented the change).
HUSH-006 - “Keep it blind” does not keep the treatment label/configuration hidden
Severity: HIGH
Status: CONFIRMED DESIGN DEFECT
Source location: index.html 521-538, 1807-1889, 2854-2865
Finding. Blinding only changes the trial-panel labels (“one sound” / “the other”). Full controls still reveal spectrum, pulse, character, tuning and other configuration values. The simple front door also remains a normal recommendation interface rather than a dedicated trial-session interface.
Why it matters. True perceptual blinding between obviously different sounds is impossible, but the app promises to hide which sound is playing. The UI should at least avoid revealing the preset/config label and should avoid encouraging off-protocol changes.
Reproduction / proof. When a blinded trial has an active assignment, show a trial-specific front door: “Tonight’s trial sound” with no identity. Hide/lock treatment-defining controls or replace them with a “Trial in progress; changing sound invalidates tonight” gate. Change copy to “label-blind” if that more accurately describes the design.
Required fix. 
Regression test. With blinded trial running, there must be no accessible text/state that directly reveals A/B preset identity unless the user explicitly chooses to break blinding.
HUSH-007 - The same preset can be selected as both trial arms
Severity: HIGH
Status: CONFIRMED CODE DEFECT
Source location: index.html 2802-2818, 2781-2792
Finding. startTrialNow() copies trialArmSel[0] and trialArmSel[1] without checking that they are different.
Why it matters. The app can run a weeks-long “real experiment” comparing a sound against itself and still calculate a verdict.
Reproduction / proof. Disable Start Trial until A and B are different. Show a concise inline message rather than silently changing one selection.
Required fix. 
Regression test. Set A=B and attempt start. No TRIAL object may be created.
HUSH-008 - Trial keeps assigning nights after the declared sample size
Severity: HIGH
Status: CONFIRMED CODE DEFECT
Source location: index.html 2752-2771, 2878-2906
Finding. buildOrder() creates exactly 2*nPer planned assignments, but tonightArm() indexes order using assigned.length % order.length. Once the plan is complete, it cycles back to the beginning and continues assigning extra nights. renderVerdict() then analyzes all matching nights.
Why it matters. The planned sample size is part of the experiment. Continuing to collect and repeatedly re-evaluate after the declared endpoint changes the statistical procedure and makes the displayed final result unstable.
Reproduction / proof. Freeze the primary trial once planned assignments are complete. If the user wants more nights, require an explicit “Extend trial” decision before seeing/recalculating the final inference, or begin a new trial. Store a frozen primary dataset/result at completion.
Required fix. 
Regression test. With nPer=10, after 20 valid assignments tonightArm() must not generate assignment 21 without explicit extension.
HUSH-009 - Primary permutation test does not match the block-randomized repeated-measures design
Severity: HIGH
Status: CONFIRMED ANALYSIS/DESIGN MISMATCH
Source location: index.html 2706-2718, 2752-2761, 2773-2778, 2878-2898
Finding. Assignment is randomized within A/B blocks, but permTest() pools all values and shuffles labels without preserving blocks. armData() also discards date/block pairing. Welch/Hedges calculations treat arm observations like independent groups even though all observations come from one person across time.
Why it matters. A randomization test should reflect the assignment mechanism. Unrestricted shuffling can produce a different null distribution from the design actually used, especially with temporal trends/autocorrelation. This matters because the app presents the result as a real randomized experiment.
Reproduction / proof. Preserve block IDs/date pairs. For complete A/B blocks, use paired within-block differences and exact/sign-flip randomization (or Monte Carlo sign flips when blocks are numerous). Report paired effect/CI. If incomplete blocks are retained, predefine how they are handled. Have a statistician review the final method before making inferential claims.
Required fix. 
Regression test. Add deterministic fixtures where block-aware and unrestricted analyses differ. The implementation should reproduce a trusted external reference implementation.
HUSH-010 - Trial and night-history storage bypass the robust sanitizer used for main state
Severity: HIGH
Status: CONFIRMED CODE DEFECT
Source location: index.html 778-827, 2744-2750, 2794-2798
Finding. Main S state is sanitized carefully, but TRIAL = Store.get("trial") and NIGHTS = Store.get("nights") are trusted directly. trialArchive is also assumed to be an array when concatenated.
Why it matters. Malformed or old local data can produce crashes in .find(), .filter(), property access or archive concatenation. The app already acknowledges shared-origin/two-tab storage hazards, so these stores need the same defensive standard as S.
Reproduction / proof. Add schemaVersion plus sanitiseTrial(), sanitiseNight(), sanitiseNights(), and sanitiseTrialArchive(). Validate IDs, enum values, arrays, dates, ranges and assignment references before state replacement. Keep a raw recovery copy before migration.
Required fix. 
Regression test. Feed null/string/object/array/missing-fields/unknown-version fixtures into every auxiliary store. App must open, preserve recoverable data, and never crash.
HUSH-011 - Sleep metrics accept impossible values and malformed imports
Severity: HIGH
Status: CONFIRMED DATA-INTEGRITY DEFECT
Source location: index.html 552-568, 2946-2959, 3029-3036, 3100-3125
Finding. Most number inputs have no min/max, numOrNull() accepts any Number(), and imported records are not passed through a common validator. Invalid Fitbit dates can become a truthy “NaN-NaN-NaN” string. Negative/implausible minutes or scores can enter NIGHTS and statistics.
Why it matters. Bad tracker files or accidental typing can materially change the trial conclusion and graphs.
Reproduction / proof. Centralize sanitiseNight() and run manual entries, CSV, JSON, Apple Health and loaded storage through it. Strictly validate YYYY-MM-DD; finite values; feel 0-10; score 0-100; nonnegative sleep durations with sane ceilings; and stage relationships. Prefer visible validation/warnings over silent coercion for contradictory totals.
Required fix. 
Regression test. Test negative values, 999 sleep score, NaN, Infinity, invalid dates, 2000-minute sleep, deep>total, malformed Fitbit objects, strings, and locale decimals.
HUSH-012 - “Reset everything” does not reset everything
Severity: HIGH
Status: CONFIRMED PRIVACY/UX DEFECT
Source location: index.html 676, 1934, 2745-2748, 2797, 3173-3174
Finding. Reset everything deletes only hush.state and reloads. hush.trial, hush.nights and hush.trialArchive remain.
Why it matters. The label promises deletion of everything, including highly personal sleep/tracker/trial history. A user can reasonably believe those records were erased when they were not.
Reproduction / proof. Add confirmation and either (a) truly delete all Hush-owned persistent keys by an explicit namespace list, or (b) split into “Reset sound settings” and “Erase all Hush data.” Include future schema/versioned keys in one central registry.
Required fix. 
Regression test. Populate state/trial/nights/archive -> Erase all -> reload -> every Hush key is absent and UI is fresh.
HUSH-013 - Adaptive masking stays shown as ON when microphone permission fails
Severity: HIGH
Status: CONFIRMED RUNTIME DEFECT
Source location: index.html 1605-1626, 1918-1919
Finding. The adaptive switch toggles S.adapt=true before enableMic(). When getUserMedia fails, enableMic() sets S.micOn=false but never clears S.adapt. syncSwitches() therefore repaints Adaptive as ON even though micInit=false and no analyser exists.
Why it matters. The user is told adaptive masking is active when it cannot possibly function.
Reproduction / proof. If adaptive requires microphone, permission failure must atomically roll back S.adapt=false, persist it, repaint the switch, and explain that adaptive masking is off. Consider a single enableAdaptive() transaction rather than a generic toggle followed by async setup.
Required fix. Headless runtime reproduced S.adapt=true, S.micOn=false, micInit=false and aria-pressed=true after permission failure.
Regression test. Mock getUserMedia rejection. Final state must be adapt=false/mic=false and switch=false.
HUSH-014 - Program fades still rely on throttled JavaScript ticks
Severity: HIGH
Status: CONFIRMED ARCHITECTURE GAP
Source location: index.html 1381-1461, 1488-1489
Finding. The normal sleep timer was correctly moved to AudioContext scheduling, but program gain is still recomputed by progTick() on a 200 ms interval. If the page/device is frozen through the final program phase, the intended multi-minute fade is not scheduled in the audio thread.
Why it matters. Programs explicitly promise gradual phase/fade behavior. Under aggressive background throttling, the last audible behavior can differ from the program definition, and waking after total duration can collapse to a short stop ramp.
Reproduction / proof. Schedule program gain phase boundaries/ramps on AudioContext time when a program starts, and reconcile against wall clock on resume/visibility. Keep slow-wave/tone visual updates on JS if needed, but do not make audible program level depend on page timer cadence.
Required fix. 
Regression test. Advance wall clock across an entire final phase while suppressing progTick callbacks. The scheduled gain must still reach zero at the planned audio deadline.
HUSH-015 - Look-ahead events are not canceled across rapid heartbeat/slow-wave mode changes
Severity: HIGH
Status: CONFIRMED AUDIO-SCHEDULING RISK
Source location: index.html 1149-1182, 1355-1375, 1809, 1916
Finding. Heartbeat and slow-wave engines schedule up to 1.6 seconds ahead into shared buses. Switching off mutes the bus but does not cancel already-scheduled BufferSources or future pulseGain automation. Switching back on quickly can reopen the same bus while old and newly scheduled events overlap.
Why it matters. Rapid Heart -> Off -> Heart, Stop -> Start, or slow-wave toggles can produce double/irregular thumps or bursts exactly when the user is interacting with the sound.
Reproduction / proof. Track scheduled one-shot sources by generation and stop/disconnect pending sources on mode/transport reset, or allocate a new disposable bus/generation token each activation. Cancel future pulseGain automation when leaving heartbeat mode.
Required fix. 
Regression test. Toggle Heart off/on inside the 1.6 s look-ahead window and assert no pair of scheduled beats violates the minimum expected spacing.
HUSH-016 - Visualizer event queues can grow dramatically while the screen is hidden
Severity: HIGH
Status: CONFIRMED OVERNIGHT MEMORY RISK
Source location: index.html 1176-1182, 1366-1379, 2012-2023, 2454
Finding. flashQueue/burstQueue are produced by audio schedulers but consumed only by requestAnimationFrame drawing. RAF stops when a page is hidden/screen is off. Heartbeat alone can enqueue roughly two objects per beat for hours before a single filter cleanup on wake.
Why it matters. At about 72 bpm, eight hours is on the order of 69,000 beats and ~138,000 heartbeat visual events, before other burst sources. This is unnecessary memory and wake-up work for data that is purely visual and already stale.
Reproduction / proof. Do not enqueue visual events when document.hidden or when no relevant visualizer is active. Also enforce a hard queue cap and drop stale items at producer time, not only consumer time.
Required fix. 
Regression test. Simulate 8 hours of hidden scheduling. Queue size must remain bounded (for example <=256) and wake cleanup must be constant-time-ish.
HUSH-017 - One-shot audio nodes do not have deterministic ended cleanup
Severity: MEDIUM
Status: CONFIRMED CLEANUP GAP; LEAK SEVERITY DEVICE-TEST REQUIRED
Source location: index.html 1176-1182, 1265-1280, 1366-1371, 2318-2358
Finding. Many one-shot BufferSources/Oscillators create Gain/Panner/filter chains and rely on natural end + garbage collection; they do not consistently disconnect nodes in onended.
Why it matters. Browsers usually collect ended graphs, but an all-night audio app should make lifecycle deterministic. This also makes memory-soak failures easier to reason about.
Reproduction / proof. Create a tiny disposeOnEnded(source, ...nodes) helper and use it for transient graphs. Do not disconnect shared buses. Measure before/after with an 8-hour soak rather than assuming the current implementation is leaking badly.
Required fix. 
Regression test. Stress max event density for 30-60 minutes in browser profiling; detached/live node counts and JS heap must plateau.
HUSH-018 - start() can declare playback active while an interrupted context is still silent
Severity: HIGH
Status: CONFIRMED CODE DEFECT
Source location: index.html 1469-1493, 1692-1706
Finding. resumeAudio() correctly handles any non-running state while already playing, but start() only explicitly resumes when ctx.state === "suspended". A stopped app whose existing WebKit context is "interrupted" can set playing=true and update UI without successfully returning the context to running.
Why it matters. The interface can say Stop / playing while output is silent, recreating the exact truthfulness problem the interrupted-state patch was intended to solve.
Reproduction / proof. In start(), if ctx.state !== "running", attempt/await resume regardless of suspended/interrupted. Only transition UI to playing after resume succeeds or after a platform-specific known-running state. Reuse one ensureAudioRunning() helper in start(), mic and calibration.
Required fix. 
Regression test. Mock ctx.state="interrupted" and resume resolution/rejection. UI playing state must track actual recoverable engine state.
HUSH-019 - Wake-lock acquisition is not idempotent and can race
Severity: HIGH
Status: CONFIRMED RESOURCE-MANAGEMENT RISK
Source location: index.html 1677-1680, 1698-1702, 1491, 2069-2083
Finding. requestWake() always issues a new navigator.wakeLock.request() and overwrites one global sentinel. start() can request it, openViz() requests again unconditionally, and visibility restoration may request again. Concurrent requests can leave an older sentinel untracked.
Why it matters. An orphaned screen wake lock is a battery/heat problem in a sleep app, and race behavior varies by browser.
Reproduction / proof. Make a WakeLockManager with wakePending, current sentinel, release event handling, and idempotent acquire/release. Decide explicitly whether full-screen visualization is a separate reason that temporarily forces wake, and reflect that in UI.
Required fix. 
Regression test. Mock delayed wakeLock.request(). Call acquire twice before the first resolves, then release. Exactly one live sentinel should remain and then zero.
HUSH-020 - localStorage write failure can return stale data and failure is invisible
Severity: HIGH
Status: CONFIRMED PERSISTENCE DEFECT
Source location: index.html 718-728
Finding. Store.set() falls back to mem[k] when a write throws, but Store.get() continues preferring localStorage whenever reads still succeed. If writes fail while stale persisted data remains readable, the newest in-memory value can be ignored. Store.set() also returns no success/failure signal.
Why it matters. The app may appear to save a setting, trial, or night and later read an older value. Users receive no “not saved” warning.
Reproduction / proof. Track per-key in-memory overrides after failed writes and prefer them until persistence succeeds; have set/del return status. Surface a nonintrusive local-save warning and offer export/backup if persistence is degraded.
Required fix. 
Regression test. Mock localStorage.getItem working and setItem throwing. set(k,new) then get(k) must return new, not stale old. UI should receive degraded-persistence state.
HUSH-021 - Calibration noise bypasses the master safety/limiter path
Severity: MEDIUM
Status: CONFIRMED SAFETY-ARCHITECTURE GAP
Source location: index.html 3435-3496, audio graph 970-973
Finding. Calibration creates its own source -> bandpass -> gain -> ctx.destination connection. It does not pass through nodes.master, the nursery cap, or nodes.limiter.
Why it matters. The calibration gain is intentionally low, so this is not proof of a dangerously loud signal. It is still an exception to the app’s centralized safety path and should be bounded deliberately rather than by an unverified magic gain on every device.
Reproduction / proof. Route calibration through a dedicated capped/limited calibration bus, or at minimum through the limiter with a documented conservative maximum. Tell the user to start device volume low and measure actual SPL on representative phones/speakers.
Required fix. 
Regression test. Automated graph test: no audible app-generated path reaches destination without an approved safety/limiter bus. Physical SPL test remains required.
HUSH-022 - Service worker can activate with a partially cached shell
Severity: MEDIUM
Status: CONFIRMED OFFLINE-RELIABILITY DEFECT
Source location: sw.js 20-45
Finding. Install fetches every shell asset individually and catches each failure to null, then Promise.all resolves and skipWaiting() runs even if index.html or ./ was never cached.
Why it matters. The worker can report/install as the new version without a usable offline shell. Hush explicitly markets offline use.
Reproduction / proof. Classify essential assets and fail installation if the HTML shell cannot be cached. Optional icon failures may remain nonfatal. Consider an offlineReady check/state after activation.
Required fix. 
Regression test. Simulate index.html fetch failure during install. The new worker must not activate as an offline-ready version.
HUSH-023 - The silent/Stopped app keeps the full Web Audio graph running
Severity: MEDIUM
Status: CONFIRMED ARCHITECTURE; BATTERY IMPACT DEVICE TEST REQUIRED
Source location: index.html 896-978, 1494-1506
Finding. After the first play, continuous sources/LFOs remain running. Stop lowers master gain and clears event timers/RAF but does not suspend or close the AudioContext.
Why it matters. Browsers may optimize silent graphs, but they are not required to eliminate all processing. If Hush is left open after a timer ends, this can waste battery relative to a suspended context.
Reproduction / proof. Measure CPU/battery first. If material, suspend the AudioContext after the stop fade when microphone meter/calibration is not in use; resume on the next explicit user play gesture. Avoid a rewrite if profiling shows negligible cost.
Required fix. 
Regression test. Compare 2-hour battery/CPU after Stop with context running vs suspended on representative Android/iPhone hardware.
HUSH-024 - Pinch zoom is disabled
Severity: HIGH
Status: CONFIRMED ACCESSIBILITY DEFECT
Source location: index.html line 5
Finding. The viewport meta includes user-scalable=no.
Why it matters. Users with low vision need browser zoom. Disabling zoom is an accessibility regression and is unnecessary here; the layout already fit 320 px without document-level horizontal overflow in the headless visual pass.
Reproduction / proof. Remove user-scalable=no. Keep width=device-width, initial-scale=1 and viewport-fit=cover.
Required fix. 
Regression test. Pinch/browser zoom to 200-400% on supported devices and confirm primary controls remain reachable.
HUSH-025 - Muted/faint text fails normal-text contrast
Severity: HIGH
Status: CONFIRMED ACCESSIBILITY DEFECT
Source location: index.html CSS line 20 and many --faint uses
Finding. --faint is rgba(237,228,212,.34) over #0E1220. That composites to roughly RGB(90,89,93), about 2.68:1 contrast. It is used for 9-12 px labels, hints, citations and footer text.
Why it matters. Normal text generally needs 4.5:1 contrast under WCAG AA. Important safety/explanatory copy becomes particularly hard to read in the deliberately dim bedtime UI.
Reproduction / proof. Raise the faint text alpha to at least about .52 on #0E1220, then verify against every actual panel/gradient background. Keep decorative borders dim if desired; text and interactive labels need stronger contrast.
Required fix. Calculated values: alpha .34 ≈2.68:1; .50 ≈4.44:1; .52 ≈4.69:1 on the base background.
Regression test. Automated contrast scan plus visual dark-room check at minimum brightness and enlarged text.
HUSH-026 - Canonical URL conflicts with the supplied live deployment
Severity: HIGH
Status: CONFIRMED SEO/DEPLOYMENT DEFECT
Source location: index.html line 6; DEPTH-PLAN Round 3
Finding. The page declares https://skywolfstudio.com/hush/ as canonical while the supplied/live URL for this audit is https://lucidwinds.com/hush/. The plan says a future migration may move the app, but the current markup already claims the future domain.
Why it matters. Search engines can consolidate the Lucid Winds page into a URL that may not yet be the authoritative deployed copy. This likely contributes to discoverability confusion.
Reproduction / proof. Choose the authoritative production URL for this release. If still on Lucid Winds, canonical must match Lucid Winds. If migrating now, finish the destination, 301 redirect, manifest/start/scope decisions, sitemap/internal links and social metadata together.
Required fix. 
Regression test. Fetch both URLs in deployment CI. Exactly one should be 200 canonical; the other should intentionally redirect or mirror with correct canonical.
HUSH-027 - Semantic/public naming is too weak for a crowded product name
Severity: MEDIUM
Status: CONFIRMED MARKUP/BRANDING GAP
Source location: index.html 15, 226-228, 253; manifest.webmanifest 2-5
Finding. There is no H1. The visual logo is a div, the only heading is the dynamic h2 recommendation, and title/manifest use “HUSH, noise for small humans” without Lucid Winds/Sky Wolf identity.
Why it matters. The name Hush is crowded in the sleep-sound category. Search/accessibility semantics should make the category and publisher explicit.
Reproduction / proof. Add a semantic H1 (visible or visually hidden) such as “Hush by Lucid Winds - Free Sound Machine & Sleep Sounds.” Align document title, manifest name, Open Graph and install naming. Keep the short visual logo HUSH.
Required fix. 
Regression test. HTML audit must find one stable H1 and consistent canonical product naming.
HUSH-028 - “Export everything” overstates what CSV/JSON contain
Severity: MEDIUM
Status: CONFIRMED UX/DATA-PORTABILITY DEFECT
Source location: index.html 608-611, 3158-3175
Finding. CSV exports NIGHTS plus current trial arm label. JSON exports {trial, nights}. Neither is a full app backup: main sound/settings state and trialArchive are omitted, and CSV does not contain the complete current trial definition/results.
Why it matters. The UI promises “everything” and “Your nights, your trial, your results.” A user relying on it before reset/device change can lose settings/history not present in the file.
Reproduction / proof. Either rename accurately (“Export sleep log CSV”; “Export current trial + sleep data JSON”) or implement a versioned complete Hush backup containing S, current trial, nights, archive and schema metadata. Prefer both: human-readable exports plus full backup.
Required fix. 
Regression test. Round-trip complete backup into an empty profile and compare all supported persistent records.
HUSH-029 - Habit copy calls selections “nights” even when they are not nights
Severity: MEDIUM
Status: CONFIRMED COPY/DATA-SEMANTICS DEFECT
Source location: index.html 3327-3334, 3368-3374
Finding. rememberUsed() increments count when the same sound is selected on a new calendar day. It runs immediately when playAnything() is chosen, regardless of time of day or session duration. pickTonight() then says “You’ve used this X nights.”
Why it matters. A two-second afternoon test can become a “night,” undermining the habit recommendation copy and potentially choosing the wrong next recommendation.
Reproduction / proof. Either rename the count to days/sessions, or bank a “night” only after a meaningful sleep session/morning log using the same canonical sleepDate introduced for trials.
Required fix. 
Regression test. Play a sound briefly at 2 PM on two days. The app must not claim two nights unless that is explicitly the intended definition.
HUSH-030 - Music evidence citation attributes 10 trials / 557 people to the wrong review
Severity: HIGH
Status: CONFIRMED CONTENT ERROR
Source location: index.html 297-301
Finding. The app cites “Jespersen et al., Cochrane 2015 (10 trials, 557 people).” The 2015 Cochrane review included 6 studies and 314 participants. The 10 randomized studies / 557 participants figure belongs to a different 2014 meta-analysis by Wang et al.
Why it matters. Hush makes “honest about the science” part of the product identity. A visibly wrong citation damages the strongest differentiator.
Reproduction / proof. Correct the attribution. Prefer updating to the 2022 Cochrane review: 13 studies / 1007 participants overall; 10 studies / 708 participants in the PSQI sleep-quality meta-analysis, with moderate-certainty evidence for improved subjective sleep quality. Do not imply equivalent objective sleep improvement.
Required fix. 
Regression test. Content test should pin author/year plus correct study and participant counts.
HUSH-031 - Nursery 50 dBA and AAP distance copy is too absolute / partly outdated
Severity: HIGH
Status: CONFIRMED SAFETY-COMMUNICATION ISSUE
Source location: index.html 423-428, 649-650, 1651-1662
Finding. The meter labels 50 dBA as “nursery limit” and tells <=50 “This is where you want it.” The 2014 study described 50 dBA as a recommended limit for infants in hospital nurseries, not a universal home sleep-machine safety threshold. The app also attributes “roughly 2 m / 7 ft” to AAP guidance. The AAP 2023 policy instead advises placing infant sleep machines as far away as possible, setting volume as low as possible, and limiting duration.
Why it matters. The phone meter is itself explicitly approximate. Converting one hospital-nursery reference into a green safety verdict can sound like a home-use guarantee, especially for parents.
Reproduction / proof. Relabel 50 dBA as a hospital-nursery reference used in the 2014 study, not a universal safety cutoff. Replace “This is where you want it” and “Fine for a short settle” with cautious, non-certifying language. Update AAP copy to far away / low volume / limited duration. Keep the existing disclaimer that phone microphones are estimates.
Required fix. 
Regression test. Safety copy review against current AAP policy before release; no green meter state should imply certified safe exposure.
HUSH-032 - Power/false-alarm simulation claims are not reproducible from the shipped package
Severity: MEDIUM
Status: CONFIRMED EVIDENCE-REPRODUCIBILITY GAP
Source location: index.html 2834-2852, 2900-2902; HANDOFF-15.md
Finding. The UI says power values come from 1,500 simulated trials per cell and gives false-alarm behavior for repeated checking, but the package contains only the resulting POWER constants and prose. The simulation code/assumptions are not included.
Why it matters. For a product that explicitly markets methodological honesty, numerical claims should be reproducible by the coding/science team, especially while the analysis method is being revised.
Reproduction / proof. Add a small deterministic scripts/hush_trial_sim.mjs that generates the POWER table and sequential-peeking estimate from documented variance/effect assumptions. CI should fail if constants drift without updating the simulation output.
Required fix. 
Regression test. One command must reproduce displayed power values within a documented Monte Carlo tolerance.
5. Audio Risks That Need Physical Listening / Device Measurement
Do not “fix” these from theory alone
These are legitimate code-review targets, but the correct decision depends on audible behavior or hardware measurements. Have the coding agent instrument them, then test on real iPhone/Android devices and representative speakers/headphones before changing the voicing.

ID
Risk
Required device/listening test
R-01
Heartbeat bus up to 2.0 into the limiter
Listen at maximum heartbeat + loud bed for limiter pumping or distortion. Record peak/RMS at several volumes.
R-02
Multiple writers on pulseGain.gain
Trace waves/breathe/heart transitions. Audio-rate pulseDepth, apply() target writes, and duckBed() scheduling can interact. Rapid transitions should not stick quiet/loud.
R-03
Warmth-drift LFO plus apply() writes to low-shelf gain
Verify browser-consistent AudioParam summing and that retuning tilt does not create a step or unexpected baseline offset.
R-04
Rapid sound switching stacks short crossfades
Stress 20-50 preset taps. Confirm no click, temporary gain build-up, CPU spike or cleanup lag.
R-05
Heartbeat resume edge
After hidden/suspended resume, listen for a double-thud or malformed lub-dub pair caused by cursor resynchronization.
R-06
iOS screen-off stage 2
Still genuinely unbuilt. Measure only on a physical iPhone/iPad. Do not claim screen-off survival until it passes.
R-07
Eight-hour memory/battery soak
Measure Hush playing a simple noise, womb/heartbeat, slow-wave program, full visualizer and then stopped/silent.
R-08
Bluetooth/route interruptions
Test phone call, alarm, Siri/Assistant, Bluetooth drop/reconnect, wired-headphone change where available.
R-09
Loop and stereo quality
Headphones at bedtime volume: listen through many 10-second seams, Width 0 vs 70, and every noise spectrum. Code has crossfade protection, but ears decide.
R-10
Calibration SPL
Measure calibration signal and the room-meter estimate against a real SPL meter on multiple phone models and system-volume positions.
6. Reconciliation With the Earlier Pre-Source Audit
If the coding agent has the earlier Hush QA document, use this table to avoid implementing obsolete recommendations.
Earlier recommendation
What source review found
Action now
Rebuild sleep timer around absolute deadlines / AudioContext fades
Already implemented well for the normal sleep timer.
Do not rewrite. Fix phantom timer state and bring program fades up to the same architecture.
Add procedural/non-repeating audio
Hush already generates audio procedurally and has generated character/voice layers; base noise uses crossfaded 10-second buffers.
Do not add AudioWorklet unless real listening proves a loop problem; DEPTH-PLAN already deprioritized it.
Add Media Session
Already implemented with play/pause and metadata.
Keep; test on real platforms.
Add PWA/offline support
Already implemented with service worker/manifest.
Fix partial-precache install behavior; test cold offline start.
Centralize audio engine
There is already one central Web Audio graph/state structure, though the single-file code is large.
Do not framework-rewrite. Improve lifecycle helpers and invariants incrementally.
Mixer with individual layers
Hush has a sophisticated compositional engine (bed + character + pulse + tone + voice), not arbitrary preset stacking.
Do not add arbitrary mixing unless user research says it beats the current simple-mode product direction.
Favorites / saved mixes
Not implemented beyond lastUsed and built-in presets.
Still a valid product enhancement after correctness fixes.
Low-light dark UI
Already strong visually.
Keep the aesthetic; raise text contrast and preserve reduced-motion/low-light behavior.
Improve brand/SEO
Still valid; canonical currently conflicts with deployment and H1 is missing.
Fix in this release.
7. New Regression Tests to Add
ID
Pri
Test
Pass condition
QA-C001
P0
Cap remains final ceiling under adaptive gain
Sweep vol 0..100, cap=true, prog 0..1, adapt 1..3.5. targetGain never exceeds 0.34.
QA-C002
P0
Simple start consistency
Fresh state: core/recommendation/timer-start/full-screen start resolve to same selected recommendation.
QA-C003
P0
Stop clears or intentionally re-arms timer
After Stop there is no UI state where S.timer>0 and timerEnd=0 unless explicitly labeled as a saved default.
QA-C004
P0
Cross-midnight trial join
22:00 assignment and 07:00 next-day log share one canonical sleepDate.
QA-C005
P0
Trial deviation handling
Change a treatment key after randomized start; night is excluded/flagged or change is blocked.
QA-C006
P0
Same-arm prevention
A==B cannot create a trial.
QA-C007
P0
Planned N freeze
No automatic assignment beyond 2*nPer.
QA-C008
P0
Block-aware inference fixtures
Statistical results match an external trusted implementation on paired/block-randomized fixtures.
QA-C009
P1
Auxiliary-store corruption matrix
trial/nights/archive tolerate null/string/object/wrong IDs/unknown versions without crash.
QA-C010
P1
Night validator
Reject invalid date, negative metrics, score>100, nonfinite values; warn on deep/rem totals inconsistent with total sleep.
QA-C011
P1
Erase-all contract
All Hush persistent keys are gone after erase-all.
QA-C012
P1
Adaptive permission rollback
getUserMedia reject => adapt=false, mic=false, UI switch off.
QA-C013
P1
Program fade survives page-timer starvation
Suppress progTick through final phase; audio gain still reaches zero on schedule.
QA-C014
P1
Look-ahead generation cancellation
Rapid heartbeat/SW off/on produces no duplicate scheduled event generation.
QA-C015
P1
Visual queue bound
Hours hidden cannot grow queues beyond fixed cap.
QA-C016
P1
Interrupted start
ctx interrupted + start => either running audio or explicit recoverable error, never false playing.
QA-C017
P1
Wake lock race
Concurrent acquire requests produce one owned sentinel; release leaves zero.
QA-C018
P1
Storage write failure
Readable stale localStorage + failing writes still returns newest in-memory state and raises degraded-save state.
QA-C019
P1
SW essential precache failure
Missing HTML prevents offline-ready worker activation.
QA-C020
P1
Accessibility zoom/contrast
No zoom prohibition; all normal text >=4.5:1; 200-400% remains usable.
QA-C021
P1
Science citation constants
Displayed study counts/reference years match pinned evidence metadata.
QA-C022
P2
Full-backup round trip
Export/import preserves state, trial, nights, archive and schema version exactly.
QA-C023
P2
Habit semantics
Brief daytime test does not increment “nights” if UI still uses that word.
QA-C024
P2
Simulation reproducibility
Script reproduces POWER values and sequential-peeking estimate within tolerance.
8. Product Improvements After the Bugs Are Fixed
Pri
Enhancement
Recommendation
P1
Full backup / restore
A no-account app needs a trustworthy device-migration path. Export the complete versioned local state, not just sleep data.
P2
Save my sound / named mixes
Full mode has extensive tuning. Let a user save the exact current configuration as a local custom preset, duplicate, rename and delete it.
P2
Favorites / pins
Let users pin a few built-in/custom sounds to the simple “Something else” list. Avoid turning the simple front door into a catalog.
P2
Trial-specific front door
When a trial is running, simple mode should become a trial session screen rather than showing an unrelated recommendation.
P2
Custom timer
Keep 20/45/90 quick chips but add a compact custom duration in full mode. Do not complicate the bedtime front door.
P2
Support/diagnostic panel
Optional tiny diagnostics: app version, SW shell version, audio context state, offline-ready, storage degraded, iOS screen-off limitation. Useful for support without analytics.
P3
Native/TWA packaging
Android TWA can strengthen screen-off behavior; iOS requires physical experimentation/native wrapper decisions. Do not promise cross-platform parity before testing.
P3
User audio import
Only if demand exists; it complicates persistence/background behavior and undermines the elegant procedural/zero-server model.
9. Recommended Implementation Sequence
Phase 0 - Safety and truthful transport
[ ] HUSH-001 cap/adaptive ceiling + new safety property tests.
[ ] HUSH-002 unify simple-mode start paths.
[ ] HUSH-003 fix timer state after stop.
[ ] HUSH-013 permission-failure rollback.
[ ] HUSH-030 and HUSH-031 science/safety copy corrections.
Phase 1 - Make the trial scientifically coherent
[ ] HUSH-004 canonical sleepDate.
[ ] HUSH-005 treatment-deviation policy.
[ ] HUSH-006 trial-specific blind UI.
[ ] HUSH-007 prevent identical arms.
[ ] HUSH-008 freeze planned sample.
[ ] HUSH-009 replace analysis with block-aware repeated-measures method.
[ ] HUSH-010/HUSH-011 validate trial/night data.
[ ] HUSH-032 ship reproducible simulations.
Phase 2 - Overnight audio/resource reliability
[ ] HUSH-014 schedule program gain on audio clock.
[ ] HUSH-015 cancel old scheduled generations.
[ ] HUSH-016 bound visual queues.
[ ] HUSH-017 deterministic transient cleanup.
[ ] HUSH-018 unified ensureAudioRunning().
[ ] HUSH-019 idempotent wake lock manager.
[ ] HUSH-020 persistence-degraded behavior.
[ ] HUSH-021 calibration safety path.
[ ] HUSH-022 essential offline precache.
[ ] Measure HUSH-023 before changing context-stop behavior.
Phase 3 - Accessibility, deployment, data portability
[ ] HUSH-024 remove zoom prohibition.
[ ] HUSH-025 raise text contrast.
[ ] HUSH-026 settle canonical/domain migration.
[ ] HUSH-027 semantic H1/branding.
[ ] HUSH-028 honest exports + full backup.
[ ] HUSH-029 habit counter semantics.
Phase 4 - Physical-device acceptance
[ ] 8-hour overnight battery/memory tests.
[ ] iPhone Safari/PWA lock and interruption behavior.
[ ] Android Chrome/TWA lock/background behavior.
[ ] Bluetooth and call/alarm route changes.
[ ] Headphone loop/transition listening.
[ ] SPL/calibration comparison against real meter.
Phase 5 - Enhancements
[ ] Named custom sounds/mixes.
[ ] Favorites/pins.
[ ] Custom timer and diagnostics.
[ ] Only then evaluate optional native packaging or personal audio import.
10. Release Acceptance Criteria
[ ] With cap ON, no adaptive/program state can make targetGain exceed the defined capped ceiling.
[ ] All simple-mode ways of starting audio resolve to one intentional selected sound.
[ ] Timer display can never show an active duration without an active deadline.
[ ] Normal overnight trial assignment and next-morning log/import join to the same sleepDate.
[ ] A deviated trial night cannot silently enter the primary analysis.
[ ] A trial cannot compare a sound against itself and cannot silently exceed the planned sample.
[ ] Trial inference matches the chosen block-aware external reference implementation.
[ ] Malformed state/trial/nights/archive data cannot crash boot.
[ ] Adaptive masking cannot remain visually ON without a working microphone analyser.
[ ] Program fades reach zero even if page timers are throttled/frozen.
[ ] Heartbeat/slow-wave rapid mode transitions cannot play stale scheduled events.
[ ] Visual queues remain bounded while hidden for hours.
[ ] Wake lock manager never owns/leaks more than one sentinel per required reason.
[ ] All persistent-write failures are recoverable and truthfully surfaced.
[ ] Offline-ready worker cannot activate without an essential HTML shell.
[ ] Pinch zoom works and normal text meets AA contrast.
[ ] Canonical/manifest/title point to the actual deployment strategy.
[ ] Science/safety copy matches the pinned sources below.
[ ] All existing 119 + 155 assertions remain green and all mutation self-tests still go red when broken.
[ ] New QA-C001 through QA-C024 are implemented at the appropriate unit/integration/device layer.
[ ] At least one 8-hour real-device soak passes for the core sound and one complex sound/program per major platform before claiming all-night reliability.
11. One-Page Coder Handoff Checklist
Done
Priority
Task
[ ]
P0
Fix adaptive gain so nursery cap is a final ceiling; correct the existing test invariant.
[ ]
P0
Unify all simple-mode start routes through one primary sound selection.
[ ]
P0
Fix phantom timer after manual Stop.
[ ]
P0
Introduce canonical sleepDate and migrate trial assignment matching.
[ ]
P0
Prevent/flag trial treatment changes; make trial UI genuinely label-blind.
[ ]
P0
Prevent identical trial arms and stop at planned N.
[ ]
P0
Replace unrestricted permutation/Welch primary analysis with block-aware repeated-measures analysis.
[ ]
P1
Sanitize/migrate trial, nights and archive; validate every imported/manual metric.
[ ]
P1
Make Reset everything truthful or split reset vs erase-all.
[ ]
P1
Rollback Adaptive if microphone permission fails.
[ ]
P1
Move program loudness fades onto AudioContext scheduling.
[ ]
P1
Cancel stale look-ahead sources/automation on mode/transport generations.
[ ]
P1
Bound hidden visual queues and clean transient audio nodes.
[ ]
P1
Use one ensureAudioRunning() for suspended/interrupted contexts.
[ ]
P1
Make wake-lock acquisition idempotent.
[ ]
P1
Fix storage degraded/fallback semantics and surface failure.
[ ]
P1
Route calibration through an explicit bounded safety path.
[ ]
P1
Require essential shell assets for SW install.
[ ]
P1
Remove user-scalable=no; raise faint text contrast.
[ ]
P1
Fix Cochrane and AAP/sound-level copy.
[ ]
P1
Resolve canonical deployment URL.
[ ]
P2
Add H1 and distinctive public/manifest branding.
[ ]
P2
Rename exports accurately and add complete backup/restore.
[ ]
P2
Fix “nights” habit semantics.
[ ]
P2
Add reproducible trial simulation script.
[ ]
P2
Run real device/listening matrix before audio voicing changes.
[ ]
P3
After reliability: saved custom mixes, favorites, custom timer, optional packaging.
12. External Evidence / Safety Sources Rechecked
Jespersen et al., Cochrane 2015 - Music for insomnia in adults
2015 review included 6 studies / 314 participants; 5 studies / 264 in PSQI meta-analysis.
https://pubmed.ncbi.nlm.nih.gov/26270746/
Jespersen et al., Cochrane 2022 update - Listening to music for insomnia in adults
13 studies / 1007 participants overall; 10 studies / 708 for subjective PSQI sleep quality; moderate-certainty improvement in subjective quality.
https://pubmed.ncbi.nlm.nih.gov/36000763/
Wang et al. 2014 meta-analysis
The 10 randomized studies / 557 participants figure currently misattributed to Cochrane comes from this separate meta-analysis.
https://pubmed.ncbi.nlm.nih.gov/23582682/
Hugh et al., Pediatrics 2014 - Infant sleep machines
14 machines; >50 dBA at 30 cm for all at maximum; 3 >85 dBA. The 50 dBA figure was a hospital-nursery reference.
https://pubmed.ncbi.nlm.nih.gov/24590753/
AAP 2023 Policy Statement - Preventing Excessive Noise Exposure
For infant sleep machines: place as far away as possible, volume as low as possible, and limit duration.
https://publications.aap.org/pediatrics/article/152/5/e2023063752/194468/Preventing-Excessive-Noise-Exposure-in-Infants
Riedy et al., Sleep Medicine Reviews 2021
Systematic review of 38 broadband-noise/sleep studies; evidence for continuous noise improving sleep rated very low quality.
https://pubmed.ncbi.nlm.nih.gov/33007706/
Basner et al., SLEEP 2026
Controlled laboratory pink-noise/earplug study; continuous pink noise reduced REM and did not provide net protection from environmental noise; authors urge caution, especially for newborns/toddlers.
https://academic.oup.com/sleep/article/49/5/zsag001/8452884
13. Source Package Reviewed
hush/index.html - entire application, CSS and inline JS
hush/sw.js - service worker
hush/manifest.webmanifest - PWA manifest
hush/tests/hush_tests.mjs - 119-assertion suite + 22 mutation self-tests
scripts/hush_audit.js - older 155-assertion audit suite
hush/AUDIT-NOTES.md - prior 2026-08-16 audit/fixes
hush/DEPTH-PLAN.md - stereo/heartbeat/iOS roadmap
incoming/hush/BUILD-PLAN.md and HANDOFF-15.md - original product/test intent
READ_ME_FIRST_FOR_CHATGPT.md - Claude repository handoff/architecture map
Repository philosophy respected: zero runtime dependencies is deliberate. Nothing in this audit requires React, npm packages, a cloud backend, analytics, or a wholesale rewrite. The strongest fixes are small invariants, lifecycle corrections, validation, and clearer state ownership.
