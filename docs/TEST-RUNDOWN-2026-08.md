# What to test, and what I'm actually unsure about

**Sky Wolf Studios · testing round 1 · August 2026**

Twenty-four apps are live at **sws-apps-9646d.web.app**, plus Float behind the dev gate. They all pass their tests. That is a much weaker claim than it sounds, so below is an honest map of where my confidence is real and where it is guesswork.

> **The one thing worth saying up front.** Automated tests prove the code does what I told it to. They prove nothing about whether what I told it to do is the right thing. Every red flag below is a place where I made a judgement call on your behalf, and only a person actually using it can tell me if I got it wrong.

---

## How to give feedback that I can act on

The most useful report has three parts, and the third one is the one people skip:

| Part | Weak | Actionable |
|---|---|---|
| What you did | "I was in the planner" | "Week 3, clicked the paint dot on Tuesday period 2" |
| What happened | "It broke" | "The grid went blank, header still there" |
| Where | — | "School Dell, Chrome, the locked-down profile" |

**That third line is why the contrast bug is still open.** I have tried to reproduce it on both planners, empty and full, light and dark, in Windows High Contrast mode, and in the actual week grid rather than the setup screen. I cannot make it happen. Without knowing the machine and the browser I am guessing, and I have spent enough of your time guessing.

Also genuinely useful, and not a bug: *"I didn't know what to press next."* Say where you stalled even if nothing was broken. That is a design defect and I would rather hear it than not.

---

## START HERE

### Grade Sheet — `/grade-sheet/` — LEAST PROVEN

Brand new, built this session, and **no teacher has ever used it.** The arithmetic I am confident about — 79 assertions including brute-force checks against every possible drop combination. The workflow I am not confident about at all, because I designed it from research rather than from watching Jessie mark a class.

1. Add a class, then paste a real roster — ideally copied straight out of the actual school system, not retyped.
2. Use **Give everyone: 4**, then change two children: type `M` on one, `E` on another.
3. Type down the column using `Enter` to move between children. Time it.
4. Open **How is this worked out?** on a student.
5. Press `Esc`. Then print a class.

**What I most need to know:** does the roster paste work with *her* system? I built the parser to read an HTML table straight off the clipboard, which should mean selecting a roster in a web-based SIS and hitting Ctrl+C just works. I have only ever tested that against synthetic data. If it mangles a real roster, that is the app's front door broken and nothing else matters.

Second: is **"Jacob M."** enough to know who a row is? I made shortened names the default so the screen is safe to project, but if she has to flip to full names constantly then I optimised for the wrong thing.

Third, and I want the honest answer: **is marking a class faster than her spreadsheet?** If it is not, the app has no reason to exist and I would rather find that out now.

### Grade Sheet on the school computer — CAN'T TEST FROM HERE

Separate entry because it is a different question, and it is the one that could sink the app. Grades live in the browser's own storage, and a managed school machine can be configured to wipe that on sign-out.

1. Open it on the school computer. Add a class and a couple of marks.
2. Sign out fully. Sign back in. Reopen it.

**If the class is gone,** that is not a bug I can fix — it is district policy — but it changes the app's honest advice from "back up weekly" to "back up every single day, or don't use this at school." The app already warns and tries to detect it. I need to know if the detection actually fires. Also worth checking: does the site load at all through the district filter?

### Specials Planner — `/specials-planner/` — OPEN BUG

The colours-with-names, merging and fit-to-screen work from Jessie's own book is all in. Fit-to-screen had a real bug I found and fixed — on a phone it was crushing the week to 3-pixel text. It now hides itself on screens too small to do it honestly.

1. On her laptop: **Fit to screen**. Does the whole week actually fit, and is it readable?
2. Colour a box, name the colour, choose **every week** vs **just this box**.
3. Merge two periods. Check it survives a reload.
4. Print it. Does the colour key print, and does it mean anything to someone who is not her?
5. **Try to trigger the contrast bug on purpose**, on the machine where it happened.

**The real question behind the colour feature:** could a substitute pick up the printed week and understand it without Jessie in the room? That was the whole point of making colours carry names. If the printed key does not achieve that, the feature is decoration.

---

## WORTH A PROPER LOOK

### The four shared apps — SIGN-IN FLOW

`/signup-sheets/` `/grocery-list/` `/caregiver-log/` `/team-parent/`

These are the only apps that touch a server, and the only ones where creating something needs a sign-in. I corrected the hub this session — it was promising "nothing leaves your device" above all of them, which was false.

