// Pure helpers, no imports, no DOM, no Firebase. Unit-tested in test/helpers.test.mjs.

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

export const MAX_SLOTS = 100;

/* Bulk slot paste, with an honest account of what happened to every line.
   Returns { rows, skipped, remainder, dropped }:
     rows, the parsed slots, at most `limit` of them
     skipped, raw lines that carried no label ("x5", stray punctuation)
     remainder, the lines the limit refused, verbatim, ready to be handed back
                 to the textarea so nothing the user typed is ever deleted
     dropped, how many non-blank lines are in `remainder`
   A 150-line paste used to produce 100 slots and the toast "100 spots added".
   That is the exact betrayal this app exists to be the opposite of. */
export function parseBulkSlotsReport(text, limit) {
  const cap = limit === undefined ? MAX_SLOTS : limit;
  const empty = { rows: [], skipped: [], remainder: '', dropped: 0 };
  if (typeof text !== 'string') return empty;
  const lines = text.split(/\r?\n/);
  const rows = [], skipped = [];
  let i = 0;
  for (; i < lines.length; i++) {
    if (rows.length >= cap) break;
    const raw = lines[i];
    let label = raw.trim();
    if (!label) continue;
    let capacity = 1;
    const m = label.match(/(?:\s*[x×]\s*(\d{1,3})|\s*\((\d{1,3})\))\s*$/i);
    if (m) {
      capacity = parseInt(m[1] || m[2], 10);
      label = label.slice(0, m.index).trim();
    }
    if (!label) { skipped.push(raw.trim()); continue; }
    capacity = Math.min(Math.max(capacity, 1), 999);
    rows.push({ label: label.slice(0, 120), capacity });
  }
  const rest = lines.slice(i);
  return {
    rows, skipped,
    remainder: rest.join('\n').replace(/^\s+|\s+$/g, ''),
    dropped: rest.filter(l => l.trim()).length,
  };
}

/* Bulk slot paste: one spot per line. "Main dish x3" → capacity 3.
   Also accepts "Main dish (3)" and "Main dish ×3". Default capacity 1. */
export function parseBulkSlots(text) {
  return parseBulkSlotsReport(text).rows;
}

/* Date-range slots: "every Tue 3 to 5pm, Sept-Nov" style generation.
   weekdays: Set/array of 0 to 6 (Sun=0). Dates are LOCAL. */
export function dateRangeSlotsReport(opts) {
  const { start, end, weekdays, timeText, prefix, capacity } = opts || {};
  const out = [];
  let dropped = 0;
  const from = new Date(start + 'T00:00:00');
  const to = new Date(end + 'T00:00:00');
  if (isNaN(from) || isNaN(to) || to < from) return { rows: out, dropped };
  const days = new Set(weekdays || []);
  if (days.size === 0) return { rows: out, dropped };
  const cap = Math.min(Math.max(capacity || 1, 1), 999);
  const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (!days.has(d.getDay())) continue;
    if (out.length >= MAX_SLOTS) { dropped++; continue; }
    let label = fmt.format(d);
    if (timeText) label += ' · ' + String(timeText).trim().slice(0, 40);
    if (prefix) label = String(prefix).trim().slice(0, 60) + ', ' + label;
    out.push({ label: label.slice(0, 120), capacity: cap });
  }
  return { rows: out, dropped };
}

export function dateRangeSlots(opts) {
  return dateRangeSlotsReport(opts).rows;
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

/* The same fact nudgeMessage() puts on the clipboard, said on the page: what is
   still open, answerable without scrolling seven screenfuls of identical rows. */
export function stillNeededSentence(slots, max) {
  const limit = max || 6;
  const open = (slots || []).filter(s => (s.claimedCount || 0) < (s.capacity || 1));
  if (open.length === 0) return '';
  const parts = open.slice(0, limit).map((s) => {
    const left = (s.capacity || 1) - (s.claimedCount || 0);
    return left > 1 ? `${s.label} (${left} more)` : s.label;
  });
  const more = open.length - parts.length;
  if (more > 0) parts.push(`and ${more} more`);
  else if (parts.length > 1) parts[parts.length - 1] = 'and ' + parts[parts.length - 1];
  return 'Still needed: ' + parts.join(parts.length > 2 ? ', ' : ' ') + '.';
}

export function shareUrl(code, base) {
  return base + '#/b/' + code;
}
