// Scan to PDF — capture, verify, reorder, rotate, export. All on-device.
import {
  moveItem, normRot, formatBytes, estimatePdfBytes, todayStamp, safeFileName, NAME_MAX,
} from './helpers.js';
import { makePdfFromImages } from './pdf.js';
import * as store from './store.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/4gM28s0rfb9t7vD7i17EQ0g' };

/* Every limit this app has, in one place. Each one is printed on the page
   BEFORE it bites and named with its real number WHEN it bites — a cap you
   discover afterwards is the thing people actually resent. */
const LIMITS = {
  pages: 100,
  bytes: 150 * 1024 * 1024,
  masterSide: 2600,        // long edge kept from the camera; ~230 dpi on Letter
  masterQuality: 0.88,
  nameChars: NAME_MAX,
};

/* Export quality only ever goes DOWN from what was captured, so the default
   path re-encodes nothing and loses nothing. */
const QUALITY = {
  standard: { label: 'Standard', side: 0, q: 0 },
  small: { label: 'Smaller', side: 1600, q: 0.72 },
  tiny: { label: 'Smallest', side: 1100, q: 0.6 },
};

const SIZE_NAME = { letter: 'US Letter', a4: 'A4', fit: 'Fit to image' };

const $ = (id) => document.getElementById(id);

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

/* sws-ui.js is a blocking script in <head>, so SWS is always here — but a
   missing Undo must never fail silently, so the fallback still speaks. */
function say(msg, opts) {
  if (window.SWS && SWS.toast) return SWS.toast(msg, opts);
  const t = $('toast');
  if (t) { t.textContent = msg; t.classList.add('show'); }
  return null;
}
function sayUndo(msg, onUndo) {
  if (window.SWS && SWS.undo) return SWS.undo(msg, onUndo);
  return say(msg + ' (undo unavailable)');
}
/* A screen-reader-only channel, so reorder and rotation are audible without
   putting a toast over the thumb zone on every single tap. */
function announce(msg) {
  const n = $('live');
  if (n) n.textContent = msg;
}

let pages = [];        // { id, blob, url, w, h, rot, t }
let idSeq = 0;
let persistOK = true;
let busy = false;
let viewing = null;    // page id currently open in the viewer
let pendingRetakeUndo = null;

const byId = (id) => pages.find((p) => p.id === id) || null;
const indexOf = (id) => pages.findIndex((p) => p.id === id);
const totalBytes = () => pages.reduce((a, p) => a + (p.blob ? p.blob.size : 0), 0);

function newId() {
  return 'p' + Date.now().toString(36) + '-' + (idSeq++).toString(36) + '-' +
    Math.random().toString(36).slice(2, 7);
}

function urlFor(p) {
  if (!p.url) p.url = URL.createObjectURL(p.blob);
  return p.url;
}

function clockOf(p) {
  if (!p.t) return '';
  try { return new Date(p.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch (e) { return ''; }
}

/* ── capture ──────────────────────────────────────────────────────────────
   Decoding IS the acceptance test. If this browser cannot turn the file into
   pixels it can never be embedded either, so it is refused by name here
   instead of becoming a card that quietly vanishes from the export. */

async function toBitmap(src) {
  try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); }
  catch (e) {
    /* The option is newer than the function; never reject a photo over it. */
    return await createImageBitmap(src);
  }
}

async function capture(file, maxSide, quality) {
  const bmp = await toBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob || !blob.size) throw new Error('encode-failed');
  return { blob, w, h };
}

function whyRejected(file, err) {
  const name = (file && file.name) || 'That file';
  const type = (file && file.type) || '';
  const ext = ((name.match(/\.([a-z0-9]+)$/i) || [, ''])[1] || '').toLowerCase();
  if (!file || !file.size) return name + ' is empty (0 bytes), so there was nothing to add.';
  if (ext === 'heic' || ext === 'heif' || /hei[cf]/i.test(type)) {
    return name + ' — this browser can’t read HEIC photos. On iPhone set Settings › Camera › ' +
      'Formats to “Most Compatible” and re-take it, or share the photo as JPEG first.';
  }
  if (String(err && err.message) === 'encode-failed') {
    return name + ' was too big for this browser to turn into a page.';
  }
  return name + ' isn’t an image this browser can read, so it was not added.';
}

