// Signup Sheets — Engine 1, skin A. UI layer.
// All user data reaches the DOM via textContent (the el() helper) — never innerHTML.
import {
  CODE_CHARS, normalizeCode, parseBulkSlotsReport, dateRangeSlotsReport,
  fillStats, nudgeMessage, shareUrl, stillNeededSentence, MAX_SLOTS,
} from './helpers.js';
import * as D from './data.js';
import { firebaseConfig } from './firebase-config.js';

D.initFirebase(firebaseConfig);

const CONFIG = {
  // Stripe payment link for the tip jar.
  tipUrl: 'https://buy.stripe.com/bJe6oIb5T1yTcPXdGp7EQ01',
};

/* ---------- tiny DOM kit (same discipline as bill-splitter) ---------- */
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
/* Status goes through the shared runtime: it holds the toast open while the
   pointer or the focus is inside it (so an Undo button cannot evaporate before
   it is reached) and it is the app's only live region now that <main> is not. */
function toast(msg, ms) {
  if (window.SWS && SWS.toast) return SWS.toast(msg, { ms: ms || 2400 });
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  return t;
}
/* Destructive actions are undone, not confirmed. A confirm() taxes the 99
   deliberate taps to catch the one mistake and catches nothing that a tired
   organizer waves through at 9:40pm; an undo taxes nothing and is strictly
   more forgiving. Snapshot first, mutate, then hand back the snapshot. */
function undoToast(msg, restore) {
  if (window.SWS && SWS.undo) return SWS.undo(msg, restore, { ms: 9000 });
  return toast(msg, 9000);
}
function saved(text) {
  if (window.SWS && SWS.saved) return SWS.saved({ text: text || 'Saved', announce: true });
  return toast(text || 'Saved');
}

/* Focus went to <body> after every dialog close, so taking two spots on a
   60-slot sheet meant tabbing from the top of the document twice. */
const dlgOpener = new WeakMap();
function showDlg(d) {
  const opener = document.activeElement;
  if (opener && opener !== document.body) {
    // The board redraws while a dialog is open, so remember WHAT the opener was
    // (a stable key) as well as which node it was — the node may be gone.
    dlgOpener.set(d, { node: opener, key: opener.getAttribute && opener.getAttribute('data-fk') });
  }
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
function closeDlg(d) {
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
  const rec = dlgOpener.get(d);
  dlgOpener.delete(d);
  if (!rec) return;
  let target = rec.key ? document.querySelector('[data-fk="' + CSS.escape(rec.key) + '"]') : null;
  if (!target && rec.node && document.contains(rec.node)) target = rec.node;
  if (target && typeof target.focus === 'function') { try { target.focus(); } catch (e) {} }
}
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
  if (String(code).includes('permission-denied')) return 'That didn’t go through — the spot may have just filled, or the sheet is locked.';
  if (String(code).includes('unavailable')) return 'You look offline — the change is queued and will sync when you reconnect.';
  return 'Something went wrong. Try again?';
}

/* ---------- state ---------- */
let user = null;
const NAME_KEY = 'ss-myname';
const myName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
const saveName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} };

const live = {           // active board subscriptions
  boardId: null, code: null,
  board: null, slots: [], entries: [],
  claims: new Map(),     // slotId -> [{uid,name}]
  unsubs: [], claimUnsubs: new Map(),
  stop() {
    this.unsubs.forEach(u => u && u());
    this.claimUnsubs.forEach(u => u && u());
    this.unsubs = []; this.claimUnsubs = new Map();
    this.boardId = null; this.code = null; this.board = null; this.boardMissing = false;
    this.slots = []; this.entries = []; this.claims = new Map();
  },
};
// Owner console state that must survive a redraw — it used to be thrown away
// on every Firestore snapshot, i.e. whenever anyone anywhere claimed anything.
const ui = { manageOpen: false, addMode: 'single', openOnly: false };

