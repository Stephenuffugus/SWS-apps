// Home Inventory — Engine 2, skin B. Local-first: IndexedDB + vendored pdf-lib.
// Fast-capture is the heart: point, shoot, name, next. Detail can come later.
// All user data reaches the DOM via textContent; images only as data:image/* URLs.
import {
  newInventory, newId, newItem, parseValue, fmtCents, totals, roomItems,
  sanitizeInventory, toCsv, csvRows, LIMITS, CONDITIONS, dataUrlToBytes, photoFileName,
} from './model.js';
import { makeInventoryPdf, makeAdjusterPdf, unprintable } from './pdf.js';
import { makeZip } from './zip.js';
import {
  saveInventory, getInventory, allInventories, deleteInventory, inventoryExists,
} from './store.js';

const CONFIG = {
  // Stripe payment link for the tip jar — button stays hidden while empty.
  tipUrl: 'https://buy.stripe.com/9B6bJ2b5TfpJg2959T7EQ06',
};

/* Capture pipelines. Both numbers are stated to the user at the moment they
   apply — a 3.7px serial plate discovered a year later is the whole complaint. */
const WIDE = { maxSide: 1280, quality: 0.8, label: 'room and object shots' };
const CLOSE = { maxSide: 2400, quality: 0.92, label: 'close-ups: serial plates, hallmarks, receipts' };

/* ---------- tiny DOM kit ---------- */
const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

/* One toast implementation for the whole studio: SWS.toast keeps the clock
   stopped while the pointer or focus is inside, which an Undo button needs. */
function toast(msg, opts) {
  const S = window.SWS;
  if (S && S.toast) return S.toast(msg, opts);
  const t = $('toast');
  if (!t) return null;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), (opts && opts.ms) || 2400);
  return t;
}
function undoToast(msg, restore) {
  const S = window.SWS;
  if (S && S.undo) return S.undo(msg, restore, { ms: 9000 });
  return toast(msg, { ms: 9000 });
}
const noted = Object.create(null);
/** Say a limit out loud, once per session — a cap found later is a betrayal. */
function noteOnce(key, msg) {
  if (noted[key]) return;
  noted[key] = 1;
  toast(msg, { ms: 5000 });
}
function capNote(max, what) {
  return (ev) => {
    if (ev.target.value.length >= max) noteOnce('cap-' + what, what + ' stop at ' + max + ' characters — anything past that is not saved.');
  };
}

function showDlg(d) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
function closeDlg(d) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }
const safeSrc = (u) => (typeof u === 'string' && u.startsWith('data:image/')) ? u : null;

/* Compress on capture — a 40-room house would otherwise eat gigabytes. */
async function compressImage(file, maxSide, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * One shared file input, deliberately WITHOUT capture="environment": that
 * attribute removes the photo-library option on iOS Safari, and receipts are
 * usually already in the camera roll.
 */
function pickImage(mode) {
  const p = mode === 'close' ? CLOSE : WIDE;
  return new Promise((resolve) => {
    const input = $('fileInput');
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return resolve(null);
      try { resolve(await compressImage(file, p.maxSide, p.quality)); }
      catch (e) {
        // no canvas/bitmap support — fall back to the raw file (may be large)
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  });
}

/* ---------- state ---------- */
let inv = null;
let tab = 'capture';
let itemFilterRoom = 'all';
let itemQuery = '';
let itemSort = 'recent';
let onlyNoPhoto = false;
let onlyBig = false;
let pageSize = 'letter';
let captureRoomId = null;
let closeUp = false;
let captureDraft = { photo: null, name: '', value: '', qty: '' };
let installEvt = null;

/* ---------- saving, said out loud ----------
   The old code fired "Saved — next one" the instant the item hit the array and
   throttled the FAILURE to one message a minute, so a full phone reported four
   lost items as saved. Now: nothing claims to be saved until the write has
   resolved AND the row has been read back, and a failure raises a banner that
   does not go away by itself. */
let dirty = false;
let saveTimer = null;
let saveError = null;
let pendingChanges = 0;
let persistAsked = false;

function touch() {
  if (!inv) return;
  inv.updatedAt = Date.now();
  dirty = true;
  pendingChanges++;
  clearTimeout(saveTimer);
  // Snapshot inside the debounce, not here: JSON.parse(JSON.stringify(inv)) on
  // a 146MB photo-heavy record cost 514ms of blocked main thread PER KEYSTROKE.
  saveTimer = setTimeout(() => { flush(); }, 400);
}

async function flush() {
  clearTimeout(saveTimer);
  if (!inv || (!dirty && !saveError)) return true;
  const snap = JSON.parse(JSON.stringify(inv));
  const covered = pendingChanges;
  dirty = false;
  try {
    await saveInventory(snap);
    let there = true;
    try { there = await inventoryExists(snap.id); } catch (e) { there = true; }
    if (!there) throw new Error('the record was not on disk after the write');
    pendingChanges = Math.max(0, pendingChanges - covered);
    saveError = null;
    renderSaveBanner();
    askPersistOnce();
    return true;
  } catch (e) {
    dirty = true;
    saveError = String((e && e.message) || e || 'unknown error').slice(0, 120);
    renderSaveBanner();
    return false;
  }
}

window.addEventListener('pagehide', () => {
  if (!inv || !dirty) return;
  clearTimeout(saveTimer);
  try { saveInventory(JSON.parse(JSON.stringify(inv))); } catch (e) {}
});

function renderSaveBanner() {
  const b = $('unsavedBanner');
  if (!b) return;
  if (!saveError) { b.classList.add('hidden'); b.replaceChildren(); return; }
  const n = Math.max(1, pendingChanges);
  b.replaceChildren(
    el('strong', { text: '⚠ NOT saved to this device' }),
    el('span', { text: ' — ' + n + (n === 1 ? ' change is' : ' changes are') +
      ' only in this browser tab and will be lost when you close it. This device may be out of room. (' + saveError + ')' }),
    el('span', { class: 'bannerbtns' },
      el('button', { class: 'btn small', type: 'button', onclick: () => exportBackup(true) }, 'Export backup now'),
      el('button', { class: 'btn small', type: 'button', onclick: async () => {
        const ok = await flush();
        toast(ok ? 'Saved — the device accepted it this time.' : 'Still refusing to save. Export the backup.', { assertive: !ok, ms: 5000 });
      } }, 'Try again')));
  b.classList.remove('hidden');
}

/** Durable storage: WebKit clears an uninstalled site after 7 idle days. */
async function askPersistOnce() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (!already) await navigator.storage.persist();
  } catch (e) {}
}

