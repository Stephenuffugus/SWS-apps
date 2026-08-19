// Pure-helper tests for team-parent. No DOM, no Firebase, no emulator:
//   node apps/team-parent/test/helpers.test.mjs
//
// These cover the date model that landed in `order` (firestore.rules pins the
// slot document shape, so the date could not become its own field), the label
// encoding, the pasted-schedule sniffer, and the two escape hatches.
import assert from 'node:assert/strict';
import {
  dateKey, isDated, keyParts, keyToDate, keyToInputs, formatKey, formatTime,
  shortDate, sortSlots, isPast, composeLabel, parseLabel, sniffDateTime,
  seasonIcs, weekMessage, dateRangeSlots, parseBulkSlots, normalizeCode,
  UNDATED_BASE, DATED_MIN, DATED_MAX,
} from '../helpers.js';

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String((e && e.message) || e).slice(0, 400)); }
}

/* ---------- the date model ---------- */

t('dateKey encodes date + time as a sortable number', () => {
  assert.equal(dateKey('2026-09-12', '09:00'), 202609120900);
  assert.equal(dateKey('2026-09-12', ''), 202609120000);
  assert.equal(dateKey('2026-09-12', '14:30'), 202609121430);
});

t('dateKey rejects junk and out-of-range values', () => {
  assert.equal(dateKey('', '09:00'), null);
  assert.equal(dateKey('not a date'), null);
  assert.equal(dateKey('2026-13-01'), null);
  assert.equal(dateKey('2026-09-32'), null);
  // an impossible time degrades to "no time", it does not corrupt the key
  assert.equal(dateKey('2026-09-12', '99:99'), 202609120000);
});

t('every real date lands inside the dated band, undated rows outside it', () => {
  assert.ok(dateKey('2026-09-12', '09:00') >= DATED_MIN);
  assert.ok(dateKey('2026-09-12', '09:00') <= DATED_MAX);
  assert.ok(UNDATED_BASE > DATED_MAX);
  assert.equal(isDated(202609120900), true);
  assert.equal(isDated(3), false);              // legacy append index
  assert.equal(isDated(UNDATED_BASE + 4), false);
  assert.equal(isDated(undefined), false);
});

t('a number in the dated band that is not a real date degrades to undated', () => {
  // an off-by-one or a hand-edited document must not take the board down:
  // isDated() and keyParts() have to agree, always
  for (const bad of [202609120899, 202602300900, 202613010900, 202609000900]) {
    assert.equal(keyParts(bad), null, String(bad));
    assert.equal(isDated(bad), false, String(bad));
    assert.equal(formatKey(bad), '');
    assert.equal(isPast(bad, new Date()), false);
  }
  // and such a row still sorts, at the end, rather than throwing
  const sorted = sortSlots([{ id: 'bad', order: 202609120899 }, { id: 'good', order: dateKey('2026-09-12', '09:00') }]);
  assert.deepEqual(sorted.map(s => s.id), ['good', 'bad']);
});

t('a key round-trips back to the form fields it came from', () => {
  assert.deepEqual(keyToInputs(dateKey('2026-09-12', '09:05')), { date: '2026-09-12', time: '09:05' });
  assert.deepEqual(keyToInputs(dateKey('2026-11-01', '')), { date: '2026-11-01', time: '' });
  assert.deepEqual(keyToInputs(7), { date: '', time: '' });
});

t('keyParts / keyToDate agree with the calendar', () => {
  const p = keyParts(202609120900);
  assert.deepEqual(p, { y: 2026, m: 9, d: 12, hh: 9, mm: 0, hasTime: true });
  const d = keyToDate(202609120900);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 12);
  assert.equal(d.getHours(), 9);
});

t('THE REGRESSION: Sep 12 no longer prints above Sep 1', () => {
  // the exact defect measured in the review, with the insertion order reversed
  const slots = [
    { id: 'a', label: 'Game vs Hawks', order: dateKey('2026-09-12', '09:00') },
    { id: 'b', label: 'Practice', order: dateKey('2026-09-01', '17:00') },
  ];
  assert.deepEqual(sortSlots(slots).map(s => s.id), ['b', 'a']);
});

t('a game rescheduled mid-season moves, it does not sit at the bottom', () => {
  const season = [
    { id: 'g1', order: dateKey('2026-09-05', '09:00') },
    { id: 'g2', order: dateKey('2026-09-19', '09:00') },
    { id: 'g3', order: dateKey('2026-09-26', '09:00') },
  ];
  const rescheduled = season.map(s => (s.id === 'g3' ? { ...s, order: dateKey('2026-09-12', '09:00') } : s));
  assert.deepEqual(sortSlots(rescheduled).map(s => s.id), ['g1', 'g3', 'g2']);
});