/* ---------- router ---------- */
function route() {
  const h = location.hash;
  const m = h.match(/^#\/b\/([A-HJ-NP-Z2-9]{6})/);
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
    ? 'Made with <a href="./" style="color:inherit">Signup Sheets</a> — free, no ads. <a href="./" style="color:inherit">Start yours</a>'
    : o.dataset.home;
}

async function renderHome() {
  setGrowthFooter(false);
  live.stop();
  applyTheme(null);
  const v = $('view');
  v.replaceChildren();

  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'Signup sheets that take 15 seconds'),
    el('p', {}, 'Potlucks, volunteer shifts, meal trains, snack duty. Share a link — people tap a spot, type their name, done. ',
      el('strong', {}, 'No accounts for participants. No ads. Free.')),
    el('button', { class: 'btn primary', type: 'button', onclick: startCreate }, 'Create a sheet'),
  ));

  const codeInput = el('input', {
    type: 'text', placeholder: 'ABC123', maxlength: '8', autocomplete: 'off',
    style: 'text-transform:uppercase; letter-spacing:.15em; text-align:center',
    'aria-label': 'Sheet code',
    onkeydown: (ev) => { if (ev.key === 'Enter') openBtn.click(); },
  });
  const openBtn = el('button', {
    class: 'btn', type: 'button', style: 'flex:0 0 auto',
    onclick: () => {
      const c = normalizeCode(codeInput.value);
      if (!c) { toast('Codes are 6 letters/numbers — check the link you were sent'); return; }
      location.hash = '#/b/' + c;
    },
  }, 'Open');
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Got a code?'),
    el('div', { class: 'row' }, codeInput, openBtn),
    el('p', { class: 'hint', text: 'If someone shared a link with you, just tap it — this box is for codes read out loud.' })));

  if (user && !D.isAnon(user)) {
    const sec = el('section', { class: 'card' }, el('h2', {}, 'Your sheets'));
    const list = el('ul', { class: 'plain' });
    sec.append(list, el('p', { class: 'hint', text: 'Loading…' }));
    v.append(sec);
    try {
      const boards = await D.myBoards(user.uid);
      sec.lastChild.remove();
      if (boards.length === 0) sec.append(el('p', { class: 'hint', text: 'No sheets yet — create your first one above.' }));
      for (const b of boards) {
        list.append(el('li', {},
          el('div', { class: 'grow' },
            el('div', { text: b.title }),
            el('div', { class: 'sub', text: 'Code ' + b.shareCode + (b.settings?.locked ? ' · locked' : '') })),
          el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/b/' + b.shareCode; } }, 'Open')));
      }
    } catch (e) {
      sec.lastChild.textContent = 'Couldn’t load your sheets: ' + friendly(e);
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
    v.replaceChildren(el('p', { class: 'hint', text: 'Opening sheet…' }));
    try { await D.ensureSignedIn(); }
    catch (e) { v.replaceChildren(el('p', { class: 'warn', text: 'Couldn’t connect. Check your internet and reload.' })); return; }
    const boardId = await D.resolveCode(code).catch(() => null);
    if (!boardId) {
      v.replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'warn', text: 'That sheet doesn’t exist — the code may have been rotated by the organizer.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    live.boardId = boardId; live.code = code;
    live.unsubs.push(D.watchBoard(boardId, (b) => {
      live.board = b;
      live.boardMissing = (b === null);
      drawBoard();
    }, (e) => toast(friendly(e), 5000)));
    live.unsubs.push(D.watchSlots(boardId, (slots) => { live.slots = slots; syncClaimWatchers(); drawBoard(); },
      (e) => toast(friendly(e), 5000)));
    // entries watcher needs uid + owner flag; (re)attached in drawBoard when board known
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

/* ---------- redraw: coalesced, and it does not eat what you are typing ----------
   Every slot opens its own Firestore listener and every listener called
   drawBoard(), which called replaceChildren() on <main>. Measured on a 60-slot
   sheet: 73 full rebuilds in six seconds, 102 during one bulk add. That
   collapsed the owner's Manage panel on every keystroke-adjacent action, wiped
   any half-typed note, and threw focus to <body>. Three defences:
     1. coalesce — at most one rebuild per DRAW_MS, trailing edge;
     2. remember — every field that can hold typed text carries data-keep, and
        its value, selection and focus survive the rebuild;
     3. remember open state — details.manage and the add-mode segment too. */
const DRAW_MS = 60;
let drawTimer = null, drawLast = 0;
function drawBoard() {
  if (drawTimer) return;
  const wait = Math.max(0, DRAW_MS - (Date.now() - drawLast));
  drawTimer = setTimeout(() => { drawTimer = null; drawLast = Date.now(); drawBoardNow(); }, wait);
}

function snapshotUI(root) {
  const vals = new Map();
  for (const f of root.querySelectorAll('[data-keep]')) {
    vals.set(f.getAttribute('data-keep'), f.type === 'checkbox' ? f.checked : f.value);
  }
  const a = document.activeElement;
  const inside = a && root.contains(a);
  return {
    vals,
    focusKey: inside ? (a.getAttribute('data-keep') || a.getAttribute('data-fk')) : null,
    selStart: inside && 'selectionStart' in a ? a.selectionStart : null,
    selEnd: inside && 'selectionEnd' in a ? a.selectionEnd : null,
    scrollY: window.scrollY,
  };
}

function restoreUI(root, snap) {
  for (const f of root.querySelectorAll('[data-keep]')) {
    const k = f.getAttribute('data-keep');
    if (!snap.vals.has(k)) continue;
    const v = snap.vals.get(k);
    if (f.type === 'checkbox') f.checked = v; else f.value = v;
  }
  if (!snap.focusKey) return;
  const sel = '[data-keep="' + CSS.escape(snap.focusKey) + '"],[data-fk="' + CSS.escape(snap.focusKey) + '"]';
  const target = root.querySelector(sel);
  if (!target) return;
  try {
    target.focus({ preventScroll: true });
    if (snap.selStart !== null && 'setSelectionRange' in target) {
      target.setSelectionRange(snap.selStart, snap.selEnd);
    }
    if (window.scrollY !== snap.scrollY) window.scrollTo({ top: snap.scrollY });
  } catch (e) {}
}

function drawBoardNow() {
  if (route().view !== 'board') return;
  // A deleted sheet used to keep rendering forever: watchBoard passes null,
  // drawBoard early-returned, and the participant sat looking at a live-looking
  // board whose Claim button answered "the spot may have just filled".
  if (live.boardMissing) return renderGone();
  if (!live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  setGrowthFooter(!own);
  const locked = !!b.settings?.locked;
  const v = $('view');
  const snap = snapshotUI(v);
  v.replaceChildren();

  // --- title block ---
  const head = el('section', { class: 'card' });
  head.append(el('div', { class: 'titlerow' },
    el('h2', { class: 'boardtitle', text: b.title }),
    // .printhide: an owner badge is chrome, and it read as content in ink.
    own ? el('span', { class: 'badge printhide', text: 'you run this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub subtight', text: b.description }));
  const stats = fillStats(live.slots);
  if (stats.total > 0) {
    head.append(
      el('div', { class: 'fillbar' }, el('div', { style: 'width:' + Math.round(100 * stats.taken / stats.total) + '%' })),
      el('div', { class: 'sub', text: stats.taken + ' of ' + stats.total + ' spots filled' }));
    // The one question a participant opened the link to answer, answered above
    // the fold instead of seven screenfuls down.
    const need = stillNeededSentence(live.slots);
    if (need) head.append(el('p', { class: 'stillneeded', text: need }));
    else head.append(el('p', { class: 'stillneeded', text: 'Every spot is taken — thank you.' }));
  }
  v.append(head);
  v.append(trustBadge(true));

  // Owners get sharing front and center — it's the whole point of the product.
  if (own) {
    const url = shareUrl(live.code, baseUrl());
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Share this sheet'),
      el('div', { class: 'sharecode', text: live.code }),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => copyText(url, 'Link copied — send it anywhere') }, 'Copy link'),
        el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code')),
      el('p', { class: 'hint', text: 'Send the link any way you like. The big code is for telling someone out loud — they type it on the app’s front page.' })));
  }

  if (locked) v.append(el('div', { class: 'banner', text: own
    ? 'This sheet is locked — participants can look but not sign up. Unlock it in Manage.'
    : 'This sheet is locked by the organizer — read-only for now.' }));
  if (!navigator.onLine) v.append(el('div', { class: 'banner', text: 'You’re offline — you can read the sheet; claims will sync when you’re back.' }));

  // --- slots ---
  const slotsCard = el('section', { class: 'card' }, el('h2', {}, 'Spots'));
  if (live.slots.length === 0) {
    slotsCard.append(el('div', { class: 'empty' },
      el('div', { class: 'glyph', 'aria-hidden': 'true' }, '🗒'),
      el('p', {}, own
        ? 'No spots yet — open Manage below to add them. You can paste a whole list at once.'
        : 'The organizer hasn’t added spots yet.')));
  }
  const openSlots = live.slots.filter(s => (s.claimedCount || 0) < (s.capacity || 1));
  const hidden = live.slots.length - openSlots.length;
  // A 60-slot sheet was 6,980px of identical rows with no way to skip the taken
  // ones. One checkbox answers "what's left" without scrolling.
  if (live.slots.length > 4 && hidden > 0) {
    const box = el('input', {
      type: 'checkbox', 'data-keep': 'openonly', id: 'openOnly',
      ...(ui.openOnly ? { checked: '' } : {}),
      onchange: (ev) => { ui.openOnly = ev.target.checked; drawBoardNow(); },
    });
    slotsCard.append(el('div', { class: 'filterrow noprint' },
      el('label', {}, box, el('span', {}, 'Show only the ' + openSlots.length + ' open ' + (openSlots.length === 1 ? 'spot' : 'spots')))));
  }
  const filtering = ui.openOnly && hidden > 0;
  for (const s of live.slots) {
    const row = renderSlot(s, own, locked);
    // Filtered out on screen only — the printed sheet is always the whole sheet.
    if (filtering && (s.claimedCount || 0) >= (s.capacity || 1)) row.classList.add('filtered');
    slotsCard.append(row);
  }
  if (filtering) {
    slotsCard.append(el('p', { class: 'hint noprint', text: hidden + ' filled ' + (hidden === 1 ? 'spot is' : 'spots are') + ' hidden.' }));
  }
  v.append(slotsCard);

  // --- entries ---
  v.append(renderEntries(b, own, locked));

  // --- manage ---
  if (own) v.append(renderManage(b));

  // --- share (participants see a lighter version) ---
  if (!own) {
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Share'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', onclick: () => copyText(shareUrl(live.code, baseUrl()), 'Link copied') }, 'Copy link'),
        el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'))));
  }

  // --- the way back from paper ---
  v.append(printFooter());

  restoreUI(v, snap);
}

/* The printed sheet was a dead end: no date, no code, no URL, no QR, so nobody
   reading it on the church noticeboard could reach the live sheet. */
function printFooter() {
  const url = shareUrl(live.code, baseUrl());
  const foot = el('div', { class: 'printonly printfoot' });
  const row = el('div', { class: 'pf-row' });
  const canvas = el('canvas', { width: '150', height: '150', role: 'img', 'aria-label': 'QR code for this sheet' });
  if (drawQR(canvas, url, 150)) row.append(canvas);
  row.append(el('div', {},
    el('div', { class: 'pf-code', text: live.code }),
    el('div', {}, 'Sign up online, or write your name on a blank line above.'),
    el('div', { class: 'pf-url', text: url })));
  foot.append(row);
  foot.append(el('div', { class: 'pf-url', text: 'Printed ' + new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' — spots may have been taken since.' }));
  return foot;
}

/* The privacy promise as a visible object, not grey footer prose. Every word of
   it has to be literally true: this app DOES have a server. */
function trustBadge(onBoard) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  const p = el('p', { class: 'trust noprint' }, svg);
  if (onBoard) {
    p.append(el('b', {}, 'No account, no email, no ads.'),
      ' The name and note you type are saved to this sheet so everyone with the link can see them — that is the whole point. Nothing else is taken: no email address, no phone number, no contacts, no trackers, and nothing is ever sold or advertised against.');
  } else {
    p.append(el('b', {}, 'No ads, ever. No email addresses collected.'),
      ' Only organizers sign in, and only to find their own sheets again. People claiming a spot type a first name and nothing else — no account, no verification, no reminder emails. There are no trackers and no third-party scripts on any sheet.');
  }
  return p;
}

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

