// QR Maker — permanent static codes, generated on-device.
import {
  buildPayloadInfo, qrToSvg, drawQrToCanvas, installUtf8, byteLen,
  CAPACITY, EC_LABEL, SIZES, sizeById, sizePlan, slugFor,
} from './helpers.js';

/* Before anything encodes anything. vendor-qrcode.js defaults to
   `charCodeAt(i) & 0xff`, which silently replaces every non-ASCII character —
   a café's own name, an Arabic sign, a Cyrillic SSID — with junk, inside a
   code that scans perfectly. One line, and test/helpers.test.mjs now decodes
   the modules back out to prove it. */
installUtf8(qrcode);

const CONFIG = { tipUrl: 'https://buy.stripe.com/4gM8wQei5b9t9DLbyh7EQ07' };
const STORE_KEY = 'qr-maker.v1';
const MAX_SAVED = 60;      // said out loud in the UI and when it bites
const MAX_BATCH = 200;     // ditto

const $ = (id) => document.getElementById(id);
const UI = window.SWS || {};
const toast = (m, o) => (UI.toast ? UI.toast(m, o) : null);
const undoToast = (m, fn) => (UI.undo ? UI.undo(m, fn) : toast(m));
const fmt = (n) => Number(n).toLocaleString();

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
const show = (id, on) => $(id).classList.toggle('hidden', !on);

const TYPES = [
  ['url', 'Link'],
  ['text', 'Text'],
  ['wifi', 'WiFi'],
  ['tel', 'Phone'],
  ['email', 'Email'],
];
const BATCH_KEY = { url: 'url', text: 'text', tel: 'tel', email: 'email' };
const BATCH_LABEL = {
  url: 'One web address per line',
  text: 'One line of text per code',
  tel: 'One phone number per line',
  email: 'One email address per line',
};

let type = 'url';
let fields = {};          // live field values per type, keyed 'type.field'
let ec = 'M';
let sizeId = 'tent';
let printPass = false;
let saved = [];
let storageWarned = false;

let currentQr = null;
let currentPayload = '';
let currentNotes = [];
let batchPlan = { lines: 0, used: 0, ready: [], problems: [] };
let restoredBatch = '';
const batchText = () => { const n = document.getElementById('batchIn'); return n ? n.value : restoredBatch; };

/* ── Storage ────────────────────────────────────────────────────────────
   localStorage held 0 bytes: a reload wiped the SSID, the password, the
   toughness, the size and the type with no warning before and no restore
   after. It persists now — and because a Wi-Fi password is part of what gets
   kept, the trust stamp says so in as many words. */
function readStore() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return; }
  if (!raw) return;
  let d = null;
  try { d = JSON.parse(raw); } catch (e) { return; }   // corrupt → start clean
  if (!d || typeof d !== 'object') return;
  const dr = (d.draft && typeof d.draft === 'object') ? d.draft : {};
  if (TYPES.some((t) => t[0] === dr.type)) type = dr.type;
  if (dr.fields && typeof dr.fields === 'object') {
    for (const k of Object.keys(dr.fields)) {
      const v = dr.fields[k];
      if (typeof v === 'string' || typeof v === 'boolean') fields[k] = v;
    }
  }
  if (dr.ec === 'M' || dr.ec === 'Q' || dr.ec === 'H') ec = dr.ec;
  if (typeof dr.batch === 'string') restoredBatch = dr.batch;
  if (SIZES.some((s) => s.id === dr.sizeId)) sizeId = dr.sizeId;
  printPass = dr.printPass === true;
  if (Array.isArray(d.saved)) saved = d.saved.filter(saneItem).slice(0, MAX_SAVED);
}

function saneItem(it) {
  return it && typeof it === 'object' &&
    typeof it.payload === 'string' && it.payload.length > 0 &&
    byteLen(it.payload) <= CAPACITY.L;
}

function normalizeItem(it) {
  const lvl = (it.ec === 'M' || it.ec === 'Q' || it.ec === 'H' || it.ec === 'L') ? it.ec : 'M';
  return {
    id: typeof it.id === 'string' && it.id ? it.id : newId(),
    label: typeof it.label === 'string' && it.label ? it.label : it.payload.slice(0, 40),
    payload: it.payload,
    type: TYPES.some((t) => t[0] === it.type) ? it.type : 'text',
    f: (it.f && typeof it.f === 'object') ? it.f : null,
    ec: lvl,
    modules: Number(it.modules) || 0,
    bytes: byteLen(it.payload),
    date: typeof it.date === 'string' ? it.date.slice(0, 10) : today(),
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const newId = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(writeStore, 300);
}
function writeStore() {
  clearTimeout(persistTimer);
  const data = { v: 1, draft: { type, fields, ec, sizeId, printPass, batch: batchText() }, saved };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    if (storageWarned) return;
    storageWarned = true;
    toast('This browser refused to store anything — a private window usually does. Everything still works, but nothing here will survive a reload. Export your kept codes to a file instead.',
      { ms: 9000, assertive: true });
  }
}

