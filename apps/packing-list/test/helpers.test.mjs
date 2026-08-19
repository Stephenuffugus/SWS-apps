// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  PRESETS, CATEGORIES, MAX_LABEL, MAX_SHARED,
  mergePreset, addCustom, mergeItems, sanitizeItems, stats, groupItems,
  cleanLabel, catFor, encodeList, decodeList,
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
  assert.equal(r.skipped, 1);
  assert.equal(r.size, PRESETS.beach.length);
  assert.equal(r.items[0].done, true, 'existing check state preserved');
  const again = mergePreset(r.items, 'beach');
  assert.equal(again.added, 0, 'idempotent');
});

ok('addCustom trims, dedupes, caps length and SAYS it capped', () => {
  let r = addCustom([], '  Nintendo Switch  ');
  assert.equal(r.items[0].label, 'Nintendo Switch');
  assert.equal(r.truncated, false);
  r = addCustom(r.items, 'nintendo switch');
  assert.equal(r.added, 0);
  assert.equal(r.reason, 'duplicate');
  r = addCustom(r.items, '');
  assert.equal(r.added, 0);
  assert.equal(r.reason, 'empty');
  const long = addCustom([], 'W'.repeat(200));
  assert.equal(long.label.length, MAX_LABEL);
  assert.equal(long.truncated, true, 'a cap that does not report itself is the whole complaint');
  assert.equal(long.dropped, 140);
});

ok('a pasted newline separates words instead of welding them', () => {
  const r = addCustom([], 'line one\nline two');
  assert.equal(r.items[0].label, 'line one line two');
});

ok('NFC and NFD spellings of one word are one item', () => {
  const nfc = 'Café';
  const nfd = 'Café';
  assert.notEqual(nfc, nfd);
  const r1 = addCustom([], nfc);
  const r2 = addCustom(r1.items, nfd);
  assert.equal(r2.added, 0, 'two visually identical rows must not coexist');
});

ok('addCustom and presets carry a category', () => {
  assert.equal(catFor('Passport'), 'Documents');
  assert.equal(catFor('Nintendo Switch'), 'Your items');
  const r = addCustom([], 'Passport');
  assert.equal(r.items[0].cat, 'Documents');
});

ok('groupItems orders known categories and keeps insertion order inside', () => {
  const items = [
    { label: 'Socks', cat: 'Clothing', done: false },
    { label: 'Passport', cat: 'Documents', done: false },
    { label: 'Shirt', cat: 'Clothing', done: false },
  ];
  const g = groupItems(items);
  assert.deepEqual(g.map((x) => x.cat), ['Documents', 'Clothing']);
  assert.deepEqual(g[1].items.map((i) => i.label), ['Socks', 'Shirt']);
  assert.ok(CATEGORIES.indexOf('Documents') < CATEGORIES.indexOf('Clothing'));
});

ok('mergeItems folds a shared list in without duplicating', () => {
  const mine = [{ label: 'Passport', cat: 'Documents', done: true }];
  const theirs = [{ label: 'passport' }, { label: 'Swimsuit' }];
  const r = mergeItems(mine, theirs);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.items[0].done, true, 'my own tick survives a merge');
  assert.equal(r.items[1].cat, 'Clothing');
});

ok('sanitizeItems survives every shape that used to brick the app', () => {
  const r = sanitizeItems([
    null,
    { done: true },                        // no label
    { label: 42, done: 'yes' },            // numeric label, non-boolean done
    { label: { a: 1 } },                   // object label, used to print [object Object]
    { label: '  Tent  ', done: true },
    'not an object',
  ]);
  assert.deepEqual(r.items.map((i) => i.label), ['42', 'Tent']);
  assert.equal(r.items[0].done, false, 'done:"yes" is not a boolean true');
  assert.equal(r.items[1].done, true);
  assert.equal(r.dropped, 4);
  assert.deepEqual(sanitizeItems('nonsense'), { items: [], dropped: 0 });
  assert.deepEqual(sanitizeItems(undefined), { items: [], dropped: 0 });
});

ok('sanitizeItems coerces done to a real boolean', () => {
  const r = sanitizeItems([{ label: 'a', done: 'yes' }, { label: 'b', done: 1 }, { label: 'c', done: true }]);
  assert.deepEqual(r.items.map((i) => i.done), [false, false, true]);
});

ok('stats math', () => {
  const s = stats([{ label: 'a', done: true }, { label: 'b', done: false }]);
  assert.deepEqual(s, { done: 1, total: 2, remaining: 1 });
});

ok('list round-trips through the hash with checks reset', () => {
  const items = [{ label: 'Passport ✈️', done: true }, { label: 'Zoë’s bear', done: false }];
  const d = decodeList('#' + encodeList('Tokyo trip', items));
  assert.equal(d.name, 'Tokyo trip');
  assert.deepEqual(d.items.map((i) => i.label), ['Passport ✈️', 'Zoë’s bear']);
  assert.ok(d.items.every((i) => i.done === false), 'recipient starts unpacked');
  assert.equal(d.droppedItems, 0);
});

ok('decodeList tells "no link" apart from "broken link"', () => {
  assert.equal(decodeList(''), null, 'no hash at all');
  assert.equal(decodeList('#main'), null, 'the skip link is not a share link');
  assert.equal(decodeList('#!!bad'), null, 'too short and not base64url, not ours');
  const good = encodeList('Beach', Array.from({ length: 26 }, (_, i) => ({ label: 'Item number ' + i })));
  assert.ok(good.length > 100);
  for (const frac of [0.98, 0.9, 0.5]) {
    const clipped = decodeList('#' + good.slice(0, Math.floor(good.length * frac)));
    assert.ok(clipped && clipped.error === 'unreadable',
      'a link clipped to ' + frac * 100 + '% must report itself, not render as empty');
  }
});

ok('decodeList reports the 300-item cap instead of swallowing it', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ label: 'Item ' + i }));
  const d = decodeList('#' + encodeList('Big', many));
  assert.equal(d.items.length, MAX_SHARED);
  assert.equal(d.droppedItems, 100, '100 items vanished and the app used to say "loaded"');
});

ok('decodeList reports shortened labels', () => {
  const d = decodeList('#' + encodeList('T', [{ label: 'x'.repeat(90) }, { label: 'ok' }]));
  assert.equal(d.longLabels, 1);
  assert.equal(d.items[0].label.length, MAX_LABEL);
});

ok('cleanLabel reports how much it removed', () => {
  const c = cleanLabel('a'.repeat(65));
  assert.equal(c.truncated, true);
  assert.equal(c.dropped, 5);
  assert.equal(cleanLabel('   ').label, '');
});

ok('every preset is non-empty, reasonably sized and fully categorised', () => {
  for (const [k, v] of Object.entries(PRESETS)) {
    assert.ok(v.length >= 5 && v.length <= 15, k);
    assert.ok(v.every((x) => typeof x.label === 'string' && x.label.length <= MAX_LABEL), k);
    assert.ok(v.every((x) => CATEGORIES.includes(x.cat)), k + ' has an unknown category');
  }
});

console.log(`\n${passed} packing helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
