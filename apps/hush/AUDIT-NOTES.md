# HUSH, audit notes

Audited 2026-08-16 against the live drop at `hush/index.html` (3137 lines),
`hush/sw.js`, `hush/manifest.webmanifest`, with `incoming/hush/BUILD-PLAN.md`,
`HANDOFF-15.md`, `RESEARCH-1.md`, `RESEARCH-2-1.md` and
`incoming/PORTAL-CONTRACT.md` as the spec.

No browser was run for this pass (eight agents on a two core box, the main loop
owns browser work). Everything below is read from source or proved by the
headless suite in `tests/`. Anything that needs eyes or a real phone is called
out as unverified rather than claimed.

---

## First: the service worker is safe

The history here is that Hush arrived with an activate handler that deleted
every cache on the origin, and `caches.keys()` is origin wide, so it really did
wipe the fleet on lucidwinds.com.

Verified on the shipped `hush/sw.js` before touching anything else:

- the activate filter is `k.indexOf("hush-") === 0 && k !== SHELL_VERSION`, so
  only Hush's own caches are ever deleted
- there is no other `caches.delete` anywhere in the file
- no fetch path can settle with `undefined` (navigations fall through
  network to cache to a real 503 `offlineFallback()` Response)
- navigations are network first with `cache:"no-cache"`, which is what this
  host needs

That is correct and this pass keeps it correct. `tests/hush_tests.mjs` now
asserts all four properties so it cannot silently regress.

One caveat that matters for anyone testing this in a browser later: **an
activate handler fires once per version**, so a cache safety test that shares a
browser context with an earlier test will pass for the wrong reason. Use a
fresh `browser.createBrowserContext()` per assertion.

---

## What the audit found, worst first

### S1, a shared link is dead on arrival in the default mode  (FIXED)

`readSharedLink()` decodes the fragment into `S` correctly. But it runs at the
end of boot, after `setMode()` has already drawn the simple front door, and the
front door is still showing `pickTonight()`, which is last night's sound. The
one big Play button calls `playAnything(tonightPick.id)`, which calls
`applyPreset`, which does `Object.assign(S, SOUND_DEFAULTS, p.d, …)` and wipes
every value the link just delivered.

So the recipient of a shared link sees a card advertising a different sound,
taps the only button, and hears the wrong thing. The share feature is the whole
growth loop and it did not survive its own front door.

Also: `#shareBtn` is hidden in simple mode by design, so there is no way to
re-share, and no way to tell that anything arrived except one line of hint text.

**Fix:** a shared link now takes over the front door. `pickTonight()` returns
the shared sound with its own eyebrow and its evidence tier in the copy, so the
big button plays exactly what was sent, and the honesty label travels with the
link into the mode 100 percent of people are actually in.

### S2, a corrupt saved state defeats the nursery volume cap  (FIXED)

The load path is `Object.assign(S, saved, { timer:0, micOn:false, adapt:false,
program:null })`. There is no validation of anything else.

`setVolume()` is `Math.pow(S.vol/100, 2) * capMax * progGain * adaptGain`
clamped to 0..1. With `vol: 999` that is `99.8 * 0.34 = 33.9`, clamped to
**1.0, full output, with the cap switch still drawing itself as ON**. `cap: 0`
or `cap: "no"` is falsy and lifts the cap outright. `vol: NaN` silences the app
with no way back except Reset everything.

The share path has a careful whitelist and a belt and braces restore. The save
path, which runs on every single launch, had nothing. This origin hosts forty
plus apps and has a documented two tab localStorage clobber history, so a junk
value is not hypothetical.

**Fix:** `sanitiseSaved()` runs every loaded key through the same type, enum and
range rules the share path uses, drops unknown keys, and hard clamps `vol` to
0..100 and `cap` to a real boolean. A junk save now degrades to defaults instead
of to full volume.

### S3, shared frequencies are clamped in the wrong unit  (FIXED)

`clampToControl(key, v)` reads `min`/`max` off the DOM control with that id.
For every other numeric key that is right, because the slider position and the
state value are the same number. `freq` is the exception: `#freq` is
`min="0" max="1000"` in *slider position* units, mapped through
`s2f = 20 * 800^(s/1000)`, while `S.freq` is **Hz**.

So a shared link clamped every frequency to 1000 Hz. Three of the seventeen
presets are above that: Tinnitus notch (6000 Hz) arrived as 1000, Shush (1100)
as 1000, Golden field survived at 174 by luck. Sharing a tinnitus notch, which
is the single most personal setting in the app, sent the wrong notch.

**Fix:** `freq` is clamped in Hz against the real mapped range
(`s2f(0)` to `s2f(1000)`, i.e. 20 Hz to 16000 Hz) instead of against the
slider's position numbers. Asserted both directions.

