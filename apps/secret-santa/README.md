# Secret Santa

Draw names with proper couple/roommate exclusions, then send each person a
private reveal link — a festive tap-to-reveal page showing only THEIR match.
The incumbents harvest every participant's email to do this; ours needs no
contact info at all because each match travels inside its own link. Impossible
rule combinations are detected and explained instead of hanging (3 people +
one excluded couple is mathematically unsolvable — the app knows). Drawn
entirely on the organizer's device. A free tool by Sky Wolf Studios.

Draw logic unit-tested (validity, exclusions, 200-draw fuzz, impossibility).
`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/helpers.test.mjs`.