function renderSlot(s, own, locked) {
  const claims = live.claims.get(s.id) || [];
  const mine = user && claims.find(c => c.uid === user.uid);
  const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
  const box = el('div', { class: 'slot' });
  const top = el('div', { class: 'top' },
    el('span', { class: 'label', text: s.label }),
    el('span', { class: 'count' + (left === 0 ? ' full' : ''), text: left === 0 ? 'Full' : (s.claimedCount || 0) + ' of ' + s.capacity }));
  if (own) top.append(el('button', { class: 'btn small noprint', type: 'button', 'data-fk': 'edit:' + s.id, 'aria-label': 'Edit spot: ' + s.label, onclick: () => openSlotDlg(s) }, '✎'));
  box.append(top);
  const chips = el('div', { class: 'chips' });
  for (const c of claims) {
    const isMine = user && c.uid === user.uid;
    const chip = el('span', { class: 'chip' + (isMine ? ' mine' : '') },
      c.name + (isMine ? ' (you)' : '') + (c.note ? ' · ' + c.note : ''));
    // Table stakes the research names: change your own entry from the same
    // link, days later, with no login. renameClaim() was written and tested at
    // the data layer and nothing called it.
    if (isMine && !locked) chip.append(el('button', {
      type: 'button', class: 'release noprint', 'data-fk': 'editclaim:' + s.id,
      'aria-label': 'Change your name on ' + s.label,
      onclick: () => openEditClaim(s, c),
    }, 'Edit'));
    if ((isMine && !locked) || own) chip.append(el('button', {
      type: 'button', class: 'release noprint',
      // All eight remove buttons used to read "Remove Greedy Greg from this
      // spot" with no way to tell which spot.
      'aria-label': (isMine ? 'Give back your spot: ' : 'Remove ' + c.name + ' from ') + s.label,
      onclick: async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        const snapshot = { name: c.name, note: c.note || '' };
        try {
          if (isMine) await D.releaseClaim(live.boardId, s.id);
          else await D.ownerRemoveClaim(live.boardId, s.id, c.uid);
          if (isMine) {
            undoToast('You gave back “' + s.label + '”', async () => {
              try { await D.claimSlot(live.boardId, s.id, snapshot.name, snapshot.note); toast('Back in — ' + s.label); }
              catch (e2) { toast('Couldn’t take it back — someone else has it now.', 5000); }
            });
          } else {
            toast('Removed ' + c.name + ' from ' + s.label);
          }
        } catch (e) { btn.disabled = false; toast(friendly(e), 4500); }
      },
    }, isMine ? 'Give it back' : 'Remove'));
    chips.append(chip);
  }
  // print-only blanks for open seats
  for (let i = 0; i < left; i++) chips.append(el('span', { class: 'chip printonly', text: '________________' }));
  if (claims.length || left) box.append(chips);
  if (!mine && left > 0 && !locked) {
    // .btn.primary, not .btn.primary.small: .small pins 36px at every comfort
    // setting, and this is the one button 95% of sessions exist to press.
    box.append(el('div', { class: 'noprint claimrow' },
      el('button', { class: 'btn primary', type: 'button', 'data-fk': 'claim:' + s.id, onclick: () => openClaim(s) }, 'Claim this spot')));
  }
  return box;
}