/* ── persistence ────────────────────────────────────────────────────────── */

function noPersist(e) {
  if (!persistOK) return;
  persistOK = false;
  const full = !!(e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || ''))));
  const msg = full
    ? 'This browser’s storage is full, so pages have stopped being saved for later. They are ' +
      'still here until you reload or close the tab — make the PDF now.'
    : 'This browser won’t let the app keep pages for later (private windows usually block it). ' +
      'Your pages are still here until you reload or close the tab.';
  const note = $('persistNote');
  if (note) { note.textContent = msg; note.classList.remove('hidden'); }
  say(msg, { ms: 10000, assertive: true });
}

/* One queue for every write. Undo is one tap and can land while the delete
   it is undoing is still in flight — unserialised, the delete finishes last
   and the page comes back on screen but not in storage, so the next reload
   loses it. A chain costs nothing and makes that impossible. */
let writes = Promise.resolve();

function queue(fn) {
  if (!persistOK) return writes;
  writes = writes.then(fn).then(
    () => { store.writeOrder(pages); },
    (e) => { noPersist(e); },
  );
  return writes;
}

const persistPage = (p) => queue(() => store.putPage(p));
const persistRemoval = (id) => queue(() => store.deletePage(id));
const persistRestore = (snapshot) => queue(() => store.putMany(snapshot));
const persistClear = () => queue(() => store.clearPages());

function persistOrder() {
  if (!persistOK) return;
  /* Order and rotation are the small record; they still go through the queue
     so they can never be written before the blob they describe. */
  queue(() => {});
}

/* ── rendering ────────────────────────────────────────────────────────────
   render() replaces the whole list, so focus has to be carried across it by
   page id. Without that, Enter on "Move earlier" drops the keyboard back to
   the top of a 20-page document on every single reorder. */

function focusKey() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.pid) return null;
  return { pid: a.dataset.pid, act: a.dataset.act || '' };
}

function restoreFocus(key) {
  if (!key) return;
  let sel;
  try { sel = '[data-pid="' + CSS.escape(key.pid) + '"]'; } catch (e) { return; }
  const exact = document.querySelector(sel + '[data-act="' + key.act + '"]');
  if (exact && !exact.disabled) { exact.focus(); return; }
  const any = document.querySelector(sel + ':not([disabled])');
  if (any) any.focus();
}

function pageAlt(p, i) {
  const bits = ['Page ' + (i + 1) + ' of ' + pages.length];
  const c = clockOf(p);
  if (c) bits.push('photographed at ' + c);
  if (p.rot) bits.push('turned ' + p.rot + '°');
  return bits.join(', ');
}

function applyRot(img, rot) {
  img.style.setProperty('--rot', rot + 'deg');
  img.classList.toggle('swap', rot === 90 || rot === 270);
}

function ctl(glyph, label, act, pid, onclick, disabled, extra) {
  return el('button', {
    class: 'btn' + (extra ? ' ' + extra : ''),
    type: 'button',
    'aria-label': label,
    'data-pid': pid,
    'data-act': act,
    disabled: !!disabled,
    onclick,
  }, el('span', { 'aria-hidden': 'true', text: glyph }));
}

function card(p, i) {
  const n = i + 1;
  const img = el('img', { alt: pageAlt(p, i) });
  applyRot(img, p.rot);
  img.src = urlFor(p);

  const shot = el('button', {
    class: 'shot',
    type: 'button',
    'data-pid': p.id,
    'data-act': 'open',
    'aria-label': 'Open page ' + n + ' of ' + pages.length +
      (clockOf(p) ? ', photographed at ' + clockOf(p) : '') +
      ', full size — check it, rotate it or retake it',
    onclick: () => openViewer(p.id),
  }, img);

  const meta = el('p', { class: 'pagemeta' },
    el('b', { class: 'num', text: 'Page ' + n }),
    el('span', {
      class: 'sub',
      text: [clockOf(p), formatBytes(p.blob ? p.blob.size : 0), p.rot ? p.rot + '° turn' : '']
        .filter(Boolean).join(' · '),
    }));

  const acts = el('div', { class: 'acts noprint' },
    ctl('↺', 'Rotate page ' + n + ' left', 'rotl', p.id, () => rotate(p.id, -90), false),
    ctl('↻', 'Rotate page ' + n + ' right', 'rotr', p.id, () => rotate(p.id, +90), false),
    ctl('←', 'Move page ' + n + ' earlier', 'up', p.id, () => move(p.id, -1), i === 0),
    ctl('→', 'Move page ' + n + ' later', 'down', p.id, () => move(p.id, +1), i === pages.length - 1),
    ctl('✕', 'Delete page ' + n, 'del', p.id, () => del(p.id), false, 'danger'));

  return el('div', { class: 'pagecard' }, shot, el('div', { class: 'pageside' }, meta, acts));
}