### S4, the sleep timer's fade out was the first thing a browser throttles  (FIXED)

`startTimer` ran the fade on a 250 ms `setInterval`, recomputing `progGain` from
`Date.now()`. A hidden tab is throttled to roughly 1 Hz, and a sleeping device
can skip the window entirely, in which case the interval next fires with
`left <= 0` and the sound stops on `setVolume`'s 0.18 s time constant. That is a
cut, not a fade.

"Every program reaches zero" is the product thesis. The fade is the last thing
the room hears and it was the least robust thing in the file.

**Fix:** the fade is now scheduled on the AudioContext clock
(`cancelScheduledValues` + `setValueAtTime` + `linearRampToValueAtTime(0, end)`).
The audio thread does not care whether the page is hidden, throttled or frozen,
so the fade is now sample accurate and happens whether or not a timer ever fires
again. The interval is demoted to painting the countdown. Wall clock stays the
authority for when the timer is *over* (so a suspended context cannot leave a
sound running past its bedtime), and if it ever arrives before the ramp has
finished, the finish is a 1.2 s ramp rather than a snap.

### S5, WebKit's `interrupted` audio state was never resumed  (FIXED)

The only resume path was `visibilitychange` and it only handled
`ctx.state === "suspended"`. Safari can leave an AudioContext in
`"interrupted"` after a phone call, an alarm, or another app taking audio focus,
and if the page never went hidden the resume never ran. The UI then says Stop,
the ring is lit, and nothing is playing.

**Fix:** an `onstatechange` handler on the context plus a resume on the next
pointer or key event, both idempotent, both no-ops when not playing. Resume is
also attempted on `pageshow` for the bfcache return.

### S6, every preset silently rewrites the volume  (FIXED)

All seventeen presets carry a `vol` in their `d` block (16 to 26) and
`applyPreset` assigns it, including with `quiet:true` from `startProgram()` and
from the nightly trial arm. So switching sound in a dark room changes the
loudness: Sensory calm (16) to Box fan (26) is a 2.6x jump in linear gain, and
the parent did not ask for it.

The handoff is explicit that the volume ring is relative on purpose, so that a
stray tap cannot jump the output. A preset doing it instead is the same bug
wearing a nicer hat.

**Fix:** a preset's suggested level still applies when nothing is playing, which
is the case where it is useful. **While sound is already playing, the current
volume is kept.** The person is in the room with the sleeping child and has
already set the level; nothing gets to raise it behind their back.

### S7, changing sound spliced two uncorrelated noise buffers  (FIXED)

`loadNoise` stopped the old source and started a new one at the same instant.
The seam *inside* a buffer gets a careful 60 ms equal power crossfade; the seam
*between* buffers got nothing, and two independent noise streams meeting at
full amplitude is a step discontinuity, which is a tick.

**Fix:** each buffer source now runs through its own gain node, and swapping
sound is a 120 ms equal power crossfade with the old source stopped after it has
faded. Same trick as the loop seam, one level up.

### S8, "Safety and evidence" did not open safety  (FIXED)

`$("toSafety")` opened `p-eq`, the evidence panel. The nursery volume cap, which
is the single most important control in the app, lives in `p-safe`, further
down, closed. **Fix:** both panels open, and the scroll lands on the cap.

### S9, the audio look ahead was shorter than the timer feeding it  (FIXED)

`heartTick` scheduled 0.4 s ahead and `swTick` 0.6 s ahead, both off a 200 ms
interval. A hidden tab's 1 Hz throttle is longer than either, so heartbeat
thumps and slow wave bursts get queued in the past and fire late in a clump.
The Schade 2020 timing is the citation, and it stopped being true the moment the
screen went off.

**Fix:** look ahead raised to 1.6 s for both, which clears a 1 Hz throttle with
room to spare, and the tick interval keeps topping up as before. Cost is a
slightly longer response when you change the pulse rate, which nobody does at
3am.

### S10, iOS lock screen is stage 1 only  (DOCUMENTED, NOT FAKED)

Verified in source: there is no `<audio>` element sink and no
`OfflineAudioContext` render anywhere in the file, so stage 2 of the plan is
genuinely not built. What IS built and correct:

- `IS_IOS` detection including the iPadOS `MacIntel` + `maxTouchPoints` case
- `S.wake` defaults ON for iOS users who have not already chosen otherwise
- the wake lock is requested on play and re-requested on `visibilitychange`
- nothing anywhere in the copy claims the app runs with the screen off

