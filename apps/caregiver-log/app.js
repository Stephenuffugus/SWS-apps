// Caregiver Log — Engine 1, skin C. A calm shared family notebook.
// Same engine: slots are coverage days, claims are "I'll be there",
// entries are the timeline (note / appointment / medication / question).
// Tone matters here: plain language, no confetti, nothing loud.
// All user data reaches the DOM via textContent — never innerHTML.
import { normalizeCode, shareUrl } from './helpers.js';
import * as D from './data.js';
import { firebaseConfig } from './firebase-config.js';

D.initFirebase(firebaseConfig);

const CONFIG = {
  // Stripe payment link for the tip jar — button stays hidden while empty.
  tipUrl: 'https://buy.stripe.com/eVq7sM0rf1yTcPX1XH7EQ03',
};

const TYPE_LABEL = {
  note: 'Note', appointment: 'Appointment', medication: 'Medication', question: 'Question',
};

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
/* `action` turns the toast into the app's undo affordance: {label, onAction}.
   Destructive things in a caregiver log are never worth a one-tap regret. */
function toast(msg, ms, action) {
  const t = $('toast');
  t.replaceChildren(document.createTextNode(msg));
  t.classList.toggle('act', !!action);
  if (action) {
    t.append(el('button', {
      class: 'undo', type: 'button',
      onclick: () => { hideToast(); action.onAction(); },
    }, action.label));
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 2400);
}
function hideToast() { $('toast').classList.remove('show'); }

/* A small, permanent live region. `<main>` used to carry aria-live, which made
   every remote snapshot re-announce the whole page. */
function announce(msg) { const n = $('viewStatus'); if (n) n.textContent = msg; }

function showDlg(d) {
  try { d.showModal(); }
  catch (e) { d.setAttribute('open', ''); d.setAttribute('aria-modal', 'true'); }
}
function closeDlg(d) {
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
  d.removeAttribute('aria-modal');
}

/* Every long-lived control on the board carries a stable data-fk so keyboard
   focus survives the full re-render a sibling's edit triggers. */
function focusKey() {
  const a = document.activeElement;
  return (a && a.dataset && a.dataset.fk) || null;
}
function restoreFocus(root, key) {
  if (!key) return;
  let target = null;
  try { target = root.querySelector('[data-fk="' + CSS.escape(key) + '"]'); } catch (e) {}
  if (target) target.focus();
}

function lockIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) svg.setAttribute(k, v);
  const rect = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: '4', y: '10.5', width: '16', height: '9.5', rx: '2' })) rect.setAttribute(k, v);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M8 10.5V7a4 4 0 0 1 8 0v3.5');
  svg.append(rect, path);
  return svg;
}
/* The promise as an object, not as grey copy at the bottom of the page. */
function trustStamp(extraClass) {
  return el('div', { class: 'trustrow' + (extraClass ? ' ' + extraClass : '') },
    el('div', { class: 'trust' }, lockIcon(),
      el('span', {}, el('b', {}, 'Private by design.'),
        ' No accounts for family, no ads, no subscription — ever.')));
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
  if (String(code).includes('permission-denied')) return 'That didn’t save — the log may be locked, or that day is covered.';
  if (String(code).includes('unavailable')) return 'You look offline — it will sync when you reconnect.';
  return 'Something went wrong. Try again?';
}

/* ---------- state ---------- */
let user = null;
const NAME_KEY = 'cl-myname';
const myName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
const saveName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} };

/* A half-written note must survive a reload, not just a redraw. */
const draftKey = () => 'cl-draft-' + (live.boardId || '');
const loadDraft = () => { try { return localStorage.getItem(draftKey()) || ''; } catch (e) { return ''; } };
const saveDraft = (v) => {
  try { if (v) localStorage.setItem(draftKey(), v); else localStorage.removeItem(draftKey()); }
  catch (e) {}
};

/* Deleting an entry is soft for 10 seconds: it vanishes from the board at
   once, but the Firestore write only happens when the undo window closes. */
