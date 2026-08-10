// Grocery List — Engine 1 skin. One live list per household; items are entries,
// the done-checkbox is open to every link-holder (rules-enforced).
import { normalizeCode, shareUrl } from './helpers.js';
import * as D from './data.js';
import { firebaseConfig } from './firebase-config.js';

D.initFirebase(firebaseConfig);

const CONFIG = { tipUrl: 'https://buy.stripe.com/28EeVec9X3H1cPXaud7EQ04' };

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

/* sws-ui.js is loaded in the page and owns the toast: it holds the clock while
   a pointer or the keyboard focus is inside, which is the only thing that makes
   an Undo button in a toast honest. This app used to declare a private toast()
   beside it and never call the shared one. Now the private name is a thin
   forward, so every existing call site gained hover-hold and Undo for free. */
let toastTimer = null;
function toast(msg, ms) {
  if (window.SWS && window.SWS.toast) return window.SWS.toast(msg, { ms: ms || 4000 });
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 4000);
}
function undoToast(msg, onUndo) {
  if (window.SWS && window.SWS.undo) return window.SWS.undo(msg, onUndo);
  return toast(msg);
}
/* "Saved on this phone" rather than "Saved": the local cache really does take
   the write first, which is why the list keeps working past the freezer wall. */
function savedFlag() {
  if (window.SWS && window.SWS.saved) window.SWS.saved({ text: 'Saved on this phone' });
}

