# PDF Tools

Merge PDFs, reorder pages across files, rotate, drop pages, and split, entirely
in the browser via vendored pdf-lib. The popular PDF sites route your tax
returns, contracts, and medical records through their servers and then paywall
the second merge of the day; here the documents never leave the tab, there are
no limits, and free means free. Password-protected and damaged PDFs get an
honest explanation instead of a crash. A free tool by Sky Wolf Studio.

## Things worth knowing before changing it

- **Split runs on the assembled order, not on the source document.** Every
  output file is written by the same `buildOutput()` path as a merge, so a
  deleted page stays deleted and a rotation shown on screen is the rotation
  that lands in the file. `splitGroups()` turns a mode + spec into groups of
  row indices; `splitNames()` turns those groups into the exact filenames the
  UI previews.
- **The rotation badge shows the final angle**, source rotation included, `finalAngle(sourceAngle, added)`. Showing only the user's delta lies on any
  scan that already carries `/Rotate 90`.
- **Nothing is persisted.** No localStorage, by design. `beforeunload` guards
  an unsaved arrangement and the `.trust` stamp says so out loud.
- **`zipStore()` is a stored (uncompressed) ZIP writer**, ~80 lines and no
  dependency. PDFs are already compressed, so deflate would buy a few percent
  for a large library. It exists so a 200-file split is one download instead of
  200, which also removes the browser's multiple-download prompt.
- **`render()` restores focus.** Every row action names the control focus
  should land on afterwards; without that, a keyboard reorder costs one move
  per journey through the list.
- Errors the user is meant to read are tagged by `humanError()` / `isHuman()`.
  A raw exception string must never reach the screen.

`CONFIG.tipUrl` in `app.js` for the tip jar. Adding a file to the app means
adding it to `ASSETS` in `sw.js`, or it silently breaks offline.

Test: `node test/core.test.mjs` (needs `unzip` and `python3` for the ZIP
round-trip checks).
