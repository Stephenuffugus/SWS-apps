/* Signature Maker.
   Three routes to one artefact — draw it, type it, or photograph the one you
   signed on paper — and an export whose exact pixels, format and byte size are
   on screen before you commit to it.

   Two invariants worth knowing before changing anything here:

   1. Stroke points live in the pad's CURRENT CSS pixel space, and every change
      to the pad's box remaps them uniformly (see remap). That is what stops a
      landscape signature being cropped when the phone is rotated back, and it
      is why fitCanvas is driven by a ResizeObserver rather than window.resize
      — the comfort panel's Spacing dial changes the pad's box without ever
      firing a resize event.
   2. Nothing is written to localStorage, and the only thing written to
      sessionStorage is a draft of the geometry so a reflex reload is
      survivable. Closing the tab erases it. The page says so out loud. */

import { trimBounds } from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/5kQaEY8XL4L5bLT8m57EQ08' };

const $ = (id) => document.getElementById(id);

/* sws-ui.js is a blocking script in <head>, so SWS is always there by the time
   this module runs. The fallback exists so a missing runtime degrades to a
   working message rather than to silence. */
let fbTimer = null;
function fallbackToast(msg) {
  const t = $('toast');
  if (!t) return null;
  t.replaceChildren(document.createTextNode(msg));
  t.classList.add('show');
  clearTimeout(fbTimer);
  fbTimer = setTimeout(() => t.classList.remove('show'), 4200);
  return t;
}
const toast = (msg, opts) => (window.SWS && SWS.toast ? SWS.toast(msg, opts) : fallbackToast(msg));
const undoToast = (msg, fn) => (window.SWS && SWS.undo ? SWS.undo(msg, fn) : fallbackToast(msg));

/* Say a capped thing once per session rather than on every keystroke. */
const said = new Set();
function sayOnce(key, msg) {
  if (said.has(key)) return;
  said.add(key);
  toast(msg, { ms: 7000 });
}

const pad = $('pad');
const padwrap = $('padwrap');
const ctx = pad.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 3);

const INK_NAMES = { '#111318': 'black', '#1d3f8f': 'blue' };

/* Handwriting faces come from the device; nothing is fetched. 'formal' uses
   the app's own self-hosted Fraunces, which is already in the service worker's
   asset list, so it is the one style guaranteed to look the same offline. */
const FACES = {
  script: '"Segoe Script","Bradley Hand","Snell Roundhand","Apple Chancery","Lucida Handwriting","URW Chancery L","Comic Sans MS",cursive',
  formal: '"Fraunces",Georgia,"Times New Roman",serif',
  plain: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
};

const MAX_NAME = 60;          // characters of typed signature that fit one line
const MAX_PHOTO_PX = 4000;    // longest edge accepted from a photo, before processing
const MAX_DRAFT_BYTES = 1.5e6;
const MIN_INK_PX = 24;        // a mark smaller than this in both axes is not a signature

let mode = 'draw';            // 'draw' | 'type' | 'photo'
let color = '#111318';
let size = 3;
let strokes = [];             // {color, size, points:[{x,y}]} in pad CSS px
let current = null;
let typed = { text: '', style: 'script' };
let photoSrc = null;          // the imported bitmap, already capped to MAX_PHOTO_PX
let photo = null;             // processed: ink-coloured, background dropped, trimmed
let threshold = 62;
let box = { w: 0, h: 0 };     // last known pad CSS box, for remapping
let exporting = false;
let lastReadout = '';

/* ── Geometry ─────────────────────────────────────────────────────────────── */

function padBox() {
  return { w: Math.max(1, pad.clientWidth || 600), h: Math.max(1, pad.clientHeight || 260) };
}

/* Rescale everything already drawn into the pad's new box, uniformly and
   centred. Rotating a phone from landscape to portrait used to throw away 57%
   of a signature at export time because the points were absolute and the
   export canvas was sized from the CURRENT pad width. Rescaling instead of
   cropping means the ink is always inside the box it is measured against. */
