# HANDOFF.md — Inkbones

**Project:** Inkbones (working title) — a comic book creator where kids draw their own
characters and then keep them, dress them, and pose them forever.
**Origin:** Penny's idea. She asked for two things and insisted both matter equally:
draw a unique character *and* be able to change, dress and move it afterwards.
**Stack:** single-file vanilla HTML/CSS/JS PWA, no build step, mobile-first,
Firebase Hosting / GitHub Pages. No runtime network dependencies.
**Status:** three subsystems proven with benchmarks and renders. Not yet a product.

---

## 1. Read this first — the one design decision everything rests on

There is a faint non-photo-blue armature under the drawing canvas. The child draws
over it. **Because of that, the skeleton is known before a single stroke lands.**

That is the whole trick. Meta's Animated Drawings needs ML to guess where the elbows
are because they're handed a photograph of paper. We are not. Skipping detection means:

- rigging is free — every stroke binds to nearby bones automatically
- library clothing can fit any drawing, because every character normalises to the
  same 15-joint skeleton
- a character is ~4KB of JSON, identical in panel 1 and panel 40, offline, forever
- no API, no model, no server, no inference cost, no per-user compute

**Do not "improve" this by adding pose detection.** The ghost armature is not a
constraint on the child's creativity; it is the thing that buys the dress-up feature.
A paper-import path exists as a planned feature (§9.3) and uses manual dot placement,
not detection.

---

## 2. Market thesis (why this is worth building)

Three camps exist and all three have the same hole in them.

| Camp | Examples | Weakness |
|---|---|---|
| Kid-safe classics | MakeBeliefsComix, Pixton, Storyboard That, Comic Life, Book Creator, Toontastic 3D | Character is picked from a menu, not made. Pixton's flow is: pick background, pick character, pick a face from the Faces tab, pick a pose from the Actions tab. |
| Pro drawing tools | Clip Studio Paint, Krita, MediBang | Powerful, but new users find them hard to navigate. Not a kid's Saturday afternoon. |
| AI wave | Comikaze, KAI, ComicPad, ComicsMaker.ai, Elser | Loudest complaints live here. |

**Ranked pain points from reviews and forums:**

1. **Characters don't stay the same.** Number one issue by a mile. Diffusion models
   restart from random noise every generation with no memory of previous outputs, so
   the hero looks different page to page and the villain's scar switches cheeks. Most
   creators abandon AI comics after a few attempts. The top positive review on
   Comikaze literally opens with *"finally a comic creator where my characters don't
   shapeshift every page."* That sentence is the entire market opportunity.
2. **Paywalls that hit after the work.** Reviewers describe spending an hour on
   character profiles and story prompts, then being unable to do anything with it,
   with a $5/week subscription undisclosed as the only path.
3. **Accounts, load times, cloud dependency.** Pixton reviews cite: requires a
   Pixton.com account, takes forever to load, only one project allowed.
4. **The workarounds cost more than the tool.** ComicsMaker.ai's consistency fix is
   LoRA training — 15-30 images per character, and still uneven across poses and
   angles without it. Not a kid workflow.
5. **Parent worries:** sharing galleries, storage bloat, and whether work can be
   exported as PDF or images at all.

**Our position:** menu tools are consistent but not *yours*; AI tools are yours but
not consistent. Deterministic character identity is nobody's.

---

## 3. Current state

| File | What it is |
|---|---|
| `inkbones-v3.html` | The live prototype. Everything below is in here. |
| `inkbones-v2.html` | Previous version, kept only to compare ink feel. |
| `inkbones.html` | v1. Delete once v3 is in the repo. |
| `harness.js` | Browser stubs so the real HTML file runs in node, unmodified. |
| `test-solver.js` | Deformer benchmark. `node test-solver.js` |
| `sweep.js` | Parameter sweep across deformer configs. |
| `test-fit.js` | Wardrobe fit test across three body types. Writes `fit.json`. |
| `fit.png` | Latest render of the fit sheet. |

**Working in v3:** three modes (Draw / Fit / Pose), body + 2 drawn outfit slots +
3 face slots, 3 library kits, 7 pose presets, 4-panel strip storing pose + wear,
page export to PNG, character save/load as JSON, live perf readout, mesh debug view.

---

## 4. Architecture

