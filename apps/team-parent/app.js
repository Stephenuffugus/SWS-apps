// Team Parent — Engine 1, skin B. One coach signs in; every family taps a link.
// Same engine as signup-sheets: slots are events/duties, claims are RSVPs,
// entries are announcements (owner) and notes (anyone).
// All user data reaches the DOM via textContent (the el() helper) — never innerHTML.
import {
  normalizeCode, parseBulkSlots, dateRangeSlots, fillStats, shareUrl,
  dateKey, isDated, keyParts, keyToDate, keyToInputs, formatKey, formatTime,
  composeLabel, parseLabel, sortSlots, isPast, seasonIcs, weekMessage,
  nudgeMessage, sniffDateTime, UNDATED_BASE,
} from './helpers.js';
import * as D from './data.js';
import { firebaseConfig } from './firebase-config.js';

D.initFirebase(firebaseConfig);

const CONFIG = {
  // Stripe payment link for the tip jar — button stays hidden while empty.
  tipUrl: 'https://buy.stripe.com/dRm3cw7THb9taHPbyh7EQ02',
};

// Events with this capacity are open RSVPs ("who's coming?") rather than
// duty slots ("2 volunteers needed").
const RSVP_CAP = 999;

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
let toastTimer = null;
// Delegates to the studio runtime so a plain toast and an Undo toast share one
// lifecycle (and one timer). Falls back if sws-ui.js failed to load.
function toast(msg, ms) {
  if (window.SWS && window.SWS.toast) return window.SWS.toast(msg, { ms: ms || 2400 });
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
  return t;
}
function undoToast(msg, restore, ms) {
  if (window.SWS && window.SWS.undo) return window.SWS.undo(msg, restore, { ms: ms || 8000 });
  return toast(msg, ms);
}
/* #view is no longer a live region (it is rebuilt wholesale). Anything a
   screen reader must hear about the board goes through this one small one. */
function announce(msg) {
  const n = $('liveStatus');
  if (n) n.textContent = msg;
}
function showDlg(d) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
function closeDlg(d) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) {
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg || 'Copied'); }
    catch (e2) { toast('Could not copy'); }
    ta.remove();
  }
}
function friendly(e) {
  const code = (e && (e.code || e.message)) || '';
  if (String(code).includes('permission-denied')) return 'That didn’t go through — the spot may have just filled, or the page is locked.';
  if (String(code).includes('unavailable')) return 'You look offline — the change is queued and will sync when you reconnect.';
  return 'Something went wrong. Try again?';
}

/* ---------- state ---------- */
let user = null;
const NAME_KEY = 'tp-myname';
const myName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
const saveName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} };

const live = {
  boardId: null, code: null,
  board: null, slots: [], entries: [],
  claims: new Map(),
  unsubs: [], claimUnsubs: new Map(),
  stop() {
    this.unsubs.forEach(u => u && u());
    this.claimUnsubs.forEach(u => u && u());
    this.unsubs = []; this.claimUnsubs = new Map();
    this.boardId = null; this.code = null; this.board = null;
    this.slots = []; this.entries = []; this.claims = new Map();
  },
};

