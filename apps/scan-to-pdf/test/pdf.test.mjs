// Run: node test/pdf.test.mjs (pdf-lib via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { makePdfFromImages, PAGE } from '../pdf.js';
import { moveItem, normRot, safeFileName, formatBytes, estimatePdfBytes, todayStamp } from '../helpers.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

// 1x1 JPEG.
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

/* pdf-lib deflates its content streams, so reading the placement back out
   means inflating every stream in the file and reading the `cm` operators. */
function inflateStreams(bytes) {
  const buf = Buffer.from(bytes);
  let out = '';
  let at = 0;
  for (;;) {
    const s = buf.indexOf('stream', at);
    if (s < 0) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf('endstream', start);
    if (e < 0) break;
    try { out += zlib.inflateSync(buf.subarray(start, e)).toString('latin1') + '\n'; }
    catch (err) { /* an image stream, not a content stream */ }
    at = e + 9;
  }
  return out;
}

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e && e.stack || e).slice(0, 400)); }
}

const P = (n, extra) => Array.from({ length: n }, () => ({ dataUrl: TINY_JPEG, ...(extra || {}) }));

for (const size of ['letter', 'a4', 'fit']) {
  await t(`three pages become a three-page PDF (${size})`, async () => {
    const { bytes, skipped, made } = await makePdfFromImages(PDFLib, P(3), size);
    assert.equal(skipped, 0);
    assert.equal(made, 3);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 3);
  });
}

await t('corrupt images are skipped, not fatal', async () => {
  const { bytes, skipped, made } = await makePdfFromImages(PDFLib,
    [{ dataUrl: TINY_JPEG }, { dataUrl: 'data:image/jpeg;base64,!!!' }, { dataUrl: 'junk' }], 'letter');
  assert.equal(skipped, 2);
  assert.equal(made, 1);
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});

/* This used to assert the opposite, a blank one-page PDF, and that blank
   PDF is what the audit caught being downloaded and announced as "saved"
   after four unreadable files. No usable page must mean no file at all. */
await t('zero usable pages yields NO file, so nothing can be called "saved"', async () => {
  const empty = await makePdfFromImages(PDFLib, [], 'letter');
  assert.equal(empty.bytes, null);
  assert.equal(empty.made, 0);
  const allBad = await makePdfFromImages(PDFLib, [{ dataUrl: 'junk' }, { dataUrl: '' }], 'letter');
  assert.equal(allBad.bytes, null);
  assert.equal(allBad.made, 0);
  assert.equal(allBad.skipped, 2);
});

await t('a Letter page is 612x792 and an unknown size falls back to Letter', async () => {
  for (const size of ['letter', 'nonsense-size']) {
    const { bytes } = await makePdfFromImages(PDFLib, P(1), size);
    const doc = await PDFLib.PDFDocument.load(bytes);
    const { width, height } = doc.getPage(0).getSize();
    assert.equal(Math.round(width), 612, size);
    assert.equal(Math.round(height), 792, size);
  }
});

await t('accepts raw bytes as well as data URLs', async () => {
  const bin = Buffer.from(TINY_JPEG.split(',')[1], 'base64');
  const { bytes, made } = await makePdfFromImages(PDFLib, [{ bytes: new Uint8Array(bin) }], 'letter');
  assert.equal(made, 1);
  assert.ok(bytes && bytes.length > 400);
});

await t('a quarter turn keeps the page portrait; a half turn changes nothing', async () => {
  for (const rot of [0, 180]) {
    const { bytes } = await makePdfFromImages(PDFLib, P(1, { rot }), 'letter');
    const { width, height } = (await PDFLib.PDFDocument.load(bytes)).getPage(0).getSize();
    assert.equal(Math.round(width), 612);
    assert.equal(Math.round(height), 792);
  }
  /* The 1x1 test image is square, so 90/270 must also stay on a portrait
     sheet, the landscape rule keys off the image, not the rotation. */
  for (const rot of [90, 270]) {
    const { bytes, made } = await makePdfFromImages(PDFLib, P(1, { rot }), 'letter');
    assert.equal(made, 1);
    const { width, height } = (await PDFLib.PDFDocument.load(bytes)).getPage(0).getSize();
    assert.equal(Math.round(width), 612);
    assert.equal(Math.round(height), 792);
  }
});

