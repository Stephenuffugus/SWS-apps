# Signature Maker

Draw your signature, download a transparent PNG cropped tight to the ink, and
drop it onto any contract or form. Signature sites make you upload the single
most forgeable piece of personal data you own to someone else's server; this
one runs entirely in your browser. A free tool by Sky Wolf Studios.

Smoothed strokes (quadratic through coalesced pointer events), black or blue
ink, three pen weights, undo per stroke, 3× export resolution with auto-crop
(`trimBounds` — unit-tested). `CONFIG.tipUrl` in `app.js` for the tip jar.

Test: `node test/helpers.test.mjs`