t('undated and legacy rows sort after every dated one, keeping their order', () => {
  const slots = [
    { id: 'legacy2', order: 2 },
    { id: 'dated', order: dateKey('2026-09-12', '09:00') },
    { id: 'legacy1', order: 1 },
    { id: 'undated', order: UNDATED_BASE + 1 },
  ];
  assert.deepEqual(sortSlots(slots).map(s => s.id), ['dated', 'legacy1', 'legacy2', 'undated']);
});

t('isPast: a timed event survives four hours, an all-day one survives its day', () => {
  const noon = dateKey('2026-09-12', '12:00');
  assert.equal(isPast(noon, new Date(2026, 8, 12, 13, 0)), false);
  assert.equal(isPast(noon, new Date(2026, 8, 12, 17, 0)), true);
  const allDay = dateKey('2026-09-12', '');
  assert.equal(isPast(allDay, new Date(2026, 8, 12, 23, 0)), false);
  assert.equal(isPast(allDay, new Date(2026, 8, 13, 0, 30)), true);
  assert.equal(isPast(UNDATED_BASE + 1, new Date()), false); // never expires
});

t('formatting reads like a human wrote it', () => {
  assert.equal(formatKey(dateKey('2026-09-12', '09:00')), 'Sat, Sep 12 · 9:00 AM');
  assert.equal(formatKey(dateKey('2026-09-12', '')), 'Sat, Sep 12');
  assert.equal(formatKey(dateKey('2026-09-12', '13:05'), { withYear: true }), 'Sat, Sep 12, 2026 · 1:05 PM');
  assert.equal(formatKey(4), '');
  assert.equal(formatTime(0, 0), '12:00 AM');
  assert.equal(formatTime(12, 0), '12:00 PM');
  assert.equal(shortDate(dateKey('2026-09-12', '')), 'Sat 9/12');
});

/* ---------- the label: name, where, wear ---------- */

t('composeLabel/parseLabel round-trip the three Saturday-morning facts', () => {
  const label = composeLabel({ name: 'Game vs Hawks', where: 'Kestrel Park, Field 4', wear: 'blue' });
  assert.equal(label, 'Game vs Hawks · at Kestrel Park, Field 4 · wear blue');
  assert.deepEqual(parseLabel(label), { name: 'Game vs Hawks', where: 'Kestrel Park, Field 4', wear: 'blue' });
});

t('THE REGRESSION: no silent truncation mid-word at 20 characters', () => {
  // "9:00am · Field 4 · blue jerseys" used to become "9:00am · Field 4 · b"
  const label = composeLabel({ name: 'Game vs Hawks', where: 'Field 4', wear: 'blue jerseys' });
  const parsed = parseLabel(label);
  assert.equal(parsed.where, 'Field 4');
  assert.equal(parsed.wear, 'blue jerseys');
  assert.ok(label.length <= 120);
});

t('a label the user typed by hand still parses as just a name', () => {
  assert.deepEqual(parseLabel('Snack duty, Sat game'), { name: 'Snack duty, Sat game', where: '', wear: '' });
  // legacy labels carried the date inside them; they must survive untouched
  assert.equal(parseLabel('Practice, Tue, Sep 1 · 5pm').name, 'Practice, Tue, Sep 1 · 5pm');
});

t('composeLabel strips the separator so the encoding cannot be spoofed', () => {
  const label = composeLabel({ name: 'A · at nowhere', where: 'Real Park' });
  assert.deepEqual(parseLabel(label), { name: 'A at nowhere', where: 'Real Park', wear: '' });
});

t('composeLabel survives hostile input without exploding the 120-char cap', () => {
  const label = composeLabel({ name: '<img src=x onerror=alert(1)>'.repeat(9), where: 'x'.repeat(200), wear: 'y'.repeat(80) });
  assert.ok(label.length <= 120, 'label was ' + label.length);
});

/* ---------- pasted schedules ---------- */

const REF = new Date(2026, 7, 15); // mid-August: a fall season is being set up

t('sniffDateTime pulls the date and time out of a pasted league line', () => {
  assert.deepEqual(sniffDateTime('Sat 9/12 9:00am Game vs Hawks', REF),
    { date: '2026-09-12', time: '09:00', rest: 'Sat Game vs Hawks' });
  assert.deepEqual(sniffDateTime('Sep 19, Scorekeeper', REF),
    { date: '2026-09-19', time: '', rest: 'Scorekeeper' });
  assert.deepEqual(sniffDateTime('2026-10-03 14:30 Away at Falcons', REF),
    { date: '2026-10-03', time: '14:30', rest: 'Away at Falcons' });
});

t('sniffDateTime rolls a spring date into next year, not the past', () => {
  assert.equal(sniffDateTime('Mar 3 Game', REF).date, '2027-03-03');
  assert.equal(sniffDateTime('Sep 1 Game', REF).date, '2026-09-01');
});

t('a line with no date stays undated and keeps all of its text', () => {
  assert.deepEqual(sniffDateTime('Team photo day', REF), { date: '', time: '', rest: 'Team photo day' });
});