function remap(ow, oh, nw, nh) {
  const k = Math.min(nw / ow, nh / oh);
  if (!isFinite(k) || k <= 0 || k === 1) return;
  const dx = (nw - ow * k) / 2;
  const dy = (nh - oh * k) / 2;
  const all = current ? strokes.concat([current]) : strokes;
  for (const s of all) {
    for (const p of s.points) { p.x = p.x * k + dx; p.y = p.y * k + dy; }
    s.size = s.size * k;
  }
}

function fitCanvas() {
  const b = padBox();
  if (box.w && box.h && (b.w !== box.w || b.h !== box.h)) remap(box.w, box.h, b.w, b.h);
  box = b;
  const w = Math.round(b.w * DPR);
  const h = Math.round(b.h * DPR);
  if (pad.width !== w) pad.width = w;
  if (pad.height !== h) pad.height = h;
  redraw();
  scheduleReadout();
}

/* ── Painting ─────────────────────────────────────────────────────────────── */

function drawStroke(c, s, k, ox, oy) {
  const P = s.points;
  if (!P.length) return;
  c.strokeStyle = s.color;
  c.fillStyle = s.color;
  c.lineWidth = Math.max(0.5, s.size * k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const X = (p) => p.x * k - ox;
  const Y = (p) => p.y * k - oy;
  if (P.length < 3) {
    c.beginPath();
    c.arc(X(P[0]), Y(P[0]), c.lineWidth / 2, 0, Math.PI * 2);
    c.fill();
    if (P.length === 2) {
      c.beginPath();
      c.moveTo(X(P[0]), Y(P[0]));
      c.lineTo(X(P[1]), Y(P[1]));
      c.stroke();
    }
    return;
  }
  c.beginPath();
  c.moveTo(X(P[0]), Y(P[0]));
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i].x + P[i + 1].x) / 2;
    const my = (P[i].y + P[i + 1].y) / 2;
    c.quadraticCurveTo(X(P[i]), Y(P[i]), mx * k - ox, my * k - oy);
  }
  c.stroke();
}

function typedFont(px, style) {
  const slant = style === 'plain' ? '' : 'italic ';
  const weight = style === 'formal' ? '600 ' : '';
  return `${slant}${weight}${px}px ${FACES[style]}`;
}

/* Fit the typed name across the pad, sitting on the ruled line. */
function typedLayout(b) {
  const text = typed.text.trim();
  if (!text) return null;
  let px = Math.min(b.h * 0.42, b.w * 0.3);
  const maxW = b.w * 0.86;
  ctx.save();
  ctx.font = typedFont(px, typed.style);
  const m = ctx.measureText(text);
  if (m.width > maxW && m.width > 0) px = Math.max(8, px * (maxW / m.width));
  ctx.font = typedFont(px, typed.style);
  const mm = ctx.measureText(text);
  ctx.restore();
  const w = mm.actualBoundingBoxLeft + mm.actualBoundingBoxRight || mm.width;
  const asc = mm.actualBoundingBoxAscent || px * 0.75;
  const desc = mm.actualBoundingBoxDescent || px * 0.25;
  return { text, px, cx: b.w / 2, base: b.h * 0.76, w, asc, desc };
}

function photoRect(b) {
  if (!photo) return null;
  const bandH = b.h * 0.62;
  const k = Math.min((b.w * 0.86) / photo.width, bandH / photo.height);
  const w = photo.width * k;
  const h = photo.height * k;
  return { x: (b.w - w) / 2, y: b.h * 0.76 - h, w, h };
}

/* One painter for the screen and for every export. `k` scales pad CSS pixels
   to device pixels; ox/oy shift the origin so an export can render only the
   region the ink occupies. */
function paint(c, k, ox, oy, b) {
  if (mode === 'draw') {
    for (const s of strokes) drawStroke(c, s, k, ox, oy);
    if (current) drawStroke(c, current, k, ox, oy);
    return;
  }
  if (mode === 'type') {
    const L = typedLayout(b);
    if (!L) return;
    c.save();
    c.font = typedFont(L.px * k, typed.style);
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(L.text, L.cx * k - ox, L.base * k - oy);
    c.restore();
    return;
  }
  if (mode === 'photo' && photo) {
    const r = photoRect(b);
    c.save();
    c.imageSmoothingQuality = 'high';
    c.drawImage(photo, r.x * k - ox, r.y * k - oy, r.w * k, r.h * k);
    c.restore();
  }
}

