# Home Inventory

Engine 2 (local data → print-ready PDF), skin B. The trigger is a sentence
that recurs in every disaster thread: *"I wish I'd photographed everything
before the fire."* Competitors can't be local-first because they sell cloud
storage; we can, because we sell nothing. A free tool by Sky Wolf Studio.

## Design center: fast capture

Point, shoot, name, next. The room select stays put, focus returns to the name
field after every save, and the only required field is a name. Serial numbers,
brand, model, condition, replacement cost, receipts and dates can be added
later from the Items tab, speed now, detail later.

Photos are compressed at capture and the app says so before you shoot: wide
shots resize to 1280px JPEG 0.8 (~100KB) so a 40-room house doesn't eat
gigabytes of IndexedDB, and a **Close-up** tick keeps 2400px / 0.92 for serial
plates, hallmarks and receipts, where the detail is the whole point.

## Saving is not fire-and-forget

Nothing says "Saved" until the write has resolved *and* the row has been read
back with `getKey`. A failed write raises a banner that does not dismiss, does
not throttle, and counts the changes that exist only in the tab. On the first
successful save the app requests `navigator.storage.persist()`, and it shows
remaining quota and an Add-to-Home-Screen step with the reason attached, WebKit clears an uninstalled site's storage after about seven idle days.

## Export is the product

- **Full report (PDF)**, cover summary, then a page per room with a photo grid
  and value details. All text is fitted by measured width, so long names
  ellipsise instead of running off the paper.
- **Items by value (PDF)**, the human exhibit to attach to a claim.
- **Spreadsheet (CSV)**, Quantity, Description, Brand/Make, Model, Serial,
  Room, Purchase date, Condition, Original cost, Replacement cost, Photo file,
  Notes. This is what XactContents, ClaimXperience and a carrier's own contents
  form ingest, and cells beginning `= + - @` are prefixed so a spreadsheet does
  not execute them.
- **Spreadsheet + photos (ZIP)**, the same CSV plus every photo, named exactly
  as the Photo file column says (`zip.js` is a 90-line store-only writer; JPEGs
  are already compressed).
- **Backup .json**, everything including photos, restorable anywhere.

The two PDF faces are WinAnsi-encoded, so `pdf.js` transliterates anything
outside CP1252 (Gdańsk → Gdansk, Обручальное → Obruchalnoe, Şişli → Sisli) and
**reports** what it still cannot draw, CJK, Hebrew, Arabic, emoji, both in
the app before you export and on the cover of the PDF itself. The CSV and the
backup always keep the original text.

Importing never overwrites: a backup whose id matches something already here
offers Keep both / Replace, and Replace is routed through `SWS.undo`.

The app nags, deliberately and repeatedly, to get exports OFF the device.
A local-only inventory that burns up with the house is a cruel joke.

## Architecture

No backend, no account, no upload. `model.js` (pure logic, plus the sanitiser
every record passes through on load and on import), `pdf.js` and `zip.js` are
unit-tested; a jsdom smoke test drives the UI. `vendor-pdf-lib.js` is
[pdf-lib](https://pdf-lib.js.org) (MIT), vendored for offline exports. There is
no `prompt()` and no `confirm()` anywhere: naming happens in `#askDlg`, and
every destructive action is undoable through the shared `SWS.undo`.

## Tests

```sh
npm i --no-save pdf-lib jsdom
npm test
```
