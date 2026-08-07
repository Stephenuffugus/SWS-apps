// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  parseNames, drawNames, validAssignment, encodeReveal, decodeReveal, isRevealHash,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

let seed = 11;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

ok('parseNames dedupes case-insensitively', () => {
  assert.deepEqual(parseNames('Ann\nann\nBen\n\n Ben '), ['Ann', 'Ben']);
});
ok('draw: everyone gives and receives exactly once, never themselves', () => {
  const names = ['A', 'B', 'C', 'D', 'E'];
  const a = drawNames(names, [], rng);
  assert.ok(validAssignment(names, [], a));
});
ok('draw respects couple exclusions (fuzz, 200 draws)', () => {
  const names = ['Ann', 'Ben', 'Cara', 'Dev', 'Elle', 'Finn'];
  const excl = [[0, 1], [2, 3]]; // two couples
  for (let t = 0; t < 200; t++) {
    const a = drawNames(names, excl, rng);
    assert.ok(validAssignment(names, excl, a), 't=' + t);
    assert.notEqual(a[0], 1); assert.notEqual(a[1], 0);
    assert.notEqual(a[2], 3); assert.notEqual(a[3], 2);
  }
});
ok('impossible setups return null instead of looping forever', () => {
  assert.equal(drawNames(['A', 'B'], [[0, 1]], rng), null);
  assert.equal(drawNames(['A'], [], rng), null);
  // 3 people + one excluded couple is genuinely unsolvable (both 3-cycles use that edge)
  assert.equal(drawNames(['A', 'B', 'C'], [[0, 1]], rng), null);
  // …but 4 people + one couple works: A→C→B→D→A style cycles exist
  const a = drawNames(['A', 'B', 'C', 'D'], [[0, 1]], rng);
  assert.ok(validAssignment(['A', 'B', 'C', 'D'], [[0, 1]], a));
});
ok('reveal payload round-trips and carries only one match', () => {
  const enc = encodeReveal({ santa: 'Ann', gets: 'Ben 🎁', event: 'Family Xmas', budget: '$25' });
  assert.ok(isRevealHash('#r.' + enc));
  const d = decodeReveal('#r.' + enc);
  assert.deepEqual(d, { santa: 'Ann', gets: 'Ben 🎁', event: 'Family Xmas', budget: '$25' });
  assert.equal(decodeReveal('#r.!!!'), null);
  assert.ok(!JSON.stringify(d).includes('Cara'), 'no other names leak');
});

console.log(`\n${passed} santa helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