await t('"fit to image" makes a square sheet for a square capture', async () => {
  const { bytes } = await makePdfFromImages(PDFLib, P(1), 'fit');
  const { width, height } = (await PDFLib.PDFDocument.load(bytes)).getPage(0).getSize();
  assert.equal(Math.round(width), 792);
  assert.equal(Math.round(height), 792);
  assert.equal(PAGE.fit, null);
});

await t('a rotated page still draws inside the sheet', async () => {
  /* Regression guard for the anchor maths: pdf-lib turns anticlockwise about
     (x, y), so every quarter turn moves the corner the image hangs from. If
     that is wrong the content stream carries a negative placement. */
  const CM = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g;
  for (const rot of [0, 90, 180, 270]) {
    const { bytes } = await makePdfFromImages(PDFLib, P(1, { rot }), 'letter');
    const text = inflateStreams(bytes);
    const spots = [...text.matchAll(CM)].map((m) => [Number(m[5]), Number(m[6])]);
    assert.ok(spots.length, `rot ${rot}: no transform found in the output`);
    for (const [x, y] of spots) {
      assert.ok(x >= 0 && x <= 612, `rot ${rot}: x=${x} is off a 612pt sheet`);
      assert.ok(y >= 0 && y <= 792, `rot ${rot}: y=${y} is off a 792pt sheet`);
    }
  }
});

await t('moveItem bounds-checks', async () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 2, 1), [1, 2, 3]);
  const arr = [1, 2, 3];
  assert.equal(moveItem(arr, 0, -1), arr, 'a no-op returns the SAME array, which is how the UI knows not to redraw');
});

await t('normRot snaps to the four quarters, in both directions', async () => {
  assert.equal(normRot(0), 0);
  assert.equal(normRot(-90), 270);
  assert.equal(normRot(360), 0);
  assert.equal(normRot(450), 90);
  assert.equal(normRot(undefined), 0);
  assert.equal(normRot('90'), 90);
});

await t('safeFileName never produces an empty or path-bearing name', async () => {
  assert.equal(safeFileName('2026-08-09-lease'), '2026-08-09-lease.pdf');
  assert.equal(safeFileName(''), 'scan.pdf');
  assert.equal(safeFileName('   '), 'scan.pdf');
  const traversal = safeFileName('../../etc/passwd');
  assert.ok(!/[\\/]/.test(traversal), 'a path must not survive into the download name: ' + traversal);
  assert.ok(traversal.endsWith('.pdf'));
  const nasty = safeFileName(String.fromCharCode(0) + 'a/b\\c:d*e?f"g<h>i|j');
  assert.ok(!/[\u0000\\/:*?"<>|]/.test(nasty), 'unsafe characters survived: ' + nasty);
  assert.equal(safeFileName('taxes.pdf'), 'taxes.pdf');
  // control characters vanish, runs of whitespace collapse, the name survives
  assert.equal(safeFileName('a  ' + String.fromCharCode(0) + String.fromCharCode(9) + 'b'), 'a b.pdf');
  assert.equal(safeFileName('x'.repeat(200)), 'x'.repeat(60) + '.pdf');
  assert.equal(safeFileName('name.'), 'name.pdf');
  assert.equal(safeFileName(null), 'scan.pdf');
});

await t('formatBytes reads the way a person reads a file size', async () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(999), '999 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(2.1 * 1024 * 1024), '2.1 MB');
  assert.equal(formatBytes(NaN), '—');
});

await t('the size estimate lands within 5% of a real export', async () => {
  const img = Buffer.from(TINY_JPEG.split(',')[1], 'base64');
  const n = 50;
  const { bytes } = await makePdfFromImages(PDFLib,
    Array.from({ length: n }, () => ({ bytes: new Uint8Array(img) })), 'letter');
  const guess = estimatePdfBytes(img.length * n, n);
  const err = Math.abs(guess - bytes.length) / bytes.length;
  assert.ok(err < 0.05, `estimate ${guess} vs real ${bytes.length} (${(err * 100).toFixed(1)}% out)`);
});

await t('todayStamp is the local date, not UTC', async () => {
  assert.equal(todayStamp(new Date(2026, 7, 9, 23, 30)), '2026-08-09');
  assert.match(todayStamp(), /^\d{4}-\d{2}-\d{2}$/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
