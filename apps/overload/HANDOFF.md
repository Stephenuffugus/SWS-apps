# HANDOFF — OVERLOAD
**Sky Wolf Studio · SWS Strategic Media LLC**
Prescription-first strength tracker. Single-file vanilla PWA.
`node test/overload.test.mjs` = 68 assertions, green.

## 1. What this is

A progressive-overload app built around one inversion of the category:
**the engine writes the next workout, so logging collapses to one tap per set.**
OVERLOAD prescribes the exact next session (weight × rep range × sets, due on a
3-day clock for 2×/week per muscle group); in the gym the user only confirms.

**UX invariant — do not break:** after initial lift creation, the user never
types anything, anywhere, in the core loop. Any new feature must respect this.
**Verdict vocabulary is fixed:** ADD WEIGHT / ADD REPS / CONSOLIDATE /
DELOAD −10%. Don't invent new verdict names.

Competitive positioning (researched Aug 2026): pure loggers (Strong, Hevy) are
fast but don't coach; AI programmers (Fitbod, Alpha) coach behind a
subscription. The number-one complaint category-wide is logging friction. Our
wedge: prescription IS the interface. One tap per set, no subscription, no
server, single file.

## 2. Studio round 2026-08-18 (this build, on top of Stephen's v2)

Everything from the previous roadmap §6 is done:

1. **PWA shell:** `manifest.webmanifest`, `sw.js` (network-first document,
   cache-first assets — bump `CACHE` per deploy), icon set from Stephen's
   art, fonts self-hosted in `fonts/` (Big Shoulders 600/800, Plex Mono
   400/600).
2. **Per-lift settings:** `rest` (seconds, 15s steps, 30–600, default 120),
   sets, rep range, delete-with-undo — all via the ⚙ on each due card,
   steppers only, zero typing. Rep clamps keep `repMin ≤ repMax`.
3. **Export / import:** Download backup (`{app:'overload',version:2,data}`)
   and Restore (file picker, shape-validated, confirm, Undo) in Trend.
4. **Weekly volume glance:** `#volStrip` chips per muscle group with dots vs
   the 2×/wk target, derived from history (last 7 days), read-only.
5. **Rest-end beep + vibrate**, silent-failure safe; 🔊 mute in the header
   (persisted as `S.sound`) quiets both.
6. **QA pass:** inline field errors instead of alert(); `load()` coerces every
   field from hand-edited backups (unknown muscle groups dropped, numbers
   clamped); `repMin===repMax` reads "N reps"; 1-set sessions skip rest;
   deload floors at the increment; corrupt storage falls back clean.

Also fixed from v2:
- **The verdict card now survives:** v2 called `showResult()` then
  `renderDue()`, which rebuilt `#dueList` over the card it had just inserted.
  Order is now render-then-show. Keep it that way.
- **Session weight is a copy:** `W.w` (not `p.w`) takes the ± adjustments;
  the prescription is written once, at finish. Closing mid-session discards
  everything, by design — no partial sessions.
- Inline `onclick` handlers replaced with listeners; due cards are keyboard
  buttons; `#live` announcements; branding corrected to Sky Wolf Studio;
  `privacy.html` + footer; copy brought into Stephen's voice.

## 3. Engine (pinned by tests — change only deliberately)

`judge(p, reps)` on session finish:
1. All sets ≥ repMax → **ADD WEIGHT** (+inc: per-exercise or group default
   2.5 isolation / 5 upper / 10 lower), back to bottom of range.
2. All in range, none failed → **ADD REPS** (same weight).
3. Fail only on final set → **CONSOLIDATE** (fatigue, not ceiling).
4. One mid-session fail → **CONSOLIDATE** + rest note.
5. Multiple/early fails → **DELOAD** −10%, rounded to 2.5, floored at inc.

Set thresholds: hit = reps ≥ repMax · part = ≥ repMin · fail = < repMin.
Scheduling: done date + 3 days (deliberate; a late session slides the clock).
Stall ≥ 3 → swap offer from the same group at 85% rounded (resets stall).

## 4. Data model (`overload.v2`)

```js
{ programs: [{ id, mg, ex, w, sets, repMin, repMax, rest,
               due, outcomes|null, stall,
               history: [{date, w, reps[], verdict}] }],
  weighins: [{date, bw, bf|null}],
  sound: true }
```

## 5. Design system — keep cohesive

IPF plate colors as the whole semantic palette: red fail/deload, yellow
partial/hold, green hit/progress, blue primary. Big Shoulders Display for
display, Plex Mono for every number. The **set map** (green/yellow/red dots)
is the product's visual identity — reuse it anywhere outcomes appear (home
cards, live workout, results, history, and now the volume strip).

## 6. Later / optional

**Round 2 (built 2026-08-18, from the competitor scan):**
- **Warm-up ramp**: `warmupRamp(p,w)` prints with set 1 only (`#wkWarm`),
  barbell lifts open with the empty bar then 60/80%, others ramp 40/60/80,
  rounded to the increment, plate math per line, "then W for real". A ramp
  under two honest lines renders nothing. Pinned by tests.
- **e1RM sparkline**: `e1rmSeries(p)` (Epley on the best set per session) in
  the ⚙ settings sheet with latest number and delta; needs ≥2 sessions.
Skipped on purpose: RPE/RIR logging (breaks one-tap), social/programs
(anti-wedge), notifications (PWA-flaky on iOS).

Later: Firebase sync · share-a-card image (the social-proof loop Hevy owns) ·
2-row rep chips if repMax > 12 ranges arrive · sunbeams tie-in.
Art: `marketing/` thumbs and the PNG icon set ARE Stephen's art (filed 2026-08-18, rescaled from his file, never regenerated). Only `icon.svg` is a functional mark.
