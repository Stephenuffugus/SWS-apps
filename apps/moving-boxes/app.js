// Moving Boxes — numbered boxes, searchable contents, printable QR labels.
// Scanning a label opens this app with the box encoded in the URL hash.
import {
  LIMITS, newId, nextBoxNumber, parseBoxNumber, parseItemsDetailed, searchBoxes,
  sanitizeBoxes, mergeBoxes, boxesToCsv, decodeBox, isBoxHash, encodeBoxForLabel,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/7sYaEY5Lz7Xh2bj6dX7EQ0k' };

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

/* SWS.toast owns the toast now — it is the only one that can carry an Undo
   button, and undo is the answer to every destructive action in this app. */
const toast = (msg, ms) => window.SWS.toast(msg, { ms });
const undoToast = (msg, fn) => window.SWS.undo(msg, fn);

const KEY = 'moving-boxes';
const OPTS_KEY = 'moving-boxes-opts';
let boxes = [];
let editingBoxId = null;   // ✎ edits in place — the box is never deleted first
let saveWarned = 0;
let pendingImport = null;  // boxes parsed from a file, waiting for merge/replace
let opts = { labelContents: false };

/* ── storage ───────────────────────────────────────────────────────────── */

/* Anything we cannot read is moved aside rather than overwritten by the next
   save, so "we couldn't read it" never quietly becomes "we deleted it". */
function stash(text) {
  try { localStorage.setItem(KEY + '-unreadable', String(text).slice(0, 500000)); }
  catch (e) {}
}

function load() {
  let text = null;
  try { text = localStorage.getItem(KEY); } catch (e) { return; }
  if (text === null || text === undefined || text === '') return;

  let raw;
  try { raw = JSON.parse(text); }
  catch (e) {
    stash(text);
    toast('Your saved list is damaged and can’t be read. It has been set aside, not deleted — import a backup to carry on.', 10000);
    return;
  }
  if (raw === null || raw === undefined) return;

  // Never trust what came back. One malformed record used to throw inside
  // renderBoxes and take every good box off the screen with it.
  const r = sanitizeBoxes(raw);
  boxes = r.boxes;
  if (r.unusable) {
    stash(text);
    toast('Your saved list is damaged and can’t be read. It has been set aside, not deleted — import a backup to carry on.', 10000);
    return;
  }
  const notes = [];
  if (r.skipped) notes.push(plural(r.skipped, 'damaged box', 'damaged boxes') + (r.skipped === 1 ? ' was' : ' were') + ' skipped');
  if (r.repaired) notes.push(plural(r.repaired, 'box', 'boxes') + (r.repaired === 1 ? ' was' : ' were') + ' repaired');
  if (r.overflow) notes.push(plural(r.overflow, 'box', 'boxes') + ' past the ' + LIMITS.boxes + '-box limit ' + (r.overflow === 1 ? 'was' : 'were') + ' dropped');
  if (notes.length) toast('Opened ' + plural(boxes.length, 'box', 'boxes') + ' — ' + notes.join(', ') + '.', 8000);
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(boxes)); }
  catch (e) {
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      toast('⚠ Couldn’t save — storage may be full. Export a backup!', 7000);
    }
  }
}

