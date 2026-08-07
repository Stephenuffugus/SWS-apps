// Unit tests — run: node test/model.test.mjs
import assert from 'node:assert/strict';
import {
  newInventory, parseValue, totals, roomItems, byValueDesc, dataUrlToBytes,
} from '../model.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('parseValue handles formats', () => {
  assert.equal(parseValue('1200'), 120000);
  assert.equal(parseValue('$1,200.50'), 120050);
  assert.equal(parseValue('1.200,50'), 120050);
  assert.equal(parseValue('12,50'), 1250);
  assert.equal(parseValue(''), null);
  assert.equal(parseValue('abc'), null);
  assert.equal(parseValue('-5'), null);
});

function sample() {
  const inv = newInventory('Test house');
  inv.rooms = [{ id: 'R1', name: 'Living room' }, { id: 'R2', name: 'Kitchen' }];
  inv.items = [
    { id: 'i1', roomId: 'R1', name: 'TV', serial: 'SN1', purchaseDate: '', valueCents: 120000, notes: '', photo: 'data:image/jpeg;base64,AA==', receipt: null },
    { id: 'i2', roomId: 'R1', name: 'Sofa', serial: '', purchaseDate: '', valueCents: 80000, notes: '', photo: null, receipt: null },
    { id: 'i3', roomId: 'R2', name: 'Mixer', serial: '', purchaseDate: '', valueCents: 30000, notes: '', photo: null, receipt: null },
    { id: 'i4', roomId: 'GONE', name: 'Orphan', serial: '', purchaseDate: '', valueCents: 5000, notes: '', photo: null, receipt: null },
  ];
  return inv;
}

ok('totals roll up rooms, orphans, photos', () => {
  const t = totals(sample());
  assert.equal(t.count, 4);
  assert.equal(t.valueCents, 235000);
  assert.equal(t.photos, 1);
  assert.equal(t.perRoom.length, 3); // two rooms + Unsorted
  assert.equal(t.perRoom[2].room.name, 'Unsorted');
  assert.equal(t.perRoom[2].valueCents, 5000);
});
ok('roomItems filters', () => {
  assert.equal(roomItems(sample(), 'R1').length, 2);
});
ok('byValueDesc sorts for adjusters', () => {
  const names = byValueDesc(sample()).map(i => i.name);
  assert.deepEqual(names, ['TV', 'Sofa', 'Mixer', 'Orphan']);
});
ok('totals survives a partial object (corrupt import must not brick the home screen)', () => {
  const t = totals({ items: [{ id: 'x', roomId: 'R', name: 'a', valueCents: 100 }] }); // no rooms key
  assert.equal(t.count, 1);
  assert.equal(t.valueCents, 100);
  assert.equal(t.perRoom[0].room.name, 'Unsorted');
});
ok('dataUrlToBytes decodes and rejects junk', () => {
  const b = dataUrlToBytes('data:image/jpeg;base64,AQID');
  assert.deepEqual([...b], [1, 2, 3]);
  assert.equal(dataUrlToBytes('nonsense'), null);
});

console.log(`\n${passed} model test groups passed${process.exitCode ? ' (with failures)' : ''}`);