function render() {
  const key = focusKey();
  const box = $('pages');
  const frag = document.createDocumentFragment();
  pages.forEach((p, i) => frag.append(card(p, i)));
  box.replaceChildren(frag);

  const head = pages.length
    ? pages.length + (pages.length === 1 ? ' page' : ' pages')
    : 'Pages';
  if ($('pageHead').textContent !== head) $('pageHead').textContent = head;

  $('emptyHint').classList.toggle('hidden', pages.length > 0);
  const clear = $('clearBtn');
  clear.classList.toggle('hidden', pages.length === 0);
  clear.disabled = busy;
  restoreFocus(key);
}

/* ── page actions ─────────────────────────────────────────────────────── */

function rotate(id, delta) {
  const p = byId(id);
  if (!p) return;
  p.rot = normRot(p.rot + delta);
  persistOrder();
  render();
  if (viewing === id) paintViewer();
  announce('Page ' + (indexOf(id) + 1) + ' turned to ' + p.rot + ' degrees.');
}

function move(id, delta) {
  const i = indexOf(id);
  if (i < 0) return;
  const next = moveItem(pages, i, delta);
  if (next === pages) return;
  pages = next;
  persistOrder();
  render();
  announce('Page moved to position ' + (i + delta + 1) + ' of ' + pages.length + '.');
}

function del(id) {
  const i = indexOf(id);
  if (i < 0) return;
  const snapshot = pages.slice();
  pages = pages.slice(0, i).concat(pages.slice(i + 1));
  persistRemoval(id);
  if (viewing === id) closeViewer(false);
  render();
  updateEstimate();

  /* Land the keyboard on the page that took the deleted one's place. */
  const after = $('pages').querySelectorAll('[data-act="del"]');
  const target = after[Math.min(i, after.length - 1)] || $('camBtn');
  if (target) target.focus();

  sayUndo('Page ' + (i + 1) + ' deleted', () => {
    pages = snapshot;
    persistRestore(snapshot);
    render();
    updateEstimate();
    announce('Page ' + (i + 1) + ' is back. ' + pages.length + ' pages.');
  });
}

function clearAll() {
  if (!pages.length) return;
  const snapshot = pages.slice();
  const n = snapshot.length;
  pages = [];
  persistClear();
  closeViewer(false);
  hideRestoreBar();
  render();
  updateEstimate();
  $('camBtn').focus();
  sayUndo('All ' + n + (n === 1 ? ' page' : ' pages') + ' cleared from this browser', () => {
    pages = snapshot;
    persistRestore(snapshot);
    render();
    updateEstimate();
    announce(n + ' pages restored.');
  });
}

/* ── adding ───────────────────────────────────────────────────────────── */

function status(msg) {
  const n = $('addStatus');
  n.textContent = msg || '';
  n.classList.toggle('hidden', !msg);
}

function setBusy(on) {
  busy = on;
  ['camBtn', 'libBtn', 'makeBtn', 'clearBtn', 'viewRetake', 'viewDelete'].forEach((id) => {
    const n = $(id);
    if (n) n.disabled = on;
  });
  $('pages').setAttribute('aria-busy', on ? 'true' : 'false');
}

