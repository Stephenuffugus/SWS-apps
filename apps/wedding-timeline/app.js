// Wedding Day Timeline — time-sorted moments, elegant print, URL sharing.
import {
  readTime, fmtTime, sortEvents, encodeTimeline, decodeTimeline,
  normalizeState, uid, MAX_EVENTS,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/9B6aEYc9X5P95nvaud7EQ0d' };

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v === null || v === undefined ? '' : String(v);
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

/* ---------- talking to the user ----------
   The shared runtime carries the Undo affordance and the "Saved" flag; this
   app used to load it and never call it. */
const UI = () => (window.SWS || {});
let localTimer = null;
function toast(msg, opts) {
  const sws = UI();
  if (sws.toast) return sws.toast(msg, opts);
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(localTimer);
  localTimer = setTimeout(() => t.classList.remove('show'), (opts && opts.ms) || 2800);
}
function undoToast(msg, restoreFn) {
  const sws = UI();
  if (sws.undo) return sws.undo(msg, restoreFn);
  toast(msg);
}
/* A polite, visually hidden line. The toast carries confirmations a sighted
   user also needs; this carries the thing only a screen-reader user misses —
   where in the sorted day the moment actually landed. */
let sayTimer = null;
function say(msg) {
  const n = $('liveStatus');
  if (!n) return;
  n.textContent = '';
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { n.textContent = msg; }, 60);
}

const KEY = 'wedding-timeline';
let state = normalizeState(null);
let editingId = null;

/* ---------- persistence ---------- */
function load() {
  try {
    state = normalizeState(JSON.parse(localStorage.getItem(KEY)));
  } catch (e) { state = normalizeState(null); }
}
let savedTimer = null;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { const s = UI(); if (s.saved) s.saved({ text: 'Saved' }); }, 400);
}
/* A structural change to the schedule — the thing the version stamp counts. */
function commit() {
  state.rev = (state.rev || 1) + 1;
  state.revisedAt = Date.now();
  persist();
  renderList();
}
const snapshot = () => JSON.stringify(state);
function restore(snap) {
  state = normalizeState(JSON.parse(snap));
  editingId = null;
  persist();
  syncFields();
  renderList();
  say('Change undone. ' + state.events.length + ' moments on the day.');
}

/* ---------- time fields ----------
   One resolver for all three places a time is typed (add, edit, the ceremony
   template). It never guesses across the am/pm line: a bare "7" asks. */
function clearTimeIssue(ui) {
  ui.warn.textContent = '';
  ui.warn.classList.add('hidden');
  ui.choose.replaceChildren();
  ui.choose.classList.add('hidden');
  ui.input.removeAttribute('aria-invalid');
  ui.input.setAttribute('aria-describedby', ui.describedBy || '');
  if (!ui.describedBy) ui.input.removeAttribute('aria-describedby');
}
function showTimeWarn(ui, msg) {
  ui.warn.textContent = msg;
  ui.warn.classList.remove('hidden');
  ui.choose.replaceChildren();
  ui.choose.classList.add('hidden');
  ui.input.setAttribute('aria-invalid', 'true');
  ui.input.setAttribute('aria-describedby', ((ui.describedBy || '') + ' ' + ui.warn.id).trim());
  toast(msg, { assertive: true, ms: 6000 });
  ui.input.focus();
  ui.input.select();
}
function askAmPm(ui, r, done) {
  clearTimeIssue(ui);
  const raw = ui.input.value.trim();
  const pick = (mins) => el('button', {
    class: 'btn', type: 'button', text: fmtTime(mins),
    onclick: () => { ui.input.value = fmtTime(mins); clearTimeIssue(ui); done(mins); },
  });
  ui.choose.replaceChildren(
    el('p', { class: 'q', text: '“' + raw + '” — morning or evening?' }),
    pick(r.am), pick(r.pm));
  ui.choose.classList.remove('hidden');
  say('“' + raw + '” could be ' + fmtTime(r.am) + ' or ' + fmtTime(r.pm) + '. Choose one.');
  const first = ui.choose.querySelector('button');
  if (first) first.focus();
}
/* done(minutesOrNull) runs only once the time is unambiguous. */
function resolveTime(ui, done, opts) {
  const raw = ui.input.value.trim();
  if (!raw) {
    if (opts && opts.required) { showTimeWarn(ui, 'A time is needed here — try “4:00 pm” or “16:00”.'); return; }
    clearTimeIssue(ui); done(null); return;
  }
  const r = readTime(raw);
  if (!r) {
    showTimeWarn(ui, '“' + raw + '” isn’t a time we can read. Try “2:30 pm”, “14:30”, “noon” or “midnight”.');
    return;
  }
  if (r.ambiguous) { askAmPm(ui, r, done); return; }
  clearTimeIssue(ui);
  done(r.minutes);
}
const addUi = () => ({ input: $('evTime'), warn: $('timeWarn'), choose: $('timeChoose'), describedBy: 'timeHint' });
const tmplUi = () => ({ input: $('tmplTime'), warn: $('tmplWarn'), choose: $('tmplChoose'), describedBy: '' });

