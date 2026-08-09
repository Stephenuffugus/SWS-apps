// Run: node test/model.test.mjs
import assert from 'node:assert/strict';
import {
  sortedEvents, lastOfKind, activeSleep, sleepMinutes, daySummary, agoText, durText, summaryText,
  ROLL_HOUR, dayStart, dayEnd, dayIndexDiff, tsOk, nearestPast, openSleepMinutes,
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

/* ---- the log day: a night belongs to the day it started ---- */
const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi, 0, 0).getTime();

ok('the log day turns over at 5am, not midnight', () => {
  assert.equal(ROLL_HOUR, 5);
  // 11:15pm Saturday and 2:30am Sunday are the SAME night
  const late = at(2026, 7, 8, 23, 15);
  const small = at(2026, 7, 9, 2, 30);
  assert.equal(dayStart(late), dayStart(small));
  assert.equal(dayStart(late), at(2026, 7, 8, 5, 0));
  assert.equal(dayEnd(late), at(2026, 7, 9, 5, 0));
  // 5:00am itself starts the new day
  assert.equal(dayStart(at(2026, 7, 9, 5, 0)), at(2026, 7, 9, 5, 0));
  assert.equal(dayStart(at(2026, 7, 9, 4, 59)), at(2026, 7, 8, 5, 0));
});
ok('a night straddling midnight lands in one summary window', () => {
  const evs = [
    { id: '1', ts: at(2026, 7, 8, 20, 0), kind: 'feed', detail: 'left' },
    { id: '2', ts: at(2026, 7, 8, 22, 0), kind: 'diaper', detail: 'wet' },
    { id: '3', ts: at(2026, 7, 8, 23, 30), kind: 'feed', detail: 'right' },
    { id: '4', ts: at(2026, 7, 9, 1, 0), kind: 'diaper', detail: 'dirty' },
    { id: '5', ts: at(2026, 7, 9, 3, 10), kind: 'feed', detail: 'bottle' },
  ];
  const anchor = at(2026, 7, 9, 3, 30);
  const s = daySummary(evs, dayStart(anchor), dayEnd(anchor), anchor);
  assert.equal(s.feeds, 3);      // calendar midnight-to-midnight reported 1
  assert.equal(s.diapers, 2);    // and 0
});
ok('dayIndexDiff counts log days', () => {
  assert.equal(dayIndexDiff(at(2026, 7, 9, 2, 0), at(2026, 7, 8, 23, 0)), 0);
  assert.equal(dayIndexDiff(at(2026, 7, 9, 6, 0), at(2026, 7, 8, 23, 0)), 1);
});

/* ---- timestamps that are not dates ---- */
ok('tsOk rejects anything Date cannot mean', () => {
  const now = at(2026, 7, 9, 12, 0);
  assert.equal(tsOk(now, now), true);
  assert.equal(tsOk(now - 30 * 86400000, now), true);
  assert.equal(tsOk(1e18, now), false);            // rendered "Invalid Date"
  assert.equal(tsOk(8.64e15 + 1, now), false);     // past the Date range
  assert.equal(tsOk(-6e11, now), false);
  assert.equal(tsOk(now + 400 * 86400000, now), false);
  assert.equal(tsOk(NaN, now), false);
  assert.equal(tsOk('123', now), false);
  assert.equal(tsOk(undefined, now), false);
  assert.equal(tsOk(now + 3600000, now), true);    // an hour of clock skew is fine
});
ok('agoText refuses to call a future timestamp "just now"', () => {
  assert.match(agoText(-5 * H), /future/);
  assert.equal(agoText(-30 * 1000), 'just now');   // ordinary clock jitter
  assert.equal(agoText(0), 'just now');
});

/* ---- backdating: a time later than now means yesterday ---- */
ok('nearestPast resolves a typed time to the nearest past occurrence', () => {
  const now = at(2026, 7, 9, 0, 40);               // 00:40, the awkward hour
  assert.equal(nearestPast(now, 22, 0, now), at(2026, 7, 8, 22, 0));   // yesterday
  assert.equal(nearestPast(now, 0, 10, now), at(2026, 7, 9, 0, 10));   // today
  // editing a row three days old keeps its own date
  const old = at(2026, 7, 6, 14, 0);
  assert.equal(nearestPast(old, 9, 0, at(2026, 7, 9, 12, 0)), at(2026, 7, 6, 9, 0));
});

/* ---- a timer nobody stopped ---- */
ok('daySummary separates a running timer from the trustworthy total', () => {
  const now = at(2026, 7, 9, 12, 0);
  const ws = dayStart(now); const we = dayEnd(now);
  const evs = [
    { id: 'a', ts: at(2026, 7, 9, 6, 0), kind: 'sleep_start' },
    { id: 'b', ts: at(2026, 7, 9, 7, 0), kind: 'sleep_end' },     // 60 closed
    { id: 'c', ts: at(2026, 7, 9, 8, 0), kind: 'sleep_start' },   // still open, 4h
  ];
  const s = daySummary(evs, ws, we, now);
  assert.equal(s.sleepMin, 300);
  assert.equal(s.sleepOpenMin, 240);
  assert.equal(s.sleepClosedMin, 60);
  assert.equal(openSleepMinutes(evs.slice(0, 2), ws, we, now), 0);
});
ok('the copied summary names its window and flags a running timer', () => {
  const now = at(2026, 7, 9, 12, 0);
  const s = daySummary([
    { id: 'a', ts: at(2026, 7, 9, 8, 0), kind: 'sleep_start' },
    { id: 'b', ts: at(2026, 7, 9, 9, 0), kind: 'feed', detail: 'left' },
  ], dayStart(now), dayEnd(now), now);
  const txt = summaryText('Wren', s, 'the last 24 hours (since Yesterday, 12:00 PM)', ['(a sleep timer is still running)']);
  assert.ok(txt.includes('last 24 hours'));
  assert.ok(txt.includes('Sleep: 0m (+ 4h 0m still asleep)'));
  assert.ok(txt.includes('(a sleep timer is still running)'));
});

console.log(`\n${passed} baby-log model tests passed${process.exitCode ? ' (with failures)' : ''}`);
