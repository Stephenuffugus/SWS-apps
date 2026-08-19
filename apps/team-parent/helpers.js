// Pure helpers — no imports, no DOM, no Firebase. Unit-tested in test/helpers.test.mjs.

// Share-code alphabet from the product doc: no 0/O/1/I/l lookalikes.
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function genCode(randFn) {
  const rnd = randFn || Math.random;
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)];
  return out;
}

export function normalizeCode(s) {
  if (typeof s !== 'string') return null;
  const clean = s.trim().toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
  return clean.length === 6 ? clean : null;
}

/* Bulk slot paste: one slot per line. "Main dish x3" → capacity 3.
   Also accepts "Main dish (3)" and "Main dish ×3". Default capacity 1. */
export function parseBulkSlots(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let label = raw.trim();
    if (!label) continue;
    let capacity = 1;
    const m = label.match(/(?:\s*[x×]\s*(\d{1,3})|\s*\((\d{1,3})\))\s*$/i);
    if (m) {
      capacity = parseInt(m[1] || m[2], 10);
      label = label.slice(0, m.index).trim();
    }
    if (!label) continue;
    capacity = Math.min(Math.max(capacity, 1), 999);
    out.push({ label: label.slice(0, 120), capacity });
    if (out.length >= 100) break;
  }
  return out;
}

/* Date-range slots: "every Tue and Thu, Sept–Nov" style generation.
   weekdays: Set/array of 0–6 (Sun=0). Dates are LOCAL. The date goes into the
   sort key (`order`), not into the label — see THE DATE MODEL below. */
export function dateRangeSlots({ start, end, weekdays, time, name, where, wear, capacity }) {
  const out = [];
  const from = new Date(start + 'T00:00:00');
  const to = new Date(end + 'T00:00:00');
  if (isNaN(from) || isNaN(to) || to < from) return out;
  const days = new Set(weekdays || []);
  if (days.size === 0) return out;
  const cap = Math.min(Math.max(capacity || 1, 1), 999);
  const label = composeLabel({ name: name || 'Practice', where, wear });
  const pad = (n) => String(n).padStart(2, '0');
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (!days.has(d.getDay())) continue;
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ label, capacity: cap, order: dateKey(iso, time) });
    if (out.length >= 100) break;
  }
  return out;
}

export function fillStats(slots) {
  let taken = 0, total = 0;
  for (const s of slots) {
    total += s.capacity || 0;
    taken += Math.min(s.claimedCount || 0, s.capacity || 0);
  }
  return { taken, total };
}

/* One-tap nudge: a paste-ready message listing what's still open. */
export function nudgeMessage(boardTitle, slots, url) {
  const open = slots.filter(s => (s.claimedCount || 0) < (s.capacity || 1));
  const lines = [];
  lines.push(`Still need a hand with “${boardTitle}”! Open spots:`);
  for (const s of open.slice(0, 30)) {
    const left = (s.capacity || 1) - (s.claimedCount || 0);
    lines.push(`• ${s.label}${left > 1 ? ` (${left} needed)` : ''}`);
  }
  if (open.length > 30) lines.push(`…and ${open.length - 30} more.`);
  lines.push(`Grab one here (no account needed): ${url}`);
  return lines.join('\n');
}

export function shareUrl(code, base) {
  return base + '#/b/' + code;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE DATE MODEL

   firestore.rules pins a slot document to exactly
   ['label','capacity','order','claimedCount'] — a new `startsAt` field cannot
   ship without a rules change, and the rules are shared with signup-sheets.
   `order` is already a number, so the date IS the order key:

       202609120900  =  Sat 12 Sep 2026, 09:00

   That sorts chronologically for free, survives a reschedule (edit the date,
   the row moves), and is fully recoverable, so "next up", the week block, the
   .ics export and the past/upcoming split all become possible.

   Undated events get a key in the year-3000 band so they land after the real
   schedule. Slots written before this model have a small append index (1, 2,
   3…); those are treated as undated and keep their hand-made order.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DATED_MIN = 190001010000;
export const DATED_MAX = 299912312359;
export const UNDATED_BASE = 300000000000;

/** '2026-09-12' + '09:00' → 202609120900. Time is optional; 0000 means
    "no start time given" (nobody schedules a 12:00am practice). */
export function dateKey(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return null;
  let hh = 0, mi = 0;
  const t = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || '').trim());
  if (t) {
    hh = +t[1]; mi = +t[2];
    if (hh > 23 || mi > 59) { hh = 0; mi = 0; }
  }
  return ((y * 100 + mo) * 100 + d) * 10000 + hh * 100 + mi;
}

/* A number can sit inside the dated band and still not be a real date (a
   hand-edited document, a future field, an off-by-one). "Dated" therefore
   means "decodes to a real calendar date", so a malformed value degrades to an
   undated row instead of throwing halfway through painting the board. */
export function isDated(order) {
  return keyParts(order) !== null;
}