let claimTarget = null;
function clearClaimError() {
  $('claimErr').classList.add('hidden');
  $('claimErr').textContent = '';
  $('claimAltRow').classList.add('hidden');
  $('claimAlt').textContent = '';
}
function openClaim(slot) {
  claimTarget = slot;
  $('nameDlgSlot').textContent = slot.label;
  $('nameInput').value = myName();
  $('noteInput').value = '';
  clearClaimError();
  showDlg($('nameDlg'));
  $('nameInput').focus();
}

/* Retarget the open dialog at another spot without losing a character of what
   was typed — this is the one-tap recovery from a lost race. */
function retargetClaim(slot) {
  claimTarget = slot;
  $('nameDlgSlot').textContent = slot.label;
  clearClaimError();
  $('nameOk').focus();
}

function nearestOpenSlot(fromId) {
  const i = live.slots.findIndex(s => s.id === fromId);
  const open = (s) => (s.claimedCount || 0) < (s.capacity || 1) && !(live.claims.get(s.id) || []).some(c => user && c.uid === user.uid);
  for (let d = 1; d < live.slots.length; d++) {
    const a = live.slots[i + d], b = live.slots[i - d];
    if (a && open(a)) return a;
    if (b && open(b)) return b;
  }
  return null;
}

let editClaimTarget = null;
function openEditClaim(slot, claim) {
  editClaimTarget = slot;
  $('editClaimSlot').textContent = slot.label;
  $('editClaimName').value = claim.name || '';
  showDlg($('editClaimDlg'));
  $('editClaimName').focus();
}

