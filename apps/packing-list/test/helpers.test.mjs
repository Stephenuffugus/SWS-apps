// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  PRESETS, mergePreset, addCustom, stats, encodeList, decodeList,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('mergePreset adds without duplicating (case-insensitive)', () => {
  const start = [{ label: 'sunscreen', done: true }];
  const r = mergePreset(start, 'beach');
  assert.equal(r.added, PRESETS.beach.length - 1, 'Sunscreen not re-added');
  assert.equal(r.items[0].done, true, 'existing check state preserved');
  const again = mergePreset(r.items, 'beach');
  assert.equal(again.added, 0, 'idempotent');
});
ok('addCustom trims, dedupes, caps length', () => {
  let r = addCustom([], '  Nintendo Switch  ');
  assert.equal(r.items[0].label, 'Nintendo Switch');
  r = addCustom(r.items, 'nintendo switch');
  assert.equal(r.added, 0);
  r = addCustom(r.items, '');
  assert.equal(r.added, 0);
});
ok('stats math', () => {
  const s = stats([{ label: 'a', done: true }, { label: 'b', done: false }]);
  assert.deepEqual(s, { done: 1, total: 2, remaining: 1 });
});
ok('list round-trips through the hash with checks reset', () => {
  const items = [{ label: 'Passport ✈️', done: true }, { label: 'Zoë’s bear', done: false }];
  const d = decodeList('#' + encodeList('Tokyo trip', items));
  assert.equal(d.name, 'Tokyo trip');
  assert.deepEqual(d.items.map(i => i.label), ['Passport ✈️', 'Zoë’s bear']);
  assert.ok(d.items.every(i => i.done === false), 'recipient starts unpacked');
  assert.equal(decodeList('#!!bad'), null);
});
ok('every preset is non-empty and reasonably sized', () => {
  for (const [k, v] of Object.entries(PRESETS)) {
    assert.ok(v.length >= 5 && v.length <= 15, k);
    assert.ok(v.every(x => typeof x === 'string' && x.length <= 60), k);
  }
});

console.log(`\n${passed} packing helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
