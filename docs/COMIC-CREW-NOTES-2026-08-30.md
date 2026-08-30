# Comic Crew, notes, 2026-08-30

App 36. A comic maker where a child draws their own character once and then
keeps it: dresses it, moves it, gives it something to say, and prints the page.

Arrived as a prototype in a handoff zip. This is what was true about it, what
was wrong with it, and what shipped.

Source as received, plus the renders that condemned it, is archived in
`docs/archive/comic-crew/`. The zips are gitignored, so anything only in one dies
with the codespace.

---

## 1. The idea, which is correct and must be protected

A faint non photo blue armature sits under the drawing canvas. The child draws
over it. Because of that **the skeleton is known before a single stroke lands.**

That one decision buys everything else. Rigging is free, because every stroke
binds to nearby bones automatically. Library clothing fits any drawing, because
every character normalises to the same fifteen joints. A character is a few
kilobytes of coordinates and angles, identical in panel one and panel forty,
offline, with no model, no server and no inference cost.

Meta's Animated Drawings needs machine learning to guess where the elbows are
because it is handed a photograph of paper. We are not.

**Do not "improve" this by adding pose detection.** The guide is not a limit on
what a child can draw. It is the thing that buys the dressing up.

---

## 2. What was actually wrong with the prototype

The handoff was unusually good and its architecture survived almost intact. Its
*numbers* did not.

**Four of the seven pose presets rendered a child's drawing as an unrecognisable
knot, including the one the handoff told you to demo.** The bench reported
"worst limb 87%". Running the same bench unmodified printed `torso 27%` for Run
and `32%` for Walk. The headline was an average across limbs and the torso was
the one row that had collapsed. An average is how that hid.

Three separate causes, each confirmed against running code and each visible in a
render before it was visible in a number:

1. **Every pose preset rotated one joint too high.** `rotAbout(J, j, deg)` pivots
   about `PARENT[j]`, so `['lsho', -46]` swung the collarbone about the neck and
   dragged the shoulder joint 80 to 190 px across a 1400 px page, instead of
   swinging the upper arm about the shoulder. Every entry in the table named the
   parent of the joint it meant.

2. **The torso contour was owned by the arm and leg bones, not the spine.** The
   falloff `1/(d^2+400)^2` is scale free, and bones are not. A 102 px collarbone
   stub lying inside a wide chest out scored the 360 px spine running through it,
   so the chest belonged to the arm and left with it.

3. **The drawn head outline was not rigid.** Only `layer === 'face'` bound to the
   head bone alone. The head circle a child draws is a body stroke, so it blended
   across the neck and shoulders and squashed visibly flat under Run and Jump.

Beyond the rig: nothing was persisted at all, so closing the tab destroyed the
work; Save silently omitted the panels it appeared to save; "Clear layer" wiped
the whole character on one tap with no undo; a resting palm orphaned a stroke and
made every later export throw; a wrong file mutated the skeleton before validating
and left every control dead; and a panel stored absolute joint positions, so one
nudge in Fit silently rewrote every panel already drawn.

---

## 3. What fixed the rig

Measured on the bench fixture, per limb, never averaged.

| pose | torso before | torso after | worst limb after |
|---|---|---|---|
| Standing | 100% | 100% | 100% |
| Walking | 32% | 100% | 100% |
| Running | 27% | 100% | 95% |
| Jumping | 109% | 101% | 100% |
| Waving | n/a | 101% | 99% |
| Pointing | n/a | 100% | 100% |
| Thinking | new | 101% | 98% |
| Scared | new | 100% | 87% |
| Big cheer | new | 101% | 98% |

Determinism drift is exactly 0.0 px, unchanged.

Three changes that stuck, and one that did not:

**Ownership is scored in bone space, divided by bone length.** A bone claims a
slab proportional to its own size, so the 102 px collarbone stub lying inside a
wide chest can no longer outbid the 360 px spine running through it. Distance
running past a bone's ends is charged at three times, because out there the next
bone along is the real owner, which is what stops the leg chain owning the bottom
corner of the torso. Leaf tips are exempt, since ink past a wrist, an ankle or
the crown of the head has no next bone to belong to. The falloff is
`1/(u*u+EPS)^4`: a square leaves the arm 28% of the chest contour and creases the
torso under Waving, the fourth power leaves it 13%. Measured, not picked.