function renderEntries(b, own, locked) {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Extras & notes'));
  const list = el('ul', { class: 'plain' });
  for (const e of live.entries) {
    const mineE = user && e.creatorUid === user.uid;
    // The badge used to be glued to the sentence with a CSS margin, so a screen
    // reader heard "...and cupsawaiting approval". It gets its own line.
    const li = el('li', {},
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, e.authorName), ': ' + e.body),
        e.status === 'pending' ? el('div', { class: 'subtight' }, el('span', { class: 'badge pending', text: 'awaiting approval' })) : null));
    if (own && e.status === 'pending') li.append(el('button', {
      class: 'btn small noprint', type: 'button', 'aria-label': 'Approve the note from ' + e.authorName,
      onclick: () => D.updateEntry(live.boardId, e.id, { status: 'ok' }).then(() => toast('Approved')).catch(err => toast(friendly(err))),
    }, '✓'));
    if (own || mineE) li.append(el('button', {
      class: 'btn small danger noprint', type: 'button', 'aria-label': 'Delete the note from ' + e.authorName,
      onclick: async () => {
        const gone = { authorName: e.authorName, body: e.body };
        try {
          await D.deleteEntry(live.boardId, e.id);
          undoToast('Note deleted', async () => {
            try { await D.addEntry(live.boardId, b, gone); toast('Note restored'); }
            catch (err) { toast(friendly(err), 4500); }
          });
        } catch (err) { toast(friendly(err), 4500); }
      },
    }, '✕'));
    list.append(li);
  }
  // The lemonade line is a placeholder, and it printed in ink on a bereavement
  // meal train as if it were content. Screen only, and quieter.
  if (live.entries.length === 0) {
    card.append(el('div', { class: 'empty printhide' },
      el('p', {}, 'Anything that isn’t a listed spot goes here — what you’re bringing, when you’ll arrive, a dietary note.')));
  }
  card.append(list);
  if (!locked) {
    const nameIn = el('input', { type: 'text', placeholder: 'Your name', maxlength: '60', value: myName(), 'aria-label': 'Your name', 'data-keep': 'entryname' });
    const bodyIn = el('input', { type: 'text', placeholder: 'I’ll bring…', maxlength: '2000', 'aria-label': 'Your note', 'data-keep': 'entrybody',
      onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); } });
    const addBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
      onclick: async () => {
        const name = nameIn.value.trim(), body = bodyIn.value.trim();
        if (!name || !body) { toast('Add your name and the note'); return; }
        saveName(name);
        addBtn.disabled = true;
        try {
          const status = await D.addEntry(live.boardId, b, { authorName: name, body });
          bodyIn.value = '';
          toast(status === 'pending' ? 'Added — the organizer will approve it shortly' : 'Added');
        } catch (e) { toast(friendly(e), 4500); }
        finally { addBtn.disabled = false; }
      } }, 'Add');
    card.append(el('div', { class: 'row noprint', style: 'margin-top:10px' }, nameIn, bodyIn, addBtn));
  }
  return card;
}