/* ---------- the list ---------- */
function timedCount() { return state.events.filter(e => e.minutes !== null).length; }

function viewRow(ev) {
  const at = ev.minutes === null ? ', no time set' : ' at ' + fmtTime(ev.minutes);
  return el('li', { 'data-id': ev.id },
    el('span', { class: 'time', text: ev.minutes === null ? '—' : fmtTime(ev.minutes) }),
    el('button', {
      class: 'grow rowedit', type: 'button', 'data-edit': ev.id,
      'aria-label': 'Edit ' + ev.what + at,
      onclick: () => { editingId = ev.id; renderList(); },
    },
      el('span', { text: ev.what }),
      ev.who ? el('span', { class: 'sub', text: ev.who }) : null),
    el('span', { class: 'rowacts' },
      el('button', {
        class: 'btn rowbtn danger', type: 'button',
        'aria-label': 'Remove ' + ev.what + at,
        onclick: () => removeEvent(ev.id),
      }, el('span', { 'aria-hidden': 'true', text: '✕' }))));
}

function editRow(ev) {
  const time = el('input', {
    type: 'text', maxlength: '10', id: 'editTime', 'aria-label': 'Time',
    placeholder: '2:30 pm', value: ev.minutes === null ? '' : fmtTime(ev.minutes),
  });
  const what = el('input', { type: 'text', maxlength: '120', id: 'editWhat', 'aria-label': 'What', value: ev.what });
  const who = el('input', { type: 'text', maxlength: '80', id: 'editWho', 'aria-label': 'Who or where', value: ev.who });
  const warn = el('p', { class: 'warn hidden', id: 'editWarn' });
  const choose = el('div', { class: 'ampm hidden', id: 'editChoose', role: 'group', 'aria-label': 'Morning or evening?' });
  const ui = { input: time, warn, choose, describedBy: '' };

  const cancel = () => { editingId = null; renderList(); focusRow(ev.id); };
  const commitEdit = () => {
    const text = what.value.trim();
    if (!text) { toast('A moment needs a description', { assertive: true }); what.focus(); return; }
    resolveTime(ui, (minutes) => {
      const target = state.events.find(x => x.id === ev.id);
      if (!target) { editingId = null; renderList(); return; }
      target.minutes = minutes;
      target.what = text.slice(0, 120);
      target.who = who.value.trim().slice(0, 80);
      editingId = null;
      commit();
      const sorted = sortEvents(state.events);
      const pos = sorted.findIndex(x => x.id === ev.id) + 1;
      say('Saved. ' + target.what + (minutes === null ? ', no time' : ' at ' + fmtTime(minutes))
        + ' — ' + pos + ' of ' + sorted.length + '.');
      focusRow(ev.id);
    });
  };
  const keys = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };
  for (const f of [time, what, who]) f.addEventListener('keydown', keys);

  return el('li', { class: 'editing', 'data-id': ev.id },
    el('p', { class: 'editlabel', text: 'Editing “' + ev.what + '”' }),
    el('div', { class: 'row' },
      el('label', { class: 'f f-time' }, el('span', { text: 'Time' }), time),
      el('label', { class: 'f' }, el('span', { text: 'What' }), what)),
    el('label', { class: 'f' }, el('span', { text: 'Who / where' }), who),
    warn, choose,
    el('div', { class: 'cluster' },
      el('button', { class: 'btn primary', type: 'button', text: 'Save changes', onclick: commitEdit }),
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: cancel })));
}

