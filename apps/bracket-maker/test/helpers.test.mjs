// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  nextPow2, seedOrder, parseEntrants, roundCount, round0Slot,
  contender, winnerOf, setPick, champion, encodeBracket, decodeBracket,
  entrantInfo, mapEntrants, resultPairs, carryPicks, sameBracket,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('seed order keeps top seeds apart', () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const o16 = seedOrder(16);
  assert.equal(o16.length, 16);
  // seeds 1 and 2 are in opposite halves
  assert.ok(o16.indexOf(1) < 8 !== o16.indexOf(2) < 8);
});
ok('nextPow2 / roundCount', () => {
  assert.equal(nextPow2(5), 8);
  assert.equal(nextPow2(8), 8);
  assert.equal(roundCount(8), 3);
  assert.equal(roundCount(5), 3);
  assert.equal(roundCount(2), 1);
});
ok('byes auto-advance without picks', () => {
  const s = { names: ['A', 'B', 'C'], picks: {} }; // size 4: A bye in match 0? seeds [1,4,2,3]
  // match 0: seed1=A vs seed4=bye → A advances
  assert.equal(round0Slot(s.names, 0), 0);
  assert.equal(round0Slot(s.names, 1), null);
  assert.equal(winnerOf(s, 0, 0), 0);
  // match 1: B vs C → undecided
  assert.equal(winnerOf(s, 0, 1), null);
  assert.equal(champion(s), null);
});
ok('picking winners advances and crowns a champion', () => {
  let s = { names: ['A', 'B', 'C', 'D'], picks: {} };
  s = setPick(s, 0, 0, 3);      // A(0) vs D(3): D wins
  s = setPick(s, 0, 1, 1);      // B(1) vs C(2): B wins
  assert.equal(contender(s, 1, 0, 0), 3);
  assert.equal(contender(s, 1, 0, 1), 1);
  s = setPick(s, 1, 0, 1);      // final: B beats D
  assert.equal(champion(s), 1);
});
ok('changing an early pick invalidates dependent downstream picks only', () => {
  let s = { names: ['A', 'B', 'C', 'D'], picks: {} };
  s = setPick(s, 0, 0, 0);      // A wins
  s = setPick(s, 0, 1, 2);      // C wins
  s = setPick(s, 1, 0, 0);      // A champion
  s = setPick(s, 0, 0, 3);      // rewrite history: D beat A
  assert.equal(s.picks['1-0'], undefined, 'stale final pick cleared');
  assert.equal(s.picks['0-1'], 2, 'unrelated pick intact');
  assert.equal(champion(s), null);
});
ok('cannot pick a non-contender or resolve a bye by hand', () => {
  let s = { names: ['A', 'B', 'C'], picks: {} };
  const before = JSON.stringify(s.picks);
  s = setPick(s, 0, 0, 1);      // B is not in match 0
  assert.equal(JSON.stringify(s.picks), before);
  s = setPick(s, 0, 0, 0);      // match 0 is a bye — no pick recorded
  assert.equal(JSON.stringify(s.picks), before);
});
ok('full random play-through always crowns exactly one champion (fuzz)', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 60; t++) {
    const n = 2 + Math.floor(rnd() * 31);
    let s = { names: Array.from({ length: n }, (_, i) => 'P' + i), picks: {} };
    const rounds = roundCount(n);
    for (let r = 0; r < rounds; r++) {
      for (let m = 0; m < nextPow2(n) / Math.pow(2, r + 1); m++) {
        const a = contender(s, r, m, 0), b = contender(s, r, m, 1);
        if (a !== null && b !== null) s = setPick(s, r, m, rnd() < 0.5 ? a : b);
      }
    }
    const c = champion(s);
    assert.ok(c !== null && c >= 0 && c < n, `t=${t} n=${n} champion=${c}`);
  }
});
ok('bracket round-trips through the hash, hostile picks dropped', () => {
  let s = { names: ['Ann', 'Ben'], picks: {}, title: 'Game night' };
  s = setPick(s, 0, 0, 1);
  const d = decodeBracket('#' + encodeBracket(s));
  assert.deepEqual(d.names, ['Ann', 'Ben']);
  assert.equal(d.picks['0-0'], 1);
  assert.equal(d.title, 'Game night');
  const evil = decodeBracket('#' + encodeBracket({ names: ['A'], picks: { '0-0': 99, 'x': 1 } }));
  assert.deepEqual(evil.picks, {});
});
ok('parseEntrants caps at 32', () => {
  assert.equal(parseEntrants(Array(50).fill('x').join('\n')).length, 32);
});

console.log(`\n${passed} bracket helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
