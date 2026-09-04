# Bracket Maker

Single-elimination brackets for any sport or showdown: rec leagues, cornhole,
pickleball, game nights, chili cook-offs, office pools. 2 to 32 entrants with
proper seeding (the top two can only meet in the final), byes handled correctly
(an empty-subtree check, "opponent undecided" never auto-advances anyone),
tap-to-advance with honest downstream invalidation when you change your mind,
per-game scores in any notation, and an Arrange mode where tapping two names
trades their places in the draw, results between people who still meet carry
over. Print view for the wall. A free tool by Sky Wolf Studio.

Two ways to share. A snapshot link packs the whole bracket, names, results,
scores, title, into the URL itself, no server involved. Go live puts the one
bracket into Firestore (`brackets/{id}`, rules in
`apps/signup-sheets/firestore.rules`) so a single link updates for everyone
watching; Stop sharing deletes the doc. The live payload is the same encoded
string the URL carries, so the hardened decoder in `helpers.js` is the schema.
`live.js` loads lazily, the app makes zero network requests until the feature
is used. Owners are anonymous Firebase auth users on purpose.

Logic is fully unit-tested including a 60-tournament random play-through fuzz.
`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/helpers.test.mjs`.
Rules tests: `npm run test:bracket-rules` in `apps/signup-sheets/`.