### 4.1 Skeleton
15 joints, 14 bones, single parent chain rooted at `hip`.
```
head ← neck ← hip → {lhip → lkne → lank, rhip → rkne → rank}
                neck → {lsho → lelb → lwri, rsho → relb → rwri}
```
World space is a fixed 1000 × 1400 box. `REST0` holds the default armature.
`S.rest` is that armature *as fitted to this child's drawing* (Fit mode edits it).
`S.pose` is the armature right now.

### 4.2 Strokes
```js
{ layer: 'body'|'kit'|'outfit'|'face',
  slot: 0..n,
  z: optional explicit draw order,
  pts: [[x, y, radius], ...],   // centreline, radius per point
  bind: [[boneIndex, weight] x3, ...],  // per point
  cell: [{k, u, v}|null, ...] }  // lattice binding, experimental path only
```
Radius per point is what lets a stroke keep its ink character after deformation.
Draw order: `kit-back(0) → body(1) → kit-front(2) → outfit(3) → face(4)`.

Face strokes bind **only** to the head bone so expressions never smear across
the neck.

### 4.3 Ink
Ported concepts from perfect-freehand rather than the library itself
(offline single-file constraint). Streamline 0.45, thinning 0.62. Pressure comes
from `e.pressure` when `pointerType === 'pen'`, otherwise simulated from speed.
Outline built by offsetting the centreline both ways by the per-point radius, then
round caps drawn as circles at each end. Filled via `Path2D`.

### 4.4 Deformation — linear blend skinning
Per point, weights over the top 3 bones using **inverse-quartic** falloff
`1/(d² + 400)²`. Bone transform is rotation + uniform scale from rest bone to
posed bone. See §5 for why this and not ARAP.

### 4.5 Wardrobe — the differentiator
A garment is **never stored as artwork**. Every point is:
```js
[boneName, t, s, widthMultiplier?, mode?]
```
- `t` — how far along the bone (0 = parent joint, 1 = child joint)
- `s` — how far out sideways, **measured in the wearer's own half-width at that spot**
- `mode: 'e'` — `t` is instead measured in units of the bone's *overhang*, the ink
  that runs past the last joint. This is how boots wrap feet and hats wrap heads.

Instantiating reads a **girth profile** off whatever body was drawn: for each bone,
9 samples along its length, left and right measured separately because hand-drawn
bodies are never symmetric. Plus, for leaf bones only (`lwri`, `rwri`, `lank`,
`rank`, `head`), 4 overhang samples past the tip.

Ownership is **soft**: a point counts for any bone within 1.7× its nearest distance.
This matters — see §8.1.

Kits are regenerated, never saved. `rebuildKits()` runs on leaving Draw mode, so
garments always fit the current drawing.

### 4.6 Panels
A panel stores `{pose, wear:{outfit, face, kit}}` — never pixels. Consequence worth
protecting: **redraw the costume in chapter 3 and every earlier panel updates.**
No competitor can do that.

---

## 5. Measured results — do not relitigate these without rerunning the bench

### 5.1 The deformer question is settled: plain skinning wins

I built the full shape-matching deformer (Müller et al. 2005 — geometric goal
positions instead of elastic energies, overlapping clusters over a grid, no linear
solver) on the theory that ARAP-class deformation was needed to stop elbows pinching.
**The benchmark says no.**

```
                      joint width      limb area
                     skin  relaxed    skin  relaxed   ms
anchor .55/.92        97%     59%      87%     72%   65
anchor .45/.70        97%     79%      87%     78%   41
anchor .35/.60        97%     90%      87%     81%   45
finer lattice c22     97%     82%      87%     79%   46
```

Skinning wins every config on every metric, for free. The relaxer costs 40-65ms/frame
and never once beat it.

**Why the reasoning was wrong:** Meta needs ARAP because they deform a *textured mesh
recovered from a photograph* with guessed joints. We deform *vector line art with
known bones*. Line art has no interior, so there is no visible volume to preserve and
nothing for a volume-preserving solver to win back. Different problem class.

**The real bug the first bench found was the binding, not the deformer.** Original
inverse-square weights with a soft epsilon spread each point across three bones, so a
wide torso contour passing near the shoulder got half-owned by the arm. Switching to
inverse-quartic with a tight epsilon took limbs from 67-95% up to 97-102% and made
left/right symmetric, which they had not been.

The relaxer stays behind the **Relax** toggle, off by default, with this result written
into the source as a comment. **Re-run the bench before trusting it — and expect the
answer to change once shapes carry fills**, because then there *is* an interior.