// The promise as a visible object rather than grey copy in the footer. This app
// does sync through the cloud, so the claim is scoped to what is actually true:
// no ads, no accounts for the people you share with, nothing to subscribe to.
function trustNote(tail) {
  return el('div', { class: 'trust' },
    el('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
    el('span', {}, el('b', {}, 'No ads. No accounts for family. No subscription.'), ' ' + tail));
}
/* The board's own badge. Specific to this app and specific about the sync: the
   item names DO leave the phone, because that is the entire point of a shared
   list, and pretending otherwise would be the one lie that matters here. */
function boardTrust() {
  return el('div', { class: 'boardtrust noprint' },
    el('div', { class: 'trust' },
      el('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
      el('span', {},
        el('b', {}, 'What leaves this phone: the item names, so the rest of the household sees them.'),
        ' Nothing else — no contacts, no location, no account for the people you share with. ' +
        'Your copy is kept on this phone too, so the list still opens in aisle 12 with no signal, ' +
        'and no brand can pay to put anything on it.')));
}

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy'); }
}
function friendly(e) {
  const code = (e && (e.code || e.message)) || '';
  if (String(code).includes('permission-denied')) return 'That didn’t save — the list may be locked, or it has used all 500 of its lifetime item slots.';
  if (String(code).includes('unavailable')) return 'You look offline — it will sync when you reconnect.';
  return 'Something went wrong. Try again?';
}
/* Distinguishing "no signal" from "no such list" is the whole point of fix #4:
   a shopper standing in a dead zone must not be told their family's list does
   not exist. */
function looksOffline(e) {
  if (navigator.onLine === false) return true;
  const s = String((e && (e.code || e.message)) || '');
  return /unavailable|failed-precondition|deadline-exceeded|network|offline/i.test(s);
}

/* Dedupe key. "Milk", "milk" and "Milk " are one item; so are "Greek yoghurt"
   and "greek  yoghurt". Accents are folded so "crème fraîche" matches itself
   typed without them. */
function normName(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Firestore resolves a write only when the SERVER acknowledges it, but the
   local cache accepted it and redrew the list long before that. In a supermarket
   dead zone the promise simply never settles. So every write here races a short
   timer: 'ok' = confirmed, 'queued' = the cache took it and it will sync,
   'failed' = genuinely rejected. Nothing in the UI waits on a network. */
function commit(promise, ms) {
  let err = null;
  const p = promise.then(() => 'ok', (e) => { err = e; return 'failed'; });
  const settled = Promise.race([p, new Promise((r) => setTimeout(() => r('queued'), ms || 1200))]);
  return { p, settled, error: () => err };
}

let user = null;
let itemDraft = '';
let addError = '';      // inline, under the add row — a toast is under the keyboard
let addBusy = false;    // one paste-a-blob run at a time
const inFlight = new Set(); // normalized names being written right now
let flashId = null;     // the row a duplicate add pointed at
let flashTimer = null;
let shareOpen = false;  // survive live-snapshot redraws
let renaming = false;   // the owner is editing the list's name
let renameDraft = '';   // …and what they have typed so far, kept across redraws
const live = {
  boardId: null, code: null, board: null, entries: [],
  unsubs: [],
  stop() {
    this.unsubs.forEach(u => u && u());
    this.unsubs = [];
    this.boardId = null; this.code = null; this.board = null; this.entries = [];
    shareOpen = false; addError = ''; flashId = null;
    renaming = false; renameDraft = '';
    clearTimeout(flashTimer);
  },
};

/* Two entry points used to disagree: the join field normalised the code and the
   hash route accepted uppercase only, so a link lowercased by a messaging app
   dropped the recipient on the marketing page with no message at all. Both run
   through normalizeCode() now, and the URL is rewritten with replaceState so
   the corrected link is the one that gets copied next. */
function boardCodeInHash() {
  const m = (location.hash || '').match(/^#\/b\/([^/?#]*)/);
  return m ? m[1] : null;
}
function normalizeHash() {
  const raw = boardCodeInHash();
  if (raw === null) return;
  const c = normalizeCode(raw);
  if (!c || c === raw) return;
  try { history.replaceState(null, '', baseUrl() + '#/b/' + c); } catch (e) {}
}
function route() {
  const raw = boardCodeInHash();
  if (raw === null) return { view: 'home' };
  const c = normalizeCode(raw);
  return c ? { view: 'board', code: c } : { view: 'badcode' };
}
window.addEventListener('hashchange', render);
const isOwner = () => !!(user && live.board && live.board.ownerUid === user.uid);

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

/* ---------- home ---------- */
// Participants see an invitation instead of the standard colophon — every
// shared board doubles as the product's own ad. Owners and home keep the default.
function setGrowthFooter(participant) {
  const o = document.getElementById('orgLine');
  if (!o) return;
  if (!o.dataset.home) o.dataset.home = o.innerHTML;
  o.innerHTML = participant
    ? 'Made with <a href="./">Grocery List</a> — free, no ads. <a href="./">Start yours</a>'
    : o.dataset.home;
}

async function renderHome() {
  setGrowthFooter(false);
  live.stop();
  const v = $('view');
  v.replaceChildren();
  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'The list is always in your pocket'),
    el('p', {}, 'Add from the couch, check off at the store — live for the whole household from one link. ',
      el('strong', {}, 'No app installs for family, no accounts, no ads.')),
    el('button', { class: 'btn primary big', type: 'button', onclick: startCreate }, 'Start our list'),
    trustNote('Only the person who starts the list signs in.')));

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
    el('div', { class: 'row nowrap' }, codeInput, openBtn)));

  if (user && !D.isAnon(user)) {
    const sec = el('section', { class: 'card' }, el('h2', {}, 'Your lists'));
    const ul = el('ul', { class: 'plain' });
    sec.append(ul, el('p', { class: 'sub', text: 'Loading…' }));
    v.append(sec);
    try {
      const boards = (await D.myBoards(user.uid)).filter(b => b.skin === 'grocery');
      sec.lastChild.remove();
      if (boards.length === 0) sec.append(el('p', { class: 'sub', text: 'No lists yet — most households only ever need one.' }));
      for (const b of boards) {
        ul.append(el('li', {},
          el('span', { class: 'grow' }, b.title),
          el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
            'aria-label': 'Open ' + b.title, onclick: () => { location.hash = '#/b/' + b.shareCode; } }, 'Open')));
      }
    } catch (e) { const p = sec.lastChild; p.className = 'warn'; p.textContent = friendly(e); }
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
function connCard(v, code, e) {
  const offline = looksOffline(e);
  v.replaceChildren(el('section', { class: 'card' },
    el('h2', { class: 'lead' }, offline ? 'You look offline' : 'Couldn’t open the list'),
    el('p', { class: 'warn' }, offline
      ? 'No signal here — that happens in aisle 12. This list opens as soon as you have one, and nothing anybody has already added is lost.'
      : 'Something got in the way of loading this list. Nothing has been lost; try again in a moment.'),
    el('div', { class: 'row listfoot' },
      el('button', { class: 'btn primary', type: 'button',
        onclick: () => { live.stop(); renderBoard(code); } }, 'Try again'),
      el('a', { class: 'btn', href: '#/' }, 'Go home'))));
}

