# Signature Maker

Make a signature image and put it on a document, without handing the single
most forgeable piece of personal data you own to somebody else's server. Three
routes to the same artefact — **draw** it, **type** it, or **photograph** the
one you already signed on paper — and an export that tells you its exact pixel
size, byte size and print size *before* you commit to it.

Nothing is uploaded and nothing is stored on the device. A draft of the stroke
geometry lives in `sessionStorage` so a reflex refresh is survivable; closing
the tab erases it, and the page says so out loud.

## What it does

- **Draw / Type / Photo.** The typed route uses a handwriting face already on
  the device; the photo route drops the paper with a soft luminance threshold
  you control. Both are keyboard-reachable, which the pointer-only pad was not.
- **Export presets with a live readout** — transparent PNG at about 1200 px or
  300 px, JPG on white, and exactly 140 × 60 or 160 × 60 JPG under 30 KB for
  exam portals. The readout states px, KB and inches at 300 dpi and updates as
  you draw. Output size no longer depends on the browser window.
- **Copy to clipboard** beside Download, where the browser allows it.
- **Undo on everything destructive**, including Clear, via `SWS.undo`.
- **A validity block** naming where a drawn signature is not accepted (USCIS
  filings, wills, adoption papers, court orders) and a printable sign-in-ink
  sheet for those, since printing this page is what that route needs.

## Things that are load-bearing

- Stroke points are stored in the pad's *current* CSS pixel space and remapped
  uniformly whenever the pad's box changes (`remap`). That is what stops a
  landscape signature being cropped on rotation.
- `fitCanvas` is driven by a **ResizeObserver on the pad**, not `window.resize`
  — the comfort panel's Spacing dial resizes the pad without firing a resize
  event, which used to leave the ink 14 px from the finger.
- `.padwrap` is a true white rectangle in every theme and is lifted above the
  base's warm-tint overlay (`z-index:10000`), because the pad is a WYSIWYG
  preview of ink on paper. `.actionbar`, `#toast` and `.skip` are lifted above
  it in turn. Never apply a filter, tint or blend to the pad.
- `--pad-rule` and `--pad-mark` are solved against `#ffffff`, not against the
  page tokens, and respond to the Contrast setting.
- `touch-action:none` on `.padwrap` is functional: it is what makes the page
  draw instead of scroll.

`CONFIG.tipUrl` in `app.js` for the tip jar. Bump `VERSION` in `sw.js` on any
deploy — it is cache-first.

Test: `node test/helpers.test.mjs`
