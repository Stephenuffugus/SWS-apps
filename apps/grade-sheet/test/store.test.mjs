// Run: node test/store.test.mjs
//
// The export is the teacher's only real backup, so these test the two things
// that would actually hurt her: a round-trip that loses marks, and a derived
// number sneaking into the file where it can go stale.
import assert from 'node:assert/strict';
import { serialize, deserialize, toCSV, backupName, newBook, newClass } from '../store.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

const NOW = '2026-09-16T15:41:02.660Z';
function book() {
  const b = newBook(NOW);
  b.classIndex = [{ id: 'cls_1', name: '2 Kowalski', period: 3, days: ['A'] }];
  return b;
}
function cls() {
  const c = newClass('cls_1', '2 Kowalski');
  c.period = 3; c.days = ['A'];
  c.categories = [{ id: 'cat_1', name: 'Participation', weight: 100, dropLowest: 0 }];
  c.students = [
    { id: 'stu_1', first: 'Jacob', last: 'Moreno', sid: '4412', tag: '', note: '', active: true },
    { id: 'stu_2', first: 'Ada', last: 'Nguyen', sid: '', tag: '', note: '', active: true },
  ];
  c.assignments = [{
    id: 'asg_1', categoryId: 'cat_1', name: 'Participation — 16 Sep', date: '2026-09-16',
    pointsPossible: 4, scheme: 'levels4', extraCredit: false, neverDrop: false, includeInGrade: true,
  }];
  c.scores = {
    asg_1: {
      stu_1: { state: 'graded', points: 4 },
      stu_2: { state: 'missing', absent: true, note: 'nurse' },
    },
  };
  return c;
}

ok('78  export → import round-trips class records exactly', () => {
  const b = book(), c = cls();
  const back = deserialize(JSON.parse(JSON.stringify(serialize(b, [c], NOW))));
  assert.deepEqual(back.classes[0], c, 'a class must survive the round trip byte for byte');
  assert.equal(back.book.teacherName, b.teacherName);
  assert.equal(back.classes[0].scores.asg_1.stu_2.note, 'nurse');
  assert.equal(back.classes[0].scores.asg_1.stu_2.absent, true);
});

ok('79  a foreign backup is refused by name, not half-loaded', () => {
  assert.throws(() => deserialize({ sws: 1, app: 'packing-list', name: 'Packing List' }),
    /Packing List/, 'the error should say which app it actually is');
  assert.throws(() => deserialize(null), /not readable/);
  assert.throws(() => deserialize({ app: 'grade-sheet' }), /./, 'no classes key is still handled');
});

ok('74  no derived value reaches the file', () => {
  const json = JSON.stringify(serialize(book(), [cls()], NOW));
  for (const k of ['"pct"', '"letter"', '"display"', '"percent"', '"average"', '"subtotal"', '"dropped"']) {
    assert.ok(!json.includes(k), `${k} must not be persisted — it goes stale on a cutoff edit`);
  }
});

ok('the file is readable by a human who no longer has the app', () => {
  const s = serialize(book(), [cls()], NOW);
  assert.ok(Array.isArray(s.readme) && s.readme.length >= 4);
  const row = s.classes[0].scores.find((r) => r.student === 'stu_1');
  assert.equal(row.assignmentName, 'Participation — 16 Sep');
  assert.equal(row.studentName, 'Jacob Moreno', 'a name on every row, so Notepad is enough');
});

ok('CSV is long format and quotes the commas in a name', () => {
  const csv = toCSV([cls()]).split('\n');
  assert.equal(csv.length, 3, 'header + one row per cell');
  assert.ok(csv[0].startsWith('Class,Period,Student,'));
  assert.ok(csv[1].includes('"Moreno, Jacob"'), 'the comma in a name must be quoted');
  assert.ok(csv[2].includes('missing'));
  assert.ok(csv[2].includes('nurse'));
});

ok('CSV writes an empty score for every non-graded state', () => {
  const rows = toCSV([cls()]).split('\n');
  const missing = rows.find((r) => r.includes('missing'));
  const cells = missing.split(',');
  // ...,Points possible,Score,State,... — Score must be blank, not 0
  assert.ok(/,,missing,/.test(missing), 'a missing cell has no score, it has a state');
  assert.ok(cells.length >= 13);
});

ok('ungraded cells still appear in the CSV', () => {
  const c = cls();
  c.scores = {};                       // nothing entered at all
  const rows = toCSV([c]).split('\n');
  assert.equal(rows.length, 3, 'every student × assignment cell is a row, entered or not');
  assert.ok(rows[1].includes('ungraded'));
});

ok('filenames never contain a student name', () => {
  assert.equal(backupName(NOW, 'json'), 'grade-sheet-backup-2026-09-16.json');
  assert.equal(backupName(NOW, 'csv'), 'grade-sheet-marks-2026-09-16.csv');
});

ok('a book with 25 classes serialises without choking', () => {
  const many = Array.from({ length: 25 }, (_, i) => {
    const c = cls();
    c.id = 'cls_' + i;
    c.students = Array.from({ length: 24 }, (_, j) => ({
      id: `s${i}_${j}`, first: 'Kid' + j, last: 'Sur' + j, sid: '', tag: '', note: '', active: true,
    }));
    return c;
  });
  const json = JSON.stringify(serialize(book(), many, NOW));
  assert.ok(json.length > 10000);
  const back = deserialize(JSON.parse(json));
  assert.equal(back.classes.length, 25);
  assert.equal(back.classes[7].students.length, 24);
});

console.log(`  store: ${passed} groups passed`);
