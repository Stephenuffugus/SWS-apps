// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  parseNames, parseRoster, drawNames, redrawKeeping, drawPossible, blamePair, validAssignment,
  encodeReveal, decodeReveal, isRevealHash, ROSTER_MAX,
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
ok('parseRoster reports what it threw away instead of doing it silently', () => {
  const r = parseRoster(['Chris', 'chris', 'CHRIS', 'Sarah', 'B'.repeat(54), 'Dev'].join('\n'));
  assert.deepEqual(r.names, ['Chris', 'Sarah', 'B'.repeat(40), 'Dev']);
  assert.deepEqual(r.merged, ['Chris']);
  assert.deepEqual(r.shortened, ['B'.repeat(40)]);
  assert.equal(r.skipped, 0);

  const many = parseRoster(Array.from({ length: ROSTER_MAX + 17 }, (_, i) => 'P' + i).join('\n'));
  assert.equal(many.names.length, ROSTER_MAX);
  assert.equal(many.skipped, 17);
});
ok('a tight-but-solvable draw is solved, not reported impossible', () => {
  // 4 people, 2 couples: only the two "swap across" derangements work, and a
  // random shuffle can miss them. Exactness matters — an organizer cannot
  // check our arithmetic.
  const names = ['A', 'B', 'C', 'D'];
  const excl = [[0, 1], [2, 3]];
  const a = drawNames(names, excl, rng);
  assert.ok(validAssignment(names, excl, a));
  // 6 people, everything excluded except a single ring of neighbours: exactly
  // 2 of the 720 permutations are valid, so shuffling alone will not find it.
  const six = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ring = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const neighbours = (j - i === 1) || (i === 0 && j === 5);
    if (!neighbours) ring.push([i, j]);
  }
  const d = drawNames(six, ring, rng);
  assert.ok(validAssignment(six, ring, d), 'the one surviving cycle must be found');
});
ok('adding a latecomer changes as few links as the rules allow', () => {
  const before = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const first = drawNames(before, [], rng);
  const after = before.concat('LATE');
  const keep = after.map((n) => {
    const i = before.indexOf(n);
    return i < 0 ? -1 : after.indexOf(before[first[i]]);
  });
  const next = redrawKeeping(after.length, [], keep, rng);
  assert.ok(validAssignment(after, [], next), 'still a valid draw');
  const changed = before.filter((n, i) => after[next[after.indexOf(n)]] !== before[first[i]]);
  assert.ok(changed.length <= 2, `only ${changed.length} of 9 existing links move`);
  assert.ok(next[after.indexOf('LATE')] >= 0, 'the latecomer gives to somebody');
});
ok('drawPossible and blamePair name the rule that broke the draw', () => {
  assert.equal(drawPossible(3, [[0, 1]]), false);
  assert.equal(drawPossible(4, [[0, 1]]), true);
  // Ana(0) ⛔ Marcus(1) is the pair that makes a 3-person draw impossible.
  assert.deepEqual(blamePair(3, [[0, 1]]), [0, 1]);
  // Nothing to blame when the draw is fine.
  assert.equal(blamePair(5, [[0, 1]]), null);
  // One person excluded from everybody: whichever rule we drop must fix it.
  const blamed = blamePair(4, [[0, 1], [0, 2], [0, 3]]);
  assert.ok(blamed && blamed.includes(0), 'blames a rule involving person 0');
  assert.ok(drawPossible(4, [[0, 1], [0, 2], [0, 3]].filter(
    (p) => !(p[0] === blamed[0] && p[1] === blamed[1]))), 'dropping it really works');
});
ok('an empty or truncated payload is rejected, not ceremonially revealed', () => {
  const emptyPayload = btoa('{"s":"","g":"","e":"","b":""}');
  assert.equal(decodeReveal('#r.' + emptyPayload), null);
  assert.equal(decodeReveal('#r.' + btoa('{"s":"  ","g":"Ana"}')), null);
  const good = encodeReveal({ santa: 'Ana', gets: 'Marcus', event: 'Office', budget: '$25' });
  assert.equal(decodeReveal('#r.' + good.slice(0, good.length - 12)), null);
  assert.ok(decodeReveal('#r.' + good));
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
