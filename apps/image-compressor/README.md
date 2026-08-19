# Image Compressor

Resize and re-encode images entirely in the browser. The "free online resizer"
industry quietly keeps a copy of every photo passed through it; here nothing is
ever uploaded, and the claim is testable, turn off the network and the whole
app still loads and still compresses.

**Two ways to ask for a size.** *Fit under a size* is the primary control: pick
a byte target (20 KB … 25 MB, or type your own) and the encoder is
binary-searched until it fits, dropping the pixel size only if quality alone
cannot get there. Targets are decimal KB (200 KB = 200,000 bytes) so the result
clears the limit whichever way the form counts a kilobyte. *Pick a quality* is
the old slider, kept for people who want it.

**Pixel size** is longest-edge presets, *fit inside W×H*, or *exactly W×H*,
which centre-crops so a passport form asking for 600×600 gets 600×600.

**The hard promise: it never hands back a bigger file.** Canvas PNG is
unquantised lossless RGBA and routinely inflates a photo several times over. If
a re-encode comes out larger, the original bytes are returned untouched, the row
says so with the measured multiple, and, where it is true, it names the format
that would have worked ("WebP would be 69% smaller than the original here").

**Metadata is a choice with the consequence written out.** The default drops
everything, including GPS. *Keep the date taken* re-injects a minimal EXIF APP1
carrying only DateTimeOriginal / DateTimeDigitized / DateTime, no Orientation
(the pixels are already upright), no Make, no Model, no GPS, so a photo library
still sorts the copies correctly. JPEG output only.

Other behaviour worth knowing: JPEG composites onto white and says so when the
source actually had transparency; WebP falls back to JPEG on old Safari and the
extension follows what was really encoded; nothing upscales unless *exactly
W×H* asks it to. Files this browser cannot open (HEIC, RAW, SVG, empty) get a
row naming the format and the route out, not a toast. Download all builds one
store-only ZIP rather than N sequential downloads behind a permission prompt.
Queue cap is 200 images and it names every file it could not take.

Nothing about your images is persisted. `localStorage['imgc.settings.v2']` holds
the settings you last chose and nothing else.

`CONFIG.tipUrl` in `app.js` for the tip jar.
Tests: `node test/helpers.test.mjs` and `node test/zip.test.mjs`.
