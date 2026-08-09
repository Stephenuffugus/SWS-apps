// Export + hostile-backup tests — node test/export.test.mjs
// These cover the three things the review found were silently destructive:
// a malformed backup, a PDF that mangles names or runs off the paper, and a
// spreadsheet that does not exist.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  sanitizeInventory, totals, toCsv, csvRows, fmtCents, newInventory, newItem, CSV_COLUMNS,
} from '../model.js';
import { makeZip, crc32 } from '../zip.js';
import { pdfText, unprintable, makeInventoryPdf, makeAdjusterPdf, PAGE } from '../pdf.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e.message || e).slice(0, 400)); }
}

/* ── one bad row must not brick anything ─────────────────────────────────── */
await t('a bare null in items is dropped, not fatal', () => {
  const raw = { id: 'x', name: 'Hand edited', rooms: [{ id: 'R', name: 'Den' }], items: [null, { id: 'a', roomId: 'R', name: 'Chair', valueCents: 100 }] };
  assert.doesNotThrow(() => totals(raw));
  const clean = sanitizeInventory(raw);
  assert.equal(clean.items.length, 1);
  assert.equal(totals(clean).count, 1);
});

await t('non-numeric value never reaches the screen as NaN', () => {
  const clean = sanitizeInventory({ items: [{ name: 'Thing', valueCents: 'lots' }] });
  assert.equal(clean.items[0].valueCents, 0);
  assert.equal(fmtCents(totals(clean).valueCents), '$0');
  assert.ok(!/NaN/.test(fmtCents(totals({ items: ['chair'] }).valueCents)));
});

await t('rooms:null and items:[string] import without throwing', () => {
  const clean = sanitizeInventory({ rooms: null, items: ['chair', 7, {}] });
  assert.equal(clean.rooms.length, 0);
  assert.equal(clean.items.length, 1);
  assert.equal(clean.items[0].name, 'Untitled item');
});

/* ── money ───────────────────────────────────────────────────────────────── */
await t('rows and total agree to the cent', () => {
  const inv = newInventory('Cents');
  inv.rooms = [{ id: 'R', name: 'Room' }];
  inv.items = Array.from({ length: 312 }, (_, i) => newItem({ roomId: 'R', name: 'Thing ' + i, valueCents: 1999 }));
  const rowSum = inv.items.reduce((a, i) => a + i.valueCents, 0);
  assert.equal(fmtCents(1999), '$19.99');
  assert.equal(rowSum, 623688);
  assert.equal(fmtCents(totals(inv).valueCents), '$6,236.88');
});

await t('quantity multiplies into the total', () => {
  const inv = newInventory('Qty');
  inv.rooms = [{ id: 'R', name: 'Dining' }];
  inv.items = [newItem({ roomId: 'R', name: 'Chair', quantity: 6, valueCents: 12000 })];
  assert.equal(totals(inv).valueCents, 72000);
  assert.equal(totals(inv).units, 6);
});

/* ── CSV ─────────────────────────────────────────────────────────────────── */
await t('CSV has the carrier columns and neutralises formulas', () => {
  const inv = newInventory('CSV house');
  inv.rooms = [{ id: 'R', name: 'Kitchen' }];
  inv.items = [newItem({ roomId: 'R', name: '=1+1', serial: 'SN"quote"', valueCents: 1999, replacementCents: 2500, quantity: 2, condition: 'Good', brand: 'Miele' })];
  const csv = toCsv(inv);
  const head = csv.split('\r\n')[0];
  assert.equal(head, CSV_COLUMNS.map(c => '"' + c + '"').join(','));
  const row = csv.split('\r\n')[1];
  assert.ok(row.includes('"\'=1+1"'), 'formula prefixed: ' + row);
  assert.ok(row.includes('"SN""quote"""'), 'quotes doubled: ' + row);
  assert.ok(row.includes('"19.99"') && row.includes('"25.00"'), 'costs to the cent: ' + row);
  assert.ok(row.startsWith('"2","'), 'quantity first: ' + row);
});

await t('CSV photo names line up with the ZIP entries', () => {
  const inv = newInventory('Zip house');
  inv.rooms = [{ id: 'R', name: 'Study' }];
  inv.items = [
    newItem({ roomId: 'R', name: 'Desk', photo: 'data:image/jpeg;base64,AQID' }),
    newItem({ roomId: 'R', name: 'Lamp' }),
  ];
  const rows = csvRows(inv);
  assert.equal(rows[0].photoName, 'photos/001-desk.jpg');
  assert.equal(rows[1].photoName, '');
});

