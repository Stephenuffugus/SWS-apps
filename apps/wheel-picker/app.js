// Wheel Picker, fair spins on-device, wheel state in the URL.
import {
  parseNamesDetailed, sliceAtPointer, easeOut, encodeState, decodeState,
  sliceColor, sliceInk, MAX_NAMES, MAX_NAME_LEN,
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
let history = [];       // every winner this session, the fairness receipt
let rotation = 0;       // current wheel rotation in radians
let spinning = false;

const canvas = $('wheel');
const ctx = canvas.getContext('2d');
const CX = canvas.width / 2, CY = canvas.height / 2, R = canvas.width / 2 - 8;

/* ── Spin length ──────────────────────────────────────────────────────────
   Four seconds of continuous rotation is a vestibular-migraine trigger, and
   the app used to ignore both the OS setting and its own comfort panel. It now
   honours them with the same precedence the panel uses, an explicit choice
   beats the OS, in both directions, and offers its own length control on top,
   because a teacher running thirty draws in a lesson wants a short one for
   reasons that have nothing to do with access needs. */
const SPIN_KEY = 'wheel.spin';
const SPIN_MS = { none: 0, quick: 1400, normal: 4200 };

function prefersLessMotion() {
  const attr = document.documentElement.getAttribute('data-motion');
  if (attr === 'less') return true;
  if (attr === 'full') return false;
  return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function spinChoice() {
  let stored = null;
  try { stored = localStorage.getItem(SPIN_KEY); } catch (e) { /* private mode */ }
  if (stored && Object.prototype.hasOwnProperty.call(SPIN_MS, stored)) return stored;
  return prefersLessMotion() ? 'none' : 'normal';
}

function spinDuration() {
  // Reduced motion is a floor, not a default: it wins even over a stored
  // choice made before the setting was turned on.
  if (prefersLessMotion()) return 0;
  return SPIN_MS[spinChoice()];
}

/* ── Drawing ──────────────────────────────────────────────────────────── */

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* The comfort panel scales the root font size; the canvas is a bitmap and
   hears nothing about it unless asked. Without this, a user on Largest text
   gets 24px body copy around a wheel still labelled at 12px. */
function uiScale() {
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return px / 16;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const n = names.length;
  const scale = uiScale();

  if (n === 0) {
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = cssVar('--surface-2', '#eee');
    ctx.fill();
    ctx.strokeStyle = cssVar('--line-2', '#999');
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = cssVar('--ink', '#111');
    ctx.font = `600 ${Math.round(30 * scale)}px system-ui`;
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
    // The seam. Adjacent wedges now differ in lightness too, but the stroke is
    // what keeps two wedges apart at a distance and in greyscale.
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(start + arc / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = sliceInk(i, n);
    const fs = Math.min(34, Math.max(14, 320 / Math.max(n, 6))) * scale;
    // How many characters actually fit shrinks as the type grows.
    const maxLen = Math.max(6, Math.round((n > 24 ? 10 : 16) / scale));
    const label = names[i].length > maxLen ? names[i].slice(0, maxLen - 1) + '…' : names[i];
    ctx.font = '600 ' + Math.round(fs) + 'px system-ui';
    ctx.fillText(label, R - 18, fs / 3);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(CX, CY, 26, 0, Math.PI * 2);
  ctx.fillStyle = cssVar('--surface', '#fff');
  ctx.fill();
  ctx.strokeStyle = cssVar('--line-2', '#999');
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ── Spinning ─────────────────────────────────────────────────────────── */

function setBusy(on) {
  const b = $('spinBtn');
  /* aria-disabled, not disabled. Disabling the button that currently holds
     focus makes the browser drop focus to <body>, and it stayed there after
     the spin, so a keyboard or switch user pressed Space once and lost their
     place in the page for the rest of the session. */
  b.setAttribute('aria-disabled', on ? 'true' : 'false');
  b.classList.toggle('is-busy', on);
  b.textContent = on ? 'Spinning…' : 'SPIN';
}

function announceWinner(name, note) {
  $('winner').textContent = '🎉 ' + name + (note ? ', ' + note : '');
  history.unshift(name);
  history = history.slice(0, 50);
  renderHistory();
}

function finishSpin() {
  spinning = false;
  setBusy(false);

  const idx = sliceAtPointer(rotation, names.length);
  const winner = names[idx];

  /* sliceAtPointer returns -1 for an empty wheel, and names[-1] is undefined.
     Clearing the textarea mid-spin used to put "🎉 undefined" on a projector
     in front of a class. */
  if (idx < 0 || typeof winner !== 'string') {
    $('winner').textContent = '';
    toast('The wheel changed while it was spinning, spin again');
    draw();
    return;
  }

  if (!$('removeMode').checked) {
    announceWinner(winner);
    return;
  }

  removed.push(winner);
  names = names.filter((_, i) => i !== idx);
  $('names').value = names.join('\n');
  syncHash();
  updateCount();

  // Naming the endgame. The old build removed the second-to-last name and then
  // refused to spin, so the last person was never drawn and never announced, // the one moment the whole room is waiting for.
  if (names.length === 1) {
    announceWinner(winner, 'last one left: ' + names[0]);
  } else if (names.length === 0) {
    announceWinner(winner, 'that is everyone');
  } else {
    announceWinner(winner, names.length + ' left');
  }

  if (window.SWS) {
    SWS.undo(`${winner} taken off the wheel`, () => {
      names = names.concat([winner]);
      removed = removed.filter((r) => r !== winner);
      $('names').value = names.join('\n');
      syncHash();
      updateCount();
      draw();
    });
  }

  setTimeout(draw, prefersLessMotion() ? 0 : 900);
}

function spin() {
  if (spinning) return;

  // One name is a valid wheel, it is exactly the state elimination mode ends
  // in, and refusing there is what stranded the last person.
  if (names.length < 1) { toast('Add some names first'); return; }

  spinning = true;
  setBusy(true);
  $('winner').textContent = '';

  const extraTurns = 5 + Math.random() * 3;
  const target = rotation + extraTurns * Math.PI * 2 + Math.random() * Math.PI * 2;
  const start = rotation;
  const dur = spinDuration();

  if (dur === 0) {
    /* No rotation at all. A single discrete jump to the result is not a
       vestibular trigger; four seconds of continuous spin is. The short pause
       keeps the draw feeling like a draw rather than a lookup. */
    rotation = target;
    draw();
    setTimeout(finishSpin, 650);
    return;
  }

  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / dur;
    rotation = start + (target - start) * easeOut(t);
    draw();
    if (t < 1) requestAnimationFrame(step);
    else { rotation = target; finishSpin(); }
  };
  requestAnimationFrame(step);
}

/* ── History, the fairness receipt ───────────────────────────────────── */

function renderHistory() {
  const box = $('historyBox');
  const list = $('history');
  if (!box || !list) return;

  if (!history.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  list.replaceChildren(...history.map((name, i) => {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'grow';
    n.textContent = name;
    const o = document.createElement('span');
    o.className = 'sub tnum';
    o.textContent = '#' + (history.length - i);
    li.append(n, o);
    return li;
  }));
}

/* ── Names, caps and the count ────────────────────────────────────────── */

function updateCount() {
  const el = $('nameCount');
  if (!el) return;
  const n = names.length;
  el.textContent = n === 0
    ? `No names yet, up to ${MAX_NAMES}`
    : `${n} ${n === 1 ? 'name' : 'names'} on the wheel · up to ${MAX_NAMES}`;
}

function readNames(announce) {
  const { names: parsed, dropped, truncated } = parseNamesDetailed($('names').value);
  names = parsed;
  updateCount();

  /* The caps used to apply in silence. 500 pasted names became exactly 100 and
     the app said "1000 guests added"-style nothing; a 43-character name was
     stored clipped while the textarea still showed it whole. */
  if (announce && dropped > 0) {
    toast(`Only the first ${MAX_NAMES} names fit, ${dropped} left off`, 5000);
  } else if (announce && truncated > 0) {
    toast(`${truncated} ${truncated === 1 ? 'name was' : 'names were'} shortened to ${MAX_NAME_LEN} characters`, 4500);
  }
}

function syncHash() {
  try {
    window.history.replaceState(null, '', '#' + encodeState({ names, removeMode: $('removeMode').checked }));
  } catch (e) {}
}

function applyState(s) {
  names = s.names;
  $('names').value = names.join('\n');
  $('removeMode').checked = s.removeMode;
  removed = [];
  updateCount();
  draw();
}

/* ── QR ───────────────────────────────────────────────────────────────── */

function showQr(url) {
  const d = $('qrDlg');
  const note = $('qrNote');
  const cv = $('qrCanvas');

  try {
    const qr = qrcode(0, 'M');
    qr.addData(url); qr.make();
    const size = 300, count = qr.getModuleCount();
    const cell = Math.floor(size / (count + 8));
    const off = Math.floor((size - cell * count) / 2);
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
    c.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let col = 0; col < count; col++)
      if (qr.isDark(r, col)) c.fillRect(off + col * cell, off + r * cell, cell, cell);
    cv.classList.remove('hidden');
    note.textContent = 'Point a camera at this to open the same wheel.';
  } catch (e) {
    /* A QR code tops out around 2,900 characters, and 100 long names encode to
       well past that. The old build toasted "Could not draw the QR" over a
       blank canvas and left the user with nothing, at the exact moment they
       were trying to hand the wheel to a room. */
    cv.classList.add('hidden');
    note.textContent =
      `This wheel has ${names.length} names, which makes the link too long for a QR code ` +
      `(they hold about 2,900 characters). Copy the link instead, or split the list across two wheels.`;
  }

  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}

/* ── Wiring ───────────────────────────────────────────────────────────── */

function wire() {
  $('spinBtn').addEventListener('click', () => {
    if ($('spinBtn').getAttribute('aria-disabled') === 'true') return;
    spin();
  });

  $('names').addEventListener('input', () => {
    readNames(true);
    removed = [];
    syncHash();
    draw();
  });

  $('removeMode').addEventListener('change', syncHash);

  $('shareBtn').addEventListener('click', () => {
    syncHash();
    copyText(location.href, 'Link copied, the wheel is saved inside it');
  });

  $('resetBtn').addEventListener('click', () => {
    if (removed.length === 0) { toast('Nobody has been removed yet'); return; }
    const back = removed.length;
    names = names.concat(removed);
    removed = [];
    $('names').value = names.join('\n');
    syncHash();
    updateCount();
    draw();
    toast(`${back} ${back === 1 ? 'name is' : 'names are'} back on the wheel`);
  });

  const spinSel = $('spinLen');
  if (spinSel) {
    spinSel.value = spinChoice();
    spinSel.addEventListener('change', () => {
      try { localStorage.setItem(SPIN_KEY, spinSel.value); } catch (e) {}
    });
  }

  const clearHist = $('clearHistory');
  if (clearHist) {
    clearHist.addEventListener('click', () => {
      history = [];
      renderHistory();
      toast('Spin history cleared');
    });
  }

  /* The hash IS the document. Following a link, pressing Back, or opening a
     second wheel in the same tab all change it, and the app used to read it
     once at startup and never again, so Back left the URL and the wheel
     describing different things. */
  window.addEventListener('hashchange', () => {
    const s = decodeState(location.hash);
    if (s) applyState(s);
  });

  /* Redraw when the comfort panel changes anything: the canvas is a bitmap and
     gets no cascade. */
  new MutationObserver(() => draw()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-text', 'data-contrast', 'data-motion'],
  });
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  }
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  const loaded = decodeState(location.hash);
  if (loaded) applyState(loaded);
  else { readNames(false); }

  updateCount();
  renderHistory();
  draw();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
$('qrBtn').addEventListener('click', () => {
  syncHash();
  showQr(location.href);
});