async function storageFacts() {
  const out = { persisted: false, usage: null, quota: null, supported: false };
  try {
    if (!navigator.storage) return out;
    out.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      out.usage = e.usage; out.quota = e.quota; out.supported = true;
    }
  } catch (e) {}
  return out;
}
const mb = (bytes) => (bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GB' : Math.round(bytes / 1048576) + ' MB');

function isInstalled() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  } catch (e) { return false; }
}

/* ---------- focus across a redraw ----------
   The whole view is rebuilt with replaceChildren on every change, which threw
   focus to <body> after every single save: 9 Tab presses back to the name
   field, on every item, for keyboard and screen-reader users alike. Controls
   carry a stable data-fk; focus and the caret are restored to the same key. */
function captureFocus() {
  const a = document.activeElement;
  const v = $('view');
  if (!a || !v || !v.contains(a)) return null;
  const fk = a.getAttribute('data-fk');
  if (!fk) return null;
  const f = { fk };
  try { f.start = a.selectionStart; f.end = a.selectionEnd; } catch (e) {}
  return f;
}
function restoreFocus(f) {
  if (!f) return;
  const n = $('view').querySelector('[data-fk="' + String(f.fk).replace(/["\\]/g, '') + '"]');
  if (!n) return;
  try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
  if (f.start != null && n.setSelectionRange) {
    try { n.setSelectionRange(f.start, f.end); } catch (e) {}
  }
}

function route() {
  const m = location.hash.match(/^#\/i\/([\w-]+)/);
  return m ? { view: 'editor', id: m[1] } : { view: 'home' };
}
window.addEventListener('hashchange', render);

/* ---------- a dialog instead of prompt()/confirm() ----------
   window.prompt() was the app's front door. With dialogs suppressed — the
   automation default, Firefox's "prevent additional dialogs", some managed
   devices — "Start an inventory" did nothing at all, silently. */
let askResolve = null;
function ask(opts) {
  const d = $('askDlg');
  $('askTitle').textContent = opts.title;
  const body = $('askBody');
  body.replaceChildren(...(opts.body || []).map(t => el('p', { class: 'sub', text: t })));
  const wrap = $('askFieldWrap');
  const field = $('askField');
  if (opts.input) {
    wrap.classList.remove('hidden');
    $('askLabel').textContent = opts.input.label;
    field.value = opts.input.value || '';
    field.placeholder = opts.input.placeholder || '';
    field.maxLength = opts.input.maxlength || LIMITS.name;
  } else wrap.classList.add('hidden');

  const btns = (opts.buttons || [{ label: 'OK', value: 'ok', kind: 'primary' }]);
  $('askBtns').replaceChildren(
    el('button', { class: 'btn', type: 'button', onclick: () => finishAsk(null) }, opts.cancelLabel || 'Cancel'),
    ...btns.map(b => el('button', { class: 'btn ' + (b.kind || ''), type: 'button', onclick: () => finishAsk(b.value) }, b.label)));

  showDlg(d);
  setTimeout(() => { (opts.input ? field : $('askBtns').lastChild).focus(); }, 0);
  return new Promise((res) => { askResolve = res; });
}
function finishAsk(value) {
  const d = $('askDlg');
  const text = $('askField').value;
  closeDlg(d);
  const r = askResolve; askResolve = null;
  if (r) r(value === null ? null : { choice: value, text });
}

/* ---------- home ---------- */
async function renderHome() {
  inv = null;
  const v = $('view');
  v.replaceChildren();
  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'Photograph it before you need it'),
    el('p', {}, 'After the fire is the wrong time to remember what was in the house. Walk each room, point, shoot, name it — and export a PDF your insurer will accept, or a spreadsheet their software can read. ',
      el('strong', {}, 'Free. No account. Nothing leaves your device.')),
    el('button', { class: 'btn primary', type: 'button', 'data-fk': 'start', onclick: createInventory }, 'Start an inventory')));

  const trust = $('trustTpl');
  if (trust && trust.content) v.append(trust.content.cloneNode(true));

  const sec = el('section', { class: 'card' }, el('h2', {}, 'Your inventories'));
  const list = el('ul', { class: 'plain' });
  sec.append(list);
  let rows = [];
  try { rows = (await allInventories()) || []; } catch (e) {}
  rows = rows.filter(r => r && typeof r === 'object');
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (rows.length === 0) sec.append(el('p', { class: 'hint', text: 'Nothing here yet. Everything you add is stored on this device only — export the PDF and the backup file somewhere safe.' }));
  for (const r of rows) {
    try {
      list.append(homeRow(r));
    } catch (e) {
      // one unreadable record must never take the page — and the Restore
      // button — down with it.
      list.append(el('li', {},
        el('div', { class: 'grow' },
          el('div', { text: (typeof r.name === 'string' && r.name) ? r.name : 'Unreadable inventory' }),
          el('div', { class: 'sub', text: 'This record could not be read (' + String(e.message || e).slice(0, 60) + '). Delete it, or import a good backup.' })),
        el('button', { class: 'btn small danger icon', type: 'button', 'aria-label': 'Delete unreadable inventory',
          onclick: () => removeInventory(r) }, '✕')));
    }
  }
  v.append(sec);

  const file = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden',
    onchange: (ev) => { if (ev.target.files[0]) importFile(ev.target.files[0]); ev.target.value = ''; } });
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Restore'),
    el('p', { class: 'hint', text: 'Importing never overwrites an inventory without asking first — if the file matches one already here, you choose to keep both or replace.' }),
    el('button', { class: 'btn', type: 'button', 'data-fk': 'import', onclick: () => file.click() }, 'Import a backup file'),
    file));

  const ic = installCard();
  if (ic) v.append(ic);
  renderSaveBanner();
}

