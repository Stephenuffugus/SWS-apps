// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import { parseTime, fmtTime, sortEvents, encodeTimeline, decodeTimeline } from '../helpers.js';

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
ok('fmtTime round-trips nicely', () => {
  assert.equal(fmtTime(0), '12:00 AM');
  assert.equal(fmtTime(14 * 60 + 30), '2:30 PM');
  assert.equal(fmtTime(12 * 60), '12:00 PM');
  assert.equal(fmtTime(23 * 60 + 59), '11:59 PM');
});
ok('sortEvents: time order, untimed last, stable', () => {
  const evs = [
    { minutes: null, what: 'sometime' },
    { minutes: 900, what: 'ceremony' },
    { minutes: 540, what: 'hair' },
    { minutes: 900, what: 'also 3pm — second' },
  ];
  const s = sortEvents(evs).map(e => e.what);
  assert.deepEqual(s, ['hair', 'ceremony', 'also 3pm — second', 'sometime']);
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
