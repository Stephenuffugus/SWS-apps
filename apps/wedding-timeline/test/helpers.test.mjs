// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import { parseTime, readTime, fmtTime, sortEvents, encodeTimeline, decodeTimeline, normalizeState } from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('parseTime handles the ways people write times', () => {
  assert.equal(parseTime('2pm'), 14 * 60);
  assert.equal(parseTime('2:30 PM'), 14 * 60 + 30);
  assert.equal(parseTime('14:30'), 14 * 60 + 30);
  assert.equal(parseTime('12am'), 0);
  assert.equal(parseTime('12pm'), 12 * 60);
  assert.equal(parseTime('9:05a'), 9 * 60 + 5);
  assert.equal(parseTime('0:15'), 15);
  assert.equal(parseTime('13pm'), null);
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('2:75'), null);
  assert.equal(parseTime('soonish'), null);
});
ok('a bare hour is reported as ambiguous, never silently read as 24-hour', () => {
  // The defect this replaces: "7" for a 7pm reception was recorded as 7:00 AM.
  for (const [s, am, pm] of [['7', 420, 1140], ['07', 420, 1140], ['4', 240, 960],
                             ['730', 450, 1170], ['12:00', 0, 720], ['2:5', 125, 845]]) {
    const r = readTime(s);
    assert.equal(r.ambiguous, true, s + ' should ask');
    assert.equal(r.am, am);
    assert.equal(r.pm, pm);
    assert.equal(r.minutes, undefined);
  }
  // Unambiguous readings stay unambiguous.
  for (const [s, mins] of [['19', 1140], ['0:00', 0], ['14:30', 870], ['0730', 450],
                           ['2pm', 840], ['9:05am', 545]]) {
    assert.deepEqual(readTime(s), { minutes: mins }, s);
  }
});
ok('the parser accepts the spellings people actually type', () => {
  const same = (mins, ...spellings) => {
    for (const s of spellings) assert.equal(parseTime(s), mins, JSON.stringify(s));
  };
  same(870, '2:30 pm', '2.30pm', '2 30 pm', '2-30pm', '2:30p.m.', '14:30', '1430', '２:30pm');
  same(720, 'noon', 'midday', '12 noon');
  same(0, 'midnight');
  for (const bad of ['2:60', '24:00', '13pm', 'sevenish', '', 'nope']) {
    assert.equal(parseTime(bad), null, JSON.stringify(bad));
  }
});
ok('a wrong-shaped stored record degrades instead of printing NaN', () => {
  const s = normalizeState({
    title: 7, date: null, rev: 'x',
    events: [null, { minutes: 'abc', what: 'Cake' }, { minutes: -600, what: 'Toasts' },
             { minutes: 99999, what: 'Exit' }, { minutes: 600, what: { a: 1 } },
             { minutes: 600 }, { minutes: 600, what: 'Vows', who: 42 }],
  });
  assert.equal(s.title, '');
  assert.equal(s.rev, 1);
  assert.deepEqual(s.events.map(e => [e.minutes, e.what, e.who]),
    [[null, 'Cake', ''], [null, 'Toasts', ''], [null, 'Exit', ''], [600, 'Vows', '']]);
  assert.equal(s.events.every(e => typeof e.id === 'string' && e.id), true);
  assert.equal(normalizeState({ events: { a: 1 } }).events.length, 0);
  assert.equal(normalizeState(null).events.length, 0);
  assert.equal(normalizeState({ events: Array.from({ length: 5000 }, () => ({ minutes: 0, what: 'x' })) }).events.length, 100);
  // and nothing it produces can render as NaN on screen or on paper
  for (const e of s.events) assert.equal(e.minutes === null || fmtTime(e.minutes) !== '—', true);
});
ok('sortEvents survives a null element', () => {
  assert.deepEqual(sortEvents([null, { minutes: 60, what: 'b' }, undefined]).map(e => e.what), ['b']);
  assert.deepEqual(sortEvents(null), []);
});
ok('fmtTime round-trips nicely', () => {
  assert.equal(fmtTime(0), '12:00 AM');
  assert.equal(fmtTime(14 * 60 + 30), '2:30 PM');
  assert.equal(fmtTime(12 * 60), '12:00 PM');
  assert.equal(fmtTime(23 * 60 + 59), '11:59 PM');
  for (const junk of [NaN, Infinity, -600, 99999, undefined, '12']) assert.equal(fmtTime(junk), '—');
});
ok('sortEvents: time order, untimed last, stable', () => {
  const evs = [
    { minutes: null, what: 'sometime' },
    { minutes: 900, what: 'ceremony' },
    { minutes: 540, what: 'hair' },
    { minutes: 900, what: 'also 3pm, second' },
  ];
  const s = sortEvents(evs).map(e => e.what);
  assert.deepEqual(s, ['hair', 'ceremony', 'also 3pm, second', 'sometime']);
});
ok('timeline round-trips through the hash', () => {
  const state = {
    title: 'Jessie & Sam', date: 'June 14, 2027',
    events: [{ minutes: 540, what: 'Hair & makeup 💇', who: 'Bridal suite' },
             { minutes: null, what: 'Sparkler exit', who: '' }],
  };
  const d = decodeTimeline('#' + encodeTimeline(state));
  assert.equal(d.title, 'Jessie & Sam');
  assert.equal(d.events.length, 2);
  assert.equal(d.events[0].who, 'Bridal suite');
  assert.equal(d.events[1].minutes, null);
  assert.equal(decodeTimeline('#nope!'), null);
});

console.log(`\n${passed} timeline helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
