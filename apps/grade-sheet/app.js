/* ═══════════════════════════════════════════════════════════════════════════
   GRADE SHEET, the app

   Everything that can be wrong here is wrong about a real child, so the whole
   thing is arranged around two rules:

     1. The arithmetic lives in grade.js and is pure. This file asks it
        questions and draws the answers. It never does a sum of its own.
     2. Nothing derived is ever saved. Percentages, letters, subtotals and
        drop decisions are recomputed on every render, so editing a cutoff can
        never leave a stale grade sitting in a record.

   The interaction is built around the act that happens most: marking one class,
   tired, at the end of a period. That path is keyboard-first and commits on
   every keystroke that moves, a half-typed value silently discarded is worse
   than a committed one that undo can reverse.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as S from './store.js';
import { computeClass, explain, finish, classGrade, SCALES, validateScale, letterFor } from './grade.js';
import { parsePaste, guessColumns, buildStudents, displayName, findCollisions, partitionExisting, FIELDS } from './roster.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (t, a = {}, ...kids) => {
  const n = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);
const say = (m) => { const l = $('#live'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = m; }, 30); } };

/* ── asking for something ───────────────────────────────────────────────────
   Not window.prompt. A managed school browser can suppress it outright, it
   cannot be styled or read properly by a screen reader, and a grey system box
   asking for a class name is exactly what staff are trained to treat as
   phishing. One <dialog>, focus trapped by the platform, Escape closes. */
function ask(title, fields) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'sheet', 'aria-label': title });
    const form = el('form', { method: 'dialog' });
    form.append(el('h3', { style: 'margin-top:0' }, title));
    const inputs = fields.map((f) => {
      const i = el('input', {
        type: f.type || 'text', value: f.value ?? '', inputmode: f.type === 'number' ? 'decimal' : null,
        required: f.required ? true : null, min: f.min, id: 'ask_' + f.key,
      });
      form.append(el('label', { for: 'ask_' + f.key }, f.label, i));
      if (f.hint) form.append(el('p', { class: 'muted', style: 'margin:2px 0 10px;font-size:.85rem' }, f.hint));
      return [f.key, i];
    });
    form.append(el('div', { class: 'rowline', style: 'justify-content:flex-end;margin-top:12px' },
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { dlg.close(); resolve(null); } }, 'Cancel'),
      el('button', { class: 'btn primary', type: 'submit' }, 'OK')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const [k, i] of inputs) out[k] = i.value.trim();
      dlg.close(); resolve(out);
    });
    dlg.append(form);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(null); }, { once: true });
    document.body.append(dlg);
    dlg.showModal();
    inputs[0][1].focus();
  });
}

/* ── state ──────────────────────────────────────────────────────────────── */
let book = null;          // the meta record
let cur = null;           // the loaded class, or null
let view = 'today';
let persisted = null;
let undoStack = [];

const nextId = (k) => { book.ids[k] = (book.ids[k] || 0) + 1; return `${k}_${book.ids[k]}`; };

async function saveBook() { book.updatedAt = now(); await S.putMeta(book); S.markSeen(now()); }
async function saveClass(c) {
  const i = book.classIndex.findIndex((x) => x.id === c.id);
  const stub = { id: c.id, name: c.name, period: c.period, days: c.days };
  if (i === -1) book.classIndex.push(stub); else book.classIndex[i] = stub;
  await S.putClass(c);
  await saveBook();
}

/* Undo is offered for everything destructive short of a restore, because the
   fastest possible entry path is only safe if a wrong keystroke is cheap. */
function pushUndo(label, fn) {
  undoStack.push({ label, fn });
  if (undoStack.length > 40) undoStack.shift();
}
async function undo() {
  const u = undoStack.pop();
  if (!u) { say('Nothing to undo.'); return; }
  await u.fn();
  say(`Undid ${u.label}.`);
  render();
}

/* ── boot ───────────────────────────────────────────────────────────────── */
(async function boot() {
  let wipeInfo = { wiped: false };
  try { wipeInfo = await S.checkForWipe(); } catch { /* storage blocked */ }
  book = await S.getMeta().catch(() => null);
  if (!book) { book = S.newBook(now()); }
  persisted = await S.askPersist();

  if (wipeInfo.wiped) {
    /* Say what actually happened, in those words. A cheerful empty state here
       would let her assume she was never signed in, and she would carry on
       marking into a book the machine is going to erase again. */
    view = 'wiped';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      const on = document.body.dataset.names !== 'hidden';
      if (on) document.body.dataset.names = 'hidden'; else delete document.body.dataset.names;
      say(on ? 'Names hidden.' : 'Names shown.');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault(); undo();
    }
  });
  if (book.startHidden) document.body.dataset.names = 'hidden';

  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

