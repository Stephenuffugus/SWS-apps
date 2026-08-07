// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  nextBoxNumber, parseItems, searchBoxes, encodeBox, decodeBox, isBoxHash, encodeBoxForLabel,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

const boxes = [
  { id: 'a', n: 1, room: 'Kitchen', items: ['Can opener', 'Pots', 'The good knife'] },
  { id: 'b', n: 2, room: 'Bedroom', items: ['Winter clothes'] },
  { id: 'c', n: 7, room: 'Kitchen', items: ['Plates'] },
];

ok('nextBoxNumber continues from the highest', () => {
  assert.equal(nextBoxNumber(boxes), 8);
  assert.equal(nextBoxNumber([]), 1);
});
ok('parseItems splits on newline and comma', () => {
  assert.deepEqual(parseItems('Pots, pans\nThe good knife'), ['Pots', 'pans', 'The good knife']);
});
ok('search finds the can opener', () => {
  const r = searchBoxes(boxes, 'can opener');
  assert.equal(r.length, 1);
  assert.equal(r[0].box.n, 1);
  assert.deepEqual(r[0].hitItems, ['Can opener']);
});
ok('search by room and by number', () => {
  assert.equal(searchBoxes(boxes, 'kitchen').length, 2);
  assert.equal(searchBoxes(boxes, '#7')[0].box.n, 7);
  assert.equal(searchBoxes(boxes, '').length, 0);
});
ok('box round-trips through the label QR payload', () => {
  const enc = encodeBox(boxes[0]);
  assert.ok(isBoxHash('#' + enc));
  const d = decodeBox('#' + enc);
  assert.equal(d.n, 1);
  assert.equal(d.room, 'Kitchen');
  assert.deepEqual(d.items, ['Can opener', 'Pots', 'The good knife']);
  assert.equal(decodeBox('#b.!!!'), null);
});

ok('label payload caps size with an honest truncation marker', () => {
  const monster = { n: 3, room: 'Garage', items: Array.from({ length: 100 }, (_, i) => 'Item ' + i + ' with a long descriptive name attached') };
  const enc = encodeBoxForLabel(monster);
  assert.ok(enc.length <= 900, 'capped at ' + enc.length);
  const d = decodeBox('#' + enc);
  assert.equal(d.n, 3);
  assert.ok(d.items[d.items.length - 1].includes('more'), 'truncation marker present');
  // small boxes are untouched
  const small = encodeBoxForLabel({ n: 1, room: 'Kitchen', items: ['Pots'] });
  assert.deepEqual(decodeBox('#' + small).items, ['Pots']);
});

console.log(`\n${passed} moving-boxes helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
