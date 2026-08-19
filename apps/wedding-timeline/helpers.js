// Wedding timeline, pure logic. Tested in test/helpers.test.mjs.

export const MAX_EVENTS = 100;
const DAY = 24 * 60;

/* ── ids ──────────────────────────────────────────────────────────────────
   Rows used to be identified by object reference, which meant any pass that
   copied an event (undo, import, a shift) silently broke Remove. A stable id
   on the record makes identity survive a JSON round-trip. */
let seq = 0;
export function uid() {
  seq = (seq + 1) % 1e6;
  return 'e' + Date.now().toString(36) + seq.toString(36);
}

/* ── reading a time a person typed ────────────────────────────────────────
   Returns one of:
     { minutes }                          an unambiguous time
     { ambiguous:true, am, pm, hour, min } "7", 7:00 AM or 7:00 PM, ask
     null                                 not a time at all

   The old parser took any bare 0 to 23 as a 24-hour value, so "7" for a 7pm
   reception was silently recorded as 7:00 AM. Twelve hours wrong, no warning.
   Anything with an hour of 1 to 12 and no am/pm marker is now reported as
   ambiguous so the caller can ask instead of guessing. */
export function readTime(input) {
  if (typeof input !== 'string') return null;
  let t = input.normalize('NFKC').toLowerCase().trim();
  if (!t) return null;
  t = t.replace(/[‘’']/g, '');
  t = t.replace(/([ap])\s*\.\s*m\s*\.?/g, '$1m'); // "p.m." / "a. m." → pm / am

  if (/^(12\s*)?(noon|midday)$/.test(t)) return { minutes: 12 * 60 };
  if (/^(12\s*)?midnight$/.test(t)) return { minutes: 0 };

  let ap = null;
  const tail = /(a|p)m?$/.exec(t);
  if (tail) { ap = tail[1]; t = t.slice(0, tail.index).trim(); }

  t = t.replace(/[\s:.∶·\--]+/g, ':');

  let h, min, military = false, m;
  if ((m = /^(\d{1,2}):(\d{1,2})$/.exec(t))) { h = +m[1]; min = +m[2]; }
  else if ((m = /^(\d{1,2})$/.exec(t))) { h = +m[1]; min = 0; }
  else if ((m = /^(\d{3,4})$/.exec(t))) {
    military = m[1].length === 4 && m[1][0] === '0'; // "0730" is unambiguous
    h = +m[1].slice(0, -2); min = +m[1].slice(-2);
  } else return null;

  if (min > 59) return null;

  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'p' && h !== 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return { minutes: h * 60 + min };
  }
  if (h > 23) return null;
  if (!military && h >= 1 && h <= 12) {
    return {
      ambiguous: true, hour: h, min,
      am: (h === 12 ? 0 : h) * 60 + min,
      pm: (h === 12 ? 12 : h + 12) * 60 + min,
    };
  }
  return { minutes: h * 60 + min };
}

/* Lenient reading, for callers that cannot ask a question (the URL codec, and
   the existing test suite). The UI uses readTime so it can ask. */
export function parseTime(s) {
  const r = readTime(s);
  if (!r) return null;
  return r.ambiguous ? r.am : r.minutes;
}

export function fmtTime(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const total = Math.round(minutes);
  if (total < 0 || total >= DAY) return '—';
  let h = Math.floor(total / 60);
  const m = total % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

const timeOf = (e) => (e && Number.isInteger(e.minutes) && e.minutes >= 0 && e.minutes < DAY) ? e.minutes : null;

/* Sort events by time; untimed events sink to the end in insertion order.
   Returns the SAME object references, rows depend on that. */
export function sortEvents(events) {
  const src = Array.isArray(events) ? events.filter(e => e && typeof e === 'object') : [];
  return src.map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = timeOf(a.e), tb = timeOf(b.e);
      if (ta === null && tb === null) return a.i - b.i;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb || a.i - b.i;
    })
    .map(x => x.e);
}

/* ── state shape ──────────────────────────────────────────────────────────
   One coercion used by every door into the app: localStorage, the share hash
   and the backup file. The storage door used to be unguarded, so a record
   holding {"minutes":"abc"} printed "12:NaN AM" onto paper and a single null
   element threw and rendered an empty day. */
export function normalizeEvent(e, seen) {
  if (!e || typeof e !== 'object') return null;
  const what = (typeof e.what === 'string' ? e.what : '').slice(0, 120);
  if (!what.trim()) return null;
  let id = typeof e.id === 'string' && e.id ? e.id.slice(0, 32) : '';
  if (!id || (seen && seen.has(id))) id = uid();
  if (seen) seen.add(id);
  return {
    id,
    minutes: timeOf(e),
    what,
    who: (typeof e.who === 'string' ? e.who : '').slice(0, 80),
  };
}

export function normalizeState(obj) {
  const src = (obj && typeof obj === 'object') ? obj : {};
  const seen = new Set();
  const events = (Array.isArray(src.events) ? src.events : [])
    .map(e => normalizeEvent(e, seen)).filter(Boolean).slice(0, MAX_EVENTS);
  const num = (v, max) => (Number.isFinite(v) && v > 0 && v <= max) ? Math.floor(v) : null;
  return {
    title: (typeof src.title === 'string' ? src.title : '').slice(0, 80),
    date: (typeof src.date === 'string' ? src.date : '').slice(0, 40),
    events,
    rev: num(src.rev, 999999) || 1,
    revisedAt: num(src.revisedAt, 4e12),
    sharedAt: num(src.sharedAt, 4e12),
  };
}

/* ── URL-hash codec ─────────────────────────────────────────────────────── */
export function encodeTimeline(state) {
  const s = normalizeState(state);
  const json = JSON.stringify({
    t: s.title, d: s.date, v: s.rev, r: s.revisedAt || undefined,
    e: s.events.map(e => [e.minutes, e.what, e.who]),
  });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeTimeline(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return null;
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.e)) return null;
    return normalizeState({
      title: obj.t, date: obj.d, rev: obj.v, revisedAt: obj.r,
      events: obj.e.filter(x => Array.isArray(x))
        .map(([minutes, what, who]) => ({ minutes, what, who })),
    });
  } catch (e) { return null; }
}
