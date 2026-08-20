// Bracket Maker, tap winners through a seeded single-elimination bracket.
import {
  entrantInfo, roundCount, nextPow2, contender, winnerOf, setPick,
  champion, encodeBracket, decodeBracket, carryPicks, sameBracket,
  MAX_ENTRANTS,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/8x200ka1PgtNg2959T7EQ0e' };
const BASE_TITLE = document.title;
const SVGNS = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === null || v === undefined) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

/* The studio toast runtime carries Undo, holds while the pointer or focus is
   inside it, and is already loaded on the page, this app used to call none
   of it and guard a full wipe with confirm(). */
function toast(msg, opts) {
  if (window.SWS && window.SWS.toast) return window.SWS.toast(msg, opts);
  return null;
}
function undoToast(msg, fn) {
  if (window.SWS && window.SWS.undo) return window.SWS.undo(msg, fn);
  return toast(msg);
}
function savedFlag(text) {
  if (window.SWS && window.SWS.saved) window.SWS.saved({ text });
}

const KEY = 'bracket-maker';
const KEY_VISIT = 'bracket-maker.visiting';
const clone = (s) => ({ names: s.names.slice(), picks: { ...s.picks }, title: s.title || '' });

let state = { names: [], picks: {}, title: '' };
let mine = null;        // the visitor's own saved bracket, while viewing someone else's
let mode = 'mine';      // 'mine' | 'visiting'
let lastHash = '';
let shared = false;     // the link has been handed out at least once
let linkStale = false;

/* ── Storage ─────────────────────────────────────────────────────────────
   There used to be exactly one slot, and load() preferred the hash, so
   opening a friend's link and tapping once wrote their bracket over yours.
   A visited bracket now lives in its own key and in the URL; the key holding
   YOUR tournament is never written until you say so. */
function save() {
  try {
    localStorage.setItem(mode === 'visiting' ? KEY_VISIT : KEY, JSON.stringify(state));
  } catch (e) {}
  try {
    history.replaceState(null, '', state.names.length ? '#' + encodeBracket(state) : location.pathname);
  } catch (e) {}
  lastHash = location.hash;
  savedFlag(mode === 'visiting' ? 'Kept in the link' : 'Saved on this device');
}

function readStored(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key));
    if (d && Array.isArray(d.names)) {
      return {
        names: d.names.filter((x) => typeof x === 'string').slice(0, MAX_ENTRANTS),
        picks: d.picks && typeof d.picks === 'object' ? d.picks : {},
        title: typeof d.title === 'string' ? d.title : '',
      };
    }
  } catch (e) {}
  return null;
}

