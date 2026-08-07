# Bracket Maker

Single-elimination brackets for game nights, chili cook-offs, office pools,
and settling things once and for all. 2–32 entrants with proper seeding (the
top two can only meet in the final), byes handled correctly (an empty-subtree
check — "opponent undecided" never auto-advances anyone), tap-to-advance with
honest downstream invalidation when you change your mind, and the whole
bracket — names, results, title — lives in the shareable URL. Print view for
the wall. A free tool by Sky Wolf Studios.

Logic is fully unit-tested including a 60-tournament random play-through fuzz.
`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/helpers.test.mjs`.
