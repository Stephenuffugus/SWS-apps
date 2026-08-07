// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import { trimBounds, smoothSegments } from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

function rgba(width, height, drawn) {
  const d = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of drawn) d[(y * width + x) * 4 + 3] = 255;
  return d;
}

ok('trimBounds finds the tight ink box', () => {
  const d = rgba(10, 8, [[2, 3], [7, 3], [4, 6]]);
  assert.deepEqual(trimBounds(d, 10, 8), { x: 2, y: 3, w: 6, h: 4 });
});
ok('trimBounds: empty canvas → null', () => {
  assert.equal(trimBounds(rgba(10, 8, []), 10, 8), null);
});
ok('trimBounds ignores near-transparent noise', () => {
  const d = rgba(10, 8, [[5, 5]]);
  d[(2 * 10 + 2) * 4 + 3] = 4; // below threshold
  assert.deepEqual(trimBounds(d, 10, 8), { x: 5, y: 5, w: 1, h: 1 });
});
ok('smoothSegments midpoints', () => {
  const segs = smoothSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  assert.deepEqual(segs, [[10, 0, 10, 5]]);
});

console.log(`\n${passed} signature helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