function load() {
  const stored = readStored(KEY);
  const raw = location.hash.replace(/^#/, '');
  const fromHash = raw ? decodeBracket(location.hash) : null;
  lastHash = location.hash;

  if (raw && (!fromHash || !fromHash.names.length)) {
    // The normal failure mode is a chat client breaking a long URL in half.
    setTimeout(() => toast('That link did not arrive in one piece, ask for it again, or start a bracket here.', { ms: 7000 }), 400);
  }

  if (fromHash && fromHash.names.length) {
    if (!stored || !stored.names.length || sameBracket(stored, fromHash)) {
      // Mine, or an older link to mine. Never trade recorded results for a
      // stale snapshot of the same tournament.
      const storedRicher = stored && sameBracket(stored, fromHash)
        && Object.keys(stored.picks).length > Object.keys(fromHash.picks).length;
      state = storedRicher ? stored : fromHash;
      mode = 'mine';
      mine = null;
    } else {
      state = fromHash;
      mode = 'visiting';
      mine = stored;
    }
    return;
  }
  if (stored) state = stored;
  mode = 'mine';
  mine = null;
}

/* ── Rendering ───────────────────────────────────────────────────────────── */
const ROUND_NAMES = { 1: 'Final', 2: 'Semifinals', 4: 'Quarterfinals' };
const roundLabel = (matches, r) => ROUND_NAMES[matches] || 'Round ' + (r + 1);

function renderBracket() {
  const box = $('bracket');
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.fk : null;
  box.replaceChildren();
  $('champ').textContent = '';

  const n = state.names.length;
  $('emptyState').hidden = n >= 2;
  $('playHint').hidden = n < 2;
  if (n < 2) { $('scrollCue').hidden = true; return; }

  const rounds = roundCount(n);
  const size = nextPow2(n);
  const inner = el('div', { class: 'bracketinner', id: 'bracketInner' });
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'links');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  inner.append(svg);

  for (let r = 0; r < rounds; r++) {
    const matches = size / Math.pow(2, r + 1);
    const label = roundLabel(matches, r);
    const hid = 'rh' + r;
    const list = el('div', { class: 'matches' });
    const col = el('div', { class: 'round', role: 'group', 'aria-labelledby': hid },
      el('h3', { class: 'roundhead', id: hid, text: label }), list);

    for (let m = 0; m < matches; m++) {
      const a = contender(state, r, m, 0);
      const b = contender(state, r, m, 1);
      if (r === 0 && a === null && b === null) continue;
      const w = winnerOf(state, r, m);
      const live = a !== null && b !== null;

      const slot = (idx, sideIdx) => {
        if (idx === null) {
          const isBye = r === 0;
          // Not a disabled button any more: disabled controls are skipped by
          // the keyboard and dimmed to 2.1:1 by the base layer, so the two
          // lines that explain a lopsided bracket were the least readable
          // and least reachable text on the page.
          return el('span', { class: 'slot ' + (isBye ? 'bye' : 'tbd'), text: isBye ? 'bye' : 'winner of earlier game' });
        }
        const isWin = w === idx;
        const label2 = state.names[idx];
        if (!live) {
          return el('span', { class: 'slot' + (isWin ? ' winner' : '') },
            el('span', { class: 'seed', 'aria-hidden': 'true', text: String(idx + 1) }),
            el('span', { class: 'nm', text: label2 }),
            el('span', { class: 'sr-only', text: ' (seed ' + (idx + 1) + ')' + (isWin ? ', advanced on a bye' : ', waiting for an opponent') }));
        }
        return el('button', {
          type: 'button',
          class: 'slot' + (isWin ? ' winner' : ''),
          'aria-pressed': String(isWin),
          'data-fk': r + '-' + m + '-' + sideIdx,
          onclick: () => pick(r, m, idx, a, b),
        },
          el('span', { class: 'seed', 'aria-hidden': 'true', text: String(idx + 1) }),
          el('span', { class: 'nm', text: label2 }),
          el('span', { class: 'sr-only', text: ' (seed ' + (idx + 1) + ')' + (isWin ? ', advanced' : '') }));
      };

      const nameOf = (idx) => idx === null ? (r === 0 ? 'a bye' : 'the winner of an earlier game') : state.names[idx];
      const groupLabel = label + ', match ' + (m + 1) + ': ' + nameOf(a) + ' versus ' + nameOf(b);
      list.append(el('div', {
        class: 'match', role: 'group', 'aria-label': groupLabel,
        'data-r': String(r), 'data-m': String(m),
      }, slot(a, 0), slot(b, 1)));
    }
    inner.append(col);
  }
  box.append(inner);

  const c = champion(state);
  if (c !== null) $('champ').textContent = '🏆 ' + state.names[c] + ', champion';

  // Focus used to land on <body> after every pick: 49 Tab presses for a
  // 7-match tournament. Put it back on the same slot.
  if (focusKey) {
    const again = box.querySelector('[data-fk="' + focusKey.replace(/"/g, '') + '"]');
    if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
  }
  drawLinks();
  updateScrollCues();
}

/* Everything about the bracket that can only be known after layout: the round
   label is dropped onto its own first match, and the connectors are drawn
   from the real boxes. Measured from rects, so it survives any text size,
   density, wrapping or transform. */
function drawLinks() {
  const inner = $('bracketInner');
  if (!inner) return;
  const svg = inner.querySelector('svg.links');
  if (!svg) return;
  const origin = inner.getBoundingClientRect();
  const rect = (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
  };

  /* The label used to be another flex child under space-around, which put the
     word FINAL 1,252px above the final match. Pin each label to the top of
     its own first pairing instead. */
  for (const col of inner.querySelectorAll('.round')) {
    const head = col.querySelector('.roundhead');
    const first = col.querySelector('.match');
    if (!head || !first) continue;
    head.style.top = '0px';
    const colTop = col.getBoundingClientRect().top;
    const gap = first.getBoundingClientRect().top - colTop;
    const wanted = Math.max(0, Math.round(gap - head.getBoundingClientRect().height - 4));
    head.style.top = wanted + 'px';
  }

  const w = Math.max(inner.scrollWidth, Math.round(origin.width));
  const h = Math.max(inner.scrollHeight, Math.round(origin.height));
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.replaceChildren();
  const boxes = new Map();
  for (const node of inner.querySelectorAll('.match')) boxes.set(node.dataset.r + '-' + node.dataset.m, node);
  for (const [key, target] of boxes) {
    const r = Number(key.split('-')[0]);
    const m = Number(key.split('-')[1]);
    if (r === 0) continue;
    const t = rect(target);
    for (const side of [0, 1]) {
      const feed = boxes.get((r - 1) + '-' + (m * 2 + side));
      if (!feed) continue;
      const f = rect(feed);
      const fx = Math.round(f.x + f.w);
      const fy = Math.round(f.y + f.h / 2);
      const tx = Math.round(t.x);
      const ty = Math.round(t.y + t.h / 2);
      if (tx <= fx) continue;
      const mid = Math.round(fx + (tx - fx) / 2);
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', 'M' + fx + ' ' + fy + ' H' + mid + ' V' + ty + ' H' + tx);
      svg.append(p);
    }
  }
}

function updateScrollCues() {
  const box = $('bracket');
  const wrap = box.parentElement;
  const hidden = box.scrollWidth - box.clientWidth;
  const more = hidden > 4;
  wrap.classList.toggle('more', more && box.scrollLeft < hidden - 2);
  wrap.classList.toggle('less', box.scrollLeft > 2);
  $('scrollCue').hidden = !more || state.names.length < 2;
}

function renderTitle() {
  const t = (state.title || '').trim();
  const h = $('eventTitle');
  h.textContent = t;
  h.hidden = !t;
  document.title = t ? t + ', Bracket Maker' : BASE_TITLE;
  $('printTitle').textContent = t || 'Tournament bracket';
  const when = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  $('printMeta').textContent = state.names.length
    ? state.names.length + ' entrants · printed ' + when + ' · Bracket Maker by Sky Wolf Studio'
    : 'Printed ' + when + ' · Bracket Maker by Sky Wolf Studio';
}

function renderCounts(info) {
  const n = info.names.length;
  const count = $('entrantCount');
  count.replaceChildren();
  if (!info.total) { count.textContent = 'No entrants yet'; }
  else if (info.dropped) {
    count.append(document.createTextNode(n + ' of ' + MAX_ENTRANTS + ' entrants, '));
    count.append(el('span', { class: 'over', text: info.dropped + ' more ' + (info.dropped === 1 ? 'line is' : 'lines are') + ' not in the bracket' }));
  } else {
    count.textContent = n + ' of ' + MAX_ENTRANTS + ' entrants';
  }
  const bits = [];
  if (info.dropped) bits.push('This bracket holds ' + MAX_ENTRANTS + ' entrants. The last ' + info.dropped + ' ' + (info.dropped === 1 ? 'line is' : 'lines are') + ' still in the box above but are not playing, delete them, or split into two brackets.');
  if (info.truncated) bits.push(info.truncated + ' ' + (info.truncated === 1 ? 'name was' : 'names were') + ' shortened to 40 characters so they fit a match card.');
  const warn = $('capWarn');
  warn.textContent = bits.join(' ');
  warn.hidden = bits.length === 0;
}

function renderVisitNotice() {
  const box = $('visitNotice');
  const showing = mode === 'visiting' && mine && mine.names.length > 0;
  box.hidden = !showing;
  if (showing) $('mineName').textContent = (mine.title || '').trim() || mine.names.length + ' entrants, starting with ' + mine.names[0];
}

function update() {
  renderTitle();
  renderVisitNotice();
  renderBracket();
}

/* ── Actions ─────────────────────────────────────────────────────────────── */
function pick(r, m, idx, a, b) {
  if (a === null || b === null) return;
  state = setPick(state, r, m, idx);
  save();
  renderBracket();
  if (shared && !linkStale) {
    linkStale = true;
    toast('Result recorded. The link you sent is a snapshot, so it does not show this yet.', {
      ms: 7000,
      action: { label: 'Copy a fresh link', onAction: doShare },
    });
  }
}

async function copyLink(url, okMsg) {
  try {
    await navigator.clipboard.writeText(url);
    shared = true; linkStale = false;
    toast(okMsg);
    return true;
  } catch (e) {
    toast('Could not reach the clipboard, the link is in the address bar.', { assertive: true });
    return false;
  }
}

async function doShare() {
  if (state.names.length < 2) { toast('Add the entrants first'); return; }
  save();
  const url = location.href;
  const name = (state.title || '').trim() || 'Bracket';
  if (navigator.share) {
    try {
      await navigator.share({ title: name, text: name + ', the whole bracket is in this link', url });
      shared = true; linkStale = false;
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  copyLink(url, 'Snapshot link copied, it carries every entrant and every result so far');
}

/* Undo baseline for entrant-list edits. One keystroke is one edit, so a burst
   of typing collapses onto the state the user started from. */
let editBaseline = null;
let baselineTimer = null;

function onEntrantsInput(value) {
  const info = entrantInfo(value);
  renderCounts(info);
  const same = info.names.length === state.names.length && info.names.every((x, i) => x === state.names[i]);
  if (same) return;

  const before = clone(state);
  const res = carryPicks(state, info.names);
  state = res.state;
  save();
  renderTitle();
  renderBracket();

  if (res.lost > 0) {
    if (!editBaseline) editBaseline = before;
    clearTimeout(baselineTimer);
    baselineTimer = setTimeout(() => { editBaseline = null; }, 10000);
    const snap = editBaseline;
    undoToast(
      res.lost + (res.lost === 1 ? ' result no longer fits the new line-up' : ' results no longer fit the new line-up'),
      () => {
        state = clone(snap);
        editBaseline = null;
        $('entrants').value = state.names.join('\n');
        renderCounts(entrantInfo($('entrants').value));
        save();
        update();
      },
    );
  }
}

function wire() {
  $('titleInput').addEventListener('input', (ev) => {
    state.title = ev.target.value.slice(0, 60);
    save();
    renderTitle();
  });
  $('entrants').addEventListener('input', (ev) => onEntrantsInput(ev.target.value));

  $('shareBtn').addEventListener('click', doShare);

  $('printBtn').addEventListener('click', () => {
    if (state.names.length < 2) { toast('Add the entrants first'); return; }
    preparePrint();
    window.print();
  });

  $('resetBtn').addEventListener('click', () => {
    const had = Object.keys(state.picks).length;
    if (!had) { toast('No results to clear'); return; }
    const snap = clone(state);
    state = { ...state, picks: {} };
    save();
    renderBracket();
    undoToast(had === 1 ? '1 result cleared' : had + ' results cleared', () => {
      state = clone(snap);
      save();
      renderBracket();
    });
  });

  $('openMine').addEventListener('click', () => {
    if (!mine) return;
    const visiting = clone(state);
    state = clone(mine);
    mode = 'mine';
    mine = null;
    save();
    update();
    undoToast('Back to your own bracket', () => {
      mine = readStored(KEY);
      state = visiting;
      mode = 'visiting';
      save();
      update();
    });
    syncFields();
  });

  $('keepThis').addEventListener('click', () => {
    const previous = mine ? clone(mine) : null;
    mine = null;
    mode = 'mine';
    save();
    update();
    undoToast('Saved as your bracket', () => {
      if (!previous) return;
      const visiting = clone(state);
      try { localStorage.setItem(KEY, JSON.stringify(previous)); } catch (e) {}
      mine = previous;
      mode = 'visiting';
      state = visiting;
      save();
      update();
    });
  });

  $('bracket').addEventListener('scroll', updateScrollCues, { passive: true });
  window.addEventListener('resize', () => { drawLinks(); updateScrollCues(); });
  window.addEventListener('beforeprint', preparePrint);

  /* An installed PWA opens a link in the tab it already has. app.js used to
     read location.hash once, so the URL changed and the old bracket stayed. */
  window.addEventListener('hashchange', () => {
    if (location.hash === lastHash) return;
    const incoming = decodeBracket(location.hash);
    lastHash = location.hash;
    if (!incoming || !incoming.names.length) return;
    if (sameBracket(incoming, state)) return;
    const previous = { state: clone(state), mode, mine: mine ? clone(mine) : null };
    if (mode === 'mine' && state.names.length) mine = clone(state);
    state = incoming;
    mode = mine && mine.names.length ? 'visiting' : 'mine';
    save();
    update();
    syncFields();
    undoToast('Opened the bracket from that link', () => {
      state = previous.state;
      mode = previous.mode;
      mine = previous.mine;
      save();
      update();
      syncFields();
    });
  });

  /* The comfort panel can change the root font size, density and theme; the
     connectors are pixel geometry and have to be redrawn when it does. */
  new MutationObserver(() => { drawLinks(); updateScrollCues(); })
    .observe(document.documentElement, { attributes: true });
  if (window.ResizeObserver) {
    new ResizeObserver(() => { drawLinks(); updateScrollCues(); }).observe($('bracket'));
  }
}

function syncFields() {
  $('titleInput').value = state.title || '';
  $('entrants').value = state.names.join('\n');
  renderCounts(entrantInfo($('entrants').value));
}

/* ── Paper ───────────────────────────────────────────────────────────────
   The sheet used to run to three pages, clip 58px off the final round at
   Letter portrait, and split pairings across the break. Pick the orientation
   from the real content width and scale to fit inside the printable area. */
function preparePrint() {
  const inner = $('bracketInner');
  const style = $('bmPageStyle');
  if (!inner || !style) return;
  const prev = inner.style.zoom;
  inner.style.zoom = '';
  const w = Math.max(inner.scrollWidth, Math.ceil(inner.getBoundingClientRect().width));
  inner.style.zoom = prev;
  const h = Math.max(1, Math.ceil(inner.getBoundingClientRect().height));
  // The printable box of US Letter at 96dpi, less the base layer's 14mm
  // margins: 710 × 950 portrait, 950 × 710 landscape. Portrait first, // landscape only when the bracket genuinely needs it.
  const SHORT = 710, LONG = 950;
  const landscape = w > SHORT;
  style.textContent = '@media print{@page{size:' + (landscape ? 'landscape' : 'portrait') + '; margin:14mm}}';
  const availW = landscape ? LONG : SHORT;
  const availH = (landscape ? SHORT : LONG)
    - 100 - $('eventTitle').offsetHeight - $('champ').offsetHeight;   // header, title, champion line
  // Fit the height too where that still leaves the names readable, a bracket
  // on one sheet is the whole point of taping it to a wall. Below 0.65 the
  // names stop being readable across a room, so take the extra page instead.
  const scale = Math.min(1, availW / w, Math.max(availH / h, 0.65));
  document.documentElement.style.setProperty('--bm-print-scale', String(Math.round(scale * 1e4) / 1e4));
}

/* ── QR ──────────────────────────────────────────────────────────────────── */
function showQr(url) {
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  let count = 0;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    count = qr.getModuleCount();
    const canvas = $('qrCanvas');
    // Draw at device resolution and size in CSS px, so a module is always a
    // whole number of device pixels. The old arithmetic floored to 1 CSS px
    // per module at 32 realistic names, below what a camera resolves.
    const mod = Math.max(2, Math.floor((300 * dpr) / (count + 8)));
    const px = mod * (count + 8);
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = (px / dpr) + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000';
    const off = mod * 4;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * mod, off + r * mod, mod, mod);
    }
    const cssMod = Math.floor((300 * dpr) / (count + 8)) / dpr;
    $('qrDense').hidden = cssMod >= 2.2;
  } catch (e) {
    toast('Could not draw the QR, use the link in the box instead.', { assertive: true });
    $('qrDense').hidden = true;
  }
  $('qrUrl').value = url;
  $('qrUrl').scrollTop = 0;
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  // Focus the action, not the link box, a textarea taking focus scrolls
  // itself to the end and reads as an edit field the user is expected to fix.
  try { $('qrCopy').focus(); } catch (e) {}
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  syncFields();
  update();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
$('qrCopy').addEventListener('click', () => copyLink($('qrUrl').value, 'Link copied, paste it into the group chat'));
$('qrBtn').addEventListener('click', () => {
  if (state.names.length < 2) { toast('Add the entrants first'); return; }
  save();
  showQr(location.href);
});