function redraw() {
  ctx.clearRect(0, 0, pad.width, pad.height);
  paint(ctx, DPR, 0, 0, box);
}

/* The ink's bounding box in pad CSS pixels — the export is sized from this,
   never from pad.clientWidth. */
function sourceBBox(b) {
  if (mode === 'draw') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const all = current ? strokes.concat([current]) : strokes;
    for (const s of all) {
      const r = s.size / 2;
      for (const p of s.points) {
        if (p.x - r < minX) minX = p.x - r;
        if (p.x + r > maxX) maxX = p.x + r;
        if (p.y - r < minY) minY = p.y - r;
        if (p.y + r > maxY) maxY = p.y + r;
      }
    }
    if (maxX === -Infinity) return null;
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
  if (mode === 'type') {
    const L = typedLayout(b);
    if (!L) return null;
    return { x: L.cx - L.w / 2, y: L.base - L.asc, w: Math.max(1, L.w), h: Math.max(1, L.asc + L.desc) };
  }
  if (mode === 'photo' && photo) return photoRect(b);
  return null;
}

function hasInk() { return !!sourceBBox(padBox()); }

/* ── Drawing input ────────────────────────────────────────────────────────── */

function pos(ev) {
  const r = pad.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  const cx = Math.min(Math.max(x, 0), r.width);
  const cy = Math.min(Math.max(y, 0), r.height);
  if (cx !== x || cy !== y) offEdge = true;
  return { x: cx, y: cy };
}

let activePointer = null;   // one pen at a time — a resting palm must not zigzag the stroke
let offEdge = false;

pad.addEventListener('pointerdown', (ev) => {
  if (mode !== 'draw') return;
  ev.preventDefault();
  if (activePointer !== null) return;         // second touch while drawing: ignored
  activePointer = ev.pointerId;
  offEdge = false;
  /* current is built BEFORE the capture, and the capture is guarded the same
     way its matching release already was. setPointerCapture throws for a
     pointer the browser has already released (seen on iOS Safari); with the
     old ordering that exception aborted the handler and silently discarded the
     whole stroke. Losing capture only costs us strokes that run off the pad. */
  current = { color, size, points: [pos(ev)] };
  try { pad.setPointerCapture(ev.pointerId); } catch (e) { /* draw without capture */ }
  redraw();
  setState();
});

pad.addEventListener('pointermove', (ev) => {
  if (!current || ev.pointerId !== activePointer) return;
  const events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
  for (const e of events) current.points.push(pos(e));
  redraw();
});

const endStroke = (ev) => {
  if (ev.pointerId !== activePointer) return;
  activePointer = null;
  try { pad.releasePointerCapture(ev.pointerId); } catch (e) { /* already gone */ }
  if (!current) return;
  strokes.push(current);
  current = null;
  redraw();
  setState();
  saveDraft();
  scheduleReadout();
  if (offEdge) {
    offEdge = false;
    sayOnce('offedge', 'That stroke ran off the edge of the pad, so it stops at the border — nothing past the edge is kept. “Sign big” gives you the whole screen to write across.');
  }
};
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);

/* ── Export ───────────────────────────────────────────────────────────────── */

const PRESETS = {
  png: { name: 'Transparent PNG', type: 'image/png', bg: null, targetW: 1200 },
  'png-email': { name: 'Transparent PNG', type: 'image/png', bg: null, targetW: 300 },
  jpg: { name: 'JPG on white', type: 'image/jpeg', bg: '#ffffff', targetW: 1200, quality: 0.92 },
  jpg140: { name: 'JPG on white', type: 'image/jpeg', bg: '#ffffff', exact: { w: 140, h: 60 }, maxBytes: 30720, quality: 0.9 },
  jpg160: { name: 'JPG on white', type: 'image/jpeg', bg: '#ffffff', exact: { w: 160, h: 60 }, maxBytes: 30720, quality: 0.9 },
};

const spec = () => PRESETS[$('preset').value] || PRESETS.png;

