// PDF smoke tests — node test/pdf.test.mjs (pdf-lib via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newInventory } from '../model.js';
import { makeInventoryPdf, makeAdjusterPdf } from '../pdf.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

// tiny valid 1x1 JPEG
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

const inv = newInventory('42 Wallaby Way');
inv.rooms = [{ id: 'R1', name: 'Living room' }, { id: 'R2', name: 'Garage' }];
inv.items = Array.from({ length: 17 }, (_, i) => ({
  id: 'i' + i,
  roomId: i % 2 ? 'R1' : 'R2',
  name: 'Item ' + i,
  serial: i % 3 ? 'SN-' + i : '',
  purchaseDate: '',
  valueCents: (i + 1) * 12500,
  notes: '',
  photo: i % 2 ? TINY_JPEG : null,
  receipt: null,
}));

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 300)); }
}

for (const size of ['letter', 'a4']) {
  await t(`full report with embedded photos (${size})`, async () => {
    const bytes = await makeInventoryPdf(PDFLib, inv, size);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 3, 'cover + room pages, got ' + doc.getPageCount());
  });
  await t(`adjuster list (${size})`, async () => {
    const bytes = await makeAdjusterPdf(PDFLib, inv, size);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });
}

await t('corrupt photo data does not kill the report', async () => {
  const bad = newInventory('Bad photos');
  bad.rooms = [{ id: 'R1', name: 'Room' }];
  bad.items = [{ id: 'i1', roomId: 'R1', name: 'Ghost', serial: '', purchaseDate: '',
    valueCents: 100, notes: '', photo: 'data:image/jpeg;base64,!!!notbase64', receipt: null }];
  const bytes = await makeInventoryPdf(PDFLib, bad, 'letter');
  assert.ok(bytes.length > 800);
});

await t('empty inventory still produces a cover page', async () => {
  const bytes = await makeInventoryPdf(PDFLib, newInventory('Empty'), 'letter');
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});

await t('40-room cover paginates instead of drawing off-page', async () => {
  const big = newInventory('Forty rooms');
  big.rooms = Array.from({ length: 40 }, (_, i) => ({ id: 'R' + i, name: 'Room ' + (i + 1) }));
  big.items = big.rooms.map((r, i) => ({ id: 'i' + i, roomId: r.id, name: 'Thing', serial: '',
    purchaseDate: '', valueCents: 1000, notes: '', photo: null, receipt: null }));
  // instrument: record every drawText y to prove nothing lands below the margin
  const ys = [];
  const orig = PDFLib.PDFPage.prototype.drawText;
  PDFLib.PDFPage.prototype.drawText = function (text, opts) { ys.push(opts.y); return orig.call(this, text, opts); };
  let bytes;
  try { bytes = await makeInventoryPdf(PDFLib, big, 'letter'); }
  finally { PDFLib.PDFPage.prototype.drawText = orig; }
  assert.ok(ys.every(y => y >= 0), 'no negative-y draws; min=' + Math.min(...ys));
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 2, 'cover spilled to a second page');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
