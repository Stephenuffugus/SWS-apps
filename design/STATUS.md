# Studio overhaul — where things stand

Written during the overnight run. Read `DESIGN-SYSTEM.md` for the system
itself; this is the progress log and the list of what is left.

## Done

### The design system
- `design/studio.css` — shared skeleton: spacing scale, type scale, component
  CSS, focus, motion, print, `prefers-reduced-motion` / `prefers-contrast`.
  Zero colour literals.
- `design/skins.mjs` — 23 rows, one per app: hue, chroma, paper warmth,
  typographic voice, texture, radius, container width.
- `design/color.mjs` — OKLCH↔sRGB, WCAG contrast, and a solver that walks a
  colour along the lightness axis until it clears its target.
- `design/build.mjs` — compiles skins + studio.css into per-app CSS and runs
  the contrast audit. **1542/1542 checks pass.**
- `design/apply.mjs` — splices the base into each app's inline `<style>`,
  strips the old palette, prunes template rules the base now owns, installs the
  display font, precaches it in the service worker, bumps the SW cache version,
  and repaints `theme-color` + the web manifest.
- `design/preview.mjs` — renders every skin side by side and screenshots them.
- `design/shoot-apps.mjs` — screenshots the real apps, and fails loudly on
  console errors or horizontal overflow.
- `design/icons.mjs` — re-hues all 23 app icons by decomposing each colour to
  OKLCH and swapping only the hue, then regenerates the PNGs.
- `design/hub.mjs` — generates `apps/index.html`.

### Applied to all 23 apps
- New base layer in place; old `:root` palettes removed; each app's *own*
  custom properties preserved.
- Between 18 and 41 duplicated template rules removed per app.
- Display fonts installed and precached (Fraunces for the 8 editorial apps,
  Space Grotesk for the 11 technical ones; the 4 "plain" apps use the system
  stack deliberately).
- Service worker cache versions bumped so returning users get the new shell.
- `theme-color` and manifest colours repainted per app.
- All 23 icons re-hued; 47 PNGs regenerated.

### The hub
Rebuilt as a generated page: studio-dark background, each card carrying its
app's own accent as a spine plus the re-hued icon, six categories, and a live
search box (matching names, taglines and a keyword list, so "insurance" finds
Home Inventory and "teacher" finds both school apps).

### Test suite
Was 14 passing with 11 failures. Now **25 passing, 0 failing, 5 skipped**
(the skipped five need the Firebase emulator). Most of those failures were
missing dev dependencies masking real coverage — `jsdom`, `pdf-lib` and
`qrcode-generator` are now declared in the root `package.json`.

## Verified
- No console errors and no horizontal overflow in any of the 23 apps, light or
  dark, at 414px.
- Contrast is enforced by the build, not by eye. Every text, control-boundary,
  focus and semantic colour is solved against the hardest background it
  actually appears on.

### Verification tooling
- `design/test-all.mjs` — every app's tests in one run, with the emulator-only
  ones listed as skipped rather than buried as permanent reds.
- `design/a11y.mjs` — axe-core against all 23 apps in both themes, in a real
  browser, grouped by rule so a repeated defect reads as "fix this once".
- `design/finish.mjs` (`npm run finish`) — build → apply → hub → tests → a11y →
  brief → screenshots → report, in order, continuing past non-blocking failures.

### What the accessibility audit found
Running axe across the portfolio surfaced three things worth knowing:

- **`footer.colophon` failed 4.5:1 on six apps.** It was set in `--ink-3`, which
  the system reserves for placeholders — but the colophon carries the privacy
  promise and the feedback link, which are sentences people read. Fixed in the
  base; it now uses `--ink-2`.
- **16 of 23 apps have no `<main>` landmark**, and 15 have content sitting
  outside any landmark at all. The base ships a skip link that targets `#main`,
  so this is both a landmark fix and a keyboard fix.
- **Three apps put `role="tablist"` on `.seg` with plain `<button>` children** —
  a critical violation, because a tablist whose children are not tabs actively
  lies to a screen reader. The design system now documents both correct
  options.

### A print bug worth noting
Most browsers print with "background graphics" **off** by default, which drops
every fill but keeps the text colour — so a primary button came out as
near-white text on white paper. The base now restates buttons, chips and the
trust badge as ink-on-white with a border, so they survive either setting.

## Accessibility: 0 violations

axe-core, all 23 apps, light and dark, in a real browser:

| | violation instances | serious or critical |
|---|---|---|
| Before | 72 | 10 |
| After | **0** | **0** |

What that took, beyond the palette work:

