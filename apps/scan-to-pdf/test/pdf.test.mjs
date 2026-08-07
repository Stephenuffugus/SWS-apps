// Run: node test/pdf.test.mjs (pdf-lib via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makePdfFromImages } from '../pdf.js';
import { moveItem } from '../helpers.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 300)); }
}

for (const size of ['letter', 'a4']) {
  await t(`three pages become a three-page PDF (${size})`, async () => {
    const { bytes, skipped } = await makePdfFromImages(PDFLib,
      [{ dataUrl: TINY_JPEG }, { dataUrl: TINY_JPEG }, { dataUrl: TINY_JPEG }], size);
    assert.equal(skipped, 0);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 3);
  });
}
await t('corrupt images are skipped, not fatal', async () => {
  const { bytes, skipped } = await makePdfFromImages(PDFLib,
    [{ dataUrl: TINY_JPEG }, { dataUrl: 'data:image/jpeg;base64,!!!' }, { dataUrl: 'junk' }], 'letter');
  assert.equal(skipped, 2);
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});
await t('zero usable pages still yields a valid (blank) PDF', async () => {
  const { bytes } = await makePdfFromImages(PDFLib, [], 'letter');
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});
await t('moveItem bounds-checks', async () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 2, 1), [1, 2, 3]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