/* ── chrome ─────────────────────────────────────────────────────────────── */
function renderKeepline() {
  const box = $('#keepline');
  box.textContent = '';
  const days = book.lastBackupAt
    ? Math.floor((Date.now() - Date.parse(book.lastBackupAt)) / 86400000) : null;
  const stale = days === null || days >= 7;
  const shield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  const line = persisted
    ? 'This browser has promised to keep your gradebook. Export a backup file every week anyway.'
    : '<b>This browser has not promised to keep your gradebook, export a backup file every week.</b>';
  const when = book.lastBackupAt
    ? (days === 0 ? 'Last backup: today.' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago.`)
    : 'You have never exported a backup.';
  box.append(el('div', { class: 'keepline' + (stale ? ' warn' : ''), html: `${shield}<span>${line} <b>${when}</b> ` }));
  box.firstChild.append(el('button', { class: 'btn ghost noprint', style: 'margin-left:8px', onclick: exportBackup }, 'Save one now'));
}

function renderChrome() {
  const c = $('#chrome');
  c.textContent = '';
  c.append(
    el('button', {
      class: 'btn ghost', title: 'Escape also does this',
      onclick: () => {
        if (document.body.dataset.names === 'hidden') delete document.body.dataset.names;
        else document.body.dataset.names = 'hidden';
      },
    }, 'Hide names'),
    el('button', { class: 'btn ghost', onclick: undo }, 'Undo'),
  );
  $('#bookSub').textContent = book.classIndex.length
    ? `${book.classIndex.length} class${book.classIndex.length === 1 ? '' : 'es'}` : '';
}

const TABS = [
  ['today', 'Today'],
  ['classes', 'Classes'],
  ['backup', 'Backup &amp; privacy'],
];
function renderTabs() {
  const n = $('#tabs');
  n.textContent = '';
  for (const [id, label] of TABS) {
    n.append(el('button', {
      type: 'button',
      'aria-current': (view === id || (id === 'classes' && ['class', 'roster', 'mark', 'setup'].includes(view))) ? 'page' : null,
      onclick: () => { view = id; cur = id === 'classes' ? null : cur; render(); },
      html: label,
    }));
  }
}

/* ── router ─────────────────────────────────────────────────────────────── */
function render() {
  renderChrome(); renderKeepline(); renderTabs();
  const m = $('#main');
  m.textContent = '';
  const views = { wiped: vWiped, today: vToday, classes: vClasses, class: vClass, roster: vRoster, mark: vMark, setup: vSetup, backup: vBackup };
  (views[view] || vToday)(m);
}

/* ── the wipe warning ───────────────────────────────────────────────────── */
function vWiped(m) {
  m.append(
    el('div', { class: 'keepline warn' },
      el('div', {},
        el('p', { style: 'margin:0 0 8px' }, el('b', {}, 'This browser has erased your gradebook.')),
        el('p', { style: 'margin:0 0 8px' }, 'Grade Sheet has been used on this computer before, but the marks are gone. That usually means the browser was set to clear website data when you sign out, a setting a school often applies to shared and managed computers.'),
        el('p', { style: 'margin:0 0 8px' }, 'We cannot get it back. Nothing was ever sent to us, so there is no copy anywhere but yours.'),
        el('p', { style: 'margin:0' }, 'If you have a backup file, restore it now. Then export a backup every week, and keep it somewhere the computer does not control.'))),
    el('div', { class: 'rowline', style: 'margin-top:16px' },
      el('button', { class: 'btn primary', onclick: () => { view = 'backup'; render(); } }, 'Restore from a file'),
      el('button', { class: 'btn ghost', onclick: () => { view = 'today'; render(); } }, 'Start again')),
  );
}

/* ── today ──────────────────────────────────────────────────────────────── */
function vToday(m) {
  if (!book.classIndex.length) return vWelcome(m);
  const dow = book.dayLabels[Math.min(new Date().getDay() === 0 ? 0 : new Date().getDay() - 1, book.dayLabels.length - 1)];
  const mine = book.classIndex.filter((c) => !c.days || !c.days.length || c.days.includes(dow));
  mine.sort((a, b) => (a.period ?? 99) - (b.period ?? 99));

  m.append(el('h2', {}, `Today, ${dow}`));
  if (!mine.length) m.append(el('p', { class: 'muted' }, 'Nothing scheduled for today. All your classes are under Classes.'));
  const grid = el('div', { class: 'cards' });
  for (const c of mine) {
    grid.append(el('button', { class: 'card', onclick: () => openClass(c.id) },
      el('b', { class: 'pii' }, c.name),
      el('span', { class: 'meta' }, c.period ? `Period ${c.period}` : 'No period set')));
  }
  m.append(grid);
}

/* The studio badge. This app earns it, after the strip there is no network
   code at all, but the wording is this app's own, because the standard line
   is about the reader's data and this holds somebody else's children's. The
   sentence it must never say is any form of "FERPA compliant": a product
   cannot be, only a practice can, and a teacher relying on that would be
   relying on us for something we are not entitled to tell her. */
function shieldSVG() {
  const w = document.createElement('span');
  w.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  return w.firstChild;
}

function trustBadge() {
  return el('p', { class: 'trust', style: 'margin-top:24px;max-width:40rem' },
    shieldSVG(),
    el('span', {}, el('b', {}, 'Your students’ names and grades never leave this device.'),
      ' There is no account, no server and no company holding your gradebook. We never see a single student name.'));
}

function vWelcome(m) {
  m.append(
    el('h2', {}, 'A gradebook that stays on this computer'),
    el('p', { class: 'muted', style: 'max-width:38rem' },
      'Paste your class lists in, mark a class in a few seconds between periods, and print what you need. Your students’ names and marks are stored by this browser, on this computer, and are never sent anywhere.'),
    el('p', { class: 'muted', style: 'max-width:38rem' },
      el('b', {}, 'About 20 seconds a class once the list is on screen.'),
      ' Twenty-five classes is under ten minutes, once, in August.'),
    el('div', { class: 'rowline', style: 'margin-top:16px' },
      el('button', { class: 'btn primary', onclick: addClass }, 'Add your first class')),
    trustBadge(),
    el('p', { class: 'muted', style: 'margin-top:16px;font-size:.85rem;max-width:38rem' },
      'Before you type real student names into this, or into anything else, check your school’s policy on classroom software.'),
  );
}

/* ── classes ────────────────────────────────────────────────────────────── */
async function addClass() {
  const r = await ask('Add a class', [
    { key: 'name', label: 'What is this class called?', required: true, hint: '“Grade, teacher” works well, e.g. 2 Kowalski.' },
    { key: 'period', label: 'Period (optional)', type: 'number', min: '0' },
  ]);
  if (!r || !r.name) return;
  const c = S.newClass(nextId('cls'), r.name);
  if (r.period) c.period = Number(r.period);
  await saveClass(c);
  cur = c; view = 'roster'; render();
}

function vClasses(m) {
  m.append(el('div', { class: 'rowline' }, el('h2', { style: 'margin:0' }, 'Classes'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn primary noprint', onclick: addClass }, 'Add a class')));
  if (!book.classIndex.length) { m.append(el('p', { class: 'empty' }, 'No classes yet.')); return; }
  const grid = el('div', { class: 'cards', style: 'margin-top:16px' });
  for (const c of book.classIndex) {
    grid.append(el('button', { class: 'card', onclick: () => openClass(c.id) },
      el('b', { class: 'pii' }, c.name),
      el('span', { class: 'meta' }, c.period ? `Period ${c.period}` : 'No period set')));
  }
  m.append(grid);
}

async function openClass(id) { cur = await S.getClass(id); view = 'class'; render(); }

/* ── one class ──────────────────────────────────────────────────────────── */
function classHeader(m, active) {
  m.append(el('div', { class: 'rowline noprint', style: 'margin-bottom:12px' },
    el('button', { class: 'btn ghost', onclick: () => { view = 'classes'; cur = null; render(); } }, '← Classes'),
    el('h2', { class: 'pii', style: 'margin:0' }, cur.name),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn ghost', onclick: () => { view = 'roster'; render(); } }, 'Roster'),
    el('button', { class: 'btn ghost', onclick: () => { view = 'setup'; render(); } }, 'Settings'),
    el('button', { class: 'btn ghost', onclick: () => window.print() }, 'Print')));
}

/* Rows for one student, in the shape grade.js wants. Built fresh every render
   because nothing derived is stored. */
function rowsFor(c, stuId) {
  return c.assignments.filter((a) => a.includeInGrade !== false).map((a) => {
    const rec = ((c.scores || {})[a.id] || {})[stuId] || { state: 'ungraded' };
    return {
      id: a.id, name: a.name, categoryId: a.categoryId, pointsPossible: a.pointsPossible,
      extraCredit: a.extraCredit, ecScope: a.ecScope, neverDrop: a.neverDrop,
      state: rec.state || 'ungraded', points: rec.points,
    };
  });
}

function vClass(m) {
  classHeader(m);
  const c = cur;
  if (!c.students.length) {
    m.append(el('div', { class: 'empty' },
      el('p', {}, 'No students in this class yet.'),
      el('button', { class: 'btn primary', onclick: () => { view = 'roster'; render(); } }, 'Paste your class list')));
    return;
  }

  m.append(el('div', { class: 'rowline noprint', style: 'margin-bottom:12px' },
    el('button', { class: 'btn primary', onclick: () => newAssignment(false) }, 'Mark today’s lesson'),
    el('button', { class: 'btn ghost', onclick: () => newAssignment(true) }, 'Add an assignment')));

  const tbl = el('table', { class: 'marks' });
  const head = el('tr', {}, el('th', { class: 'name' }, 'Student'), el('th', { class: 'num' }, 'Grade so far'));
  for (const a of c.assignments) head.append(el('th', { class: 'num', title: `${a.pointsPossible} points` }, a.name));
  tbl.append(el('thead', {}, head));

  const body = el('tbody');
  for (const s of c.students) {
    const rows = rowsFor(c, s.id);
    const g = computeClass(c, rows);
    const tr = el('tr', {},
      el('td', { class: 'name pii' }, displayName(s, book.nameDisplay)),
      el('td', { class: 'num' },
        g.soFar.display === null ? el('span', { class: 'muted' }, '—')
          : el('span', {}, `${g.soFar.display}%`, g.soFar.letter ? el('span', { class: 'pill', style: 'margin-left:6px' }, g.soFar.letter) : ''),
        explainBlock(c, rows, s)));
    for (const a of c.assignments) {
      const rec = ((c.scores || {})[a.id] || {})[s.id] || { state: 'ungraded' };
      tr.append(el('td', { class: 'num' }, cellFor(c, a, s, rec)));
    }
    body.append(tr);
  }
  tbl.append(body);
  m.append(el('div', { class: 'gridwrap' }, tbl));
  m.append(weightNote(c));
}

function weightNote(c) {
  if (c.model !== 'weighted-categories') return '';
  const anyRows = c.students.length ? rowsFor(c, c.students[0].id) : [];
  const g = classGrade(c, anyRows);
  if (g.W >= 100 || !g.inactive.length) return '';
  /* The sentence is not optional. If Tests are 40% and no test has happened,
     the headline is computed from 60% of the scheme, and a teacher who does
     not know that will read a number that means something else. */
  const active = g.categories.filter((p) => p.pct !== null && p.cat.weight > 0);
  const parts = active.map((p) => `${p.cat.name} is ${Math.round(p.effectiveWeight)}%`).join(' and ');
  return el('p', { class: 'weightnote' },
    `Counting ${active.map((p) => `${p.cat.name} (${p.cat.weight}%)`).join(' and ')}. `,
    el('b', {}, `${g.inactive.join(', ')} ${g.inactive.length === 1 ? 'has' : 'have'} no graded work yet, so ${g.inactive.length === 1 ? 'it is' : 'they are'} not counted.`),
    ` Right now ${parts} of this grade.`);
}

function explainBlock(c, rows, s) {
  const d = el('details', { class: 'explain noprint' });
  d.append(el('summary', {}, 'How is this worked out?'));
  d.addEventListener('toggle', () => {
    if (!d.open || d.dataset.done) return;
    d.dataset.done = '1';
    const e = explain(c, rows);
    const ol = el('ol');
    for (const l of e.lines) ol.append(el('li', { class: l.kind === 'dropped' ? 'dropped' : l.kind === 'result' ? 'result' : null }, l.text));
    const pr = computeClass(c, rows).projected;
    if (pr.display !== null) ol.append(el('li', { class: 'muted' }, `If nothing else is turned in: ${pr.display}%${pr.letter ? ' ' + pr.letter : ''}.`));
    d.append(ol);
  }, { once: false });
  return d;
}

/* ── a score cell ───────────────────────────────────────────────────────── */
function cellFor(c, a, s, rec) {
  const wrap = el('span');
  const inp = el('input', {
    class: 'cell st-' + (rec.state || 'ungraded'),
    inputmode: 'decimal',
    value: rec.state === 'graded' ? String(rec.points ?? '') : rec.state === 'missing' ? 'M' : rec.state === 'excused' ? 'Ex' : '',
    'aria-label': cellLabel(a, s, rec),
    'data-a': a.id, 'data-s': s.id,
  });
  inp.addEventListener('keydown', (e) => {
    /* Any navigation commits what is in the field. A half-typed value silently
       discarded is worse than a committed one undo can reverse. */
    if (['Enter', 'ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) {
      commitCell(inp);
      if (e.key !== 'Tab') { e.preventDefault(); moveCell(inp, e.key === 'ArrowUp' ? -1 : 1); }
    }
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setState(a, s, 'missing'); }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setState(a, s, 'excused'); }
  });
  inp.addEventListener('blur', () => commitCell(inp));
  wrap.append(inp);
  if (rec.absent || rec.late) wrap.append(el('span', { class: 'flags' }, [rec.absent ? '·abs' : '', rec.late ? 'L' : ''].filter(Boolean).join(' ')));
  return wrap;
}

function cellLabel(a, s, rec) {
  const who = displayName(s, book.nameDisplay);
  const st = rec.state || 'ungraded';
  const base = st === 'graded' ? (rec.points === 0 ? 'zero' : `${rec.points} out of ${a.pointsPossible}`)
    : st === 'missing' ? 'missing, counts as zero'
      : st === 'excused' ? 'excused, not counted' : 'not graded yet';
  return `${who}, ${a.name}: ${base}${rec.absent ? ', absent' : ''}${rec.late ? ', late' : ''}`;
}

function moveCell(inp, dir) {
  const all = [...document.querySelectorAll(`.cell[data-a="${inp.dataset.a}"]`)];
  const i = all.indexOf(inp);
  const n = all[i + dir];
  if (n) { n.focus(); n.select && n.select(); }
}

async function commitCell(inp) {
  const c = cur, aId = inp.dataset.a, sId = inp.dataset.s;
  const raw = inp.value.trim();
  const prev = JSON.parse(JSON.stringify(((c.scores || {})[aId] || {})[sId] || { state: 'ungraded' }));
  let rec;
  if (!raw) rec = { state: 'ungraded' };
  else if (/^m$/i.test(raw)) rec = { state: 'missing' };
  else if (/^(e|ex|exc)$/i.test(raw)) rec = { state: 'excused' };
  else {
    const n = Number(raw);
    if (!isFinite(n) || n < 0) { inp.classList.add('err'); say('A score cannot be negative.'); return; }
    rec = { state: 'graded', points: n };
  }
  if (prev.absent) rec.absent = true;
  if (prev.late) rec.late = true;
  if (prev.note) rec.note = prev.note;
  if (JSON.stringify(prev) === JSON.stringify(rec)) return;

  if (!c.scores) c.scores = {};
  if (!c.scores[aId]) c.scores[aId] = {};
  c.scores[aId][sId] = rec;
  pushUndo('that mark', async () => { c.scores[aId][sId] = prev; await saveClass(c); });
  await saveClass(c);
  render();
}

async function setState(a, s, state) {
  const c = cur;
  if (!c.scores) c.scores = {};
  if (!c.scores[a.id]) c.scores[a.id] = {};
  const prev = JSON.parse(JSON.stringify(c.scores[a.id][s.id] || { state: 'ungraded' }));
  c.scores[a.id][s.id] = { ...prev, state, points: undefined };
  pushUndo('that mark', async () => { c.scores[a.id][s.id] = prev; await saveClass(c); });
  await saveClass(c);
  render();
}

/* ── new assignment / the session sweep ─────────────────────────────────── */
async function newAssignment(full) {
  const c = cur;
  let name, pts;
  if (full) {
    const r = await ask('Add an assignment', [
      { key: 'name', label: 'What is it called?', required: true },
      { key: 'pts', label: 'Out of how many points?', type: 'number', min: '0', value: '10' },
    ]);
    if (!r || !r.name) return;
    name = r.name; pts = Number(r.pts);
  } else {
    name = `Lesson, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    pts = 4;
  }
  if (!isFinite(pts) || pts < 0) { say('That is not a number of points.'); return; }
  const a = {
    id: nextId('asg'), categoryId: c.categories[0] ? c.categories[0].id : null,
    name: (name || '').trim(), date: todayISO(), pointsPossible: pts,
    scheme: pts === 4 ? 'levels4' : 'points', extraCredit: false, neverDrop: false, includeInGrade: true,
  };
  c.assignments.push(a);
  pushUndo('that assignment', async () => {
    c.assignments = c.assignments.filter((x) => x.id !== a.id);
    delete c.scores[a.id];
    await saveClass(c);
  });
  await saveClass(c);
  view = 'mark'; cur.markingId = a.id; render();
}