function homeRow(r) {
  const t = totals(r);
  return el('li', {},
    el('div', { class: 'grow' },
      el('div', { text: r.name }),
      el('div', { class: 'sub', text: t.count + ' items · ' + t.photos + ' photographed · ' + fmtCents(t.valueCents) }),
      el('div', { class: 'sub ' + (exportAgeClass(r)), text: lastExportLine(r) })),
    el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/i/' + r.id; } }, 'Open'),
    el('button', { class: 'btn small danger icon', type: 'button', 'aria-label': 'Delete inventory ' + r.name,
      onclick: () => removeInventory(r) }, '✕'));
}

function daysSince(ms) { return Math.floor((Date.now() - ms) / 86400000); }
function lastExportLine(r) {
  if (!r.lastExportAt) return 'Never exported — it exists only on this device.';
  const d = daysSince(r.lastExportAt);
  if (d <= 0) return 'Last exported today.';
  return 'Last exported ' + d + ' day' + (d === 1 ? '' : 's') + ' ago.';
}
function exportAgeClass(r) {
  return (!r.lastExportAt || daysSince(r.lastExportAt) > 30) ? 'warntext' : '';
}

async function removeInventory(r) {
  const snap = JSON.parse(JSON.stringify(r));
  let t = { count: 0, photos: 0 };
  try { t = totals(r); } catch (e) {}
  try { await deleteInventory(r.id); } catch (e) { toast('Could not delete that — the database refused.', { assertive: true }); return; }
  await renderHome();
  undoToast('Deleted “' + r.name + '” — ' + t.count + ' items and ' + t.photos + ' photos.', async () => {
    try { await saveInventory(snap); } catch (e) {}
    renderHome();
    toast('Restored “' + snap.name + '”');
  });
}

function installCard() {
  if (isInstalled()) return null;
  const card = el('section', { class: 'card' }, el('h2', {}, 'Keep it for three years'));
  card.append(el('p', { class: 'hint' },
    'Browsers delete the storage of sites you have not opened in a while — Safari clears it after about seven days of not visiting. Installing this to your home screen exempts it, and it still works with no signal.'));
  if (installEvt) {
    card.append(el('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const e = installEvt; installEvt = null;
      try { e.prompt(); await e.userChoice; } catch (err) {}
      render();
    } }, 'Add to home screen'));
  } else {
    card.append(el('p', { class: 'hint', text: 'iPhone or iPad: tap Share, then “Add to Home Screen”. Android: the browser menu, then “Install app” or “Add to Home screen”.' }));
  }
  const line = el('p', { class: 'hint', text: 'Checking this device’s storage…' });
  card.append(line);
  storageFacts().then((f) => {
    const bits = [];
    bits.push(f.persisted ? 'This browser has marked your inventory as durable storage.'
      : 'This browser has not (yet) promised to keep the data — install to the home screen and export often.');
    if (f.supported && f.quota) bits.push('Using ' + mb(f.usage || 0) + ' of about ' + mb(f.quota) + ' this browser allows this site.');
    line.textContent = bits.join(' ');
  });
  return card;
}

async function createInventory() {
  const r = await ask({
    title: 'Name this inventory',
    body: ['An address works well — you may end up with more than one.'],
    input: { label: 'Name', value: '', placeholder: '148 Oak Street', maxlength: LIMITS.name },
    buttons: [{ label: 'Create', value: 'ok', kind: 'primary' }],
  });
  if (!r) return;
  inv = newInventory((r.text || '').trim().slice(0, LIMITS.name) || 'Home inventory');
  inv.rooms = [{ id: newId(), name: 'Living room' }, { id: newId(), name: 'Kitchen' }, { id: newId(), name: 'Bedroom' }];
  touch();
  location.hash = '#/i/' + inv.id;
  flush();
}

async function importFile(file) {
  let text = '';
  try { text = await readText(file); } catch (e) { toast('That file could not be read.'); return; }
  let obj = null;
  try { obj = JSON.parse(text); } catch (e) { obj = null; }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) {
    toast('That file doesn’t look like an inventory backup.', { ms: 5000 });
    return;
  }
  const skipped = obj.items.filter(i => !i || typeof i !== 'object').length;
  const clean = sanitizeInventory(obj);

  let existing = null;
  try { existing = await getInventory(clean.id); } catch (e) {}

  if (existing) {
    const mine = totals(existing), theirs = totals(clean);
    const r = await ask({
      title: 'That backup matches an inventory already on this device',
      body: [
        'On this device: “' + existing.name + '” — ' + mine.count + ' items, ' + fmtCents(mine.valueCents) + '.',
        'In the file: “' + clean.name + '” — ' + theirs.count + ' items, ' + fmtCents(theirs.valueCents) + '.',
        'Replacing throws away everything added since that backup was made.',
      ],
      buttons: [
        { label: 'Keep both', value: 'both', kind: 'primary' },
        { label: 'Replace', value: 'replace', kind: 'danger' },
      ],
    });
    if (!r) return;
    if (r.choice === 'both') {
      clean.id = newId();
      clean.name = (clean.name + ' (restored ' + new Date().toLocaleDateString() + ')').slice(0, LIMITS.name);
    } else {
      const backup = JSON.parse(JSON.stringify(existing));
      try { await saveInventory(clean); } catch (e) { toast('Could not write that file to this device.', { assertive: true }); return; }
      inv = null;
      location.hash = '#/i/' + clean.id;
      render();
      undoToast('Replaced “' + existing.name + '” (' + mine.count + ' items) with the backup (' + theirs.count + ' items).', async () => {
        try { await saveInventory(backup); } catch (e) {}
        inv = null;
        location.hash = '#/i/' + backup.id;
        render();
        toast('Put “' + backup.name + '” back — ' + mine.count + ' items.');
      });
      return;
    }
  }

  try { await saveInventory(clean); } catch (e) { toast('Could not write that file to this device.', { assertive: true }); return; }
  inv = null;
  location.hash = '#/i/' + clean.id;
  render();
  toast('Imported “' + clean.name + '” — ' + clean.items.length + ' items' +
    (skipped ? '. ' + skipped + ' unreadable row' + (skipped === 1 ? ' was' : 's were') + ' skipped.' : '.'),
    { ms: skipped ? 7000 : 4000 });
}

function readText(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result || ''));
    reader.onerror = () => rej(new Error('unreadable'));
    reader.readAsText(file);
  });
}

