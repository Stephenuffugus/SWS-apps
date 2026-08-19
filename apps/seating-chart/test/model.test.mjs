// Unit tests for the seating model, run: node test/model.test.mjs
import assert from 'node:assert/strict';
import {
  newProject, parseGuestPaste, splitCsvLine, lastNameOf,
  validate, placementOk, autoArrange, occupancy, unassignedGuests, mealSummary,
} from '../model.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

let seq = 0;
const ids = () => 'g' + (++seq);

function sampleProject() {
  seq = 0;
  const p = newProject('Test wedding');
  p.guests = parseGuestPaste([
    'Ann Alvarez, Alvarez family, Beef',
    'Ben Alvarez, Alvarez family, Fish',
    'Cara Chen, Veg, nut allergy',
    'Dev Chen, Beef',
    'Elle Novak, Novak party, Veg',
    'Finn Novak, Novak party, Beef',
    'Gus Ortiz',
  ].join('\n'), ids);
  p.tables = [
    { id: 'T1', label: 'Table 1', shape: 'round', seats: 4, x: 0, y: 0 },
    { id: 'T2', label: 'Table 2', shape: 'round', seats: 4, x: 0, y: 0 },
    { id: 'T3', label: 'Head table', shape: 'head', seats: 2, x: 0, y: 0 },
  ];
  return p;
}

/* ---------- parsing ---------- */
ok('csv line splitting honors quotes', () => {
  assert.deepEqual(splitCsvLine('a, "b, c", d'), ['a', 'b, c', 'd']);
  assert.deepEqual(splitCsvLine('"say ""hi""",x'), ['say "hi"', 'x']);
});
ok('guest paste: names, parties, meals, tags', () => {
  const gs = parseGuestPaste('Name,Party,Meal\nAnn Alvarez, Fam, Beef, gluten-free; nut allergy\nBen\n\n', ids);
  assert.equal(gs.length, 2); // header skipped, blank skipped
  assert.equal(gs[0].name, 'Ann Alvarez');
  assert.equal(gs[0].party, 'Fam');
  assert.equal(gs[0].meal, 'Beef');
  assert.deepEqual(gs[0].tags, ['gluten-free', 'nut allergy']);
  assert.equal(gs[1].name, 'Ben');
});
ok('lastNameOf heuristic', () => {
  assert.equal(lastNameOf('Ann Alvarez'), 'Alvarez');
  assert.equal(lastNameOf('Cher'), 'Cher');
  assert.equal(lastNameOf('Mary Jo van Der Berg'), 'Berg');
});

/* ---------- validation ---------- */
ok('clean project has no violations', () => {
  const p = sampleProject();
  assert.deepEqual(validate(p), []);
});
ok('capacity violation surfaces', () => {
  const p = sampleProject();
  for (const g of p.guests.slice(0, 5)) p.assignments[g.id] = 'T1'; // 5 into 4 seats
  const v = validate(p);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'capacity');
  assert.match(v[0].message, /5 people for 4 seats/);
});
ok('together rule violation', () => {
  const p = sampleProject();
  p.rules = [{ id: 'r1', type: 'together', guestIds: ['g1', 'g2'] }];
  p.assignments = { g1: 'T1', g2: 'T2' };
  const v = validate(p);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'together');
});
ok('apart rule violation', () => {
  const p = sampleProject();
  p.rules = [{ id: 'r1', type: 'apart', guestIds: ['g3', 'g4'] }];
  p.assignments = { g3: 'T2', g4: 'T2' };
  const v = validate(p);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'apart');
});
ok('mustTable violation', () => {
  const p = sampleProject();
  p.rules = [{ id: 'r1', type: 'mustTable', guestIds: ['g7'], tableId: 'T3' }];
  p.assignments = { g7: 'T1' };
  const v = validate(p);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'mustTable');
});
ok('declined guest holding a seat is flagged', () => {
  const p = sampleProject();
  p.assignments = { g1: 'T1' };
  p.guests[0].rsvp = 'no';
  const v = validate(p);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'rsvp');
});
ok('assignment to deleted table is flagged as stale', () => {
  const p = sampleProject();
  p.assignments = { g1: 'GONE' };
  const v = validate(p);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'stale');
});
ok('placementOk catches a bad move', () => {
  const p = sampleProject();
  p.rules = [{ id: 'r1', type: 'apart', guestIds: ['g3', 'g4'] }];
  p.assignments = { g3: 'T1' };
  assert.equal(placementOk(p, 'g4', 'T1'), false);
  assert.equal(placementOk(p, 'g4', 'T2'), true);
});