function dataUrlBytes(url) {
  const i = url.indexOf(',');
  const b64 = url.slice(i + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

/* Render the current source at whatever resolution the chosen preset asks for,
   crop it tight, compose it, and encode it. Returns the numbers as well as the
   bytes, because the numbers are the point: the same gesture used to export
   633x218 on one screen and 1529x248 on another, and nothing said so. */
function renderExport(s) {
  const b = padBox();
  const bb = sourceBBox(b);
  if (!bb) return null;
  const notes = [];

  /* Enough room that a round cap, an italic swash or a photo's soft edge is
     inside the buffer before trimBounds crops it back to the pixel. */
  const m = mode === 'draw'
    ? Math.max(2, maxStrokeSize() * 0.75)
    : mode === 'type'
      ? Math.max(4, bb.h * 0.35)
      : Math.max(2, bb.w * 0.02);
  const world = { x: bb.x - m, y: bb.y - m, w: bb.w + m * 2, h: bb.h + m * 2 };

  /* Exact-size presets are rendered 4x oversized and then downsampled, which
     is what keeps 140x60 legible instead of aliased. */
  const targetW = s.exact ? Math.max(s.exact.w * 4, 480) : s.targetW;
  let k = targetW / world.w;

  if (mode === 'photo' && photo) {
    const r = photoRect(b);
    const native = photo.width / r.w;   // pad CSS px → the photo's own pixels
    if (k > native) {
      k = native;
      notes.push(`your picture is ${photo.width} px wide, so it is not enlarged past that`);
    }
  }

  const rw = Math.max(1, Math.round(world.w * k));
  const rh = Math.max(1, Math.round(world.h * k));
  const buf = document.createElement('canvas');
  buf.width = rw;
  buf.height = rh;
  const bctx = buf.getContext('2d', { willReadFrequently: true });
  paint(bctx, k, world.x * k, world.y * k, b);

  const tight = trimBounds(bctx.getImageData(0, 0, rw, rh).data, rw, rh)
    || { x: 0, y: 0, w: rw, h: rh };

  const out = document.createElement('canvas');
  const octx = () => out.getContext('2d');
  let c;
  if (s.exact) {
    out.width = s.exact.w;
    out.height = s.exact.h;
    c = octx();
    c.fillStyle = s.bg || '#ffffff';
    c.fillRect(0, 0, out.width, out.height);
    const inset = 3;
    const fit = Math.min((out.width - inset * 2) / tight.w, (out.height - inset * 2) / tight.h);
    const dw = tight.w * fit;
    const dh = tight.h * fit;
    c.imageSmoothingQuality = 'high';
    c.drawImage(buf, tight.x, tight.y, tight.w, tight.h, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
  } else {
    const inset = Math.max(2, Math.round(tight.w * 0.01));
    out.width = tight.w + inset * 2;
    out.height = tight.h + inset * 2;
    c = octx();
    if (s.bg) { c.fillStyle = s.bg; c.fillRect(0, 0, out.width, out.height); }
    c.drawImage(buf, tight.x, tight.y, tight.w, tight.h, inset, inset, tight.w, tight.h);
  }

  let q = s.quality || 0.92;
  let url = s.type === 'image/png' ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', q);
  let bytes = dataUrlBytes(url);
  while (s.maxBytes && bytes > s.maxBytes && s.type !== 'image/png' && q > 0.32) {
    q -= 0.12;
    url = out.toDataURL('image/jpeg', q);
    bytes = dataUrlBytes(url);
  }
  if (s.maxBytes && bytes > s.maxBytes) {
    notes.push(`this came out ${kb(bytes)}, over the ${kb(s.maxBytes)} the portal allows — a simpler, thinner signature will fit`);
  }

  return { url, w: out.width, h: out.height, bytes, notes, type: s.type };
}

function maxStrokeSize() {
  let n = 1;
  const all = current ? strokes.concat([current]) : strokes;
  for (const s of all) if (s.size > n) n = s.size;
  return n;
}

let readoutTimer = null;
function scheduleReadout() {
  clearTimeout(readoutTimer);
  readoutTimer = setTimeout(updateReadout, 260);
}

function updateReadout() {
  const el = $('readout');
  if (!el) return;
  let text;
  if (!hasInk()) {
    text = 'Nothing on the pad yet — the exact size and weight of the file will appear here.';
  } else {
    let r = null;
    try { r = renderExport(spec()); } catch (e) { r = null; }
    if (!r) {
      text = 'Nothing on the pad yet — the exact size and weight of the file will appear here.';
    } else {
      const inches = (r.w / 300).toFixed(1);
      const bits = [`${spec().name} · ${r.w} × ${r.h} px · ${kb(r.bytes)}`,
        `${inches} in wide at 300 dpi`];
      if (spec().maxBytes) bits.push(`portal limit ${kb(spec().maxBytes)}`);
      text = `${bits.join(' · ')}.${r.notes.length ? ` Note: ${r.notes.join('; ')}.` : ''}`;
    }
  }
  if (text !== lastReadout) { el.textContent = text; lastReadout = text; }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function filename(r, s) {
  const ext = s.type === 'image/png' ? 'png' : 'jpg';
  const dims = s.exact ? `-${s.exact.w}x${s.exact.h}` : `-${r.w}px`;
  const ink = INK_NAMES[color] || 'ink';
  return `signature-${ink}${dims}-${stamp()}.${ext}`;
}

/* A single tap used to export a 38x38 dot with the toast "Saved". Refusing is
   right, but it is the user's mark, so the refusal carries the way through. */
function tooSmall() {
  const bb = sourceBBox(padBox());
  if (!bb) return null;
  if (bb.w >= MIN_INK_PX || bb.h >= MIN_INK_PX) return null;
  return `That mark is only ${Math.round(bb.w)} × ${Math.round(bb.h)} px across — smaller than the ${MIN_INK_PX} px floor for something a form can read.`;
}

function withImage(fn) {
  if (exporting) return;
  if (!hasInk()) {
    toast(mode === 'type'
      ? 'Type your name above first.'
      : mode === 'photo'
        ? 'Choose a picture of your signature first.'
        : 'Sign on the pad above first — big and confident.');
    return;
  }
  const small = tooSmall();
  if (small) {
    toast(`${small} Sign right across the pad and try again.`, {
      ms: 9000,
      action: { label: 'Save it anyway', onAction: fn },
    });
    return;
  }
  fn();
}

function runExport() {
  let r = null;
  try { r = renderExport(spec()); } catch (e) { r = null; }
  if (!r) { toast('The export could not be rendered. Try clearing and signing again.', { assertive: true }); return null; }
  return r;
}

function download() {
  withImage(() => {
    exporting = true;
    const dl = $('dlBtn');
    dl.setAttribute('aria-busy', 'true');
    try {
      const s = spec();
      const r = runExport();
      if (!r) return;
      const a = document.createElement('a');
      a.href = r.url;
      a.download = filename(r, s);
      document.body.append(a);
      a.click();
      setTimeout(() => a.remove(), 300);
      const extra = r.notes.length ? ` ${r.notes.join('; ')}.` : '';
      toast(`Saved ${a.download} — ${r.w} × ${r.h} px, ${kb(r.bytes)}${s.bg ? ', white background' : ', transparent background'}.${extra}`, { ms: 6000 });
      updateReadout();
    } finally {
      exporting = false;
      dl.removeAttribute('aria-busy');
    }
  });
}

function dataUrlToBlob(url) {
  const [head, body] = url.split(',');
  const type = head.slice(head.indexOf(':') + 1, head.indexOf(';'));
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

async function copyImage() {
  withImage(async () => {
    exporting = true;
    try {
      const s = spec();
      if (s.type !== 'image/png') {
        toast('The clipboard only carries PNG. Pick one of the PNG options above, or use Download for a JPG.', { ms: 7000 });
        return;
      }
      const r = runExport();
      if (!r) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataUrlToBlob(r.url) })]);
      toast(`Copied — ${r.w} × ${r.h} px, ${kb(r.bytes)}. Paste it straight into a document.`, { ms: 5000 });
    } catch (e) {
      toast('This browser refused the clipboard. Use Download instead — the file is identical.', { ms: 6000 });
    } finally {
      exporting = false;
    }
  });
}

/* ── The tab draft ────────────────────────────────────────────────────────────
   Storing nothing is the right default and the page says so. But losing the one
   artefact a person cannot reproduce to a reflex refresh is not privacy, it is
   just loss — so the geometry lives in sessionStorage, which dies with the tab
   exactly as the promise on the page describes. An imported photo is never
   written anywhere. */
const DRAFT_KEY = 'sig.draft';

function saveDraft() {
  try {
    if (mode === 'photo') { sessionStorage.removeItem(DRAFT_KEY); return; }
    if (!strokes.length && !typed.text.trim()) { sessionStorage.removeItem(DRAFT_KEY); return; }
    const json = JSON.stringify({
      v: 1, mode, color, size, box, typed,
      strokes: strokes.map((s) => ({
        c: s.color, s: Math.round(s.size * 100) / 100,
        p: s.points.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
      })),
    });
    if (json.length > MAX_DRAFT_BYTES) {
      sessionStorage.removeItem(DRAFT_KEY);
      sayOnce('draftbig', `This signature is ${(json.length / 1e6).toFixed(1)} MB of geometry — over the 1.5 MB the tab draft holds — so a reload would lose it. Download it now.`);
      return;
    }
    sessionStorage.setItem(DRAFT_KEY, json);
  } catch (e) {
    sayOnce('draftfail', 'This browser will not let the page keep a draft, so a reload would lose your signature. Download it before you reload.');
  }
}

function loadDraft() {
  let d = null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    d = JSON.parse(raw);
  } catch (e) { return; }
  if (!d || d.v !== 1) return;
  const restored = Array.isArray(d.strokes)
    ? d.strokes.filter((s) => Array.isArray(s.p) && s.p.length)
      .map((s) => ({
        color: typeof s.c === 'string' ? s.c : '#111318',
        size: Number(s.s) > 0 ? Number(s.s) : 3,
        points: s.p.map((p) => ({ x: Number(p[0]) || 0, y: Number(p[1]) || 0 })),
      }))
    : [];
  const hadText = d.typed && typeof d.typed.text === 'string' && d.typed.text.trim();
  if (!restored.length && !hadText) return;

  strokes = restored;
  if (hadText) typed = { text: d.typed.text.slice(0, MAX_NAME), style: FACES[d.typed.style] ? d.typed.style : 'script' };
  if (typeof d.color === 'string' && INK_NAMES[d.color]) color = d.color;
  if (Number(d.size) > 0) size = Number(d.size);
  if (d.mode === 'type' || d.mode === 'draw') mode = d.mode;
  if (d.box && d.box.w > 0 && d.box.h > 0) remap(d.box.w, d.box.h, padBox().w, padBox().h);

  $('typeText').value = typed.text;
  toast('Picked your signature back up where this tab left it. Nothing was saved anywhere else.', {
    ms: 8000,
    action: { label: 'Discard', onAction: () => wipe('Discarded.') },
  });
}