/* ---------- editor ---------- */
async function renderEditor(id) {
  if (!inv || inv.id !== id) {
    let loaded = null;
    try { loaded = await getInventory(id); } catch (e) {}
    if (!loaded) {
      $('view').replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'sub', text: 'That inventory isn’t on this device.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    // Everything off disk is sanitised: a hand-edited backup is an expected
    // input for an app whose pitch is "readable in a text editor".
    inv = sanitizeInventory(loaded);
    // never leak state between inventories
    captureDraft = { photo: (inv.draft && inv.draft.photo) || null, name: '', value: '', qty: '' };
    captureRoomId = (inv.draft && inv.draft.roomId) || null;
    itemFilterRoom = 'all';
    itemQuery = ''; onlyNoPhoto = false; onlyBig = false; itemSort = 'recent';
    if (captureDraft.photo) {
      toast('A photo is waiting to be named on the Capture tab.', { ms: 5000 });
    }
  }
  drawEditor();
}

function drawEditor(focusKey) {
  const v = $('view');
  const keep = focusKey ? { fk: focusKey } : captureFocus();
  v.replaceChildren();
  const t = totals(inv);

  const nameId = 'invName';
  v.append(el('div', { class: 'printonly printhead' }, inv.name,
    el('small', {}, t.count + ' entries · ' + t.units + ' items · ' + fmtCents(t.valueCents) +
      ' · printed ' + new Date().toLocaleDateString() + ' · tick each item as you find it')));
  v.append(el('section', { class: 'card' },
    el('div', { class: 'row' },
      el('button', { class: 'btn small noprint', type: 'button', style: 'flex:0 0 auto', 'data-fk': 'back',
        onclick: async () => { await flush(); location.hash = '#/'; } }, '‹ Back'),
      el('label', { class: 'f grow', for: nameId }, el('span', { class: 'sr-only' }, 'Inventory name'),
        el('input', { type: 'text', id: nameId, value: inv.name, maxlength: String(LIMITS.name),
          'aria-label': 'Inventory name', 'data-fk': 'invname', style: 'font-weight:700',
          oninput: (ev) => { inv.name = ev.target.value.slice(0, LIMITS.name); capNote(LIMITS.name, 'Inventory names')(ev); touch(); } }))),
    el('div', { class: 'sub', style: 'margin-top:6px',
      text: t.count + ' entries · ' + t.units + ' items · ' + t.photos + ' photographed · ' + fmtCents(t.valueCents) })));

  v.append(el('nav', { class: 'tabs noprint', 'aria-label': 'Sections' },
    ...[['capture', 'Capture'], ['items', 'Items'], ['rooms', 'Rooms'], ['export', 'Export']]
      .map(([k, label]) => el('button', {
        type: 'button', class: k === tab ? 'active' : '', 'aria-current': k === tab ? 'page' : null,
        'data-fk': 'tab-' + k,
        onclick: () => { tab = k; drawEditor('tab-' + k); },
      }, label))));

  if (tab === 'capture') v.append(renderCapture());
  else if (tab === 'items') v.append(renderItems());
  else if (tab === 'rooms') v.append(renderRooms());
  else v.append(...renderExport());

  restoreFocus(keep);
}

/* ----- fast capture ----- */
function renderCapture() {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Fast capture — point, shoot, name, next'));
  if (inv.rooms.length === 0) {
    card.append(el('p', { class: 'hint', text: 'Add a room first (Rooms tab).' }));
    return card;
  }
  if (!captureRoomId || !inv.rooms.some(r => r.id === captureRoomId)) captureRoomId = inv.rooms[0].id;

  const roomSel = el('select', { 'aria-label': 'Room', 'data-fk': 'cap-room',
    onchange: (ev) => { captureRoomId = ev.target.value; } },
    ...inv.rooms.map(r => el('option', { value: r.id, text: r.name })));
  roomSel.value = captureRoomId;
  card.append(el('label', { class: 'f' }, el('span', {}, 'Room'), roomSel));

  const preview = el('img', { class: 'capturephoto' + (captureDraft.photo ? '' : ' hidden'), alt: 'Photo waiting to be named' });
  if (safeSrc(captureDraft.photo)) preview.src = captureDraft.photo;
  card.append(preview);

  card.append(el('button', { class: 'btn big block' + (captureDraft.photo ? '' : ' primary'), type: 'button', 'data-fk': 'cap-photo',
    onclick: async () => {
      const dataUrl = await pickImage(closeUp ? 'close' : 'wide');
      if (!dataUrl) return;
      captureDraft.photo = dataUrl;
      // Persist the staged photo with the inventory: a knock at the door used
      // to cost the shot, silently.
      inv.draft = { photo: dataUrl, roomId: captureRoomId };
      touch();
      drawEditor('cap-name');
      flush();
    } }, captureDraft.photo ? 'Retake photo' : '📷 Take a photo'));

  const closeBox = el('input', { type: 'checkbox', id: 'closeUp', 'data-fk': 'cap-close',
    onchange: (ev) => { closeUp = ev.target.checked; } });
  closeBox.checked = closeUp;
  card.append(el('label', { class: 'checkline' }, closeBox,
    el('span', {}, 'Close-up (serial plate, hallmark, receipt) — keeps 2400px detail')));
  card.append(el('p', { class: 'hint', text: 'That button opens the camera AND the photo library — receipts you already photographed can be attached from there. Photos are resized to ' + WIDE.maxSide + 'px, about 100 KB each, so a whole house fits on the device. A serial plate inside a wide shot will not survive that — tick Close-up and fill the frame with the plate, and it is kept at ' + CLOSE.maxSide + 'px (roughly 8× the storage).' }));

  const nameIn = el('input', { type: 'text', id: 'capName', maxlength: String(LIMITS.name),
    placeholder: 'e.g. “65-inch TV”', 'data-fk': 'cap-name',
    oninput: (ev) => { captureDraft.name = ev.target.value; capNote(LIMITS.name, 'Item names')(ev); },
    onkeydown: (ev) => { if (ev.key === 'Enter') saveBtn.click(); } });
  nameIn.value = captureDraft.name;
  const qtyIn = el('input', { type: 'text', inputmode: 'numeric', id: 'capQty', placeholder: '1', 'data-fk': 'cap-qty',
    oninput: (ev) => { captureDraft.qty = ev.target.value; },
    onkeydown: (ev) => { if (ev.key === 'Enter') saveBtn.click(); } });
  qtyIn.value = captureDraft.qty;
  const valueIn = el('input', { type: 'text', inputmode: 'decimal', id: 'capValue', placeholder: '0', 'data-fk': 'cap-value',
    oninput: (ev) => { captureDraft.value = ev.target.value; },
    onkeydown: (ev) => { if (ev.key === 'Enter') saveBtn.click(); } });
  valueIn.value = captureDraft.value;

  const saveBtn = el('button', { class: 'btn primary block', type: 'button', 'data-fk': 'cap-save', onclick: async () => {
    const name = nameIn.value.trim();
    if (!name) { toast('Give it a name — that’s the one required field', { assertive: true }); nameIn.focus(); return; }
    const cents = readMoney(valueIn.value, valueIn);
    if (cents === null) return;
    const qty = readQty(qtyIn.value, qtyIn);
    if (qty === null) return;
    inv.items.push(newItem({
      roomId: captureRoomId, name: name.slice(0, LIMITS.name),
      quantity: qty, valueCents: cents, photo: safeSrc(captureDraft.photo),
    }));
    captureDraft = { photo: null, name: '', value: '', qty: '' };
    inv.draft = null;
    touch();
    drawEditor('cap-name');
    const ok = await flush();
    if (ok) toast('Saved — next one', { ms: 1600 });
    else toast('NOT saved — read the red warning at the top of the page.', { assertive: true, ms: 6000 });
  } }, 'Save & next');

  card.append(
    el('label', { class: 'f' }, el('span', {}, 'What is it?'), nameIn),
    el('div', { class: 'row' },
      el('label', { class: 'f', style: 'flex:0 0 5.5rem' }, el('span', {}, 'Qty'), qtyIn),
      el('label', { class: 'f grow' }, el('span', {}, 'Value $ (optional)'), valueIn)),
    el('div', { style: 'margin-top:10px' }, saveBtn),
    el('p', { class: 'hint', text: 'Serial numbers, brand, condition, receipts and dates can be added later from the Items tab. Speed now, detail later.' }));

  const recent = roomItems(inv, captureRoomId).slice(-4).reverse();
  if (recent.length) {
    const list = el('ul', { class: 'plain', style: 'margin-top:8px' });
    for (const item of recent) list.append(renderItemRow(item));
    card.append(el('h2', { style: 'margin-top:14px' },
      'Last ' + recent.length + ' added in this room' + (roomItems(inv, captureRoomId).length > recent.length ? ' (of ' + roomItems(inv, captureRoomId).length + ' — see the Items tab for all of them)' : '')), list);
  }
  return card;
}

/** Reads money, and says so out loud when it cannot — never stores a silent 0. */
function readMoney(raw, input) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const cents = parseValue(s);
  if (cents === null) {
    toast('“' + s.slice(0, 20) + '” isn’t an amount I can read. Use digits — 1200, 1,234.56 or 1.234,56 — up to $' + LIMITS.valueDollars.toLocaleString() + '. Nothing was saved with a wrong value.',
      { assertive: true, ms: 7000 });
    if (input) input.focus();
    return null;
  }
  return cents;
}
function readQty(raw, input) {
  const s = String(raw || '').trim();
  if (!s) return 1;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || Math.round(n) !== n) {
    toast('Quantity has to be a whole number of 1 or more (up to ' + LIMITS.quantity + ').', { assertive: true, ms: 5000 });
    if (input) input.focus();
    return null;
  }
  if (n > LIMITS.quantity) {
    toast('Quantity stops at ' + LIMITS.quantity + ' — saved as ' + LIMITS.quantity + '.', { ms: 5000 });
    return LIMITS.quantity;
  }
  return Math.round(n);
}

