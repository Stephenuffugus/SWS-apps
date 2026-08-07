// Baby log — pure model logic. Tested in test/model.test.mjs.
// events: {id, ts (epoch ms), kind: 'feed'|'sleep_start'|'sleep_end'|'diaper', detail}
//   feed detail: 'left'|'right'|'bottle'   diaper detail: 'wet'|'dirty'|'both'

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

export function sortedEvents(events) {
  return [...events].sort((a, b) => b.ts - a.ts); // newest first
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

export function daySummary(events, dayStart, dayEnd, now) {
  const inDay = events.filter(e => e.ts >= dayStart && e.ts < dayEnd);
  const feeds = inDay.filter(e => e.kind === 'feed');
  const diapers = inDay.filter(e => e.kind === 'diaper');
  const byDetail = (list) => {
    const m = {};
    for (const e of list) m[e.detail] = (m[e.detail] || 0) + 1;
    return m;
  };
  return {
    feeds: feeds.length,
    feedDetail: byDetail(feeds),
    diapers: diapers.length,
    diaperDetail: byDetail(diapers),
    sleepMin: sleepMinutes(events, dayStart, dayEnd, now),
  };
}

export function agoText(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  const h = Math.floor(min / 60);
  return h + 'h ' + (min % 60) + 'm ago';
}

export function durText(min) {
  if (min < 60) return min + 'm';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
}

export function summaryText(name, summary, dateLabel) {
  const fd = summary.feedDetail;
  const feedsBits = ['left', 'right', 'bottle']
    .filter(k => fd[k]).map(k => fd[k] + ' ' + k).join(', ');
  const dd = summary.diaperDetail;
  const diaperBits = ['wet', 'dirty', 'both']
    .filter(k => dd[k]).map(k => dd[k] + ' ' + k).join(', ');
  return [
    (name || 'Baby') + ' — ' + dateLabel,
    'Feeds: ' + summary.feeds + (feedsBits ? ' (' + feedsBits + ')' : ''),
    'Sleep: ' + durText(summary.sleepMin),
    'Diapers: ' + summary.diapers + (diaperBits ? ' (' + diaperBits + ')' : ''),
  ].join('\n');
}