Stage 2 needs a physical iPhone to measure WAV memory cost against
MediaRecorder, to check whether an element sink actually survives lock in a
standalone PWA, and to confirm that a baked in fade sounds right, because iOS
ignores `element.volume`. **I do not have an iPhone. This stays unbuilt and
unclaimed rather than shipped on a guess.** See "Still open" below.

### S11, the handoff's assertions had only partly shipped  (FIXED)

`scripts/hush_audit.js` exists and is green at 155 assertions, covering
programs, evidence tiers, the guide, the shortlist, defaults, the Schade
constants, the tempo clamp, the tonight fallback, the session reset and the
importers. It did **not** cover any of: preset whitelist safety, volume caps,
timer arithmetic, fade curves, save round trip, corrupt save recovery, or
worker prefix safety, which are exactly the classes the brief named.

**Fix:** `hush/tests/hush_tests.mjs`, a self contained headless suite with no
dependencies, run with `node hush/tests/hush_tests.mjs`. It extracts the real
functions and tables out of the HTML and runs them, rather than restating them.

**119 assertions, all green. 22 mutations, all caught.**

Every assertion class was watched fail on purpose before being trusted.
`node hush/tests/hush_tests.mjs --selftest` re-runs that: it breaks each
invariant in a copy of the source, runs the whole suite against each break, and
fails if any break leaves the suite green. Three mutations survived the first
run and every one of them was a real weakness rather than an acceptable pass:

- the belt and braces `S.vol = before.vol` restore in `readSharedLink` is a
  second line of defence behind the whitelist, so removing it alone changed
  nothing observable. The mutation now removes the whitelist entry and the
  restore together, which is the case the second line exists for.
- the preset volume assertion grepped for `heldVol`, which still matched after
  the assignment was deleted because the declaration remained. Tightened to the
  assignment itself.
- the evidence cap mutation promoted one sound to tier 1, taking the count from
  two to three, which is legal. It now promotes three, taking it to four.

Two thirds of the value of the suite came from the mutation run, not from
writing the assertions.

The worker test is worth calling out: it does not grep for the prefix filter,
it runs `sw.js` in a sandboxed VM with a fake `caches` holding a fleet's worth
of keys (`padlab-shell-v10`, `sws-portal-v4`, `bandits-box-v2`,
`sw_sb_index.html`, `hush-shell-v0`, `hush-shell-v1`, `workbox-precache`),
fires the real `activate` handler, and asserts that exactly one key was deleted
and it was `hush-shell-v0`. The original fleet killing worker fails that in
three places.

`scripts/hush_audit.js` (155 assertions) is unaffected and still green. Between
them that is 274 assertions on this app.

### S12, dashes in player facing copy  (FIXED in prose)

36 em dashes in prose against the no dashes rule. Rewritten as commas, colons
and full stops. The `—` used as an empty value placeholder (the countdown at
rest, the meter before the mic is on) is a typographic blank rather than copy
and stays. En dashes inside numeric ranges (`0.5 to 4 Hz`) and the true minus sign
in `−3 dB / octave` are mathematics, not punctuation, and stay.

---

## What I did not change, and why

- **The service worker.** It was already correct. Touching it would mean
  bumping `SHELL_VERSION` and the registration `?v=` in lockstep for no gain,
  and every deploy of a worker is a chance to strand someone. It is now covered
  by tests instead.
- **The mic path.** The analyser is deliberately never connected toward the
  destination. That is both the feature and the privacy story. Asserted, not
  refactored.
- **The comb floor `k/f`.** Correct as written and now asserted at 55, 110,
  375, 440, 1000 and 3520 Hz.
- **Frame caps** (30 fps, 4 fps in Void). Battery engineering, left alone.
- **Simple mode's control count.** The fixes above add zero controls to the
  simple front door. Asserted at 15 or fewer.
- **The evidence tier cap.** Still at most three sounds may claim good
  evidence. Asserted.

---

## How to check this work

```
node hush/tests/hush_tests.mjs              # 119 assertions
node hush/tests/hush_tests.mjs --selftest   # 22 mutations, every one must go red
node scripts/hush_audit.js hush/index.html  # the existing 155
```

Nothing here needs a browser, a server or a network. Syntax is checked by
extracting the inline script block and running it through `vm.createScript`,
never by counting braces: this file's prose and its inline SVG data URIs are
full of brackets, and the repo's own regex plus vm block checker is on record
for reporting a syntax error in a perfectly good file because a `</script>`
appeared inside a string.

**Nothing was deployed.** No git was run. The changes sit in the working tree
of `add-sproing-jumper`, and work on that branch is not live until it is pushed
to `main`.

---

## Still open, and what it would take

1. **iOS stage 2 lock screen playback.** Needs a physical iPhone. Until then
   the honest posture is the wake lock plus plain copy, which is what ships.
