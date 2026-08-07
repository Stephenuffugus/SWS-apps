// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  parseNames, sliceAtPointer, easeOut, encodeState, decodeState, sliceColor, WHEEL_COLORS,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('parseNames trims, drops blanks, caps at 100', () => {
  assert.deepEqual(parseNames(' Ann \n\nBen\n  '), ['Ann', 'Ben']);
  assert.equal(parseNames(Array(150).fill('x').join('\n')).length, 100);
});
ok('sliceAtPointer maps rotations to slices', () => {
  assert.equal(sliceAtPointer(0, 4), 0);
  // rotating the wheel clockwise by one slice puts the LAST slice under the pointer
  assert.equal(sliceAtPointer(Math.PI / 2, 4), 3);
  assert.equal(sliceAtPointer(-Math.PI / 2, 4), 1);
  assert.equal(sliceAtPointer(Math.PI * 2 * 7, 4), 0, 'full turns are neutral');
  assert.equal(sliceAtPointer(0, 0), -1);
});
ok('sliceAtPointer fuzz: always a valid index', () => {
  for (let i = 0; i < 500; i++) {
    const n = 2 + (i % 30);
    const idx = sliceAtPointer((i * 17.13) % 100 - 50, n);
    assert.ok(idx >= 0 && idx < n, `rot case ${i}`);
  }
});
ok('easeOut is monotone 0→1', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  let prev = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = easeOut(t);
    assert.ok(v >= prev - 1e-9);
    prev = v;
  }
});
ok('state round-trips through the hash (unicode too)', () => {
  const s = { names: ['Zoë', 'Müller', '张伟'], removeMode: true };
  const d = decodeState('#' + encodeState(s));
  assert.deepEqual(d, s);
  assert.equal(decodeState('#garbage!!'), null);
  assert.equal(decodeState(''), null);
});
ok('adjacent slice colors never clash, including the wrap', () => {
  for (let count = 2; count <= 40; count++) {
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      assert.notEqual(sliceColor(i, count), sliceColor(next, count),
        `count=${count} i=${i}`);
    }
  }
  assert.ok(WHEEL_COLORS.length >= 4);
});

console.log(`\n${passed} wheel helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