function snapshot() {
  return {
    mode, color, size, typed: { ...typed }, photo, photoSrc, threshold,
    strokes: strokes.map((s) => ({ color: s.color, size: s.size, points: s.points.map((p) => ({ x: p.x, y: p.y })) })),
  };
}

function restore(snap) {
  mode = snap.mode;
  color = snap.color;
  size = snap.size;
  typed = snap.typed;
  photo = snap.photo;
  photoSrc = snap.photoSrc;
  threshold = snap.threshold;
  strokes = snap.strokes;
  current = null;
  $('typeText').value = typed.text;
  $('thresh').value = String(threshold);
  $('threshOut').textContent = String(threshold);
  applyMode();
  redraw();
  setState();
  saveDraft();
  updateReadout();
}

function wipe(msg) {
  strokes = [];
  current = null;
  typed = { ...typed, text: '' };
  photo = null;
  photoSrc = null;
  $('typeText').value = '';
  $('photoFile').value = '';
  try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* nothing to remove */ }
  redraw();
  setState();
  updateReadout();
  if (msg) toast(msg);
}

/* ── Photo import ─────────────────────────────────────────────────────────── */

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function processPhoto() {
  photo = null;
  if (!photoSrc) return;
  const c = document.createElement('canvas');
  c.width = photoSrc.width;
  c.height = photoSrc.height;
  const cc = c.getContext('2d', { willReadFrequently: true });
  cc.drawImage(photoSrc, 0, 0);
  const img = cc.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  const cut = (255 * threshold) / 100;
  const ramp = 42;                       // a soft edge, so the ink is not jagged
  const ink = hexToRgb(color);
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    let a = (cut - lum) / ramp;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    px[i] = ink.r; px[i + 1] = ink.g; px[i + 2] = ink.b;
    px[i + 3] = Math.round(a * (px[i + 3] / 255) * 255);
  }
  cc.putImageData(img, 0, 0);
  const b = trimBounds(px, c.width, c.height);
  if (!b) return;
  const t = document.createElement('canvas');
  t.width = b.w;
  t.height = b.h;
  t.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  photo = t;
}

function loadPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => {
    const long = Math.max(im.naturalWidth, im.naturalHeight);
    let w = im.naturalWidth;
    let h = im.naturalHeight;
    if (long > MAX_PHOTO_PX) {
      const k = MAX_PHOTO_PX / long;
      w = Math.round(w * k);
      h = Math.round(h * k);
      toast(`Your picture was ${im.naturalWidth} × ${im.naturalHeight} px; it was scaled to ${w} × ${h} px before processing, which is this tool's ceiling for the long edge.`, { ms: 8000 });
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    photoSrc = c;
    URL.revokeObjectURL(url);
    processPhoto();
    redraw();
    setState();
    updateReadout();
    if (!photo) toast('Nothing was left after dropping the background. Slide “how much of the paper to drop” higher.', { ms: 7000 });
  };
  im.onerror = () => {
    URL.revokeObjectURL(url);
    toast('That file could not be read as a picture. A JPG or PNG photo of your signature works best.', { assertive: true });
  };
  im.src = url;
}

/* ── State, wiring ────────────────────────────────────────────────────────── */

function press(el, on) {
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
  el.classList.toggle('active', !!on);
}

function off(el, isOff, why) {
  el.setAttribute('aria-disabled', isOff ? 'true' : 'false');
  el._why = why;
}

