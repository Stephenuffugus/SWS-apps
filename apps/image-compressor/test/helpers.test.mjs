// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import { fmtBytes, scaleDims, savingsPct, outName } from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('fmtBytes units', () => {
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(2048), '2.0 KB');
  assert.equal(fmtBytes(4_400_000), '4.2 MB');
  assert.equal(fmtBytes(-1), '—');
});
ok('scaleDims fits without upscaling', () => {
  assert.deepEqual(scaleDims(4000, 3000, 1920), { w: 1920, h: 1440 });
  assert.deepEqual(scaleDims(800, 600, 1920), { w: 800, h: 600 });
  assert.deepEqual(scaleDims(3000, 4000, 1000), { w: 750, h: 1000 });
  assert.deepEqual(scaleDims(100, 50, 0), { w: 100, h: 50 });
  assert.deepEqual(scaleDims(10000, 1, 100), { w: 100, h: 1 });
});
ok('savingsPct', () => {
  assert.equal(savingsPct(1000, 100), 90);
  assert.equal(savingsPct(1000, 1200), 0);
  assert.equal(savingsPct(0, 0), 0);
});
ok('outName swaps extension', () => {
  assert.equal(outName('IMG_2041.HEIC.jpeg', 'jpg'), 'IMG_2041.HEIC-small.jpg');
  assert.equal(outName('photo', 'webp'), 'photo-small.webp');
});

console.log(`\n${passed} compressor helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