- `<main id="main">` added to the 14 apps that had none — which also gave the
  base's skip link something to point at. `design/add-main.mjs` did this by
  counting div depth from the `.wrap` open, not by regex.
- Bill Splitter and Sitter Sheet had `role="tablist"` on a two-button toggle
  group with plain `<button>` children. Both are now `role="group"` with
  `aria-pressed` kept in step with `.active` through a shared `setPressed()`
  helper, so the look and the announced state cannot drift apart.
- Bill Splitter's view tabs filled with `--accent` while taking their label
  colour from `--accent-ink`, which is contrast-solved against `--accent-fill`.
  That mismatch was the portfolio's last contrast failure.
- The colophon moved from `--ink-3` to `--ink-2`, and hints from 13px to 15px.

## Where each app got to

Every app got the new palette, type scale, spacing, fonts, icons, chrome and
landmark work. Four went further, through a per-app pass driven by their audit
and research:

| App | State |
|---|---|
| Baby Log | full pass — trust badge, teaching empty states, one-thumb targets, undo on the destructive import, contrast-solved feed/sleep/diaper fills |
| Caregiver Log | full pass — radiogroup semantics, draft persistence, save confirmation, empty states |
| Pill Schedule | full pass — 11 defects fixed, including checkboxes that were `display:none` (keyboard-unreachable), state carried by colour alone, a `<label>` with no control, and one-tap delete with no undo |
| Grocery List | partial — landmark, skip link and undo landed before the pass was stopped |

The other 19 sit at base-layer quality: new palette, type, spacing, fonts,
icons, landmarks, zero a11y violations — but their own CSS still carries
hardcoded sizes and legacy aliases.

## Still to do

1. **Finish the per-app pass for the remaining 19.** This is the biggest
   remaining comfort win. Each app's own rules still use hardcoded sizes
   (`.92rem`, `12.8px`) and legacy token aliases instead of the scales.

   The workflow that does this is saved and can be resumed:
   `design/../.claude/.../workflows/scripts/sws-app-layer-2-wf_a840a3d4-146.js`
   — re-run it with the `resumeFromRunId` shown in that file's header and the
   completed apps return from cache. Budget roughly 40 minutes per app on this
   two-core box; it is worth running against a bigger machine.

2. **Competitor research for the last 8 apps.** 15 of 23 are done and written up
   in `findings/COMPETITIVE-BRIEF.md` (179 complaints). Outstanding: Wedding
   Timeline, Image Compressor, Signature Maker, QR Maker, Moving Boxes, Packing
   List, Home Inventory, Bill Splitter.

3. **Print review.** The base now ships real print rules and survives
   "background graphics off", but each app's own print layout still wants a
   proof — literally print one and look at it.

4. **Two skins want a second look** now they can be seen in the real app rather
   than the preview: Bracket Maker's gold reads more olive than trophy, and
   Specials Planner's app layer hardcodes a light `header` background that stays
   light in dark mode.

5. **Nothing is committed.** The whole overhaul is one working-tree diff on
   `main`. `git diff` shows everything; `git checkout apps/` reverts the apps
   and leaves `design/` intact.

## Known findings worth acting on

From the completed research and audits:

- **Focus indicators failed WCAG 1.4.11 in both themes across the portfolio.**
  Fixed by construction in the new system.
- **Baby Log's active sleep button was white-on-#60a5fa in dark mode — 2.54:1**,
  unreadable in exactly the condition the app exists for. The skin now emits
  contrast-solved ink for every app-specific fill.
- **Destructive actions have no undo.** Baby Log deletes a timeline entry on one
  tap with no confirm; Import silently replaces the entire log. This pattern
  repeats across apps and is the single most valuable UX fix available.
- **Nobody is ever told their work is saved.** Save is fire-and-forget and only
  speaks on failure.
- **Competitors' free tiers are sales funnels** — greyed-out locked features,
  promo popups inside the logging list, features moved behind a paywall after
  launch. Our promise is the differentiator, and research says users do not
  believe it as grey body copy; it has to look like a stamp.

## Commands

```bash
npm run design:apply     # rebuild tokens and splice into all 23 apps
npm run design:check     # contrast audit, non-zero exit on failure
npm run design:preview   # all 23 skins, screenshotted, both themes
npm run shots -- after   # screenshot the real apps
npm test                 # every app's test suite
node design/icons.mjs    # re-hue icons and regenerate PNGs
node design/hub.mjs      # regenerate apps/index.html
```

## Note on version control

Nothing has been committed. The whole overhaul is one reviewable working-tree
diff on `main`, which seemed the right call for changes made while you were
asleep — `git diff` shows everything, and `git checkout apps/` reverts the
app changes while leaving `design/` in place.