function loadOpts() {
  try {
    const o = JSON.parse(localStorage.getItem(OPTS_KEY));
    if (o && typeof o === 'object') opts.labelContents = !!o.labelContents;
  } catch (e) {}
}
function saveOpts() {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch (e) {}
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/** A deep-enough copy to restore from. A snapshot cannot forget a side effect
    the way a hand-written inverse can. */
const snapshot = () => boxes.map(b => ({ ...b, items: [...b.items] }));
function restore(snap) {
  boxes = snap;
  save();
  renderAll();
  toast('Put back — ' + plural(boxes.length, 'box', 'boxes'));
}

function renderAll() {
  renderBoxes();
  renderRoomList();
  renderSearch();
}

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

/* ── the box list ──────────────────────────────────────────────────────── */

function renderRoomList() {
  const dl = $('roomList');
  dl.replaceChildren();
  for (const room of [...new Set(boxes.map(b => b.room).filter(Boolean))])
    dl.append(el('option', { value: room }));
}

function beginEdit(b) {
  editingBoxId = b.id;
  $('boxNum').value = String(b.n);
  $('boxRoom').value = b.room;
  $('boxItems').value = b.items.join('\n');
  $('addBox').textContent = 'Update box #' + b.n + ' 📦';
  $('packHead').textContent = 'Editing box #' + b.n;
  $('cancelEdit').hidden = false;
  $('cancelEdit').textContent = 'Cancel — leave box #' + b.n + ' alone';
  $('packCard').classList.add('editing');
  $('boxItems').focus();
  toast('Editing box #' + b.n + ' — Cancel leaves it exactly as it is');
}

function endEdit(quiet) {
  editingBoxId = null;
  $('addBox').textContent = 'Seal the box 📦';
  $('packHead').textContent = 'Pack a box';
  $('cancelEdit').hidden = true;
  $('packCard').classList.remove('editing');
  $('boxNum').value = '';
  $('boxItems').value = '';
  if (!quiet) toast('Edit cancelled — nothing changed');
}

function deleteBox(b) {
  const snap = snapshot();
  boxes = boxes.filter(x => x.id !== b.id);
  if (editingBoxId === b.id) endEdit(true);
  save();
  renderAll();
  undoToast('Box #' + b.n + ' deleted' + (b.items.length ? ' with ' + plural(b.items.length, 'thing') + ' in it' : ''),
    () => restore(snap));
}

function renderBoxes() {
  const list = $('boxList');
  list.replaceChildren();
  $('emptyHint').classList.toggle('hidden', boxes.length > 0);
  const things = boxes.reduce((a, b) => a + b.items.length, 0);
  $('boxHead').textContent = boxes.length
    ? plural(boxes.length, 'box', 'boxes') + ' · ' + plural(things, 'thing')
    : 'Boxes';

  const dupes = new Set();
  const seen = new Set();
  for (const b of boxes) { if (seen.has(b.n)) dupes.add(b.n); seen.add(b.n); }

  for (const b of [...boxes].sort((x, y) => x.n - y.n)) {
    list.append(el('li', { id: 'box-' + b.id, tabindex: '-1' },
      el('span', { class: 'boxnum', text: '#' + b.n }),
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, b.room || 'Unlabeled room'),
          dupes.has(b.n) ? el('span', { class: 'dupe', title: 'More than one box has this number' }, ' ⚠ number used twice') : null),
        el('div', { class: 'sub', text: b.items.join(', ') || 'empty?' })),
      el('button', { class: 'btn small screenonly', type: 'button', 'aria-label': 'Edit box #' + b.n,
        onclick: () => beginEdit(b) }, '✎'),
      el('button', { class: 'btn small danger screenonly', type: 'button', 'aria-label': 'Delete box #' + b.n,
        onclick: () => deleteBox(b) }, '✕')));
  }
  $('boxNum').placeholder = String(nextBoxNumber(boxes));
}

/* ── search ────────────────────────────────────────────────────────────── */

const SEARCH_SHOWN = 20;

function revealBox(b) {
  const row = document.getElementById('box-' + b.id);
  if (!row) return;
  // 'auto' defers to CSS scroll-behavior, and the base already resolves the
  // comfort panel's Motion setting there (:root[data-motion="less"] and
  // prefers-reduced-motion both force it to auto). Hard-coding 'smooth' here
  // would step over that precedence.
  row.scrollIntoView({ block: 'center', behavior: 'auto' });
  for (const other of document.querySelectorAll('.found')) other.classList.remove('found');
  row.classList.add('found');
  row.focus({ preventScroll: true });
  setTimeout(() => row.classList.remove('found'), 4000);
}

