// Run: node test/grade.test.mjs
//
// The 79 assertions from the spec, in spec order. Several of them are written
// as "assert the engine does NOT return X", where X is the answer a naive
// implementation gives, those are the ones actually protecting real children's
// grades, so they are stated explicitly rather than implied by the positive case.
import assert from 'node:assert/strict';
import {
  roundHalfUp, letterFor, validateScale, categoryAggregate, classGrade,
  finish, computeClass, optimalKeep, explain, participation, isExtraCredit,
  SCALES, toCp,
} from '../grade.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-6, m = '') =>
  assert.ok(Math.abs(a - b) < eps, `${m} expected ~${b}, got ${a}`);

/* Builders, keep the cases readable so a wrong expectation is visible. */
let seq = 0;
const A = (pp, o = {}) => ({ id: 'a' + (++seq), name: o.name || 'a' + seq, pointsPossible: pp, ...o });
const g = (pp, pts, o = {}) => A(pp, { state: 'graded', points: pts, ...o });
const miss = (pp, o = {}) => A(pp, { state: 'missing', ...o });
const exc = (pp, o = {}) => A(pp, { state: 'excused', ...o });
const un = (pp, o = {}) => A(pp, { state: 'ungraded', ...o });
const TP = (o = {}) => ({ model: 'total-points', dp: 1, scale: SCALES.tenPoint, ...o });
const WT = (cats, o = {}) => ({ model: 'weighted-categories', dp: 1, scale: SCALES.tenPoint, categories: cats, ...o });

/* ── rounding and letters (1 to 10) ─────────────────────────────────────────── */
ok('1-2  half-up survives the unrepresentable midpoints', () => {
  assert.equal(roundHalfUp(1.005, 2), 1.01, 'Math.round(1.005*100)/100 gives 1');
  assert.equal(roundHalfUp(8.575, 2), 8.58, 'Math.round(8.575*100)/100 gives 8.57');
});
ok('3-4  the borderline a parent will check by hand', () => {
  assert.equal(roundHalfUp(89.5, 0), 90);
  assert.equal(roundHalfUp(89.5, 1), 89.5);
  assert.equal(roundHalfUp(89.45, 1), 89.5);
  assert.equal(roundHalfUp(89.44, 1), 89.4);
});
ok('5-6  zero, null and the exponential guard', () => {
  assert.equal(roundHalfUp(0, 1), 0);
  assert.equal(roundHalfUp(null, 1), null);
  assert.equal(roundHalfUp(1e-12, 2), 0);
  assert.ok(!String(roundHalfUp(1e-12, 2)).includes('e'));
});
ok('7-9  bands are half-open, the top is unbounded, the bottom catches all', () => {
  assert.equal(letterFor(90, SCALES.tenPoint), 'A');
  assert.equal(letterFor(89.9, SCALES.tenPoint), 'B');
  assert.equal(letterFor(105, SCALES.tenPoint), 'A', 'extra credit must not fall off the top');
  assert.equal(letterFor(0, SCALES.tenPoint), 'F');
  assert.equal(letterFor(59.9, SCALES.tenPoint), 'F');
  assert.equal(letterFor(null, SCALES.tenPoint), null);
});
ok('10  the letter is a pure function of the DISPLAYED value at dp 0,1,2', () => {
  let contradictions = 0, checked = 0;
  for (const dp of [0, 1, 2]) {
    const byDisplay = new Map();
    for (let i = 0; i <= 100000; i++) {
      const raw = i / 1000;
      const d = roundHalfUp(raw, dp);
      const L = letterFor(d, SCALES.plusMinus);
      checked++;
      if (byDisplay.has(d)) { if (byDisplay.get(d) !== L) contradictions++; }
      else byDisplay.set(d, L);
    }
  }
  assert.equal(contradictions, 0, `${contradictions} of ${checked} contradicted`);
});