/* ----- items ----- */
function visibleItems() {
  const q = itemQuery.trim().toLowerCase();
  let items = inv.items.filter(i => i && typeof i === 'object');
  if (itemFilterRoom === 'unsorted') items = items.filter(i => !inv.rooms.some(r => r.id === i.roomId));
  else if (itemFilterRoom !== 'all') items = items.filter(i => i.roomId === itemFilterRoom);
  if (onlyNoPhoto) items = items.filter(i => !i.photo);
  if (onlyBig) items = items.filter(i => (i.valueCents || 0) * (i.quantity || 1) >= 50000);
  if (q) {
    items = items.filter(i => (
      (i.name || '') + ' ' + (i.serial || '') + ' ' + (i.brand || '') + ' ' +
      (i.model || '') + ' ' + (i.notes || '')).toLowerCase().includes(q));
  }
  const val = (i) => (i.valueCents || 0) * (i.quantity || 1);
  if (itemSort === 'value') items = items.slice().sort((a, b) => val(b) - val(a));
  else if (itemSort === 'name') items = items.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  else if (itemSort === 'room') {
    const rn = Object.create(null);
    for (const r of inv.rooms) rn[r.id] = r.name;
    items = items.slice().sort((a, b) => String(rn[a.roomId] || 'Unsorted').localeCompare(String(rn[b.roomId] || 'Unsorted')) ||
      String(a.name).localeCompare(String(b.name)));
  } else items = items.slice().reverse(); // most recent first
  return items;
}