### 5.2 Determinism
Two solves of the same pose drift `0.0e+0 px`. The "byte-identical in panel 1 and
panel 40" promise holds literally.

### 5.3 Wardrobe fit
Three kits × three body types (stick / potato / lopsided), one definition each, no
per-body authoring. See `fit.png`. Boots and gloves wrap drawn hands and feet; the
stick figure has no feet drawn at all and degrades to a small bootie rather than
collapsing (floor is 12-16% of bone length).

---

## 6. Dependency dossier

The stack constraint shapes this more than quality does. A CDN `<script>` tag is a
runtime network dependency that breaks the app offline. **"Piggyback" here means port
small permissive algorithms inline, not add dependencies.**

### Take — inline the algorithm
| Thing | Licence | Note |
|---|---|---|
| **perfect-freehand** (steveruizok) | MIT (confirmed on repo) | `getStroke` → outline polygon. Options: size, thinning, smoothing, streamline, simulatePressure, start/end taper. Renders via `Path2D`. ~300 lines, no deps. Concepts already ported; port the real thing if ink feel needs work. |
| **AnimatedDrawings** (Meta) | MIT — code, model weights *and* the 178k-drawing dataset | Reference for the ARAP port and for the annotation UX. Note: the hosted demo is non-commercial; the MIT code is not. Dataset annotations are bounding box, segmentation mask, joint locations — deliberately trained to *preserve* wonky proportions rather than correct them. |
| **ARAP** (Igarashi 2005) | Paper, not code | Two-step closed-form, real-time on 2D. Only if fills land (§5.1). |
| **ImageTracer.js** | **Unlicense / public domain** | Raster→SVG in-browser. The paper-import path (§9.3). |

### Read, don't take
| Thing | Licence | Why not |
|---|---|---|
| **Monster Mash** (Google) | Apache-2.0 | C++ → WASM. Proves browser posing works on touch and stylus, exports glTF. Wrong shape for a no-build single file. |
| **Potrace** | **GPL-2.0-or-later** | Better tracer than ImageTracer, but GPL is a licensing landmine for a proprietary app. Use ImageTracer unless the whole app goes GPL. |

### Assets — clear to ship
- **Open Peeps** — CC0, no attribution. Closest fit by far: black-and-white hand-drawn,
  modular across heads/faces/bodies/clothing/accessories, on a unified vector grid.
  Pre-load outfit slots from these.
- **Humaaans** — CC0.
- **publicdomainvectors / freesvg** — public domain speech balloons, KAPOW bursts.

### Do NOT ship
- **Blambot fonts.** This one would have bitten us. Their free fonts allow non-profit
  print use or flattening into web graphics, and an indie clause lets small-press
  comic *creators* use them commercially. But **webfont use and embedding both require
  a paid licence**, and the free clause explicitly does not extend to uses other than
  comic book creation. An app that embeds a font for kids to letter with is embedding.
  Use OFL faces from Google Fonts (Bangers, Comic Neue, Patrick Hand, Caveat) or
  license Blambot properly.

### Still to evaluate
`idb-keyval` (tiny, MIT) for IndexedDB character library; `JSZip` for `.cbz` export
(a CBZ is just a zip of page images — cheap win, opens in every comic reader);
`jsPDF` for PDF pages; `Delaunator` (ISC, Mapbox) only if ARAP is revived.

---

## 7. Compliance — this is a strategic asset, not a chore

New COPPA amendments took effect with an **April 22, 2026** deadline: expanded
definition of personal information including persistent device identifiers used for
profiling, separate verifiable parental consent before sharing a child's data with
third parties, mandatory retention and deletion timelines. Third-party SDK liability
is now direct. Penalties can exceed $50,000 per violation; Disney settled for $10M in
December 2025.

Critically for us: **Apple's rule 17.4 explicitly lists "drawings" as personal
information when collected from a minor.** A comic app with a sharing gallery is
squarely inside COPPA.

**An app that collects nothing eliminates this liability category entirely.**
Inkbones is fully local by construction. Protect that:

- no accounts, no analytics SDK, no ad network, no telemetry
- characters and pages stay on device; sharing is the user exporting a file themselves
- if a gallery is ever added, it is a separate product with its own legal review
- kids' apps still need a privacy policy even when they collect nothing (Apple 24.1)
- behavioural advertising is banned outright in the kids category (Apple 24.2)

Not legal advice; get a real review before an App Store submission.