function vMark(m) {
  classHeader(m);
  const c = cur;
  const a = c.assignments.find((x) => x.id === c.markingId) || c.assignments[c.assignments.length - 1];
  if (!a) { view = 'class'; render(); return; }

  m.append(el('h3', {}, a.name, el('span', { class: 'pill', style: 'margin-left:8px' }, `out of ${a.pointsPossible}`)));
  m.append(el('p', { class: 'muted noprint', style: 'font-size:.85rem' },
    'Type a number and press Enter to drop to the next child. ',
    el('b', {}, 'M'), ' marks it missing, ', el('b', {}, 'E'), ' marks it excused. Leave it empty if you have not marked it yet.'));

  /* The sweep: one mark for everyone, then fix the exceptions. In a specials
     room the same participation mark fits twenty of twenty-four children, and
     typing it twenty times is the reason teachers stop using gradebooks. */
  const sweep = el('div', { class: 'rowline noprint', style: 'margin-bottom:12px' },
    el('span', { class: 'muted' }, 'Give everyone:'));
  for (const v of [a.pointsPossible, a.pointsPossible - 1, a.pointsPossible - 2].filter((x) => x >= 0)) {
    sweep.append(el('button', { class: 'btn ghost', onclick: () => sweepAll(a, v) }, String(v)));
  }
  sweep.append(el('button', { class: 'btn ghost', onclick: () => sweepAll(a, null) }, 'Clear all'));
  m.append(sweep);

  const tbl = el('table', { class: 'marks' });
  tbl.append(el('thead', {}, el('tr', {}, el('th', { class: 'name' }, 'Student'), el('th', { class: 'num' }, 'Mark'))));
  const body = el('tbody');
  for (const s of c.students) {
    const rec = ((c.scores || {})[a.id] || {})[s.id] || { state: 'ungraded' };
    body.append(el('tr', {},
      el('td', { class: 'name pii' }, displayName(s, book.nameDisplay)),
      el('td', { class: 'num' }, cellFor(c, a, s, rec))));
  }
  tbl.append(body);
  m.append(el('div', { class: 'gridwrap' }, tbl));

  m.append(el('div', { class: 'rowline noprint', style: 'margin-top:16px' },
    el('button', { class: 'btn primary', onclick: () => { view = 'class'; render(); } }, 'Done')));
  setTimeout(() => { const f = document.querySelector('.cell'); if (f) f.focus(); }, 40);
}