async function addFiles(list) {
  const files = [...(list || [])].filter(Boolean);
  if (!files.length || busy) return;
  setBusy(true);
  hideRestoreBar();

  const rejected = [];
  let added = 0;
  let stopped = '';
  let i = 0;

  for (; i < files.length; i++) {
    if (pages.length >= LIMITS.pages) { stopped = 'pages'; break; }
    if (totalBytes() >= LIMITS.bytes) { stopped = 'bytes'; break; }
    status(files.length > 1 ? 'Adding photo ' + (i + 1) + ' of ' + files.length + '…' : 'Adding the photo…');
    let shot = null;
    try { shot = await capture(files[i], LIMITS.masterSide, LIMITS.masterQuality); }
    catch (e) { rejected.push(whyRejected(files[i], e)); continue; }
    const p = { id: newId(), blob: shot.blob, w: shot.w, h: shot.h, rot: 0, t: Date.now() };
    pages.push(p);
    added++;
    render();                     // every capture shows up the moment it lands
    await persistPage(p);
  }

  setBusy(false);
  status('');
  updateEstimate();
  /* Disabling the button the user just pressed drops focus to <body>. */
  if (document.activeElement === document.body) $('camBtn').focus();

  const notAdded = files.length - i;
  const parts = [];
  if (added) parts.push(added + (added === 1 ? ' page added' : ' pages added') + ' — ' + pages.length + ' in this PDF');
  if (stopped === 'pages') {
    parts.push('That is the ' + LIMITS.pages + '-page limit for one PDF, so ' + notAdded +
      ' more photo(s) were not added. Make this PDF, then start the next one.');
  } else if (stopped === 'bytes') {
    parts.push('That is ' + formatBytes(LIMITS.bytes) + ' of scans in one go, so ' + notAdded +
      ' more photo(s) were not added. Make this PDF, then start the next one.');
  }
  if (rejected.length === 1) parts.push(rejected[0]);
  else if (rejected.length > 1) parts.push(rejected.length + ' files could not be read. ' + rejected.join(' '));

  const bad = !!(stopped || rejected.length);
  if (parts.length) say(parts.join(' '), { ms: bad ? 11000 : 2800, assertive: bad });
}

async function retake(file) {
  const id = viewing;
  const p = byId(id);
  if (!p || !file) return;
  setBusy(true);
  status('Replacing the page…');
  let shot = null;
  try { shot = await capture(file, LIMITS.masterSide, LIMITS.masterQuality); }
  catch (e) {
    setBusy(false); status('');
    say(whyRejected(file, e) + ' The page you had is untouched.', { ms: 11000, assertive: true });
    return;
  }
  const before = { blob: p.blob, w: p.w, h: p.h, rot: p.rot, t: p.t, url: p.url };
  p.blob = shot.blob; p.w = shot.w; p.h = shot.h; p.rot = 0; p.t = Date.now(); p.url = null;
  await persistPage(p);
  setBusy(false); status('');
  render();
  if (viewing === id) paintViewer();
  updateEstimate();

  const n = indexOf(id) + 1;
  const undo = () => {
    const q = byId(id);
    if (!q) return;
    Object.assign(q, before);
    persistPage(q);
    render();
    if (viewing === id) paintViewer();
    updateEstimate();
    announce('Page ' + n + ' put back to the earlier photo.');
  };

  if (viewing === id) {
    /* The viewer is a modal, so a toast Undo behind it cannot be clicked. */
    pendingRetakeUndo = undo;
    const b = $('viewUndo');
    b.classList.remove('hidden');
    b.focus();
    announce('Page ' + n + ' retaken. Undo the retake is available.');
  } else {
    sayUndo('Page ' + n + ' retaken', undo);
  }
}

function takeRetakeUndo() {
  const fn = pendingRetakeUndo;
  pendingRetakeUndo = null;
  $('viewUndo').classList.add('hidden');
  return fn;
}

/* ── the full-size view ───────────────────────────────────────────────────
   A 150px cover-cropped thumbnail showed 69% of a portrait page at 414px and
   40% at 320px, which is how a lease shipped with its signature block cut
   off. Verification needs the whole page, so tapping one opens it. */

function paintViewer() {
  const p = byId(viewing);
  const i = indexOf(viewing);
  if (!p) { closeViewer(false); return; }
  $('viewerTitle').textContent = 'Page ' + (i + 1) + ' of ' + pages.length;
  const img = $('viewImg');
  img.alt = pageAlt(p, i);
  if (img.src !== urlFor(p)) img.src = urlFor(p);
  applyRot(img, p.rot);
  $('viewMeta').textContent = [
    clockOf(p) ? 'Photographed at ' + clockOf(p) : '',
    p.w + '×' + p.h + ' pixels',
    formatBytes(p.blob ? p.blob.size : 0),
    p.rot ? 'turned ' + p.rot + '°' : 'not turned',
  ].filter(Boolean).join(' · ');
}