function focusRow(id) {
  const b = document.querySelector('#evList [data-edit="' + CSS.escape(id) + '"]');
  if (b) b.focus();
}

function renderList() {
  const list = $('evList');
  list.replaceChildren();
  const sorted = sortEvents(state.events);
  let editingNode = null;
  sorted.forEach((ev, i) => {
    const row = ev.id === editingId ? editRow(ev) : viewRow(ev);
    if (ev.id === editingId) editingNode = row;
    list.append(row);
  });
  $('emptyBox').classList.toggle('hidden', sorted.length > 0);
  $('listHint').classList.toggle('hidden', sorted.length === 0);
  $('shiftBox').classList.toggle('hidden', timedCount() < 2);
  refreshShiftOptions(sorted);
  if (editingNode) {
    const f = editingNode.querySelector('input');
    if (f) f.focus();
  }
}

function removeEvent(id) {
  const ev = state.events.find(x => x.id === id);
  if (!ev) return;
  const before = snapshot();
  state.events = state.events.filter(x => x.id !== id);
  if (editingId === id) editingId = null;
  $('dupWarn').textContent = '';
  $('dupWarn').classList.add('hidden');
  commit();
  say('Removed ' + ev.what + '. ' + state.events.length + ' moments left.');
  undoToast('Removed “' + ev.what + '”', () => restore(before));
}

/* ---------- shifting the day ----------
   The one thing that always happens on a wedding day, and the app had no verb
   for it: the stylist runs 25 minutes late and eleven rows have to move. */
function refreshShiftOptions(sorted) {
  const sel = $('shiftFrom');
  const keep = sel.value;
  sel.replaceChildren(el('option', { value: '', text: 'the whole day' }));
  for (const ev of sorted) {
    if (ev.minutes === null) continue;
    sel.append(el('option', {
      value: String(ev.minutes),
      text: fmtTime(ev.minutes) + ' — ' + ev.what.slice(0, 40) + ' and everything after',
    }));
  }
  if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
}
function applyShift(dir) {
  const raw = Math.round(Number($('shiftBy').value));
  if (!Number.isFinite(raw) || raw <= 0) { toast('How many minutes?', { assertive: true }); $('shiftBy').focus(); return; }
  const by = Math.min(raw, 720) * dir;
  const fromVal = $('shiftFrom').value;
  const from = fromVal === '' ? -1 : Number(fromVal);
  const moving = state.events.filter(e => e.minutes !== null && e.minutes >= from);
  if (!moving.length) { toast('Nothing to move from there'); return; }
  const before = snapshot();
  let clamped = 0;
  for (const e of moving) {
    const want = e.minutes + by;
    const got = Math.max(0, Math.min(1439, want));
    if (got !== want) clamped++;
    e.minutes = got;
  }
  commit();
  let msg = 'Moved ' + moving.length + ' moment' + (moving.length === 1 ? '' : 's')
    + ' ' + Math.abs(by) + ' min ' + (dir > 0 ? 'later' : 'earlier');
  if (clamped) msg += ' (' + clamped + ' stopped at 11:59 PM)';
  say(msg + '.');
  undoToast(msg, () => restore(before));
}

/* ---------- the starting day ----------
   Rules of thumb straight out of the research: bride second-to-last for
   hair and makeup, a first look buys back 45–60 minutes of portraits after
   the ceremony, 15 minutes of slack between services. Every row is editable. */
