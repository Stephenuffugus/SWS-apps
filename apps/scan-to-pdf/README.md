# Scan to PDF

Photograph pages, reorder and rotate them, get one clean PDF. The mobile-scanner
market is a ransom racket — watermarks, "3 free scans," subscriptions, and your
tax documents uploaded to servers in who-knows-where. This one runs entirely in
the browser: capture-time compression (2000px JPEG), on-device PDF assembly via
vendored pdf-lib, Letter or A4, up to 100 pages. Corrupt images are skipped,
never fatal (tested). A free tool by Sky Wolf Studios.

`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/pdf.test.mjs`.
