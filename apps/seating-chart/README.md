# Seating Chart

Engine 2 (local data → print-ready PDF), skin A, and the biggest single
opportunity in the portfolio. Weddings at peak; banquets, conferences, and
classrooms year-round. **Free, unlimited, no watermark, and nothing ever
leaves the device.** A free tool by Sky Wolf Studio.

## The product insight

Every incumbent treats seating as a *layout* task. It's actually a
*constraint* problem that gets re-solved a dozen times as RSVPs trickle in.
So: the user declares rules, keep together, keep apart, must-be-at-table, and every time the data changes, `validate()` re-checks everything and
surfaces violations as a fixable list. Auto-arrange exists but is explicitly
a *suggestion* button; people want control here, they just want the machine
to catch their mistakes.

## The three outputs (the PDF is the product)

1. **Entrance display**, serif, centered, by table.
2. **Escort cards**, alphabetical by last name, 10 per page, dashed cut lines.
3. **Caterer's sheet**, table-by-table meal counts, dietary flags, totals,
   plus an allergy roster. Venues ask for this a week out and couples build it
   in a panic; it's the feature that gets recommended by planners.

US Letter and A4, vector text, standard-14 embedded fonts via
[pdf-lib](https://pdf-lib.js.org) (MIT), vendored locally in
`vendor-pdf-lib.js` so exports work offline.

## Architecture

- No backend, no account, no upload. IndexedDB per-project storage
  (`store.js`), one-tap `.json` export/import for backup.
- `model.js` is pure logic (parsing, validation, auto-arrange), unit-tested
  including a fuzz pass on the arranger.
- `pdf.js` takes PDFLib as a parameter, so tests drive it with the npm package
  while the browser passes the vendored global.
- Monetization per the doc: tips are only ever asked for **after an export
  succeeds**, never before, never mid-flow. Set `CONFIG.tipUrl` in `app.js`.

## Tests

```sh
ln -s <path-with-pdf-lib>/node_modules node_modules   # or npm i --no-save pdf-lib jsdom
node test/model.test.mjs
node test/pdf.test.mjs
node test/smoke.test.mjs
```