function templateRows(opts) {
  const r = [
    [-330, 'Hair & makeup begins', 'Bridal suite — the party first, the bride second-to-last'],
    [-180, 'Photographer arrives — detail shots', 'Dress, rings, invitations, shoes'],
    [-150, 'Bride’s hair & makeup', 'Bridal suite'],
  ];
  if (opts.firstLook) {
    r.push([-135, 'Into the dress', 'With mum and the maid of honour']);
    r.push([-105, 'First look', 'Somewhere quiet — just the two of you']);
    r.push([-85, 'Couple’s portraits', 'Photographer + videographer']);
    r.push([-55, 'Wedding party portraits', 'Everyone in the party']);
  } else {
    r.push([-105, 'Into the dress', 'With mum and the maid of honour']);
    r.push([-70, 'Wedding party portraits — each side separately', 'Photographer']);
  }
  if (opts.twoVenues) r.push([-45, 'Travel to the ceremony', 'Cars booked — leave 10 minutes of slack']);
  r.push([-30, 'Guests begin arriving', 'Ushers at the door, music on']);
  r.push([-10, 'Wedding party lines up', 'Out of sight of the aisle']);
  r.push([0, 'Ceremony begins', '']);
  r.push([30, 'Ceremony ends — confetti', 'Everyone outside']);
  r.push([40, 'Family photos', 'Shot list in somebody’s hand — 15 minutes, no more']);
  r.push([60, 'Cocktail hour', 'Canapés and drinks']);
  if (!opts.firstLook) r.push([70, 'Couple’s portraits', 'Photographer — golden hour if it lands']);
  if (opts.twoVenues) r.push([85, 'Travel to the reception', '']);
  r.push([115, 'Guests seated for dinner', 'Coordinator sweeps the bar']);
  r.push([125, 'Entrances and the first dance', 'DJ has the track']);
  r.push([135, 'Dinner served', 'Caterer']);
  r.push([195, 'Toasts', 'Best man, maid of honour, father of the bride']);
  r.push([225, 'Cake cutting', 'Photographer needed']);
  r.push([240, 'Dancing opens', 'DJ']);
  r.push([390, 'Last dance', '']);
  r.push([400, 'Sparkler exit', 'Somebody with a lighter and a plan']);
  return r;
}
function buildTemplate(ceremony) {
  const opts = { firstLook: $('tmplFirstLook').checked, twoVenues: $('tmplTwoVenues').checked };
  const before = snapshot();
  const rows = templateRows(opts);
  state.events = rows.slice(0, MAX_EVENTS).map(([off, what, who]) => ({
    id: uid(), minutes: Math.max(0, Math.min(1439, ceremony + off)), what, who,
  }));
  editingId = null;
  commit();
  const msg = state.events.length + ' moments laid out from a ' + fmtTime(ceremony) + ' ceremony';
  say(msg + '. Tap any moment to change it.');
  undoToast(msg, () => restore(before));
}

