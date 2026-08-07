// Run: node test/model.test.mjs
import assert from 'node:assert/strict';
import {
  sortedEvents, lastOfKind, activeSleep, sleepMinutes, daySummary, agoText, durText, summaryText,
} from '../model.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

const H = 3600000, M = 60000;
const day0 = 1000 * H; // arbitrary aligned "midnight"
const day1 = day0 + 24 * H;

ok('sortedEvents newest first; lastOfKind', () => {
  const evs = [{ id: 'a', ts: 5, kind: 'feed' }, { id: 'b', ts: 9, kind: 'feed' }];
  assert.equal(sortedEvents(evs)[0].id, 'b');
  assert.equal(lastOfKind(evs, 'feed').id, 'b');
  assert.equal(lastOfKind(evs, 'diaper'), null);
});
ok('activeSleep only when last sleep event is a start', () => {
  assert.ok(activeSleep([{ id: 'a', ts: 1, kind: 'sleep_start' }]));
  assert.equal(activeSleep([
    { id: 'a', ts: 1, kind: 'sleep_start' }, { id: 'b', ts: 2, kind: 'sleep_end' },
  ]), null);
});
ok('sleepMinutes pairs sessions and clips to the day', () => {
  const evs = [
    { id: 'a', ts: day0 + 2 * H, kind: 'sleep_start' },
    { id: 'b', ts: day0 + 3 * H, kind: 'sleep_end' },      // 60 min inside
    { id: 'c', ts: day0 - 1 * H, kind: 'sleep_start' },
    { id: 'd', ts: day0 + 30 * M, kind: 'sleep_end' },     // 30 min clipped in
  ];
  assert.equal(sleepMinutes(evs, day0, day1, day1), 90);
});
ok('an unclosed sleep session counts up to now', () => {
  const evs = [{ id: 'a', ts: day0 + 1 * H, kind: 'sleep_start' }];
  assert.equal(sleepMinutes(evs, day0, day1, day0 + 2 * H), 60);
});
ok('a session spanning midnight splits across the two days', () => {
  const evs = [
    { id: 'a', ts: day0 + 23 * H, kind: 'sleep_start' },
    { id: 'b', ts: day1 + 1 * H, kind: 'sleep_end' },
  ];
  assert.equal(sleepMinutes(evs, day0, day1, day1 + 2 * H), 60);
  assert.equal(sleepMinutes(evs, day1, day1 + 24 * H, day1 + 2 * H), 60);
});
ok('daySummary counts kinds and details', () => {
  const evs = [
    { id: '1', ts: day0 + 1 * H, kind: 'feed', detail: 'left' },
    { id: '2', ts: day0 + 4 * H, kind: 'feed', detail: 'bottle' },
    { id: '3', ts: day0 + 5 * H, kind: 'diaper', detail: 'wet' },
    { id: '4', ts: day0 - 1 * H, kind: 'feed', detail: 'right' },   // yesterday
  ];
  const s = daySummary(evs, day0, day1, day1);
  assert.equal(s.feeds, 2);
  assert.deepEqual(s.feedDetail, { left: 1, bottle: 1 });
  assert.equal(s.diapers, 1);
});
ok('agoText / durText read naturally', () => {
  assert.equal(agoText(30 * 1000), 'just now');
  assert.equal(agoText(45 * M), '45m ago');
  assert.equal(agoText(3 * H + 5 * M), '3h 5m ago');
  assert.equal(durText(45), '45m');
  assert.equal(durText(150), '2h 30m');
});
ok('summaryText is paste-ready', () => {
  const s = daySummary([
    { id: '1', ts: day0 + 1 * H, kind: 'feed', detail: 'left' },
    { id: '3', ts: day0 + 5 * H, kind: 'diaper', detail: 'both' },
  ], day0, day1, day1);
  const txt = summaryText('June', s, 'Tuesday');
  assert.ok(txt.includes('June — Tuesday'));
  assert.ok(txt.includes('Feeds: 1 (1 left)'));
  assert.ok(txt.includes('Diapers: 1 (1 both)'));
});

console.log(`\n${passed} baby-log model tests passed${process.exitCode ? ' (with failures)' : ''}`);