**Garments bind to the bone they were authored on.** This is the one that matters
most and it is an architecture fix, not a constant. A garment point is already
`[boneName, t, s]`: it knows its bone. Rediscovering that from position throws
the answer away and gets it wrong, because a cape hanging behind an arm genuinely
*is* nearest the arm. Before this, capes flew up whenever the arms did.
`rebuildKits` now records the authored bone per point and `bindStroke` uses it.

**The girth pass keeps two ownership tests, because it asks a different
question.** The pixel ratio at 1.7 stays exactly as the prototype's handoff warns,
because that is the test that keeps a wide torso wide. A bone space test is added
beside it, and that is the one that stops a raised arm inflating the head so the
hood comes out lopsided. Ink straddling a bone's axis now counts for both sides:
one sided bookkeeping left the far flank unmeasured and the gap filler then
invented a different width for each side of a symmetric head.

There was a fourth change that did not survive. Giving the collarbone a fifth of
any arm swing, on the theory that a shoulder moving with the arm would stop the
ink they share being pulled two ways, did lift the worst upper arm from 70% to
81%. But that was only true while the ownership underneath it was still wrong.
Once a bone's reach was measured in its own lengths the shrug stopped paying: it
cost five points of torso accuracy and drew a visibly cone shaped chest under any
arms up pose. It was rendered, looked at, and removed. If it comes back, render
Big cheer and look at the shoulders before keeping it.

The head outline is now rigid, and its reach is measured off the ink the head
bone already owns rather than assumed from a radius, so a pea head and a pumpkin
head both work.

A panel stores a rig, never pixels: a root offset plus, per bone, the similarity
carrying the rest bone onto the posed bone, kept as `(cos*s, sin*s)`. No trig
anywhere, so the round trip is exact to the last bit and a re-fitted bone keeps
its new length in every panel already drawn.

Every pose preset was re-authored and **rendered and looked at** before being
kept. Walking, Running, Jumping and Scared were chosen from twelve candidates
side by side. Three separate changes passed the numbers before a picture caught
them: a torso that grew 25% instead of collapsing, a cape that followed a raised
arm, and the shoulder shrug above.

---

## 4. What is new in the app

- **Draw / Dress up / Move.** Fit is out of the child's mode row and lives behind
  the grown ups sheet. The intended flow is that the child draws over the guide,
  so the skeleton already matches and Fit is a no op. It occupied the button a
  child is most likely to read as "where the clothes are".
- **You are always working on a panel.** The stage *is* panel N. Tapping a panel
  selects it, everything you change goes straight into it, and thumbnails redraw
  from data so they can never disagree with the export. A new panel keeps wearing
  whatever the last one was wearing.
- **Speech balloons**, three shapes, with the tail anchored to a **joint** so it
  keeps pointing at the mouth when the pose changes. Nothing else in this category
  can do that, because nothing else knows where the mouth is.
- **Nothing is lost.** Everything persists to `localStorage` under one key,
  debounced, plus on `pagehide` and `visibilitychange`, never mid stroke.
- **One undo for everything.** A snapshot goes on the stack before any change a
  child could regret, so Undo works on drawing, rubbing out, posing, dressing,
  balloons and starting over. Making a thing reversible beats asking a child to
  confirm it, which only teaches her to tap through dialogs.
- **A palm is not a stroke.** A second pointer cancels the stroke in progress and
  removes the stray mark, then becomes a pinch.
- **Pinch to zoom and two finger pan**, because the head is 34 css px on a phone
  and faces are undrawable without it.
- **Print, Send and Save picture**, in that order. Printing is the one that ends
  up on the fridge.
- **No watermark on a child's page.** Music Studio's precedent was deliberately
  not carried across, see the open questions.
- Rubbing out, naming the character, hiding the blue guide, and a rig that no
  longer draws a stick through the face.

---

## 5. Tests, and how to trust them

    node design/test-all.mjs comic-crew

- `test/rig.mjs`, 180 checks. The bench, per limb, with a floor **and a ceiling**:
  a torso that balloons 25% is as wrong as one that collapses, and only checking
  the floor is how the shoulder carry could have gone unnoticed. Also determinism
  exactly zero, pose storage surviving a Fit edit, clothes on four body types
  including a single line drawing, the character file round tripping, junk files
  being rejected without touching state, and the house rules.