/* ── scale validation (11 to 16) ────────────────────────────────────────────── */
ok('11-12  a cutoff may not be finer than the class shows', () => {
  assert.ok(validateScale([{ label: 'A', min: 89.5 }, { label: 'F', min: 0 }], 0).length > 0);
  assert.equal(validateScale([{ label: 'A', min: 89.5 }, { label: 'F', min: 0 }], 1).length, 0);
});
ok('13-15  bottom band, ordering and duplicate labels', () => {
  assert.ok(validateScale([{ label: 'A', min: 90 }, { label: 'F', min: 10 }], 1).length > 0, 'bottom must be 0');
  assert.ok(validateScale([{ label: 'A', min: 80 }, { label: 'B', min: 80 }, { label: 'F', min: 0 }], 1).length > 0);
  assert.ok(validateScale([{ label: 'A', min: 90 }, { label: 'A', min: 80 }, { label: 'F', min: 0 }], 1).length > 0);
});
ok('16  every built-in scale validates at dp 1', () => {
  for (const [n, s] of Object.entries(SCALES)) {
    if (n === 'none') continue;
    assert.equal(validateScale(s, 1).length, 0, `${n} failed`);
  }
});

/* ── states (17 to 29) ──────────────────────────────────────────────────────── */
ok('17-18  the four states together, and the same roster projected', () => {
  const rows = [g(20, 18), miss(10), exc(25), un(15), g(5, 5)];
  const c = TP();
  const r = computeClass(c, rows);
  near(r.soFar.raw, (23 / 35) * 100, 1e-9);
  assert.equal(r.soFar.display, 65.7);
  assert.equal(r.soFar.letter, 'D');
  near(r.projected.raw, (23 / 50) * 100, 1e-9);
  assert.equal(r.projected.display, 46);
  assert.equal(r.projected.letter, 'F');
});
ok('19-21  excused leaves the denominator; missing keeps it; ungraded waits', () => {
  const base = () => g(100, 92);
  near(categoryAggregate([base(), exc(100)]).pct, 92);
  near(categoryAggregate([base(), miss(100)]).pct, 46);
  near(categoryAggregate([base(), un(100)]).pct, 92);
});
ok('22-23  a graded 0 and a missing are the same number, different facts', () => {
  const z = categoryAggregate([g(10, 0), g(10, 10)]);
  const m = categoryAggregate([miss(10), g(10, 10)]);
  assert.equal(z.earned, m.earned);
  assert.equal(z.possible, m.possible);
  assert.equal(z.pct, m.pct);
  // distinguishable at the record level, the cell renderer keys off `state`
  assert.notEqual(g(10, 0).state, miss(10).state);
});
ok('24-25  absent behaves as ungraded; absent and late change no number', () => {
  const a = categoryAggregate([{ ...un(10), absent: true }, g(10, 8)]);
  const b = categoryAggregate([un(10), g(10, 8)]);
  assert.equal(a.pct, b.pct);
  const c = categoryAggregate([g(10, 8, { absent: true, late: true }), g(10, 6)]);
  const d = categoryAggregate([g(10, 8), g(10, 6)]);
  assert.equal(c.pct, d.pct);
});
ok('26-27  nothing graded, and everything excused, are null, never 0', () => {
  assert.equal(finish(TP(), classGrade(TP(), [un(10), un(20)]).raw).display, null);
  const all = classGrade(TP(), [exc(10), exc(20)]);
  assert.equal(all.raw, null, 'all-excused must not read as 0%');
});
ok('28-29  over 100 on one item is fine; negative is rejected', () => {
  near(categoryAggregate([g(10, 12), g(10, 8)]).pct, 100);
  assert.ok(toCp(-1) < 0, 'engine sees the sign; the entry layer blocks it');
});