/** 202609120900 → {y,m,d,hh,mm,hasTime}, or null when the slot has no date. */
export function keyParts(order) {
  const num = Number(order);
  if (!Number.isFinite(num) || num < DATED_MIN || num > DATED_MAX) return null;
  const n = Math.floor(num);
  const mm = n % 100, hh = Math.floor(n / 100) % 100;
  const d = Math.floor(n / 10000) % 100;
  const m = Math.floor(n / 1000000) % 100;
  const y = Math.floor(n / 100000000);
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const probe = new Date(y, m - 1, d);
  if (probe.getMonth() !== m - 1 || probe.getDate() !== d) return null; // Feb 31
  return { y, m, d, hh, mm, hasTime: hh !== 0 || mm !== 0 };
}

/** A local Date for the slot's start (midnight when no time was given). */
export function keyToDate(order) {
  const p = keyParts(order);
  if (!p) return null;
  const dt = new Date(p.y, p.m - 1, p.d, p.hh, p.mm, 0, 0);
  return isNaN(dt) ? null : dt;
}

/** 'YYYY-MM-DD' and 'HH:MM' back out of a key, for re-filling an edit form. */
export function keyToInputs(order) {
  const p = keyParts(order);
  if (!p) return { date: '', time: '' };
  const p2 = (n) => String(n).padStart(2, '0');
  return {
    date: `${p.y}-${p2(p.m)}-${p2(p.d)}`,
    time: p.hasTime ? `${p2(p.hh)}:${p2(p.mm)}` : '',
  };
}

/* ---------- the label carries the human parts, in plain readable text ----------
   "Game vs Hawks · at Kestrel Park, Field 4 · wear blue"
   Prefixes rather than sigils, so the label still reads correctly in a printed
   sheet, a pasted text message and a calendar entry. Anything unrecognised
   stays part of the name, which is what every pre-existing label does. */

const SEP = ' · ';

