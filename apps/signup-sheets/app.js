// Signup Sheets — Engine 1, skin A. UI layer.
// All user data reaches the DOM via textContent (the el() helper) — never innerHTML.
import {
  CODE_CHARS, normalizeCode, parseBulkSlots, dateRangeSlots,
  fillStats, nudgeMessage, shareUrl,
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
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
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
    this.boardId = null; this.code = null; this.board = null;
    this.slots = []; this.entries = []; this.claims = new Map();
  },
};

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
    live.unsubs.push(D.watchBoard(boardId, (b) => { live.board = b; drawBoard(); },
      (e) => toast(friendly(e), 5000)));
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

const THEMES = { blue: '#2563eb', green: '#0f766e', plum: '#7c3aed', slate: '#475569', amber: '#b45309' };
function applyTheme(themeKey) {
  const c = THEMES[themeKey];
  if (c) document.documentElement.style.setProperty('--accent', c);
  else document.documentElement.style.removeProperty('--accent');
}

function drawBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  setGrowthFooter(!own);
  const locked = !!b.settings?.locked;
  applyTheme(b.settings?.theme);
  const v = $('view');
  v.replaceChildren();

  // --- title block ---
  const head = el('section', { class: 'card' });
  head.append(el('div', { style: 'display:flex;align-items:baseline;gap:8px' },
    el('h2', { style: 'all:unset;font-size:1.3rem;font-weight:700;flex:1;overflow-wrap:anywhere', text: b.title }),
    own ? el('span', { class: 'badge', text: 'you run this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub', style: 'margin:6px 0 0', text: b.description }));
  const stats = fillStats(live.slots);
  if (stats.total > 0) {
    head.append(
      el('div', { class: 'fillbar' }, el('div', { style: 'width:' + Math.round(100 * stats.taken / stats.total) + '%' })),
      el('div', { class: 'sub', text: stats.taken + ' of ' + stats.total + ' spots filled' }));
  }
  v.append(head);

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
    slotsCard.append(el('p', { class: 'hint', text: own
      ? 'No spots yet — open Manage below to add them (paste a whole list at once if you like).'
      : 'The organizer hasn’t added spots yet.' }));
  }
  for (const s of live.slots) slotsCard.append(renderSlot(s, own, locked));
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
  if (own) top.append(el('button', { class: 'btn small noprint', type: 'button', 'aria-label': 'Edit slot', onclick: () => openSlotDlg(s) }, '✎'));
  box.append(top);
  const chips = el('div', { class: 'chips' });
  for (const c of claims) {
    const isMine = user && c.uid === user.uid;
    const chip = el('span', { class: 'chip' + (isMine ? ' mine' : '') },
      c.name + (isMine ? ' (you)' : '') + (c.note ? ' · ' + c.note : ''));
    if ((isMine && !locked) || own) chip.append(el('button', {
      type: 'button', 'aria-label': 'Remove ' + c.name + ' from this spot', class: 'noprint',
      onclick: async () => {
        try {
          if (isMine) await D.releaseClaim(live.boardId, s.id);
          else await D.ownerRemoveClaim(live.boardId, s.id, c.uid);
          toast(isMine ? 'Spot released' : 'Removed');
        } catch (e) { toast(friendly(e), 4500); }
      },
    }, '✕'));
    chips.append(chip);
  }
  // print-only blanks for open seats
  for (let i = 0; i < left; i++) chips.append(el('span', { class: 'chip printonly', text: '________________' }));
  if (claims.length || left) box.append(chips);
  if (!mine && left > 0 && !locked) {
    box.append(el('div', { class: 'noprint', style: 'margin-top:8px' },
      el('button', { class: 'btn primary small', type: 'button', onclick: () => openClaim(s) }, 'Claim this spot')));
  }
  return box;
}

let claimTarget = null;
function openClaim(slot) {
  claimTarget = slot;
  $('nameDlgSlot').textContent = slot.label;
  $('nameInput').value = myName();
  $('noteInput').value = '';
  showDlg($('nameDlg'));
  $('nameInput').focus();
}