/* ── weighted (30 to 45) ────────────────────────────────────────────────────── */
const W3 = () => WT([
  { id: 'c1', name: 'Tests', weight: 40 },
  { id: 'c2', name: 'Classwork', weight: 40 },
  { id: 'c3', name: 'Participation', weight: 20 },
]);
ok('30-34  an empty category is not a zero, the week-two bug', () => {
  const rows = [g(20, 16, { categoryId: 'c2' }), g(5, 5, { categoryId: 'c3' })];
  const r = classGrade(W3(), rows);
  assert.equal(r.W, 60);
  near(r.raw, 86.6666666, 1e-6);
  assert.equal(finish(W3(), r.raw).display, 86.7);
  assert.notEqual(roundHalfUp(r.raw, 1), 52, 'must NOT be the empty-as-zero answer');
  const tests = r.categories.find((p) => p.cat.id === 'c1');
  assert.equal(tests.pct, null, 'empty category is null, never 0');
  assert.equal(tests.effectiveWeight, 0);
  near(r.categories.find((p) => p.cat.id === 'c2').effectiveWeight, 66.6666666, 1e-6);
  near(r.categories.find((p) => p.cat.id === 'c3').effectiveWeight, 33.3333333, 1e-6);
  assert.deepEqual(r.inactive, ['Tests'], 'the UI has to be able to name it');
});
ok('35-37  an all-excused category is inactive, same as an empty one', () => {
  const cls = WT([
    { id: 'c1', name: 'Tests', weight: 50 },
    { id: 'c2', name: 'Homework', weight: 30 },
    { id: 'c3', name: 'Participation', weight: 20 },
  ]);
  const rows = [g(100, 85, { categoryId: 'c1' }), exc(10, { categoryId: 'c2' }),
    exc(10, { categoryId: 'c2' }), g(10, 9, { categoryId: 'c3' })];
  const r = classGrade(cls, rows);
  assert.equal(r.W, 70);
  near(r.raw, 86.4285714, 1e-6);
  assert.equal(finish(cls, r.raw).display, 86.4);
  assert.deepEqual(r.inactive, ['Homework']);
  const none = classGrade(cls, []);
  assert.equal(none.W, 0);
  assert.equal(none.raw, null);
});
ok('38-39  weights over 100 normalise down (Canvas does not)', () => {
  const cls = WT([
    { id: 'c1', name: 'A', weight: 45 }, { id: 'c2', name: 'B', weight: 40 },
    { id: 'c3', name: 'C', weight: 20 },
  ]);
  const rows = [g(100, 80, { categoryId: 'c1' }), g(100, 90, { categoryId: 'c2' }),
    g(100, 100, { categoryId: 'c3' })];
  const r = classGrade(cls, rows);
  near(r.raw, 87.6190476, 1e-6);
  assert.ok(Math.abs(r.raw - 92.0) > 1, 'must NOT be the Canvas answer');
  const ok100 = WT([{ id: 'c1', name: 'A', weight: 50 }, { id: 'c2', name: 'B', weight: 50 }]);
  near(classGrade(ok100, [g(100, 80, { categoryId: 'c1' }), g(100, 90, { categoryId: 'c2' })]).raw, 85);
});
ok('40  a zero-weight category cannot affect the grade', () => {
  const cls = WT([{ id: 'c1', name: 'A', weight: 100 }, { id: 'c2', name: 'Z', weight: 0 }]);
  const r = classGrade(cls, [g(10, 10, { categoryId: 'c1' }), g(10, 0, { categoryId: 'c2' })]);
  near(r.raw, 100);
});
ok('42-43  one mark is data: 3/4 is a C, 0/4 is an F', () => {
  const cls = WT([
    { id: 'c1', name: 'Classwork', weight: 40 }, { id: 'c2', name: 'Tests', weight: 40 },
    { id: 'c3', name: 'P', weight: 20 },
  ]);
  const a = classGrade(cls, [g(4, 3, { categoryId: 'c1' })]);
  assert.equal(a.W, 40);
  near(a.raw, 75);
  assert.equal(finish(cls, a.raw).letter, 'C');
  const b = classGrade(cls, [g(4, 0, { categoryId: 'c1' })]);
  near(b.raw, 0);
  assert.equal(finish(cls, b.raw).letter, 'F', 'a single zero is not "no data"');
});
ok('44-45  the forecast activates ungraded work but not empty categories', () => {
  const cls = WT([{ id: 'c1', name: 'Classwork', weight: 50 }, { id: 'c2', name: 'Tests', weight: 50 }]);
  const rows = [g(10, 9, { categoryId: 'c1' }), un(100, { categoryId: 'c2' })];
  const r = computeClass(cls, rows);
  near(r.soFar.raw, 90);
  near(r.projected.raw, 45);
  const empty = computeClass(cls, [g(10, 9, { categoryId: 'c1' })]);
  assert.deepEqual(empty.projected.inactive, ['Tests'], 'no assignments at all stays inactive');
});

