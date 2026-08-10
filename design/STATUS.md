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
| `npm test` | every app's suite — 36 passing, 0 failing, 5 emulator-only skips |
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

## Research, review and implementation — complete

**23/23 researched** — 287 sourced competitor complaints, in
`findings/COMPETITIVE-BRIEF.md`.

**23/23 reviewed** — a persona focus group and a real browser stress run per
app: ~130 personas, ~400 stress scenarios, **351 fixes located and evidenced,
129 of them blockers**. Per-app detail in `findings/<slug>.review.json`, the
cross-app read in `findings/PORTFOLIO-SYNTHESIS.md`.

**23/23 implemented** — **380 fixes applied, 129 blockers closed**. 88 fixes
were deliberately skipped, each with a recorded reason.

### The full regression, run independently rather than taken on trust

| Check | Result |
|---|---|
| `npm test` | **36 passing, 0 failing**, 5 emulator-only skips (was 25) |
| `npm run design:check` | **1542/1542** contrast, accent-token guard clean |
| `npm run a11y` | **0 violations**, 23 apps x light + dark, panel open |
| `npm run prefs` | comfort panel green on all 23 |
| `node design/stress.mjs` | **0 hard failures across 23 apps** |

The test count rose because agents added coverage for the defects they fixed
rather than only changing code — packing-list went 5 to 16, pdf-tools 7 to 19,
qr-maker 5 to 21, caregiver-log to 74.

## Done, per app

| App | State |
|---|---|
| Wheel Picker | full pass — reduced motion honoured (4,273ms → 742ms), focus kept on spin, elimination announces the last person, caps disclosed, wedge contrast 1.04:1 → 2.53:1, spin history, QR overflow explained |
| Seating Chart | full pass — keyboard seating, floor plan no longer clips past table 12, 1,000-guest cap disclosed, tab bar reachable, non-Latin names print correctly, all five confirms replaced with undo |
| The other 21 | full pass — reviewed, implemented and verified |

## Sweeps done portfolio-wide

- **`--accent-ink` painted onto `--accent`** in 7 apps. Measured 3.64–4.04:1 in
  light mode on five of them; all clear 5.2:1 on `--accent-fill`. axe reported
  zero violations on every one, because each is an `.active`/`.sel`/`.winner`
  state that does not exist until the user interacts.
  `npm run design:check` now fails if it returns.

## Still to do

1. **Honest trust copy for the four cloud-backed apps** — caregiver-log,
   grocery-list, signup-sheets and team-parent are the only ones without a
   `.trust` badge (18 of 23 now have one, up from 2). The agents were right not
   to stamp "nothing leaves your device" on an app where data does leave. What
   those four should say instead is a claim about the service, and belongs to
   its owner rather than to whoever is editing the file.
2. **Print on paper.** Print is still the largest cluster by fix count. The
   base survives "background graphics off" and each app's layout has been
   driven under `emulateMedia({media:'print'})`, but nothing substitutes for
   printing one and looking at it.
3. **Bracket Maker's gold** still reads more olive than trophy.
4. **The 88 skipped fixes.** Recorded per app in the workflow journals with
   reasons. Several are correct refusals worth keeping — bracket-maker declined
   to make shared brackets live via Firestore because it would mean data
   leaving the device, which contradicts the badge it had just been asked to
   write.

### Deliberately NOT changed

The 10 remaining `confirm()` calls are correct. They guard multi-user
irreversible actions where undo cannot work: rotating a share link cannot be
undone for the people who have already lost access, and team-parent's RSVP
delete says outright that the names cannot be restored. Undo is the right
default, not a rule to apply without looking.

## Note on editing

Never hand-edit anything between the `SWS STUDIO BASE` sentinels in an app's
`index.html` — it is generated, and `apply.mjs` will overwrite it. Edit
`design/studio.css` or `design/skins.mjs` and re-run `npm run design:apply`.

Do not run `apply.mjs` while implementation agents are editing apps: it
rewrites all 23 `index.html` files and will collide with them.
