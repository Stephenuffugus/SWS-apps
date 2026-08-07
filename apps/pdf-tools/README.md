# PDF Tools

Merge PDFs, reorder pages across files, rotate, drop pages, split into
one-file-per-page — entirely in the browser via vendored pdf-lib. The popular
PDF sites route your tax returns, contracts, and medical records through their
servers and then paywall the second merge of the day; here the documents never
leave the tab, there are no limits, and free means free. Password-protected
PDFs get an honest explanation instead of a crash. A free tool by Sky Wolf
Studios.

Core operations unit-tested (interleaved merge, rotation stacking/wrap,
out-of-range safety, split). `CONFIG.tipUrl` in `app.js` for the tip jar.
Test: `node test/core.test.mjs`.