/* ── drop-lowest (46 to 62) ─────────────────────────────────────────────────── */
ok('46-48  Beth: drop the one that helps her, not the smallest', () => {
  const beth = [g(100, 80, { name: 'q1' }), g(100, 20, { name: 'q2' }), g(20, 1, { name: 'q3' })];
  const d = categoryAggregate(beth, { dropLowest: 1 });
  near(d.pct, 67.5);
  assert.ok(Math.abs(d.pct - 50) > 1, 'must NOT drop the smallest raw score');
  assert.equal(d.dropped[0].name, 'q2');
  near(categoryAggregate(beth).pct, 45.9090909, 1e-6);
});
ok('49-50  Carl: two drops are not two greedy drops', () => {
  const carl = [g(100, 100, { name: 'a' }), g(91, 42, { name: 'b' }),
    g(55, 14, { name: 'c' }), g(38, 3, { name: 'd' })];
  near(categoryAggregate(carl, { dropLowest: 1 }).pct, 63.4146341, 1e-6);
  const two = categoryAggregate(carl, { dropLowest: 2 });
  near(two.pct, 74.6376811, 1e-4);
  assert.ok(Math.abs(two.pct - 74.345) > 0.05, 'must NOT be the greedy answer');
  assert.deepEqual(two.dropped.map((x) => x.name).sort(), ['b', 'c']);
});
ok('51  optimalKeep matches brute force on 4000 random categories', () => {
  let rng = 12345;
  const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const best = (items, keep) => {
    let bp = -1;
    const n = items.length;
    for (let mask = 0; mask < (1 << n); mask++) {
      let cnt = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) cnt++;
      if (cnt !== keep) continue;
      let m = 0, p = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { m += items[i].m; p += items[i].pp; }
      if (p > 0) bp = Math.max(bp, (m / p) * 100);
    }
    return bp;
  };
  let mismatches = 0;
  for (let t = 0; t < 4000; t++) {
    const n = 2 + Math.floor(rnd() * 7);
    const items = Array.from({ length: n }, (_, i) => {
      const pp = 1 + Math.floor(rnd() * 100);
      return { name: 'i' + i, m: Math.floor(rnd() * (pp + 1)) * 100, pp: pp * 100 };
    });
    const k = 1 + Math.floor(rnd() * (n - 1));
    const { kept } = optimalKeep(items, n - k, []);
    const mine = (kept.reduce((s, x) => s + x.m, 0) / kept.reduce((s, x) => s + x.pp, 0)) * 100;
    if (Math.abs(mine - best(items, n - k)) > 1e-6) mismatches++;
  }
  assert.equal(mismatches, 0, `${mismatches} of 4000 were not optimal`);
});
ok('52-53  dropping can never lower a grade', () => {
  let rng = 999;
  const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let worse = 0, checked = 0;
  for (let t = 0; t < 2600; t++) {
    const n = 2 + Math.floor(rnd() * 6);
    const items = Array.from({ length: n }, () => {
      const pp = 1 + Math.floor(rnd() * 50);
      return g(pp, Math.floor(rnd() * (pp + 1)));
    });
    const none = categoryAggregate(items).pct;
    for (let k = 1; k < n; k++) {
      const withDrop = categoryAggregate(items, { dropLowest: k }).pct;
      checked++;
      if (withDrop < none - 1e-9) worse++;
    }
  }
  assert.equal(worse, 0, `${worse} of ${checked} got worse by dropping`);
  // the named counterexample the naive rule fails
  const pair = [g(5, 5), g(100, 50)];
  near(categoryAggregate(pair).pct, 52.3809523, 1e-6);
  assert.ok(categoryAggregate(pair, { dropLowest: 1 }).pct >= 52.3809523 - 1e-9);
});
ok('54-56  a drop rule never empties a category', () => {
  const two = [g(10, 6, { name: 'q1' }), g(10, 9, { name: 'q2' })];
  const r = categoryAggregate(two, { dropLowest: 2 });
  near(r.pct, 90);
  assert.deepEqual(r.dropped.map((x) => x.name), ['q1']);
  near(categoryAggregate([g(10, 6)], { dropLowest: 2 }).pct, 60);
  assert.equal(categoryAggregate([], { dropLowest: 1 }).pct, null);
});
ok('57-58  neverDrop protects the final', () => {
  const rows = [g(10, 9, { name: 'a' }), g(10, 4, { name: 'b' }),
    g(100, 50, { name: 'final', neverDrop: true })];
  near(categoryAggregate(rows, { dropLowest: 1 }).pct, 53.6363636, 1e-6);
  const free = [g(10, 9, { name: 'a' }), g(10, 4, { name: 'b' }), g(100, 50, { name: 'final' })];
  near(categoryAggregate(free, { dropLowest: 1 }).pct, 65);
});
ok('59-60  the same cell is dropped in both views', () => {
  const rows = [g(10, 8, { name: 'a' }), g(10, 9, { name: 'b' }),
    miss(10, { name: 'm' }), un(10, { name: 'u' })];
  const so = categoryAggregate(rows, { dropLowest: 1 }, false);
  near(so.pct, 85);
  assert.equal(so.dropped[0].name, 'm');
  const pr = categoryAggregate(rows, { dropLowest: 1 }, true);
  near(pr.pct, 56.6666666, 1e-6);
  assert.equal(pr.dropped[0].name, 'm', 'the struck-through cell must not move');
});
ok('61  exact ties drop deterministically', () => {
  const mk = () => [g(10, 7, { name: 'x' }), g(10, 7, { name: 'y' }), g(10, 10, { name: 'z' })];
  const first = categoryAggregate(mk(), { dropLowest: 1 }).dropped[0].name;
  for (let i = 0; i < 25; i++) {
    assert.equal(categoryAggregate(mk(), { dropLowest: 1 }).dropped[0].name, first);
  }
});
ok('62  extra credit is never dropped', () => {
  const rows = [g(10, 5, { name: 'a' }), g(10, 9, { name: 'b' }),
    g(0, 3, { name: 'ec', extraCredit: true })];
  const r = categoryAggregate(rows, { dropLowest: 1 });
  assert.ok(!r.dropped.some((x) => x.name === 'ec'));
  near(r.pct, 120);
});

