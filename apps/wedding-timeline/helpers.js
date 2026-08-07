// Wedding timeline — pure logic. Tested in test/helpers.test.mjs.

/* Parse "2pm", "2:30 PM", "14:30", "9:05am" → minutes since midnight, or null. */
export function parseTime(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (min > 59) return null;
  const ap = m[3];
  if (ap) {
    if (h < 1 || h > 12) return null;
    if ((ap === 'pm' || ap === 'p') && h !== 12) h += 12;
    if ((ap === 'am' || ap === 'a') && h === 12) h = 0;
  } else if (h > 23) return null;
  return h * 60 + min;
}

export function fmtTime(minutes) {
  let h = Math.floor(minutes / 60), m = minutes % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

/* Sort events by time; untimed events sink to the end in insertion order. */
export function sortEvents(events) {
  return [...events].map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = a.e.minutes, tb = b.e.minutes;
      if (ta === null && tb === null) return a.i - b.i;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb || a.i - b.i;
    })
    .map(x => x.e);
}

/* URL-hash codec. */
export function encodeTimeline(state) {
  const json = JSON.stringify({
    t: state.title, d: state.date,
    e: state.events.map(e => [e.minutes, e.what, e.who]),
  });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeTimeline(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.e)) return null;
    return {
      title: typeof obj.t === 'string' ? obj.t.slice(0, 80) : '',
      date: typeof obj.d === 'string' ? obj.d.slice(0, 40) : '',
      events: obj.e.filter(x => Array.isArray(x)).slice(0, 100).map(([minutes, what, who]) => ({
        minutes: (Number.isInteger(minutes) && minutes >= 0 && minutes < 1440) ? minutes : null,
        what: String(what || '').slice(0, 120),
        who: String(who || '').slice(0, 80),
      })).filter(e => e.what),
    };
  } catch (e) { return null; }
}