/* ---------- owner manage panel ---------- */
function renderManage(b) {
  const url = shareUrl(live.code, baseUrl());
  // The open state lives in `ui`, not in the element — the element is thrown
  // away and rebuilt every time anyone, anywhere, claims a spot.
  const wrap = el('details', {
    class: 'manage noprint',
    ...(ui.manageOpen ? { open: '' } : {}),
    ontoggle: (ev) => { ui.manageOpen = ev.target.open; },
  }, el('summary', {}, 'Manage this sheet'));
  const inner = el('div', { class: 'inner' });
  wrap.append(inner);

  // share
  inner.append(el('h2', {}, 'Share'),
    el('p', { class: 'sub', style: 'overflow-wrap:anywhere;margin:0 0 8px', text: url }),
    el('div', { class: 'row', style: 'flex-wrap:wrap' },
      el('button', { class: 'btn', type: 'button', onclick: () => copyText(url, 'Link copied — paste it anywhere') }, 'Copy link'),
      el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'),
      el('button', { class: 'btn', type: 'button', onclick: () => copyText(nudgeMessage(b.title, live.slots, url), 'Nudge copied — paste into the group chat') }, 'Copy nudge'),
      el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print')));

  // add slots
  inner.append(el('h2', { style: 'margin-top:16px' }, 'Add spots'));
  const seg = el('div', { class: 'seg' },
    ...[['single', 'One at a time'], ['bulk', 'Paste a list'], ['range', 'Repeating dates']].map(([k, label]) =>
      el('button', { type: 'button', class: k === ui.addMode ? 'active' : '', 'aria-pressed': k === ui.addMode ? 'true' : 'false',
        'data-fk': 'mode:' + k, onclick: () => { ui.addMode = k; drawBoardNow(); } }, label)));
  inner.append(seg);

  if (ui.addMode === 'single') {
    const lab = el('input', { type: 'text', placeholder: 'Main dish', maxlength: '120', 'aria-label': 'What the spot is for', 'data-keep': 'single-label' });
    const cap = el('input', { type: 'number', value: '1', min: '1', max: '999', 'aria-label': 'How many needed', style: 'flex:0 0 84px', 'data-keep': 'single-cap' });
    inner.append(el('div', { class: 'row' }, lab, cap,
      el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', onclick: async () => {
        const label = lab.value.trim();
        if (!label) { toast('Give the spot a label'); return; }
        try {
          // Only clear the field if the spot was actually accepted — a rejected
          // label used to be deleted out from under the person who typed it.
          await addSlotsChecked([{ label, capacity: parseInt(cap.value, 10) || 1 }], null,
            (added) => { if (added > 0) lab.value = ''; });
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add')));
  } else if (ui.addMode === 'bulk') {
    const ta = el('textarea', { 'data-keep': 'bulk', 'aria-label': 'Paste your list of spots',
      placeholder: 'One spot per line — add ×N for multiples:\nMain dish x3\nSide or salad x4\nDessert x2\nDrinks & ice' });
    inner.append(ta, el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const rep = parseBulkSlotsReport(ta.value);
        if (rep.rows.length === 0) { toast('Paste one spot per line first'); return; }
        try {
          await addSlotsChecked(rep.rows, (added) => {
            const missed = rep.dropped + (rep.rows.length - added);
            const notes = [];
            if (missed > 0) notes.push(missed + ' more ' + (missed === 1 ? 'line is' : 'lines are') +
              ' still in the box — a sheet holds ' + MAX_SLOTS + ' spots, so they were not imported.');
            if (rep.skipped.length) notes.push(rep.skipped.length + ' ' + (rep.skipped.length === 1 ? 'line' : 'lines') + ' had no label and ' + (rep.skipped.length === 1 ? 'was' : 'were') + ' skipped.');
            return notes.join(' ');
          }, (added) => {
            // Whatever was NOT imported stays in the box, verbatim, so it can be
            // pasted into a second sheet. The old code cleared it regardless.
            ta.value = [
              rep.rows.slice(added).map(x => x.capacity > 1 ? x.label + ' x' + x.capacity : x.label).join('\n'),
              rep.remainder,
            ].filter(Boolean).join('\n');
          });
        } catch (e) { toast(friendly(e), 6000); }
      } }, 'Add all')));
  } else {
    const start = el('input', { type: 'date', 'data-keep': 'r-start' });
    const end = el('input', { type: 'date', 'data-keep': 'r-end' });
    const time = el('input', { type: 'text', placeholder: '3–5pm (optional)', maxlength: '40', 'data-keep': 'r-time' });
    const prefix = el('input', { type: 'text', placeholder: 'Label, e.g. “Concession stand” (optional)', maxlength: '60', 'data-keep': 'r-prefix' });
    const cap = el('input', { type: 'number', value: '1', min: '1', max: '999', 'aria-label': 'People needed per date', 'data-keep': 'r-cap' });
    // A <fieldset> with a real <legend>, not a <label> wrapping seven controls.
    const days = el('div', { class: 'wkdays' },
      ...['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) =>
        el('label', {}, el('input', { type: 'checkbox', value: String(i), 'aria-label': d, 'data-keep': 'wk' + i }), d.slice(0, 3))));
    inner.append(
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'From'), start),
        el('label', { class: 'f' }, el('span', {}, 'To'), end)),
      el('fieldset', { class: 'wkdayset' }, el('legend', {}, 'On these days'), days),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Time (optional)'), time),
        el('label', { class: 'f' }, el('span', {}, 'People per date'), cap)),
      el('label', { class: 'f' }, el('span', {}, 'Label (optional)'), prefix),
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const weekdays = [...days.querySelectorAll('input:checked')].map(c => parseInt(c.value, 10));
        const rep = dateRangeSlotsReport({
          start: start.value, end: end.value, weekdays,
          timeText: time.value, prefix: prefix.value, capacity: parseInt(cap.value, 10) || 1,
        });
        if (rep.rows.length === 0) { toast('Pick a date range and at least one weekday'); return; }
        // No confirm(): add them and offer the way back.
        try {
          await addSlotsChecked(rep.rows, (added) => {
            const missed = rep.dropped + (rep.rows.length - added);
            return missed ? missed + ' later ' + (missed === 1 ? 'date' : 'dates') + ' did not fit — a sheet holds ' + MAX_SLOTS + ' spots.' : '';
          });
        } catch (e) { toast(friendly(e), 6000); }
      } }, 'Generate spots'));
  }

  // settings
  inner.append(el('h2', { style: 'margin-top:16px' }, 'Settings'));
  const s = b.settings || {};
  inner.append(
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' },
      el('input', { type: 'checkbox', style: 'width:auto', ...(s.approvalRequired ? { checked: '' } : {}),
        onchange: (ev) => D.setApproval(live.boardId, s, ev.target.checked)
          .then(() => toast(ev.target.checked ? 'New notes now need your approval' : 'Notes post instantly now'))
          .catch(e => toast(friendly(e))) }),
      el('span', { style: 'margin:0' }, 'Require my approval for new notes')),
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' },
      el('input', { type: 'checkbox', style: 'width:auto', ...(s.locked ? { checked: '' } : {}),
        onchange: (ev) => D.setLocked(live.boardId, s, ev.target.checked)
          .then(() => toast(ev.target.checked ? 'Locked — the sheet is read-only' : 'Unlocked'))
          .catch(e => toast(friendly(e))) }),
      el('span', { style: 'margin:0' }, 'Lock the sheet (read-only)')),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!confirm('Rotate the code? The old link stops working instantly — you’ll share a new one.')) return;
        try { const code = await D.rotateCode(live.boardId, live.code);
          live.code = code; location.hash = '#/b/' + code; toast('New link ready — old one is dead'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Rotate link'),
      el('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!confirm('Delete “' + b.title + '” for everyone? This can’t be undone.')) return;
        try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; toast('Sheet deleted'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Delete sheet')));

  // board title/description edit
  inner.append(el('h2', { style: 'margin-top:16px' }, 'Title & details'));
  const ti = el('input', { type: 'text', value: b.title, maxlength: '100' });
  const de = el('input', { type: 'text', value: b.description || '', maxlength: '1000', placeholder: 'When/where, drop-off details… (optional)' });
  inner.append(
    el('label', { class: 'f' }, el('span', {}, 'Title'), ti),
    el('label', { class: 'f' }, el('span', {}, 'Details'), de),
    el('button', { class: 'btn', type: 'button', onclick: () => {
      const title = ti.value.trim();
      if (!title) { toast('The sheet needs a title'); return; }
      D.updateBoard(live.boardId, { title: title.slice(0, 100), description: de.value.slice(0, 1000) })
        .then(() => toast('Saved')).catch(e => toast(friendly(e)));
    } }, 'Save'));
  return wrap;
}

async function addSlotsChecked(rows) {
  if (live.slots.length + rows.length > 100) {
    toast('Sheets max out at 100 spots — split into a second sheet if you need more.', 5000);
    return;
  }
  let order = live.slots.reduce((m, s) => Math.max(m, s.order || 0), 0);
  rows.forEach((r, i) => { r.order = order + i + 1; });
  await D.addSlots(live.boardId, rows);
  toast(rows.length === 1 ? 'Spot added' : rows.length + ' spots added');
}

/* ---------- slot edit dialog ---------- */
let slotEditing = null;
function openSlotDlg(s) {
  slotEditing = s;
  $('slotLabel').value = s.label;
  $('slotCap').value = String(s.capacity);
  showDlg($('slotDlg'));
}

/* ---------- QR ---------- */
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
  } catch (e) { /* canvas unavailable — dialog still shows the hint text */ }
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
      if (u === null) return; // redirect flow — page is navigating away
      closeDlg($('authDlg')); toast('Signed in');
    }
    catch (e) {
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
    if (!name) { toast('Just your first name is fine'); return; }
    saveName(name);
    closeDlg($('nameDlg'));
    try {
      const r = await D.claimSlot(live.boardId, claimTarget.id, name, $('noteInput').value);
      toast(r === 'note-dropped'
        ? 'You’re in! (Your note couldn’t be attached — the organizer’s setup needs a refresh.)'
        : 'You’re in — ' + claimTarget.label, r === 'note-dropped' ? 6000 : 2400);
    } catch (e) { toast(friendly(e), 4500); }
  });
  $('nameCancel').addEventListener('click', () => closeDlg($('nameDlg')));
  $('nameInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('nameOk').click(); });

  $('slotSave').addEventListener('click', async () => {
    const label = $('slotLabel').value.trim();
    const cap = Math.min(Math.max(parseInt($('slotCap').value, 10) || 1, 1), 999);
    if (!label) { toast('The spot needs a label'); return; }
    if (cap < (slotEditing.claimedCount || 0)) { toast('Capacity can’t go below the ' + slotEditing.claimedCount + ' people already signed up'); return; }
    try { await D.updateSlot(live.boardId, slotEditing.id, { label: label.slice(0, 120), capacity: cap }); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotDelete').addEventListener('click', async () => {
    const n = slotEditing.claimedCount || 0;
    if (!confirm(n ? 'Delete this spot and its ' + n + ' signup(s)?' : 'Delete this spot?')) return;
    try { await D.deleteSlot(live.boardId, slotEditing.id); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotCancel').addEventListener('click', () => closeDlg($('slotDlg')));
  $('qrClose').addEventListener('click', () => closeDlg($('qrDlg')));

  $('createOk').addEventListener('click', async () => {
    const title = $('createTitle').value.trim();
    if (!title) { toast('Give it a name — you can change it later'); return; }
    closeDlg($('createDlg'));
    try {
      const { code } = await D.createBoard({ title, description: $('createDesc').value.trim() });
      location.hash = '#/b/' + code;
      toast('Sheet created — add spots, then share the link');
    } catch (e) { toast(friendly(e), 5000); }
  });
  $('createCancel').addEventListener('click', () => closeDlg($('createDlg')));
  $('createTitle').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('createOk').click(); });

  window.addEventListener('online', drawBoard);
  window.addEventListener('offline', drawBoard);
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
