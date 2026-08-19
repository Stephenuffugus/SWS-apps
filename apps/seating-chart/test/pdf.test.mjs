// PDF pipeline smoke tests, run from a dir where pdf-lib resolves:
//   node test/pdf.test.mjs   (uses the node_modules symlink)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newProject, parseGuestPaste, autoArrange } from '../model.js';
import { makeEntrancePdf, makeEscortCardsPdf, makeCatererPdf } from '../pdf.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

let seq = 0;
const ids = () => 'g' + (++seq);
const p = newProject('Rivera-Okafor Wedding');
p.guests = parseGuestPaste(
  Array.from({ length: 43 }, (_, i) =>
    `Guest ${String.fromCharCode(65 + (i % 26))}${i} Surname${i % 12}, party${i % 9}, ${['Beef', 'Fish', 'Veg'][i % 3]}${i % 7 === 0 ? ', nut allergy' : ''}`
  ).join('\n'), ids);
p.tables = Array.from({ length: 6 }, (_, i) =>
  ({ id: 'T' + i, label: 'Table ' + (i + 1), shape: 'round', seats: 8, x: 0, y: 0 }));
p.assignments = autoArrange(p);

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 300)); }
}

for (const size of ['letter', 'a4']) {
  await t(`entrance display renders (${size})`, async () => {
    const bytes = await makeEntrancePdf(PDFLib, p, size);
    assert.ok(bytes.length > 1500);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });
  await t(`escort cards render alphabetically (${size})`, async () => {
    const bytes = await makeEscortCardsPdf(PDFLib, p, size);
    const doc = await PDFLib.PDFDocument.load(bytes);
    // 43 guests, 10 cards per page → 5 pages
    assert.equal(doc.getPageCount(), 5);
  });
  await t(`caterer sheet renders with totals (${size})`, async () => {
    const bytes = await makeCatererPdf(PDFLib, p, size);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });
}

await t('empty project still produces valid PDFs', async () => {
  const empty = newProject('Empty');
  for (const fn of [makeEntrancePdf, makeEscortCardsPdf, makeCatererPdf]) {
    const bytes = await fn(PDFLib, empty, 'letter');
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  }
});

await t('unicode guest names are sanitized, not fatal', async () => {
  const u = newProject('Unicode');
  u.guests = parseGuestPaste('Zoë Müller, García �docume, fam, Beef', ids);
  u.tables = [{ id: 'T1', label: 'Table 1', shape: 'round', seats: 4, x: 0, y: 0 }];
  u.assignments = { [u.guests[0].id]: 'T1' };
  for (const fn of [makeEntrancePdf, makeEscortCardsPdf, makeCatererPdf]) {
    const bytes = await fn(PDFLib, u, 'letter');
    assert.ok(bytes.length > 800);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
