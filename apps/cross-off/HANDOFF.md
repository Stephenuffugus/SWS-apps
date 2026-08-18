# HANDOFF — Cross Off

**Project:** Cross Off, a paper to-do list you cross off with real highlighters
**Studio:** Sky Wolf Studios · SWS Strategic Media LLC
**Stack:** Single-file vanilla HTML/CSS/JS PWA. No build step, no runtime deps. Fonts self-hosted in `fonts/` (Caveat 700 + Patrick Hand, latin woff2).
**Status:** Studio round 2026-08-18 complete on top of Stephen's user-tested v1.0.0. `node test/cross-off.test.mjs` = 73 assertions, green.

## What this app is

The anti-Goblin-Tools: Goblin Tools plans, Cross Off makes the *doing* feel good. Built for an ADHD mom who wanted a checklist that is more detailed, more hands-on, and more satisfying to work through. Write tasks on ruled paper, group by NOW/TODAY/SOON, optionally race a countdown, then **drag a real highlighter across the row** to cross it off. Beat your own record for a task name and the page stamps NEW RECORD! with confetti.

Design ethos (from competitor research; respect in all future work):
- **No shame mechanics.** No overdue badges, no red counters, no dying streaks, no guilt copy. The overtime display is deliberately calm.
- **Zero onboarding.** Opens ready to use.
- **Celebration is event-driven, never nagging.** Sound and vibration share one mute, persisted.
- **Streamlined over featureful.** Every addition must defend its place.

## ⚠️ Hard-won invariants — do not regress

1. **Never re-render on resize.** The handler ignores height-only changes (the phone keyboard), only re-sizes canvases, debounced, on width change, and skips entirely while an input or textarea has focus. Violating this recreates the keyboard→resize→render→blur→keyboard flash loop.
2. **Canvas gesture = direction lock, not touch-action:none.** Canvases use `touch-action:pan-y` with a pending→draw/scroll machine (`bindStroke`). `touch-action:none` kills list scrolling because canvases cover every row.
3. **Ghost-click guard on sheets.** `sheetOpenedAt` + 350ms in the backdrop handler. Keep it.

Also: tap-to-edit only fires from a gesture that stayed "pending" under 8px movement.

## Studio round 2026-08-18 (this build)

- **PWA shell:** `manifest.webmanifest`, `sw.js` (network-first document, cache-first assets — bump `CACHE` on every deploy), full icon set, self-hosted fonts. `privacy.html`. Footer + branding corrected to Sky Wolf Studios.
- **The morning page-flip** (the anti-graveyard, was roadmap v1.2): `freshPage(p)` archives the marked-up page (ink intact) into `p.past` (cap `MAX_PAST_DAYS`), carries unfinished forward silently, and re-adds `chore:true` tasks undone. A gentle morning bar offers the flip on a new day with crossed-off work (`lastFlip`/`flipSnooze` gate it, "not yet" snoozes for the day); it is also in the page sheet, with Undo via SWS.toast. **Flip-back viewer** (`#past`): read-only pages, strokes redrawn, prev/next through days.
- **Chores:** `task.chore`, toggled in the edit sheet ("↻ every day"), row wears ↻.
- **Task details:** `task.note` (textarea in the edit sheet, shown in focus mode, ✳ on the row). This is the "I can be more detailed" ask.
- **Steps (Stephen, 2026-08-18): the checklist within the checklist.** `task.steps:[{text,done}]`. "the dishwasher" breaks into load it / run it / empty it: edited in the edit sheet (Enter adds, multi-line paste adds a batch, ✕ removes), toggled there or in focus mode (`toggleStep`), counter pill on the row (`.stepflag`, green at full). When the LAST step lands: confetti + toast + the row takes a pulsing golden ring (`.task.ready`, derived state, survives re-render) — and the app deliberately does NOT cross the task off. The stroke is hers; the sheet clears itself away so the highlighters are right there. Chores reset their steps on the page-flip. Never gate `completeTask` on steps — crossing off with steps unfinished is allowed (no shame mechanics).
- **Paste a braindump:** a multi-line paste into the add box becomes one task per line, `!`/`~` prefixes parsed per line.
- **Timers are wall-clock and survive reloads:** deadlines are `Date.now()`-based, persisted, resumed on boot; a deadline that passed while closed arrives calm (`buzzed` forced true on load).
- **Haptics:** 10ms on stroke commit, 200ms on buzzer, gated by the sound toggle.
- **Accessibility:** every row has an ✎ edit button; the edit sheet has "✓ cross it off" (autoStroke) so the gesture is never the only path; tabs and markers are real buttons with pressed states; `#live` announcements; Escape closes sheets/viewer; focus returns; reduced-motion skips confetti; zoom is not disabled.
- **SWS.toast/undo** (`sws-ui.js`, styled by this app's own `#toast` CSS): delete task, delete page, and page-flip all announce with Undo.
- **Dark scheme:** the desk dims, the paper stays paper (highlighter multiply-blend needs a light page). Notebook centers at 44rem+ on big screens.

## Storage (`crossoff.v1`, additive only — old saves must keep loading)

```
{ uid, activePage,
  pages:[{id,name,color,past:[{date,tasks:[…]}],
          tasks:[{id,text,note,done,pri(1|2|3),chore,steps:[{text,done}],
                  strokes:[{color,pts[]}],
                  timer:{duration,deadline,buzzed}|null,result|null}]}],
  records:{normText:bestMs}, doneToday, doneDate,
  color, addPri, sound, lastCustom, hintShown, lastFlip, flipSnooze }
```

## Test checklist (run on a real phone after any change)

Everything from v1.0.0 (scroll from a row, keyboard/sheet stability, full/half stroke/tap, timer chip → focus, buzzer calm overtime, PR stamp, un-cross, persistence, rotation redraw, mute) plus: flip the page and check the pile keeps the ink; a chore comes back undone; paste a multi-line list; start a timer, kill the app, reopen (still counting, no buzz if passed); VoiceOver/TalkBack pass over rows.

## Roadmap (later)

**Round 2 (built 2026-08-18, from the ADHD research):**
- **"Hand me one"**: `handMeOne()` behind the ✋ margin button in the add
  row. Picks from the most urgent non-empty group (random within it), starts
  `lastCustom||10` minutes, lands in focus. Blank page gets a kind toast.
- **The time disk**: `#fDisk`, a conic-gradient pie above #fTime that drains
  with the countdown (updated per tick + on openFocus). Time as a shape for
  time blindness; digits stay.
Skipped on purpose: body doubling (needs a server, breaks on-device promise),
virtual-pet gamification (unlockable pens are our version, already listed).

- Records page (per-task PR table, ink laid down per colour) · gentle Finch-style streak that pauses, never dies · unlockable pens · share card PNG · drag-to-reorder within a section (must not conflict with the gesture table) · "break it down" via Claude API (auto-suggest steps).
- Art: `marketing/thumb-256.png`, `stripe-thumbnail.png` and the PNG icon set ARE Stephen's art (filed 2026-08-18, rescaled from his file, never regenerated). Only `icon.svg` (the vector favicon) is a functional mark.
