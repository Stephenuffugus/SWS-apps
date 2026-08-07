// Grocery List — Engine 1 skin. One live list per household; items are entries,
// the done-checkbox is open to every link-holder (rules-enforced).
import { normalizeCode, shareUrl } from './helpers.js';
import * as D from './data.js';
import { firebaseConfig } from './firebase-config.js';

D.initFirebase(firebaseConfig);

const CONFIG = { tipUrl: '' };

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
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy'); }
}
function friendly(e) {
  const code = (e && (e.code || e.message)) || '';
  if (String(code).includes('permission-denied')) return 'That didn’t save — the list may be locked, or its setup needs the latest rules.';
  if (String(code).includes('unavailable')) return 'You look offline — it will sync when you reconnect.';
  return 'Something went wrong. Try again?';
}

let user = null;
let itemDraft = '';
let addFocused = false; // survive live-snapshot redraws mid-typing
const live = {
  boardId: null, code: null, board: null, entries: [],
  unsubs: [],
  stop() {
    this.unsubs.forEach(u => u && u());
    this.unsubs = [];
    this.boardId = null; this.code = null; this.board = null; this.entries = [];
  },
};

function route() {
  const m = location.hash.match(/^#\/b\/([A-HJ-NP-Z2-9]{6})/);
  return m ? { view: 'board', code: m[1] } : { view: 'home' };
}
window.addEventListener('hashchange', render);
const isOwner = () => !!(user && live.board && live.board.ownerUid === user.uid);

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

/* ---------- home ---------- */
async function renderHome() {
  live.stop();
  const v = $('view');
  v.replaceChildren();
  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'The list is always in your pocket'),
    el('p', {}, 'Add from the couch, check off at the store — live for the whole household from one link. ',
      el('strong', {}, 'No app installs for family, no accounts, no ads.')),
    el('button', { class: 'btn primary', type: 'button', onclick: startCreate }, 'Start our list')));

  const codeInput = el('input', {
    type: 'text', placeholder: 'ABC123', maxlength: '8', autocomplete: 'off',
    style: 'text-transform:uppercase; letter-spacing:.15em; text-align:center',
    'aria-label': 'List code',
    onkeydown: (ev) => { if (ev.key === 'Enter') openBtn.click(); },
  });
  const openBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
    onclick: () => {
      const c = normalizeCode(codeInput.value);
      if (!c) { toast('Codes are 6 letters/numbers'); return; }
      location.hash = '#/b/' + c;
    } }, 'Open');
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Joining a household list?'),
    el('div', { class: 'row' }, codeInput, openBtn)));

  if (user && !D.isAnon(user)) {
    const sec = el('section', { class: 'card' }, el('h2', {}, 'Your lists'));
    const ul = el('ul', { class: 'plain' });
    sec.append(ul, el('p', { class: 'hint', text: 'Loading…' }));
    v.append(sec);
    try {
      const boards = (await D.myBoards(user.uid)).filter(b => b.skin === 'grocery');
      sec.lastChild.remove();
      if (boards.length === 0) sec.append(el('p', { class: 'hint', text: 'No lists yet — most households only ever need one.' }));
      for (const b of boards) {
        ul.append(el('li', {},
          el('label', { style: 'cursor:default' }, b.title),
          el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/b/' + b.shareCode; } }, 'Open')));
      }
    } catch (e) { sec.lastChild.textContent = friendly(e); }
  }
}

function startCreate() {
  if (!user || D.isAnon(user)) { showDlg($('authDlg')); return; }
  createList();
}
async function createList() {
  try {
    const { code } = await D.createBoard({ title: 'Groceries', description: '' });
    location.hash = '#/b/' + code;
    toast('List ready — share the link with the household');
  } catch (e) { toast(friendly(e), 5000); }
}

/* ---------- board ---------- */
async function renderBoard(code) {
  const v = $('view');
  if (live.code !== code) {
    live.stop();
    v.replaceChildren(el('p', { class: 'hint', text: 'Opening the list…' }));
    try { await D.ensureSignedIn(); }
    catch (e) { v.replaceChildren(el('p', { class: 'sub', text: 'Couldn’t connect — check your internet and reload.' })); return; }
    const boardId = await D.resolveCode(code).catch(() => null);
    if (!boardId) {
      v.replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'sub', text: 'That list doesn’t exist — the link may have been rotated.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    live.boardId = boardId; live.code = code;
    live.unsubs.push(D.watchBoard(boardId, (b) => { live.board = b; drawBoard(); },
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

function drawBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  const v = $('view');
  v.replaceChildren();

  const open = live.entries.filter(e => !e.done);
  const done = live.entries.filter(e => e.done);

  // add box first — it's the most-used control
  const input = el('input', {
    type: 'text', maxlength: '120', placeholder: 'Add something… “milk”, “the good coffee”',
    value: itemDraft,
    oninput: (ev) => { itemDraft = ev.target.value; },
    onfocus: () => { addFocused = true; },
    onblur: () => { addFocused = false; },
    onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); },
  });
  // a family member checking something off must not close YOUR keyboard
  if (addFocused) requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  const addBtn = el('button', { class: 'btn primary', type: 'button', style: 'flex:0 0 auto',
    onclick: async () => {
      const body = input.value.trim();
      if (!body) return;
      itemDraft = '';
      input.value = '';
      input.focus();
      try { await D.addEntry(live.boardId, b, { authorName: 'someone', body, type: 'note' }); }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Add');
  v.append(el('section', { class: 'card' },
    el('div', { class: 'row' }, input, addBtn)));

  const listCard = el('section', { class: 'card' },
    el('h2', {}, open.length ? open.length + ' to get' : 'All done 🎉'));
  const ul = el('ul', { class: 'plain' });
  const renderItem = (e) => {
    const cb = el('input', { type: 'checkbox',
      onchange: async () => {
        try { await D.toggleDone(live.boardId, e.id, cb.checked); }
        catch (err) { cb.checked = !cb.checked; toast(friendly(err), 4500); }
      } });
    cb.checked = !!e.done;
    return el('li', { class: e.done ? 'done' : '' },
      el('label', {}, cb, e.body),
      (own || (user && e.creatorUid === user.uid))
        ? el('button', { class: 'btn small', type: 'button', 'aria-label': 'Remove item',
            onclick: () => D.deleteEntry(live.boardId, e.id).catch(err => toast(friendly(err))) }, '✕')
        : null);
  };
  for (const e of open.slice().reverse()) ul.append(renderItem(e));
  for (const e of done) ul.append(renderItem(e));
  if (live.entries.length === 0)
    listCard.append(el('p', { class: 'hint', text: 'Empty list, full fridge — for now.' }));
  listCard.append(ul);
  if (own && done.length) {
    listCard.append(el('div', { style: 'margin-top:10px' },
      el('button', { class: 'btn small', type: 'button', onclick: async () => {
        try { const n = await D.clearChecked(live.boardId, live.entries); toast(n + ' checked item(s) cleared'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Clear checked (' + done.length + ')')));
  }
  v.append(listCard);

  const share = el('details', { class: 'manage' }, el('summary', {}, 'Share with the household'));
  const inner = el('div', { class: 'inner' },
    el('div', { class: 'sharecode', text: live.code }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'button',
        onclick: () => copyText(shareUrl(live.code, baseUrl()), 'Link copied — text it once, done forever') }, 'Copy link'),
      el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code')));
  if (own) inner.append(el('div', { class: 'row', style: 'margin-top:8px' },
    el('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!confirm('Rotate the link? The old one stops working for everyone.')) return;
      try { const code = await D.rotateCode(live.boardId, live.code);
        live.code = code; location.hash = '#/b/' + code; toast('New link ready'); }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Rotate link'),
    el('button', { class: 'btn small', type: 'button', style: 'color:var(--neg)', onclick: async () => {
      if (!confirm('Delete the whole list for everyone?')) return;
      try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Delete list')));
  share.append(inner);
  v.append(share);
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
  } catch (e) {}
  showDlg($('qrDlg'));
}
function showDlg(d) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
function closeDlg(d) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }

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
      toast('Google sign-in didn’t complete (' + ((e && e.code) || 'unknown') + ')', 6000);
    }
  });
  $('emailBtn').addEventListener('click', async () => {
    const email = $('emailInput').value.trim();
    if (!email.includes('@')) { toast('Enter your email first'); return; }
    try { await D.startEmailLink(email, baseUrl()); $('emailSent').classList.remove('hidden'); }
    catch (e) { toast('Couldn’t send the link (' + ((e && e.code) || 'unknown') + ')', 6000); }
  });
  $('authCancel').addEventListener('click', () => closeDlg($('authDlg')));
  $('qrClose').addEventListener('click', () => closeDlg($('qrDlg')));
}

function render() {
  const r = route();
  if (r.view === 'board') renderBoard(r.code);
  else renderHome();
}
function refreshAuthBtn() {
  $('authBtn').textContent = (user && !D.isAnon(user)) ? 'Sign out' : 'Sign in';
}

async function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  try { await D.completeEmailLink(async () => prompt('Confirm your email to finish signing in:')); }
  catch (e) { toast('That sign-in link didn’t work — request a fresh one.', 6000); }
  try { await D.completeRedirect(); }
  catch (e) { toast('Google sign-in didn’t complete (' + ((e && e.code) || '?') + ')', 6000); }
  D.onAuth((u) => { user = u; refreshAuthBtn(); render(); });
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !firebaseConfig.projectId.startsWith('demo-')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