2. **A LOOKING pass.** No screenshots were taken this session. The one that
   matters is the simple front door at 375x667 in a genuinely dark room, plus
   the desktop width, because two of the three defects found on this app's
   launch night only appeared at desktop width while every phone sized test was
   green.
3. **Preset volume as a trim rather than an absolute.** The fix above stops the
   surprise but the underlying design is still "each preset names a level".
   Making it a relative trim around the user's ring would be more honest and is
   a Director call, not mine.
4. **Two tab clobber.** `save()` writes `S` wholesale. Two Hush tabs, or a
   crash mid write, still lose the loser's changes. The sanitiser now means the
   result is never dangerous, only stale. A read modify write would fix it
   properly.

---

## Round 2, 2026-08-20: the ChatGPT code-level audit, Phase 0

An external code-level audit (ChatGPT, working from the packaged source) found
32 issues; each was verified against this source before anything moved. Shipped
this round, worst first:

- **The nursery cap is now a final ceiling** (their HUSH-001, CRITICAL,
  confirmed real). Adaptive lift reaches 3.5x and targetGain() clamped at 1.0,
  so cap ON + ring 100 + full lift = full output with the cap switch still
  drawn ON. The old test blessed the wrong invariant ("adaptive stays under
  1.0"); it now asserts a 0.34 ceiling plus a vol/prog/adapt sweep, and a new
  selftest mutation breaks the ceiling on purpose.
- **One start authority in simple mode** (HUSH-002). The big ring, the timer
  chips and Full screen called start(), which plays whatever sits in S; before
  any real choice that was the engine default, not the card's promise.
  primaryStart() routes first-ever starts through the recommendation.
- **Manual Stop retires the timer** (HUSH-003). S.timer stayed painted on the
  chips with timerEnd=0, so a restart ran forever while claiming 20 min.
- **Adaptive rolls back when the mic is refused** (HUSH-013).
- **Trials: A must differ from B** (HUSH-007) **and assignment freezes at the
  planned sample size** (HUSH-008; the % wrap assigned nights forever).
- **Reset everything now erases everything**: state, trial, nights, archive
  (HUSH-012).
- **Visual queues are bounded** (HUSH-016): producers skip while hidden and cap
  at 256; they used to grow ~140k entries over a hidden night.
- **start() resumes any non-running context** including WebKit "interrupted"
  (HUSH-018), **the SW install fails rather than activate without its shell**
  (HUSH-022), **pinch zoom is re-enabled** (HUSH-024), **--faint text moves to
  ~4.7:1 contrast** (HUSH-025).
- **Science copy corrected against primary sources re-fetched today**
  (HUSH-030/031): the music citation misattributed Wang 2014's numbers to
  Cochrane 2015; it now cites the 2022 update (13 studies/1007; PSQI −2.79,
  10 studies/708, moderate certainty). The 50 dBA meter copy now calls itself a
  hospital nursery reference, not a safety verdict, and the AAP line matches
  the 2023 policy (far as possible, quiet as possible, limited duration).

Deliberately NOT done this round: the trial-science overhaul (their
HUSH-004/005/006/009/010/011: canonical sleepDate, deviation tracking, blind
UI, block-aware analysis, auxiliary-store sanitisers) is real and accepted but
needs design decisions, not a patch; program fades on the audio clock
(HUSH-014), scheduling generations (HUSH-015), wake-lock manager (HUSH-019),
storage-degraded surfacing (HUSH-020), calibration bus (HUSH-021), and
everything in their listening list (R-01..R-10) waits for ears and hardware.
Suites after the round: 120 + 155 ok, all 23 mutations caught. Shell v10.

## Round 2b, same night: the stores grow armor (their HUSH-010/011)

`sanitiseTrial()` / `sanitiseNight()` / `sanitiseNights()` now gate every path
into TRIAL and NIGHTS: boot load, the morning log, tracker imports, and the
archive concat. Bad dates drop, impossible metrics become null, unknown
sounds void a trial, and (caught while writing it) a null metric stays null
instead of becoming a phantom zero via Number(null). Manual inputs gained
browser min/max. 131 + 155 ok, 25 mutations caught, shell v11.

## Rulings from Stephen, 2026-08-20 night

- **Trial nights do NOT lock the sound controls.** The deviation approach is
  the approved path when the trial rework lands: change what you like, the
  night gets flagged deviated and excluded from the primary analysis, with an
  explanation. No gates.
- **Reset everything keeps its total erase but asks first.** Shipped.
- A visible **build tag** now sits in the footer, lockstep-tested against the
  registration version, because "am I looking at the old version?" burned a
  real testing session tonight. 132 + 155 ok. Shell v12.