function renderSearch() {
  const results = $('searchResults');
  const status = $('searchStatus');
  results.replaceChildren();
  const q = $('searchInput').value.trim();
  if (!q) { status.textContent = ''; return; }

  const hits = searchBoxes(boxes, q);
  if (hits.length === 0) {
    status.textContent = 'No box has “' + q + '” — check the spelling, or it may not be packed yet.';
    return;
  }
  const shown = hits.slice(0, SEARCH_SHOWN);
  status.textContent = hits.length === 1
    ? '1 box matches “' + q + '”.'
    : hits.length + ' boxes match “' + q + '”'
      + (hits.length > shown.length ? ' — showing the first ' + shown.length + '. Type more to narrow it down.' : '.');

  for (const { box, hitItems } of shown) {
    results.append(el('li', {},
      el('button', { class: 'btn plain hitrow', type: 'button',
        'aria-label': 'Show box #' + box.n + ' in the list',
        onclick: () => revealBox(box) },
        el('span', { class: 'boxnum', text: '#' + box.n }),
        el('span', { class: 'grow' },
          el('span', { class: 'hitroom' }, el('strong', {}, box.room || 'Unlabeled')),
          el('span', { class: 'sub hitsub' },
            hitItems.length
              ? ['Has: ', el('span', { class: 'hit', text: hitItems.join(', ') })]
              : box.items.slice(0, 5).join(', '))))));
  }
}

/* ── QR labels ─────────────────────────────────────────────────────────── */

/* Physical scannability, not character count.
 *
 * Measured on this app's own output at 300dpi: a 41-module code printed at
 * 0.62mm per module, 57 at 0.46mm and 101 at 0.278mm. 0.278mm is below any
 * practical phone-camera floor on cardboard in a garage. So the label now
 * guarantees a module pitch instead of a payload length: the printed square
 * grows with the code, and the payload is capped at the version that still
 * fits inside the largest square the 2-up sheet can hold. */
const MODULE_MM = 0.5;      // printed width of one QR module, the floor we hold
const QR_MIN_MM = 30;       // never smaller than the old label
const QR_MAX_MM = 46;       // largest square that still fits two labels per row
const QUIET = 4;            // quiet-zone modules per side
const MODULE_CAP = Math.floor(QR_MAX_MM / MODULE_MM) - QUIET * 2;   // 84
/* QR version 16 (81 modules) is the last one under MODULE_CAP; its 8-bit byte
   capacity at error-correction L is 586 bytes, so that is the URL budget. */
const URL_BYTES = 586;

const utf8Len = (s) => {
  try { return new TextEncoder().encode(s).length; }
  catch (e) { return unescape(encodeURIComponent(s)).length; }
};

function qrFor(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  return qr;
}

function qrCanvasUrl(qr) {
  const count = qr.getModuleCount();
  const cell = 4;
  const size = (count + QUIET * 2) * cell;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
    if (qr.isDark(r, c)) ctx.fillRect((c + QUIET) * cell, (r + QUIET) * cell, cell, cell);
  return canvas.toDataURL('image/png');
}

/** Build one label's QR. Returns { src, mm, modules, dropped } or null. */
function labelQr(box, base, total) {
  const prefix = base + '#';
  let budget = URL_BYTES;
  for (let attempt = 0; attempt < 6; attempt++) {
    const cap = budget;
    const fit = encodeBoxForLabel({ ...box, total },
      (enc) => utf8Len(prefix) + utf8Len(enc) <= cap);
    try {
      const qr = qrFor(prefix + fit.payload);
      const modules = qr.getModuleCount();
      if (modules > MODULE_CAP) { budget = Math.floor(budget * 0.8); continue; }
      const mm = Math.min(QR_MAX_MM, Math.max(QR_MIN_MM, (modules + QUIET * 2) * MODULE_MM));
      return { src: qrCanvasUrl(qr), mm, modules, dropped: fit.dropped };
    } catch (e) {
      budget = Math.floor(budget * 0.8);
    }
  }
  return null;
}