function route() {
  const m = location.hash.match(/^#\/b\/([A-HJ-NP-Z2-9]{6})/);
  if (m) return { view: 'board', code: m[1] };
  return { view: 'home' };
}
window.addEventListener('hashchange', render);

const isOwner = () => !!(user && live.board && live.board.ownerUid === user.uid);

/* ---------- home ---------- */
// Participants see an invitation instead of the standard colophon — every
// shared board doubles as the product's own ad. Owners and home keep the default.
function setGrowthFooter(participant) {
  const o = document.getElementById('orgLine');
  if (!o) return;
  if (!o.dataset.home) o.dataset.home = o.innerHTML;
  o.innerHTML = participant
    ? 'Made with <a href="./" style="color:inherit">Team Parent</a> — free, no ads. <a href="./" style="color:inherit">Start yours</a>'
    : o.dataset.home;
}

async function renderHome() {
  setGrowthFooter(false);
  live.stop();
  applyTheme(null);
  $('authBtn').classList.remove('hidden');
  if ($('tipLink') && CONFIG.tipUrl) $('tipLink').classList.remove('hidden');
  const v = $('view');
  v.replaceChildren();

  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'The whole season, one link'),
    el('p', {}, 'Practices, games, snack duty, carpools. Families RSVP and claim duties in seconds — ',
      el('strong', {}, 'no accounts, no group-text chaos, no ads.')),
    el('button', { class: 'btn primary', type: 'button', onclick: startCreate }, 'Create a team page'),
  ));

  const codeInput = el('input', {
    type: 'text', placeholder: 'ABC123', maxlength: '8', autocomplete: 'off',
    style: 'text-transform:uppercase; letter-spacing:.15em; text-align:center',
    'aria-label': 'Team code',
    onkeydown: (ev) => { if (ev.key === 'Enter') openBtn.click(); },
  });
  const openBtn = el('button', {
    class: 'btn', type: 'button', style: 'flex:0 0 auto',
    onclick: () => {
      const c = normalizeCode(codeInput.value);
      if (!c) { toast('Codes are 6 letters/numbers — check with your organizer'); return; }
      location.hash = '#/b/' + c;
    },
  }, 'Open');
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Got a team code?'),
    el('div', { class: 'row' }, codeInput, openBtn),
    el('p', { class: 'hint', text: 'If your coach shared a link, just tap it — this box is for codes read out loud.' })));

  if (user && !D.isAnon(user)) {
    const sec = el('section', { class: 'card' }, el('h2', {}, 'Your teams'));
    const list = el('ul', { class: 'plain' });
    sec.append(list, el('p', { class: 'hint', text: 'Loading…' }));
    v.append(sec);
    try {
      const boards = (await D.myBoards(user.uid)).filter(b => b.skin === 'team');
      sec.lastChild.remove();
      if (boards.length === 0) sec.append(el('p', { class: 'hint', text: 'No teams yet — create your first one above.' }));
      for (const b of boards) {
        list.append(el('li', {},
          el('div', { class: 'grow' },
            el('div', { text: b.title }),
            el('div', { class: 'sub', text: 'Code ' + b.shareCode + (b.settings?.locked ? ' · locked' : '') })),
          el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/b/' + b.shareCode; } }, 'Open')));
      }
    } catch (e) {
      sec.lastChild.textContent = 'Couldn’t load your teams: ' + friendly(e);
    }
  }
}

function startCreate() {
  if (!user || D.isAnon(user)) { showDlg($('authDlg')); return; }
  $('createTitle').value = '';
  $('createDesc').value = '';
  showDlg($('createDlg'));
  $('createTitle').focus();
}

/* ---------- board ---------- */
async function renderBoard(code) {
  const v = $('view');
  if (live.code !== code) {
    live.stop();
    v.replaceChildren(el('p', { class: 'hint', text: 'Opening team page…' }));
    try { await D.ensureSignedIn(); }
    catch (e) { v.replaceChildren(el('p', { class: 'warn', text: 'Couldn’t connect. Check your internet and reload.' })); return; }
    const boardId = await D.resolveCode(code).catch(() => null);
    if (!boardId) {
      v.replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'warn', text: 'That team page doesn’t exist — the organizer may have rotated the link.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    live.boardId = boardId; live.code = code;
    live.unsubs.push(D.watchBoard(boardId, (b) => { live.board = b; drawBoard(); },
      (e) => toast(friendly(e), 5000)));
    live.unsubs.push(D.watchSlots(boardId, (slots) => { live.slots = slots; syncClaimWatchers(); drawBoard(); },
      (e) => toast(friendly(e), 5000)));
  }
  drawBoard();
}

let entriesWatcherKey = '';
function syncEntriesWatcher() {
  if (!live.board || !user) return;
  const key = live.boardId + '|' + user.uid + '|' + isOwner();
  if (key === entriesWatcherKey) return;
  entriesWatcherKey = key;
  if (live._entriesUnsub) live._entriesUnsub();
  live._entriesUnsub = D.watchEntries(live.boardId, user.uid, isOwner(),
    (entries) => { live.entries = entries; drawBoard(); },
    (e) => toast(friendly(e), 5000));
  live.unsubs.push(() => { if (live._entriesUnsub) live._entriesUnsub(); entriesWatcherKey = ''; });
}

function syncClaimWatchers() {
  const want = new Set(live.slots.map(s => s.id));
  for (const [slotId, unsub] of live.claimUnsubs) {
    if (!want.has(slotId)) { unsub(); live.claimUnsubs.delete(slotId); live.claims.delete(slotId); }
  }
  for (const s of live.slots) {
    if (live.claimUnsubs.has(s.id)) continue;
    live.claimUnsubs.set(s.id, D.watchClaims(live.boardId, s.id,
      (claims) => { live.claims.set(s.id, claims); drawBoard(); },
      () => {}));
  }
}

/* ---------- board colour ----------
   The old version wrote only `--accent` onto documentElement.style while every
   visible surface paints from `--accent-fill`, so all five themes rendered the
   identical blue button. It now emits the whole ramp, in OKLCH so the five
   read as equally weighted, into a stylesheet rather than an inline style —
   an inline style on <html> outranks the comfort panel's high-contrast block,
   a stylesheet does not, and a stylesheet can carry a dark-mode variant.
   Fills sit at L .42 so ink-on-fill clears the 7:1 this app is read at (sun on
   a phone in a parked car), not the 4.5:1 floor. */
const THEMES = {
  clay:   { name: 'Clay',   h: 38,  C: 0.13, L: 0.62 },
  amber:  { name: 'Amber',  h: 78,  C: 0.13, L: 0.66 },
  green:  { name: 'Green',  h: 150, C: 0.11, L: 0.62 },
  teal:   { name: 'Teal',   h: 205, C: 0.10, L: 0.62 },
  plum:   { name: 'Plum',   h: 330, C: 0.11, L: 0.60 },
};
let themeStyleEl = null;
function themeVars(t, dark) {
  const o = (L, C) => `oklch(${L} ${C} ${t.h})`;
  return dark
    ? [`--accent:${o(0.76, t.C * 0.85)}`, `--accent-fill:${o(0.84, t.C * 0.7)}`,
       `--accent-deep:${o(0.84, t.C * 0.7)}`, `--accent-press:${o(0.74, t.C * 0.8)}`,
       `--accent-soft:${o(0.30, t.C * 0.35)}`, `--accent-ink:${o(0.18, t.C * 0.25)}`,
       `--mine:${o(0.31, t.C * 0.3)}`].join(';')
    : [`--accent:${o(0.62, t.C)}`, `--accent-fill:${o(0.42, t.C * 0.95)}`,
       `--accent-deep:${o(0.42, t.C * 0.95)}`, `--accent-press:${o(0.34, t.C * 0.9)}`,
       `--accent-soft:${o(0.955, t.C * 0.22)}`, `--accent-ink:${o(0.99, t.C * 0.03)}`,
       `--mine:${o(0.94, t.C * 0.28)}`].join(';');
}
function applyTheme(themeKey) {
  // A board written before the themes were renamed keeps working: unknown keys
  // simply fall through to the app's own skin.
  const t = THEMES[themeKey];
  if (!themeStyleEl) {
    themeStyleEl = document.createElement('style');
    themeStyleEl.id = 'tpTheme';
    document.head.append(themeStyleEl);
  }
  document.documentElement.style.removeProperty('--accent'); // legacy inline write
  if (!t) { themeStyleEl.textContent = ''; return; }
  themeStyleEl.textContent =
    `:root{${themeVars(t, false)}}\n` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${themeVars(t, true)}}}\n` +
    `:root[data-theme="dark"]{${themeVars(t, true)}}\n`;
}

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

/* ---------- redraw model ----------
   Four Firestore listeners, plus one per slot, plus the segmented control all
   called drawBoard() directly: measured 108 full teardowns of #view in 3.14s
   on a 100-event board. Coalesce them into one paint per animation frame, and
   carry across the things a rebuild would otherwise throw away — the Manage
   accordion's open state, the scroll position, the focused field, its caret,
   and every half-typed value in the panel. */
let paintQueued = false;
let manageOpen = false;
const manageDraft = Object.create(null);
const draft = (k, fallback) => (manageDraft[k] !== undefined ? manageDraft[k] : (fallback || ''));

function drawBoard() {
  if (paintQueued) return;
  paintQueued = true;
  const run = () => { paintQueued = false; paintBoard(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

function focusSnapshot() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.k) return null;
  const s = { k: a.dataset.k };
  try { s.start = a.selectionStart; s.end = a.selectionEnd; } catch (e) {}
  return s;
}
function focusRestore(snap) {
  if (!snap) return;
  let n = null;
  try { n = document.querySelector('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(snap.k) : snap.k) + '"]'); }
  catch (e) { return; }
  if (!n) return;
  try { n.focus({ preventScroll: true }); } catch (e) { return; }
  if (snap.start !== null && snap.start !== undefined && n.setSelectionRange) {
    try { n.setSelectionRange(snap.start, snap.end); } catch (e) {}
  }
}
function scrollRestore(y) {
  if (Math.abs(window.scrollY - y) < 2) return;
  try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }
  catch (e) { window.scrollTo(0, y); }
}

/* A tracked field: its value survives a redraw and so does the caret. */
function tracked(key, attrs) {
  const n = el(attrs.tag === 'textarea' ? 'textarea' : 'input', {
    ...attrs, tag: undefined, 'data-k': key,
    oninput: (ev) => { manageDraft[key] = ev.target.value; if (attrs.oninput) attrs.oninput(ev); },
  });
  n.value = draft(key, attrs.value);
  return n;
}

/* ---------- links out of plain text ----------
   Nothing is fetched: these are ordinary links the reader chooses to tap. */
const mapsUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
function linkify(text) {
  const out = [];
  const re = /(https?:\/\/[^\s<>"']+)|(\+?\d[\d\s().-]{7,}\d)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(el('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer', text: m[1] }));
    else out.push(el('a', { href: 'tel:' + m[2].replace(/[^\d+]/g, ''), text: m[2] }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const TRUST_PATH_A = 'M12 3 4 6.5v5c0 4.6 3.2 8.3 8 9.5 4.8-1.2 8-4.9 8-9.5v-5L12 3Z';
const TRUST_PATH_B = 'm9 12 2 2 4-4';
function trustBadge() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of [TRUST_PATH_A, TRUST_PATH_B]) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return el('p', { class: 'trust noprint' }, svg,
    el('span', {}, el('b', {}, 'No ads. No account. Nothing tracked.'),
      ' Families never sign up or install anything — tapping the link is the whole thing. ' +
      'The only information this page holds is what the organizer typed (the schedule, the team details) ' +
      'and the name and note a family adds when they claim a spot; that is stored so everyone sees the ' +
      'same page, and it is never sold, never advertised against, and there is no tracking and no email list.'));
}

/* The printed sheet has to lead back to the live page — that is the whole
   point of putting it on the fridge. */
let printQrCanvas = null, printQrFor = '';
function printQr(url) {
  if (printQrFor === url && printQrCanvas) return printQrCanvas;
  if (typeof qrcode !== 'function') return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url); qr.make();
    const c = printQrCanvas || (printQrCanvas = document.createElement('canvas'));
    const size = 216, count = qr.getModuleCount();
    c.width = size; c.height = size;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'QR code for this team page');
    const cell = Math.floor(size / (count + 6));
    const off = Math.floor((size - cell * count) / 2);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let cc = 0; cc < count; cc++)
      if (qr.isDark(r, cc)) ctx.fillRect(off + cc * cell, off + r * cell, cell, cell);
    printQrFor = url;
    return c;
  } catch (e) { return null; }
}

function paintBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  setGrowthFooter(!own);
  // The recipient's four seconds must not open on an account prompt and a
  // money link — the documented "I thought it was spam" reflex.
  $('authBtn').classList.toggle('hidden', !own);
  const tip = $('tipLink');
  if (tip) tip.classList.toggle('hidden', !own || !CONFIG.tipUrl);
  const locked = !!b.settings?.locked;
  applyTheme(b.settings?.theme);
  const v = $('view');
  const keepY = window.scrollY;
  const keepFocus = focusSnapshot();
  v.replaceChildren();

  const url = shareUrl(live.code, baseUrl());
  const now = new Date();
  const sorted = sortSlots(live.slots);
  const dated = sorted.filter(s => isDated(s.order));
  const undatedSlots = sorted.filter(s => !isDated(s.order));
  const upcoming = dated.filter(s => !isPast(s.order, now));
  const pastSlots = dated.filter(s => isPast(s.order, now));

  // --- print-only masthead: the code and the QR that reopen the live page ---
  const qrc = printQr(url);
  v.append(el('div', { class: 'printonly printhead' },
    el('div', { class: 'ph-text' },
      el('div', { class: 'ph-title', text: b.title }),
      el('div', { class: 'ph-sub', text: 'Always-current schedule — no app, no account:' }),
      el('div', { class: 'ph-url', text: url }),
      el('div', { class: 'ph-code' }, 'Team code: ', el('b', { text: live.code }))),
    qrc ? el('div', { class: 'ph-qr' }, qrc) : null));

  // --- title ---
  const head = el('section', { class: 'card' });
  head.append(el('div', { style: 'display:flex;align-items:baseline;gap:8px' },
    el('h2', { style: 'all:unset;font-size:1.3rem;font-weight:700;flex:1;overflow-wrap:anywhere', text: b.title }),
    own ? el('span', { class: 'badge noprint', text: 'you run this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub desc', style: 'margin:6px 0 0' }, linkify(b.description)));
  head.append(trustBadge());
  v.append(head);

  if (own) {
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Share with the families'),
      el('div', { class: 'sharecode', text: live.code }),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => copyText(url, 'Link copied — drop it in the group chat once, done') }, 'Copy link'),
        el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code')),
      el('p', { class: 'hint', text: 'One share reaches everyone. Families never need accounts.' })));
  }

  if (locked) v.append(el('div', { class: 'banner', text: own
    ? 'This page is locked — families can look but not RSVP. Unlock it in Manage.'
    : 'This page is locked by the organizer — read-only for now.' }));
  if (!navigator.onLine) v.append(el('div', { class: 'banner', text: 'You’re offline — you can read the page; RSVPs will sync when you’re back.' }));

  // --- announcements (pinned) ---
  const announcements = live.entries.filter(e => e.type === 'announcement' && e.status === 'ok');
  if (announcements.length) {
    const latest = announcements[0];
    v.append(el('div', { class: 'announce' },
      el('div', { class: 'who', text: 'Updated ' + entryStamp(latest) }),
      el('div', { style: 'font-weight:600', text: '📣 ' + latest.body }),
      announcements.length > 1
        ? el('details', { style: 'margin-top:8px' },
            el('summary', { class: 'sub', style: 'cursor:pointer' }, 'Older announcements (' + (announcements.length - 1) + ')'),
            el('ul', { class: 'plain' },
              announcements.slice(1).map(a => el('li', {},
                el('div', { class: 'grow' }, el('div', {}, a.body), el('div', { class: 'sub', text: entryStamp(a) }),
                ),
                own ? el('button', { class: 'btn small danger noprint', type: 'button', 'aria-label': 'Delete announcement',
                  onclick: () => D.deleteEntry(live.boardId, a.id).catch(err => toast(friendly(err))) }, '✕') : null))))
        : null,
      own ? el('div', { class: 'noprint', style: 'margin-top:6px' },
        el('button', { class: 'btn small danger', type: 'button',
          onclick: () => D.deleteEntry(live.boardId, latest.id).catch(err => toast(friendly(err))) }, 'Remove')) : null,
    ));
  }
  if (own) {
    // live snapshots redraw this whole view — the draft and the caret survive it
    const input = tracked('announce', { type: 'text', maxlength: '2000', placeholder: 'Practice cancelled — field is flooded…',
      'aria-label': 'New announcement',
      onkeydown: (ev) => { if (ev.key === 'Enter') postBtn.click(); } });
    const postBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
      onclick: async () => {
        const body = input.value.trim();
        if (!body) return;
        try {
          await D.addEntry(live.boardId, b, { authorName: b.title + ' organizer', body, type: 'announcement' });
          manageDraft.announce = '';
          input.value = '';
          toast('Posted — it is pinned to the top for every family, with the time on it');
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Post');
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Post an announcement'),
      el('div', { class: 'row' }, input, postBtn),
      el('p', { class: 'hint', text: 'Pinned to the top of the page for every family, stamped with the time you posted it.' })));
  }

  // --- next up: the answer, above the list ---
  v.append(renderNextUp(upcoming, undatedSlots, own, locked));

  // --- schedule, in date order ---
  const schedCard = el('section', { class: 'card' }, el('h2', {}, 'Schedule & duties'));
  // "Duties filled: 1 of 12" is an organizer metric — it is not one of the
  // three questions a family opens this page with.
  if (own) {
    const stats = fillStats(live.slots.filter(s => s.capacity < RSVP_CAP));
    if (stats.total > 0) schedCard.append(el('div', { class: 'sub', style: 'margin-bottom:6px', text: 'Duties filled: ' + stats.taken + ' of ' + stats.total }));
  }
  if (live.slots.length === 0) {
    schedCard.append(el('p', { class: 'hint', text: own
      ? 'No events yet — open Manage below to add practices, games, and duty slots.'
      : 'The organizer hasn’t added the schedule yet.' }));
  }
  let lastDay = '';
  for (const s of upcoming) {
    const day = formatKey(s.order).split(' · ')[0];
    if (day && day !== lastDay) { schedCard.append(el('h3', { class: 'dayhead', text: day })); lastDay = day; }
    schedCard.append(renderEvent(s, own, locked));
  }
  if (undatedSlots.length) {
    if (upcoming.length) schedCard.append(el('h3', { class: 'dayhead', text: 'No date set' }));
    for (const s of undatedSlots) schedCard.append(renderEvent(s, own, locked));
  }
  if (pastSlots.length) {
    const inner = el('div', {});
    for (const s of pastSlots) inner.append(renderEvent(s, own, locked, true));
    schedCard.append(el('details', { class: 'pastwrap' },
      el('summary', { class: 'sub' }, 'Earlier this season (' + pastSlots.length + ')'),
      inner));
  }
  v.append(schedCard);

  // --- notes ---
  v.append(renderNotes(b, own, locked));

  // --- manage ---
  if (own) v.append(renderManage(b));

  if (!own) {
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Keep this'),
      el('div', { class: 'row', style: 'flex-wrap:wrap' },
        el('button', { class: 'btn', type: 'button', onclick: () => copyText(url, 'Link copied') }, 'Copy link'),
        el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'),
        el('button', { class: 'btn', type: 'button', onclick: () => downloadIcs(b) }, 'Add season to calendar'),
        el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print')),
      el('p', { class: 'hint', text: 'The calendar file downloads straight to this device — no calendar permission, no sign-in. The printed sheet carries the QR back to this page.' })));
  }

  focusRestore(keepFocus);
  scrollRestore(keepY);
}

/* Firestore stamps `createdAt` server-side; it is briefly null on a local
   write, which is exactly when "Just now" is true. */
function entryStamp(e) {
  const raw = e && e.createdAt;
  const d = raw && typeof raw.toDate === 'function' ? raw.toDate() : (raw instanceof Date ? raw : null);
  if (!d || isNaN(d.getTime())) return 'just now';
  const now = new Date();
  const t = formatTime(d.getHours(), d.getMinutes());
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (d.toDateString() === now.toDateString()) return 'today ' + t;
  if ((now - d) < 6 * 86400000) return DOW[d.getDay()] + ' ' + t;
  return `${MON[d.getMonth()]} ${d.getDate()} · ${t}`;
}

/* ---------- the answer block ----------
   Four seconds in a supermarket aisle, or a parked car with sun on the screen.
   Three questions: is it our turn, what time and where, what colour shirt. */
function renderNextUp(upcoming, undatedSlots, own, locked) {
  const card = el('section', { class: 'card nextup' });
  const mineOf = (s) => {
    const claims = live.claims.get(s.id) || [];
    return user ? claims.find(c => c.uid === user.uid) : null;
  };
  if (upcoming.length === 0) {
    card.append(el('h2', {}, 'Next up'),
      el('p', { class: 'nu-none', text: undatedSlots.length
        ? 'Nothing dated yet — the duties below still need names against them.'
        : 'Nothing on the calendar yet.' }));
    return card;
  }
  const p0 = keyParts(upcoming[0].order);
  const dayOf = (s) => { const p = keyParts(s.order); return p ? p.y * 10000 + p.m * 100 + p.d : 0; };
  const firstDay = dayOf(upcoming[0]);
  const today = new Date();
  const isToday = p0.y === today.getFullYear() && p0.m === today.getMonth() + 1 && p0.d === today.getDate();
  const sameDay = upcoming.filter(s => dayOf(s) === firstDay);

  card.append(el('h2', {}, 'Next up'));
  card.append(el('p', { class: 'nu-when', text: (isToday ? 'Today — ' : '') + formatKey(upcoming[0].order).split(' · ')[0] }));

  for (const s of sameDay) {
    const p = keyParts(s.order);
    const { name, where, wear } = parseLabel(s.label);
    const isRSVP = (s.capacity || 1) >= RSVP_CAP;
    const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
    const claims = live.claims.get(s.id) || [];
    const mine = mineOf(s);
    const row = el('div', { class: 'nu-item' });
    row.append(el('p', { class: 'nu-what' },
      p.hasTime ? el('b', { class: 'nu-time', text: formatTime(p.hh, p.mm) }) : null,
      el('span', { text: name || s.label }),
      mine ? el('span', { class: 'nu-yours', text: 'YOUR TURN' }) : null));
    if (where) row.append(el('p', { class: 'nu-line' }, '📍 ',
      el('a', { href: mapsUrl(where), target: '_blank', rel: 'noopener noreferrer', text: where })));
    if (wear) row.append(el('p', { class: 'nu-line', text: '👕 Wear ' + wear }));
    if (!isRSVP) {
      const who = claims.map(c => c.name).join(', ');
      row.append(el('p', { class: 'nu-line ' + (left === 0 ? 'nu-ok' : 'nu-need'),
        text: left === 0 ? 'Covered by ' + who : (who ? who + ' — ' + left + ' more needed' : left + ' still needed') }));
      if (!mine && left > 0 && !locked) row.append(el('div', { class: 'noprint' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => openClaim(s, false) }, 'I’ll cover this')));
    } else if (claims.length) {
      row.append(el('p', { class: 'nu-line', text: claims.length + ' going' }));
    }
    card.append(row);
  }

  // If this family's own turn is not on that day, say when it is and take
  // them to it — measured 2.61 viewports down before this existed.
  const nextMine = [...upcoming, ...undatedSlots].find(s => mineOf(s) && dayOf(s) !== firstDay);
  if (nextMine) {
    const { name } = parseLabel(nextMine.label);
    card.append(el('p', { class: 'nu-line nu-mine noprint' },
      'Your turn next: ', el('b', { text: (name || nextMine.label) + (isDated(nextMine.order) ? ' · ' + formatKey(nextMine.order) : '') }), ' ',
      el('button', { class: 'btn small', type: 'button', onclick: () => jumpTo('slot-' + nextMine.id) }, 'Show me')));
  }
  return card;
}

function jumpTo(id) {
  const n = document.getElementById(id);
  if (!n) return;
  n.scrollIntoView({ block: 'center', behavior: document.documentElement.dataset.motion === 'less' ? 'auto' : 'smooth' });
  n.classList.add('flash');
  setTimeout(() => n.classList.remove('flash'), 1600);
  n.setAttribute('tabindex', '-1');
  try { n.focus({ preventScroll: true }); } catch (e) {}
}

function renderEvent(s, own, locked, past) {
  const claims = live.claims.get(s.id) || [];
  const mine = user && claims.find(c => c.uid === user.uid);
  const isRSVP = (s.capacity || 1) >= RSVP_CAP;
  const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
  const box = el('div', { class: 'slot' + (past ? ' past' : ''), id: 'slot-' + s.id });
  const countText = isRSVP
    ? (s.claimedCount || 0) + ' going'
    : (left === 0 ? 'Covered' : (s.claimedCount || 0) + ' of ' + s.capacity);
  const p = keyParts(s.order);
  const { name, where, wear } = parseLabel(s.label);
  const labelSpan = el('span', { class: 'label' },
    p && p.hasTime ? el('b', { class: 'when', text: formatTime(p.hh, p.mm) }) : null,
    past && p ? el('b', { class: 'when', text: formatKey(s.order).split(' · ')[0] }) : null,
    el('span', { text: name || s.label }));
  const top = el('div', { class: 'top' },
    labelSpan,
    el('span', { class: 'count' + (!isRSVP && left === 0 ? ' full' : ''), text: countText }));
  if (own) top.append(el('button', { class: 'btn small icon noprint', type: 'button', 'aria-label': 'Edit ' + (name || s.label), onclick: () => openSlotDlg(s) }, '✎'));
  box.append(top);
  if (where || wear) {
    const meta = el('div', { class: 'slotmeta' });
    if (where) meta.append(el('span', {}, '📍 ',
      el('a', { href: mapsUrl(where), target: '_blank', rel: 'noopener noreferrer', text: where })));
    if (wear) meta.append(el('span', { text: '👕 ' + wear }));
    box.append(meta);
  }
  const chips = el('div', { class: 'chips' });
  for (const c of claims) {
    const isMine = user && c.uid === user.uid;
    const chip = el('span', { class: 'chip' + (isMine ? ' mine' : '') },
      el('span', { class: 'chiptext' }, c.name, isMine ? el('span', { class: 'noprint', text: ' (you)' }) : null,
        c.note ? ' · ' + c.note : ''));
    if ((isMine && !locked) || own) chip.append(el('button', {
      type: 'button', 'aria-label': (isMine ? 'Give up my spot on ' : 'Remove ' + c.name + ' from ') + (name || s.label),
      class: 'noprint chipx',
      onclick: async () => {
        // The most destructive tap a parent can make. Snapshot first, then
        // offer the way back — a confirm here would tax every deliberate tap
        // and still not catch the accidental one.
        const snap = { name: c.name, note: c.note || '' };
        try {
          if (isMine) await D.releaseClaim(live.boardId, s.id);
          else await D.ownerRemoveClaim(live.boardId, s.id, c.uid);
        } catch (e) { toast(friendly(e), 4500); return; }
        if (isMine) {
          undoToast(isRSVP ? 'RSVP withdrawn' : 'Spot given up — ' + (name || s.label), async () => {
            try { await D.claimSlot(live.boardId, s.id, snap.name, snap.note); toast('Back in — ' + (name || s.label)); }
            catch (e2) { toast(friendly(e2), 5000); }
          });
        } else {
          toast('Removed ' + snap.name);
        }
      },
    }, '✕'));
    chips.append(chip);
  }
  if (!isRSVP) for (let i = 0; i < left; i++) chips.append(el('span', { class: 'chip printonly', text: '________________' }));
  if (claims.length || (!isRSVP && left)) box.append(chips);
  if (!mine && left > 0 && !locked && !past) {
    box.append(el('div', { class: 'noprint', style: 'margin-top:8px' },
      el('button', { class: 'btn primary small', type: 'button', onclick: () => openClaim(s, isRSVP) },
        isRSVP ? 'I’m going' : 'I’ll cover this')));
  }
  return box;
}

let claimTarget = null;
function openClaim(slot, isRSVP) {
  claimTarget = slot;
  $('nameDlgTitle').textContent = isRSVP ? 'Count us in' : 'Cover this duty';
  const { name } = parseLabel(slot.label);
  const when = formatKey(slot.order);
  $('nameDlgSlot').textContent = (name || slot.label) + (when ? ' · ' + when : '');
  $('nameInput').value = myName();
  $('noteInput').value = '';
  showDlg($('nameDlg'));
  $('nameInput').focus();
}

function renderNotes(b, own, locked) {
  const notes = live.entries.filter(e => e.type !== 'announcement');
  const card = el('section', { class: 'card' }, el('h2', {}, 'Questions & notes'));
  const list = el('ul', { class: 'plain' });
  for (const e of notes) {
    const mineE = user && e.creatorUid === user.uid;
    // A note still awaiting approval is not part of the team's paper record.
    const li = el('li', { class: e.status === 'pending' ? 'noprint' : '' },
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, e.authorName), ': ' + e.body,
          e.status === 'pending' ? el('span', { class: 'badge pending', style: 'margin-left:6px', text: '(awaiting approval)' }) : null),
        el('div', { class: 'sub', text: entryStamp(e) })));
    if (own && e.status === 'pending') li.append(el('button', {
      class: 'btn small noprint', type: 'button',
      onclick: () => D.updateEntry(live.boardId, e.id, { status: 'ok' }).then(() => toast('Approved')).catch(err => toast(friendly(err))),
    }, '✓'));
    if (own || mineE) li.append(el('button', {
      class: 'btn small danger noprint', type: 'button', 'aria-label': 'Delete note',
      onclick: () => D.deleteEntry(live.boardId, e.id).catch(err => toast(friendly(err))),
    }, '✕'));
    list.append(li);
  }
  if (notes.length === 0) card.append(el('p', { class: 'hint', text: '“Which field is Saturday’s game at?” — questions for the organizer go here.' }));
  card.append(list);
  if (!locked) {
    const nameIn = el('input', { type: 'text', placeholder: 'Your name', maxlength: '60', value: myName(), 'aria-label': 'Your name' });
    const bodyIn = el('input', { type: 'text', placeholder: 'Ask or add something…', maxlength: '2000', 'aria-label': 'Your note',
      onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); } });
    const addBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
      onclick: async () => {
        const name = nameIn.value.trim(), body = bodyIn.value.trim();
        if (!name || !body) { toast('Add your name and the note'); return; }
        saveName(name);
        try {
          const status = await D.addEntry(live.boardId, b, { authorName: name, body, type: 'note' });
          bodyIn.value = '';
          toast(status === 'pending' ? 'Added — the organizer will approve it shortly' : 'Added');
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add');
    card.append(el('div', { class: 'row noprint', style: 'margin-top:10px' }, nameIn, bodyIn, addBtn));
  }
  return card;
}

/* ---------- owner manage panel ----------
   This panel used to be rebuilt closed, empty and unfocused on every snapshot.
   It now keeps `open`, every value, and the caret across a redraw. */
let addMode = 'single';
const WKD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let wkdaysPicked = new Set();

function capFrom(value) {
  const cap = parseInt(value, 10);
  return (isFinite(cap) && cap >= 1) ? Math.min(cap, 998) : RSVP_CAP;
}

function renderManage(b) {
  const url = shareUrl(live.code, baseUrl());
  const wrap = el('details', {
    class: 'manage noprint', ...(manageOpen ? { open: '' } : {}),
    ontoggle: (ev) => { manageOpen = ev.target.open; },
  }, el('summary', {}, 'Manage this team page'));
  const inner = el('div', { class: 'inner' });
  wrap.append(inner);

  inner.append(el('h2', {}, 'Add to the schedule'));
  // Toggle-button group, per the design system: no lying tablist role.
  const seg = el('div', { class: 'seg' },
    ...[['single', 'One event'], ['range', 'Repeating'], ['bulk', 'Paste a list']].map(([k, label]) =>
      el('button', {
        type: 'button', class: k === addMode ? 'active' : '', 'aria-pressed': String(k === addMode),
        'data-k': 'seg-' + k,
        onclick: () => { addMode = k; drawBoard(); },
      }, label)));
  inner.append(seg);

  if (addMode === 'single') {
    const lab = tracked('s-name', { type: 'text', placeholder: 'Game vs Hawks', maxlength: '70' });
    const date = tracked('s-date', { type: 'date' });
    const time = tracked('s-time', { type: 'time' });
    const where = tracked('s-where', { type: 'text', placeholder: 'Kestrel Park, Field 4', maxlength: '44' });
    const wear = tracked('s-wear', { type: 'text', placeholder: 'blue', maxlength: '24' });
    const need = tracked('s-need', { type: 'number', placeholder: 'spots', min: '1', max: '998' });
    inner.append(
      el('label', { class: 'f' }, el('span', {}, 'Event'), lab),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Date'), date),
        el('label', { class: 'f' }, el('span', {}, 'Start time'), time)),
      el('label', { class: 'f' }, el('span', {}, 'Where (tap-to-navigate on every phone)'), where),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Wear'), wear),
        el('label', { class: 'f' }, el('span', {}, 'Volunteers needed (blank = everyone RSVPs)'), need)),
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const name = lab.value.trim();
        if (!name) { toast('Give the event a name'); return; }
        const label = composeLabel({ name, where: where.value, wear: wear.value });
        const order = dateKey(date.value, time.value);
        try {
          await addSlotsChecked([{ label, capacity: capFrom(need.value), order }]);
          for (const k of ['s-name', 's-where', 's-need']) manageDraft[k] = '';
          lab.value = ''; where.value = ''; need.value = '';
          lab.focus();
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add event'),
      el('p', { class: 'hint', text: 'Dated events sort themselves and drive “Next up”, the calendar file and the week text. Undated ones (a season-long duty) sit at the end.' }));
  } else if (addMode === 'range') {
    const start = tracked('r-start', { type: 'date' });
    const end = tracked('r-end', { type: 'date' });
    const time = tracked('r-time', { type: 'time' });
    const name = tracked('r-name', { type: 'text', placeholder: 'Practice', maxlength: '70' });
    const where = tracked('r-where', { type: 'text', placeholder: 'Kestrel Park', maxlength: '44' });
    const need = tracked('r-need', { type: 'number', placeholder: 'blank = RSVP', min: '1', max: '998' });
    /* The seven weekday checkboxes used to be display:none, which takes them
       out of the tab order AND the accessibility tree — the app's biggest
       time-saver was pointer-only, and axe cannot see the defect. They are now
       clipped, not hidden, so they stay focusable and announce their state. */
    const days = el('div', { class: 'wkdays', role: 'group', 'aria-labelledby': 'wkdaysLabel' },
      ...WKD.map((d, i) => {
        const cb = el('input', {
          type: 'checkbox', value: String(i), 'data-k': 'wk-' + i,
          ...(wkdaysPicked.has(i) ? { checked: '' } : {}),
          onchange: (ev) => { if (ev.target.checked) wkdaysPicked.add(i); else wkdaysPicked.delete(i); genBtn.textContent = genLabel(); },
        });
        return el('label', {}, cb, el('span', { text: d }));
      }));
    const genLabel = () => {
      const rows = dateRangeSlots({
        start: draft('r-start'), end: draft('r-end'), weekdays: [...wkdaysPicked],
        time: draft('r-time'), name: draft('r-name') || 'Practice', where: draft('r-where'),
        capacity: capFrom(draft('r-need')),
      });
      return rows.length ? 'Add ' + rows.length + ' events' : 'Generate events';
    };
    for (const n of [start, end, time, name, where, need]) n.addEventListener('input', () => { genBtn.textContent = genLabel(); });
    const genBtn = el('button', { class: 'btn', type: 'button', onclick: async () => {
      const rows = dateRangeSlots({
        start: start.value, end: end.value, weekdays: [...wkdaysPicked],
        time: time.value, name: name.value || 'Practice', where: where.value,
        capacity: capFrom(need.value),
      });
      if (rows.length === 0) { toast('Pick a date range and at least one weekday'); return; }
      // No confirm: the button already says how many, and the add is undoable.
      try { await addSlotsChecked(rows); } catch (e) { toast(friendly(e), 4500); }
    } }, genLabel());
    inner.append(
      el('label', { class: 'f' }, el('span', {}, 'What repeats?'), name),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'From'), start),
        el('label', { class: 'f' }, el('span', {}, 'To'), end)),
      el('div', { class: 'f' }, el('span', { id: 'wkdaysLabel' }, 'On these days'), days),
      el('label', { class: 'f' }, el('span', {}, 'Where'), where),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Start time'), time),
        el('label', { class: 'f' }, el('span', {}, 'Volunteers needed (blank = RSVP)'), need)),
      genBtn);
  } else {
    const ta = tracked('b-text', { tag: 'textarea', 'aria-label': 'Paste your schedule, one event per line',
      placeholder: 'One per line. Dates and times are picked up automatically; add ×N when you need volunteers:\nSat 9/12 9:00am Game vs Hawks\n9/12 Snack duty x2\nSep 19 Scorekeeper x1\nTeam photo day' });
    inner.append(ta, el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        // parse per-line so an EXPLICIT "x1" stays a 1-person duty slot,
        // while unmarked lines become open RSVPs
        const now = new Date();
        const rows = ta.value.split(/\r?\n/).map(line => {
          const r = parseBulkSlots(line)[0];
          if (!r) return null;
          const explicit = /(?:[x×]\s*\d{1,3}|\(\d{1,3}\))\s*$/i.test(line.trim());
          const sniff = sniffDateTime(r.label, now);
          return {
            label: composeLabel({ name: sniff.rest || r.label }),
            capacity: explicit ? r.capacity : RSVP_CAP,
            order: dateKey(sniff.date, sniff.time),
          };
        }).filter(r => r && r.label).slice(0, 100);
        if (rows.length === 0) { toast('Paste one event per line first'); return; }
        try { await addSlotsChecked(rows); manageDraft['b-text'] = ''; ta.value = ''; }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Add all')));
    inner.append(el('p', { class: 'hint', text: '“Sat 9/12 9am Game vs Hawks” becomes a dated 9:00 AM event. Lines without ×N are open RSVPs; “x2” (or even “x1”) makes a duty slot needing that many people.' }));
  }

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Share, text and print'));
  inner.append(el('div', { class: 'row', style: 'flex-wrap:wrap' },
    el('button', { class: 'btn', type: 'button', onclick: () => copyText(url, 'Link copied') }, 'Copy link'),
    el('button', { class: 'btn', type: 'button', onclick: () => copyText(weekText(b), 'This week copied — paste it into the group chat') }, 'Copy this week'),
    el('button', { class: 'btn', type: 'button', onclick: () => copyText(nudgeMessage(b.title, live.slots.filter(s => s.capacity < RSVP_CAP), url), 'Open spots copied — paste it into the group chat') }, 'Copy open spots'),
    el('button', { class: 'btn', type: 'button', onclick: () => downloadIcs(b) }, 'Season .ics'),
    el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'),
    el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print schedule')));
  inner.append(el('p', { class: 'hint', text: 'Push notifications land about a third of the time across this whole category, so the text block is the nudge and the link is the truth. The printed sheet carries the code and a QR back to this page.' }));

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Settings'));
  const s = b.settings || {};
  inner.append(
    el('div', { class: 'f' }, el('span', { id: 'themeLabel' }, 'Team color')),
    el('div', { class: 'themedots', role: 'group', 'aria-labelledby': 'themeLabel' },
      ...Object.entries(THEMES).map(([key, t]) => {
        const on = (s.theme || 'clay') === key;
        return el('button', {
          type: 'button', 'aria-label': t.name, 'aria-pressed': String(on),
          class: 'themedot' + (on ? ' sel' : ''),
          style: '--dot:oklch(' + t.L + ' ' + t.C + ' ' + t.h + ')',
          onclick: () => D.setTheme(live.boardId, s, key)
            .then(() => toast(t.name + ' — the buttons and highlights follow it'))
            .catch(e => toast(friendly(e), 5000)),
        }, el('span', { class: 'tick', 'aria-hidden': 'true', text: on ? '✓' : '' }));
      })),
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' },
      el('input', { type: 'checkbox', style: 'width:auto', ...(s.approvalRequired ? { checked: '' } : {}),
        onchange: (ev) => D.setApproval(live.boardId, s, ev.target.checked)
          .then(() => toast(ev.target.checked ? 'New notes now need your approval' : 'Notes post instantly now'))
          .catch(e => toast(friendly(e))) }),
      el('span', { style: 'margin:0' }, 'Require my approval for new notes')),
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' },
      el('input', { type: 'checkbox', style: 'width:auto', ...(s.locked ? { checked: '' } : {}),
        onchange: (ev) => D.setLocked(live.boardId, s, ev.target.checked)
          .then(() => toast(ev.target.checked ? 'Locked — the page is read-only' : 'Unlocked'))
          .catch(e => toast(friendly(e))) }),
      el('span', { style: 'margin:0' }, 'Lock the page (read-only)')),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!confirm('Rotate the link? The old one stops working instantly.')) return;
        try { const code = await D.rotateCode(live.boardId, live.code);
          live.code = code; location.hash = '#/b/' + code; toast('New link ready — old one is dead'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Rotate link'),
      el('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!confirm('Delete “' + b.title + '” for everyone? This can’t be undone.')) return;
        try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; toast('Team page deleted'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Delete page')));

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Team name & details'));
  const ti = el('input', { type: 'text', value: b.title, maxlength: '100' });
  const de = el('input', { type: 'text', value: b.description || '', maxlength: '1000', placeholder: 'Season, field location, coach contact…' });
  inner.append(
    el('label', { class: 'f' }, el('span', {}, 'Team name'), ti),
    el('label', { class: 'f' }, el('span', {}, 'Details'), de),
    el('button', { class: 'btn', type: 'button', onclick: () => {
      const title = ti.value.trim();
      if (!title) { toast('The team needs a name'); return; }
      D.updateBoard(live.boardId, { title: title.slice(0, 100), description: de.value.slice(0, 1000) })
        .then(() => toast('Saved')).catch(e => toast(friendly(e)));
    } }, 'Save'));
  return wrap;
}

async function addSlotsChecked(rows) {
  if (live.slots.length + rows.length > 100) {
    toast('Pages max out at 100 events — archive last season or split by month.', 5000);
    return;
  }
  // Dated rows carry their date as the order key; undated ones queue after
  // every real date so the schedule still reads chronologically.
  const undatedMax = live.slots.reduce((m, s) => (isDated(s.order) ? m : Math.max(m, Number(s.order) || 0)), UNDATED_BASE);
  let n = 0;
  for (const r of rows) if (!isDated(r.order)) { n += 1; r.order = undatedMax + n; }
  const ids = await D.addSlots(live.boardId, rows);
  const msg = rows.length === 1 ? 'Added to the schedule' : rows.length + ' events added';
  undoToast(msg, async () => {
    try { await D.deleteSlots(live.boardId, ids); toast(rows.length === 1 ? 'Event removed again' : 'Those ' + rows.length + ' events were removed again'); }
    catch (e) { toast(friendly(e), 5000); }
  });
}

/* ---------- escape hatches ---------- */
function weekText(b) {
  const events = sortSlots(live.slots).map(s => {
    const claims = live.claims.get(s.id) || [];
    return {
      order: s.order, label: s.label,
      who: (s.capacity || 1) < RSVP_CAP ? claims.map(c => c.name) : [],
      needed: Math.max(0, Math.min(s.capacity || 1, 998) - (s.claimedCount || 0)),
    };
  });
  return weekMessage({ title: b.title, url: shareUrl(live.code, baseUrl()), events, now: new Date() });
}

function downloadIcs(b) {
  const dated = live.slots.filter(s => isDated(s.order));
  if (dated.length === 0) { toast('Nothing dated yet — add a date to an event and it lands in the calendar file'); return; }
  const text = seasonIcs({ title: b.title, slots: live.slots, url: shareUrl(live.code, baseUrl()) });
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = el('a', { href, download: (b.title || 'season').replace(/[^\w -]+/g, '').trim().slice(0, 40) + '.ics' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  toast(dated.length + ' events downloaded — open the file to add them to any calendar');
}

let slotEditing = null;
function openSlotDlg(s) {
  slotEditing = s;
  const { name, where, wear } = parseLabel(s.label);
  const { date, time } = keyToInputs(s.order);
  $('slotLabel').value = name || s.label;
  $('slotDate').value = date;
  $('slotTime').value = time;
  $('slotWhere').value = where;
  $('slotWear').value = wear;
  const isRSVP = (s.capacity || 1) >= RSVP_CAP;
  $('slotKind').value = isRSVP ? 'rsvp' : 'duty';
  $('slotCap').value = isRSVP ? '' : String(s.capacity);
  syncSlotKind();
  showDlg($('slotDlg'));
  $('slotLabel').focus();
}
/* RSVP_CAP is an implementation constant; it has no business appearing in the
   UI as "999". The organizer picks between two things they recognise. */
function syncSlotKind() {
  const duty = $('slotKind').value === 'duty';
  $('slotCapWrap').classList.toggle('hidden', !duty);
  if (duty && !$('slotCap').value) $('slotCap').value = '1';
}

function showQR() {
  const url = shareUrl(live.code, baseUrl());
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
  } catch (e) { /* canvas unavailable */ }
  showDlg($('qrDlg'));
}

/* ---------- wiring ---------- */
function wire() {
  $('authBtn').addEventListener('click', async () => {
    if (user && !D.isAnon(user)) {
      if (confirm('Sign out?')) { await D.signOutUser(); toast('Signed out'); }
    } else showDlg($('authDlg'));
  });
  $('googleBtn').addEventListener('click', async () => {
    try {
      const u = await D.signInGoogle();
      if (u === null) return;
      closeDlg($('authDlg')); toast('Signed in');
    } catch (e) {
      const code = (e && e.code) || '';
      toast(code.includes('unauthorized-domain')
        ? 'This site’s domain isn’t authorized in Firebase yet — add it under Authentication → Settings → Authorized domains.'
        : 'Google sign-in didn’t complete (' + (code || 'unknown') + ') — try again or use the email link.', 7000);
    }
  });
  $('emailBtn').addEventListener('click', async () => {
    const email = $('emailInput').value.trim();
    if (!email.includes('@')) { toast('Enter your email first'); return; }
    try { await D.startEmailLink(email, baseUrl()); $('emailSent').classList.remove('hidden'); }
    catch (e) {
      const code = (e && e.code) || '';
      toast(code.includes('unauthorized')
        ? 'This site’s domain isn’t authorized in Firebase yet — add it under Authentication → Settings → Authorized domains.'
        : 'Couldn’t send the link (' + (code || 'unknown') + ') — check the address and try again.', 7000);
    }
  });
  $('authCancel').addEventListener('click', () => closeDlg($('authDlg')));

  $('nameOk').addEventListener('click', async () => {
    const name = $('nameInput').value.trim();
    if (!name) { toast('Just a family name is fine'); return; }
    saveName(name);
    closeDlg($('nameDlg'));
    const what = parseLabel(claimTarget.label).name || claimTarget.label;
    /* Offline, batch.commit() never settles — Firestore writes to its local
       cache and waits for a connection. The claim IS safe, so say so instead
       of saying nothing: this user's whole reason for checking is an app that
       once lost his RSVP. */
    let settled = false;
    const queuedNotice = setTimeout(() => {
      if (settled) return;
      toast('Saved on this phone — “' + what + '” will sync the moment you have signal.', 6000);
    }, navigator.onLine ? 4000 : 700);
    try {
      const r = await D.claimSlot(live.boardId, claimTarget.id, name, $('noteInput').value);
      settled = true; clearTimeout(queuedNotice);
      toast(r === 'note-dropped'
        ? 'You’re in! (Your note couldn’t be attached — the organizer’s setup needs a refresh.)'
        : 'You’re in — ' + what, r === 'note-dropped' ? 6000 : 3000);
    } catch (e) { settled = true; clearTimeout(queuedNotice); toast(friendly(e), 4500); }
  });
  $('nameCancel').addEventListener('click', () => closeDlg($('nameDlg')));
  $('nameInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('nameOk').click(); });

  $('slotKind').addEventListener('change', syncSlotKind);
  $('slotSave').addEventListener('click', async () => {
    const name = $('slotLabel').value.trim();
    if (!name) { toast('The event needs a name'); return; }
    const duty = $('slotKind').value === 'duty';
    const cap = duty ? Math.min(Math.max(parseInt($('slotCap').value, 10) || 1, 1), 998) : RSVP_CAP;
    if (cap < (slotEditing.claimedCount || 0)) { toast('Can’t go below the ' + slotEditing.claimedCount + ' people already in'); return; }
    const label = composeLabel({ name, where: $('slotWhere').value, wear: $('slotWear').value });
    const order = dateKey($('slotDate').value, $('slotTime').value);
    const fields = { label, capacity: cap };
    // Rescheduling: the date IS the sort key, so the row moves to where it now
    // belongs instead of sitting at the bottom of the season forever.
    if (order) fields.order = order;
    else if (isDated(slotEditing.order)) fields.order = UNDATED_BASE + (Number(String(slotEditing.id).replace(/\D/g, '').slice(0, 6)) || 1);
    try { await D.updateSlot(live.boardId, slotEditing.id, fields); closeDlg($('slotDlg')); toast('Saved' + (order ? ' — moved into date order' : '')); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotDelete').addEventListener('click', async () => {
    const s = slotEditing;
    const n = s.claimedCount || 0;
    // With people already in it, deleting throws away their claims and no undo
    // of ours can put someone else's claim back — so that one still asks.
    if (n && !confirm('Delete this event and its ' + n + ' RSVP(s)? Their names cannot be restored.')) return;
    const snap = { label: s.label, capacity: s.capacity, order: s.order };
    try { await D.deleteSlot(live.boardId, s.id); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); return; }
    if (n) { toast('Event deleted'); return; }
    undoToast('Event deleted', async () => {
      try { await D.addSlots(live.boardId, [snap]); toast('Event restored'); }
      catch (e) { toast(friendly(e), 5000); }
    });
  });
  $('slotCancel').addEventListener('click', () => closeDlg($('slotDlg')));
  $('qrClose').addEventListener('click', () => closeDlg($('qrDlg')));

  $('createOk').addEventListener('click', async () => {
    const title = $('createTitle').value.trim();
    if (!title) { toast('Give the team a name'); return; }
    closeDlg($('createDlg'));
    try {
      const { code } = await D.createBoard({ title, description: $('createDesc').value.trim() });
      location.hash = '#/b/' + code;
      toast('Team page created — build the schedule, then share the link');
    } catch (e) { toast(friendly(e), 5000); }
  });
  $('createCancel').addEventListener('click', () => closeDlg($('createDlg')));
  $('createTitle').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('createOk').click(); });

  window.addEventListener('online', drawBoard);
  window.addEventListener('offline', drawBoard);

  /* Paper must not lose what the screen collapsed: open every <details> for
     the print, and put it back afterwards. */
  let reopened = [];
  window.addEventListener('beforeprint', () => {
    reopened = [...document.querySelectorAll('#view details:not([open])')];
    for (const d of reopened) d.setAttribute('open', '');
  });
  window.addEventListener('afterprint', () => {
    for (const d of reopened) d.removeAttribute('open');
    reopened = [];
  });
}

function render() {
  const r = route();
  if (r.view === 'board') renderBoard(r.code);
  else renderHome();
}

function refreshAuthBtn() {
  const btn = $('authBtn');
  if (user && !D.isAnon(user)) btn.textContent = 'Sign out';
  else btn.textContent = 'Sign in';
}

async function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  try {
    await D.completeEmailLink(async () => prompt('Confirm your email to finish signing in:'));
  } catch (e) { toast('That sign-in link didn’t work — request a fresh one.', 6000); }
  try { await D.completeRedirect(); }
  catch (e) { toast('Google sign-in didn’t complete (' + ((e && e.code) || '?') + ')', 6000); }
  D.onAuth((u) => { user = u; refreshAuthBtn(); render(); });
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !firebaseConfig.projectId.startsWith('demo-')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