const pendingDelete = new Map(); // entryId -> timer
function commitDelete(id) {
  const t = pendingDelete.get(id);
  if (t) clearTimeout(t);
  pendingDelete.delete(id);
  D.deleteEntry(live.boardId, id).catch((err) => { toast(friendly(err), 4500); drawBoard(); });
}
function softDeleteEntry(e) {
  if (pendingDelete.has(e.id)) return;
  pendingDelete.set(e.id, setTimeout(() => commitDelete(e.id), 10000));
  drawBoard();
  toast('Entry removed', 10000, {
    label: 'Undo',
    onAction: () => {
      clearTimeout(pendingDelete.get(e.id));
      pendingDelete.delete(e.id);
      drawBoard();
      toast('Kept — nothing was deleted');
    },
  });
}
const visibleEntries = () => live.entries.filter((e) => !pendingDelete.has(e.id));
window.addEventListener('pagehide', () => { for (const id of [...pendingDelete.keys()]) commitDelete(id); });

let manageOpen = false;   // the disclosure must not slam shut on every snapshot
let lastSavedAt = null;   // powers the persistent "saved" line under the composer

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
    ? 'Made with <a href="./">Caregiver Log</a> — free, no ads. <a href="./">Start yours</a>'
    : o.dataset.home;
}

