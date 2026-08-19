// Baby log, pure model logic. Tested in test/model.test.mjs.
// events: {id, ts (epoch ms), kind: 'feed'|'sleep_start'|'sleep_end'|'diaper', detail}
//   feed detail: 'left'|'right'|'bottle'   diaper detail: 'wet'|'dirty'|'both'

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

export function sortedEvents(events) {
  return [...events].sort((a, b) => b.ts - a.ts); // newest first
}

/* ---------- the log day ----------
   A newborn night straddles midnight by definition, so a calendar day cuts
   every night in half: the 11pm feed and the 2am feed land on different
   sheets, and the summary a parent hands over at 6am reports one feed for a
   night that had five. The log day therefore turns over at 5am, a night
   counts with the day it started. */
export const ROLL_HOUR = 5;

/* Real calendar arithmetic, not a fixed ±24h: on a DST day one of these is 23
   or 25 hours long and an hour of the night would otherwise vanish. */
export function dayStart(ts, roll = ROLL_HOUR) {
  const d = new Date(ts);
  if (d.getHours() < roll) d.setDate(d.getDate() - 1);
  d.setHours(roll, 0, 0, 0);
  return d.getTime();
}
export function dayEnd(ts, roll = ROLL_HOUR) {
  const d = new Date(dayStart(ts, roll));
  d.setDate(d.getDate() + 1);
  d.setHours(roll, 0, 0, 0);
  return d.getTime();
}
export function dayWindow(ts, roll = ROLL_HOUR) {
  return { start: dayStart(ts, roll), end: dayEnd(ts, roll) };
}
/* Whole log-days between two instants, the basis for "Today" / "Yesterday". */
export function dayIndexDiff(aTs, bTs, roll = ROLL_HOUR) {
  return Math.round((dayStart(aTs, roll) - dayStart(bTs, roll)) / 86400000);
}

/* ---------- timestamp sanity ----------
   A hand-edited or clock-skewed backup used to import ts values of 1e18 and
   render rows reading literally "Invalid Date", with the hero readout showing
   six-figure hour counts. Anything outside a plausible window is not a date. */
export const TS_MIN = Date.UTC(2015, 0, 1);
export const TS_FUTURE_GRACE = 2 * 86400000;   // room for a skewed device clock
export function tsOk(ts, now) {
  const n = typeof now === 'number' ? now : Date.now();
  return typeof ts === 'number' && Number.isFinite(ts) &&
    ts >= TS_MIN && ts <= n + TS_FUTURE_GRACE;
}

/* Resolve a typed clock time to the nearest PAST occurrence, anchored on the
   day the entry already sits in. If it is 00:40 and you type 22:00 you mean
   last night, not tonight, the case every competitor gets wrong. */