async function sweepAll(a, value) {
  const c = cur;
  const before = JSON.parse(JSON.stringify(c.scores[a.id] || {}));
  if (!c.scores[a.id]) c.scores[a.id] = {};
  for (const s of c.students) {
    const prev = c.scores[a.id][s.id] || {};
    c.scores[a.id][s.id] = value === null
      ? { state: 'ungraded', ...(prev.absent ? { absent: true } : {}) }
      : { state: 'graded', points: value, ...(prev.absent ? { absent: true } : {}) };
  }
  pushUndo('that sweep', async () => { c.scores[a.id] = before; await saveClass(c); });
  await saveClass(c);
  say(value === null ? 'Cleared.' : `Everyone given ${value}.`);
  render();
}

/* ── roster paste ───────────────────────────────────────────────────────── */
let pasteState = null;

function vRoster(m) {
  classHeader(m);
  const c = cur;
  if (!pasteState) {
    m.append(
      el('h3', {}, 'Paste anything with names in it'),
      el('p', { class: 'muted' }, 'Select your class list, in your school system, in a spreadsheet, in an email, copy it, and paste it here. It does not have to be tidy.'),
      el('textarea', {
        class: 'paste', autofocus: true, 'aria-label': 'Paste your class list',
        onpaste: (e) => {
          const html = e.clipboardData && e.clipboardData.getData('text/html');
          const text = e.clipboardData && e.clipboardData.getData('text/plain');
          if (html || text) { e.preventDefault(); takePaste(text, html); }
        },
        oninput: (e) => { if (e.target.value.trim().length > 3) takePaste(e.target.value, null); },
      }),
      el('p', { class: 'muted', style: 'font-size:.85rem' },
        'About 20 seconds a class once the list is on screen. Twenty-five classes is under ten minutes, once, in August.'),
    );
    if (c.students.length) m.append(rosterList(c));
    return;
  }
  m.append(pickerUI(m));
}

