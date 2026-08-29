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
| 5 | Goalkeeper and shot model | Not started. |
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

## Still needed from Stephen

- Art. The icon and `marketing/thumb-256.png` are placeholders I made.
- A Stripe link for `TIP_URL`, same pattern as the rest of the fleet.
