// Run: node test/zip.test.mjs
// The ZIP replaces 50 sequential <a download> clicks and a bulk-download
// permission prompt, so it has to be a real ZIP that real unzippers open.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, dosTime, makeZip } from '../zip.js';

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

await ok('crc32 matches the reference vector', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

await ok('dosTime stays inside the 1980..2107 field', () => {
  const t = dosTime(new Date(2026, 7, 9, 14, 30, 20));
  assert.equal((t.date >> 9) + 1980, 2026);
  assert.equal((t.date >> 5) & 0x0f, 8);
  assert.equal(t.date & 0x1f, 9);
  assert.equal(t.time >> 11, 14);
  assert.equal(dosTime(new Date(1900, 0, 1)).date >> 9, 0);   // clamped, never negative
});

await ok('makeZip produces an archive a real unzip can read', async () => {
  const payloads = {
    'photo-small.jpg': new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 0xff, 0xd9]),
    'sub name (2).png': new TextEncoder().encode('x'.repeat(5000)),
    'ünïcøde-🌅.webp': new TextEncoder().encode('hello'),
  };
  const entries = Object.entries(payloads).map(([name, bytes]) => ({ name, blob: new Blob([bytes]) }));
  const zip = await makeZip(entries);
  const bytes = new Uint8Array(await zip.arrayBuffer());

  assert.equal(zip.type, 'application/zip');
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  // store-only: the payload is already compressed, so the archive is the sum
  // of the parts plus headers, never smaller.
  const raw = Object.values(payloads).reduce((a, b) => a + b.length, 0);
  assert.ok(bytes.length > raw, 'stored, not deflated');

  const dir = mkdtempSync(join(tmpdir(), 'swszip-'));
  const path = join(dir, 'out.zip');
  writeFileSync(path, bytes);
  let listing;
  try {
    listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
  } catch (e) {
    if (e.code === 'ENOENT') { console.log('  (unzip not installed, skipped the external check)'); return; }
    throw new Error('unzip rejected the archive: ' + String(e.stdout || e.message));
  }
  assert.match(listing, /3 files/);
  // Info-ZIP prints names through the terminal codepage, so the non-ASCII one
  // is checked by extracting it rather than by matching the listing text.
  for (const name of ['photo-small.jpg', 'sub name (2).png']) {
    assert.ok(listing.includes(name), 'unzip -l should list ' + name + '\n' + listing);
  }
  execFileSync('unzip', ['-o', '-q', path, '-d', dir]);
  assert.deepEqual(
    new Uint8Array(readFileSync(join(dir, 'photo-small.jpg'))),
    payloads['photo-small.jpg']);

  /* Info-ZIP only decodes the UTF-8 name flag when the shell locale agrees, so
     the emoji filename is verified against the archive's own bytes: bit 11 of
     the general-purpose flag set, and the name stored as UTF-8. */
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 name flag on the first local header');
  const decoded = new TextDecoder().decode(bytes);
  assert.ok(decoded.includes('ünïcøde-🌅.webp'), 'the UTF-8 name is stored verbatim');
});

await ok('onProgress reports every entry', async () => {
  const seen = [];
  await makeZip(
    [1, 2, 3, 4, 5].map((n) => ({ name: n + '.bin', blob: new Blob([new Uint8Array([n])]) })),
    (d, t) => seen.push(d + '/' + t));
  assert.deepEqual(seen, ['1/5', '2/5', '3/5', '4/5', '5/5']);
});

console.log(`\n${passed} zip tests passed${process.exitCode ? ' (with failures)' : ''}`);