- `test/smoke.browser.mjs`, 92 checks in a real browser. Draw, palm, costume
  carrying between panels, balloons, the exported page having ink on it, surviving
  a reload, a wrong file changing nothing, 44 px targets, no sideways scroll at
  414 and 320, and **offline**: the worker activates, the network is unplugged,
  the app reloads, the lettering face is still there and the privacy page is
  still cached.
- `test/a11y.browser.mjs`, 18 checks. axe in six states in both colour schemes.
  This exists as its own file because `design/a11y.mjs` builds its slug list from
  `design/skins.mjs`, and Comic Crew is deliberately not in skins.mjs, so the fleet
  run will never open this app.
- `test/lib/stub.mjs` runs the **real shipping index.html** in node. It is in
  `lib/` because `test-all.mjs` runs every `.mjs` directly inside `test/`.

**The head is only rigid because of a bug found this way.** `isHead` decides
whether a stroke rides the head bone alone, using a reach measured off the ink
the head bone already owns. That reach was measured only inside `bindAll`, and
the drawing path never calls `bindAll`: it binds the one stroke that just ended.
So in the shipping app the reach sat at its floor forever, `isHead` returned
false for every head a child drew, and the whole mechanism was dead code. The
node bench never saw it, because a bench binds a finished figure in one go. The
head still looked right, because the ownership model alone gives a drawn head
circle 99.6% head bone weight, which is why nothing looked wrong in any render.
The reach is now re-measured on every pen lift, and the whole drawing is only
re-bound when it actually moves, because re-binding two hundred strokes costs
tens of milliseconds on a tablet and would otherwise be paid on every line.

`isHead` also asks ownership, not just the reach. The reach grows to fit
whatever the head bone owns, so one tall pigtail pushes it out past the
shoulders, and then a short shoulder stroke sits inside it and gets welded to
the head.

**Every check above was run against reverted code and had to fail with the
reported symptom before it was kept.** Palm rejection off: two checks fail.
Persistence off: the reload check fails. The balloon font fix reverted: the bubble
comes out 192 px wide instead of 453. Costume inheritance off: two checks fail.
The worker's cache declared with `var`: the rig check fails. A font dropped from
the worker's asset list: the offline check fails.

One of those was found this way rather than by reasoning: the balloon was being
**measured before its font was set**, so every bubble was sized for the browser
default of ten pixels and the lettering spilled straight out of it. The node stub
now scales `measureText` by the font actually set, so that class of bug fails in
node too instead of only in a screenshot.

**Three tests in this session passed for the wrong reason before they were
right, and each one was only caught by checking its premise rather than its
result.** The first garment test measured the whole costume's bounding box,
which grows legitimately because gloves and boots are authored on wrists and
ankles and are supposed to travel with the limb; it failed against correct code.
The pigtail test drew pigtails too short to actually push the head's reach past
the shoulders, so it proved nothing. And its finder matched on a stroke's start
point alone, which the left arm also shares, so it was quietly measuring the arm.
The lesson worth keeping: assert the SETUP as well as the outcome. Every one of
those now checks that the condition it depends on is really true before checking
the thing it cares about.

---

## 5b. What an adversarial review of the finished app then found

Four lenses over the shipped app, ten findings confirmed by a second pass and
none refuted. All ten are fixed and each has a test that fails without its fix.
Two were blocking and neither was reachable from anything the suite touched.

**The drawing area collapsed on a small phone.** Measured cold: 320x568 gave a
stage 296x11 with 8 px of paper; a phone turned sideways gave zero. The rails,
the costume grid and the filmstrip are all content sized and they ate the page.
The stage now has a floor and the controls scroll instead, with a landscape
layout that puts the paper down the left. Now 186 px of paper on an iPhone SE
and 230 px sideways. The 320 px case was already in the suite: it checked
sideways overflow and card widths, and never checked that there was anywhere to
draw.

**Zooming in and changing mode could black out the canvas.** Every mode change
resizes the stage, and the pan a child made for the old box was never re clamped
for the new one, so the page could end up entirely outside the canvas: black
drawing area, character still visible in every thumbnail, no control that says
put it back. The clamp is now called whenever the box changes, and it centres a
small page instead of zeroing its offset, which was separately jamming the page
against one edge at a gentle 1.25 pinch. Nothing in the suite touched zoom at
all, which is why both shipped green.

