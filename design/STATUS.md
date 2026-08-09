# Studio overhaul — where things stand

Read `DESIGN-SYSTEM.md` for the system itself and
`findings/PORTFOLIO-SYNTHESIS.md` for what is wrong and where the leverage is.
This is the progress log.

## Everything is committed

The overnight design-system work — 20k lines across the toolchain and all 23
apps — is committed and pushed. So is everything since. A long agent run now
checkpoints itself: `design/autosave-findings.sh` commits findings and in-flight
app edits every four minutes, on separate scoped commits, so an interrupted
session cannot cost hours of results.

## The design system

`design/studio.css` is the shared skeleton — spacing, type, components, focus,
motion, print — with **zero colour literals**. Every colour arrives from a
per-app skin compiled from OKLCH by `design/build.mjs`, which solves each text,
control-boundary, focus and semantic colour against a WCAG target and **fails
the build** rather than shipping something unreadable. 1542/1542 checks pass.

`design/apply.mjs` splices the base into each app, prunes template rules the
base now owns, installs the display font and shared runtime, precaches both,
bumps the service-worker cache, and repaints `theme-color` and the manifest.

## Comfort — the display panel

Every app carries the same settings panel, from the sliders button in the
header: appearance (auto/light/dark), text size (0.9–1.5×), spacing, easier
reading, warm night tint, contrast and motion. `DESIGN-SYSTEM.md` documents the
rules it follows; the ones worth knowing here:

- **One key for the whole origin.** A setting made in Baby Log at 3am is
  already in force the first time Grocery List opens. Someone who needs larger
  text needs it in all 23, and making them set it 23 times would be its own
  accessibility bug.
- **Applied before first paint**, from a classic blocking script — a deferred
  theme switch is a white flash in a dark room.
- **`--tap` is floored at 44px and scales UP with text size.** Enlarging text
  is often about eyesight or tremor; shrinking targets would undo the help.

## The shared runtime

`design/ui.js` → `sws-ui.js` in every app:

- `SWS.undo(msg, restoreFn)` — an Undo button inside the toast. Undo rather
  than a confirm dialog: a confirm taxes the 99 deliberate taps to catch the
  one mistake, and at 3am is dismissed without reading.
- `SWS.saved()` — because saving is fire-and-forget across the portfolio; the
  apps only speak when it **fails**.

The toast's dismiss clock stops while the pointer or focus is inside it. An
undo that vanishes is worse than no undo.

## Verification

| Command | What it proves |
|---|---|
| `npm test` | every app's suite — 25 passing, 0 failing, 5 emulator-only skips |
| `npm run design:check` | 1542/1542 contrast checks, plus the accent-token guard |
| `npm run a11y` | axe over 23 apps × light/dark, **including the comfort panel open** |
| `npm run prefs` | drives all 23 comfort panels in a real browser |
| `node design/stress.mjs` | the hostile battery, all 23 apps |
| `npm run synth` | regenerates the portfolio synthesis from the findings |

### Why axe alone was not enough

axe reports **zero violations** across all 23 apps and the contrast build
passes 1542/1542. Both are true. Both missed most of the real defects, for the
same reason: **they scan the page as it loads.** Nearly every genuine failure
lives in a state that does not exist yet — `.active`, `.sel`, `.winner`, a list
with 200 rows, a canvas repainted after a preference change, a PDF not yet
generated.

`design/stress.mjs` exists for that. It drives each app through the same
battery — layout at 320/414/1280 and at largest text and roomy spacing, hostile
text and injection, numeric edges, rapid clicking, 200 bulk adds, reload
persistence, deliberately corrupt localStorage, keyboard reachability, **axe
after interacting**, and print — so results are comparable across the
portfolio. `design/harness.mjs` is the rig underneath it.

## Research and review

**23/23 apps researched** — 287 sourced competitor complaints, written up in
`findings/COMPETITIVE-BRIEF.md`.

**14/23 apps reviewed** so far, each with a persona focus group and a real
browser stress run: **217 fixes, 80 of them blockers**. Remaining reviews are
running.

## Done, per app

| App | State |
|---|---|
| Wheel Picker | full pass — reduced motion honoured (4,273ms → 742ms), focus kept on spin, elimination announces the last person, caps disclosed, wedge contrast 1.04:1 → 2.53:1, spin history, QR overflow explained |
| Seating Chart | full pass — keyboard seating, floor plan no longer clips past table 12, 1,000-guest cap disclosed, tab bar reachable, non-Latin names print correctly, all five confirms replaced with undo |
| Baby Log · Caregiver Log · Pill Schedule | earlier full pass; now re-reviewed |
| The other 19 | base-layer quality; implementation in flight |

## Sweeps done portfolio-wide

- **`--accent-ink` painted onto `--accent`** in 7 apps. Measured 3.64–4.04:1 in
  light mode on five of them; all clear 5.2:1 on `--accent-fill`. axe reported
  zero violations on every one, because each is an `.active`/`.sel`/`.winner`
  state that does not exist until the user interacts.
  `npm run design:check` now fails if it returns.

## Still to do

1. **Finish the 9 outstanding reviews**, then implement them.
2. **Print.** The largest single cluster — 14 apps, 62 fixes. The base ships
   real print rules and survives "background graphics off", but each app's own
   print layout still wants a proof: literally print one and look at it.
3. **Silent caps**, the second largest cluster. Every limit must say its own
   name at the moment it bites.
4. **The privacy promise as an object.** Only 2 of 23 apps show it as a badge;
   the rest bury it in grey footer copy, which the research says plainly that
   nobody believes. Being folded into the implementation pass, with copy true
   and specific to each app.
5. **Bracket Maker's gold** still reads more olive than trophy.

## Note on editing

Never hand-edit anything between the `SWS STUDIO BASE` sentinels in an app's
`index.html` — it is generated, and `apply.mjs` will overwrite it. Edit
`design/studio.css` or `design/skins.mjs` and re-run `npm run design:apply`.

Do not run `apply.mjs` while implementation agents are editing apps: it
rewrites all 23 `index.html` files and will collide with them.
