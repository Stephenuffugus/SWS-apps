# Team Parent

Engine 1 (shared-link coordination), skin B. One coach or team parent signs in,
builds the season page, and shares one link. Families RSVP to events, claim
duty slots (snacks ×2, carpool ×4), and see pinned announcements — **no
accounts for families, ever.** A free tool by Sky Wolf Studios.

## How it maps onto the engine

Same Firebase project, same `firestore.rules` as signup-sheets (boards carry
`skin: 'team'`). The mapping:

- **Slots = events.** Capacity 999 means "open RSVP" (show *N going*, button
  says *I'm going*); smaller capacities are duty slots (*2 of 3*, button says
  *I'll cover this*).
- **Claims = RSVPs**, with the optional note ("can drive 3").
- **Entries** — `announcement` type renders pinned at the top (owner posts
  from a dedicated composer); `note` type is the families' questions section.

## Engine code sharing

`data.js` and `helpers.js` are copies of the signup-sheets engine files (only
`SKIN` and the entry-type parameter differ). The engine's test suites live in
`../signup-sheets/test/` — including `team.test.mjs`, which drives THIS app's
data layer against the emulator. If you change engine behavior, change it in
both apps and run the signup-sheets suite.

## Config

- `firebase-config.js` — same project config as signup-sheets.
- `CONFIG.tipUrl` in `app.js` — Stripe tip link (hidden until set).

## Tests

```sh
cd ../signup-sheets
npm test               # engine suites
npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/team.test.mjs"
```