**A drawing made off the guide was silently destroyed by the first pose.**
Thirty world units of drift, about nine millimetres on a phone, already pulls an
arm off the body, and Fit lives behind the grown ups sheet where no child will
find it. Leaving Draw now measures the drift by closest point and brings the
bones to the child. Closest point, not a centroid: a centroid reads seventy
units out on a correctly traced potato and would move the bones off a drawing
that was never wrong. The test brackets it from both sides, and reverting to a
centroid fails six checks by false firing.

**Four ways a child's work could still be lost, all now closed.** A failed write
was silent, so a private window or a full origin lost everything with no word to
anybody: there is now a warning bar with a Save to a file button. A record this
build could not read was destroyed by the first stroke: it is moved aside to
`comic-crew.character.unreadable` instead. Closing the tab mid stroke threw the
stroke away, because the guard against writing mid stroke had no next time on
`pagehide`. And an idle second tab laid its stale copy over another tab's hour of
work on close: a tab that has changed nothing now never writes, and one with no
unsaved changes adopts what another tab saved.

**Rubbing out demanded a tap accurate to two pixels.** The hit test asked whether
the finger was inside the filled outline, which on a phone is about three screen
pixels wide, so most taps were told to try again. It now forgives sixteen css
pixels, converted through the current zoom so it is a fingertip on every screen
and shrinks when a child zooms in to pick one eyelash out of a face.

### The other twenty seven

The review passed thirty seven lower severity findings through unverified. They
were worked afterwards. The ones worth naming:

- **Undo could spend itself on nothing.** A snapshot was taken optimistically on
  every pointerdown, so a tap on a joint that never moved, and a palm the app
  had deliberately rejected, both left a dead entry. The first Undo did nothing
  and the second took away real work. A gesture now snapshots before it starts
  and keeps the snapshot only if something actually changed, and `mark` refuses
  a snapshot identical to the one already on top.
- **The live stroke was held by its position in the array.** Rail and mode
  buttons sit outside the canvas, so they never reach the pointer handlers and
  can fire with a finger still down. `rebuildKits` and `load` both rewrite
  `S.strokes`, and the in progress stroke then pointed at whatever had taken its
  index, which welded a child's line onto a costume. It is held by object now,
  and both those functions abandon a live drag on the way in.
- **Ink could land where it could never be seen.** Two fifths of the canvas is
  not the paper, and black ink on the dark shell out there measures 1.06 to 1
  against its background, then gets cropped out of the printed page. Drawing off
  the paper is refused with a word about why, and points are clamped inside it.
- **Joints needed a tap accurate to ten pixels**, and a near miss caught the neck
  and swung the whole upper body. The reach is a fingertip now, the ends of the
  chain are preferred over the joints above them, and nothing rotates until the
  finger has actually travelled.
- **Drawing the character onto a clothes layer locked the app.** Tapping Clothes
  first, out of curiosity, then drawing the whole figure there, left Dress up and
  Move refusing to open with a hint that never said why. Clothes and faces now
  need somebody to put them on, and say so.
- **A long sentence broke out of its bubble** and lost its top line off the page,
  because only the centre was clamped and the box grows around it. And a word
  longer than the bubble set the bubble's width to itself. Both fixed.
- **Add words jumped a child into another screen**, so her drawing was suddenly
  covered in fifteen joint dots she had not asked for. It stays where she is.
- **The printed page framed empty boxes.** One drawing came out as one panel and
  three empty rectangles. The page is now laid out for the panels that exist:
  one, two stacked, one wide over two, or a square of four.
- **Six taps on blank paper counted as a person**, and the costumes then rendered
  on nothing. It asks for something the size of a person instead.
- **The format field was written on every save and never read**, so a file from a
  later build would have been loaded as best it could and written back in this
  build's shape, quietly dropping whatever was new. It is checked, and
  `comic-crew/3` still opens.
- **Rubbing out demanded two pixels of accuracy** and the storage layer had four
  separate ways to lose work. Both covered above.
- Coordinates were stored at full double precision, three characters for every
  one that means anything; they round to a tenth of a unit, which is a quarter
  of a pixel at the deepest zoom. The undo stack held forty whole copies of the
  document, twenty six megabytes on a full drawing; it is bounded by bytes now.
