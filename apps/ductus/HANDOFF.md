# DUCTUS in the Sky Wolf Studio, build notes (Claude Code, 8 Nov 2026)

Live at https://skywolfstudio.com/ductus/ once the hosting line runs (studio hub: Pen & Paper, a new category, tagged beta). Built from Stephen's v3 drop below (ductus-v3.zip, 8 Nov 16:00).

- Source stays split: `src/engine.js` (pure logic, DOM free) + `src/template.html` (UI); `node apps/ductus/src/build.mjs` inlines the engine and stamps the build tag into `index.html`. `src/` is in firebase.json's hosting ignore. Bump BUILD there and CACHE in `sw.js` together.
- Studio head (canonical, theme colour, description, icon.svg, apple touch icon, manifest, Open Graph and Twitter with marketing/og-1200x630.jpg), the studio foot on every tab (hub link, Privacy, Feedback) and the build tag `ductus-v1`.
- Service worker on the Saccade pattern (assets precached, the page network first with a 3.5 s timeout, only this app's old caches swept). `manifest.webmanifest` has a share target: text shared into the installed app lands in Write (on the device) and the URL is cleaned.
- House rules applied: no em or en dash anywhere in the built page (the build fails on one), viewport zoom allowed, copy at 15 px and up where it was 13 to 14, every button at least 44 px tall, picker keys 44, swatches 36. The look is Stephen's own (ink on paper, rubric red), not a studio skin; its accent sits in `design/hub.mjs`.
- Art: placeholders rendered by the engine itself from one seeded hand ("Qikqian hand", SEED 41): `src/art.mjs` draws the masters (marketing/masters/), `src/art-sizes.py` cuts the icons, the 512 thumb and the 1200x630 card, `src/icon-svg.mjs` writes icon.svg. Measured, never opened. Astra art owed, as with Saccade.
- Tests: `test/engine.mjs` (uniqueness, bounds, NaN, determinism, hand code round trip, garbage decode, TrueType magic for all three pens, the built page carries the engine, no dashes, tag and CACHE agree) and `test/smoke.browser.mjs` (real pointer strokes in the three boxes, forge, alphabet ink, font bytes, a note, today's puzzle with 26 keys, Scribe, the foot, no overflow, 44 px buttons, the worker, zero page errors). Both green 8 Nov. The handoff's Playwright shot scripts were not carried (no Playwright browser on this box); the smoke test covers their walk.
- Nothing here phones home: no analytics, no Sunbeam SDK (that is the arcade's currency, this is the studio).

The original handoff follows.

---

# DUCTUS — HANDOFF

**What it is.** Draw three letters of an alphabet that doesn't exist; DUCTUS grows the rest (A–Z, 0–9, punctuation) in the style of your hand, lets you write in it, ages it through centuries of cursive drift, exports a real installable `.ttf`, and wraps it in three games. Single-file vanilla HTML/CSS/JS, mobile-first, no build step, no network calls, no dependencies. 88 KB.

**Status.** v3, working end-to-end on phone and desktop. Tested headlessly with Playwright (scripts included). Published privately at `https://claude.ai/artifact/CM95jbwP621tSuB6X2pWRS`.

---

## Files

| File | Role |
|---|---|
| `ductus.html` | **The deliverable.** Built from the two files below; deploy this. |
| `engine.js` | Pure logic, no DOM: analysis, generation, rendering, hand codes, TTF writer. Runs in node (`require`) and browser (`window.Ductus`). |
| `template.html` | UI + app logic. Contains `/*__ENGINE__*/` where `engine.js` is inlined. |
| `build.js` | `node build.js` → writes `ductus.html`. That's the whole build. |
| `test.js`, `test2.js` | Node sanity tests: uniqueness, bounds, NaN, hand-code round trip, font bytes. |
| `shot.js`, `shot2.js`, `shot3.js` | Playwright walkthroughs (Forge→Alphabet→Write→exports; Play solo/duel/codes/font; Scribe). Write PNGs into `shots/`. |
| `fontcheck.py`, `fontshot.js` | Validate the `.ttf` with fontTools + Pillow; render it in Chrome via `@font-face`. |

Dev loop: edit `engine.js` / `template.html` → `node build.js` → `node shot.js` (or open `ductus.html`). Any page error fails the shot scripts with "PAGEERROR".

---

## Architecture

### 1. Analysis — `analyzeDoodle(strokes)`
Each forge box is one "imagined letter" = array of strokes = arrays of `[x,y]`.
- Normalize the doodle's bbox to a unit square (aspect preserved, centered).
- Per stroke: resample to 40 pts → Ramer–Douglas–Peucker (ε 0.13) → snap vertices to a **3×4 anchor grid** (`NX=[.14,.5,.86]`, `NY=[.06,.353,.647,.94]`).
- Per segment: signed max perpendicular deviation ÷ chord = **bulge** ∈ [-0.5, 0.5]. This is how curves survive quantization.
- Tiny strokes (extent < 0.09) become **dots**.
- Script-level features (`feats`): `spg` strokes/glyph, `nodesPer` complexity, `curv`, `slant` (from near-vertical segments), `angular` (sharp-corner ratio), `dotRate`.

### 2. Generation — `makeScript(doodles, seed)`
- Primitives = the user's quantized strokes (+ 3 invented strokes so tiny inputs still vary).
- Each glyph: k strokes (k ~ `spg`), each a **mutated primitive** (mirror X/Y with bulge sign flip, shift, truncate, extend, swap a node, flip bulges). Second+ strokes are **attached** (translated until within Chebyshev distance ≤1 of an existing stroke) so letters are connected shapes, not fragments.
- Rejection sampling (up to 500 tries): node-set signature must be unique; complexity within `nodesPer ± window`; at most 2 bare lines and 8 short (x-height) glyphs per alphabet; no flat dashes.
- Deterministic from `(doodles, seed)`. `recastGlyph(script, ch)` re-rolls one letter keeping the rest.
- Punctuation `. , ! - ' :` are fixed shapes; `?` is generated.
- Name: seeded syllable generator (`makeName`). Traits: `describe(feats)`.

### 3. Rendering — `glyphPaths`, `drawPaths`, `layout`, `renderText`, `drawGlyph`
- Glyph → polylines in unit space: quadratic bezier per segment with control offset = 2·bulge·chord.
- **Age** (0–1): ≥0.34 the pen stops lifting inside a letter (strokes concatenated); Chaikin smoothing iterations = ⌊age·3.2⌋; slant += age·0.14; ≥0.68 letters in a word are **joined** with an under-swoop (in `layout`).
- Pens: `round` (constant), `broad` (width = f(stroke angle − 35° nib)), `brush` (tapered ends). `segWidth()` is the single source of truth for both canvas and font.
- Layout is proportional: advance = ink width + gap; `opts.gap`, `opts.space`, `opts.lineH` tune it (the puzzle board uses wider spacing).

### 4. Hand codes — `encodeScript` / `decodeScript`
`DUCTUS1|feats|glyphs|prims|invented|name`. Node = 1 char (col·4+row in base-12), bulge = 1 char (11 levels), strokes `.`-joined, glyphs `,`-joined. ~500 chars. Round-trip is lossless for nodes; bulges quantize to 0.1. Returns `null` on anything malformed.

### 5. Font — `buildFont(script, style, familyName)` → `Uint8Array` (TrueType)
Hand-rolled writer, tables: `OS/2 cmap(4) glyf head hhea hmtx loca(long) maxp name post(3)`. 1000 UPM, cap height 880. Each stroke → overlapping **trapezoids + round joints/caps** as clockwise contours (nonzero fill unions them). Pieces are extended 35% of width past their ends to kill antialiasing seams. Glyph order: `.notdef, space, A–Z, 0–9, . , ! - ' : ?`; lowercase maps to the same glyphs. Validated with fontTools (parses, recompiles) and rendered in Chrome 18–96 px.
Known: outlines overlap heavily (fine for renderers, font editors will warn); no kerning; no hinting; `created/modified` timestamps are 0.

### 6. UI (`template.html`)
Tabs: **Forge** (3 draw boxes, Surprise me, import hand code) · **Alphabet** (grid, tap-to-recast, Age/Slant/Weight, pen, decoder key, font export, hand code, rename, reforge) · **Write** (live note, ink/paper, key-under-letters, card exports) · **Play**.
Play modes:
- **Decipher** — cryptogram in a fresh random hand. Daily puzzle seeded from the date (same for everyone), or random. Tap glyph → pick letter; all matching glyphs fill. 3 hints (reveal most-frequent unsolved letter, locked in red), frequency counts, timer. Score `1000 − 3·sec − 120·hint − 80·wrong`. Brag card export.
- **Pass & play** — type a secret, cover screen, hand over; hints 0–5; "stranger's hand" or your own (a reading test).
- **Scribe** — copy the shown glyph; scored by symmetric **Chamfer distance** on bbox-normalized, 0.02-densified polylines, minus 8/stroke-count mismatch. ≥70 = mastered; unmastered letters are drawn 80% of the time; red ghost of the true glyph is fitted to your attempt after a check.
State: one `localStorage` key `ductus.v1` (doodles, script, style, text, play stats, scribe mastery).

Exports work three ways: native Web Share when available, `<a download>` on your own hosting, and inside the claude.ai artifact viewer via its `downloads` capability (`window.claude.use('downloads')`). Long-press-the-image is the universal fallback for PNGs.

---

## Gotchas we hit (so you don't)
- The global `button{min-width:120px;flex:1}` rule bit us three times (box clear ×, tab bar, segmented control). Any new button inside a tight container needs `min-width:0`.
- `$$('.box')` must be scoped to `.boxes .box` — Scribe reuses the `.box` class.
- Fonts: without the end-extension on trapezoids, FreeType shows hairline seams at small sizes. Pillow's autohinter still speckles; browsers are clean.
- Pointer events: canvases need `touch-action:none` and `setPointerCapture`, or iOS scrolls mid-stroke.
- The artifact viewer blocks `alert/confirm`, `window.print`, Web Share, plain downloads, and `#key=value` hashes.

## Roadmap (ordered by payoff)
1. **PWA shell** — manifest + service worker + icon (your usual scaffold). Everything is already offline-capable.
2. **Lineage** — letters drift each time they're written; the user picks which variant survives. The Age machinery (merge → smooth → join) is the mutation operator; store a family tree of hand codes.
3. **GM pack** — three hands per campaign (common / priestly / thieves'), weathered-paper export, map-label sheet. Target r/neography and tabletop handouts.
4. **Classroom kit** — print toggle for key-on/key-off worksheets; spelling list in the class hand.
5. **Daily leaderboard** — puzzle is already deterministic by date; one Firebase collection of `{date, score, handName}`.
6. **Font polish** — merge overlapping contours (a polygon-union pass) so font editors stop warning; optional kerning from glyph bboxes; lowercase as 0.72× x-height variants.
7. **Scribe → words** — after 70% mastery, drill words then timed sentences; export a "diploma" card.
8. **Recognition** — the Chamfer scorer can also *read* handwriting in the user's own script (nearest glyph). That unlocks "write a note by hand, app transcribes it".

## One-liners for the team
- Everything deterministic is seeded (`rng = mulberry32`); keep it that way so daily puzzles stay shared.
- Never put the user's own hand in Decipher puzzles — the key is one tab away.
- Keep `engine.js` DOM-free; it's what makes node tests and the font writer possible.
