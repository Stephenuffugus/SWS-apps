# Secret Santa

Draw names with proper couple/roommate exclusions, then send each person a
private reveal link, a festive tap-to-reveal page showing only THEIR match.
The incumbents harvest every participant's email to do this; ours needs no
contact info at all because each match travels inside its own link. Impossible
rule combinations are detected and explained instead of hanging (3 people +
one excluded couple is mathematically unsolvable, the app names the pair to
blame). Drawn entirely on the organizer's device. A free tool by Sky Wolf
Studios.

The roster, the no-match rules and the finished draw persist in
`localStorage['sws.secret-santa.v1']`, so a closed tab does not destroy an
exchange mid-send. Adding a latecomer re-draws by *keeping* every match the
rules still allow (`redrawKeeping`, a seeded bipartite matching), so one or two
links change instead of all of them, and each row says which. Feasibility and
the impossible-pair diagnosis are exact matchings, not shuffle-until-tired.
Print produces fold-over slips, name outside, match inside the fold.

Draw logic unit-tested (validity, exclusions, 200-draw fuzz, impossibility,
minimal-churn re-draw, roster reporting, malformed payloads).
`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/helpers.test.mjs`.
