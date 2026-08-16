/* ═══════════════════════════════════════════════════════════════════════════
   GRADE SHEET — getting the names in

   This is the wall every gradebook loses its users at, and it loses them
   before they ever see a grade. Three teachers, three different apps, three
   abandonments, all here:

     "I have waisted an entire day trying to import student names and info
      from a csv file... right now I am going back to a spread sheet."
     "The only way to import student information is to use the apparently
      super fussy template... Great app if one could use it."
     "I don't have the time to enter almost 700 student's information into
      this app... I feel like I have wasted my hard earned money."

   Every one of those is the same design mistake: the app defined a shape and
   made the teacher produce it. So this module inverts it. Paste anything.
   The parser makes a table out of whatever arrived, and then she points at
   which column is which. The source never has to match a template, because
   there is no template.

   Paste is primary and file is secondary on purpose. On a locked-down school
   machine she may have no SIS export role, no permission to save a file of
   children's names to disk, and nothing she can install — but she can nearly
   always SEE a roster on a screen. Select, Ctrl+C, Ctrl+V. It also leaves no
   file of student names sitting in Downloads afterwards.

   Pure functions only: no DOM writes, no storage. test/roster.test.mjs pins
   the behaviour.
   ═══════════════════════════════════════════════════════════════════════════ */

export const FIELDS = ['last', 'first', 'full', 'sid', 'ignore'];

/* ── 1. the HTML clipboard path ─────────────────────────────────────────────
   Selecting a roster table in an SIS web page and pressing Ctrl+C puts a real
   HTML table on the clipboard alongside the plain text. Reading it gives clean
   rows and cells with no delimiter guessing at all — which makes it the single
   highest-value path on exactly the machine our teacher is stuck with, and
   almost nobody implements it.

   Only ever textContent. The parsed document is never inserted anywhere, and
   DOMParser does not run scripts, but reading text only means a pasted
   <img onerror> is just a string either way. */
export function rowsFromHTML(html, DP) {
  const Parser = DP || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!Parser || !html || !/<t[rd]/i.test(html)) return null;
  let doc;
  try { doc = new Parser().parseFromString(html, 'text/html'); } catch { return null; }
  const trs = [...doc.querySelectorAll('tr')];
  if (trs.length < 1) return null;
  const rows = trs
    .map((tr) => [...tr.querySelectorAll('td,th')]
      .map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim()))
    .filter((r) => r.some((c) => c));
  return rows.length ? rows : null;
}

/* ── 2. the plain-text path ─────────────────────────────────────────────────
   Delimiter is detected per line and then taken as the mode across lines, not
   decided from the first line. A roster's first line is very often the one
   irregular line in the paste — a title, a header, a stray count — and letting
   it choose the delimiter for everything below is how "it still does not load"
   happens.

   Tab is checked first because it is what Excel, Google Sheets and an SIS
   table actually put on the clipboard, whatever the file extension suggests. */
const DELIMS = [
  { name: 'tab', re: /\t/g, split: (s) => s.split('\t') },
  { name: 'semicolon', re: /;/g, split: (s) => s.split(';') },
  { name: 'comma', re: /,/g, split: (s) => s.split(',') },
  { name: 'pipe', re: /\|/g, split: (s) => s.split('|') },
  { name: 'spaces', re: / {2,}/g, split: (s) => s.split(/ {2,}/) },
];

/* Ordinals, bullets and trailing counts that come along for the ride when
   someone copies a numbered list out of a document. */
const stripOrnament = (line) =>
  line
    .replace(/^\s*\d+\s*[.)\]-]\s+/, '')
    .replace(/^\s*[•·*–—-]\s+/, '')
    .trim();