- The service worker cached failures over the working offline copy, so a 500 or
  a captive portal would have left the app broken after the network came back.
- The app had no way back to the studio and no address to complain to, and three
  links in the grown ups sheet were eighteen pixels tall while `privacy.html`
  states in writing that every control is at least forty four.

**Three findings did not survive checking, and are recorded here so nobody
spends the time again.** Costumes were said to be sized to the guide skeleton
rather than the drawing: rendering a normal, a big and a huge head shows every
hat and hood scaling with the drawn head, so the girth profile is doing its job.
The hand typeface was said to be a variable font pinned to one weight: measured
through the browser at wght 300 and wght 800, the shipped file is a single static
weight, so the `@font-face` is correct as written. And drawing was said to slow
down as the picture fills, because every frame rebuilds every stroke's `Path2D`:
measured at 200 strokes and 16,000 points, a deform costs 1.8 ms and a whole
pointermove 2.66 ms, which is inside a frame even at five times slower on a
tablet. A child's drawing is tens of strokes, not hundreds. Real in principle,
not worth caching against.

One accepted fix has no regression test and that is deliberate: clamping the
pinch before panning keeps the view from lurching past the zoom cap, but the
clamp itself already stops the page leaving the screen, so the symptom is not
reachable and there is nothing to assert. The code says so.

---

## 6. Fleet notes

- **Do not add `comic-crew` to `design/skins.mjs`**, and do not put the SWS STUDIO
  BASE sentinels in its `index.html`. `design/apply.mjs` iterates
  `Object.keys(SKINS)` and would strip the app's own `--ink` token and prune its
  rules on the next build, taking the bristol board and the dark shell with it.
  Eleven apps already ship self styled and that is the established path.
- Registered in `design/hub.mjs` under a new **Drawing** category with
  `{ darkAccent: '#6FB7DC', accent: '#1F5F80' }`. Measured 8.08:1 on the dark card
  and 6.18:1 on the light one. The magenta pair was the alternative and fails at
  4.05:1 on dark.
- `const CACHE = 'comic-crew-v1'` is a `const` on purpose: `design/bump-sw.mjs`
  requires it and silently skips six sibling workers that use `var`. Confirmed
  this one is seen.
- **`node design/bump-sw.mjs` with no arguments bumps every app in the fleet.**
  Use `--check`. That was done here by accident and reverted.
- Both fonts are carried in `apps/comic-crew/fonts/` with `OFL.txt` beside them.
  Neither Bangers nor Shantell Sans declares a Reserved Font Name, so no rename
  was needed. Google serves them already subset to latin, so nothing was modified.
- `apps/comic-crew/marketing/thumb-512.png` and `thumb-256.png` are **generated
  placeholders derived from the icon, waiting for Stephen's art.** Whoever
  replaces them must not regenerate over the top.
- Regenerate the hub with `npm run design:build` **before** `node design/hub.mjs`:
  hub reads `design/out/palette.json` and `design/out/` is gitignored.
- Deploy with `npx --yes firebase-tools deploy`, never `npx firebase`.

---

## 7. What the market says, corrected

The prototype's handoff ranked "AI comics cannot keep a character consistent" as
the number one complaint. Research contradicts that on its own evidence.

- **Monetisation is the top complaint by review volume**, not consistency. Five of
  six visible reviews on Comikaze's App Store page are one or two stars and every
  one is about the paywall. Exactly one mentions consistency and it is the five
  star one.
- **"AI cannot keep a character consistent" is stale.** It was true in 2024.
  Reference conditioning has largely closed it. The honest sentence is that a
  practitioner still burns eight to twelve renders per page. Comic Crew does not
  beat that on whether it is possible, it beats it on cost, speed and
  determinism: no re-rolls, no credits, no account, and it works on a plane.
- **Nearly every source claiming consistency is the top complaint is content
  marketing from companies selling a consistency fix.** Do not cite them anywhere
  public.
- **Toontastic 3D is dead**, delisted and its site gone. It was free, unmetered
  and the best loved kid story tool ever shipped, and teachers were still asking
  for a replacement into 2025. That is a vacancy, not a competitor.
- **Pixton has no free personal tier**, requires SSO, and runs 72 to 144 USD a
  year with a 2.8 Trustpilot average across 167 reviews.
