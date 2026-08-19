// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  LIMITS, nextBoxNumber, parseBoxNumber, parseItems, parseItemsDetailed, searchBoxes,
  sanitizeBoxes, mergeBoxes, boxesToCsv, encodeBox, decodeBox, isBoxHash, encodeBoxForLabel,
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

/* The bug this locks down: 99999999999999999999 stored as 1e20, and
   1e20 + 1 === 1e20, so every later box was numbered 1e20 forever. */
ok('nextBoxNumber ignores junk and never returns a non-integer', () => {
  const poisoned = [{ n: 1e20 }, { n: 3 }, { n: null }, null, { n: -5 }, { n: 1.5 }];
  assert.equal(nextBoxNumber(poisoned), 4);
  assert.equal(nextBoxNumber([{ n: LIMITS.boxNumber }]), LIMITS.boxNumber);
  assert.equal(nextBoxNumber(null), 1);
});

ok('parseBoxNumber rejects everything that used to be swallowed', () => {
  assert.deepEqual(parseBoxNumber('12'), { n: 12, error: null });
  assert.deepEqual(parseBoxNumber('  7 '), { n: 7, error: null });
  assert.deepEqual(parseBoxNumber(''), { n: null, error: null });
  for (const bad of ['0', '-5', '1e3', '1.5', 'abc', '99999999999999999999', '12x']) {
    const r = parseBoxNumber(bad);
    assert.equal(r.n, null, bad + ' should not parse');
    assert.ok(r.error && r.error.length > 4, bad + ' needs a message');
  }
});

ok('parseItems splits on newline and comma', () => {
  assert.deepEqual(parseItems('Pots, pans\nThe good knife'), ['Pots', 'pans', 'The good knife']);
});