function renderItems() {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Items'));
  const total = inv.items.length;

  const search = el('input', { type: 'search', id: 'itemSearch', 'data-fk': 'search',
    placeholder: 'name, serial, brand, notes…', value: itemQuery,
    oninput: (ev) => { itemQuery = ev.target.value; drawEditor('search'); } });
  const sortSel = el('select', { id: 'itemSort', 'data-fk': 'sort',
    onchange: (ev) => { itemSort = ev.target.value; drawEditor('sort'); } },
    el('option', { value: 'recent', text: 'Most recent' }),
    el('option', { value: 'value', text: 'Highest value' }),
    el('option', { value: 'name', text: 'Name A–Z' }),
    el('option', { value: 'room', text: 'Room' }));
  sortSel.value = itemSort;
  card.append(el('div', { class: 'row noprint' },
    el('label', { class: 'f grow', for: 'itemSearch' }, el('span', {}, 'Search'), search),
    el('label', { class: 'f', style: 'flex:0 0 9rem', for: 'itemSort' }, el('span', {}, 'Sort by'), sortSel)));

  const chips = el('div', { class: 'chips noprint', style: 'margin-bottom:10px', role: 'group', 'aria-label': 'Filter items' });
  const mkChip = (id, label) => {
    const on = itemFilterRoom === id;
    return el('button', { class: 'chip' + (on ? ' sel' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
      onclick: () => { itemFilterRoom = id; drawEditor(); } }, label);
  };
  chips.append(mkChip('all', 'All rooms'));
  for (const r of inv.rooms) chips.append(mkChip(r.id, r.name));
  const orphanCount = inv.items.filter(i => i && !inv.rooms.some(r => r.id === i.roomId)).length;
  if (orphanCount) chips.append(mkChip('unsorted', 'Unsorted (' + orphanCount + ')'));
  chips.append(el('button', { class: 'chip' + (onlyNoPhoto ? ' sel' : ''), type: 'button', 'aria-pressed': onlyNoPhoto ? 'true' : 'false',
    onclick: () => { onlyNoPhoto = !onlyNoPhoto; drawEditor(); } }, 'Missing a photo'));
  chips.append(el('button', { class: 'chip' + (onlyBig ? ' sel' : ''), type: 'button', 'aria-pressed': onlyBig ? 'true' : 'false',
    onclick: () => { onlyBig = !onlyBig; drawEditor(); } }, 'Over $500'));
  card.append(chips);

  const items = visibleItems();
  const shown = items.length;
  const sum = items.reduce((a, i) => a + (i.valueCents || 0) * (i.quantity || 1), 0);
  card.append(el('p', { class: 'sub', role: 'status',
    text: shown === total
      ? 'Showing all ' + total + ' items · ' + fmtCents(sum)
      : 'Showing ' + shown + ' of ' + total + ' items · ' + fmtCents(sum) + ' (a filter or search is hiding ' + (total - shown) + ')' }));

  const list = el('ul', { class: 'plain' });
  for (const item of items) list.append(renderItemRow(item));
  if (shown === 0) {
    card.append(el('p', { class: 'hint', text: total === 0
      ? 'Nothing here yet — the Capture tab is the fast way in.'
      : 'No item matches that. Clear the search or the filters to see all ' + total + '.' }));
  }
  card.append(list);
  return card;
}

function renderItemRow(item) {
  const roomName = (inv.rooms.find(r => r.id === item.roomId) || {}).name || 'Unsorted';
  const thumb = safeSrc(item.photo)
    ? el('img', { class: 'thumb', src: item.photo, alt: '' })
    : el('div', { class: 'thumb empty', 'aria-hidden': 'true' }, el('span', {}, 'no photo'));
  const qty = item.quantity > 1 ? '×' + item.quantity : null;
  const line = [roomName, qty,
    item.valueCents ? fmtCents(item.valueCents * (item.quantity || 1)) : 'no value yet',
    item.condition || null,
    item.serial ? 'SN ' + item.serial : null].filter(Boolean).join(' · ');
  return el('li', {},
    thumb,
    el('div', { class: 'grow' },
      el('div', { text: item.name }),
      el('div', { class: 'sub', text: line })),
    el('button', { class: 'btn small icon noprint', type: 'button', 'data-fk': 'edit-' + item.id,
      'aria-label': 'Edit ' + item.name, onclick: () => openItemDlg(item) }, '✎'));
}

/* ----- rooms ----- */
function renderRooms() {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Rooms'));
  const nameIn = el('input', { type: 'text', id: 'roomName', maxlength: String(LIMITS.room),
    placeholder: 'Garage, attic, storage unit…', 'data-fk': 'room-new',
    oninput: capNote(LIMITS.room, 'Room names'),
    onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); } });
  const addBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', 'data-fk': 'room-add', onclick: async () => {
    const name = nameIn.value.trim();
    if (!name) { toast('Type a room name first.', { assertive: true }); nameIn.focus(); return; }
    inv.rooms.push({ id: newId(), name: name.slice(0, LIMITS.room) });
    nameIn.value = '';
    touch(); drawEditor('room-new');
    const ok = await flush();
    if (ok) toast('Room added', { ms: 1400 });
  } }, 'Add');
  card.append(el('div', { class: 'row' },
    el('label', { class: 'f grow', for: 'roomName' }, el('span', {}, 'New room'), nameIn), addBtn));

  const list = el('ul', { class: 'plain', style: 'margin-top:8px' });
  for (const r of inv.rooms) {
    const n = roomItems(inv, r.id).length;
    list.append(el('li', {},
      el('div', { class: 'grow' }, el('div', { text: r.name }), el('div', { class: 'sub', text: n + ' items' })),
      el('button', { class: 'btn small icon', type: 'button', 'aria-label': 'Rename ' + r.name, 'data-fk': 'room-edit-' + r.id,
        onclick: async () => {
          const res = await ask({
            title: 'Rename room',
            input: { label: 'Room name', value: r.name, maxlength: LIMITS.room },
            buttons: [{ label: 'Rename', value: 'ok', kind: 'primary' }],
          });
          if (!res) return;
          const name = (res.text || '').trim();
          if (!name) return;
          r.name = name.slice(0, LIMITS.room);
          touch(); drawEditor('room-edit-' + r.id); flush();
        } }, '✎'),
      el('button', { class: 'btn small danger icon', type: 'button', 'aria-label': 'Delete room ' + r.name, onclick: async () => {
        const before = inv.rooms.slice();
        inv.rooms = inv.rooms.filter(x => x.id !== r.id);
        touch(); drawEditor(); flush();
        undoToast('Deleted “' + r.name + '”' + (n ? ' — its ' + n + ' items are now under the Unsorted filter.' : '.'), () => {
          inv.rooms = before;
          touch(); drawEditor(); flush();
          toast('Room restored');
        });
      } }, '✕')));
  }
  card.append(list);
  return card;
}