function guard(el, fn) {
  el.addEventListener('click', () => {
    if (el.getAttribute('aria-disabled') === 'true') { toast(el._why); return; }
    fn();
  });
}

function applyMode() {
  $('typePanel').hidden = mode !== 'type';
  $('photoPanel').hidden = mode !== 'photo';
  $('penGroup').hidden = mode !== 'draw';
  $('undoBtn').hidden = mode !== 'draw';
  $('bigBtn').hidden = mode !== 'draw';
  pad.style.cursor = mode === 'draw' ? '' : 'default';
  for (const b of $('modeSeg').children) press(b, b.dataset.mode === mode);
  const prompt = $('padPrompt');
  prompt.textContent = mode === 'draw'
    ? 'Sign on the line with your finger, a stylus or the mouse'
    : mode === 'type'
      ? 'Your typed name appears here'
      : 'Your imported signature appears here';
}

function setState() {
  const ink = hasInk();
  padwrap.classList.toggle('inked', ink);

  for (const d of document.querySelectorAll('.dot')) press(d, d.dataset.color === color);
  for (const b of document.querySelectorAll('.sizes button')) press(b, Number(b.dataset.size) === size);
  for (const b of $('styleSeg').children) press(b, b.dataset.style === typed.style);

  off($('undoBtn'), !strokes.length, 'There is no stroke to undo yet — the pad is empty.');
  off($('clearBtn'), !ink, 'The pad is already empty.');
  off($('dlBtn'), !ink, mode === 'type' ? 'Type your name above and this will save it.' : 'Sign on the pad above and this will save it.');
  off($('copyBtn'), !ink, 'Sign or type something above first.');

  pad.setAttribute('aria-label',
    mode === 'draw'
      ? (strokes.length ? `Signature pad — ${strokes.length} stroke${strokes.length === 1 ? '' : 's'} drawn` : 'Signature pad — empty')
      : mode === 'type'
        ? (typed.text.trim() ? `Signature preview — typed “${typed.text.trim()}”` : 'Signature preview — nothing typed yet')
        : (photo ? 'Signature preview — imported picture' : 'Signature preview — no picture chosen yet'));
}