ok('parseItemsDetailed reports every cap it applied', () => {
  const many = parseItemsDetailed(Array.from({ length: 150 }, (_, i) => 'thing ' + i).join('\n'));
  assert.equal(many.items.length, LIMITS.itemsPerBox);
  assert.equal(many.dropped, 50);
  const long = parseItemsDetailed('x'.repeat(200) + '\nshort');
  assert.equal(long.shortened, 1);
  assert.equal(long.items[0].length, LIMITS.itemChars);
  assert.equal(long.dropped, 0);
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

/* Every shape that used to throw inside renderBoxes and blank the whole list. */
ok('sanitizeBoxes survives the six corrupt-storage shapes', () => {
  const a = sanitizeBoxes([{ n: 1 }]);
  assert.equal(a.boxes.length, 1);
  assert.deepEqual(a.boxes[0].items, []);

  const b = sanitizeBoxes([{ n: 1, room: 123, items: 'string not array' }]);
  assert.equal(b.boxes.length, 1);
  assert.equal(b.boxes[0].room, '');
  assert.deepEqual(b.boxes[0].items, []);
  assert.equal(b.repaired, 1);

  const c = sanitizeBoxes([null, 1, 'x', { n: 9, room: 'Attic', items: ['Skis'] }]);
  assert.equal(c.boxes.length, 1, 'the one good box must survive its bad siblings');
  assert.equal(c.boxes[0].n, 9);
  assert.equal(c.skipped, 3);

  assert.equal(sanitizeBoxes('not an array').unusable, true);
  assert.equal(sanitizeBoxes([]).boxes.length, 0);
  assert.equal(sanitizeBoxes([{ n: 0 }, { n: -1 }, { n: 1e20 }]).skipped, 3);
});

ok('sanitizeBoxes counts what the caps ate', () => {
  const big = Array.from({ length: 700 }, (_, i) => ({ n: i + 1, room: 'R', items: ['a'] }));
  const r = sanitizeBoxes(big);
  assert.equal(r.boxes.length, LIMITS.boxes);
  assert.equal(r.overflow, 200);
  const fat = sanitizeBoxes([{ n: 1, items: Array.from({ length: 140 }, () => 'x'.repeat(80)) }]);
  assert.equal(fat.itemsDropped, 40);
  assert.equal(fat.shortened, LIMITS.itemsPerBox);
});

ok('mergeBoxes keeps both sides and updates by box number', () => {
  const mine = [
    { id: 'x', n: 1, room: 'Kitchen', items: ['Pots'] },
    { id: 'y', n: 2, room: 'Bedroom', items: ['Socks'] },
  ];
  const theirs = [
    { id: 'p', n: 2, room: 'Bedroom', items: ['Socks', 'Shirts'] },
    { id: 'q', n: 5, room: 'Attic', items: ['Skis'] },
  ];
  const r = mergeBoxes(mine, theirs);
  assert.equal(r.boxes.length, 3);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.boxes.find(b => b.n === 2).items.length, 2);
  assert.equal(r.boxes.find(b => b.n === 2).id, 'y', 'identity of my own row is kept');
  assert.equal(mine.length, 2, 'merge must not mutate the current list');
  assert.equal(mergeBoxes(mine, mine).unchanged, 2);

  const full = Array.from({ length: LIMITS.boxes }, (_, i) => ({ id: 'i' + i, n: i + 1, room: '', items: [] }));
  assert.equal(mergeBoxes(full, [{ id: 'z', n: 9999, room: '', items: [] }]).overflow, 1);
});

ok('CSV has a header, a row per box, and no live formulas', () => {
  const csv = boxesToCsv([...boxes, { id: 'd', n: 4, room: '=cmd|calc', items: ['a "quoted" thing'] }]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 5);
  assert.ok(lines[0].startsWith('"Box","Room"'));
  assert.ok(lines[1].startsWith('"1","Kitchen","3"'), lines[1]);
  assert.ok(lines[3].includes('"\'=cmd|calc"'), 'leading = is defused: ' + lines[3]);
  assert.ok(lines[3].includes('""quoted""'));
});

ok('box round-trips through the label QR payload', () => {
  const enc = encodeBox(boxes[0]);
  assert.ok(isBoxHash('#' + enc));
  const d = decodeBox('#' + enc);
  assert.equal(d.n, 1);
  assert.equal(d.room, 'Kitchen');
  assert.deepEqual(d.items, ['Can opener', 'Pots', 'The good knife']);
  assert.equal(d.total, null);
  assert.equal(decodeBox('#b.!!!'), null);
});

ok('the payload can carry "box 12 of 47"', () => {
  const d = decodeBox('#' + encodeBox({ ...boxes[0], total: 47 }));
  assert.equal(d.total, 47);
  assert.equal(decodeBox('#' + encodeBox({ ...boxes[0], total: 0 })).total, null);
});

ok('label payload obeys a caller-supplied fit test, not a magic number', () => {
  const monster = { n: 3, room: 'Garage', items: Array.from({ length: 100 }, (_, i) => 'Item ' + i + ' with a long descriptive name attached') };

  // The real constraint is physical: the caller measures the finished QR and
  // says yes or no. Here we stand in for it with a byte budget.
  const budget = 586;
  const fit = encodeBoxForLabel(monster, (enc) => enc.length <= budget);
  assert.ok(fit.payload.length <= budget, 'capped at ' + fit.payload.length);
  assert.ok(fit.dropped > 0);
  assert.equal(fit.kept + fit.dropped, 100);
  const d = decodeBox('#' + fit.payload);
  assert.equal(d.n, 3);
  assert.equal(d.items.length, fit.kept + 1, 'kept items plus the truncation marker');
  assert.ok(d.items[d.items.length - 1].includes('packing list'),
    'the marker points at a document that now exists: ' + d.items[d.items.length - 1]);

  // It finds the LARGEST list that fits, not just any list that fits.
  const oneMore = encodeBox({ ...monster, items: monster.items.slice(0, fit.kept + 1).concat(['…plus ' + (99 - fit.kept) + ' more, on the packing list']) });
  assert.ok(oneMore.length > budget, 'one more item would not have fitted');

  // Small boxes are untouched and report nothing dropped.
  const small = encodeBoxForLabel({ n: 1, room: 'Kitchen', items: ['Pots'] }, (e) => e.length <= budget);
  assert.equal(small.dropped, 0);
  assert.deepEqual(decodeBox('#' + small.payload).items, ['Pots']);

  // Legacy numeric form still works.
  assert.ok(encodeBoxForLabel(monster, 300).payload.length <= 300);
});

console.log(`\n${passed} moving-boxes helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
