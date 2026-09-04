# Bracket Maker, 2026-09-04: live links, arrange mode, scores

Stephen's brief, verbatim in spirit: the app telling people to refresh with a
new link so others can see the bracket change has to go; people need to adjust
and organise the bracket how they like; it has to work for any sport. All
three shipped and verified live the same day.

## What shipped

**Go live.** One tap copies the bracket into a single Firestore doc
(`brackets/{id}` on sws-apps-9646d) and hands back a link ending
`#live=<docId>`. Every result, score, rename and re-draw the organiser
records is pushed (debounced 600ms) and appears for everyone holding the
link within seconds, no refresh. Stop sharing DELETES the doc, viewers are
told the organiser stopped, and the button arms on first tap because that
delete cannot be undone. Snapshot links still exist, still work fully
offline, and the share card explains both in one hint.

**Arrange matchups.** A toggle under the bracket. Tap one first-round name,
tap another, they trade places in the draw; later rounds dim so the eye goes
where the hands can. Results and scores between people who still meet carry
over (carryPicks grew score carrying), what no longer fits is reported with
Undo. Shuffle the draw does a Fisher-Yates with the same carrying and Undo.

**Scores.** Any finished game grows a Score strip; the dialog takes two
free-text fields up to 8 chars a side, so 21-15, 3-2, 1-0 OT, W-F all fit,
any sport. A score names the PEOPLE who played, not the coordinates: rewrite
history upstream and it hides, restore the pairing and it returns. Scores
ride the snapshot URL, the live doc, localStorage and the backup file, all
through the one codec, and print.

## Decisions someone will ask about

- **Anonymous owners, on purpose.** Engine-1 boards require a real sign-in;
  a bracket is a party fixture and demanding Google to run cornhole night
  kills the feature. Cost accepted: cleared browser data orphans the doc.
  The app answers the resulting permission-denied by clearing its claim and
  saying "go live again for a fresh link".
- **The wire format is the URL codec.** The live doc's payload is the same
  encoded string a snapshot link carries, so decodeBracket's hardening is the
  single schema and the rules only bound size (8000 chars).
- **Viewers are read-only.** mode 'liveview' renders spans, hides the three
  organiser cards (body.liveview .owneronly), writes NOTHING to storage, and
  offers "Open my own bracket" and "Keep a copy of this one". Letting the
  crowd record results is a real feature request waiting to happen; it needs
  conflict thinking and its own session.
- **The hub card line changed** from "Game night, settled properly" to
  "Any matchup, settled properly, live" (design/hub.mjs, regenerated). That
  is a taste call made under the any-sport directive; one line in hub.mjs
  reverts it.
- **bracket-maker stays counted on-device** on the hub, same precedent as
  specials-planner's optional Drive save: the default is on-device, the
  exception is opt-in and labelled on its face. The privacy page carries the
  full Go live section and the trust stamp names the exception.

## The trap that bit, so it does not bite again

`.liverow{display:flex}` beat the browser's `[hidden]{display:none}` rule,
so the live status row and the green dot showed before anyone went live. The
UI smoke caught it from a screenshot. Any new styled-and-hidden element needs
`.thing[hidden]{display:none !important}` beside its display rule; the app
layer now carries that for .liverow and .livedot.

## Verification, all green 2026-09-04

- 25 helper tests (scores, swap, shuffle, codec hostility, carry fuzz).
- 25 bracket rules attack tests + the existing 90 rules and 23 data tests,
  against the emulator.
- 21 UI smoke checks in real Chromium (picks, score dialog, arrange trade,
  shuffle permutation, snapshot round-trip, viewer chrome, both themes shot).
- 17 live E2E checks in real Chromium against PRODUCTION Firestore, run
  twice: once against localhost before hosting shipped, once against
  skywolfstudio.com after. Owner and viewer in separate contexts; winners,
  scores and re-draws arrive with no refresh; stop kills the link honestly.
- guards 132 clean, axe zero violations light and dark, design:check no
  drift. Deploy checks: scripts/deploy-2026-09-04.sh check (15 PASS).

## Deploy state

Rules deployed first via the granted command from apps/signup-sheets, then
hosting from the repo root (granted command; the firebase binary resolves
through a symlink in root node_modules/.bin, documented in the deploy
script). sw.js is bracket-v35. Live site verified, siblings spot-checked.

## Still open

1. Hand it to a real organiser. The next tournament in the family or the
   office should run on a live link end to end from two real phones.
2. Viewer-recorded results (scorekeeper mode) if Stephen wants it.
3. Firestore hygiene: nothing reaps abandoned live docs. Volume is tiny and
   each doc is under 8KB; a scheduled cleanup is a someday item, not a risk.
4. The marketing thumbnail and listing copy still sell game night only.