function renderLabels() {
  const wrap = $('labels');
  wrap.replaceChildren();
  const base = baseUrl();
  const total = boxes.length;
  const trimmed = [];
  let failed = 0;
  document.body.classList.toggle('label-contents', !!opts.labelContents);

  for (const b of [...boxes].sort((x, y) => x.n - y.n)) {
    const q = labelQr(b, base, total);
    if (!q) failed++;
    else if (q.dropped) trimmed.push(b.n);
    const qrNode = q
      ? el('img', { alt: 'QR label for box ' + b.n, src: q.src,
          style: 'width:' + q.mm + 'mm;height:' + q.mm + 'mm' })
      : el('div', { class: 'li', text: '(Too much to fit in one code — print the packing list too)' });
    wrap.append(el('div', { class: 'label' },
      el('div', { class: 'lt' },
        el('div', { class: 'ln', text: '#' + b.n }),
        el('div', { class: 'lr', text: b.room || 'Unlabeled room' }),
        el('div', { class: 'lc', text: 'Box ' + b.n + ' of ' + total + ' · scan to see inside' }),
        opts.labelContents
          ? el('div', { class: 'li', text: b.items.slice(0, 4).join(' · ') + (b.items.length > 4 ? ' …' : '') })
          : null),
      qrNode));
  }
  return { trimmed, failed };
}

function reportLabels(r) {
  const notes = [];
  if (r.trimmed.length) {
    const list = r.trimmed.slice(0, 6).join(', #');
    notes.push('QR contents trimmed on ' + r.trimmed.length
      + (r.trimmed.length === 1 ? ' label (#' : ' labels (#') + list
      + (r.trimmed.length > 6 ? ' …' : '') + ') — print the packing list for the full contents');
  }
  if (r.failed) notes.push(plural(r.failed, 'label') + ' could not fit a code at all');
  const note = $('labelNote');
  note.textContent = notes.join('. ');
  note.classList.toggle('hidden', notes.length === 0);
  if (notes.length) toast(notes.join('. '), 9000);
}

/* ── the packing list (the printed manifest) ───────────────────────────── */

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function renderManifest() {
  const head = $('manifestHead');
  head.replaceChildren();
  const rooms = new Map();
  for (const b of boxes) {
    const k = b.room || 'Unlabeled room';
    const r = rooms.get(k) || { boxes: 0, items: 0 };
    r.boxes++; r.items += b.items.length;
    rooms.set(k, r);
  }
  const things = boxes.reduce((a, b) => a + b.items.length, 0);
  head.append(
    el('h2', { class: 'mtitle', text: 'Packing list' }),
    el('p', { class: 'mmeta', text: 'Printed ' + today() + ' · ' + plural(boxes.length, 'box', 'boxes')
      + ' · ' + plural(things, 'thing') }),
    el('ul', { class: 'mrooms' },
      [...rooms.keys()].sort().map(k => el('li', { text: k + ' — '
        + plural(rooms.get(k).boxes, 'box', 'boxes') + ', ' + plural(rooms.get(k).items, 'thing') }))),
    el('p', { class: 'mmeta', text: 'Tick each number off as it comes off the van.' }));
}

function printMode(mode) {
  document.body.classList.remove('print-labels', 'print-manifest');
  document.body.classList.add(mode);
}

/* ── the scanned-label view ────────────────────────────────────────────── */

let scannedBox = null;

function showScanned(box) {
  scannedBox = box;
  $('app').classList.add('hidden');      // the packer's inventory is not for the scanner
  $('labels').classList.add('hidden');
  $('reveal').classList.remove('hidden');
  $('revNum').textContent = 'Box #' + box.n;
  $('revRoom').textContent = box.room || '';
  $('revCount').textContent = box.total
    ? 'Box ' + box.n + ' of ' + box.total + ' in this move'
    : '';
  const ul = $('revItems');
  ul.replaceChildren();
  for (const item of box.items) ul.append(el('li', {}, item));
  if (box.items.length === 0) ul.append(el('li', { class: 'sub' }, '(nothing listed)'));
  $('revOpen').href = baseUrl();
  document.title = 'Box #' + box.n + (box.room ? ' · ' + box.room : '') + ' — Moving Boxes';
}

function leaveScanned() {
  $('reveal').classList.add('hidden');
  $('labels').classList.remove('hidden');
  $('app').classList.remove('hidden');
  try { history.replaceState(null, '', baseUrl()); } catch (e) {}
  document.title = 'Moving Boxes — Free Box Inventory with QR Labels';
}