/* ---------- auto-arrange ---------- */
ok('auto-arrange seats everyone within constraints', () => {
  const p = sampleProject();
  p.rules = [
    { id: 'r1', type: 'apart', guestIds: ['g3', 'g5'] },
    { id: 'r2', type: 'mustTable', guestIds: ['g7'], tableId: 'T3' },
  ];
  const a = autoArrange(p);
  const trial = { ...p, assignments: a };
  assert.equal(validate(trial).length, 0, 'no violations after arrange');
  assert.equal(Object.keys(a).length, 7, 'everyone seated');
  assert.equal(a.g7, 'T3', 'must-table honored');
  // parties stay together
  assert.equal(a.g1, a.g2, 'Alvarez family together');
  assert.equal(a.g5, a.g6, 'Novak party together');
});
ok('auto-arrange respects declined guests', () => {
  const p = sampleProject();
  p.guests[6].rsvp = 'no';
  const a = autoArrange(p);
  assert.equal(a.g7, undefined);
});
ok('auto-arrange splits an oversized party rather than dropping it', () => {
  seq = 0;
  const p = newProject('big');
  p.guests = parseGuestPaste(Array.from({ length: 6 }, (_, i) => `P${i}, BigParty`).join('\n'), ids);
  p.tables = [
    { id: 'T1', label: 'T1', shape: 'round', seats: 4, x: 0, y: 0 },
    { id: 'T2', label: 'T2', shape: 'round', seats: 4, x: 0, y: 0 },
  ];
  const a = autoArrange(p);
  assert.equal(Object.keys(a).length, 6, 'all seated across tables');
  const trial = { ...p, assignments: a };
  assert.equal(validate(trial).filter(v => v.kind === 'capacity').length, 0);
});
ok('auto-arrange fuzz: never violates capacity or apart', () => {
  let s = 99;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 100; t++) {
    seq = 0;
    const p = newProject('fuzz');
    const n = 4 + Math.floor(rnd() * 30);
    p.guests = parseGuestPaste(
      Array.from({ length: n }, (_, i) => `G${i}${rnd() < 0.5 ? ', party' + Math.floor(rnd() * 5) : ''}`).join('\n'), ids);
    const tn = 2 + Math.floor(rnd() * 5);
    p.tables = Array.from({ length: tn }, (_, i) =>
      ({ id: 'T' + i, label: 'T' + i, shape: 'round', seats: 4 + Math.floor(rnd() * 8), x: 0, y: 0 }));
    if (rnd() < 0.5 && n >= 2) {
      const a = 'g' + (1 + Math.floor(rnd() * n)), b = 'g' + (1 + Math.floor(rnd() * n));
      if (a !== b) p.rules.push({ id: 'r', type: 'apart', guestIds: [a, b] });
    }
    const asg = autoArrange(p);
    const trial = { ...p, assignments: asg };
    const bad = validate(trial).filter(v => v.kind === 'capacity' || v.kind === 'apart');
    assert.equal(bad.length, 0, `t=${t}: ${bad.map(b => b.message).join('; ')}`);
  }
});

/* ---------- helpers ---------- */
ok('occupancy + unassigned + meals (unseated guests still counted)', () => {
  const p = sampleProject();
  p.assignments = { g1: 'T1', g2: 'T1', g3: 'T2' };
  const occ = occupancy(p);
  assert.equal(occ.T1.length, 2);
  assert.equal(unassignedGuests(p).length, 4);
  const { totals, total, perTable } = mealSummary(p);
  // the kitchen cooks for all 7 attending, not just the 3 seated
  assert.equal(total, 7);
  assert.equal(totals.Beef, 3);
  assert.equal(totals.Fish, 1);
  assert.equal(totals.Veg, 2);
  const unseated = perTable.find(x => x.table.label === 'Not yet seated');
  assert.ok(unseated, 'unseated bucket present');
  assert.equal(unseated.guests.length, 4);
});
ok('mealSummary has no unseated bucket when everyone is placed', () => {
  const p = sampleProject();
  for (const g of p.guests) p.assignments[g.id] = 'T1';
  const { perTable, total } = mealSummary(p);
  assert.equal(total, 7);
  assert.ok(!perTable.some(x => x.table.label === 'Not yet seated'));
});
ok('placementOk: clearing one violation never licenses creating another', () => {
  const p = sampleProject();
  p.tables[2].seats = 1;                       // head table: 1 seat
  p.assignments = { g7: 'T3', g1: 'GONE' };    // g1 stranded on a deleted table
  // moving g1 onto the FULL head table would fix "stale" but create "capacity"
  assert.equal(placementOk(p, 'g1', 'T3'), false);
  assert.equal(placementOk(p, 'g1', 'T1'), true);
});
ok('auto-arrange unions overlapping together-rules (A+B, C+D, then B+C)', () => {
  seq = 0;
  const p = newProject('chain');
  p.guests = parseGuestPaste('A\nB\nC\nD', ids);
  p.tables = [
    { id: 'T1', label: 'T1', shape: 'round', seats: 4, x: 0, y: 0 },
    { id: 'T2', label: 'T2', shape: 'round', seats: 4, x: 0, y: 0 },
  ];
  p.rules = [
    { id: 'r1', type: 'together', guestIds: ['g1', 'g2'] },
    { id: 'r2', type: 'together', guestIds: ['g3', 'g4'] },
    { id: 'r3', type: 'together', guestIds: ['g2', 'g3'] },
  ];
  const a = autoArrange(p);
  assert.equal(new Set([a.g1, a.g2, a.g3, a.g4]).size, 1, 'chained group lands on one table');
  assert.equal(validate({ ...p, assignments: a }).length, 0);
});

console.log(`\n${passed} model test groups passed${process.exitCode ? ' (with failures)' : ''}`);
