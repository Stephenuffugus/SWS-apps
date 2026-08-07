// Signature Maker — canvas drawing with smoothed strokes, transparent PNG out.
import { trimBounds } from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/5kQaEY8XL4L5bLT8m57EQ08' };

const $ = (id) => document.getElementById(id);
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}

const pad = $('pad');
const ctx = pad.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 3);

let color = '#111318';
let size = 3;
let strokes = [];       // each: {color, size, points: [{x,y}]} in CSS pixels
let current = null;

function fitCanvas() {
  const cssW = pad.clientWidth || 600;
  const cssH = 260;
  pad.width = Math.round(cssW * DPR);
  pad.height = Math.round(cssH * DPR);
  redraw();
}

function drawStroke(s) {
  if (s.points.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size * DPR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = s.points;
  if (pts.length < 3) {
    ctx.beginPath();
    ctx.arc(pts[0].x * DPR, pts[0].y * DPR, (s.size * DPR) / 2, 0, Math.PI * 2);
    ctx.fill();
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * DPR, pts[0].y * DPR);
      ctx.lineTo(pts[1].x * DPR, pts[1].y * DPR);
      ctx.stroke();
    }
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x * DPR, pts[0].y * DPR);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x * DPR, pts[i].y * DPR, mx * DPR, my * DPR);
  }
  ctx.stroke();
}

function redraw() {
  ctx.clearRect(0, 0, pad.width, pad.height);
  for (const s of strokes) drawStroke(s);
  if (current) drawStroke(current);
}

function pos(ev) {
  const r = pad.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

let activePointer = null; // one pen at a time — a resting palm must not zigzag the stroke
pad.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (activePointer !== null) return; // second touch while drawing: ignored
  activePointer = ev.pointerId;
  pad.setPointerCapture(ev.pointerId);
  current = { color, size, points: [pos(ev)] };
  redraw();
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
  if (!current) return;
  strokes.push(current);
  current = null;
  try { pad.releasePointerCapture(ev.pointerId); } catch (e) {}
  redraw();
};
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);

function wire() {
  for (const dot of document.querySelectorAll('.dot')) {
    dot.addEventListener('click', () => {
      color = dot.dataset.color;
      document.querySelectorAll('.dot').forEach(d => d.classList.toggle('sel', d === dot));
    });
  }
  for (const b of document.querySelectorAll('.sizes button')) {
    b.addEventListener('click', () => {
      size = parseInt(b.dataset.size, 10);
      document.querySelectorAll('.sizes button').forEach(x => x.classList.toggle('sel', x === b));
    });
  }
  $('undoBtn').addEventListener('click', () => { strokes.pop(); redraw(); });
  $('clearBtn').addEventListener('click', () => { strokes = []; current = null; redraw(); });
  $('dlBtn').addEventListener('click', download);
  window.addEventListener('resize', fitCanvas);
}

function download() {
  if (strokes.length === 0) { toast('Sign above first — big and confident'); return; }
  // render at 3x for a crisp export, then crop to the ink
  const SCALE = 3;
  const off = document.createElement('canvas');
  off.width = pad.clientWidth * SCALE;
  off.height = 260 * SCALE;
  const octx = off.getContext('2d');
  for (const s of strokes) {
    octx.strokeStyle = s.color;
    octx.fillStyle = s.color;
    octx.lineWidth = s.size * SCALE;
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    const pts = s.points;
    if (pts.length < 3) {
      octx.beginPath();
      octx.arc(pts[0].x * SCALE, pts[0].y * SCALE, (s.size * SCALE) / 2, 0, Math.PI * 2);
      octx.fill();
      if (pts.length === 2) {
        octx.beginPath();
        octx.moveTo(pts[0].x * SCALE, pts[0].y * SCALE);
        octx.lineTo(pts[1].x * SCALE, pts[1].y * SCALE);
        octx.stroke();
      }
      continue;
    }
    octx.beginPath();
    octx.moveTo(pts[0].x * SCALE, pts[0].y * SCALE);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      octx.quadraticCurveTo(pts[i].x * SCALE, pts[i].y * SCALE, mx * SCALE, my * SCALE);
    }
    octx.stroke();
  }
  const img = octx.getImageData(0, 0, off.width, off.height);
  const b = trimBounds(img.data, off.width, off.height);
  if (!b) { toast('Sign above first'); return; }
  const padPx = Math.round(size * SCALE * 1.5);
  const out = document.createElement('canvas');
  out.width = b.w + padPx * 2;
  out.height = b.h + padPx * 2;
  out.getContext('2d').drawImage(off, b.x, b.y, b.w, b.h, padPx, padPx, b.w, b.h);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = 'signature.png';
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 300);
  toast('Saved — transparent background, cropped to the ink');
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  fitCanvas();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