function saveScanned() {
  if (!scannedBox) return;
  load();
  loadOpts();
  const snap = snapshot();
  const r = mergeBoxes(boxes, [{ id: newId(), n: scannedBox.n, room: scannedBox.room, items: scannedBox.items }]);
  boxes = r.boxes;
  save();
  leaveScanned();
  $('labelContents').checked = opts.labelContents;
  document.body.classList.toggle('label-contents', !!opts.labelContents);
  renderAll();
  undoToast('Box #' + scannedBox.n + (r.updated ? ' updated in' : ' added to') + ' this device’s list',
    () => restore(snap));
}

/* ── wiring ────────────────────────────────────────────────────────────── */

function sealBox() {
  const parsed = parseItemsDetailed($('boxItems').value);
  const items = parsed.items;
  if (items.length === 0) { toast('List what’s inside first'); return; }

  const num = parseBoxNumber($('boxNum').value);
  if (num.error) {
    toast(num.error + ' Leave it blank and the next number is used.', 6000);
    $('boxNum').focus();
    return;
  }

  const caps = [];
  if (parsed.dropped) caps.push(LIMITS.itemsPerBox + ' things kept, ' + parsed.dropped + ' dropped (' + LIMITS.itemsPerBox + ' per box is the limit)');
  if (parsed.shortened) caps.push(plural(parsed.shortened, 'thing') + (parsed.shortened === 1 ? ' was' : ' were') + ' shortened to ' + LIMITS.itemChars + ' characters');

  const snap = snapshot();
  let msg;

  if (editingBoxId) {
    const b = boxes.find(x => x.id === editingBoxId);
    if (!b) { endEdit(true); toast('That box is gone — nothing was changed'); return; }
    b.n = num.n === null ? b.n : num.n;
    b.room = $('boxRoom').value.trim().slice(0, LIMITS.roomChars);
    b.items = items;
    endEdit(true);
    msg = 'Box #' + b.n + ' updated';
  } else {
    if (boxes.length >= LIMITS.boxes) {
      toast('That’s ' + LIMITS.boxes + ' boxes — the limit for one list. Export a backup and start a second list.', 9000);
      return;
    }
    const n = num.n === null ? nextBoxNumber(boxes) : num.n;
    const clash = boxes.some(b => b.n === n);
    boxes.push({ id: newId(), n, room: $('boxRoom').value.trim().slice(0, LIMITS.roomChars), items });
    msg = 'Box #' + n + ' sealed 📦'
      + (clash ? ' — heads up, another box is already #' + n : '')
      + (boxes.length === LIMITS.boxes ? ' — that is the ' + LIMITS.boxes + '-box limit' : '');
    $('boxNum').value = '';
    $('boxItems').value = '';
  }

  save();
  renderAll();
  $('boxItems').focus();
  undoToast(msg + (caps.length ? ' — ' + caps.join('; ') : ''), () => restore(snap));
}

function applyImport(mode) {
  if (!pendingImport) return;
  const inc = pendingImport;
  pendingImport = null;
  $('importAsk').classList.add('hidden');
  const snap = snapshot();
  let msg;
  if (mode === 'replace') {
    boxes = inc.boxes;
    msg = 'Replaced — was ' + plural(snap.length, 'box', 'boxes') + ', now ' + boxes.length;
  } else {
    const r = mergeBoxes(boxes, inc.boxes);
    boxes = r.boxes;
    const bits = [];
    if (r.added) bits.push(r.added + ' added');
    if (r.updated) bits.push(r.updated + ' updated');
    if (r.unchanged) bits.push(r.unchanged + ' already matched');
    if (r.overflow) bits.push(r.overflow + ' dropped at the ' + LIMITS.boxes + '-box limit');
    msg = 'Merged — ' + (bits.length ? bits.join(', ') : 'nothing new') + '. ' + boxes.length + ' boxes now';
  }
  const notes = [];
  if (inc.skipped) notes.push(plural(inc.skipped, 'unreadable record') + ' skipped');
  if (inc.overflow) notes.push(plural(inc.overflow, 'box', 'boxes') + ' past ' + LIMITS.boxes + ' in the file were not read');
  if (inc.itemsDropped) notes.push(plural(inc.itemsDropped, 'thing') + ' over the ' + LIMITS.itemsPerBox + '-per-box limit dropped');
  if (inc.shortened) notes.push(plural(inc.shortened, 'thing') + ' shortened to ' + LIMITS.itemChars + ' characters');
  save();
  renderAll();
  undoToast(msg + (notes.length ? '. ' + notes.join('; ') : ''), () => restore(snap));
}