/* ---------- the printed sheet ---------- */
function fmtStamp(ms) {
  if (!Number.isFinite(ms)) return 'just now';
  try {
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
  } catch (e) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
}
function fmtClock(ms) {
  try { return new Date(ms).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  catch (e) { return new Date(ms).toISOString().slice(11, 16); }
}
/* Which copy is this? The research's sixth complaint is that after a late
   change everybody is holding a different sheet and nobody can tell. */
function printStamp() {
  const now = Date.now();
  const sameDay = Number.isFinite(state.revisedAt)
    && new Date(state.revisedAt).toDateString() === new Date(now).toDateString();
  return 'Version ' + (state.rev || 1) + ' · revised ' + fmtStamp(state.revisedAt)
    + ' · printed ' + (sameDay ? fmtClock(now) : fmtStamp(now));
}
function renderSheet() {
  const sheet = $('sheet');
  sheet.replaceChildren();
  const name = state.title || 'The Wedding Day';
  const stamp = printStamp();
  const rows = sortEvents(state.events);

  sheet.append(el('div', { class: 'head' },
    el('h1', {}, name),
    state.date ? el('div', { class: 'date', text: state.date }) : null,
    el('div', { class: 'rule' })));

  sheet.append(el('table', { class: 'sheet-t' },
    el('thead', {}, el('tr', {}, el('th', { colspan: '2' },
      el('div', { class: 'run' },
        el('span', { class: 'run-n', text: name }),
        state.date ? el('span', { class: 'run-d', text: state.date }) : null,
        el('span', { class: 'run-v', text: stamp }))))),
    el('tbody', {}, rows.map(ev => el('tr', { class: 'ev' },
      el('td', { class: 't', text: ev.minutes === null ? '—' : fmtTime(ev.minutes) }),
      el('td', { class: 'w' },
        el('div', { text: ev.what }),
        ev.who ? el('div', { class: 'who', text: ev.who }) : null))))));

  sheet.append(el('div', { class: 'foot' },
    'Breathe. Everything else is somebody else’s job today.',
    el('br'),
    el('span', { class: 'promise', text: 'Built offline in a browser — this timeline was never uploaded anywhere.' })));
}

/* ---------- sharing ---------- */
function shareUrl() {
  const base = location.origin === 'null'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
  return base + '#' + encodeTimeline(state);
}
function drawQr(url) {
  const canvas = $('qrCanvas'), note = $('qrNote');
  let qr = null;
  /* 'M' first for robustness; 'L' holds ~25% more so a fuller day still gets
     a code. Past that the payload genuinely does not fit in any QR version. */
  for (const level of ['M', 'L']) {
    try {
      const q = qrcode(0, level);
      q.addData(url); q.make();
      qr = q; break;
    } catch (e) { /* try the next level */ }
  }
  if (!qr) {
    canvas.classList.add('hidden');
    canvas.setAttribute('aria-label', 'No QR code — this timeline is too long to fit in one');
    note.textContent = 'This day is too full for a QR code — ' + state.events.length
      + ' moments make a link longer than any code can hold. Copy the link below instead; it still works.';
    note.classList.remove('hidden');
    return;
  }
  const count = qr.getModuleCount();
  const quiet = 4;
  /* Sized from the module count, not pinned at 300px. The old maths gave one
     device pixel per module from 12 moments up, which no camera can read. */
  const cell = Math.max(3, Math.floor(640 / (count + quiet * 2)));
  const size = cell * (count + quiet * 2);
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
    if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
  canvas.classList.remove('hidden');
  canvas.setAttribute('aria-label',
    'QR code for this timeline’s link, ' + count + ' by ' + count + ' squares');
  if (count > 100) {
    note.textContent = 'A full day makes a dense code — hold the camera close and steady, '
      + 'and give it a second. If it will not read, copy the link below instead.';
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }
}
function openShare(reason) {
  if (state.events.length === 0) { toast('Add the day’s moments first', { assertive: true }); return; }
  const url = shareUrl();
  $('qrLink').value = url;
  drawQr(url);
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  if (reason) toast(reason, { ms: 5000 });
}
function closeShare() {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
}
async function copyLink() {
  if (state.events.length === 0) { toast('Add the day’s moments first', { assertive: true }); return; }
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied — send it to the whole wedding party');
  } catch (e) {
    openShare('Clipboard blocked here — the link is below, ready to copy by hand.');
  }
}