/* ── extra credit (63 to 69) ────────────────────────────────────────────────── */
ok('63-64  extra credit can exceed 100, and the cap is a display choice', () => {
  const rows = [g(50, 50), g(50, 48), g(0, 5, { extraCredit: true })];
  const cls = TP();
  near(classGrade(cls, rows).raw, 103);
  assert.equal(finish(cls, 103).display, 103);
  assert.equal(finish(TP({ capAt100: true }), 103).display, 100);
});
ok('65-66  category-scoped and course-scoped credit are different units', () => {
  const cls = WT([{ id: 'c1', name: 'Classwork', weight: 50 }, { id: 'c2', name: 'Tests', weight: 50 }]);
  const inCat = [g(20, 20, { categoryId: 'c1' }), g(0, 3, { categoryId: 'c1', extraCredit: true }),
    g(100, 95, { categoryId: 'c2' })];
  near(classGrade(cls, inCat).raw, 105);
  const course = [g(20, 20, { categoryId: 'c1' }), g(100, 95, { categoryId: 'c2' }),
    g(0, 2, { extraCredit: true, ecScope: 'course' })];
  near(classGrade(cls, course).raw, 99.5, 1e-6);
});
ok('67-69  zero-possible is implicit credit; credit alone is not a grade', () => {
  assert.ok(isExtraCredit({ pointsPossible: 0 }));
  const only = categoryAggregate([g(0, 3, { extraCredit: true })]);
  assert.equal(only.pct, null, 'not 0, not Infinity, not NaN');
  assert.equal(only.earned, 3);
  assert.equal(only.possible, 0);
  const cls = WT([{ id: 'c1', name: 'Tests', weight: 60 }, { id: 'c2', name: 'EC', weight: 40 }]);
  const r = classGrade(cls, [g(100, 88, { categoryId: 'c1' }),
    g(0, 5, { categoryId: 'c2', extraCredit: true })]);
  near(r.raw, 88);
  assert.deepEqual(r.inactive, ['EC']);
});