---

## 8. Known defects, ranked

### 8.1 Arm bleed (real, unfixed)
Soft bone ownership at 1.7× is what fixed the skinny-torso bug, but it cuts both ways:
on the lopsided test figure the raised arm passes near the head and inflates the head's
girth on that side, so the hood renders asymmetric. Same mechanism widens the torso
where a fat arm hangs.

**Do not fix by tightening the ratio** — that reintroduces the wide-torso collapse.
The fix is directional: reject a point for bone *b* if the segment from the point to
*b*'s centreline crosses another bone's territory. That is a visibility test and it is
real work, not a constant to tune.

### 8.2 The 4-panel strip is doing two jobs
Playground *and* page layout. Needs to split into a proper page editor with variable
panel shapes.

### 8.3 Garment design numbers
Hero belt height and cape hem shape are hand-tuned constants that look right on the
three test bodies and may not generalise. Cheap to adjust, but there is no test for
"looks good", only for "fits".

### 8.4 No colour, no fills
Everything is black line art. This is why the deformer question came out the way it
did (§5.1). Adding fills is a design decision that also reopens a settled technical one.

---

## 9. Roadmap, in priority order

### 9.1 Repo shape (do first)
Split the single file into a source folder that *builds by concatenation only* — no
bundler, no transpile, cat-and-ship — so the deployed artefact stays a single file
while the source is navigable. Suggested: `skeleton.js`, `ink.js`, `skin.js`,
`girth.js`, `kits.js`, `ui.js`, `panels.js`, `io.js`.

### 9.2 Directional ownership test
Fixes §8.1. Acceptance: `node test-fit.js` render shows a symmetric hood on the
lopsided body while the potato body keeps its correctly wide cape.

### 9.3 Paper path
Photograph a drawing → threshold → ImageTracer to vector → child drags 15 dots onto
the joints → same rig, same everything. This is Meta's annotation step done by hand in
about 15 seconds, and it makes Grandma's fridge drawings playable. **Unproven — this is
the next real risk.** Everything built so far assumes ink was born inside the app.

### 9.4 Character library
Multiple characters, IndexedDB, a roster. Then multiple characters per panel, which
needs per-character placement transform (position, scale, flip) on top of pose.

### 9.5 Comic furniture
Speech balloons with tails, KAPOW bursts, panel borders, gutters, lettering with OFL
fonts. Balloons should anchor to a character so they follow when a pose changes.

### 9.6 Page editor
Variable panel grids, then `.cbz` and PDF export.

### 9.7 Open Peeps ingestion
Script to convert Open Peeps SVG components into bone-space kit definitions. This is
the one that turns three kits into hundreds.

---

## 10. Conventions for this Codespace

- **No build step.** Ship one HTML file. Concatenation is allowed; transpilation is not.
- **No runtime network calls.** Google Fonts links are the sole exception and must
  degrade gracefully (font stacks already have fallbacks).
- **No `localStorage`/`sessionStorage` inside Claude.ai artifacts.** In the deployed
  PWA, IndexedDB is fine.
- **Mobile-first, portrait, touch.** `touch-action: none` on the canvas, pointer
  events only, safe-area insets respected. Stephen works primarily from his phone.
- **Design language:** bristol board `#F2F1EC`, ink `#14120F`, non-photo blue
  `#6FB7DC` (real comic artists pencil in non-photo blue then ink over it — that's
  where the ghost armature colour comes from), process magenta `#E0218A` for
  registration marks and focus rings. Bangers for display, Space Mono for utility
  labels. Registration corner marks on the stage are the signature element.
- **Every claim gets a test.** The harness runs the *real shipping file* in node with
  stubbed browser APIs, so tests never drift from a reimplementation. Add to it rather
  than around it.
- **Visual changes get rendered and looked at.** `node test-fit.js` writes `fit.json`;
  render it with Pillow (`convert` has no rsvg delegate in this container, so draw
  polygons directly with `ImageDraw.polygon`). Two separate bugs in this project were
  invisible in the numbers and obvious in the picture.

---

## 11. Quick start for the next session

```bash
node test-solver.js   # deformer bench + determinism check
node sweep.js         # parameter sweep
node test-fit.js      # wardrobe fit across 3 body types → fit.json
```

Open `inkbones-v3.html` on a phone. Draw over the blue figure, switch to Pose, hit
Curl, then cycle the kits. That is the whole thesis in about twenty seconds.