/* ── The type selector ──────────────────────────────────────────────────
   Built once and never replaced. It used to be rebuilt with
   replaceChildren() on every click, which dropped focus to <body> the moment
   you pressed Enter on a tab. role="tab" was declared with no aria-selected,
   no tabindex, no aria-controls and no arrow keys — a lie a screen reader
   believes — so these are plain aria-pressed toggles in a labelled group,
   which is the thing they actually are. */
const segBtns = new Map();
function buildTypeSeg() {
  const seg = $('typeSeg');
  seg.replaceChildren();
  for (const [k, label] of TYPES) {
    const b = el('button', {
      type: 'button', 'aria-pressed': 'false',
      onclick: () => {
        if (type === k) return;
        type = k;
        renderFields();
        refreshTypeSeg();
        syncBatchType();
        update();
        persist();
      },
    }, label);
    segBtns.set(k, b);
    seg.append(b);
  }
  refreshTypeSeg();
}
function refreshTypeSeg() {
  for (const [k, b] of segBtns) {
    const on = k === type;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function input(key, attrs) {
  const n = el('input', { ...attrs, value: fields[type + '.' + key] || '' });
  n.addEventListener('input', (ev) => {
    fields[type + '.' + key] = ev.target.value;
    update();
    persist();
  });
  return n;
}

/* The fields panel is rebuilt only when the TYPE changes. The Security select
   used to call renderFields() from its own onchange, destroying the select
   mid-interaction: after choosing "Open (no password)" with the keyboard,
   activeElement was BODY and the control no longer existed. Now only the
   password row is shown or hidden, and focus stays where the user put it. */
let passRow = null;
function renderFields() {
  const box = $('fields');
  box.replaceChildren();
  passRow = null;

  if (type === 'url') {
    box.append(el('label', { class: 'f' }, el('span', {}, 'Web address'),
      input('url', { type: 'url', placeholder: 'skywolf.example or https://…', autocomplete: 'off' })));

  } else if (type === 'text') {
    const ta = el('textarea', { placeholder: 'Any text — a message, an address, a serial number…' });
    ta.value = fields['text.text'] || '';
    ta.addEventListener('input', (ev) => { fields['text.text'] = ev.target.value; update(); persist(); });
    box.append(el('label', { class: 'f' }, el('span', {}, 'Text'), ta));

  } else if (type === 'wifi') {
    const authSel = el('select', {},
      el('option', { value: 'WPA', text: 'WPA / WPA2 (most networks)' }),
      el('option', { value: 'WEP', text: 'WEP (old routers)' }),
      el('option', { value: 'nopass', text: 'Open (no password)' }));
    authSel.value = fields['wifi.auth'] || 'WPA';
    authSel.addEventListener('change', (ev) => {
      fields['wifi.auth'] = ev.target.value;
      syncPassRow();
      update();
      persist();
    });

    passRow = el('label', { class: 'f' }, el('span', {}, 'Password'),
      input('pass', { type: 'text', autocomplete: 'off' }));

    const hid = el('input', { type: 'checkbox' });
    hid.checked = fields['wifi.hidden'] === true;
    hid.addEventListener('change', (ev) => { fields['wifi.hidden'] = ev.target.checked; update(); persist(); });

    box.append(
      el('label', { class: 'f' }, el('span', {}, 'Network name (SSID)'),
        input('ssid', { type: 'text', autocomplete: 'off' })),
      el('label', { class: 'f' }, el('span', {}, 'Security'), authSel),
      passRow,
      el('label', {}, hid, el('span', {}, 'This network is hidden — the router does not broadcast its name')),
      el('p', { class: 'hint', text: 'Guests point their camera at the code and join — no typing, no asking twice. Print it for the fridge or the guest room.' }),
      el('p', { class: 'hint', text: 'There is no WPA3 setting because the Wi-Fi card format has none: it knows WPA/WPA2, WEP and open. Most WPA3 routers accept a WPA card; a few iPhones refuse a WPA3-only network from a scan and have to be joined by hand once, after which they remember it.' }));
    syncPassRow();

  } else if (type === 'tel') {
    box.append(el('label', { class: 'f' }, el('span', {}, 'Phone number'),
      input('tel', { type: 'tel', placeholder: '+1 555 010 1234', autocomplete: 'off' })),
      el('p', { class: 'hint', text: 'Vanity letters (1-800-FLOWERS) and extensions (555 010 1234 x22) are both understood, and the app says underneath exactly what it turned them into.' }));

  } else if (type === 'email') {
    box.append(el('label', { class: 'f' }, el('span', {}, 'Email address'),
      input('email', { type: 'email', placeholder: 'hello@example.com', autocomplete: 'off' })));
  }
}

function syncPassRow() {
  if (!passRow) return;
  passRow.classList.toggle('hidden', (fields['wifi.auth'] || 'WPA') === 'nopass');
}

function currentFields() {
  return {
    url: fields['url.url'],
    text: fields['text.text'],
    ssid: fields['wifi.ssid'], pass: fields['wifi.pass'],
    auth: fields['wifi.auth'], hidden: fields['wifi.hidden'] === true,
    tel: fields['tel.tel'],
    email: fields['email.email'],
  };
}

/* ── The redraw ─────────────────────────────────────────────────────────
   update() used to encode and repaint synchronously on every keystroke:
   1.2 ms on a short payload, a measured 42.5 ms median and 113.4 ms worst on
   a 1,200-character one. Cheap edits stay instant; once a repaint costs real
   time the app coalesces to one repaint per 140 ms of typing. */
let updTimer = null;
let updRaf = 0;
let lastCost = 0;
function update() {
  if (lastCost > 20) {
    if (updRaf) { cancelAnimationFrame(updRaf); updRaf = 0; }
    clearTimeout(updTimer);
    updTimer = setTimeout(runUpdate, 140);
    return;
  }
  if (updRaf) return;
  updRaf = requestAnimationFrame(() => { updRaf = 0; runUpdate(); });
}
function runUpdate() {
  clearTimeout(updTimer);
  updTimer = null;
  const t0 = performance.now();
  doUpdate();
  lastCost = performance.now() - t0;
}

function setWarn(msg) {
  const w = $('capWarn');
  if (w.textContent !== msg) w.textContent = msg;
  w.classList.toggle('hidden', !msg);
}

const plural = (n, word) => fmt(n) + ' ' + word + (Number(n) === 1 ? '' : 's');

function capMessage(bytes, cap) {
  const fits = ['M', 'Q', 'H'].filter((l) => l !== ec && CAPACITY[l] >= bytes);
  const ceiling = ['M', 'Q', 'H'].map((l) => fmt(CAPACITY[l]) + ' at ' + EC_LABEL[l]).join(', ');
  let m = 'Too long for one QR code. This is ' + plural(bytes, 'byte') + ' and ' + EC_LABEL[ec] +
    ' toughness holds ' + fmt(cap) + '. The ceiling for any QR code ever made is ' + ceiling + '. ';
  m += 'Cut ' + plural(bytes - cap, 'byte');
  if (fits.length) m += ', or set Toughness to ' + EC_LABEL[fits[0]] + ', which holds ' + fmt(CAPACITY[fits[0]]);
  m += '. No code was made, and the downloads stay switched off until it fits.';
  return m;
}

function doUpdate() {
  const info = buildPayloadInfo(type, currentFields());
  currentPayload = info.payload;
  currentNotes = info.notes;
  currentQr = null;

  const bytes = byteLen(info.payload);
  const cap = CAPACITY[ec];

  if (info.problem) {
    setWarn(info.problem);
    show('emptyState', false);
    show('qrWrap', false);
  } else if (!info.payload) {
    setWarn('');
    show('emptyState', true);
    show('qrWrap', false);
  } else if (bytes > cap) {
    setWarn(capMessage(bytes, cap));
    show('emptyState', false);
    show('qrWrap', false);
  } else {
    try {
      const qr = qrcode(0, ec);
      qr.addData(info.payload);
      qr.make();
      currentQr = qr;
      setWarn('');
    } catch (e) {
      currentQr = null;
      setWarn('This browser could not build a code from that text (' + (e && e.message ? e.message : e) + '). Nothing was downloaded.');
    }
    show('emptyState', false);
    show('qrWrap', !!currentQr);
    if (currentQr) drawPreview();
  }

  show('readout', !!currentPayload && !info.problem);
  fillReadout(bytes, cap);
  updateSizeInfo();
  buildPrintSheet();
  setEnabled();
}

/* A canvas gets no cascade: it hears nothing about the text-size setting, the
   density setting or the OS flipping to dark. SWS.onComfortChange is wired to
   this so the preview is redrawn at whatever size the box actually became. */
function drawPreview() {
  if (!currentQr) return;
  const wrap = $('qrWrap');
  const canvas = $('qrCanvas');
  const pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
  const box = Math.max(160, Math.min(420, (wrap.clientWidth || 332) - pad * 2));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const px = drawQrToCanvas(currentQr, canvas, Math.round(box * dpr), true);
  const css = Math.round(px / dpr);
  canvas.style.width = css + 'px';
  canvas.style.height = css + 'px';
  const n = currentQr.getModuleCount();
  canvas.setAttribute('aria-label',
    'QR code preview, ' + n + ' modules square. The exact text it encodes is written out below the code.');
}

function fillReadout(bytes, cap) {
  $('payloadOut').textContent = currentPayload;
  const meta = [fmt(bytes) + ' of ' + fmt(cap) + ' bytes used at ' + EC_LABEL[ec] + ' toughness'];
  if (currentQr) {
    const n = currentQr.getModuleCount();
    meta.push(n + ' × ' + n + ' modules');
    meta.push('version ' + ((n - 17) / 4));
  }
  $('payloadMeta').textContent = meta.join(' · ');

  const ul = $('notesList');
  ul.replaceChildren();
  for (const n of currentNotes) {
    const warnish = n.level === 'warn';
    ul.append(el('li', { class: warnish ? 'lv-warn' : 'lv-info' },
      el('span', { class: 'mk', 'aria-hidden': 'true' }, warnish ? '!' : '→'),
      el('span', { class: 'grow' }, n.text)));
  }
  ul.classList.toggle('hidden', currentNotes.length === 0);
}

function updateSizeInfo() {
  const size = sizeById(sizeId);
  const line = $('sizeInfo');
  if (!currentQr) {
    line.textContent = 'Pick the object this code is going on. The app then states the pixel count and the DPI it actually achieves, instead of a pixel number it cannot keep.';
    return;
  }
  const p = sizePlan(size, currentQr.getModuleCount());
  let msg = 'PNG: ' + size.mm + ' mm wide · ' + fmt(p.px) + ' × ' + fmt(p.px) + ' px · ' + fmt(p.dpi) +
    ' DPI · each square ' + p.moduleMm.toFixed(2) + ' mm. Rounded up to a whole module, so the file is never smaller than the size asked for.';
  if (p.moduleMm < 0.4) {
    msg += ' Warning: under 0.4 mm a square starts to fall below what a phone camera resolves. Print it bigger, shorten the text, or lower Toughness so the code has fewer squares.';
  }
  msg += ' The SVG carries the same ' + size.mm + ' mm on its face and has no pixels to run out of.';
  line.textContent = msg;
}

function setEnabled() {
  const hasQr = !!currentQr;
  for (const id of ['dlSvg', 'dlPng', 'doPrint', 'saveCode']) $(id).disabled = !hasQr;
  $('copyPayload').disabled = !currentPayload;
  show('printPassWrap', type === 'wifi' && (fields['wifi.auth'] || 'WPA') !== 'nopass');
}

/* ── Print ──────────────────────────────────────────────────────────────
   Rendered from the vector at a stated physical width, with the destination
   in legible text underneath: someone about to scan a sticker in a car park
   can read where it goes before they point a camera at it. */
const svgDataUri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

function hostOf(u) {
  return String(u).replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0] || u;
}

function buildPrintSheet() {
  const img = $('printImg');
  if (!currentQr) { img.removeAttribute('src'); return; }
  const size = sizeById(sizeId);
  const f = currentFields();
  img.src = svgDataUri(qrToSvg(currentQr, { mm: size.mm }));
  $('printSheet').style.setProperty('--print-mm', size.mm + 'mm');

  let kicker = 'Scan me';
  let title = '';
  let sub = '';
  if (type === 'wifi') {
    kicker = 'Wi-Fi';
    title = String(f.ssid || '').trim();
    const auth = f.auth === 'nopass' ? 'open, no password' : (f.auth === 'WEP' ? 'WEP' : 'WPA / WPA2');
    sub = 'Point a phone camera at the code to join. Security: ' + auth + '.' + (f.hidden ? ' Hidden network.' : '');
  } else if (type === 'url') {
    title = hostOf(currentPayload);
    sub = currentPayload;
  } else if (type === 'tel') {
    kicker = 'Call';
    title = currentPayload.replace(/^tel:/, '').replace(';ext=', ' ext. ');
  } else if (type === 'email') {
    kicker = 'Email';
    title = currentPayload.replace(/^mailto:/, '');
  } else if (currentPayload.length <= 60) {
    title = currentPayload;
  } else {
    sub = currentPayload;
  }
  $('printKicker').textContent = kicker;
  $('printTitle').textContent = title;
  $('printSub').textContent = sub;

  const wantPass = type === 'wifi' && printPass && f.auth !== 'nopass' && !!f.pass;
  $('printPassLine').textContent = wantPass ? 'Password: ' + f.pass : '';
  show('printPassLine', wantPass);

  const n = currentQr.getModuleCount();
  $('printFoot').textContent = 'Static QR code · ' + n + ' × ' + n + ' modules · printed ' + size.mm +
    ' mm wide · ' + EC_LABEL[ec] + ' error correction · made offline with QR Maker. It points at one fixed thing and nobody can switch it off.';
}

function download(href, filename) {
  const a = el('a', { href, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 300);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filenameFor(extn, label) {
  const base = label ? slugFor('text', { text: label }, label) : slugFor(type, currentFields(), currentPayload);
  return 'qr-' + base + '.' + extn;
}

/* ── Kept codes ─────────────────────────────────────────────────────────── */
function defaultLabel() {
  const f = currentFields();
  if (type === 'wifi') return String(f.ssid || '').trim() || 'Wi-Fi';
  if (type === 'url') return hostOf(currentPayload);
  if (type === 'tel') return currentPayload.replace(/^tel:/, '');
  if (type === 'email') return currentPayload.replace(/^mailto:/, '');
  const t = String(f.text || '').trim().split(/\s+/).slice(0, 6).join(' ');
  return t || 'Text';
}

function saveCurrent() {
  if (!currentQr) return;
  if (saved.length >= MAX_SAVED) {
    toast('This device already holds ' + MAX_SAVED + ' kept codes, which is the limit here. Delete one, or export all ' +
      MAX_SAVED + ' to a file first — nothing is thrown away silently.', { ms: 9000, assertive: true });
    return;
  }
  const item = {
    id: newId(),
    label: defaultLabel(),
    payload: currentPayload,
    type,
    f: currentFields(),
    ec,
    modules: currentQr.getModuleCount(),
    bytes: byteLen(currentPayload),
    date: today(),
  };
  saved.unshift(item);
  renderSaved();
  writeStore();
  if (UI.saved) UI.saved({ text: 'Kept' });
  toast('Kept “' + item.label + '” in this browser, on this device. ' + saved.length + ' of ' + MAX_SAVED + '.', { ms: 5000 });
}

function loadSaved(it) {
  type = TYPES.some((t) => t[0] === it.type) ? it.type : 'text';
  ec = it.ec === 'L' ? 'M' : it.ec;
  if (it.f) {
    fields[type + '.url'] = it.f.url || fields[type + '.url'];
    if (type === 'wifi') {
      fields['wifi.ssid'] = it.f.ssid || '';
      fields['wifi.pass'] = it.f.pass || '';
      fields['wifi.auth'] = it.f.auth || 'WPA';
      fields['wifi.hidden'] = it.f.hidden === true;
    } else if (type === 'url') fields['url.url'] = it.f.url || '';
    else if (type === 'tel') fields['tel.tel'] = it.f.tel || '';
    else if (type === 'email') fields['email.email'] = it.f.email || '';
    else fields['text.text'] = it.f.text || it.payload;
  } else if (type === 'text') {
    fields['text.text'] = it.payload;
  }
  $('ecLevel').value = ec;
  renderFields();
  refreshTypeSeg();
  syncBatchType();
  runUpdate();
  persist();
  toast('Opened “' + it.label + '” — same text, same toughness, so an export now is byte-for-byte the one you kept on ' + it.date + '.', { ms: 6000 });
}

function qrFor(payload, level) {
  const q = qrcode(0, level);
  q.addData(payload);
  q.make();
  return q;
}

function exportSaved(it, kind) {
  let q;
  try { q = qrFor(it.payload, it.ec); } catch (e) {
    toast('That kept code will not rebuild in this browser: ' + (e && e.message ? e.message : e), { assertive: true });
    return;
  }
  const size = sizeById(sizeId);
  if (kind === 'svg') {
    downloadBlob(new Blob([qrToSvg(q, { mm: size.mm })], { type: 'image/svg+xml' }), filenameFor('svg', it.label));
  } else {
    const off = document.createElement('canvas');
    drawQrToCanvas(q, off, sizePlan(size, q.getModuleCount()).px, false);
    download(off.toDataURL('image/png'), filenameFor('png', it.label));
  }
  toast('Saved ' + filenameFor(kind, it.label) + ' — identical to the one kept on ' + it.date + '.', { ms: 5000 });
}

function deleteSaved(id) {
  const snapshot = saved.slice();
  const it = saved.find((s) => s.id === id);
  if (!it) return;
  saved = saved.filter((s) => s.id !== id);
  renderSaved();
  writeStore();
  undoToast('Deleted “' + it.label + '”.', () => { saved = snapshot; renderSaved(); writeStore(); });
}

function clearSaved() {
  if (!saved.length) return;
  const snapshot = saved.slice();
  const n = saved.length;
  saved = [];
  renderSaved();
  writeStore();
  undoToast('Cleared ' + n + ' kept code' + (n === 1 ? '' : 's') + ' from this device.',
    () => { saved = snapshot; renderSaved(); writeStore(); });
}

function renderSaved() {
  const ul = $('savedList');
  ul.replaceChildren();
  for (const it of saved) {
    const name = el('input', { type: 'text', value: it.label, 'aria-label': 'Name for the kept code ' + it.label });
    name.addEventListener('change', (ev) => {
      it.label = ev.target.value;
      writeStore();
      if (UI.saved) UI.saved({ text: 'Renamed' });
    });
    const meta = el('span', {
      class: 'sv-meta',
      title: it.payload,
      text: it.payload + ' — ' + EC_LABEL[it.ec] + ' · ' + it.modules + ' × ' + it.modules +
        ' modules · ' + fmt(it.bytes) + ' bytes · kept ' + it.date,
    });
    ul.append(el('li', {},
      el('div', { class: 'sv-main' }, name, meta),
      el('div', { class: 'sv-acts' },
        el('button', { class: 'btn', type: 'button', 'aria-label': 'Open ' + it.label, onclick: () => loadSaved(it) }, 'Open'),
        el('button', { class: 'btn', type: 'button', 'aria-label': 'Download SVG of ' + it.label, onclick: () => exportSaved(it, 'svg') }, 'SVG'),
        el('button', { class: 'btn', type: 'button', 'aria-label': 'Download PNG of ' + it.label, onclick: () => exportSaved(it, 'png') }, 'PNG'),
        el('button', { class: 'btn danger', type: 'button', 'aria-label': 'Delete ' + it.label, onclick: () => deleteSaved(it.id) }, 'Delete'))));
  }
  show('savedEmpty', saved.length === 0);
  $('savedCount').textContent = saved.length
    ? saved.length + ' of ' + MAX_SAVED + ' kept here. They live in this browser on this device only — clearing site data removes them, and no copy exists anywhere else.'
    : '';
  $('clearSaved').disabled = saved.length === 0;
  $('exportJson').disabled = saved.length === 0;
}

function exportJson() {
  const doc = { app: 'qr-maker', v: 1, exported: new Date().toISOString(), codes: saved };
  downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
    'qr-maker-codes-' + today() + '.json');
  toast('Exported ' + saved.length + ' code' + (saved.length === 1 ? '' : 's') + ' — file it with the artwork.', { ms: 5000 });
}

function importJson(file) {
  const r = new FileReader();
  r.onerror = () => toast('That file could not be read.', { assertive: true });
  r.onload = () => {
    let d = null;
    try { d = JSON.parse(String(r.result)); } catch (e) {
      toast('That is not a QR Maker export — the file is not readable JSON.', { assertive: true });
      return;
    }
    const incoming = Array.isArray(d) ? d : (d && Array.isArray(d.codes) ? d.codes : null);
    if (!incoming) {
      toast('That is a JSON file, but there is no list of codes in it.', { assertive: true });
      return;
    }
    const clean = incoming.filter(saneItem).map(normalizeItem);
    const room = Math.max(0, MAX_SAVED - saved.length);
    const take = clean.slice(0, room);
    const snapshot = saved.slice();
    saved = saved.concat(take);
    renderSaved();
    writeStore();
    let msg = 'Imported ' + take.length + ' of ' + incoming.length + ' entries.';
    if (clean.length < incoming.length) msg += ' ' + (incoming.length - clean.length) + ' were not usable codes.';
    if (take.length < clean.length) msg += ' ' + (clean.length - take.length) + ' more did not fit: this device holds ' + MAX_SAVED + '.';
    undoToast(msg, () => { saved = snapshot; renderSaved(); writeStore(); });
  };
  r.readAsText(file);
}

/* ── Batch ──────────────────────────────────────────────────────────────
   'Tobias abandoned thirty Chromebook labels at device four.' The paid tier
   at three competitors; here it is arithmetic the browser already does. */
function syncBatchType() {
  const usable = !!BATCH_KEY[type];
  $('batchLabel').textContent = usable ? BATCH_LABEL[type] : 'Not available for Wi-Fi codes';
  $('batchIn').disabled = !usable;
  if (!usable) {
    $('batchIn').setAttribute('placeholder', '');
    $('batchStatus').textContent = 'Batch works for links, text, phone numbers and email addresses. A stack of Wi-Fi cards would all carry the same password, so there is nothing to batch — switch to one of the other four types.';
    $('batchProblems').classList.add('hidden');
    batchPlan = { lines: 0, used: 0, ready: [], problems: [] };
    $('batchPrint').disabled = true;
    $('batchZip').disabled = true;
    return;
  }
  $('batchIn').setAttribute('placeholder', {
    url: 'skywolf.example/menu\nskywolf.example/wine\nskywolf.example/hours',
    text: 'Chromebook 01\nChromebook 02\nChromebook 03',
    tel: '+1 555 010 1234\n+1 555 010 5678',
    email: 'front@example.com\nback@example.com',
  }[type]);
  analyzeBatch();
}

function analyzeBatch() {
  if (!BATCH_KEY[type]) return;
  const all = $('batchIn').value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length);
  const used = all.slice(0, MAX_BATCH);
  const ready = [];
  const problems = [];
  used.forEach((line, i) => {
    const f = {};
    f[BATCH_KEY[type]] = line;
    const info = buildPayloadInfo(type, f);
    if (info.problem) { problems.push('Line ' + (i + 1) + ' — ' + info.problem); return; }
    if (!info.payload) { problems.push('Line ' + (i + 1) + ' — nothing to encode.'); return; }
    const b = byteLen(info.payload);
    if (b > CAPACITY[ec]) {
      problems.push('Line ' + (i + 1) + ' — ' + fmt(b) + ' bytes, over the ' + fmt(CAPACITY[ec]) +
        '-byte limit at ' + EC_LABEL[ec] + ' toughness. Skipped.');
      return;
    }
    ready.push({ line, payload: info.payload });
  });
  batchPlan = { lines: all.length, used: used.length, ready, problems };

  const bits = [];
  if (!all.length) {
    bits.push('Nothing pasted yet. Every line becomes its own code, and every code is named after the line that made it.');
  } else {
    bits.push(fmt(all.length) + ' line' + (all.length === 1 ? '' : 's') + ' · ' + fmt(ready.length) + ' code' + (ready.length === 1 ? '' : 's') + ' ready');
    if (all.length > MAX_BATCH) {
      bits.push('this sheet holds ' + fmt(MAX_BATCH) + ', so the last ' + fmt(all.length - MAX_BATCH) + ' lines were not used — nothing was dropped quietly');
    }
    if (problems.length) bits.push(fmt(problems.length) + ' line' + (problems.length === 1 ? '' : 's') + ' could not be used, listed below');
  }
  $('batchStatus').textContent = bits.join(' · ') + '.';

  const ul = $('batchProblems');
  ul.replaceChildren();
  for (const p of problems) {
    ul.append(el('li', { class: 'lv-warn' }, el('span', { class: 'mk', 'aria-hidden': 'true' }, '!'), el('span', { class: 'grow' }, p)));
  }
  ul.classList.toggle('hidden', problems.length === 0);

  $('batchPrint').disabled = ready.length === 0;
  $('batchZip').disabled = ready.length === 0;
}

function encodeBatch() {
  const out = [];
  for (const r of batchPlan.ready) {
    try { out.push({ ...r, qr: qrFor(r.payload, ec) }); } catch (e) { /* already capacity-checked */ }
  }
  return out;
}

function printBatch() {
  const items = encodeBatch();
  if (!items.length) return;
  const mm = 45;
  const grid = $('batchGrid');
  grid.replaceChildren();
  $('batchSheet').style.setProperty('--batch-mm', mm + 'mm');
  for (const it of items) {
    grid.append(el('div', { class: 'bs-item' },
      el('img', { src: svgDataUri(qrToSvg(it.qr, { mm })), alt: '' }),
      el('p', { class: 'bs-label' }, it.line)));
  }
  $('batchFoot').textContent = items.length + ' static QR codes · each printed ' + mm + ' mm wide · ' +
    EC_LABEL[ec] + ' error correction · made offline with QR Maker. None of them expire.';
  document.body.classList.add('printing-batch');
  window.print();
}

/* ── A zip, written by hand, because a dependency is not allowed and this is
   90 lines of arithmetic. Stored (uncompressed) entries: an SVG is small and
   a print shop only has to open it. ─────────────────────────────────────── */
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);   // UTF-8 names
    dv.setUint16(8, 0, true);        // stored
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, name.length, true);
    lh.set(name, 30);
    parts.push(lh, f.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += lh.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

function zipBatch() {
  const items = encodeBatch();
  if (!items.length) return;
  const size = sizeById(sizeId);
  const enc = new TextEncoder();
  const seen = new Map();
  const files = items.map((it) => {
    let base = slugFor('text', { text: it.line }, it.line);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    if (n > 1) base += '-' + n;
    return { name: base + '.svg', data: enc.encode(qrToSvg(it.qr, { mm: size.mm })) };
  });
  downloadBlob(zipStore(files), 'qr-codes-' + today() + '.zip');
  toast(files.length + ' SVG files, each named after its line, at ' + size.mm + ' mm. Built here — the zip never left the device.', { ms: 6000 });
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */
function copyPayload() {
  const text = currentPayload;
  if (!text) return;
  const done = () => toast('Copied. This is the whole string a scanner reads — paste it anywhere to check it.', { ms: 4000 });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else fallback();
  function fallback() {
    const ta = el('textarea', { });
    ta.value = text;
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) done();
    else toast('This browser blocked the copy. The text is on screen above — select it and copy by hand.', { ms: 6000, assertive: true });
  }
}

function wire() {
  const sel = $('pngSize');
  sel.replaceChildren();
  for (const s of SIZES) sel.append(el('option', { value: s.id, text: s.label }));
  sel.value = sizeId;
  sel.addEventListener('change', (ev) => {
    sizeId = ev.target.value;
    updateSizeInfo();
    buildPrintSheet();
    persist();
  });

  $('ecLevel').value = ec;
  $('ecLevel').addEventListener('change', (ev) => { ec = ev.target.value; runUpdate(); analyzeBatch(); persist(); });

  $('printPassChk').checked = printPass;
  $('printPassChk').addEventListener('change', (ev) => { printPass = ev.target.checked; buildPrintSheet(); persist(); });

  $('copyPayload').addEventListener('click', copyPayload);

  $('dlSvg').addEventListener('click', () => {
    if (!currentQr) return;
    const size = sizeById(sizeId);
    downloadBlob(new Blob([qrToSvg(currentQr, { mm: size.mm })], { type: 'image/svg+xml' }), filenameFor('svg'));
    toast('Saved ' + filenameFor('svg') + ' — a vector at ' + size.mm + ' mm, scales to a billboard, yours forever.', { ms: 5000 });
  });

  $('dlPng').addEventListener('click', () => {
    if (!currentQr) return;
    const size = sizeById(sizeId);
    const plan = sizePlan(size, currentQr.getModuleCount());
    const off = document.createElement('canvas');
    drawQrToCanvas(currentQr, off, plan.px, false);
    download(off.toDataURL('image/png'), filenameFor('png'));
    toast('Saved ' + filenameFor('png') + ' — ' + fmt(plan.px) + ' × ' + fmt(plan.px) + ' px, ' + fmt(plan.dpi) +
      ' DPI at ' + size.mm + ' mm.', { ms: 5000 });
  });

  $('doPrint').addEventListener('click', () => {
    if (!currentQr) return;
    document.body.classList.remove('printing-batch');
    window.print();
  });

  $('saveCode').addEventListener('click', saveCurrent);
  $('exportJson').addEventListener('click', exportJson);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) importJson(f);
    ev.target.value = '';
  });
  $('clearSaved').addEventListener('click', clearSaved);

  let batchTimer = null;
  $('batchIn').addEventListener('input', () => {
    clearTimeout(batchTimer);
    batchTimer = setTimeout(() => { analyzeBatch(); persist(); }, 250);
  });
  $('batchPrint').addEventListener('click', printBatch);
  $('batchZip').addEventListener('click', zipBatch);

  window.addEventListener('afterprint', () => document.body.classList.remove('printing-batch'));

  if (UI.onComfortChange) UI.onComfortChange(() => { if (currentQr) drawPreview(); });
  window.addEventListener('resize', () => { if (currentQr) drawPreview(); });
}

function setTrust() {
  $('trustText').textContent =
    'Every code here is built by this page, on this device. QR Maker makes no network requests at all — ' +
    'it works with the Wi-Fi off, and no server ever sees your link, your network name or your password. ' +
    'Codes you keep (a Wi-Fi password among them) are stored in this browser on this device only, and ' +
    '“Clear all” removes them.';
}

function init() {
  readStore();
  wire();
  setTrust();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  buildTypeSeg();
  renderFields();
  if (restoredBatch) $('batchIn').value = restoredBatch;
  syncBatchType();
  renderSaved();
  runUpdate();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