function notFoundCard(v) {
  setGrowthFooter(false);
  v.replaceChildren(el('section', { class: 'card' },
    el('h2', { class: 'lead' }, 'That list isn’t here'),
    el('p', { class: 'warn' }, 'The link may have been rotated, or the code was mistyped. Codes are 6 letters and numbers.'),
    el('p', { class: 'listfoot' }, el('a', { class: 'btn', href: '#/' }, 'Go home'))));
}

function renderBadCode() {
  live.stop();
  notFoundCard($('view'));
}

async function renderBoard(code) {
  const v = $('view');
  if (live.code !== code) {
    live.stop();
    v.replaceChildren(el('p', { class: 'sub', text: 'Opening the list…' }));
    try { await D.ensureSignedIn(); }
    catch (e) { connCard(v, code, e); return; }

    // resolveCode used to be `.catch(() => null)`, which turned every network
    // failure into "that list does not exist" — the worst possible answer for
    // a category whose defining environment is a supermarket dead zone.
    let boardId = null;
    try { boardId = await D.resolveCode(code); }
    catch (e) { connCard(v, code, e); return; }
    if (!boardId) { notFoundCard(v); return; }

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

/* ---------- adding ---------- */
const addInput = () => document.querySelector('#view [data-fkey="add"]');

function showAddError(msg) {
  addError = msg || '';
  const box = $('addErr');
  if (!box) { if (addError) drawBoard(); return; }
  if (!addError) { box.remove(); return; }
  box.textContent = addError;
}

function flash(id) {
  flashId = id;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashId = null; drawBoard(); }, 1800);
  drawBoard();
}

/**
 * Add one item. Returns { state:'ok'|'dup'|'error', err }.
 *
 * Never loses what was typed: the caller frees the box immediately so the next
 * item can be typed without waiting on a network, and every rejection — the
 * fast one and the one that only arrives when the queued write reaches the
 * server — hands the exact text back through lateFailure().
 */
async function addOne(body, quiet) {
  const key = normName(body);
  const dup = key && live.entries.find(e => normName(e.body) === key);
  if (dup) {
    flash(dup.id);
    if (dup.done) {
      // Already bought, needed again — put it back rather than making a twin.
      try { await D.toggleDone(live.boardId, dup.id, false); }
      catch (e) { return { state: 'error', err: e }; }
      if (!quiet) toast('“' + dup.body + '” was in the cart — back on the list');
    } else if (!quiet) {
      toast('“' + dup.body + '” is already on the list');
    }
    return { state: 'dup' };
  }
  const c = commit(D.addEntry(live.boardId, live.board,
    { authorName: 'someone', body, type: 'note' }));
  const r = await c.settled;
  if (r === 'failed') return { state: 'error', err: c.error() };
  if (r === 'queued') {
    // Accepted by the local cache; if the server later refuses it, hand the
    // text back rather than letting it disappear silently.
    c.p.then((x) => { if (x === 'failed') lateFailure(body, c.error()); });
  }
  return { state: 'ok' };
}

/* A rejected write used to cost the user their typing and return a message
   naming none of the causes. The text comes back into the box if the box is
   free, and is quoted in the error if the user has already started the next
   item — either way it is still on screen and still recoverable. */
function lateFailure(body, e) {
  const i = addInput();
  const boxFree = !!i && !i.value.trim();
  if (boxFree) { itemDraft = body; i.value = body; }
  showAddError(friendly(e) + (boxFree
    ? ' Your text is back in the box.'
    : ' Not saved: “' + body + '”'));
  const j = addInput();
  if (j && boxFree) {
    j.focus();
    try { j.setSelectionRange(j.value.length, j.value.length); } catch (er) {}
  }
}