function askImport(r, name) {
  pendingImport = r;
  if (boxes.length === 0) { applyImport('merge'); return; }
  $('importAskText').textContent = name + ' holds ' + plural(r.boxes.length, 'box', 'boxes')
    + '. You have ' + boxes.length
    + '. Merging keeps both and lets the file update any box with the same number.';
  $('importAsk').classList.remove('hidden');
  $('importMerge').focus();
}

function download(name, type, text) {
  const blob = new Blob([text], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function wire() {
  // Ctrl/Cmd+P must print something current, not blank or stale.
  window.addEventListener('beforeprint', () => {
    if (document.body.classList.contains('print-labels')) reportLabels(renderLabels());
    else { printMode('print-manifest'); renderManifest(); }
  });
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-labels', 'print-manifest');
  });

  $('addBox').addEventListener('click', sealBox);
  $('cancelEdit').addEventListener('click', () => { endEdit(); $('boxItems').focus(); });
  $('packCard').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editingBoxId) { e.preventDefault(); endEdit(); }
  });

  $('searchInput').addEventListener('input', renderSearch);

  $('labelContents').addEventListener('change', (e) => {
    opts.labelContents = e.target.checked;
    saveOpts();
    toast(opts.labelContents
      ? 'Contents will print on the outside of the label — movers advise against it for valuables'
      : 'Contents stay off the label. They are still inside the QR code.', 6000);
  });

  $('printBtn').addEventListener('click', () => {
    if (boxes.length === 0) { toast('Pack a box first'); return; }
    printMode('print-labels');
    reportLabels(renderLabels());
    window.print();
  });
  $('printListBtn').addEventListener('click', () => {
    if (boxes.length === 0) { toast('Pack a box first'); return; }
    printMode('print-manifest');
    renderManifest();
    window.print();
  });

  $('exportBtn').addEventListener('click', () => {
    const name = 'moving-boxes-' + today() + '-' + boxes.length + '-boxes.json';
    download(name, 'application/json', JSON.stringify(boxes, null, 2));
    toast('Saved ' + name + ' — email it to yourself', 6000);
  });
  $('csvBtn').addEventListener('click', () => {
    const name = 'moving-boxes-' + today() + '-' + boxes.length + '-boxes.csv';
    download(name, 'text/csv', boxesToCsv(boxes));
    toast('Saved ' + name + ' — opens in any spreadsheet', 6000);
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importMerge').addEventListener('click', () => applyImport('merge'));
  $('importReplace').addEventListener('click', () => applyImport('replace'));
  $('importCancel').addEventListener('click', () => {
    pendingImport = null;
    $('importAsk').classList.add('hidden');
    $('importBtn').focus();
    toast('Import cancelled — your list is untouched');
  });
  $('importFile').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      const r = sanitizeBoxes(parsed);
      if (r.unusable || (r.boxes.length === 0 && r.skipped === 0)) {
        toast('That file doesn’t look like a Moving Boxes backup.', 6000);
        return;
      }
      if (r.boxes.length === 0) {
        toast('Nothing usable in that file — ' + plural(r.skipped, 'record') + ' could not be read.', 7000);
        return;
      }
      askImport(r, f.name);
    };
    reader.onerror = () => toast('Couldn’t read that file.', 6000);
    reader.readAsText(f);
  });

  $('revSave').addEventListener('click', saveScanned);
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  if (isBoxHash(location.hash)) {
    const box = decodeBox(location.hash);
    if (box) { showScanned(box); return; }
  }
  load();
  loadOpts();
  $('labelContents').checked = opts.labelContents;
  document.body.classList.toggle('label-contents', !!opts.labelContents);
  renderAll();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
