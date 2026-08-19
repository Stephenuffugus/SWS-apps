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

/* Date-range slots: "every Tue 3 to 5pm, Sept-Nov" style generation.
   weekdays: Set/array of 0 to 6 (Sun=0). Dates are LOCAL. */
export function dateRangeSlots({ start, end, weekdays, timeText, prefix, capacity }) {
  const out = [];
  const from = new Date(start + 'T00:00:00');
  const to = new Date(end + 'T00:00:00');
  if (isNaN(from) || isNaN(to) || to < from) return out;
  const days = new Set(weekdays || []);
  if (days.size === 0) return out;
  const cap = Math.min(Math.max(capacity || 1, 1), 999);
  const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (!days.has(d.getDay())) continue;
    let label = fmt.format(d);
    if (timeText) label += ' · ' + String(timeText).trim().slice(0, 40);
    if (prefix) label = String(prefix).trim().slice(0, 60) + ', ' + label;
    out.push({ label: label.slice(0, 120), capacity: cap });
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
