# Scan to PDF

Photograph pages, check each one full size, reorder and rotate them, get one
clean PDF you named yourself. The mobile-scanner market is a ransom racket —
watermarks, "3 free scans," $4.99-a-week subscriptions, and your tax documents
uploaded to servers in who-knows-where. This one runs entirely in the browser.

What it does, and what that costs:

- **Captures survive a reload.** Each page is written to IndexedDB as a Blob
  (not a data URL — 100 pages is ~80 MB and base64 would add a third again),
  with order and rotation in one small `sws.scan.order` localStorage record so
  a reorder rewrites 2 KB instead of 40 MB. On the next load the pages come
  back behind a keep-or-clear banner. An incoming call no longer costs you
  eight pages of a lease.
- **Nothing un-embeddable is ever accepted.** Decoding *is* the acceptance
  test: `createImageBitmap` runs at add time and a file that fails is refused
  by name, with HEIC called out specifically because it is the iPhone default
  and Chrome cannot read it. Every stored page is a canvas-encoded JPEG, so
  `embedJpg` cannot fail later — and if a document would end up with zero
  pages, nothing downloads at all.
- **Rotation is metadata**, `0/90/180/270` clockwise, applied with a CSS
  transform on screen and `pdf-lib`'s `rotate` at export. Four quarter turns
  used to re-encode the JPEG four times (measured: 37.7 dB PSNR, 472 KB → 558
  KB). Now they cost nothing.
- **Page geometry follows the capture.** Letter, A4 or fit-to-image, and the
  sheet turns landscape for a landscape scan instead of drawing it at 32% of
  the paper.
- **Every limit is stated before it bites**: 100 pages per PDF, 150 MB of
  photos per sitting, 2600px long edge (~230 dpi on Letter), 60-character
  filename. Each one names its real number when it stops you.
- **Undo, never a confirm.** Delete, clear-everything and retake all snapshot
  first and restore through `SWS.undo`. The viewer is a modal `<dialog>`, so
  its undo lives inside the dialog and moves to the toast when it closes.
- **Print prints the pages**, one uncropped capture per sheet, not the
  interface.

Everything is on-device. The page opens no network connection after load;
`connect-src 'none'` in the CSP meta makes that machine-checkable rather than
merely promised. Canvas re-encoding strips EXIF, so exported PDFs carry no
camera metadata and no GPS.

`CONFIG.tipUrl` in `app.js` for the tip jar.
Test: `node test/pdf.test.mjs`, then `node design/stress.mjs scan-to-pdf` and
`node design/a11y.mjs scan-to-pdf` from the repo root.
Bump `VERSION` in `sw.js` on deploy — and keep `ASSETS` in step with the file
list, or the app silently stops working offline.
