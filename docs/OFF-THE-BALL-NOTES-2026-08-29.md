# Off the Ball, build notes to 2026-08-29

Live at `skywolfstudio.com/off-the-ball/`. Handed off as a zip on 2026-08-28,
integrated as app 33 the same evening.

## Where the handoff's blocking list stands

| # | Item | State |
|---|------|-------|
| 1 | PWA shell | Done. Manifest, four icons, service worker, offline. |
| 2 | Small sided formats | Done. 5v5, 7v7, 9v9, 11v11 with real FA dimensions. |
| 3 | Playbook durability | Done. Export and import the whole book as a file. |
| 4 | Attacker reactivity | Done, otb-v6. |
| 5 | Goalkeeper and shot model | Done, otb-v8. |
| 6 | Onboarding | Done, otb-v7. |

## Attacker reactivity, what it actually does

A runner used to be a rail. He was handed a path at kickoff and he ran it to
the end no matter what grew in front of him, which is why the handoff called
this the thing that makes the tool trustworthy rather than illustrative: a
board where nobody looks up is a diagram, not a rehearsal.

Now each scripted runner has one decision point, at a fixed distance from the
end of his run. When he reaches it he looks at the pitch the way defenders
already did, through a delayed view, and asks whether the space he is running
into is still there.

Four rules keep it honest:

**He only reacts to a space that is actually covered.** A defender inside three
metres of where he is going is the whole trigger. Without that gate the margin
is meaningless at range: with the nearest opponent forty metres away any step
sideways "gains" more than the threshold, and a runner in acres would divert
for no reason. That bug was live for one test run and the uncontested case
caught it.

**He compares fairly.** The read looks ahead by the time it would actually take
him to arrive, not by a fixed interval. A constant lookahead judged a distant
endpoint against nearby fallbacks on different clocks and moved a pinned cell
the wrong way.

**He has two answers, and no more than two chances.** Check back toward the
ball, or stop where he is. Two bails per player, then he commits. A player who
re-plans forever is noise.

**A hand drawn run is never touched.** If you drew it, you meant it. Only the
named moves from the library reason about themselves.

Every divert is written to the ledger in plain words, and when there is
genuinely nowhere to go it says that too rather than silently running into
traffic.

### The golden row that moved

`overlap` went to SPACE CREATED at all three tiers, from HALF A YARD, NO PASS
ON and HALF A YARD. This is handoff issue 1 resolving in the row it was written
about: the overlapping fullback used to sprint past his own passing lane and
kill the move. He now reads the cover at 1.87s, checks his run, and the ball
reaches him with 1.6m of lane and 8.4m of space.

Watched in a real browser before the table was re-blessed, and the reason is
recorded in `test/engine-test.mjs` beside the row. That is the rule for this
app: the sweep is the contract, a moved cell gets looked at and argued for in
the same commit, and the table is never edited to turn a build green.

## Also in v6

The verdict banner used to drop straight on top of the play's call sign, and
the offside line label collided with it in the corner. The call sign steps
down out of the way and the offside label moved to the other end of its line.
Both are covered in the browser suite so they cannot come back.

## Onboarding, and why there are two of them

The board opened on eleven coloured dots and said nothing. Now a panel sits
over it once, and it comes in two versions, because the two ways in are not
the same arrival.

Somebody who typed the address gets **A chalkboard that runs**: gold is your
team, blue is theirs, press Run and the board tells you whether the space
opened rather than whether you drew it neatly. Somebody who was **sent a
link** already has a reason to be here, so that one names the play in the
heading, says a person shared it, and asks only for a press of Run. A shared
link is the point of the whole app and it deserved its own greeting.

Neither blocks. The board is live underneath, dismissal is one tap, and it
never returns.