export function nearestPast(baseTs, hh, mm, now) {
  const d = new Date(baseTs);
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function lastOfKind(events, kind) {
  let best = null;
  for (const e of events) if (e.kind === kind && (!best || e.ts > best.ts)) best = e;
  return best;
}

/* Currently sleeping iff the most recent sleep_* event is a start. */
export function activeSleep(events) {
  let best = null;
  for (const e of events) {
    if ((e.kind === 'sleep_start' || e.kind === 'sleep_end') && (!best || e.ts > best.ts)) best = e;
  }
  return best && best.kind === 'sleep_start' ? best : null;
}

/* Total sleep minutes overlapping [dayStart, dayEnd). Pairs each sleep_start
   with the next sleep_end; an unclosed session runs to `now`. */
export function sleepMinutes(events, dayStart, dayEnd, now) {
  const sleeps = events
    .filter(e => e.kind === 'sleep_start' || e.kind === 'sleep_end')
    .sort((a, b) => a.ts - b.ts);
  let total = 0;
  let openStart = null;
  const addSpan = (s, e) => {
    const from = Math.max(s, dayStart);
    const to = Math.min(e, dayEnd);
    if (to > from) total += (to - from) / 60000;
  };
  for (const e of sleeps) {
    if (e.kind === 'sleep_start') openStart = e.ts;         // a re-start supersedes
    else if (openStart !== null) { addSpan(openStart, e.ts); openStart = null; }
  }
  if (openStart !== null) addSpan(openStart, Math.min(now, dayEnd));
  return Math.round(total);
}

/* The part of the window's sleep total that is still being clocked up by a
   timer nobody has stopped. A stopwatch that has been running fourteen hours
   should never be shown as a triumphant number, so the UI needs this apart
   from the closed, trustworthy total. */
export function openSleepMinutes(events, dayStart, dayEnd, now) {
  const sleeps = events
    .filter(e => e.kind === 'sleep_start' || e.kind === 'sleep_end')
    .sort((a, b) => a.ts - b.ts);
  let openStart = null;
  for (const e of sleeps) {
    if (e.kind === 'sleep_start') openStart = e.ts;
    else openStart = null;
  }
  if (openStart === null) return 0;
  const from = Math.max(openStart, dayStart);
  const to = Math.min(now, dayEnd);
  return to > from ? Math.round((to - from) / 60000) : 0;
}

export function daySummary(events, dayStart, dayEnd, now) {
  const inDay = events.filter(e => e.ts >= dayStart && e.ts < dayEnd);
  const feeds = inDay.filter(e => e.kind === 'feed');
  const diapers = inDay.filter(e => e.kind === 'diaper');
  const byDetail = (list) => {
    const m = {};
    for (const e of list) m[e.detail] = (m[e.detail] || 0) + 1;
    return m;
  };
  const openMin = openSleepMinutes(events, dayStart, dayEnd, now);
  const total = sleepMinutes(events, dayStart, dayEnd, now);
  return {
    feeds: feeds.length,
    feedDetail: byDetail(feeds),
    diapers: diapers.length,
    diaperDetail: byDetail(diapers),
    sleepMin: total,
    /* Split out so a forgotten timer cannot quietly inflate the number a
       parent reads to a pediatrician. */
    sleepOpenMin: openMin,
    sleepClosedMin: Math.max(0, total - openMin),
  };
}

export function agoText(ms) {
  /* A backup from a fast-clocked device, an NTP correction or a timezone
     change used to floor to "just now", the app's single most important
     number, lying in the reassuring direction. One minute of tolerance for
     ordinary clock jitter, then say so plainly. */
  if (ms < -60000) return 'in the future, check this phone’s clock';
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  const h = Math.floor(min / 60);
  return h + 'h ' + (min % 60) + 'm ago';
}

export function durText(min) {
  if (min < 60) return min + 'm';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
}

/* `dateLabel` names the window the numbers cover, because the message is sent
   to answer "how was the night" and a summary that does not say which hours it
   counted is not an answer. */
export function summaryText(name, summary, dateLabel, notes) {
  const fd = summary.feedDetail;
  const feedsBits = ['left', 'right', 'bottle']
    .filter(k => fd[k]).map(k => fd[k] + ' ' + k).join(', ');
  const dd = summary.diaperDetail;
  const diaperBits = ['wet', 'dirty', 'both']
    .filter(k => dd[k]).map(k => dd[k] + ' ' + k).join(', ');
  const sleep = summary.sleepOpenMin > 0
    ? durText(summary.sleepClosedMin) + ' (+ ' + durText(summary.sleepOpenMin) + ' still asleep)'
    : durText(summary.sleepMin);
  return [
    (name || 'Baby') + ', ' + dateLabel,
    'Feeds: ' + summary.feeds + (feedsBits ? ' (' + feedsBits + ')' : ''),
    'Sleep: ' + sleep,
    'Diapers: ' + summary.diapers + (diaperBits ? ' (' + diaperBits + ')' : ''),
  ].concat(notes || []).join('\n');
}