export function detectDelimiter(lines) {
  const votes = new Map();
  for (const l of lines) {
    let best = null, bestN = 0;
    for (const d of DELIMS) {
      const n = (l.match(d.re) || []).length;
      if (n > bestN) { bestN = n; best = d.name; }
    }
    if (best) votes.set(best, (votes.get(best) || 0) + 1);
  }
  let win = null, n = 0;
  for (const [k, v] of votes) if (v > n) { n = v; win = k; }
  return win;
}

const HEADER_WORDS = /\b(name|student|pupil|id|number|last|first|surname|given|email|grade|homeroom)\b/i;

export function looksLikeHeader(row) {
  if (!row || !row.length) return false;
  const joined = row.join(' ');
  if (!HEADER_WORDS.test(joined)) return false;
  /* A real header is words, not data. If most cells contain a digit it is far
     more likely to be a row of student IDs than a header row — and silently
     eating a child's record is worse than showing one extra row she deletes. */
  const digity = row.filter((c) => /\d/.test(c)).length;
  return digity <= row.length / 2;
}

export function parsePaste(text, html, DP) {
  const fromHtml = rowsFromHTML(html, DP);
  let rows, via;
  if (fromHtml) {
    rows = fromHtml; via = 'html';
  } else {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(stripOrnament)
      .filter((l) => l.length);
    if (!lines.length) return { rows: [], header: null, via: 'empty', delimiter: null };
    const d = detectDelimiter(lines);
    const split = d ? DELIMS.find((x) => x.name === d).split : (s) => [s];
    rows = lines.map((l) => split(l).map((c) => c.replace(/^["']|["']$/g, '').trim()));
    via = d || 'single';
  }

  /* Ragged rows are normal — a trailing empty cell, a merged cell. Pad to the
     modal width rather than rejecting, because rejecting is the behaviour the
     reviews above are complaining about. */
  const widths = new Map();
  for (const r of rows) widths.set(r.length, (widths.get(r.length) || 0) + 1);
  let w = 1, wn = 0;
  for (const [k, v] of widths) if (v > wn || (v === wn && k > w)) { wn = v; w = k; }
  rows = rows.map((r) => {
    const c = r.slice(0, w);
    while (c.length < w) c.push('');
    return c;
  });

  let header = null;
  if (rows.length > 1 && looksLikeHeader(rows[0])) header = rows.shift();

  return { rows, header, via, delimiter: via };
}

/* ── 3. guessing the columns ────────────────────────────────────────────────
   A guess, shown, never committed blind. The picker lets her override every
   column, which is what makes a wrong guess cost one tap instead of an
   afternoon. */
export function guessColumns(rows, header) {
  const n = rows[0] ? rows[0].length : 0;
  const col = (i) => rows.map((r) => r[i] || '').filter(Boolean);
  const out = new Array(n).fill('ignore');

  const allNumeric = (i) => { const c = col(i); return c.length > 0 && c.every((v) => /^\d[\d-]*$/.test(v)); };
  const hasComma = (i) => col(i).filter((v) => v.includes(',')).length > col(i).length / 2;
  const avgWords = (i) => { const c = col(i); return c.length ? c.reduce((s, v) => s + v.split(/\s+/).length, 0) / c.length : 0; };

  /* A header, when there is one, beats content heuristics — she told us. */
  const byHeader = (i) => {
    if (!header) return null;
    const h = (header[i] || '').toLowerCase();
    if (/\b(id|number|no\.?)\b/.test(h)) return 'sid';
    if (/last|surname|family/.test(h)) return 'last';
    if (/first|given|fore/.test(h)) return 'first';
    if (/name|student|pupil/.test(h)) return 'full';
    return null;
  };

  let usedFirst = false, usedLast = false, usedFull = false;
  for (let i = 0; i < n; i++) {
    const h = byHeader(i);
    if (h) {
      out[i] = h;
      if (h === 'first') usedFirst = true;
      if (h === 'last') usedLast = true;
      if (h === 'full') usedFull = true;
      continue;
    }
    if (allNumeric(i)) { out[i] = 'sid'; continue; }
    if (hasComma(i) && !usedFull) { out[i] = 'full'; usedFull = true; continue; }
    if (avgWords(i) >= 1) {
      if (!usedLast && !usedFull && n > 1) { out[i] = 'last'; usedLast = true; }
      else if (!usedFirst && !usedFull) { out[i] = 'first'; usedFirst = true; }
      else if (!usedFull && n === 1) { out[i] = 'full'; usedFull = true; }
    }
  }
  /* A single column of names is a full name, not a surname. */
  if (n === 1) out[0] = 'full';
  if (usedLast && !usedFirst && !usedFull && n === 1) out[0] = 'full';
  return out;
}

/* ── 4. names ───────────────────────────────────────────────────────────────
   "Moreno, Jacob" and "Jacob Moreno" are both normal and both common in the
   same building. The order is a radio button she can see and flip with a live
   preview, never a guess she has to discover was wrong forty names later. */
export function splitFullName(s, order = 'firstLast') {
  const v = String(s || '').replace(/\s+/g, ' ').trim();
  if (!v) return { first: '', last: '' };
  if (v.includes(',')) {
    const [l, f] = v.split(',');
    return { first: (f || '').trim(), last: (l || '').trim() };
  }
  const parts = v.split(' ');
  if (parts.length === 1) return { first: parts[0], last: '' };
  if (order === 'lastFirst') return { last: parts[0], first: parts.slice(1).join(' ') };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

export function buildStudents(rows, cols, order = 'firstLast') {
  const out = [];
  for (const r of rows) {
    let first = '', last = '', sid = '';
    for (let i = 0; i < cols.length; i++) {
      const v = (r[i] || '').trim();
      if (!v) continue;
      if (cols[i] === 'first') first = v;
      else if (cols[i] === 'last') last = v;
      else if (cols[i] === 'sid') sid = v;
      else if (cols[i] === 'full') { const n = splitFullName(v, order); first = n.first; last = n.last; }
    }
    if (!first && !last && !sid) continue;
    out.push({ first, last, sid, tag: '', note: '', active: true });
  }
  return out;
}

/* ── 5. two children with the same name ─────────────────────────────────────
   There are always two Jacob M.s. Marks entered on the wrong one are invisible
   until a report card goes home, which is the worst possible moment to find
   out — so this BLOCKS the commit rather than warning. The disambiguator she
   supplies then shows everywhere in the app, not just in the roster editor,
   because the ambiguity is at the moment of entry. */
export function displayName(s, mode = 'firstLast1') {
  const f = (s.first || '').trim(), l = (s.last || '').trim();
  const tag = s.tag ? ` (${s.tag})` : '';
  if (!f && !l) return (s.sid || '—') + tag;
  if (mode === 'full') return [f, l].filter(Boolean).join(' ') + tag;
  if (mode === 'initials') return ((f[0] || '') + (l[0] || '')).toUpperCase() + tag;
  return (f || l) + (f && l ? ' ' + l[0].toUpperCase() + '.' : '') + tag;
}

export function findCollisions(students, mode = 'firstLast1') {
  const seen = new Map();
  for (let i = 0; i < students.length; i++) {
    const k = displayName(students[i], mode).toLowerCase();
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(i);
  }
  return [...seen.entries()]
    .filter(([, idx]) => idx.length > 1)
    .map(([name, idx]) => ({ name, indexes: idx }));
}

/* Already in this class — counted so the summary line can say so, and skipped
   on commit. Re-pasting the same roster is a thing people do when they are not
   sure the first one worked. */
export function partitionExisting(incoming, existing) {
  const key = (s) => `${(s.first || '').toLowerCase()}|${(s.last || '').toLowerCase()}|${s.sid || ''}`;
  const have = new Set(existing.map(key));
  const fresh = [], dupes = [];
  for (const s of incoming) (have.has(key(s)) ? dupes : fresh).push(s);
  return { fresh, dupes };
}