/* ── precision (70 to 73) ───────────────────────────────────────────────────── */
ok('70-71  centipoints add exactly where floats do not', () => {
  near(categoryAggregate([g(2.5, 2.25), g(2.5, 1.75), g(5, 4.5)]).pct, 85, 1e-9);
  const thirty = Array.from({ length: 30 }, () => g(3, 1));
  near(categoryAggregate(thirty).pct, 33.3333333, 1e-6);
  assert.equal(roundHalfUp(categoryAggregate(thirty).pct, 1), 33.3);
});
ok('72  the mean of percentages is not the grade', () => {
  near(categoryAggregate([g(100, 50), g(5, 5)]).pct, 52.3809523, 1e-6);
  assert.ok(Math.abs(categoryAggregate([g(100, 50), g(5, 5)]).pct - 75) > 1);
});
ok('73  round once, at the end', () => {
  assert.equal(roundHalfUp(89.4449, 1), 89.4);
  const doubled = roundHalfUp(roundHalfUp(roundHalfUp(89.4449, 3), 2), 1);
  assert.equal(doubled, 89.5, 'double-rounding drifts upward');
  assert.notEqual(roundHalfUp(89.4449, 1), doubled);
});

/* ── app layer (74 to 79) ───────────────────────────────────────────────────── */
ok('74  the engine is pure, it cannot persist a derived value', () => {
  /* The spec's rule is that no computed percentage, letter, subtotal or drop
     decision is ever stored, because a stored number goes stale the moment a
     teacher edits a cutoff. The export side of that is asserted in
     store.test.mjs; what is provable HERE is the stronger structural fact:
     this file has no way to write anything. No storage, no DOM, no clock, so a derived value physically cannot leak out of it. */
  const src = readSrc();
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document', 'window', 'fetch(']) {
    assert.ok(!src.includes(api), `grade.js must not reference ${api}`);
  }
  assert.ok(!/new Date|Date\.now/.test(src), 'a pure engine cannot depend on the clock');
});
ok('75  every call returns both projections', () => {
  const r = computeClass(TP(), [g(10, 8)]);
  assert.ok('soFar' in r && 'projected' in r);
  assert.ok(r.soFar.display !== undefined && r.projected.display !== undefined);
});
ok('77  the explain panel reproduces the returned value exactly', () => {
  const cls = WT([{ id: 'c1', name: 'Classwork', weight: 40 },
    { id: 'c2', name: 'Tests', weight: 40 }, { id: 'c3', name: 'P', weight: 20 }]);
  const rows = [g(20, 16, { categoryId: 'c1', name: 'w1' }), g(5, 5, { categoryId: 'c3', name: 'p1' })];
  const e = explain(cls, rows);
  const direct = finish(cls, classGrade(cls, rows).raw);
  assert.equal(e.display, direct.display);
  assert.equal(e.letter, direct.letter);
  assert.ok(e.lines.some((l) => l.kind === 'result' && l.text.includes(String(direct.display))));
  assert.ok(e.lines.some((l) => l.text.includes('Tests')), 'must name the uncounted category');
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
function readSrc() {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'grade.js'), 'utf8');
}

console.log(`  grade engine: ${passed} groups passed`);