function openViewer(id) {
  const dlg = $('viewer');
  if (!byId(id)) return;
  if (id !== viewing) takeRetakeUndo();
  viewing = id;
  paintViewer();
  if (!dlg.open) {
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute('open', '');
  }
}

function closeViewer(refocus) {
  const dlg = $('viewer');
  const id = viewing;
  viewing = null;
  if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  /* The way back does not expire just because the dialog did. */
  const carried = takeRetakeUndo();
  if (carried) sayUndo('Page retaken', carried);
  if (refocus === false || !id) return;
  let node = null;
  try { node = document.querySelector('[data-pid="' + CSS.escape(id) + '"][data-act="open"]'); }
  catch (e) { node = null; }
  (node || $('camBtn')).focus();
}

/* ── naming and size ──────────────────────────────────────────────────── */

function activeLabel() {
  const on = $('labelChips').querySelector('[aria-pressed="true"]');
  return on ? on.dataset.label : '';
}

function defaultName() {
  const l = activeLabel();
  return todayStamp() + '-' + (l || 'scan');
}

let ratio = { key: '', value: 0 };
let measuring = false;

function paintEstimate(bytes, approx) {
  const n = pages.length;
  const size = SIZE_NAME[$('pageSize').value] || SIZE_NAME.letter;
  $('sizeEst').textContent = (approx ? 'About ' : '') + formatBytes(bytes) + ' · ' +
    n + (n === 1 ? ' page' : ' pages') + ' · ' + size + ' · ' +
    safeFileName($('fileName').value || defaultName());
}

async function measureRatio(key) {
  if (measuring || !pages.length) return;
  const q = QUALITY[key];
  if (!q || !q.side) return;
  measuring = true;
  try {
    const first = pages[0];
    const small = await shrink(first, q);
    if (first.blob.size > 0) {
      ratio = { key, value: small.size / first.blob.size };
      if ($('quality').value === key) updateEstimate();
    }
  } catch (e) { /* the estimate stays approximate; the export is unaffected */ }
  measuring = false;
}

function updateEstimate() {
  if (!pages.length) {
    $('sizeEst').textContent = 'Add a page and the finished file size appears here, before you download it.';
    return;
  }
  const key = $('quality').value;
  const raw = totalBytes();
  if (key === 'standard') { paintEstimate(estimatePdfBytes(raw, pages.length), false); return; }
  const r = ratio.key === key ? ratio.value : (key === 'tiny' ? 0.2 : 0.38);
  paintEstimate(estimatePdfBytes(raw * r, pages.length), true);
  if (ratio.key !== key) measureRatio(key);
}

/* ── export ───────────────────────────────────────────────────────────── */

async function shrink(p, q) {
  if (Math.max(p.w, p.h) <= q.side) return p.blob;   // never re-encode for nothing
  const out = await capture(p.blob, q.side, q.q);
  return out.blob;
}

async function exportPdf() {
  if (busy) return;
  if (!pages.length) {
    say('Add at least one page first — there is nothing to put in a PDF yet.', { assertive: true });
    $('camBtn').focus();
    return;
  }
  const btn = $('makeBtn');
  const label = btn.textContent;
  setBusy(true);
  btn.textContent = 'Working…';
  try {
    const q = QUALITY[$('quality').value] || QUALITY.standard;
    const prepared = [];
    for (let i = 0; i < pages.length; i++) {
      if (pages.length > 1) status('Preparing page ' + (i + 1) + ' of ' + pages.length + '…');
      const blob = q.side ? await shrink(pages[i], q) : pages[i].blob;
      prepared.push({ bytes: new Uint8Array(await blob.arrayBuffer()), rot: pages[i].rot });
    }
    status('Assembling the PDF…');
    const { bytes, skipped, made } = await makePdfFromImages(window.PDFLib, prepared, $('pageSize').value);

    if (!made || !bytes) {
      say('No PDF was made and nothing was downloaded: none of the ' + pages.length +
        ' page(s) could be embedded. Your pages are still here.', { ms: 12000, assertive: true });
      return;
    }

    const name = safeFileName($('fileName').value || defaultName());
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);

    let msg = name + ' saved — ' + made + (made === 1 ? ' page, ' : ' pages, ') +
      formatBytes(bytes.length) + ', no watermark.';
    if (skipped) {
      msg += ' ' + skipped + ' page(s) could not be embedded and were left out of the file.';
    }
    say(msg, { ms: skipped ? 12000 : 6000, assertive: !!skipped });
    announce(msg);
  } catch (e) {
    say('The PDF could not be built (' + ((e && e.message) || 'unknown error') +
      '). Nothing was downloaded and your pages are still here.', { ms: 12000, assertive: true });
  } finally {
    btn.textContent = label;
    setBusy(false);
    status('');
    if (document.activeElement === document.body) btn.focus();
  }
}

