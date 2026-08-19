# Team Parent

Engine 1 (shared-link coordination), skin B. One coach or team parent signs in,
builds the season page, and shares one link. Families RSVP to events, claim
duty slots (snacks ×2, carpool ×4), and see pinned announcements, **no
accounts for families, ever.** A free tool by Sky Wolf Studio.

## How it maps onto the engine

Same Firebase project, same `firestore.rules` as signup-sheets (boards carry
`skin: 'team'`). The mapping:

- **Slots = events.** Capacity 999 means "open RSVP" (show *N going*, button
  says *I'm going*); smaller capacities are duty slots (*2 of 3*, button says
  *I'll cover this*).
- **Claims = RSVPs**, with the optional note ("can drive 3").
- **Entries**, `announcement` type renders pinned at the top (owner posts
  from a dedicated composer); `note` type is the families' questions section.

## The date model, read this before touching `order`

`firestore.rules` pins a slot document to exactly
`['label', 'capacity', 'order', 'claimedCount']`, and those rules are shared
with signup-sheets, so **a game's date cannot be its own field.** `order` is
already a number, so the date *is* the sort key:

```
202609120900   =   Sat 12 Sep 2026, 09:00      (hhmm 0000 = no start time)
300000000001+  =   undated rows, in insertion order, after the whole season
1, 2, 3…       =   slots written before this model; treated as undated
```

That one decision is what makes chronological order, "Next up", the past/
upcoming split, the .ics export and the week text block possible without a
rules change. `helpers.js` owns the encode/decode (`dateKey`, `keyParts`,
`sortSlots`, `isPast`) and `isDated()` is defined as "decodes to a real
calendar date", so a malformed number degrades to an undated row instead of
throwing mid-render.

The human parts live in `label`, in readable plain text, so a printed sheet, a
pasted text message and a calendar entry all still make sense:

```
Game vs Hawks · at Kestrel Park, Field 4 · wear blue
```

## Engine code sharing

`data.js` is a copy of the signup-sheets engine file (only `SKIN` and the
entry-type parameter differ), plus `addSlots` returning the created ids and a
`deleteSlots` helper, both so a bulk add can offer an Undo.

**`helpers.js` has diverged and is no longer a copy**, it carries the date
model, the label encoding, the pasted-schedule sniffer, the .ics writer and the
week message. Do not re-sync it from signup-sheets.

The engine's test suites live in `../signup-sheets/test/`, including
`team.test.mjs`, which drives THIS app's data layer against the emulator. The
app's own pure-logic suite is `test/helpers.test.mjs` and needs nothing running.
If you change engine behavior, change it in both apps and run both suites.

## Config

- `firebase-config.js`, same project config as signup-sheets.
- `CONFIG.tipUrl` in `app.js`, Stripe tip link (hidden until set).

## Tests

```sh
node test/helpers.test.mjs     # this app's pure logic, no emulator needed

cd ../signup-sheets
npm test               # engine suites
npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/team.test.mjs"
```
