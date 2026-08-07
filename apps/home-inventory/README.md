# Home Inventory

Engine 2 (local data → print-ready PDF), skin B. The trigger is a sentence
that recurs in every disaster thread: *"I wish I'd photographed everything
before the fire."* Competitors can't be local-first because they sell cloud
storage; we can, because we sell nothing. A free tool by Sky Wolf Studios.

## Design center: fast capture

Point, shoot, name, next. Room select stays put, the camera input loops, and
the only required field is a name. Serial numbers, values, purchase dates,
and receipt photos can be added later from the Items tab — speed now, detail
later. Photos are compressed at capture (canvas resize to 1280px JPEG) so a
40-room house doesn't eat gigabytes of IndexedDB.

## Export is the product

- **Full report** — cover summary (items, photographed count, total value),
  then a page per room with a photo grid and value details.
- **Adjuster's list** — every item sorted by value descending with room,
  serial, and totals: the format insurance adjusters actually ask for.
- **Backup .json** — everything including photos, restorable anywhere.

The app nags — deliberately and repeatedly — to get exports OFF the device.
A local-only inventory that burns up with the house is a cruel joke.

## Architecture

No backend, no account, no upload. `model.js` (pure logic) and `pdf.js`
(pdf-lib injected) are unit-tested; a jsdom smoke test drives the UI.
`vendor-pdf-lib.js` is [pdf-lib](https://pdf-lib.js.org) (MIT), vendored for
offline exports. Tips only after successful export: `CONFIG.tipUrl` in `app.js`.

## Tests

```sh
npm i --no-save pdf-lib jsdom
npm test
```