export function composeLabel({ name, where, wear }) {
  const clean = (s, n) => String(s || '').replace(/[·\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const parts = [clean(name, 70)];
  const w = clean(where, 44);
  const k = clean(wear, 24);
  if (w) parts.push('at ' + w);
  if (k) parts.push('wear ' + k);
  return parts.filter(Boolean).join(SEP).slice(0, 120);
}

export function parseLabel(label) {
  const segs = String(label || '').split(SEP);
  const nameBits = [];
  let where = '', wear = '';
  for (const raw of segs) {
    const s = raw.trim();
    if (!where && /^at\s+\S/i.test(s)) { where = s.slice(3).trim(); continue; }
    if (!wear && /^wear\s+\S/i.test(s)) { wear = s.slice(5).trim(); continue; }
    nameBits.push(s);
  }
  return { name: nameBits.join(SEP).trim(), where, wear };
}

/* ---------- pasted schedules ----------
   The league emails a text block. Typing fourteen games by hand on a Sunday
   night is where organizers quit, so pull the date and time out of each pasted
   line and leave the rest as the event name. */
const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Returns { date:'YYYY-MM-DD'|'', time:'HH:MM'|'', rest } for one pasted line. */
export function sniffDateTime(line, now) {
  let s = String(line || '');
  const ref = now instanceof Date ? now : new Date();
  let y = 0, mo = 0, d = 0;

  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); }
  if (!mo) {
    m = MONTH_RE.exec(s);
    if (m) { mo = MONTHS[m[1].toLowerCase()]; d = +m[2]; y = m[3] ? +m[3] : 0; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); }
  }
  if (!mo) {
    m = /(?:^|[\s(·—–-])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=$|[\s)·—–,-])/.exec(s);
    if (m) {
      mo = +m[1]; d = +m[2];
      y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : 0;
      s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    }
  }
  let time = '';
  const t = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(s);
  if (t) {
    if (t[3]) {
      let hh = +t[1] % 12;
      if (t[3].toLowerCase() === 'pm') hh += 12;
      time = `${String(hh).padStart(2, '0')}:${String(t[2] ? +t[2] : 0).padStart(2, '0')}`;
    } else {
      time = `${String(+t[4]).padStart(2, '0')}:${t[5]}`;
    }
    s = s.slice(0, t.index) + ' ' + s.slice(t.index + t[0].length);
  }
  let date = '';
  if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
    if (!y) {
      // A season pasted in August that says "Mar 3" means next March.
      y = ref.getFullYear();
      const guess = new Date(y, mo - 1, d);
      if ((ref - guess) > 150 * 86400000) y += 1;
      else if ((guess - ref) > 300 * 86400000) y -= 1;
    }
    date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const rest = s.replace(/\s*[·—–-]\s*[·—–-]\s*/g, ' — ').replace(/^[\s·—–,-]+|[\s·—–,-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  return { date, time, rest };
}

/* ---------- formatting ---------- */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(hh, mm) {
  const ap = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

/** 202609120900 → 'Sat, Sep 12 · 9:00 AM'. Returns '' for undated slots. */
export function formatKey(order, { withYear = false } = {}) {
  const p = keyParts(order);
  if (!p) return '';
  const dt = keyToDate(order);
  let s = `${DOW[dt.getDay()]}, ${MON[p.m - 1]} ${p.d}`;
  if (withYear) s += `, ${p.y}`;
  if (p.hasTime) s += ` · ${formatTime(p.hh, p.mm)}`;
  return s;
}

/** Short form for a text message: 'Sat 9/12'. */
export function shortDate(order) {
  const p = keyParts(order);
  if (!p) return '';
  const dt = keyToDate(order);
  return `${DOW[dt.getDay()]} ${p.m}/${p.d}`;
}

/* Chronological first, then undated/legacy rows in their hand-made order. */
export function sortSlots(slots) {
  return [...(slots || [])].sort((a, b) => {
    const da = isDated(a.order), db_ = isDated(b.order);
    if (da !== db_) return da ? -1 : 1;
    return (Number(a.order) || 0) - (Number(b.order) || 0);
  });
}

/** An event is "over" once its day has ended (or 4h after a timed start). */
export function isPast(order, now) {
  const dt = keyToDate(order);
  if (!dt) return false;
  const p = keyParts(order);
  const end = p.hasTime
    ? new Date(dt.getTime() + 4 * 3600 * 1000)
    : new Date(p.y, p.m - 1, p.d, 23, 59, 59);
  return end.getTime() < (now instanceof Date ? now : new Date(now)).getTime();
}

/* ---------- escape hatches: nobody is ever trapped in this app ---------- */

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[;,]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
const p2 = (n) => String(n).padStart(2, '0');

/** RFC 5545 folding: no line over 75 octets. */
function fold(line) {
  if (line.length <= 73) return line;
  const out = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) { out.push(' ' + rest.slice(0, 72)); rest = rest.slice(72); }
  if (rest) out.push(' ' + rest);
  return out.join('\r\n');
}

/** The whole season as a calendar file. Floating local times — no timezone
    database, no permission prompt, no OAuth: the parent gets a file. */
export function seasonIcs({ title, slots, url, stamp }) {
  const now = stamp instanceof Date ? stamp : new Date();
  const dtstamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sky Wolf Studio//Team Parent//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEsc(title),
  ];
  let n = 0;
  for (const s of sortSlots(slots)) {
    const p = keyParts(s.order);
    if (!p) continue; // undated rows are duties, not calendar entries
    const { name, where, wear } = parseLabel(s.label);
    const day = `${p.y}${p2(p.m)}${p2(p.d)}`;
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (s.id || 'slot' + n) + '@team-parent.sws');
    lines.push('DTSTAMP:' + dtstamp);
    if (p.hasTime) {
      const startMin = p.hh * 60 + p.mm;
      const endMin = Math.min(startMin + 90, 23 * 60 + 59);
      lines.push(`DTSTART:${day}T${p2(p.hh)}${p2(p.mm)}00`);
      lines.push(`DTEND:${day}T${p2(Math.floor(endMin / 60))}${p2(endMin % 60)}00`);
    } else {
      const d2 = new Date(p.y, p.m - 1, p.d + 1);
      lines.push(`DTSTART;VALUE=DATE:${day}`);
      lines.push(`DTEND;VALUE=DATE:${d2.getFullYear()}${p2(d2.getMonth() + 1)}${p2(d2.getDate())}`);
    }
    lines.push('SUMMARY:' + icsEsc(name || s.label));
    if (where) lines.push('LOCATION:' + icsEsc(where));
    const desc = [wear ? 'Wear ' + wear : '', url ? 'Always-current schedule: ' + url : ''].filter(Boolean).join('\n');
    if (desc) lines.push('DESCRIPTION:' + icsEsc(desc));
    if (url) lines.push('URL:' + url);
    lines.push('END:VEVENT');
    n++;
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** The paste-into-the-group-chat block for the next few days. The category's
    push notifications land ~30% of the time; a text message lands. */
export function weekMessage({ title, url, events, now, days = 7 }) {
  const from = now instanceof Date ? now : new Date();
  const until = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 23, 59, 59);
  const soon = sortSlots(events || []).filter((s) => {
    const dt = keyToDate(s.order);
    return dt && !isPast(s.order, from) && dt <= until;
  });
  const lines = [`${title} — next ${days} days:`];
  if (soon.length === 0) lines.push('Nothing on the calendar this week.');
  for (const s of soon.slice(0, 20)) {
    const { name, where, wear } = parseLabel(s.label);
    const bits = [shortDate(s.order)];
    const p = keyParts(s.order);
    if (p.hasTime) bits.push(formatTime(p.hh, p.mm));
    bits.push(name || s.label);
    if (where) bits.push(where);
    if (wear) bits.push('wear ' + wear);
    if (s.who && s.who.length) bits.push(s.who.join(', '));
    else if (s.needed > 0) bits.push(`${s.needed} still needed`);
    lines.push('• ' + bits.join(' · '));
  }
  lines.push('');
  lines.push(`Always current (no app, no account): ${url}`);
  return lines.join('\n');
}
