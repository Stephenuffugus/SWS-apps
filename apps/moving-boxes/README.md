# Moving Boxes

Number every box, list what's inside as you pack, and answer the moving-day
question — "which box has the can opener?" — with search instead of a box
knife. Print QR labels: scanning one with any phone camera opens that box's
contents, which travel INSIDE the QR itself, so it works at the new house
before the wifi does, on anyone's phone, with no account or server. Sibling
of Home Inventory. localStorage + export/import backup. A free tool by Sky
Wolf Studios.

Two printed documents, never both at once: a sheet of QR labels
(`body.print-labels`) or the dated packing list with room totals
(`body.print-manifest`). Contents stay OFF the outside of the label unless the
user ticks the box — they already travel inside the QR. Label QRs are sized in
mm from their module count so no printed code goes below 0.5mm per module;
anything that will not fit is trimmed with a marker and named on screen.

`CONFIG.tipUrl` in `app.js` for the tip jar.
Tests: `node test/helpers.test.mjs` (pure logic) and
`node test/scan.browser.mjs` (drives a real label URL in Chromium — the
headline feature once rendered a blank page and no unit test could see it).