Make a real board, open the link on a **second device**, and have someone else join. I want to know whether the sign-in feels proportionate, and whether the card now saying **Shared online** makes the difference obvious enough before someone puts a family's details in.

### Float — `/float/` — password `wolfden` — NEEDS A FIELD TRIP

Untestable at a desk in every way that matters. The map, the GPS track and the camera only mean anything outdoors.

Take it somewhere real. Pin a spot, photograph rocks, walk a track, then come back and check the site detail actually shows what you collected there. GPS accuracy in the field is the thing I cannot simulate.

### Anything that prints — NEVER SEEN ON PAPER

`sub-plans` · `sitter-sheet` · `pill-schedule` · `seating-chart` · `wedding-timeline` · `grade-sheet` · `specials-planner`

Every one of these has a print stylesheet I have only ever verified in a browser preview. **Put at least two through a real printer.** Page breaks in the wrong place, a table that runs off the right edge, or grey text that vanishes on paper are all invisible to me and obvious to you.

---

## QUICK PASS — THE SETTLED ONES

These have been stable a while. A couple of minutes each is enough; I am looking for anything that feels off rather than a formal test.

- **Paper & Files** — scan-to-pdf · pdf-tools · image-compressor · signature-maker · qr-maker
- **Events & Groups** — secret-santa · wedding-timeline · seating-chart · bracket-maker · wheel-picker
- **Family & Home** — sitter-sheet · baby-log · pill-schedule
- **Moving, Travel & Money** — moving-boxes · packing-list · home-inventory · bill-splitter

On any of them, the three things worth a glance: does it work with the **Wi-Fi off** (all of them should); does the **comfort panel** text-size setting actually change anything useful; and does anything look wrong in **dark mode**.

---

## What I need from you, since you asked

Three of these are blocking and only you can supply them.

| Thing | Why it's blocking |
|---|---|
| **The signing key fingerprint** | All 24 store links hold a placeholder. Without the real SHA-256 the Android apps install but show a browser address bar across the top, which looks broken. Paste it to me and I fill all 24 in a minute. |
| **The domain decision** | The web address gets **baked into the signed package**. Launch on the Firebase URL, move to a branded domain later, and every installed app breaks and needs a re-release. Deciding before submission #1 costs a few dollars; after costs a release per app. |
| **Play account type** | New *personal* developer accounts have to run a closed test with a minimum number of testers for a fixed period before production is unlocked. I could not verify the current numbers this session and will not guess — check it in Play Console. If it applies, it is a hard multi-week gate that has to start first. An organisation account under the LLC may avoid it. |
| Hand-made graphics for the first three | Not blocking, but the highest-value thing you could make. Twenty-four listings built from one template is exactly the pattern a reviewer flags as repetitive content. |

---

## Where things actually stand

| Item | State |
|---|---|
| Apps live | 24 on the hub + Float (dev-gated) = 25 serving |
| Tests | 45 suites passing, 0 failing |
| Accessibility | axe clean across all 24 |
| Colour contrast | 1608 / 1608 pass |
| Store readiness | 1 gap left — the fingerprint, above |
| Trackfit | Free version finished and verified; not yet pushed — see below |
| Contrast bug | Open. Cannot reproduce. Needs the machine and browser. |

---

## Trackfit

The free version is done: paid tier removed, photo-ID removed, fonts self-hosted. Typecheck passes, 84 tests pass, and there is no `fetch` left anywhere in the source — so "nothing leaves your device" is now literally true for it.

I could not push it. A Codespace gets a token scoped to the repo it was created from, so pushing to the trackfit repo returns 403 — a misleading error, because your *account* can push; the container's token cannot. I have committed a `.devcontainer` config that fixes it: **rebuild the container or start a new codespace**, approve the permission prompt, and I can push it straight away. The work is also parked as patch files in `design/findings/trackfit-free/` either way, so nothing is lost.

> **Before Trackfit goes on the hub** it needs product work I have not done. Its layout suggester is not really a solver — it reduces your whole box to six numbers and compares them against hand-typed thresholds, and it currently tells a genuine Kato starter oval that it is 8 mm short of being an oval. **Build this** is also a button with no code behind it. Both fixable, neither fixed.

---

*Sky Wolf Studios · SWS Strategic Media LLC. Everything above is checkable — if a claim here does not match what you see, the claim is wrong and I want to know.*