function submitAdd() {
  const input = addInput();
  if (!input) return;
  const body = input.value.trim();
  if (!body) return;
  const key = normName(body);
  // Three synchronous taps on Add are one item, not three — and two devices
  // racing the same word cannot make a twin either.
  if (inFlight.has(key)) return;
  inFlight.add(key);
  itemDraft = '';
  input.value = '';
  input.focus();
  showAddError('');
  addOne(body).then((r) => {
    inFlight.delete(key);
    if (r.state === 'error') lateFailure(body, r.err);
    else if (r.state === 'ok') savedFlag();
  }, (e) => { inFlight.delete(key); lateFailure(body, e); });
}

/* Paste a recipe's ingredient block and it becomes items, one per line — the
   reliable answer to the flaky voice-assistant complaint in the research. */
function onPaste(ev) {
  const dt = ev.clipboardData || window.clipboardData;
  const text = dt ? dt.getData('text') : '';
  if (!text || !/[\r\n]/.test(text.trim())) return; // single line: normal paste
  const lines = text.split(/\r?\n/)
    .map(s => s.replace(/^\s*(?:[-*\u2022\u2023]|\d+[.)])\s*/, '').trim())
    .filter(Boolean).slice(0, 50);
  if (lines.length < 2) return;
  ev.preventDefault();
  addMany(lines);
}

async function addMany(lines) {
  if (addBusy) return;
  addBusy = true;
  showAddError('');
  let added = 0, dup = 0;
  try {
    for (const line of lines) {
      const r = await addOne(line.slice(0, 120), true);
      if (r.state === 'ok') added++;
      else if (r.state === 'dup') dup++;
      else { showAddError(friendly(r.err)); break; }
    }
  } finally { addBusy = false; }
  itemDraft = '';
  const i = addInput();
  if (i) { i.value = ''; i.focus(); }
  if (added) savedFlag();
  toast(added + (added === 1 ? ' item added' : ' items added') +
    (dup ? ', ' + dup + ' already on the list' : ''));
}

/* ---------- destructive actions, all reversible ---------- */
async function removeItem(entry) {
  const own = isOwner();
  const c = commit(D.deleteEntry(live.boardId, entry.id, {
    asOwner: own, entryCount: (live.board && live.board.entryCount) || 0,
  }));
  const r = await c.settled;
  if (r === 'failed') { toast(friendly(c.error()), 4500); return; }
  if (r === 'queued') c.p.then((x) => { if (x === 'failed') toast(friendly(c.error()), 4500); });
  savedFlag();
  // A snapshot of the row, restored wholesale. A hand-written inverse forgets
  // things; this one cannot forget that the item was already in the cart.
  undoToast('Removed “' + entry.body + '”', async () => {
    try {
      await D.addEntry(live.boardId, live.board, {
        authorName: entry.authorName || 'someone', body: entry.body,
        type: entry.type, done: !!entry.done,
      });
      toast('“' + entry.body + '” is back');
    } catch (e) { toast(friendly(e), 4500); }
  });
}

async function clearChecked(doneList) {
  const snapshot = doneList.map(e => ({
    body: e.body, done: true, type: e.type, authorName: e.authorName,
  }));
  const c = commit(D.clearChecked(live.boardId, live.entries));
  const r = await c.settled;
  if (r === 'failed') { toast(friendly(c.error()), 4500); return; }
  if (r === 'queued') c.p.then((x) => { if (x === 'failed') toast(friendly(c.error()), 4500); });
  savedFlag();
  // The confirm() this replaces literally said "This cannot be undone."
  undoToast(snapshot.length + (snapshot.length === 1 ? ' item cleared' : ' items cleared'), async () => {
    for (const e of snapshot) {
      try { await D.addEntry(live.boardId, live.board, { ...e, authorName: e.authorName || 'someone' }); }
      catch (err) { toast(friendly(err), 4500); return; }
    }
    toast('Back in the cart');
  });
}

/* ---------- naming the list ---------- */
/* Tomasz could not tell whether the link he had been sent was his household's
   list or a stranger's, because nothing on the page named it. The name is on
   the board, the print and the share text now — and the one person who can
   change it is the one the rules let: firestore.rules allows the owner to touch
   `title` and holds it to 1–100 characters, so those are the only limits here.
   No new field, no migration; every board already has a title. */
function focusKey(k) {
  const n = document.querySelector('#view [data-fkey="' + k + '"]');
  if (n) n.focus();
  return n;
}

