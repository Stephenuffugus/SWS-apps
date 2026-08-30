# Session close, 2026-08-30

Read this first next session. Everything below is committed, pushed and live.

## State at close

- Branch **`inkbones-app-36`**, five commits, pushed to origin. **`main` is
  untouched**, so the branch and the live site agree and `main` does not. That is
  a deliberate open decision, not an oversight: see item 1 below.
- Working tree clean.
- Guards: **132 checks, nothing to report**, across **36 apps**.
- Fleet sweep: **59 passing, 0 failing**, 5 skipped (need the Firebase emulator).
- `npm run design:check`: 0 apps would change.
- `node design/hub.mjs` is a no-op, so no generated-file drift.

## What shipped today

**Comic Crew, app 36, new.** A comic maker where a child draws her own character
once and then keeps it: dresses it, poses it, gives it something to say, and
prints the page.

**Live at `https://skywolfstudio.com/comic-crew/`, behind the passphrase
`wolfden`**, the same one Off the Ball uses. Typed once per browser. On the front
door in a new Drawing category, badged as in testing.

It arrived as a prototype in a handoff zip called Inkbones. The full account is
in `docs/COMIC-CREW-NOTES-2026-08-30.md`, which is the file to read before
touching anything. The prototype exactly as it arrived, plus the renders that
condemned it, is in `docs/archive/inkbones/` and keeps its old name on purpose.

**The prototype's architecture survived. Its numbers did not.** Its bench
reported a worst limb of 87%; running that same bench unmodified printed a torso
keeping **27%** of its area, because the headline was an average and the torso was
the one row that had collapsed. Four of seven poses rendered a child's drawing as
an unrecognisable knot, including the one the handoff said to demo. Torso
retention is now 100 to 101% on every pose, worst limb 87%, drift still exactly
zero.

**290 checks** across three suites: `rig.mjs` 180, `smoke.browser.mjs` 104,
`a11y.browser.mjs` 32.

## Open, in the order it matters

1. **Penny drives it cold.** Nobody coaching, nobody watching over her shoulder.
   Three things to watch: does she find the costumes without being told, can she
   draw a face on a head that small, and does she ever press Move on her own.
   Whatever fails there outranks everything below, including colour.
2. **Stephen's art** for `apps/comic-crew/marketing/thumb-512.png` and
   `thumb-256.png`. What is there now is generated from the icon and is marked as
   a placeholder in the shell agent's notes. Do not regenerate over his art when
   it arrives. See `stephens-art-is-sacred`.
3. **The tip jar.** `var TIP_URL = ''` in `apps/comic-crew/index.html`. One paste,
   and it is the only revenue item on this app.
4. **Merge the branch, or do not.** `main` has none of this. The live site is
   deployed from the branch. That is fine and reversible, but it means a fresh
   checkout of `main` does not contain app 36, and the next hub regeneration from
   `main` would drop it from the front door.
5. **Take the curtain down** when it has been tested. Delete `showGate`, the
   `.gate` rules, and the gate block in `smoke.browser.mjs` and
   `a11y.browser.mjs`. The comment beside it says so too.
6. **Trademark.** Nobody has searched a register for Comic Crew, and
   `comiccrew.com` is registered and parked by somebody else. A real search in
   the software and children's classes is a human step before anything ships
   commercially. `scripts/rename-app.mjs` renames any app in this fleet in one
   command if it has to change again.

## Things that bit today, so they do not bite again

- **An average hides a collapse.** The prototype's acceptance was "worst limb",
  computed across a set that included a torso at 27%. The bench now asserts per
  limb, with a floor **and a ceiling**, because a torso that balloons 25% is as
  wrong as one that shrinks.
- **Look at the picture.** Four separate defects passed the numbers and were
  caught by rendering the figure and looking at it: a torso that grew instead of
  collapsing, a cape that followed a raised arm, a shoulder shrug that drew a cone
  shaped chest, and a hint pill that covered the feet of the figure it described.
- **A test can fail for the wrong reason.** Six tests in this session passed or
  failed for reasons other than the one they named, and every one was caught by
  asserting the SETUP as well as the outcome. A garment test measured a bounding
  box that grows legitimately. A pigtail test drew pigtails too short to trigger
  the condition it tested. A stroke finder matched a start point the left arm
  also shared. Assert the premise. See the `assert-the-premise` memory.
- **Green locally is not green on a phone.** Two blocking defects shipped through
  a green suite and were caught by an adversarial review: the drawing area was
  eleven pixels tall on an iPhone SE and zero sideways, and zooming in then
  changing mode could leave the canvas entirely black. Nothing in the suite
  touched zoom, and the 320px case checked overflow without ever checking there
  was somewhere to draw.
- **`node design/bump-sw.mjs` with no arguments bumps every app in the fleet.**
  Use `--check`. Done here by accident and reverted.
- **A rename script cannot hear grammar, and the slug is code in one place.**
  `window.__inkbones` became `window.__comic-crew`, which is a syntax error, and
  "an Inkbones character" became "an Comic Crew character". A single word test
  name could not have shown the first. The copy is article free now and
  `scripts/rename-app.mjs` derives a separate identifier for the hook.
- **Eight name candidates were checked and every one failed**, including the
  obvious ones. Doodlebones is a Poppy Playtime character with how to draw videos
  attached. Comic Bones runs into Jeff Smith's Bone. Check before falling in love
  with a name.