/* ── restore banner ───────────────────────────────────────────────────── */

function hideRestoreBar() { $('restoreBar').classList.add('hidden'); }

function showRestoreBar(n) {
  $('restoreMsg').textContent = 'You have ' + n + (n === 1 ? ' page' : ' pages') +
    ' from earlier, brought back from this browser’s own storage. Keep them, or clear them out?';
  $('restoreBar').classList.remove('hidden');
}

/* ── wiring ───────────────────────────────────────────────────────────── */

function wire() {
  $('camBtn').addEventListener('click', () => $('camInput').click());
  $('libBtn').addEventListener('click', () => $('libInput').click());
  ['camInput', 'libInput'].forEach((id) => {
    /* Copy the FileList BEFORE resetting the input: it is live, so clearing
       the value empties the very list we are about to read. */
    $(id).addEventListener('change', async (ev) => {
      const files = [...(ev.target.files || [])];
      ev.target.value = '';
      await addFiles(files);
    });
  });
  $('retakeInput').addEventListener('change', async (ev) => {
    const f = (ev.target.files || [])[0] || null;
    ev.target.value = '';
    await retake(f);
  });

  $('clearBtn').addEventListener('click', clearAll);
  $('makeBtn').addEventListener('click', exportPdf);

  $('restoreKeep').addEventListener('click', () => { hideRestoreBar(); $('camBtn').focus(); });
  $('restoreClear').addEventListener('click', clearAll);

  $('viewClose').addEventListener('click', () => closeViewer(true));
  $('viewRotL').addEventListener('click', () => rotate(viewing, -90));
  $('viewRotR').addEventListener('click', () => rotate(viewing, +90));
  $('viewRetake').addEventListener('click', () => $('retakeInput').click());
  $('viewDelete').addEventListener('click', () => del(viewing));
  $('viewUndo').addEventListener('click', () => {
    const fn = takeRetakeUndo();
    if (fn) fn();
    $('viewRetake').focus();
  });
  $('viewer').addEventListener('close', () => { if (viewing) closeViewer(true); });
  $('viewer').addEventListener('cancel', () => { /* Esc — the close handler refocuses */ });

  $('pageSize').addEventListener('change', () => {
    updateEstimate();
    announce($('sizeEst').textContent);
  });
  $('quality').addEventListener('change', () => {
    updateEstimate();
    announce($('sizeEst').textContent);
  });
  $('fileName').addEventListener('input', () => {
    const chip = $('labelChips').querySelector('[aria-pressed="true"]');
    if (chip) chip.setAttribute('aria-pressed', 'false');
    updateEstimate();
  });

  $('labelChips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-label]');
    if (!chip) return;
    const already = chip.getAttribute('aria-pressed') === 'true';
    $('labelChips').querySelectorAll('[data-label]')
      .forEach((c) => c.setAttribute('aria-pressed', 'false'));
    if (!already) chip.setAttribute('aria-pressed', 'true');
    $('fileName').value = defaultName();
    updateEstimate();
    announce('File name is now ' + safeFileName($('fileName').value));
  });

  /* Only worth interrupting somebody if their pages really are unsaved. */
  window.addEventListener('beforeunload', (ev) => {
    if (pages.length && !persistOK) { ev.preventDefault(); ev.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => {
    pages.forEach((p) => { if (p.url) { URL.revokeObjectURL(p.url); p.url = null; } });
  });
}

async function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  $('fileName').setAttribute('maxlength', String(LIMITS.nameChars));
  $('fileName').placeholder = defaultName();
  render();
  updateEstimate();

  try {
    const restored = await store.loadSession();
    if (restored.length) {
      pages = restored;
      render();
      updateEstimate();
      showRestoreBar(restored.length);
      announce(restored.length + ' pages restored from your last session.');
    }
  } catch (e) {
    noPersist(e);
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