/* ---------- backup ---------- */
function backupName() {
  const slug = state.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return (slug ? slug + '-timeline' : 'wedding-timeline') + '.json';
}
function saveBackup() {
  if (state.events.length === 0) { toast('Add the day’s moments first', { assertive: true }); return; }
  try {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = el('a', { href, download: backupName() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 8000);
    toast('Backup saved to your downloads');
  } catch (e) { toast('Could not write the backup file', { assertive: true }); }
}
async function openBackup(file) {
  try {
    const next = normalizeState(JSON.parse(await file.text()));
    if (!next.events.length) { toast('That file has no moments in it', { assertive: true }); return; }
    const before = snapshot();
    state = next;
    editingId = null;
    persist();
    syncFields();
    renderList();
    const msg = 'Opened ' + next.events.length + ' moments from the backup';
    say(msg + '.');
    undoToast(msg, () => restore(before));
  } catch (e) {
    toast('That file isn’t a timeline backup', { assertive: true });
  }
}

/* ---------- adding ---------- */
function finishAdd(minutes) {
  const what = $('evWhat').value.trim();
  if (!what) { toast('What’s happening at that time?', { assertive: true }); $('evWhat').focus(); return; }
  const ev = {
    id: uid(), minutes,
    what: what.slice(0, 120),
    who: $('evWho').value.trim().slice(0, 80),
  };
  const dup = state.events.find(x => x.minutes === ev.minutes
    && x.what.trim().toLowerCase() === ev.what.trim().toLowerCase());
  state.events.push(ev);
  $('evTime').value = ''; $('evWhat').value = ''; $('evWho').value = '';
  commit();
  const sorted = sortEvents(state.events);
  const pos = sorted.findIndex(x => x.id === ev.id) + 1;
  const when = minutes === null ? 'with no time yet' : 'at ' + fmtTime(minutes);
  const note = $('dupWarn');
  const dupMsg = dup
    ? '“' + ev.what + '” is now on the day twice'
      + (minutes === null ? '' : ' at ' + fmtTime(minutes)) + '. Remove one if that was a slip.'
    : '';
  say('Added ' + ev.what + ' ' + when + ' — ' + pos + ' of ' + sorted.length + '. ' + dupMsg);
  if (dup) {
    note.textContent = dupMsg;
    note.classList.remove('hidden');
  } else {
    note.textContent = '';
    note.classList.add('hidden');
  }
  $('evTime').focus();
}
function add() {
  if (!$('evWhat').value.trim()) {
    toast('What’s happening at that time?', { assertive: true });
    $('evWhat').focus();
    return;
  }
  if (state.events.length >= MAX_EVENTS) { toast('That’s a very full day — 100 moments max'); return; }
  resolveTime(addUi(), finishAdd);
}

/* ---------- wiring ---------- */
function syncFields() {
  $('titleInput').value = state.title;
  $('dateInput').value = state.date;
  const note = $('originNote');
  if (state.sharedAt) {
    note.textContent = 'This day was opened from a shared link on ' + fmtStamp(state.sharedAt)
      + ' — it is a snapshot, version ' + (state.rev || 1)
      + '. Anything you change here stays on this device and does not reach whoever sent it.';
    note.classList.remove('hidden');
  } else {
    note.textContent = '';
    note.classList.add('hidden');
  }
}

function wire() {
  // Ctrl/Cmd+P must print the current timeline, not a blank/stale sheet
  window.addEventListener('beforeprint', renderSheet);
  $('titleInput').addEventListener('input', (ev) => { state.title = ev.target.value.slice(0, 80); state.revisedAt = Date.now(); persist(); });
  $('dateInput').addEventListener('input', (ev) => { state.date = ev.target.value.slice(0, 40); state.revisedAt = Date.now(); persist(); });

  $('addEv').addEventListener('click', add);
  for (const id of ['evTime', 'evWhat', 'evWho']) {
    $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
  }
  $('evTime').addEventListener('input', () => {
    const ui = addUi();
    if (!ui.warn.classList.contains('hidden') || !ui.choose.classList.contains('hidden')) clearTimeIssue(ui);
  });

  $('tmplGo').addEventListener('click', () => resolveTime(tmplUi(), buildTemplate, { required: true }));
  $('tmplTime').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); resolveTime(tmplUi(), buildTemplate, { required: true }); }
  });

  $('shiftLater').addEventListener('click', () => applyShift(1));
  $('shiftEarlier').addEventListener('click', () => applyShift(-1));

  $('printBtn').addEventListener('click', () => {
    if (state.events.length === 0) { toast('Add the day’s moments first', { assertive: true }); return; }
    renderSheet();
    window.print();
  });
  $('shareBtn').addEventListener('click', copyLink);
  $('qrBtn').addEventListener('click', () => openShare());
  $('qrClose').addEventListener('click', closeShare);
  $('qrCopy').addEventListener('click', async () => {
    const box = $('qrLink');
    try {
      await navigator.clipboard.writeText(box.value);
      toast('Link copied — send it to the whole wedding party');
    } catch (e) {
      box.focus(); box.select();
      toast('Clipboard blocked — the link is selected, copy it by hand', { assertive: true });
    }
  });

  $('backupBtn').addEventListener('click', saveBackup);
  $('restoreBtn').addEventListener('click', () => $('restoreInput').click());
  $('restoreInput').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) openBackup(f);
    ev.target.value = '';
  });
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  const shared = decodeTimeline(location.hash);
  if (shared && shared.events.length) {
    // never silently destroy the user's own timeline to honour a tapped link
    const hasOwn = state.events.length > 0;
    if (!hasOwn || confirm('Open the shared timeline “' + (shared.title || 'Untitled') + '”? Your current timeline ('
        + state.events.length + ' moments) will be replaced.')) {
      state = shared;
      state.sharedAt = Date.now();
      persist();
      // only now is the payload spent; declining used to strip it anyway and
      // left the cautious answer with no link and no way back
      history.replaceState(null, '', location.pathname);
      toast('Timeline loaded from the link');
    } else {
      toast('Kept your own timeline — the link is still in the address bar.', { ms: 6000 });
    }
  } else if (shared) {
    history.replaceState(null, '', location.pathname);
  }
  syncFields();
  renderList();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
