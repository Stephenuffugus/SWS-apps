// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  parseNames, parseNamesDetailed, sliceAtPointer, easeOut, encodeState, decodeState,
  sliceColor, sliceInk, WHEEL_COLORS, MAX_NAMES, MAX_NAME_LEN,
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

/* The wedges used to be six colours of near-identical lightness, measured
   adjacent contrast as low as 1.04:1, so the wheel read as one flat disc on a
   projector, in greyscale, and to a colour-blind viewer. Being a DIFFERENT
   colour was never the requirement; being a distinguishable one is. */
const lum = (hex) => {
  const p = hex.slice(1).match(/../g).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

ok('adjacent wedges differ in LIGHTNESS, not just hue', () => {
  let worst = Infinity, at = '';
  for (let count = 2; count <= 100; count++) {
    for (let i = 0; i < count; i++) {
      const r = ratio(sliceColor(i, count), sliceColor((i + 1) % count, count));
      if (r < worst) { worst = r; at = `count=${count} i=${i}`; }
    }
  }
  assert.ok(worst >= 2, `worst adjacent wedge contrast ${worst.toFixed(2)}:1 at ${at}`);
});

ok('every wedge label is readable on its own wedge', () => {
  let worst = Infinity, at = '';
  for (let count = 1; count <= 100; count++) {
    for (let i = 0; i < count; i++) {
      const r = ratio(sliceInk(i, count), sliceColor(i, count));
      if (r < worst) { worst = r; at = `count=${count} i=${i}`; }
    }
  }
  // Labels are 600-weight and 14px or larger, so 3:1 is the applicable bar.
  assert.ok(worst >= 3, `worst label contrast ${worst.toFixed(2)}:1 at ${at}`);
});

ok('parseNamesDetailed reports what it threw away', () => {
  const many = parseNamesDetailed(Array(150).fill('x').join('\n'));
  assert.equal(many.names.length, MAX_NAMES);
  assert.equal(many.dropped, 50);
  assert.equal(many.truncated, 0);

  const long = parseNamesDetailed('Bartholomew Fitzgerald-Wellingtonshire III\nAnn');
  assert.equal(long.truncated, 1);
  assert.equal(long.dropped, 0);
  assert.equal(long.names[0].length, MAX_NAME_LEN);

  const clean = parseNamesDetailed(' Ann \n\nBen\n  ');
  assert.deepEqual(clean, { names: ['Ann', 'Ben'], dropped: 0, truncated: 0 });

  assert.deepEqual(parseNamesDetailed(null), { names: [], dropped: 0, truncated: 0 });
});

console.log(`\n${passed} wheel helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
