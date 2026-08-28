# HANDOFF, Diamond Rules

Filed from Stephen's Diamond rules zip drop of 2026-08-28 (authored in a claude.ai session as prototype v2). Punctuation swept to studio voice; content preserved. The v3 integration notes live at docs/DIAMOND-RULES-NOTES-2026-08-28.md.

Kid-facing app that teaches the baseball/softball rules little leagues skip: the count, force plays, tag-ups, infield fly. Target age ~6 to 10. Studio: Sky Wolf Studio (educational catalog).

## Prototype v2 state (single file)

`diamond-rules.html`: vanilla HTML/CSS/JS, no build step, mobile-first, full-screen (100dvh, no page scroll). Fonts: Anton (display) + Nunito (body).

**Layout is full-bleed**: the SVG field is `position:fixed; inset:0` and fills the entire screen edge to edge. No cards, no title, no chrome. A `fitView()` "camera" recomputes the viewBox on resize so a 400x580 safe box (the whole diamond + fielders) is always in frame at max size on any aspect ratio; the scene art (sky, sun, clouds, outfield, fence, foul lines) is painted far past the safe box so there is never letterboxing or cropping of gameplay elements. Keep every interactive element inside SAFE_W/SAFE_H.

Floating UI over the field: top bar = streak pill, B/S/O bulb pill, gear (one thin row); bottom = translucent question bubble + icon-only mode tabs. Feedback is a pop-in overlay with a big verdict word, rule chip, explanation, confetti + WebAudio sfx on correct.

### Modes
1. **The Count**: tap Ball / Strike / Foul; app narrates walks, strikeouts, full counts, and the foul-can't-be-the-last-strike rule. Count resets/outs tracked live on the bulb board.
2. **The Play**: procedurally generated ground-ball scenarios. Kid taps a base on the diamond (bases pulse as a cue) or "Hold the ball."
3. **Fly Balls**: hand-authored scenario bank: tag-ups, doubling off a runner who left early, sac fly, infield fly rule, tag-up on a caught foul, no-run-on-third-out-catch, force-restored-when-it-drops.

### Rules engine (keep this logic intact)
- `forces(runners)` gives `{B1:true, B2:has(1), B3:has(1)&&has(2), HOME:all three}`. Batter always forces 1st; chained occupancy forces the rest.
- Correct answer = **lead force base**. With 2 outs and a lead force above 1st, `alt` also accepts B1 ("any force ends the inning").
- No-force runner sets ([2],[3],[2,3]): correct is B1 with a "nobody can force them" explanation.
- Every scenario carries: `kind` (base|choice), `runners`, `outs`, `ballAt`, `prompt`, `correct`, `alt[]`, `why` (kid-level explanation), `chip` (rule name), `eyebrow`.

### Sport config (`SPORTS` object)
League rules are **data, not code**: `strikesForOut`, `ballsForWalk`, ball colors, note text. Baseball = 3 strikes. **Softball = 4 strikes**: this is the user's league house rule for young girls' softball, not standard softball (which is 3). Keep it configurable; may want a per-league custom setting later. Foul logic derives from config: fouls add strikes only up to `strikesForOut - 1`. Bulb board shows `n-1` lights per column (last one = the out/walk).

## Constraints / conventions
- Stay **single-file, zero build**, deployable as-is.
- Prototype used in-memory state only (authored in a Claude.ai artifact where localStorage is unavailable). On real deploy: persist settings + best streak to localStorage. DONE in v3.
- Real deploy needs: separate manifest.json, 192/512 icons + maskable, apple-touch-icon, and a service worker. DONE in v3.
- Accessibility floor already in place: bases are keyboard-focusable buttons, `prefers-reduced-motion` disables ball/confetti/pulse animations, focus-visible styles. Keep it.
- Copy voice: short sentences, ~grade 2 to 4 reading level, neutral pronouns ("they"), exclamation-friendly. Rule names live in the chip so kids pick up real vocabulary.

## Roadmap (rough priority, v2 numbering; struck items shipped in v3)
1. ~~**Positioning mode** ("Where do you go?")~~ SHIPPED v3 as Take the Field: tap-a-fielder answer type, cover/backup/cutoff fundamentals.
2. **At-bat mode** that connects everything: live count, then ball in play, then where's-the-play, one continuous half-inning with outs carrying over. This is the "real game feel" glue.
3. ~~Persistence (localStorage), SW/offline, icons~~ SHIPPED v3. Install prompt still open.
4. More fly/ground scenarios; difficulty tiers (T-ball / coach pitch / kid pitch) gating which rules appear.
5. Softball extras: pitch-circle rules, no-leadoff rule toggle (runners can't leave until the ball crosses the plate; good quiz material).
6. Sticker/badge rewards per rule mastered (3 correct in a row on a chip = badge). Kids respond to collection loops.
7. Sound polish: crowd cheer sample on streaks, bat crack on scenario load (keep WebAudio-only to stay single-file, or inline base64 samples).

## Known gaps / decisions to make
- ~~"Hold the ball" is currently never the correct answer~~ FIXED v3: SMART_BANK scenarios where holding is right.
- ~~Ground-ball generator can produce trivial repeats~~ IMPROVED v3: weighted runner pool + no immediate repeats.
- Verdict overlay blocks the diamond; consider a compact banner option so kids can study the play result on the field.
- No i18n; strings are inline. Fine for now.