/* ── ZIP ─────────────────────────────────────────────────────────────────── */
await t('the ZIP is a real ZIP (unzip -t agrees)', () => {
  assert.equal(crc32(new Uint8Array([0x31, 0x32, 0x33])), 0x884863D2);
  const bytes = makeZip([
    { name: 'inventory.csv', bytes: new TextEncoder().encode('a,b\r\n1,2\r\n') },
    { name: 'photos/001-desk.jpg', bytes: new Uint8Array([1, 2, 3, 4, 5]) },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const file = join(dir, 'out.zip');
  writeFileSync(file, bytes);
  const list = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
  assert.ok(list.includes('inventory.csv') && list.includes('photos/001-desk.jpg'), list);
  execFileSync('unzip', ['-t', file], { encoding: 'utf8' }); // throws on a CRC error
});

/* ── PDF text ────────────────────────────────────────────────────────────── */
await t('non-Latin names are transliterated, not turned into question marks', () => {
  assert.equal(pdfText('Łukasz’s Gdańsk crystal').text, 'Lukasz’s Gdansk crystal');
  assert.equal(pdfText('Şişli el yapımı halı').text, 'Sisli el yapimi hali');
  assert.equal(pdfText('Обручальное кольцо').text, 'Obruchalnoe koltso');
  assert.equal(pdfText('€1,200').text, '€1,200');
  assert.equal(pdfText('€1,200').lost, 0);
  assert.equal(pdfText('客厅').lost, 2); // CJK genuinely cannot be drawn…
  const hits = unprintable({ name: 'Dom', rooms: [{ id: 'r', name: '客厅' }], items: [] });
  assert.equal(hits.length, 1);        // …so it is reported, not hidden
  assert.equal(hits[0].asPrinted, '??');
});

/* ── PDF geometry: nothing may be drawn off the paper ────────────────────── */
const calls = [];
function recordingLib() {
  const proto = PDFLib.PDFPage.prototype;
  if (!proto._origDrawText) {
    proto._origDrawText = proto.drawText;
    proto.drawText = function (text, opts) {
      calls.push({ text, x: opts.x, y: opts.y, size: opts.size, font: opts.font });
      return proto._origDrawText.call(this, text, opts);
    };
  }
  calls.length = 0;
  return calls;
}

const LONG = 'Whitmore-Castellanos Family Residence at 1487 Old Mill Road';
const WIDEST = 'ANTIQUE MAHOGANY SIDEBOARD WITH BRASS HANDLES XX';

for (const maker of [makeInventoryPdf, makeAdjusterPdf]) {
  await t(maker.name + ': every line of text stays on the page', async () => {
    const inv = newInventory(LONG + ' and then some more address');
    inv.rooms = [{ id: 'R1', name: 'Le très grand salon de réception du rez-de-chaussée nord' }];
    inv.items = Array.from({ length: 6 }, (_, i) => newItem({
      roomId: 'R1', name: WIDEST, serial: 'SN-' + i, valueCents: 123456, quantity: 3,
    }));
    const calls = recordingLib();
    await maker(PDFLib, inv, 'letter');
    const { w } = PAGE.letter;
    const bad = calls.filter(c => {
      const width = c.font.widthOfTextAtSize(c.text, c.size);
      return c.x < 0 || c.x + width > w + 0.5;
    }).map(c => ({ text: c.text.slice(0, 30), x: Math.round(c.x), right: Math.round(c.x + c.font.widthOfTextAtSize(c.text, c.size)) }));
    assert.deepEqual(bad, [], JSON.stringify(bad));
  });
}

await t('room-grid captions do not collide with the next column', async () => {
  const inv = newInventory('Grid');
  inv.rooms = [{ id: 'R1', name: 'Room' }];
  inv.items = Array.from({ length: 4 }, () => newItem({ roomId: 'R1', name: WIDEST, valueCents: 999 }));
  const calls = recordingLib();
  await makeInventoryPdf(PDFLib, inv, 'letter');
  const { w } = PAGE.letter;
  const margin = 46, cellW = (w - margin * 2 - 16) / 2;
  const captions = calls.filter(c => c.text.startsWith('ANTIQUE'));
  assert.equal(captions.length, 4);
  for (const c of captions) {
    const width = c.font.widthOfTextAtSize(c.text, c.size);
    assert.ok(width <= cellW + 0.5, 'caption ' + Math.round(width) + 'pt in a ' + Math.round(cellW) + 'pt cell');
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