t('bulk paste still reads ×N as a duty count', () => {
  assert.deepEqual(parseBulkSlots('Snack duty x2'), [{ label: 'Snack duty', capacity: 2 }]);
  assert.deepEqual(parseBulkSlots('Carpool (4)'), [{ label: 'Carpool', capacity: 4 }]);
});

/* ---------- the repeating generator ---------- */

t('dateRangeSlots dates every generated practice', () => {
  const rows = dateRangeSlots({
    start: '2026-09-01', end: '2026-09-30', weekdays: [2, 4],
    time: '17:30', name: 'Practice', where: 'Kestrel Park', capacity: 999,
  });
  assert.equal(rows.length, 9); // Tue+Thu in September 2026
  assert.ok(rows.every(r => isDated(r.order)), 'every generated row is dated');
  assert.deepEqual(rows.map(r => r.order), [...rows.map(r => r.order)].sort((a, b) => a - b));
  assert.equal(keyToInputs(rows[0].order).time, '17:30');
  assert.equal(parseLabel(rows[0].label).where, 'Kestrel Park');
});

t('dateRangeSlots refuses an empty or backwards range', () => {
  assert.equal(dateRangeSlots({ start: '2026-09-30', end: '2026-09-01', weekdays: [2] }).length, 0);
  assert.equal(dateRangeSlots({ start: '2026-09-01', end: '2026-09-30', weekdays: [] }).length, 0);
});

/* ---------- escape hatches ---------- */

const SEASON = [
  { id: 's1', label: composeLabel({ name: 'Game vs Hawks', where: 'Kestrel Park, Field 4', wear: 'blue' }), order: dateKey('2026-09-12', '09:00'), capacity: 999 },
  { id: 's2', label: composeLabel({ name: 'Snack duty' }), order: dateKey('2026-09-12', ''), capacity: 2 },
  { id: 's3', label: composeLabel({ name: 'Practice' }), order: dateKey('2026-10-01', '17:30'), capacity: 999 },
  { id: 's4', label: 'Team photo day', order: UNDATED_BASE + 1, capacity: 999 },
];

t('seasonIcs produces a parseable calendar with LOCATION populated', () => {
  const ics = seasonIcs({ title: 'Roadrunners U10', slots: SEASON, url: 'https://x.test/#/b/ABC123', stamp: new Date(Date.UTC(2026, 7, 1, 12, 0, 0)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3, 'undated rows are duties, not calendar entries');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  assert.ok(ics.includes('DTSTART:20260912T090000'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260912'));
  assert.ok(ics.includes('LOCATION:Kestrel Park\\, Field 4'), 'comma escaped per RFC 5545');
  assert.ok(ics.includes('SUMMARY:Game vs Hawks'));
  assert.ok(/\r\n/.test(ics) && !/[^\r]\n/.test(ics), 'CRLF line endings throughout');
  for (const line of ics.split('\r\n')) assert.ok(line.length <= 75, 'line over 75 octets: ' + line.slice(0, 30));
});

t('seasonIcs escapes hostile text instead of breaking the file', () => {
  const ics = seasonIcs({
    title: 'T', url: 'https://x.test/',
    slots: [{ id: 'h', label: 'A;B,C\\D', order: dateKey('2026-09-12', '09:00'), capacity: 1 }],
  });
  assert.ok(ics.includes('SUMMARY:A\\;B\\,C\\\\D'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

t('weekMessage is a paste-ready block for the group chat', () => {
  const msg = weekMessage({
    title: 'Roadrunners U10', url: 'https://x.test/#/b/ABC123',
    now: new Date(2026, 8, 9, 18, 0),
    events: SEASON.map(s => ({ ...s, who: s.id === 's2' ? ['the Ramirez family'] : [], needed: s.id === 's2' ? 1 : 0 })),
  });
  assert.ok(msg.includes('Sat 9/12'));
  assert.ok(msg.includes('9:00 AM'));
  assert.ok(msg.includes('Game vs Hawks'));
  assert.ok(msg.includes('Kestrel Park, Field 4'));
  assert.ok(msg.includes('wear blue'));
  assert.ok(msg.includes('the Ramirez family'));
  assert.ok(msg.includes('https://x.test/#/b/ABC123'));
  assert.ok(!msg.includes('Practice'), 'Oct 1 is outside the 7-day window');
});

t('weekMessage says so rather than lying when the week is empty', () => {
  const msg = weekMessage({ title: 'T', url: 'u', events: SEASON, now: new Date(2027, 0, 1) });
  assert.ok(msg.includes('Nothing on the calendar this week.'));
});

/* ---------- untouched behaviour still holds ---------- */

t('share codes still normalise the way the rules expect', () => {
  assert.equal(normalizeCode(' abc234 '), 'ABC234');
  assert.equal(normalizeCode('abc-234'), 'ABC234');
  assert.equal(normalizeCode('ABC23'), null);
  // 0/O/1/I/l are excluded from the alphabet, so a code containing one is not
  // silently "repaired" into a different, valid-looking code
  assert.equal(normalizeCode('ABC123'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
