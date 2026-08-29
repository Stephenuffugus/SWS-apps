# Session close, 2026-08-29

Read this first next session. Everything below is committed, pushed and live.

## State at close

- `git status` clean, `origin/main` and `HEAD` identical.
- Guards: 129 checks, nothing to report, across **35 apps**.
- Fleet sweep: **56 passing, 0 failing**, 5 skipped (need the Firebase emulator).
- Deployed build tags verified against source: `otb-v10`, `beacon-v3`,
  `studio-v2`. All MATCH.
- `node design/hub.mjs` is a no-op, so no generated-file drift.

## What shipped today

**Off the Ball, v8 to v10.** The goalkeeper and shot model closed the last
handoff blocker, then six agents drove the app and found that closing the
feature list had not made it usable. Four blocking bugs fixed: the board froze
after any run and the only escape deleted the coach's work, format buttons set
`tool` to undefined and killed all input, a play remembered neither its pitch in
the share link nor the playbook, and two move-library constants were still
11v11 so a five a side near post run aimed 33 metres past the goal. **Still
gated behind the passphrase `wolfden`** until Stephen calls it.

**Beacon, app 34, new.** Arrived as a phone prototype relaying through a
Cloudflare Worker; shipped with the Worker deleted, posting straight to a
Discord webhook. Two blocking bugs fixed on the way in (a rejected message
queued forever while reassuring a child, and any tapped link silently
re-pointing her lifeline). Later the same day it gained **optional** two way
through a self hosted relay in `apps/beacon/relay/`. In testing badge.

**Music Studio, app 35, ported** from the Lucid Winds arcade byte for byte,
rebranded, given the fleet seams. The export watermark named the wrong site and
a browser test caught it. One general fix: every range slider was a 6px tap
target.

**Stephen's art landed** on Beacon and Music Studio. Originals at
`marketing/stripe-thumbnail.png`, everything else downscaled from them.

**Party Line: assessed, not shipped, archived.** See
`docs/archive/partyline/README.md`. He asked whether it was worth it and took
the answer.

## Open, in the order it matters

1. **Three Stripe payment links.** Copy was written and is in the chat log:
   Music Studio, Beacon, Party Line. `TIP_URL` seams are wired and empty in
   `apps/beacon/index.html` and `apps/music-studio/index.html`. This is the only
   revenue item and it is one paste each.
2. **Open Beacon on the real 2012 iPad.** The ES5 contract is proved by a
   parser and the app is proved in Chromium, but nobody has opened it on the
   hardware it exists for. That is why it wears the badge.
3. **Confirm the Discord ping actually buzzes a phone** rather than only
   showing a dot. Most servers only notify on a mention; the setup screen takes
   a user ID and its test button says to check exactly this.
4. **Deploy the Beacon relay** if two way is wanted at home.
   `apps/beacon/relay/README.md`, ten minutes, free, no card. Nothing breaks if
   it is never deployed.
5. **Music Studio thumbnail is filed but the two-copy question is open.** The
   same app still runs at `lucidwinds.com/studio.html` and the copies have
   already diverged. Decide: make this canonical and redirect the arcade, or
   keep a knowing mirror.
6. **Backport the slider fix to the arcade?** `height:28px` on the base
   `input[type=range]` rule. Not SWS specific. Do NOT backport the watermark.
   `/workspaces/lucid-winds` is checked out here and its remote is reachable;
   nothing was pushed to it.
7. **Off the Ball tuning, Stephen's call.** `trap` at competitive reads CLEAR
   CHANCE with 7.3m of open goal while the keeper is 1.96m behind the shooter.
   How much recovery a beaten keeper gets is football, not code.

## Things that bit today, so they do not bite again

- **`npx firebase` is not the deploy command.** `firebase` is the JS SDK and
  ships no binary; it only ever worked through an npx cache that an unrelated
  `npm install` invalidated. The script now says `npx --yes firebase-tools`.
- **A green suite is a claim about the cases somebody thought of.** The v8
  keeper regression passed 60 checks because the suite had a keeper in front of
  the ball and behind the ball, never at the same y.
- **Six of the tests written today failed before they passed, and most of those
  failures were the test's fault, not the app's**: a helper measuring a canvas
  after the page had scrolled, a property that does not exist, a 1.2s wait
  against a 4s autosave tick, a check counting source text so a comment
  explaining a fix read as the fix missing, a version string pinned literally,
  and a check comparing declaration order instead of call order. Every new test
  in this session was run against reverted code and had to fail with the
  reported symptom before it was kept. Keep doing that.
- **The root PNGs are deliberate.** `diamondrules.png` and friends are filed at
  the repo root on purpose; the Diamond Rules notes call the originals sacred.
  Today's art went to `apps/<slug>/marketing/` instead, which is the better
  home, but do not sweep the old ones away without asking.
- **Handoff zips are gitignored**, so anything that only exists in one dies
  with the codespace. Party Line's source is now archived in `docs/archive/`
  for that reason.
