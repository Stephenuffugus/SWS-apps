// Wheel Picker — fair spins on-device, wheel state in the URL.
import {
  parseNames, sliceAtPointer, easeOut, encodeState, decodeState, sliceColor,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/dRmcN67THa5p5nv59T7EQ09' };

const $ = (id) => document.getElementById(id);
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy'); }
}

let names = [];
let removed = [];       // winners taken off in remove mode (restorable)
let rotation = 0;       // current wheel rotation in radians
let spinning = false;

const canvas = $('wheel');
const ctx = canvas.getContext('2d');
const CX = canvas.width / 2, CY = canvas.height / 2, R = canvas.width / 2 - 8;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const n = names.length;
  if (n === 0) {
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--chip') || '#eee';
    ctx.fill();
    ctx.fillStyle = getComputedStyle(document.body).color;
    ctx.font = '28px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Add names below', CX, CY + 8);
    return;
  }
  const arc = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const start = rotation + i * arc - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R, start, start + arc);
    ctx.closePath();
    ctx.fillStyle = sliceColor(i, n);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // label
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(start + arc / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    const maxLen = n > 24 ? 10 : 16;
    const label = names[i].length > maxLen ? names[i].slice(0, maxLen - 1) + '…' : names[i];
    const fs = Math.min(34, Math.max(14, 320 / Math.max(n, 6)));
    ctx.font = '600 ' + fs + 'px system-ui';
    ctx.fillText(label, R - 18, fs / 3);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(CX, CY, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function spin() {
  if (spinning) return;
  if (names.length < 2) { toast('Add at least two names'); return; }
  spinning = true;
  $('spinBtn').disabled = true;
  $('winner').textContent = '';
  const extraTurns = 5 + Math.random() * 3;
  const target = rotation + extraTurns * Math.PI * 2 + Math.random() * Math.PI * 2;
  const start = rotation;
  const dur = 4200;
  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / dur;
    rotation = start + (target - start) * easeOut(t);
    draw();
    if (t < 1) requestAnimationFrame(step);
    else {
      rotation = target;
      spinning = false;
      $('spinBtn').disabled = false;
      const idx = sliceAtPointer(rotation, names.length);
      const winner = names[idx];
      $('winner').textContent = '🎉 ' + winner;
      if ($('removeMode').checked) {
        removed.push(winner);
        names = names.filter((_, i) => i !== idx);
        $('names').value = names.join('\n');
        syncHash();
        setTimeout(draw, 900);
      }
    }
  };
  requestAnimationFrame(step);
}

function syncHash() {
  try {
    history.replaceState(null, '', '#' + encodeState({ names, removeMode: $('removeMode').checked }));
  } catch (e) {}
}

function wire() {
  $('spinBtn').addEventListener('click', spin);
  $('names').addEventListener('input', () => {
    names = parseNames($('names').value);
    removed = [];
    syncHash();
    draw();
  });
  $('removeMode').addEventListener('change', syncHash);
  $('shareBtn').addEventListener('click', () => {
    syncHash();
    copyText(location.href, 'Link copied — the wheel is saved inside it');
  });
  $('resetBtn').addEventListener('click', () => {
    if (removed.length === 0) { toast('Nobody has been removed yet'); return; }
    names = names.concat(removed);
    removed = [];
    $('names').value = names.join('\n');
    syncHash();
    draw();
    toast('Everyone is back on the wheel');
  });
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  const loaded = decodeState(location.hash);
  if (loaded) {
    names = loaded.names;
    $('names').value = names.join('\n');
    $('removeMode').checked = loaded.removeMode;
  }
  draw();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

/* ---------- QR share (scan instead of typing a link) ---------- */
function showQr(url) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url); qr.make();
    const canvas = $('qrCanvas'), size = 300, count = qr.getModuleCount();
    const cell = Math.floor(size / (count + 8));
    const off = Math.floor((size - cell * count) / 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
  } catch (e) { toast('Could not draw the QR'); return; }
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
$('qrBtn').addEventListener('click', () => {
  syncHash();
  showQr(location.href);
});