/* ----- export ----- */
function renderExport() {
  const out = [];
  out.push(el('div', { class: 'warnbanner' },
    'A local-only inventory that burns up with the house is a cruel joke. ',
    el('strong', {}, 'After exporting, email the files to yourself'), ' or save them to cloud storage — anywhere that isn’t this device.'));

  const card = el('section', { class: 'card' }, el('h2', {}, 'Exports'));
  card.append(el('p', { class: 'sub', text: lastExportLine(inv) }));

  const sizeSel = el('select', { style: 'flex:0 0 7rem', 'aria-label': 'Page size', 'data-fk': 'pagesize',
    onchange: (ev) => { pageSize = ev.target.value; } },
    el('option', { value: 'letter', text: 'US Letter' }),
    el('option', { value: 'a4', text: 'A4' }));
  sizeSel.value = pageSize;
  card.append(el('div', { class: 'row', style: 'margin-bottom:6px' },
    el('span', { class: 'sub', style: 'align-self:center' }, 'PDF page size'), sizeSel));

  const lost = unprintable(inv);
  if (lost.length) {
    const sample = lost.slice(0, 3).map(h => '“' + h.original + '” prints as “' + h.asPrinted + '”').join('; ');
    card.append(el('p', { class: 'warntext', text:
      lost.length + ' name' + (lost.length === 1 ? '' : 's') + ' use characters the PDF’s built-in font cannot draw: ' + sample +
      (lost.length > 3 ? ', and ' + (lost.length - 3) + ' more' : '') +
      '. Accents are converted (Gdańsk → Gdansk); Chinese, Japanese, Korean, Hebrew, Arabic and emoji cannot be, and show as “?”. The CSV and the .json backup keep every name exactly as you typed it.' }));
  }

  const pdfs = [
    ['Full report (PDF)', 'Cover summary, then a page per room with photo grid and values. Long names are shortened with an ellipsis to fit the paper — the CSV keeps them in full.', makeInventoryPdf, 'inventory'],
    ['Items by value (PDF)', 'Every item sorted by value, highest first — the human-readable exhibit to attach to a claim. Carriers’ software wants the CSV below.', makeAdjusterPdf, 'by-value'],
  ];
  for (const [title, desc, fn, slug] of pdfs) {
    card.append(el('div', { class: 'exportcard' },
      el('div', { class: 'grow' }, el('b', {}, title), el('span', {}, desc)),
      el('button', { class: 'btn primary small', type: 'button', 'aria-label': 'Download ' + title, onclick: async (ev) => {
        const btn = ev.currentTarget;
        const label = btn.textContent;
        btn.disabled = true; btn.textContent = '…';
        try {
          const bytes = await fn(window.PDFLib, inv, pageSize);
          downloadBytes(bytes, slugify(inv.name) + '-' + slug + '.pdf', 'application/pdf');
          markExported();
        } catch (e) { toast('PDF failed: ' + (e.message || 'unknown error'), { assertive: true, ms: 5000 }); }
        btn.disabled = false; btn.textContent = label;
      } }, 'PDF')));
  }

  card.append(el('div', { class: 'exportcard' },
    el('div', { class: 'grow' }, el('b', {}, 'Spreadsheet (CSV)'),
      el('span', {}, 'Quantity, Description, Brand/Make, Model, Serial, Room, Purchase date, Condition, Original cost, Replacement cost, Photo file, Notes — the columns carriers and the Xactimate family ingest. Opens in Excel, Numbers and Sheets.')),
    el('button', { class: 'btn primary small', type: 'button', 'aria-label': 'Download spreadsheet CSV', onclick: () => {
      const text = toCsv(inv);
      downloadBytes(new TextEncoder().encode('\ufeff' + text), slugify(inv.name) + '.csv', 'text/csv');
      markExported();
    } }, 'CSV')));

  const withPhotos = inv.items.filter(i => i && i.photo).length;
  if (withPhotos) {
    card.append(el('div', { class: 'exportcard' },
      el('div', { class: 'grow' }, el('b', {}, 'Spreadsheet + photos (ZIP)'),
        el('span', {}, 'The same CSV plus every photo as a .jpg, named exactly as the Photo file column says. ' + withPhotos + ' photo' + (withPhotos === 1 ? '' : 's') + '. Receipts and close-ups are included as -receipt.jpg.')),
      el('button', { class: 'btn small', type: 'button', 'aria-label': 'Download spreadsheet and photos as ZIP', onclick: async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          const files = [{ name: slugify(inv.name) + '.csv', bytes: new TextEncoder().encode('\ufeff' + toCsv(inv)) }];
          csvRows(inv).forEach((row, idx) => {
            const stem = photoFileName(row.item, idx);
            if (row.item.photo) {
              const b = dataUrlToBytes(row.item.photo);
              if (b) files.push({ name: stem, bytes: b });
            }
            if (row.item.receipt) {
              const rb = dataUrlToBytes(row.item.receipt);
              if (rb) files.push({ name: stem.replace(/\.jpg$/, '-receipt.jpg'), bytes: rb });
            }
          });
          downloadBytes(makeZip(files), slugify(inv.name) + '-with-photos.zip', 'application/zip');
          markExported();
        } catch (e) { toast('ZIP failed: ' + (e.message || 'unknown error'), { assertive: true, ms: 5000 }); }
        btn.disabled = false;
      } }, 'ZIP')));
  }

  card.append(el('div', { class: 'exportcard' },
    el('div', { class: 'grow' }, el('b', {}, 'Backup file (.json)'), el('span', {}, 'Everything including photos, restorable on any device, readable in a text editor. This is the only export that can be imported back.')),
    el('button', { class: 'btn small', type: 'button', 'aria-label': 'Download backup file', onclick: () => exportBackup(false) }, '.json')));
  out.push(card);

  const durability = el('section', { class: 'card' }, el('h2', {}, 'Will this still be here in three years?'));
  const line = el('p', { class: 'hint', text: 'Checking this device’s storage…' });
  durability.append(line);
  storageFacts().then((f) => {
    const bits = [];
    if (f.supported && f.quota) {
      const pct = Math.round(((f.usage || 0) / f.quota) * 100);
      bits.push('This inventory and its photos use ' + mb(f.usage || 0) + ' of the ' + mb(f.quota) + ' this browser allows the site (' + pct + '%).');
      if (pct > 80) bits.push('That is close to the limit — saving may start to fail. Export now.');
    }
    bits.push(f.persisted
      ? 'The browser has marked this storage durable, so it will not be cleared for being idle.'
      : 'The browser has NOT marked this storage durable. Safari clears an uninstalled site after about seven days of not visiting it — add this to your home screen.');
    line.textContent = bits.join(' ');
  });
  const inst = installCard();
  if (inst) out.push(durability, inst);
  else out.push(durability);
  return out;
}

