// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  nextPow2, seedOrder, parseEntrants, roundCount, round0Slot,
  contender, winnerOf, setPick, champion, encodeBracket, decodeBracket,
  entrantInfo, mapEntrants, resultPairs, carryPicks, sameBracket,
  setScore, scoreFor, sanitizeScores, swapSeeds, shuffleSeeds,
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
  s = setPick(s, 0, 0, 0);      // match 0 is a bye, no pick recorded
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

/* ── Editing the entrant list must not delete the tournament ─────────────── */
function played8() {
  let s = { names: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], picks: {}, title: 'T' };
  const rounds = roundCount(8);
  for (let r = 0; r < rounds; r++) {
    for (let m = 0; m < 8 / Math.pow(2, r + 1); m++) {
      const a = contender(s, r, m, 0), b = contender(s, r, m, 1);
      if (a !== null && b !== null) s = setPick(s, r, m, a);
    }
  }
  return s;
}

ok('entrantInfo reports the caps instead of applying them silently', () => {
  const info = entrantInfo(Array(40).fill('x'.repeat(56)).join('\n'));
  assert.equal(info.names.length, 32);
  assert.equal(info.total, 40);
  assert.equal(info.dropped, 8);
  assert.equal(info.truncated, 32);
  assert.equal(info.names[0].length, 40);
  const clean = entrantInfo('Ann\nBen\n\n  \nCal');
  assert.deepEqual(clean.names, ['Ann', 'Ben', 'Cal']);
  assert.equal(clean.dropped, 0);
  assert.equal(clean.truncated, 0);
});

ok('mapEntrants pairs a rename in place', () => {
  assert.deepEqual(mapEntrants(['A', 'Sarrah', 'C'], ['A', 'Sarah', 'C']), [0, 1, 2]);
  assert.deepEqual(mapEntrants(['A', 'B'], ['B', 'A']), [1, 0]);
  assert.deepEqual(mapEntrants(['A', 'B'], ['A']), [0, -1]);
});

ok('fixing a typo keeps every result', () => {
  const before = played8();
  assert.equal(Object.keys(before.picks).length, 7);
  const names = before.names.slice();
  names[3] = 'Dave B.';
  const res = carryPicks(before, names);
  assert.equal(res.lost, 0, 'nothing lost on a pure rename');
  assert.equal(res.kept, 7);
  assert.equal(champion(res.state), champion(before));
  assert.equal(res.state.names[3], 'Dave B.');
  assert.equal(res.state.title, 'T', 'the event name survives too');
});

ok('reordering carries every result where the same two still meet', () => {
  const before = played8();
  const names = before.names.slice().reverse();
  const res = carryPicks(before, names);
  assert.ok(res.kept >= 1, 'some results carried, got ' + res.kept);
  assert.equal(res.kept + res.lost, 7, 'every old result is accounted for');
  // every carried pick is a real head-to-head that was decided before
  const had = resultPairs(before).map(([w, l]) => before.names[w] + '>' + before.names[l]).sort();
  const now = resultPairs(res.state).map(([w, l]) => res.state.names[w] + '>' + res.state.names[l]).sort();
  for (const pair of now) assert.ok(had.includes(pair), 'invented result: ' + pair);
});

ok('adding a latecomer keeps the results that still make sense', () => {
  const before = played8();
  const res = carryPicks(before, before.names.concat('Late'));
  assert.equal(res.state.names.length, 9);
  assert.equal(res.kept + res.lost, 7);
  const had = resultPairs(before).map(([w, l]) => before.names[w] + '>' + before.names[l]);
  for (const [w, l] of resultPairs(res.state)) {
    assert.ok(had.includes(res.state.names[w] + '>' + res.state.names[l]), 'invented result');
  }
});

ok('removing an entrant drops only their results', () => {
  const before = played8();
  const names = before.names.filter((x) => x !== 'H');
  const res = carryPicks(before, names);
  assert.ok(!res.state.names.includes('H'));
  for (const [w, l] of resultPairs(res.state)) {
    assert.notEqual(res.state.names[w], 'H');
    assert.notEqual(res.state.names[l], 'H');
  }
  assert.ok(res.kept >= 1, 'A v B and friends survive');
});

ok('carryPicks never crowns someone who never won a game', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 40; t++) {
    const n = 2 + Math.floor(rnd() * 20);
    let s = { names: Array.from({ length: n }, (_, i) => 'P' + i), picks: {}, title: '' };
    const rounds = roundCount(n);
    for (let r = 0; r < rounds; r++) {
      for (let m = 0; m < nextPow2(n) / Math.pow(2, r + 1); m++) {
        const a = contender(s, r, m, 0), b = contender(s, r, m, 1);
        if (a !== null && b !== null) s = setPick(s, r, m, rnd() < 0.5 ? a : b);
      }
    }
    // a rename, a reorder and a removal, all at once
    const names = s.names.slice().reverse().map((x, i) => (i === 0 ? x + '!' : x)).slice(0, Math.max(2, n - 1));
    const map = mapEntrants(s.names, names);
    const had = new Set(resultPairs(s)
      .filter(([w, l]) => map[w] >= 0 && map[l] >= 0)
      .map(([w, l]) => map[w] + '>' + map[l]));
    const out = carryPicks(s, names).state;
    for (const [w, l] of resultPairs(out)) {
      assert.ok(had.has(w + '>' + l), `t=${t} n=${n} invented ${w}>${l}`);
    }
    assert.ok(Object.keys(out.picks).length <= Object.keys(s.picks).length,
      't=' + t + ' more results after the edit than before');
  }
});

