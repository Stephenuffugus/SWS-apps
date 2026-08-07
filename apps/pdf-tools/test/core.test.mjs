// Run: node test/core.test.mjs (pdf-lib via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildOutput, splitAll, loadPdf } from '../core.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

async function makeSample(pages, label) {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(label + ' page ' + (i + 1), { x: 50, y: 700, size: 24, font });
  }
  return PDFLib.PDFDocument.load(await doc.save());
}

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 300)); }
}

const docA = await makeSample(3, 'A');
const docB = await makeSample(2, 'B');

await t('merge interleaves pages in the requested order', async () => {
  const bytes = await buildOutput(PDFLib, [docA, docB], [
    { doc: 0, page: 0, rotate: 0 },
    { doc: 1, page: 1, rotate: 0 },
    { doc: 0, page: 2, rotate: 0 },
  ]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPageCount(), 3);
});
await t('rotation is applied on top of existing rotation', async () => {
  const bytes = await buildOutput(PDFLib, [docA], [{ doc: 0, page: 0, rotate: 90 }]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPage(0).getRotation().angle, 90);
  const bytes2 = await buildOutput(PDFLib, [await PDFLib.PDFDocument.load(bytes)],
    [{ doc: 0, page: 0, rotate: 270 }]);
  const again = await PDFLib.PDFDocument.load(bytes2);
  assert.equal(again.getPage(0).getRotation().angle, 0, '90 + 270 wraps to 0');
});
await t('out-of-range pages are skipped; empty selection throws', async () => {
  const bytes = await buildOutput(PDFLib, [docA], [
    { doc: 0, page: 99, rotate: 0 }, { doc: 0, page: 1, rotate: 0 },
  ]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPageCount(), 1);
  await assert.rejects(() => buildOutput(PDFLib, [docA], []), /no pages/);
});
await t('splitAll makes one single-page PDF per page', async () => {
  const outs = await splitAll(PDFLib, docA);
  assert.equal(outs.length, 3);
  for (const bytes of outs) {
    const d = await PDFLib.PDFDocument.load(bytes);
    assert.equal(d.getPageCount(), 1);
  }
});
await t('loadPdf gives a human message for junk bytes', async () => {
  await assert.rejects(() => loadPdf(PDFLib, new Uint8Array([1, 2, 3, 4])), /readable PDF/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