Two things it caught on the way in. On a 320 by 568 handset the first build
put both buttons below the fold, which is precisely the un-dismissable overlay
Stephen had just complained about on Diamond Rules; the panel scrolls now and
the buttons are sticky, pinned by a test that runs at that viewport. And the
overlay silently turned the stored-XSS test vacuous, because the tap it makes
on a defender landed on the welcome instead of the canvas, and a click that
never arrives also fails to pwn anything. That test now dismisses the panel
first and asserts the scouting sheet actually opened, so it cannot go hollow
again.

## The goalkeeper, and the end of the proximity guess

Handoff issues 2 and 3 were written as two problems and they were one. There
was no keeper on the pitch, so the offside line used a nominal one pinned at a
fixed depth and every preset near the byline was approximate. And with nobody
to shoot past, CLEAR CHANCE meant "in the box, with the nearest defender more
than four metres away". That is a statement about space wearing the language of
a chance, and a coach who trusted it would have been told a play worked when
the angle was closed.

He stands on the bisector of the two posts as seen from the ball, not on the
line from the centre of the goal. For a shot down the middle those are the same
thing. From wide they are not, and the difference is the entire near post:
bisecting from the goal centre left equal slivers showing at both posts, so a
keeper facing a shooter out by the corner of the box stood in the middle of his
net covering nothing in particular. Bisecting the posts is what narrowing the
angle actually means.

He walks out as the ball comes and he gives ground back rather than being
rounded. That second half was a real bug caught by a test: the bisector rule on
its own stood him four metres behind a runner who was 1.5m from the line, with
the whole goal open behind him. He is still speed limited getting to where he
wants to be, so arriving late is possible, and that is the point.

**He is not scoutable and he is not draggable.** Every other player on the board
is a decision you are making. He is the thing you are trying to beat. The moment
he becomes a slider somebody tunes him until the play always works, which is the
exact failure this whole app exists to avoid. He plays the same for everyone,
and the browser suite asserts he never appears in the defender picker.

### What the verdict says now

It quotes metres of open goal past him, and the board draws that gap as a bright
stripe on the goal line with a shaded cone back to where the ball ended up.
Seeing it is the difference between being told there is a chance and
understanding why there is one. The stripe is handed to the renderer by the
engine rather than recomputed, so it is always the same number the verdict just
quoted, and a play that never reached a shooting position leaves no stripe
behind.

The banner itself moved to the bottom of the board. It used to drop across the
top, which is where the goal mouth is, and the goal mouth is now where the
answer is drawn. A banner that covers the thing it is describing is the wrong
banner. It takes the hint line's place, which has done its job by the time a
play has been run.

### Two bugs that fell out of it

`inBox` was the 11v11 penalty area typed as three literals, left behind when the
pitch stopped being one size. On a five a side pitch 36 metres is past the goal
line, so `inBox` was false everywhere and **a small sided board could never
produce a chance at all**. It reads the real area for the real format now, and
the test walks all four formats.

The offside line took a keeper at a fixed depth. When a real keeper comes off
his line to narrow an angle he stops being the last man and the second last
opponent becomes a defender. That is the Law, and it was previously
unrepresentable.

### The golden row that moved

`decoy` at competitive went from HALF A YARD to HALF CHANCE. The old cell
described 2.3m of space around the receiver and said nothing about the goal,
because there was no goalkeeper to say anything about. He is in the area with
2.1m of net showing past the keeper, so it is a half chance, and HALF CHANCE is
the honest name for it. Watched in the browser before blessing, argued for in
`test/engine-test.mjs` beside the row.

Recorded honestly: `giveandgo` and `isolate` still read CLEAR CHANCE at all
three tiers, so by label a third of the library still does not discriminate
between opposition levels. The numbers inside those verdicts do move now
(`giveandgo` shows 2.6, 2.2 and 2.3 metres of open goal across the tiers), so
the sweep is no longer blind there, only coarse. Still a tuning question rather
than something to paper over.

## The curtain, and why the blocking list closing did not mean it was ready

All six handoff blockers closed in v8, and the comment in `design/hub.mjs` said
the In testing badge should come off the day that happened. So before taking it
off, six agents were sent to drive the thing a coach would actually drive: a
cold phone, the soccer itself, the copy, the failure modes, the reason to come
back, and how it sits beside the other 32 apps.

