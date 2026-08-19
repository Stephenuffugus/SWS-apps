# Sitter Sheet

One printable page with everything the babysitter or pet sitter needs:
contacts, routines, meals, meds, allergies, house quirks. Data lives in
localStorage on your device only — family details are nobody's business. A free
tool by Sky Wolf Studio.

**Two documents, one form.** The parent gets an edit form with a live print
preview that is literally the printed page. The sitter — anyone opening the
shared link or scanning the QR — gets a separate read-only page led by a
3-second panel: street address and cross street, allergies and medications,
and 911 / Poison Control as tap-to-call targets. Every phone number in the
sitter's view is a `tel:` link.

**Opening a link saves nothing.** A shared sheet is held in memory and rendered
read-only; the recipient's device is only written to if they press *Save to
this device*. The hash stays in the URL so a reload still works offline.

**Outputs.** Print / Save as PDF, Copy link, Copy as plain text, QR. The QR
refuses rather than drawing a code too dense to scan, and offers the link
instead. Download my sheet produces a plain JSON file, and Open a saved file
reads it back.

Two modes (babysitter / pet sitter) with separate saved sheets. `CONFIG.tipUrl`
in `app.js` for the tip jar.

Tests: `node test/smoke.test.mjs` and `node test/sitter-view.test.mjs` (jsdom).
The print layer is only verifiable by generating a real PDF — see
`design/stress.mjs` and drive `page.pdf()` through `design/harness.mjs`.