async function renderHome() {
  setGrowthFooter(false);
  live.stop();
  const v = $('view');
  v.replaceChildren();

  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'One calm place for the whole family'),
    el('p', {}, 'Appointments, medication changes, questions for the doctor, who’s covering which day — written down once, where every sibling can see it. It opens in any browser, on whatever phone your brother has.'),
    el('button', { class: 'btn primary big', type: 'button', onclick: startCreate }, 'Start a care log'),
    trustStamp(),
  ));

  const codeInput = el('input', {
    type: 'text', placeholder: 'ABC123', maxlength: '8', autocomplete: 'off',
    class: 'codeinput', 'aria-label': 'Invite code',
    onkeydown: (ev) => { if (ev.key === 'Enter') openBtn.click(); },
  });
  const openBtn = el('button', {
    class: 'btn fit', type: 'button',
    onclick: () => {
      const c = normalizeCode(codeInput.value);
      if (!c) { toast('Codes are 6 letters and numbers — ask whoever invited you'); return; }
      location.hash = '#/b/' + c;
    },
  }, 'Open');
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Were you given a code?'),
    el('div', { class: 'row' }, codeInput, openBtn),
    el('p', { class: 'sub rowhint', text: 'A family member started a log and invited you. If they sent a link, just tap it.' })));

  if (user && !D.isAnon(user)) {
    const sec = el('section', { class: 'card' }, el('h2', {}, 'Your logs'));
    const list = el('ul', { class: 'plain' });
    // A held reference, not `sec.lastChild` — positional DOM surgery removed
    // the wrong node the moment anything else was appended to this card.
    const status = el('p', { class: 'sub', role: 'status', text: 'Loading…' });
    sec.append(list, status);
    v.append(sec);
    try {
      const boards = (await D.myBoards(user.uid)).filter(b => b.skin === 'care');
      status.remove();
      if (boards.length === 0) {
        sec.append(el('div', { class: 'empty' },
          el('div', { class: 'glyph', 'aria-hidden': 'true' }, '📓'),
          el('h3', {}, 'No logs yet'),
          el('p', {}, 'Start one for the person you’re caring for — you can invite the rest of the family in a minute.'),
          el('button', { class: 'btn primary', type: 'button', onclick: startCreate }, 'Start a care log')));
      }
      for (const b of boards) {
        list.append(el('li', {},
          el('div', { class: 'grow' },
            el('div', { text: b.title }),
            el('div', { class: 'sub', text: 'Code ' + b.shareCode + (b.settings?.locked ? ' · locked' : '') })),
          el('button', {
            class: 'btn small', type: 'button', 'aria-label': 'Open the log for ' + b.title,
            onclick: () => { location.hash = '#/b/' + b.shareCode; },
          }, 'Open')));
      }
    } catch (e) {
      status.textContent = 'Couldn’t load your logs: ' + friendly(e);
      status.className = 'warn';
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
    announce('Opening the log');
    v.replaceChildren(el('p', { class: 'sub', text: 'Opening the log…' }));
    try { await D.ensureSignedIn(); }
    catch (e) {
      announce('Could not connect');
      v.replaceChildren(el('p', { class: 'warn', text: 'Couldn’t connect. Check your internet and reload.' }));
      return;
    }
    const boardId = await D.resolveCode(code).catch(() => null);
    if (!boardId) {
      announce('That log does not exist');
      v.replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'warn', text: 'That log doesn’t exist — the invite may have been rotated.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    live.boardId = boardId; live.code = code;
    composeDraft = loadDraft();
    lastSavedAt = null;
    announce('Log open');
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

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

function entryDate(e) {
  try { return e.createdAt && e.createdAt.toDate ? e.createdAt.toDate() : null; }
  catch (err) { return null; }
}
function dayKey(d) {
  if (!d) return 'Just now';
  // logs span years — a doctor reading the printout needs the year once it differs
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}
function timeOf(d) {
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

function drawBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  setGrowthFooter(!own);
  const locked = !!b.settings?.locked;
  const v = $('view');
  const keepFocus = focusKey();
  v.replaceChildren();

  // --- title + disclaimer ---
  const head = el('section', { class: 'card' });
  head.append(el('div', { class: 'boardhead' },
    el('h2', { class: 'boardtitle', text: 'Caring for ' + b.title }),
    own ? el('span', { class: 'badge', text: 'you started this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub boarddesc', text: b.description }));

  // Print has one home for both roles now — it used to hide inside the owner's
  // collapsed disclosure and sit in a trailing card for everyone else.
  const headActions = el('div', { class: 'row noprint actions' });
  if (own) {
    headActions.append(el('button', {
      class: 'btn primary', type: 'button', 'data-fk': 'copylink',
      onclick: () => copyText(shareUrl(live.code, baseUrl()), 'Invite link copied — send it to one person at a time'),
    }, 'Copy invite link'));
  }
  headActions.append(el('button', {
    class: 'btn', type: 'button', 'data-fk': 'print',
    onclick: () => window.print(),
  }, 'Print for a doctor visit'));
  head.append(headActions);
  // noprint: the invite code must never ride along on a page handed to a clinic.
  if (own) head.append(el('p', { class: 'sub rowhint noprint', text: 'Invite code ' + live.code + ' — the QR code, settings and the rest are in “Invite family & settings” below.' }));

  head.append(el('p', { class: 'disclaimer', text: 'This is a shared family notebook — not a medical record, and not medical advice. It isn’t covered by HIPAA.' }));
  head.append(trustStamp('noprint'));
  v.append(head);

  if (locked) v.append(el('div', { class: 'banner', text: own
    ? 'The log is locked — family can read but not write. Unlock it in Settings.'
    : 'The log is locked for now — you can read everything.' }));
  if (!navigator.onLine) v.append(el('div', { class: 'banner', text: 'You’re offline — you can read the log; new notes will sync when you’re back.' }));

  // --- who's covering ---
  // The rota is deliberately screen-only: both print buttons promise "the
  // timeline for a doctor visit", and the doctor's page should be that.
  const covCard = el('section', { class: 'card noprint' }, el('h2', {}, 'Who’s there, and when'));
  if (live.slots.length === 0) {
    covCard.append(own
      ? el('div', { class: 'empty' },
        el('div', { class: 'glyph', 'aria-hidden': 'true' }, '🗓️'),
        el('h3', {}, 'No coverage days yet'),
        el('p', {}, 'Add the week so nobody has to ask “who’s with her Tuesday?” in the group text again.'),
        el('button', { class: 'btn primary', type: 'button', 'data-fk': 'addweek', onclick: addWeek }, 'Add the next 7 days'))
      : el('div', { class: 'empty' },
        el('div', { class: 'glyph', 'aria-hidden': 'true' }, '🗓️'),
        el('h3', {}, 'No coverage days yet'),
        el('p', {}, 'Ask whoever started this log to add the week — the days will show up here as soon as they do.')));
  }
  for (const s of live.slots) covCard.append(renderCoverageDay(s, own, locked));
  if (own && live.slots.length) {
    covCard.append(el('div', { class: 'row noprint actions' },
      el('button', { class: 'btn', type: 'button', 'data-fk': 'addweek', onclick: addWeek }, 'Add the next 7 days'),
      el('button', { class: 'btn', type: 'button', 'data-fk': 'addday', onclick: addCustomDay }, 'Add one day/shift')));
  }
  v.append(covCard);

  // --- timeline ---
  v.append(renderTimeline(b, own, locked));

  // --- invite & settings (owner) ---
  if (own) v.append(renderManage(b));

  // --- print view (chronological for the doctor) ---
  v.append(renderPrintTimeline(b));

  restoreFocus(v, keepFocus);
}

function renderCoverageDay(s, own, locked) {
  const claims = live.claims.get(s.id) || [];
  const mine = user && claims.find(c => c.uid === user.uid);
  const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
  const box = el('div', { class: 'slot' });
  const top = el('div', { class: 'top' },
    el('span', { class: 'label', text: s.label }),
    el('span', { class: 'count ' + (left === 0 ? 'covered' : 'needed'), text: left === 0 ? 'Covered' : 'Needs someone' }));
  // Repeated controls name their own row — a screen reader listing buttons used
  // to get N identical "Edit day"s.
  if (own) top.append(el('button', {
    class: 'btn icon noprint', type: 'button',
    'aria-label': 'Edit ' + s.label, 'data-fk': 'edit-' + s.id,
    onclick: () => openSlotDlg(s),
  }, '✎'));
  box.append(top);
  const chips = el('div', { class: 'chips' });
  for (const c of claims) {
    const isMine = user && c.uid === user.uid;
    const chip = el('span', { class: 'chip' + (isMine ? ' mine' : '') },
      c.name + (isMine ? ' (you)' : '') + (c.note ? ' · ' + c.note : ''));
    if ((isMine && !locked) || own) chip.append(el('button', {
      type: 'button', class: 'noprint', 'data-fk': 'rm-' + s.id + '-' + c.uid,
      'aria-label': 'Take ' + (isMine ? 'yourself' : c.name) + ' off ' + s.label,
      onclick: async () => {
        try {
          if (isMine) await D.releaseClaim(live.boardId, s.id);
          else await D.ownerRemoveClaim(live.boardId, s.id, c.uid);
          toast(isMine ? 'Taken off ' + s.label : c.name + ' taken off ' + s.label, 4000);
        } catch (e) { toast(friendly(e), 4500); }
      },
    }, '✕'));
    chips.append(chip);
  }
  if (claims.length) box.append(chips);
  if (!mine && left > 0 && !locked) {
    box.append(el('div', { class: 'noprint claimrow' },
      el('button', {
        class: 'btn', type: 'button',
        'aria-label': 'I can be there — ' + s.label, 'data-fk': 'claim-' + s.id,
        onclick: () => openClaim(s),
      }, 'I can be there')));
  }
  return box;
}

async function addWeek() {
  const rows = [];
  const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    rows.push({ label: fmt.format(d), capacity: 1 });
    d.setDate(d.getDate() + 1);
  }
  try { await addSlotsChecked(rows); } catch (e) { toast(friendly(e), 4500); }
}

/* Reuses #slotDlg in "add" mode rather than a native prompt() — unlabelled,
   unstyled, and suppressible by the browser. */
function addCustomDay() { openSlotDlg(null); }

async function addSlotsChecked(rows) {
  if (live.slots.length + rows.length > 100) {
    toast('The coverage list is full — remove old weeks first.', 5000);
    return;
  }
  let order = live.slots.reduce((m, s) => Math.max(m, s.order || 0), 0);
  rows.forEach((r, i) => { r.order = order + i + 1; });
  await D.addSlots(live.boardId, rows);
  toast(rows.length === 1 ? 'Added' : 'Week added');
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

/* ---------- timeline ---------- */
let composeType = 'note';
let composeDraft = '';       // survives the redraws that live snapshots trigger —
let composeFocused = false;  // a sibling's edit must never erase a half-written note
function saveLineText() {
  if (composeDraft) return 'Draft kept on this device — closing the page won’t lose it.';
  if (lastSavedAt) return 'Saved to the log at ' + timeOf(lastSavedAt);
  return '';
}

function renderTimeline(b, own, locked) {
  // The whole card is screen-only: its contents are the composer, the type
  // picker and the newest-first list, none of which belong on the printed page.
  // Without this it printed as a box containing the word "THE LOG".
  const card = el('section', { class: 'card screenonly' }, el('h2', {}, 'The log'));
  let bodyIn = null;

  if (!locked) {
    // aria-pressed rather than a radiogroup: it needs no roving tabindex and it
    // still tells a screen-reader user which kind of entry they are filing.
    const seg = el('div', { class: 'seg noprint', role: 'group', 'aria-label': 'Entry type' },
      ...Object.entries(TYPE_LABEL).map(([k, label]) =>
        el('button', {
          type: 'button', class: k === composeType ? 'active' : '',
          'aria-pressed': k === composeType ? 'true' : 'false',
          'data-fk': 'seg-' + k,
          onclick: () => { composeType = k; drawBoard(); },
        }, label)));
    const nameIn = el('input', { type: 'text', placeholder: 'Your first name', maxlength: '60', value: myName(), 'aria-label': 'Your name' });
    const saveLine = el('p', { class: 'saveline' + (saveLineText() ? '' : ' hidden'), text: saveLineText() });
    bodyIn = el('textarea', {
      maxlength: '2000',
      placeholder: composeType === 'appointment' ? 'Dr. Reyes, cardiology — Tuesday 10am. Needs the med list.'
        : composeType === 'medication' ? 'Started 5mg lisinopril, mornings. Watch for dizziness.'
        : composeType === 'question' ? 'Ask about the swelling in her ankles at the next visit?'
        : 'She was in good spirits today. Ate a full lunch.',
      oninput: (ev) => {
        composeDraft = ev.target.value;
        saveDraft(composeDraft);
        saveLine.textContent = saveLineText();
        saveLine.classList.toggle('hidden', !saveLineText());
      },
      onfocus: () => { composeFocused = true; },
      onblur: () => { composeFocused = false; },
    });
    bodyIn.value = composeDraft;
    const addBtn = el('button', { class: 'btn primary', type: 'button', 'data-fk': 'addentry',
      onclick: async () => {
        const name = nameIn.value.trim(), body = bodyIn.value.trim();
        if (!name || !body) { toast('Add your name and the note'); return; }
        saveName(name);
        try {
          const status = await D.addEntry(live.boardId, b, { authorName: name, body, type: composeType });
          composeDraft = '';
          saveDraft('');
          bodyIn.value = '';
          lastSavedAt = new Date();
          toast(status === 'pending'
            ? 'Saved — it will appear for the family once you approve it'
            : 'Saved to the log', 4000);
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add to the log');
    card.append(seg, el('div', { class: 'noprint' },
      el('label', { class: 'f' }, el('span', {}, 'Your name'), nameIn),
      // A stable visible label. The aria-label used to change under the user
      // every time the type picker moved.
      el('label', { class: 'f' }, el('span', {}, 'What happened?'), bodyIn),
      el('div', { class: 'claimrow' }, addBtn),
      saveLine));
    if (composeFocused) requestAnimationFrame(() => {
      bodyIn.focus();
      bodyIn.setSelectionRange(bodyIn.value.length, bodyIn.value.length);
    });
  }

  const entries = visibleEntries();
  if (entries.length === 0) {
    card.append(el('div', { class: 'empty' },
      el('div', { class: 'glyph', 'aria-hidden': 'true' }, '📝'),
      el('h3', {}, 'Nothing written down yet'),
      el('p', {}, 'Everything the family writes lands here, newest first — so the sibling who lives far away is as caught up as the one in the next room.'),
      locked || !bodyIn ? null : el('button', {
        class: 'btn primary', type: 'button',
        onclick: () => { bodyIn.focus(); bodyIn.scrollIntoView({ block: 'center' }); },
      }, 'Write the first note')));
    return card;
  }

  const byDay = el('div', { class: 'screenonly' });
  let lastDay = null;
  for (const e of entries) {
    const d = entryDate(e);
    const key = dayKey(d);
    if (key !== lastDay) { byDay.append(el('div', { class: 'dayhead', text: key })); lastDay = key; }
    byDay.append(renderEntry(e, own));
  }
  card.append(byDay);
  return card;
}

function renderEntry(e, own) {
  const mineE = user && e.creatorUid === user.uid;
  const d = entryDate(e);
  const row = el('div', { class: 'entry' },
    el('div', { class: 'meta' },
      el('span', { class: 'who', text: e.authorName }),
      e.type !== 'note' ? el('span', { class: 'badge t-' + e.type, text: TYPE_LABEL[e.type] || e.type }) : null,
      el('span', { class: 'when', text: timeOf(d) }),
      e.status === 'pending' ? el('span', { class: 'badge pending', text: 'awaiting approval' }) : null),
    el('div', { class: 'body', text: e.body }));
  // Both names carry the author and the time, so a list of buttons in a screen
  // reader is not N identical "Delete entry"s.
  const who = e.authorName + (d ? ' at ' + timeOf(d) : '');
  const actions = el('span', { class: 'entry-actions noprint' });
  if (own && e.status === 'pending') actions.append(el('button', {
    class: 'btn icon', type: 'button',
    'aria-label': 'Approve the entry by ' + who, 'data-fk': 'approve-' + e.id,
    onclick: () => D.updateEntry(live.boardId, e.id, { status: 'ok' })
      .then(() => toast('Approved — the family can see it now', 4000))
      .catch(err => toast(friendly(err), 4500)),
  }, '✓'));
  if (own || mineE) actions.append(el('button', {
    class: 'btn icon danger', type: 'button',
    'aria-label': 'Remove the entry by ' + who, 'data-fk': 'delete-' + e.id,
    // Soft delete with an Undo toast. A mis-tap used to lose a medication note
    // permanently behind a single native confirm().
    onclick: () => softDeleteEntry(e),
  }, '✕'));
  if (actions.childNodes.length) row.firstChild.append(actions);
  return row;
}

/* Chronological (oldest-first) version rendered only when printing — a
   timeline a doctor can read top to bottom. */
function renderPrintTimeline(b) {
  const box = el('section', { class: 'card printonly' });
  box.append(el('h2', {}, 'Timeline — ' + b.title));
  const all = visibleEntries();
  const asc = [...all].filter(e => e.status === 'ok').reverse();
  const withheld = all.length - asc.length;
  box.append(el('p', { class: 'printmeta', text:
    'Printed ' + new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
    + (withheld ? ' · ' + withheld + ' entr' + (withheld === 1 ? 'y is' : 'ies are') + ' still awaiting approval and not shown' : '') }));
  if (asc.length === 0) box.append(el('p', {}, 'Nothing has been written in this log yet.'));
  let lastDay = null;
  for (const e of asc) {
    const d = entryDate(e);
    const key = dayKey(d);
    if (key !== lastDay) { box.append(el('div', { class: 'dayhead', text: key })); lastDay = key; }
    box.append(el('div', { class: 'entry' },
      el('div', { class: 'meta' },
        el('span', { class: 'who', text: e.authorName }),
        el('span', { text: (TYPE_LABEL[e.type] || 'Note') + ' · ' + timeOf(d) })),
      el('div', { class: 'body', text: e.body })));
  }
  box.append(el('p', { class: 'disclaimer', text: 'Family-kept notebook. Not a medical record.' }));
  return box;
}

/* ---------- owner manage ---------- */
function renderManage(b) {
  const url = shareUrl(live.code, baseUrl());
  // The summary carries the heading so the panel's own headings are not
  // orphaned h2s that vanish from heading navigation while it is collapsed.
  const wrap = el('details', {
    class: 'manage noprint',
    ...(manageOpen ? { open: '' } : {}),
    ontoggle: (ev) => { manageOpen = ev.target.open; },
  }, el('summary', { 'data-fk': 'manage' }, el('h2', {}, 'Invite family & settings')));
  const inner = el('div', { class: 'inner' });
  wrap.append(inner);

  inner.append(el('h3', {}, 'Invite family'),
    el('div', { class: 'sharecode', text: live.code }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'button', 'data-fk': 'copylink2', onclick: () => copyText(url, 'Invite link copied — send it to one person at a time') }, 'Copy invite link'),
      el('button', { class: 'btn', type: 'button', 'data-fk': 'qr', onclick: showQR }, 'QR code')),
    el('p', { class: 'sub rowhint', text: 'Share deliberately — everyone with the link can read and write. If a link gets loose, rotate it below and the old one dies instantly.' }));

  inner.append(el('h3', {}, 'Settings'));
  const s = b.settings || {};
  inner.append(
    el('div', { class: 'settings' },
      el('label', {},
        el('input', { type: 'checkbox', 'data-fk': 'approval', ...(s.approvalRequired ? { checked: '' } : {}),
          onchange: (ev) => D.setApproval(live.boardId, s, ev.target.checked)
            .then(() => toast(ev.target.checked ? 'New entries now need your approval' : 'Entries post instantly', 4000))
            .catch(e => toast(friendly(e), 4500)) }),
        el('span', {}, 'Require my approval for new entries')),
      el('label', {},
        el('input', { type: 'checkbox', 'data-fk': 'locked', ...(s.locked ? { checked: '' } : {}),
          onchange: (ev) => D.setLocked(live.boardId, s, ev.target.checked)
            .then(() => toast(ev.target.checked ? 'Locked — the log is read-only' : 'Unlocked', 4000))
            .catch(e => toast(friendly(e), 4500)) }),
        el('span', {}, 'Lock the log (read-only)'))),
    el('div', { class: 'row' },
      el('button', { class: 'btn', type: 'button', 'data-fk': 'rotate', onclick: async () => {
        if (!confirm('Rotate the invite link? Anyone using the old one loses access instantly.')) return;
        try { const code = await D.rotateCode(live.boardId, live.code);
          live.code = code; location.hash = '#/b/' + code; toast('New invite link ready — the old one no longer works', 5000); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Rotate invite')));

  inner.append(el('h3', {}, 'Name & details'));
  const ti = el('input', { type: 'text', value: b.title, maxlength: '100' });
  const de = el('input', { type: 'text', value: b.description || '', maxlength: '1000', placeholder: 'Care team contact, pharmacy, door code…' });
  inner.append(
    el('label', { class: 'f' }, el('span', {}, 'Who the log is for'), ti),
    el('label', { class: 'f' }, el('span', {}, 'Details'), de),
    el('button', { class: 'btn', type: 'button', 'data-fk': 'savedetails', onclick: () => {
      const title = ti.value.trim();
      if (!title) { toast('A first name is plenty'); return; }
      D.updateBoard(live.boardId, { title: title.slice(0, 100), description: de.value.slice(0, 1000) })
        .then(() => toast('Saved', 4000)).catch(e => toast(friendly(e), 4500));
    } }, 'Save'));

  // The one irreversible action gets its own fenced ground instead of sitting
  // beside "Rotate invite" at the same size and shape.
  inner.append(el('div', { class: 'dangerzone' },
    el('h3', {}, 'Delete this log'),
    el('p', {}, 'This removes the whole family’s record for everyone, permanently. Print the timeline first if anyone might still need it.'),
    el('button', { class: 'btn danger', type: 'button', 'data-fk': 'deletelog', onclick: async () => {
      if (!confirm('Delete the whole log for everyone? This can’t be undone. Consider printing it first.')) return;
      if (!confirm('Last check: delete “' + b.title + '” and everything written in it, for every family member?')) return;
      try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; toast('Log deleted', 5000); }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Delete log')));
  return wrap;
}

let slotEditing = null;   // null = the dialog is adding a new day
function openSlotDlg(s) {
  slotEditing = s;
  $('slotDlgTitle').textContent = s ? 'Edit coverage day' : 'Add a day or shift';
  $('slotLabel').value = s ? s.label : '';
  $('slotCap').value = s ? String(s.capacity) : '1';
  $('slotDeleteRow').classList.toggle('hidden', !s);
  showDlg($('slotDlg'));
  $('slotLabel').focus();
}

function showQR() {
  const url = shareUrl(live.code, baseUrl());
  // The invite URL is also readable text, so the dialog is not a blank square
  // to anyone using a screen reader or a phone that cannot scan its own screen.
  $('qrUrl').value = url;
  let ok = false;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url); qr.make();
    // 300 is fixed in BOTH the canvas attributes and this maths. Change neither
    // alone: the drawing never reads canvas.width.
    const canvas = $('qrCanvas'), size = 300, count = qr.getModuleCount();
    const cell = Math.floor(size / (count + 8));
    const off = Math.floor((size - cell * count) / 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    ok = true;
  } catch (e) { /* canvas or the encoder is unavailable — say so */ }
  $('qrError').classList.toggle('hidden', ok);
  $('qrBox').classList.toggle('hidden', !ok);
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
    try {
      await D.startEmailLink(email, baseUrl());
      const sent = $('emailSent');
      sent.classList.remove('hidden');
      sent.focus();   // role=status alone does not move anyone to the message
    }
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
    if (!name) { toast('Just your first name'); return; }
    saveName(name);
    closeDlg($('nameDlg'));
    try {
      const r = await D.claimSlot(live.boardId, claimTarget.id, name, $('noteInput').value);
      toast(r === 'note-dropped'
        ? 'You’re on for ' + claimTarget.label + '. (Your note couldn’t attach — setup needs a refresh.)'
        : 'You’re on for ' + claimTarget.label, r === 'note-dropped' ? 6000 : 2400);
    } catch (e) { toast(friendly(e), 4500); }
  });
  $('nameCancel').addEventListener('click', () => closeDlg($('nameDlg')));
  $('nameInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('nameOk').click(); });

  $('slotSave').addEventListener('click', async () => {
    const label = $('slotLabel').value.trim();
    const cap = Math.min(Math.max(parseInt($('slotCap').value, 10) || 1, 1), 999);
    if (!label) { toast('The day needs a label'); return; }
    if (!slotEditing) {   // add mode — same dialog, no native prompt()
      closeDlg($('slotDlg'));
      try { await addSlotsChecked([{ label: label.slice(0, 120), capacity: cap }]); }
      catch (e) { toast(friendly(e), 4500); }
      return;
    }
    if (cap < (slotEditing.claimedCount || 0)) { toast('Can’t go below who’s already committed'); return; }
    try {
      await D.updateSlot(live.boardId, slotEditing.id, { label: label.slice(0, 120), capacity: cap });
      closeDlg($('slotDlg'));
      toast('Saved', 4000);
    } catch (e) { toast(friendly(e), 4500); }
  });
  $('slotDelete').addEventListener('click', async () => {
    if (!slotEditing) return;
    if (!confirm('Remove “' + slotEditing.label + '” from the coverage list? Anyone who signed up for it loses that day.')) return;
    try { await D.deleteSlot(live.boardId, slotEditing.id); closeDlg($('slotDlg')); toast('Day removed', 4000); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotCancel').addEventListener('click', () => closeDlg($('slotDlg')));
  $('slotLabel').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('slotSave').click(); });
  $('qrClose').addEventListener('click', () => closeDlg($('qrDlg')));
  $('qrCopy').addEventListener('click', () => copyText($('qrUrl').value, 'Invite link copied — send it to one person at a time'));

  $('createOk').addEventListener('click', async () => {
    const title = $('createTitle').value.trim();
    if (!title) { toast('A first name is plenty'); return; }
    closeDlg($('createDlg'));
    try {
      const { code } = await D.createBoard({ title, description: $('createDesc').value.trim() });
      location.hash = '#/b/' + code;
      toast('The log is ready — invite family when you are');
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