function wire() {
  for (const b of $('modeSeg').children) {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      applyMode();
      redraw();
      setState();
      saveDraft();
      updateReadout();
      if (mode === 'type') $('typeText').focus();
    });
  }

  for (const dot of document.querySelectorAll('.dot')) {
    dot.addEventListener('click', () => {
      color = dot.dataset.color;
      for (const s of strokes) s.color = color;
      if (current) current.color = color;
      if (photoSrc) processPhoto();
      redraw();
      setState();
      saveDraft();
      scheduleReadout();
    });
  }

  for (const b of document.querySelectorAll('.sizes button')) {
    b.addEventListener('click', () => {
      size = parseInt(b.dataset.size, 10);
      setState();
    });
  }

  const ti = $('typeText');
  ti.addEventListener('input', () => {
    if (ti.value.length >= MAX_NAME) {
      sayOnce('namecap', `${MAX_NAME} characters is the most that fits on one line of signature — anything past that is not accepted.`);
    }
    typed.text = ti.value.slice(0, MAX_NAME);
    redraw();
    setState();
    saveDraft();
    scheduleReadout();
  });

  for (const b of $('styleSeg').children) {
    b.addEventListener('click', () => {
      typed.style = b.dataset.style;
      redraw();
      setState();
      saveDraft();
      scheduleReadout();
    });
  }

  $('photoFile').addEventListener('change', (e) => loadPhoto(e.target.files && e.target.files[0]));
  const th = $('thresh');
  th.addEventListener('input', () => {
    threshold = Number(th.value);
    $('threshOut').textContent = String(threshold);
    processPhoto();
    redraw();
    setState();
    scheduleReadout();
  });

  guard($('undoBtn'), () => {
    const gone = strokes.pop();
    redraw();
    setState();
    saveDraft();
    scheduleReadout();
    undoToast('Took back the last stroke.', () => {
      strokes.push(gone);
      redraw();
      setState();
      saveDraft();
      scheduleReadout();
    });
  });

  /* Clear was the one irreversible action in an app whose artefact cannot be
     reproduced, styled identically to Download and sitting 8px above it. It is
     now a snapshot-and-restore, which cannot forget a side effect the way a
     hand-written inverse can. */
  guard($('clearBtn'), () => {
    const snap = snapshot();
    wipe(null);
    undoToast('Cleared the pad, and the tab draft with it.', () => restore(snap));
  });

  guard($('dlBtn'), download);
  guard($('copyBtn'), copyImage);

  $('bigBtn').addEventListener('click', () => {
    const on = document.documentElement.getAttribute('data-signbig') !== '1';
    document.documentElement.setAttribute('data-signbig', on ? '1' : '0');
    $('bigBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('bigBtn').textContent = on ? 'Done signing' : 'Sign big';
    if (on) toast('The pad has the whole screen now. Press Escape or “Done signing” to get the rest of the page back.', { ms: 6000 });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return;   // the comfort panel closes itself
    if (document.documentElement.getAttribute('data-signbig') === '1') {
      document.documentElement.setAttribute('data-signbig', '0');
      $('bigBtn').setAttribute('aria-pressed', 'false');
      $('bigBtn').textContent = 'Sign big';
      $('bigBtn').focus();
    }
  });

  $('preset').addEventListener('change', updateReadout);
  $('printBtn').addEventListener('click', () => window.print());

  if (navigator.clipboard && window.ClipboardItem) $('copyBtn').hidden = false;

  /* The pad's box changes without a window resize — the comfort panel's
     Spacing dial, browser zoom, the mobile address bar, "Sign big". Binding to
     window.resize left the backing store stale and put the ink up to 5% away
     from the finger. */
  if (window.ResizeObserver) new ResizeObserver(() => fitCanvas()).observe(pad);
  else window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', fitCanvas);
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  fitCanvas();
  loadDraft();
  applyMode();
  redraw();
  setState();
  updateReadout();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