function markExported() {
  if (!inv) return;
  inv.lastExportAt = Date.now();
  touch();
  toast('Exported ✓ — now email it to yourself or drop it in cloud storage.', { ms: 5000 });
  flush();
}

function exportBackup(urgent) {
  if (!inv) {
    toast('Open an inventory first, then export its backup.', { assertive: true });
    return;
  }
  const blob = new Blob([JSON.stringify(inv)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: slugify(inv.name) + '.inventory.json' });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  if (urgent) toast('Backup written to your downloads — everything, including the changes this device would not store.', { ms: 7000 });
  else markExported();
}

function slugify(s) {
  return String(s || 'inventory').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'inventory';
}
function downloadBytes(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- item dialog ---------- */
let itemEditing = null;
let dlgPhotos = { photo: undefined, receipt: undefined }; // staged: applied on Save only
function openItemDlg(item) {
  itemEditing = item;
  dlgPhotos = { photo: undefined, receipt: undefined };
  const photo = $('iPhoto');
  if (safeSrc(item.photo)) { photo.src = item.photo; photo.classList.remove('hidden'); }
  else photo.classList.add('hidden');
  const rec = $('iReceiptImg');
  if (safeSrc(item.receipt)) { rec.src = item.receipt; rec.classList.remove('hidden'); }
  else rec.classList.add('hidden');
  $('iName').value = item.name;
  const roomSel = $('iRoom');
  roomSel.replaceChildren(...inv.rooms.map(r => el('option', { value: r.id, text: r.name })));
  if (inv.rooms.some(r => r.id === item.roomId)) roomSel.value = item.roomId;
  // full precision — rounding here would corrupt the value on save
  $('iValue').value = item.valueCents ? String(item.valueCents / 100) : '';
  $('iReplace').value = item.replacementCents ? String(item.replacementCents / 100) : '';
  $('iQty').value = String(item.quantity || 1);
  $('iSerial').value = item.serial || '';
  $('iBrand').value = item.brand || '';
  $('iModel').value = item.model || '';
  $('iCondition').value = item.condition || '';
  $('iDate').value = item.purchaseDate || '';
  $('iNotes').value = item.notes || '';
  showDlg($('itemDlg'));
  setTimeout(() => { try { $('iName').focus(); $('iName').select(); } catch (e) {} }, 0);
}

function wire() {
  $('iSave').addEventListener('click', async () => {
    const item = itemEditing;
    if (item) {
      const cents = readMoney($('iValue').value, $('iValue'));
      if (cents === null) return;
      const repl = readMoney($('iReplace').value, $('iReplace'));
      if (repl === null) return;
      const qty = readQty($('iQty').value, $('iQty'));
      if (qty === null) return;
      item.name = $('iName').value.trim().slice(0, LIMITS.name) || item.name;
      item.roomId = $('iRoom').value || item.roomId;
      item.valueCents = cents;
      item.replacementCents = repl;
      item.quantity = qty;
      item.serial = $('iSerial').value.trim().slice(0, LIMITS.serial);
      item.brand = $('iBrand').value.trim().slice(0, LIMITS.brand);
      item.model = $('iModel').value.trim().slice(0, LIMITS.model);
      item.condition = CONDITIONS.indexOf($('iCondition').value) >= 0 ? $('iCondition').value : '';
      item.purchaseDate = $('iDate').value;
      item.notes = $('iNotes').value.trim().slice(0, LIMITS.notes);
      if (dlgPhotos.photo !== undefined) item.photo = dlgPhotos.photo;
      if (dlgPhotos.receipt !== undefined) item.receipt = dlgPhotos.receipt;
      touch(); drawEditor('edit-' + item.id);
      closeDlg($('itemDlg'));
      const ok = await flush();
      if (ok) toast('Saved', { ms: 1400 });
      return;
    }
    closeDlg($('itemDlg'));
  });
  $('iCancel').addEventListener('click', () => closeDlg($('itemDlg')));
  $('iDelete').addEventListener('click', () => {
    const item = itemEditing;
    if (!item) return;
    const before = inv.items.slice();
    inv.items = inv.items.filter(x => x.id !== item.id);
    touch(); drawEditor('search'); flush();
    closeDlg($('itemDlg'));
    undoToast('Deleted “' + item.name + '”' + (item.photo ? ' and its photo.' : '.'), () => {
      inv.items = before;
      touch(); drawEditor('edit-' + item.id); flush();
      toast('Put “' + item.name + '” back');
    });
  });
  $('iRephoto').addEventListener('click', async () => {
    const dataUrl = await pickImage($('iCloseUp').checked ? 'close' : 'wide');
    if (dataUrl && itemEditing) {
      dlgPhotos.photo = dataUrl;          // staged — Cancel discards it
      $('iPhoto').src = dataUrl;
      $('iPhoto').classList.remove('hidden');
    }
  });
  $('iReceipt').addEventListener('click', async () => {
    // A receipt is always a detail shot: full 2400px, and it may come from the
    // photo library rather than the camera.
    const dataUrl = await pickImage('close');
    if (dataUrl && itemEditing) {
      dlgPhotos.receipt = dataUrl;        // staged — Cancel discards it
      $('iReceiptImg').src = dataUrl;
      $('iReceiptImg').classList.remove('hidden');
    }
  });
  $('askField').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); const b = $('askBtns').lastChild; if (b) b.click(); }
  });
  $('askDlg').addEventListener('close', () => { if (askResolve) finishAsk(null); });
  $('askDlg').addEventListener('cancel', () => { if (askResolve) { const r = askResolve; askResolve = null; r(null); } });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    if (route().view === 'home' || tab === 'export') render();
  });
}

/* ---------- boot ---------- */
function render() {
  const r = route();
  if (r.view === 'editor') renderEditor(r.id);
  else renderHome();
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