/* ── Scores ──────────────────────────────────────────────────────────────── */
ok('a score records, shows, and clears', () => {
  let s = { names: ['A', 'B', 'C', 'D'], picks: {}, title: '', scores: {} };
  s = setScore(s, 0, 0, ' 21 ', '15');
  assert.deepEqual(scoreFor(s, 0, 0), { sa: '21', sb: '15' });
  s = setScore(s, 0, 0, '', '');
  assert.equal(scoreFor(s, 0, 0), null);
  assert.equal(s.scores['0-0'], undefined);
});
ok('a score cannot land on a bye or an undecided pairing', () => {
  let s = { names: ['A', 'B', 'C'], picks: {}, title: '', scores: {} };
  s = setScore(s, 0, 0, '1', '0');          // match 0 is A vs bye
  assert.deepEqual(s.scores, {});
  s = setScore(s, 1, 0, '1', '0');          // final: A vs winner of B and C, undecided
  assert.deepEqual(s.scores, {});
});
ok('a score hides when the pairing changes and returns when it does', () => {
  let s = { names: ['A', 'B', 'C', 'D'], picks: {}, title: '', scores: {} };
  s = setPick(s, 0, 0, 0);                  // A beats D
  s = setPick(s, 0, 1, 1);                  // B beats C
  s = setPick(s, 1, 0, 0);                  // final: A beats B
  s = setScore(s, 1, 0, '21', '15');
  assert.deepEqual(scoreFor(s, 1, 0), { sa: '21', sb: '15' });
  s = setPick(s, 0, 1, 2);                  // rewrite: C beat B, the final is now A vs C
  assert.equal(scoreFor(s, 1, 0), null, 'score for A vs B must not show for A vs C');
  s = setPick(s, 0, 1, 1);                  // B advances again
  s = setPick(s, 1, 0, 0);
  assert.deepEqual(scoreFor(s, 1, 0), { sa: '21', sb: '15' }, 'the original pairing gets its score back');
});
ok('scores survive the codec, hostile ones are dropped', () => {
  let s = { names: ['Ann', 'Ben'], picks: {}, title: '', scores: {} };
  s = setPick(s, 0, 0, 1);
  s = setScore(s, 0, 0, '19', '21');
  const d = decodeBracket('#' + encodeBracket(s));
  assert.deepEqual(d.scores['0-0'], [0, 1, '19', '21']);
  const evil = sanitizeScores({
    '0-0': [0, 1, 'x'.repeat(80), 'ok'],    // oversized score trimmed
    '1-0': [0, 9, 'a', 'b'],                // entrant out of range
    'zz': [0, 1, 'a', 'b'],                 // bad key
    '2-0': [0, 1, 7, 'b'],                  // non-string score
    '3-0': [1, 1, 'a', 'b'],                // playing yourself
  }, 2);
  assert.deepEqual(Object.keys(evil), ['0-0']);
  assert.equal(evil['0-0'][2].length, 8);
});
ok('scores follow their people across an edit, side order fixed up', () => {
  let s = { names: ['A', 'B', 'C', 'D'], picks: {}, title: '', scores: {} };
  s = setPick(s, 0, 0, 0);                  // A beats D
  s = setScore(s, 0, 0, '11', '7');         // A 11, D 7
  const res = carryPicks(s, ['D', 'B', 'C', 'A']);  // A and D trade places
  const out = res.state;
  // A and D still meet in round 0 match 0, sides swapped
  assert.equal(out.names[0], 'D');
  assert.deepEqual(scoreFor(out, 0, 0), { sa: '7', sb: '11' }, 'D shows 7, A shows 11');
});

/* ── Arranging the draw ──────────────────────────────────────────────────── */
ok('swapSeeds trades two places and keeps results between people who still meet', () => {
  const before = played8();
  const res = swapSeeds(before, 0, 7);      // A and H trade
  assert.equal(res.state.names[0], 'H');
  assert.equal(res.state.names[7], 'A');
  assert.equal(res.kept + res.lost, 7, 'every old result accounted for');
  const had = resultPairs(before).map(([w, l]) => before.names[w] + '>' + before.names[l]);
  for (const [w, l] of resultPairs(res.state)) {
    assert.ok(had.includes(res.state.names[w] + '>' + res.state.names[l]), 'invented result');
  }
});
ok('swapSeeds rejects nonsense indexes untouched', () => {
  const s = { names: ['A', 'B'], picks: {}, title: '', scores: {} };
  assert.equal(swapSeeds(s, 0, 0).state, s);
  assert.equal(swapSeeds(s, -1, 1).state, s);
  assert.equal(swapSeeds(s, 0, 5).state, s);
});
ok('shuffleSeeds is a permutation and never invents results', () => {
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const before = played8();
  const res = shuffleSeeds(before, rnd);
  assert.deepEqual(res.state.names.slice().sort(), before.names.slice().sort());
  const had = resultPairs(before).map(([w, l]) => before.names[w] + '>' + before.names[l]);
  for (const [w, l] of resultPairs(res.state)) {
    assert.ok(had.includes(res.state.names[w] + '>' + res.state.names[l]), 'invented result');
  }
});

ok('sameBracket ignores results but not the line-up or the name', () => {
  const a = { names: ['A', 'B'], picks: {}, title: 'X' };
  const b = { names: ['A', 'B'], picks: { '0-0': 1 }, title: 'X' };
  assert.equal(sameBracket(a, b), true);
  assert.equal(sameBracket(a, { ...a, title: 'Y' }), false);
  assert.equal(sameBracket(a, { ...a, names: ['A', 'C'] }), false);
  assert.equal(sameBracket(a, null), false);
});

console.log(`\n${passed} bracket helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
