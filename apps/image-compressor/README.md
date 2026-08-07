# Image Compressor

Resize and re-encode images entirely in the browser: max-dimension presets,
quality slider, JPEG/WebP/PNG output, per-file and total savings readouts,
batch up to 50. The "free online resizer" industry quietly keeps a copy of
every photo passed through it; here nothing is ever uploaded. JPEG output
composites onto white (no black transparency), WebP falls back to JPEG on old
Safari, and nothing ever upscales. A free tool by Sky Wolf Studios.

`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/helpers.test.mjs`.