function takePaste(text, html) {
  const r = parsePaste(text, html, typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!r.rows.length) { say('Nothing recognisable in that paste.'); return; }
  pasteState = { ...r, cols: guessColumns(r.rows, r.header), order: 'firstLast' };
  render();
}

function pickerUI() {
  const p = pasteState, c = cur;
  const box = el('div', { class: 'stack' });
  const students = () => buildStudents(p.rows, p.cols, p.order);
  const { fresh, dupes } = partitionExisting(students(), c.students);
  const collisions = findCollisions(fresh.concat(c.students), book.nameDisplay);

  box.append(el('p', {},
    el('b', {}, `${p.rows.length} row${p.rows.length === 1 ? '' : 's'} found`),
    p.header ? ' · 1 header row ignored' : '',
    dupes.length ? ` · ${dupes.length} already in this class` : ''));

  /* The column picker. This is the whole ballgame: the source never has to
     match a template, because she points at the columns instead. */
  const tbl = el('table');
  const hr = el('tr');
  p.cols.forEach((v, i) => {
    const sel = el('select', {
      'aria-label': `What is column ${i + 1}?`,
      onchange: (e) => { p.cols[i] = e.target.value; render(); },
    });
    for (const f of FIELDS) {
      sel.append(el('option', { value: f, selected: v === f },
        { last: 'Last name', first: 'First name', full: 'Full name', sid: 'Student ID', ignore: 'Ignore' }[f]));
    }
    hr.append(el('th', {}, sel));
  });
  tbl.append(el('thead', {}, hr));
  const tb = el('tbody');
  for (const r of p.rows.slice(0, 5)) tb.append(el('tr', {}, r.map((cell) => el('td', { class: 'pii' }, cell))));
  tbl.append(tb);
  box.append(el('div', { class: 'picker' }, tbl));

  if (p.cols.includes('full')) {
    const prev = students().slice(0, 3).map((s) => displayName(s, 'full')).join(' · ');
    box.append(el('fieldset', {},
      el('legend', {}, 'Names are written'),
      el('label', { class: 'rowline' }, el('input', { type: 'radio', name: 'ord', checked: p.order === 'firstLast', onchange: () => { p.order = 'firstLast'; render(); } }), ' Jacob Moreno'),
      el('label', { class: 'rowline' }, el('input', { type: 'radio', name: 'ord', checked: p.order === 'lastFirst', onchange: () => { p.order = 'lastFirst'; render(); } }), ' Moreno Jacob'),
      el('p', { class: 'muted pii', style: 'margin:8px 0 0;font-size:.85rem' }, 'Preview: ', prev)));
  }

  /* Two children who look the same on screen block the commit. Marks entered
     on the wrong child are invisible until a report card goes home, which is
     the worst possible moment to find out. */
  if (collisions.length) {
    box.append(el('div', { class: 'keepline warn' }, el('div', {},
      el('p', { style: 'margin:0 0 6px' }, el('b', {}, 'Two students would look the same on screen.')),
      el('p', { style: 'margin:0 0 6px' }, collisions.map((x) => x.name).join(', '),
        ', marks put on the wrong one are invisible until a report card goes home.'),
      el('p', { style: 'margin:0' }, 'Show full names, or add a middle initial to one of them after they are added.'),
      el('button', { class: 'btn ghost', style: 'margin-top:8px', onclick: async () => { book.nameDisplay = 'full'; await saveBook(); render(); } }, 'Show full names'))));
  }

  box.append(el('div', { class: 'rowline' },
    el('button', {
      class: 'btn primary', disabled: collisions.length ? true : null,
      onclick: async () => {
        const add = fresh.map((s) => ({ ...s, id: nextId('stu') }));
        const before = c.students.slice();
        c.students = c.students.concat(add);
        pushUndo(`adding ${add.length} students`, async () => { c.students = before; await saveClass(c); });
        await saveClass(c);
        pasteState = null; view = 'class'; say(`${add.length} students added.`); render();
      },
    }, `Add ${fresh.length} student${fresh.length === 1 ? '' : 's'}`),
    el('button', { class: 'btn ghost', onclick: () => { pasteState = null; render(); } }, 'Start over')));
  return box;
}