function startRename(title) {
  renaming = true;
  renameDraft = title;
  drawBoard();
  const i = focusKey('renameinput');
  if (i && i.select) i.select();
}
function cancelRename() {
  renaming = false;
  renameDraft = '';
  drawBoard();
  focusKey('rename');
}

async function applyTitle(name) {
  const c = commit(D.updateBoard(live.boardId, { title: name }));
  const r = await c.settled;
  if (r === 'failed') { toast(friendly(c.error()), 4500); return false; }
  if (r === 'queued') c.p.then((x) => { if (x === 'failed') toast(friendly(c.error()), 4500); });
  savedFlag();
  return true;
}

async function commitRename(was) {
  const name = String(renameDraft || '').trim().slice(0, 100);
  // The rules reject an empty title outright; refusing here keeps the user's
  // text in the box instead of trading it for a permission error.
  if (!name) { toast('The list needs a name'); focusKey('renameinput'); return; }
  renaming = false;
  renameDraft = '';
  drawBoard();
  focusKey('rename');
  if (name === was) return;
  if (!(await applyTitle(name))) return;
  // Renaming is not destructive, but it is the kind of thing that gets done by
  // accident on a phone, and putting it back is one write.
  if (was) undoToast('List renamed to “' + name + '”', () => applyTitle(was));
  else toast('List renamed to “' + name + '”');
}

function nameLine(own, title) {
  const line = el('p', { class: 'boardname' }, el('b', {}, title));
  if (own && !renaming) {
    line.append(el('button', { class: 'btn ghost noprint', type: 'button',
      'data-fkey': 'rename', 'aria-label': 'Rename this list, currently ' + title,
      onclick: () => startRename(title) }, 'Rename'));
  }
  if (!own || !renaming) return [line];
  const input = el('input', {
    type: 'text', maxlength: '100', value: renameDraft,
    'aria-label': 'List name', 'data-fkey': 'renameinput', autocomplete: 'off',
    oninput: (ev) => { renameDraft = ev.target.value; },
    onkeydown: (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commitRename(title); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancelRename(); }
    },
  });
  // Save is NOT .primary: Add is the board's only primary, and a second accent
  // fill at the top of the screen is exactly what that rule exists to prevent.
  // The hierarchy here is solid-vs-ghost, and Enter commits anyway.
  return [line, el('div', { class: 'renamerow noprint' }, input,
    el('button', { class: 'btn', type: 'button', 'data-fkey': 'renamesave',
      onclick: () => commitRename(title) }, 'Save'),
    el('button', { class: 'btn ghost', type: 'button', 'data-fkey': 'renamecancel',
      onclick: cancelRename }, 'Cancel'))];
}

/* ---------- the board ---------- */
function listAsText(b, items) {
  const lines = [b.title || 'Grocery list'];
  for (const e of items) lines.push((e.done ? '✓ ' : '• ') + e.body);
  lines.push('', 'Live list, no app and no account: ' + shareUrl(live.code, baseUrl()));
  return lines.join('\n');
}

function drawBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  setGrowthFooter(!own);
  const v = $('view');

  // A snapshot from anyone in the household rebuilds this whole subtree, so
  // remember where the keyboard was — and the caret inside it — and put both
  // back afterwards. The add field carries data-fkey like every other control.
  const active = document.activeElement;
  const keepFocus = active && active.dataset ? active.dataset.fkey : null;
  let caret = null;
  if (keepFocus) {
    try { if (active.selectionStart !== null && active.selectionStart !== undefined) caret = [active.selectionStart, active.selectionEnd]; }
    catch (e) { /* checkbox and button inputs have no selection */ }
  }
  // Emptying #view collapses the document, so the browser clamps the scroll and
  // everyone else's place in the aisle jumps. Hold the height across the swap.
  const heldHeight = v.offsetHeight;
  const heldScroll = window.scrollY;
  v.style.minHeight = heldHeight + 'px';
  v.replaceChildren();

  /* ONE list, ONE stable order, for every row whatever its state.
     Checking something used to move its row to the bottom and slide everything
     below it up 61px — under a thumb that was already descending on the next
     item. Nothing re-sorts here any more: a checked row goes grey and struck
     through exactly where it has always been. */
  const at = (e) => (e.createdAt && e.createdAt.toMillis) ? e.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
  const items = live.entries.slice().sort((x, y) => at(x) - at(y));
  const open = items.filter(e => !e.done);
  const done = items.filter(e => e.done);

  const title = b.title || 'Grocery list';
  v.append(...nameLine(own, title));
  // On paper: which list this is, and when it was printed.
  v.append(el('p', { class: 'printonly printhead' },
    'Share code ' + (live.code || '') + ' · printed ' + new Date().toLocaleDateString()));

  // add box first — it's the most-used control
  const input = el('input', {
    type: 'text', maxlength: '120', placeholder: 'Add something… “milk”, “the good coffee”',
    'aria-label': 'Add an item to the list',
    'data-fkey': 'add',
    enterkeyhint: 'done',
    autocomplete: 'off', autocapitalize: 'sentences',
    value: itemDraft,
    oninput: (ev) => { itemDraft = ev.target.value; },
    onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submitAdd(); } },
    onpaste: onPaste,
  });
  const addBtn = el('button', { class: 'btn primary', type: 'button',
    'data-fkey': 'addbtn', onclick: () => submitAdd() }, 'Add');
  const addCard = el('section', { class: 'card noprint' },
    el('div', { class: 'addrow' }, input, addBtn));
  if (addError) addCard.append(el('p', { class: 'warn adderr', id: 'addErr', role: 'alert' }, addError));
  addCard.append(el('div', { class: 'addfoot' },
    el('span', { 'data-saved-flag': '' }),
    navigator.onLine === false
      ? el('span', { class: 'netpill' }, 'Offline — kept on this phone, syncs when you have signal')
      : null));
  v.append(addCard);

  v.append(boardTrust());

  const heading = open.length ? open.length + ' to get'
    : (live.entries.length ? 'All done 🎉' : 'Nothing on the list yet');
  const listCard = el('section', { class: 'card' },
    el('h2', { class: 'lead' }, heading));
  const ul = el('ul', { class: 'plain' });
  const renderItem = (e) => {
    const cb = el('input', { type: 'checkbox', 'data-fkey': 'chk:' + e.id,
      onchange: async () => {
        try { await D.toggleDone(live.boardId, e.id, cb.checked); savedFlag(); }
        catch (err) { cb.checked = !cb.checked; toast(friendly(err), 4500); }
      } });
    cb.checked = !!e.done;
    const cls = [e.done ? 'done' : '', e.id === flashId ? 'flash' : ''].filter(Boolean).join(' ');
    return el('li', cls ? { class: cls } : null,
      el('label', {}, cb, e.body),
      (own || (user && e.creatorUid === user.uid))
        // A distinct name per row: twenty buttons all reading "Remove item"
        // tell a screen-reader user nothing about which one destroys what.
        ? el('button', { class: 'btn icon noprint', type: 'button',
            'aria-label': 'Remove ' + e.body, 'data-fkey': 'rm:' + e.id,
            onclick: () => removeItem(e) }, '✕')
        : null);
  };
  for (const e of items) ul.append(renderItem(e));
  if (live.entries.length === 0) {
    listCard.append(el('div', { class: 'empty' },
      el('div', { class: 'glyph', 'aria-hidden': 'true' }, '🧺'),
      el('h3', {}, 'Nothing here yet'),
      el('p', {}, 'Type the first thing in the box above. It lands on everyone’s phone straight away — ' +
        'and it keeps working in the aisle where your signal does not.'),
      own ? el('button', { class: 'btn noprint', type: 'button',
        onclick: () => copyText(shareUrl(live.code, baseUrl()), 'Link copied — text it once, done forever') },
        'Copy the link to share') : null));
  }
  listCard.append(ul);

  /* Everything that changes as items get ticked off lives BELOW the rows.
     Anything above them — a count, a banner, a hint — would push the whole
     list down the instant the first box was ticked, which is the same defect
     wearing a different hat. */
  if (done.length) listCard.append(el('p', { class: 'sub incart' },
    done.length + (done.length === 1 ? ' item in the cart' : ' items in the cart') +
    ' — ticked off, still listed where you left it.'));

  const foot = el('div', { class: 'listfoot row noprint' });
  if (done.length && own) {
    foot.append(el('button', { class: 'btn', type: 'button', 'data-fkey': 'clear',
      onclick: () => clearChecked(done) }, 'Clear checked (' + done.length + ')'));
  }
  // 200 items is 14,000px of scroll; the only add field is at the very top.
  if (items.length > 10) {
    foot.append(el('button', { class: 'btn', type: 'button', 'data-fkey': 'totop',
      onclick: () => {
        const i = addInput();
        if (!i) return;
        i.scrollIntoView({ block: 'center' });
        i.focus();
      } }, 'Add another item'));
  }
  if (foot.childNodes.length) listCard.append(foot);
  // Tomasz checked four things off and then found the app had quietly removed
  // every control he might tidy up with, and said nothing about why.
  if (done.length && !own) {
    listCard.append(el('p', { class: 'hint listfoot' },
      'Anything you added, you can remove. Emptying the cart is the job of whoever started the list — ' +
      'untick something if you put it back on the shelf.'));
  }
  const used = typeof b.entryCount === 'number' ? b.entryCount : null;
  if (own && used !== null && used >= 440) {
    listCard.append(el('p', { class: 'warn listfoot' },
      'This list has used ' + used + ' of its 500 lifetime item slots. ' +
      'Clearing checked items gives them back.'));
  }
  v.append(listCard);

  const share = el('details', Object.assign({ class: 'manage noprint',
    ontoggle: (ev) => { shareOpen = ev.target.open; } }, shareOpen ? { open: '' } : null),
    el('summary', { 'data-fkey': 'share' }, 'Share with the household'));
  const inner = el('div', { class: 'inner' },
    el('div', { class: 'sharecode', text: live.code }),
    el('div', { class: 'row' },
      // Add stays the board's only primary; inside the panel these are peers.
      el('button', { class: 'btn', type: 'button',
        onclick: () => copyText(shareUrl(live.code, baseUrl()), 'Link copied — text it once, done forever') }, 'Copy link'),
      el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'),
      // For the household member who will never open a link.
      el('button', { class: 'btn', type: 'button',
        onclick: () => copyText(listAsText(b, items), 'List copied as text — paste it into the family chat') },
        'Copy as text')),
    trustNote('Whoever you send this to just opens it.'));
  if (own) inner.append(el('div', { class: 'row listfoot' },
    el('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!confirm('Rotate the link? The old one stops working for everyone.')) return;
      try { const code = await D.rotateCode(live.boardId, live.code);
        live.code = code; location.hash = '#/b/' + code; toast('New link ready'); }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Rotate link'),
    // .danger is a border and a hover state, not colour alone.
    el('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!confirm('Delete the whole list for everyone?')) return;
      try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Delete list')));
  share.append(inner);
  v.append(share);

  // One short live announcement per change, instead of aria-live on #view
  // re-reading the entire board every time a family member checks something off.
  const status = open.length ? open.length + ' to get'
    : (live.entries.length ? 'All done' : 'List is empty');
  const sr = $('listStatus');
  if (sr.textContent !== status) sr.textContent = status;

  v.style.minHeight = '';
  if (window.scrollY !== heldScroll) window.scrollTo(0, heldScroll);

  if (keepFocus) {
    const again = v.querySelector('[data-fkey="' + keepFocus.replace(/"/g, '\\"') + '"]');
    if (again) {
      again.focus();
      if (caret && again.setSelectionRange) {
        try { again.setSelectionRange(caret[0], caret[1]); } catch (e) {}
      }
    }
  }
}

function showQR() {
  const url = shareUrl(live.code, baseUrl());
  // The QR path was empty for anyone not looking at the screen: the canvas
  // carries the URL as its name, and the URL is also selectable text below it.
  $('qrCanvas').setAttribute('aria-label', 'QR code for ' + url);
  $('qrUrl').textContent = url;
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

  // Connectivity was invisible: no listener anywhere, and the only signal the
  // app ever gave was an error toast. Now the state is on screen, and coming
  // back online retries a list that failed to open in the dead zone.
  window.addEventListener('online', () => { toast('Back online — syncing'); render(); });
  window.addEventListener('offline', () => { drawBoard(); });
}

function render() {
  normalizeHash();
  const r = route();
  if (r.view === 'board') renderBoard(r.code);
  else if (r.view === 'badcode') renderBadCode();
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
