// Unit tests for pure helpers — run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  CODE_CHARS, genCode, normalizeCode, parseBulkSlots, dateRangeSlots,
  fillStats, nudgeMessage, shareUrl,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('code alphabet has no lookalikes', () => {
  for (const bad of '0O1Il') assert.ok(!CODE_CHARS.includes(bad) || bad === 'O' && false, bad);
  assert.ok(!CODE_CHARS.includes('0'));
  assert.ok(!CODE_CHARS.includes('1'));
  assert.ok(!CODE_CHARS.includes('I'));
  assert.ok(!CODE_CHARS.includes('L'.toLowerCase()));
  assert.equal(CODE_CHARS.length, 32);
});
ok('genCode makes 6-char codes from the alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const c = genCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{6}$/);
  }
});
ok('normalizeCode cleans and validates', () => {
  assert.equal(normalizeCode(' abcdef '), 'ABCDEF');
  assert.equal(normalizeCode('AB-CD-EF'), 'ABCDEF');
  assert.equal(normalizeCode('ABC'), null);
  assert.equal(normalizeCode('ABCDEFG'), null); // 7 valid chars
  assert.equal(normalizeCode('AB01EF'), null);  // 0/1 stripped -> too short
  assert.equal(normalizeCode(null), null);
});
ok('parseBulkSlots handles capacities and junk', () => {
  const rows = parseBulkSlots('Main dish x3\nSide or salad (4)\n\n  Dessert ×2 \nDrinks & ice\n   \n');
  assert.deepEqual(rows, [
    { label: 'Main dish', capacity: 3 },
    { label: 'Side or salad', capacity: 4 },
    { label: 'Dessert', capacity: 2 },
    { label: 'Drinks & ice', capacity: 1 },
  ]);
  assert.equal(parseBulkSlots('x3').length, 0); // capacity with no label
  assert.equal(parseBulkSlots(Array(300).fill('row').join('\n')).length, 100); // capped
});
ok('dateRangeSlots: every Tuesday Sept–Nov 2026', () => {
  const rows = dateRangeSlots({
    start: '2026-09-01', end: '2026-11-30', weekdays: [2],
    timeText: '3–5pm', prefix: 'Practice', capacity: 2,
  });
  assert.equal(rows.length, 13); // Tuesdays: Sep 1..29 (5), Oct 6..27 (4), Nov 3..24 (4)
  assert.ok(rows[0].label.startsWith('Practice — Tue'));
  assert.ok(rows[0].label.includes('3–5pm'));
  assert.ok(rows.every(r => r.capacity === 2));
});
ok('dateRangeSlots rejects bad input', () => {
  assert.equal(dateRangeSlots({ start: '2026-01-10', end: '2026-01-01', weekdays: [1] }).length, 0);
  assert.equal(dateRangeSlots({ start: 'junk', end: '2026-01-01', weekdays: [1] }).length, 0);
  assert.equal(dateRangeSlots({ start: '2026-01-01', end: '2026-12-31', weekdays: [] }).length, 0);
});
ok('fillStats sums capacity and claims', () => {
  const s = fillStats([{ capacity: 3, claimedCount: 2 }, { capacity: 1, claimedCount: 0 }, { capacity: 2, claimedCount: 5 }]);
  assert.deepEqual(s, { taken: 4, total: 6 }); // over-claims clamp to capacity
});
ok('nudgeMessage lists only open spots', () => {
  const msg = nudgeMessage('Fall Potluck', [
    { label: 'Main dish', capacity: 3, claimedCount: 1 },
    { label: 'Dessert', capacity: 1, claimedCount: 1 },
    { label: 'Drinks', capacity: 1, claimedCount: 0 },
  ], 'https://x.test/#/b/ABCDEF');
  assert.ok(msg.includes('Main dish (2 needed)'));
  assert.ok(!msg.includes('Dessert'));
  assert.ok(msg.includes('Drinks'));
  assert.ok(msg.includes('https://x.test/#/b/ABCDEF'));
});
ok('shareUrl shape', () => {
  assert.equal(shareUrl('ABCDEF', 'https://x.test/app/'), 'https://x.test/app/#/b/ABCDEF');
});

console.log(`\n${passed} helper test groups passed${process.exitCode ? ' (with failures)' : ''}`);
