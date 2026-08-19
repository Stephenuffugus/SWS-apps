// Run: node test/roster.test.mjs
//
// The roster parser is where every competitor loses the user, so these cases
// are drawn from what teachers actually paste: an SIS HTML table, an Excel
// tab-separated block, a numbered list out of a Word document, a single
// column of names typed by hand, and a comma-formatted "Last, First" export.
import assert from 'node:assert/strict';
import {
  parsePaste, detectDelimiter, looksLikeHeader, guessColumns, splitFullName,
  buildStudents, displayName, findCollisions, partitionExisting, rowsFromHTML,
} from '../roster.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('tab-separated is the default reality of a copied table', () => {
  const t = 'Moreno\tJacob\t4412\nNguyen\tAda\t4418';
  const r = parsePaste(t);
  assert.equal(r.via, 'tab');
  assert.deepEqual(r.rows, [['Moreno', 'Jacob', '4412'], ['Nguyen', 'Ada', '4418']]);
});

ok('the delimiter is the mode across lines, not whatever line one used', () => {
  /* A title line with a comma in it must not turn the whole paste into CSV. */
  const t = 'Period 3, Room 12\nMoreno\tJacob\nNguyen\tAda\nOsei\tMalik';
  assert.equal(detectDelimiter(t.split('\n')), 'tab');
});

ok('numbered and bulleted lists lose their ornament', () => {
  const r = parsePaste('1. Jacob Moreno\n2) Ada Nguyen\n• Malik Osei\n- Sara Vance');
  assert.deepEqual(r.rows.map((x) => x[0]),
    ['Jacob Moreno', 'Ada Nguyen', 'Malik Osei', 'Sara Vance']);
});

ok('a header row is dropped, but a row of IDs is not mistaken for one', () => {
  assert.ok(looksLikeHeader(['Last Name', 'First Name', 'Student ID']));
  assert.ok(!looksLikeHeader(['4412', '4418', '4420']), 'digits mean data');
  assert.ok(!looksLikeHeader(['Moreno', 'Jacob', '4412']));
  const r = parsePaste('Last,First,ID\nMoreno,Jacob,4412');
  assert.deepEqual(r.header, ['Last', 'First', 'ID']);
  assert.equal(r.rows.length, 1);
});

ok('ragged rows are padded, never rejected', () => {
  const r = parsePaste('Moreno\tJacob\t4412\nNguyen\tAda\nOsei\tMalik\t4420');
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((x) => x.length === 3));
  assert.equal(r.rows[1][2], '');
});

ok('an HTML table off the clipboard beats every heuristic', () => {
  /* A minimal DOMParser stand-in, so the parser can be tested without a browser
     and so the test proves it reads textContent rather than markup. */
  class FakeDoc {
    constructor(html) { this.html = html; }
    querySelectorAll(sel) {
      if (sel === 'tr') {
        return [...this.html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => ({
          querySelectorAll: () => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
            .map((c) => ({ textContent: c[1].replace(/<[^>]*>/g, '') })),
        }));
      }
      return [];
    }
  }
  class FakeDP { parseFromString(h) { return new FakeDoc(h); } }
  const html = '<table><tr><th>Last</th><th>First</th></tr>'
             + '<tr><td>Moreno</td><td>Jacob</td></tr>'
             + '<tr><td>Nguyen</td><td><b>Ada</b></td></tr></table>';
  const rows = rowsFromHTML(html, FakeDP);
  assert.deepEqual(rows, [['Last', 'First'], ['Moreno', 'Jacob'], ['Nguyen', 'Ada']]);
  const r = parsePaste('irrelevant plain text', html, FakeDP);
  assert.equal(r.via, 'html', 'html must win when it is present');
  assert.deepEqual(r.header, ['Last', 'First']);
});

ok('column guessing: all-numeric is an ID, commas mean a full name', () => {
  const r = parsePaste('Moreno, Jacob\t4412\nNguyen, Ada\t4418');
  const cols = guessColumns(r.rows, r.header);
  assert.equal(cols[0], 'full');
  assert.equal(cols[1], 'sid');
});

ok('column guessing follows the header when there is one', () => {
  const r = parsePaste('Student ID,Last Name,First Name\n4412,Moreno,Jacob');
  const cols = guessColumns(r.rows, r.header);
  assert.deepEqual(cols, ['sid', 'last', 'first']);
});