- **The biggest risk nobody named: browsers delete their own storage.** Safari
  wipes script created storage after seven days without a visit; a guest or
  managed Chromebook session wipes it at logout. Most children will meet this app
  as a tab, not an install. The privacy page says so in plain words and tells a
  parent to print it or save the file. A character is a few kilobytes, which is
  the eventual fix: it fits in a file, a URL fragment, or a printed code.

---

## 8. Open, in the order it matters

0. **It is live** at `https://skywolfstudio.com/comic-crew/`, deployed
   2026-08-30 by `scripts/deploy-2026-08-30.sh`, hosting only. All 16 live checks
   passed, including three that open untouched sibling apps to prove the deploy
   did not disturb them. Then the live origin itself was driven in a browser: a
   character drawn, dressed, posed and still there after a reload, with the
   service worker controlling and no console errors. It is on the front door
   marked beta.

1. **Penny drives it cold**, with nobody coaching her and nobody leaning over her
   shoulder. Watch three things the audits could not settle: whether she finds the
   costumes at all, whether she can draw a face, and whether she ever finds Move
   without being told. Whatever fails there outranks everything below.
2. **The name is settled**, and this entry stays because the reasoning is worth
   keeping. It was built under the working title Inkbones, which collides with
   Inkbones Media, a live graphic design studio, and with an abandoned but
   indexed Inkscape bone rigging extension of the same name. Stephen called it,
   and it is now **Comic Crew**.

   Eight candidates were checked for collisions first and **every one of them
   failed**, which is worth remembering before anybody proposes a ninth off the
   top of their head. Doodlebones is a character in Poppy Playtime with how to
   draw videos already attached to the name, which is fatal for a children's
   drawing app. Comic Bones runs into Jeff Smith's Bone, which is in school
   libraries. Bendy Doodle has a trademark filing pointed at a kids drawing
   product. Draw Once and Paper Puppet are both live businesses. Scribblebones
   and Sketch Puppet survived and were still bad: they name the machinery rather
   than the comic, and a seven year old cannot spell either of them.

   Comic Crew names the cast, which is the actual promise: the same character in
   every panel. The cost is known and was accepted. `comiccrew.com` is registered
   and parked, verified by RDAP, and Comic Crew Inc is a live YouTube channel
   with paid memberships. Wrong category and not fatal, but it is somebody
   else's name in a way that Comic Sheet, the recommendation, was not. Comic
   Sheet's `.com` and `.app` are both genuinely unregistered, verified with
   working controls, if this ever needs revisiting.

   **Nobody has searched a trademark register.** Not for Comic Crew, not for any
   of the others. Every collision pass was blocked by USPTO and Justia and said
   so. A real search in the software and children's classes is a human step
   before anything ships commercially under this name, and none of the work above
   is a clearance opinion.

3. **Stephen's art** for `marketing/thumb-512.png` and `thumb-256.png`. Generated
   placeholders are in place and are marked as such.
4. **The tip jar** is wired and empty: `var TIP_URL = ''` in `index.html`. One
   paste.
5. **Colour.** Deliberately not in this version. It is the first thing a seven
   year old reaches for and skin tone is the emotionally loaded one, so it is the
   next feature. Note that it **reopens the settled deformer question**: filled
   shapes have an interior, so a volume preserving solver finally has something to
   win back. Re-run `test/rig.mjs` before assuming plain skinning still wins.
6. **More than four panels**, a real page editor, PDF and CBZ. A CBZ is a zip of
   page images and a store only zip is about eighty lines, so it needs no library.
7. **Two characters in one panel.** This is the demo nobody else can do: two
   drawings a child made, talking to each other, identical in every panel. Needs a
   per character placement transform on top of pose, and a roster, which is the
   point at which IndexedDB earns its place over localStorage.
8. **The paper path.** Photograph a drawing, threshold, trace, drag fifteen dots
   onto the joints. Unproven and the next real risk, because everything built so
   far assumes the ink was born inside the app. Timebox it.

## Never build

A sharing gallery or any server. It would put a children's drawing app squarely
inside COPPA's written security programme and published retention policy, and it
would be a separate product with its own legal review. An app that collects
nothing eliminates that liability category entirely, and that is worth more than
the feature.