function renderEntries(b, own, locked) {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Extras & notes'));
  const list = el('ul', { class: 'plain' });
  for (const e of live.entries) {
    const mineE = user && e.creatorUid === user.uid;
    const li = el('li', {},
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, e.authorName), ': ' + e.body,
          e.status === 'pending' ? el('span', { class: 'badge pending', style: 'margin-left:6px', text: 'awaiting approval' }) : null)));
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
  if (live.entries.length === 0) card.append(el('p', { class: 'hint', text: '“I’ll also bring lemonade!” — anything that isn’t a listed spot goes here.' }));
  card.append(list);
  if (!locked) {
    const nameIn = el('input', { type: 'text', placeholder: 'Your name', maxlength: '60', value: myName(), 'aria-label': 'Your name' });
    const bodyIn = el('input', { type: 'text', placeholder: 'I’ll bring…', maxlength: '2000', 'aria-label': 'Your note',
      onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); } });
    const addBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
      onclick: async () => {
        const name = nameIn.value.trim(), body = bodyIn.value.trim();
        if (!name || !body) { toast('Add your name and the note'); return; }
        saveName(name);
        try {
          const status = await D.addEntry(live.boardId, b, { authorName: name, body });
          bodyIn.value = '';
          toast(status === 'pending' ? 'Added — the organizer will approve it shortly' : 'Added');
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add');
    card.append(el('div', { class: 'row noprint', style: 'margin-top:10px' }, nameIn, bodyIn, addBtn));
  }
  return card;
}

/* ---------- owner manage panel ---------- */
let addMode = 'single';
function renderManage(b) {
  const url = shareUrl(live.code, baseUrl());
  const wrap = el('details', { class: 'manage noprint' }, el('summary', {}, 'Manage this sheet'));
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
      el('button', { type: 'button', class: k === addMode ? 'active' : '', onclick: () => { addMode = k; drawBoard(); } }, label)));
  inner.append(seg);

  if (addMode === 'single') {
    const lab = el('input', { type: 'text', placeholder: 'Main dish', maxlength: '120' });
    const cap = el('input', { type: 'number', value: '1', min: '1', max: '999', 'aria-label': 'How many needed', style: 'flex:0 0 84px' });
    inner.append(el('div', { class: 'row' }, lab, cap,
      el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', onclick: async () => {
        const label = lab.value.trim();
        if (!label) { toast('Give the spot a label'); return; }
        try { await addSlotsChecked([{ label, capacity: parseInt(cap.value, 10) || 1 }]); lab.value = ''; }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Add')));
  } else if (addMode === 'bulk') {
    const ta = el('textarea', { placeholder: 'One spot per line — add ×N for multiples:\nMain dish x3\nSide or salad x4\nDessert x2\nDrinks & ice' });
    inner.append(ta, el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const rows = parseBulkSlots(ta.value);
        if (rows.length === 0) { toast('Paste one spot per line first'); return; }
        try { await addSlotsChecked(rows); ta.value = ''; }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Add all')));
  } else {
    const start = el('input', { type: 'date' });
    const end = el('input', { type: 'date' });
    const time = el('input', { type: 'text', placeholder: '3–5pm (optional)', maxlength: '40' });
    const prefix = el('input', { type: 'text', placeholder: 'Label, e.g. “Concession stand” (optional)', maxlength: '60' });
    const cap = el('input', { type: 'number', value: '1', min: '1', max: '999', 'aria-label': 'People needed per date' });
    const days = el('div', { class: 'wkdays' },
      ...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) =>
        el('label', {}, el('input', { type: 'checkbox', value: String(i) }), d)));
    inner.append(
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'From'), start),
        el('label', { class: 'f' }, el('span', {}, 'To'), end)),
      el('label', { class: 'f' }, el('span', {}, 'On these days'), days),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Time (optional)'), time),
        el('label', { class: 'f' }, el('span', {}, 'People per date'), cap)),
      el('label', { class: 'f' }, el('span', {}, 'Label (optional)'), prefix),
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const weekdays = [...days.querySelectorAll('input:checked')].map(c => parseInt(c.value, 10));
        const rows = dateRangeSlots({
          start: start.value, end: end.value, weekdays,
          timeText: time.value, prefix: prefix.value, capacity: parseInt(cap.value, 10) || 1,
        });
        if (rows.length === 0) { toast('Pick a date range and at least one weekday'); return; }
        if (!confirm('Add ' + rows.length + ' dated spots?')) return;
        try { await addSlotsChecked(rows); } catch (e) { toast(friendly(e), 4500); }
      } }, 'Generate spots'));
  }

  // settings
  inner.append(el('h2', { style: 'margin-top:16px' }, 'Settings'));
  const s = b.settings || {};
  inner.append(
    el('label', { class: 'f' }, el('span', {}, 'Color')),
    el('div', { class: 'themedots' },
      ...Object.entries(THEMES).map(([key, color]) =>
        el('button', {
          type: 'button', 'aria-label': key + ' theme',
          class: (s.theme || 'blue') === key ? 'sel' : '',
          style: 'background:' + color,
          onclick: () => D.setTheme(live.boardId, s, key)
            .then(() => toast('Color updated'))
            .catch(e => toast(String((e && e.code) || '').includes('permission-denied')
              ? 'Colors need the updated rules — re-publish them from the latest version.'
              : friendly(e), 5000)),
        }))));
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