ok('one column of names is a full name, not a surname', () => {
  const r = parsePaste('Jacob Moreno\nAda Nguyen');
  assert.deepEqual(guessColumns(r.rows, r.header), ['full']);
});

ok('name order is a choice, and comma form overrides it', () => {
  assert.deepEqual(splitFullName('Jacob Moreno'), { first: 'Jacob', last: 'Moreno' });
  assert.deepEqual(splitFullName('Moreno, Jacob'), { first: 'Jacob', last: 'Moreno' });
  assert.deepEqual(splitFullName('Moreno Jacob', 'lastFirst'), { first: 'Jacob', last: 'Moreno' });
  assert.deepEqual(splitFullName('Ada'), { first: 'Ada', last: '' });
  assert.deepEqual(splitFullName('Maria de la Cruz'),
    { first: 'Maria de la', last: 'Cruz' }, 'imperfect, but she can fix it inline');
});

ok('buildStudents skips empty rows and keeps IDs', () => {
  const rows = [['Moreno', 'Jacob', '4412'], ['', '', ''], ['Nguyen', 'Ada', '']];
  const s = buildStudents(rows, ['last', 'first', 'sid']);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { first: 'Jacob', last: 'Moreno', sid: '4412', tag: '', note: '', active: true });
});

ok('display defaults to the form that is safe to project', () => {
  const j = { first: 'Jacob', last: 'Moreno' };
  assert.equal(displayName(j), 'Jacob M.');
  assert.equal(displayName(j, 'full'), 'Jacob Moreno');
  assert.equal(displayName(j, 'initials'), 'JM');
  assert.equal(displayName({ first: '', last: '', sid: '4412' }), '4412');
  assert.equal(displayName({ first: 'Jacob', last: 'Moreno', tag: 'R.' }), 'Jacob M. (R.)');
});

ok('two Jacob M.s are detected, this blocks the commit', () => {
  const c = findCollisions([
    { first: 'Jacob', last: 'Moreno' },
    { first: 'Jacob', last: 'Mendez' },
    { first: 'Ada', last: 'Nguyen' },
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].indexes, [0, 1]);
  /* and a tag clears it */
  assert.equal(findCollisions([
    { first: 'Jacob', last: 'Moreno', tag: 'R.' },
    { first: 'Jacob', last: 'Mendez' },
  ]).length, 0);
});

ok('collisions are checked against the DISPLAYED name, not the full one', () => {
  /* Full names differ, so a naive check passes and she never finds out until
     the marks are on the wrong child. */
  const pair = [{ first: 'Jacob', last: 'Moreno' }, { first: 'Jacob', last: 'Mendez' }];
  assert.equal(findCollisions(pair, 'full').length, 0);
  assert.equal(findCollisions(pair, 'firstLast1').length, 1);
});

ok('re-pasting the same roster adds nobody twice', () => {
  const have = [{ first: 'Jacob', last: 'Moreno', sid: '4412' }];
  const { fresh, dupes } = partitionExisting(
    [{ first: 'Jacob', last: 'Moreno', sid: '4412' }, { first: 'Ada', last: 'Nguyen', sid: '' }], have);
  assert.equal(fresh.length, 1);
  assert.equal(dupes.length, 1);
  assert.equal(fresh[0].first, 'Ada');
});

ok('an empty paste is handled, not thrown', () => {
  const r = parsePaste('   \n\n  ');
  assert.deepEqual(r.rows, []);
  assert.equal(r.via, 'empty');
});

ok('a realistic 25-name Excel paste round-trips end to end', () => {
  const names = ['Moreno,Jacob', 'Nguyen,Ada', 'Osei,Malik', 'Vance,Sara', 'Kim,Dae',
    'Patel,Riya', 'Brown,Tyler', 'Silva,Ana', 'Okafor,Chidi', 'Weiss,Lena'];
  const text = 'Student\tID\n' + names.map((n, i) => `${n}\t${4400 + i}`).join('\n');
  const r = parsePaste(text);
  assert.deepEqual(r.header, ['Student', 'ID']);
  assert.equal(r.rows.length, 10);
  const cols = guessColumns(r.rows, r.header);
  const studs = buildStudents(r.rows, cols);
  assert.equal(studs.length, 10);
  assert.equal(studs[0].first, 'Jacob');
  assert.equal(studs[0].last, 'Moreno');
  assert.equal(studs[0].sid, '4400');
  assert.equal(findCollisions(studs).length, 0);
});

console.log(`  roster parser: ${passed} groups passed`);