function rosterList(c) {
  const box = el('div', { style: 'margin-top:24px' });
  box.append(el('h3', {}, `${c.students.length} student${c.students.length === 1 ? '' : 's'}`));
  const ul = el('div', { class: 'stack' });
  for (const s of c.students) {
    ul.append(el('div', { class: 'rowline' },
      el('span', { class: 'pii' }, displayName(s, book.nameDisplay)),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn ghost noprint', onclick: async () => {
          const before = c.students.slice();
          c.students = c.students.filter((x) => x.id !== s.id);
          pushUndo('removing that student', async () => { c.students = before; await saveClass(c); });
          await saveClass(c); render();
        },
      }, 'Remove')));
  }
  box.append(ul);
  return box;
}

/* ── settings ───────────────────────────────────────────────────────────── */
function vSetup(m) {
  classHeader(m);
  const c = cur;
  const box = el('div', { class: 'stack' });

  box.append(el('label', {}, 'Class name',
    el('input', { type: 'text', value: c.name, onchange: async (e) => { c.name = e.target.value.trim() || c.name; await saveClass(c); render(); } })));
  box.append(el('label', {}, 'Period',
    el('input', { type: 'number', min: '0', value: c.period ?? '', onchange: async (e) => { c.period = e.target.value === '' ? null : Number(e.target.value); await saveClass(c); } })));

  box.append(el('fieldset', {}, el('legend', {}, 'How the grade is worked out'),
    el('label', { class: 'rowline' }, el('input', { type: 'radio', name: 'model', checked: c.model === 'total-points', onchange: async () => { c.model = 'total-points'; await saveClass(c); render(); } }), ' Add up all the points'),
    el('label', { class: 'rowline' }, el('input', { type: 'radio', name: 'model', checked: c.model === 'weighted-categories', onchange: async () => { c.model = 'weighted-categories'; if (!c.categories.length) c.categories = [{ id: nextId('cat'), name: 'Classwork', weight: 100, dropLowest: 0 }]; await saveClass(c); render(); } }), ' Weighted categories')));

  if (c.model === 'weighted-categories') {
    const total = c.categories.reduce((n, x) => n + Number(x.weight || 0), 0);
    const cats = el('div', { class: 'stack' });
    for (const cat of c.categories) {
      cats.append(el('div', { class: 'rowline' },
        el('input', { type: 'text', value: cat.name, 'aria-label': 'Category name', onchange: async (e) => { cat.name = e.target.value; await saveClass(c); render(); } }),
        el('input', { type: 'number', min: '0', max: '100', value: cat.weight, 'aria-label': `Weight for ${cat.name}`, style: 'width:6rem', onchange: async (e) => { cat.weight = Number(e.target.value); await saveClass(c); render(); } }), '%',
        el('button', { class: 'btn ghost', onclick: async () => { c.categories = c.categories.filter((x) => x.id !== cat.id); await saveClass(c); render(); } }, 'Remove')));
    }
    cats.append(el('button', { class: 'btn ghost', onclick: async () => { c.categories.push({ id: nextId('cat'), name: 'New category', weight: 0, dropLowest: 0 }); await saveClass(c); render(); } }, 'Add a category'));
    /* Hard gate: weights that do not total 100 silently change every grade. */
    cats.append(el('p', { class: total === 100 ? 'muted' : 'err' }, `Weights total ${total}%.`,
      total === 100 ? '' : ' They must add up to 100 before these grades mean anything.'));
    box.append(el('fieldset', {}, el('legend', {}, 'Categories'), cats));
  } else {
    box.append(el('label', {}, 'Drop this many lowest scores',
      el('input', { type: 'number', min: '0', value: c.dropLowest || 0, onchange: async (e) => { c.dropLowest = Math.max(0, Number(e.target.value) || 0); await saveClass(c); render(); } }),
      el('span', { class: 'muted', style: 'display:block;font-size:.85rem' },
        'Grade Sheet drops whichever scores leave the student best off, not simply the smallest number.')));
  }

  box.append(el('fieldset', {}, el('legend', {}, 'Show grades as'),
    ...[0, 1, 2].map((dp) => el('label', { class: 'rowline' },
      el('input', { type: 'radio', name: 'dp', checked: c.dp === dp, onchange: async () => { c.dp = dp; await saveClass(c); render(); } }),
      ' ', ['90', '89.7', '89.72'][dp])),
    el('p', { class: 'muted', style: 'font-size:.85rem' },
      'This also decides borderline letters. At whole numbers 89.5 shows as 90 and earns an A. At one decimal it stays 89.5 and earns a B. If you round up to the next letter, change the cutoff instead, that is exact, and it is what you will tell a parent.')));

  const scaleSel = el('select', {
    'aria-label': 'Letter scale',
    onchange: async (e) => { c.scale = JSON.parse(JSON.stringify(SCALES[e.target.value] || SCALES.tenPoint)); await saveClass(c); render(); },
  });
  for (const [k, label] of [['tenPoint', 'A B C D F'], ['plusMinus', 'A+ A A− B+ …'], ['roundedUp', 'A at 89.5'], ['esn', 'E S N U'], ['levels4', '4 3 2 1'], ['passFail', 'Pass / Fail'], ['none', 'Percentage only']]) {
    scaleSel.append(el('option', { value: k, selected: JSON.stringify(SCALES[k]) === JSON.stringify(c.scale) }, label));
  }
  const errs = validateScale(c.scale, c.dp);
  box.append(el('fieldset', {}, el('legend', {}, 'Letter scale'), scaleSel,
    el('p', { class: 'muted', style: 'font-size:.85rem' },
      c.scale.length ? c.scale.map((b) => `${b.label} from ${b.min}`).join(' · ') : 'No letters, percentages only.'),
    errs.length ? el('p', { class: 'err' }, errs[0].msg) : ''));

  box.append(el('button', {
    class: 'btn ghost', style: 'justify-self:start', onclick: async () => {
      if (!confirm(`Delete “${c.name}” and every mark in it? This cannot be undone.`)) return;
      await S.delClass(c.id);
      book.classIndex = book.classIndex.filter((x) => x.id !== c.id);
      await saveBook(); cur = null; view = 'classes'; render();
    },
  }, 'Delete this class'));

  m.append(box);
}