Two of the six said it was usable. Four said it was not, and the reasons were
not cosmetic. Finishing the feature list had not made the app usable, because
every item on that list was about what the board can model and none of it was
about what happens after a coach presses Run.

**Off the Ball is now behind a passphrase**, the same curtain Rock Stops wears,
in the same words: it is not security, the passphrase is in the source of a
file anyone can read, and there is nothing behind it to protect because every
play lives in the browser it was drawn in. What it buys is that an unfinished
app does not look shipped. Somebody arriving on a shared link is told that a
play is waiting for them and to ask whoever sent it for the passphrase, because
being stopped by a bare password box when a friend has just sent you something
is the wrong way to meet this app.

### What has to be fixed before the curtain comes down

1. **The board freezes after a run.** `pointerdown` returns early while a sim
   exists and nothing clears it when the play ends, so every tap and drag is
   ignored. Meanwhile the hint under the board still says "Tap gold to add a
   move". The only labelled way out is Reset, which reloads the preset and
   throws away the coach's work. This is the core loop and it does not survive
   the first press of Run.
2. **Tapping a format button kills input.** The tool variable ends up
   undefined, and after that nothing taps, drags, draws or passes.
3. **A play does not remember its pitch.** The format is stored in neither the
   share link nor the playbook, so every 5v5, 7v7 and 9v9 play reopens as
   11v11, with the same metre coordinates now sitting in the corner of a full
   pitch. Small sided was the biggest selling point and it does not survive
   being saved.
4. **The move library is 11v11 only.** Two constants were never made format
   aware: side detection compares against 34, which is half of 68, and the
   goalmouth is hardcoded. On a 5v5 pitch a near post run aims 33m past the
   goal line and an overlap crosses to the far touchline. All 24 moves are
   offered on every format with nothing gating them.

Numbers 3 and 4 are the same root cause as the `inBox` literals that v8 fixed:
the pitch stopped being one size in v5 and not everything was told.

### The regression v8 shipped, and what the test suite missed

For part of 2026-08-29 the live board told a striker standing next to the
goalkeeper that he had the whole goal to aim at. `goalSightSpan` asked whether
the keeper was behind the shooter before asking whether he was on top of him,
and `keeperTarget` clamps the keeper so he is never goalside of the ball, which
from inside `keeperMax` makes his y exactly the shooter's. The `<=` read that
equality as "not between you and the goal" and returned all 7.32m. Walking in
down the middle the number fell 2.0, 1.7, 0.8, 0.0 and then jumped to 7.32.

The suite passed it the whole way. It had a keeper in front of the ball and a
keeper behind the ball and never one at the same y, which is the only place the
bug lives. The fix asks smothered first; the new check walks a shooter from 12m
to 2m and asserts both that the goal is never open while the keeper stands on
him and that it never widens as he gets closer. Reverting the engine makes it
fail with the exact symptom, so it is a real test.

The lesson is the one already written in this repo: a green suite is a claim
about the cases somebody thought of. Six agents driving the real app found
seven blocking problems that 60 passing checks did not.

### A tuning question, left for Stephen

`trap` at competitive still reads CLEAR CHANCE with 7.3m of open goal while the
keeper is 1.96m away, because he is genuinely a couple of metres behind the
shooter by then and the model calls a beaten keeper fully beaten. A keeper that
close can still dive back. How much recovery he gets is a judgement about
football rather than a bug, and the rule in this app is that those belong to
Stephen, so it is written down here rather than quietly tuned.

## Still needed from Stephen

- Art. The icon and `marketing/thumb-256.png` are placeholders I made.
- A Stripe link for `TIP_URL`, same pattern as the rest of the fleet.
- A ruling on the beaten keeper above.
- The passphrase is `wolfden`, the same one Rock Stops uses. One line at the
  bottom of `index.html` changes it.