/* ── backup and privacy ─────────────────────────────────────────────────── */
function download(name, text, type) {
  const b = new Blob([text], { type });
  const u = URL.createObjectURL(b);
  const a = el('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

async function exportBackup() {
  const classes = await S.allClasses();
  const iso = now();
  download(S.backupName(iso, 'json'), JSON.stringify(S.serialize(book, classes, iso), null, 2), 'application/json');
  download(S.backupName(iso, 'csv'), S.toCSV(classes), 'text/csv');
  book.lastBackupAt = iso;
  await saveBook();
  say('Backup saved to your Downloads folder.');
  render();
}

function vBackup(m) {
  m.append(el('h2', {}, 'Backup and privacy'));

  m.append(el('div', { class: 'stack' },
    el('p', {}, el('b', {}, 'Your grades live in this browser, and a school computer can be set to erase that when you sign out. Export a backup file every week.')),
    el('div', { class: 'rowline' },
      el('button', { class: 'btn primary', onclick: exportBackup }, 'Export a backup'),
      el('label', { class: 'btn ghost', style: 'cursor:pointer' }, 'Restore from a file',
        el('input', {
          type: 'file', accept: '.json,application/json', style: 'display:none',
          onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            try {
              const data = JSON.parse(await f.text());
              const { book: b, classes } = S.deserialize(data);
              if (!confirm(`This file was saved on ${new Date(data.exportedAt).toLocaleDateString()} and holds ${classes.length} classes and ${classes.reduce((n, c) => n + c.students.length, 0)} students.\n\nRestoring replaces everything currently on this device.`)) return;
              await S.wipe();
              for (const c of classes) await S.putClass(c);
              book = b; await saveBook();
              cur = null; view = 'today'; say('Restored.'); render();
            } catch (err) { alert(err.message || 'That file could not be read.'); }
          },
        }))),
  ));

  /* The screen she shows her principal. Every sentence here has to survive
     being read aloud in a conference room, so it states mechanism and stops, no compliance claims, no reassurance we cannot back. */
  m.append(el('section', { style: 'margin-top:28px' },
    el('h3', {}, 'What Grade Sheet holds, and where'),
    el('p', {}, 'Everything you type, class names, student names, assignments and marks, is stored by this browser, on this computer, in a database called ', el('code', {}, 'sws-gradesheet'), '. Nowhere else.'),
    el('p', {}, el('b', {}, 'What leaves this device:'), ' nothing. There is no network code in this app. No upload, no analytics, no fonts fetched from anywhere, no update check. The only copy that exists elsewhere is the backup file you save yourself.'),
    el('p', {}, el('b', {}, 'How to check that, in thirty seconds:'), ' turn off the Wi-Fi, reload the page, and keep working. Everything still works, because the whole app is cached on your device. An app that runs with the network off is an app that cannot be sending your grades anywhere.'),
    el('p', {}, el('b', {}, 'What this app is not:'), ' it is your working gradebook. Your school’s student information system is still the official record, and if our number and theirs disagree, theirs wins.'),
    el('p', {}, el('b', {}, 'What it does not do:'), ' it does not lock your grades behind a password. Anyone who can use this computer while you are signed in can read them. Lock your computer, that is the control your school already relies on.'),
    el('p', {}, 'Before you type real student names into this, or into anything else, check your school’s policy on classroom software.'),
    el('div', { class: 'rowline', style: 'margin-top:16px' },
      el('button', {
        class: 'btn ghost', onclick: async () => {
          if (!confirm('Delete every class, student and mark on this device?\n\nThis cannot be undone. We could not recover it for you even if you asked, because we never had it.')) return;
          await S.wipe(); book = S.newBook(now()); cur = null; view = 'today'; render();
        },
      }, 'Delete everything on this device')),
  ));

  m.append(el('section', { style: 'margin-top:28px' },
    el('h3', {}, 'Hiding names'),
    el('p', {}, 'Press ', el('b', {}, 'Escape'), ' at any time to blank every name on screen, and again to bring them back. Useful when the board is mirrored.'),
    el('fieldset', {}, el('legend', {}, 'Show students as'),
      ...[['firstLast1', 'Jacob M.'], ['full', 'Jacob Moreno'], ['initials', 'JM']].map(([v, label]) =>
        el('label', { class: 'rowline' },
          el('input', { type: 'radio', name: 'nd', checked: book.nameDisplay === v, onchange: async () => { book.nameDisplay = v; await saveBook(); render(); } }), ' ', label))),
    el('p', { class: 'muted', style: 'font-size:.85rem' }, 'You never have to type a full name. First name and last initial works everywhere in this app.'),
  ));
}
