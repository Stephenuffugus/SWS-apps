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
  if (String(code).includes('permission-denied')) return 'That didn’t save — the log may be locked, or that day is covered.';
  if (String(code).includes('unavailable')) return 'You look offline — it will sync when you reconnect.';
  return 'Something went wrong. Try again?';
}

/* ---------- state ---------- */
let user = null;
const NAME_KEY = 'cl-myname';
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
async function renderHome() {
  live.stop();
  const v = $('view');
  v.replaceChildren();

  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'One calm place for the whole family'),
    el('p', {}, 'Appointments, medication changes, questions for the doctor, who’s covering which day — written down once, where every sibling can see it. ',
      el('strong', {}, 'No accounts for family members. No ads. Private by design.')),
    el('button', { class: 'btn primary', type: 'button', onclick: startCreate }, 'Start a care log'),
  ));

  const codeInput = el('input', {
    type: 'text', placeholder: 'ABC123', maxlength: '8', autocomplete: 'off',
    style: 'text-transform:uppercase; letter-spacing:.15em; text-align:center',
    'aria-label': 'Invite code',
    onkeydown: (ev) => { if (ev.key === 'Enter') openBtn.click(); },
  });
  const openBtn = el('button', {
    class: 'btn', type: 'button', style: 'flex:0 0 auto',
    onclick: () => {
      const c = normalizeCode(codeInput.value);
      if (!c) { toast('Codes are 6 letters and numbers — ask whoever invited you'); return; }
      location.hash = '#/b/' + c;
    },
  }, 'Open');
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Were you given a code?'),
    el('div', { class: 'row' }, codeInput, openBtn),
    el('p', { class: 'hint', text: 'A family member started a log and invited you. If they sent a link, just tap it.' })));

  if (user && !D.isAnon(user)) {
    const sec = el('section', { class: 'card' }, el('h2', {}, 'Your logs'));
    const list = el('ul', { class: 'plain' });
    sec.append(list, el('p', { class: 'hint', text: 'Loading…' }));
    v.append(sec);
    try {
      const boards = (await D.myBoards(user.uid)).filter(b => b.skin === 'care');
      sec.lastChild.remove();
      if (boards.length === 0) sec.append(el('p', { class: 'hint', text: 'No logs yet.' }));
      for (const b of boards) {
        list.append(el('li', {},
          el('div', { class: 'grow' },
            el('div', { text: b.title }),
            el('div', { class: 'sub', text: 'Code ' + b.shareCode + (b.settings?.locked ? ' · locked' : '') })),
          el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/b/' + b.shareCode; } }, 'Open')));
      }
    } catch (e) {
      sec.lastChild.textContent = 'Couldn’t load your logs: ' + friendly(e);
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
    v.replaceChildren(el('p', { class: 'hint', text: 'Opening the log…' }));
    try { await D.ensureSignedIn(); }
    catch (e) { v.replaceChildren(el('p', { class: 'warn', text: 'Couldn’t connect. Check your internet and reload.' })); return; }
    const boardId = await D.resolveCode(code).catch(() => null);
    if (!boardId) {
      v.replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'warn', text: 'That log doesn’t exist — the invite may have been rotated.' }),
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
  const locked = !!b.settings?.locked;
  const v = $('view');
  v.replaceChildren();

  // --- title + disclaimer ---
  const head = el('section', { class: 'card' });
  head.append(el('div', { style: 'display:flex;align-items:baseline;gap:8px' },
    el('h2', { style: 'all:unset;font-size:1.25rem;font-weight:600;flex:1;overflow-wrap:anywhere', text: 'Caring for ' + b.title }),
    own ? el('span', { class: 'badge', text: 'you started this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub', style: 'margin:6px 0 0', text: b.description }));
  head.append(el('p', { class: 'disclaimer', text: 'This is a shared family notebook — not a medical record, and not medical advice. It isn’t covered by HIPAA.' }));
  v.append(head);

  if (locked) v.append(el('div', { class: 'banner', text: own
    ? 'The log is locked — family can read but not write. Unlock it in Settings.'
    : 'The log is locked for now — you can read everything.' }));
  if (!navigator.onLine) v.append(el('div', { class: 'banner', text: 'You’re offline — you can read the log; new notes will sync when you’re back.' }));

  // --- who's covering ---
  const covCard = el('section', { class: 'card' }, el('h2', {}, 'Who’s there, and when'));
  if (live.slots.length === 0) {
    covCard.append(el('p', { class: 'hint', text: own
      ? 'Add the week below so nobody has to ask “who’s with her Tuesday?” in the group text again.'
      : 'No coverage days have been added yet.' }));
  }
  for (const s of live.slots) covCard.append(renderCoverageDay(s, own, locked));
  if (own) {
    covCard.append(el('div', { class: 'row noprint', style: 'margin-top:10px' },
      el('button', { class: 'btn', type: 'button', onclick: addWeek }, 'Add the next 7 days'),
      el('button', { class: 'btn', type: 'button', onclick: addCustomDay }, 'Add one day/shift')));
  }
  v.append(covCard);

  // --- timeline ---
  v.append(renderTimeline(b, own, locked));

  // --- invite & settings (owner) ---
  if (own) v.append(renderManage(b));

  // --- print view (chronological for the doctor) ---
  v.append(renderPrintTimeline(b));

  if (!own) {
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Print'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print the timeline for a doctor visit'))));
  }
}

function renderCoverageDay(s, own, locked) {
  const claims = live.claims.get(s.id) || [];
  const mine = user && claims.find(c => c.uid === user.uid);
  const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
  const box = el('div', { class: 'slot' });
  const top = el('div', { class: 'top' },
    el('span', { class: 'label', text: s.label }),
    el('span', { class: 'count', text: left === 0 ? 'Covered' : 'Needs someone' }));
  if (own) top.append(el('button', { class: 'btn small noprint', type: 'button', 'aria-label': 'Edit day', onclick: () => openSlotDlg(s) }, '✎'));
  box.append(top);
  const chips = el('div', { class: 'chips' });
  for (const c of claims) {
    const isMine = user && c.uid === user.uid;
    const chip = el('span', { class: 'chip' + (isMine ? ' mine' : '') },
      c.name + (isMine ? ' (you)' : '') + (c.note ? ' · ' + c.note : ''));
    if ((isMine && !locked) || own) chip.append(el('button', {
      type: 'button', 'aria-label': 'Remove ' + c.name, class: 'noprint',
      onclick: async () => {
        try {
          if (isMine) await D.releaseClaim(live.boardId, s.id);
          else await D.ownerRemoveClaim(live.boardId, s.id, c.uid);
          toast(isMine ? 'Taken off that day' : 'Removed');
        } catch (e) { toast(friendly(e), 4500); }
      },
    }, '✕'));
    chips.append(chip);
  }
  if (claims.length) box.append(chips);
  if (!mine && left > 0 && !locked) {
    box.append(el('div', { class: 'noprint', style: 'margin-top:6px' },
      el('button', { class: 'btn small', type: 'button', onclick: () => openClaim(s) }, 'I can be there')));
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

async function addCustomDay() {
  const label = prompt('Label for the day or shift (e.g. “Saturday overnight”):', '');
  if (!label || !label.trim()) return;
  try { await addSlotsChecked([{ label: label.trim().slice(0, 120), capacity: 1 }]); }
  catch (e) { toast(friendly(e), 4500); }
}

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
function renderTimeline(b, own, locked) {
  const card = el('section', { class: 'card' }, el('h2', {}, 'The log'));

  if (!locked) {
    const seg = el('div', { class: 'seg noprint' },
      ...Object.entries(TYPE_LABEL).map(([k, label]) =>
        el('button', { type: 'button', class: k === composeType ? 'active' : '', onclick: () => { composeType = k; drawBoard(); } }, label)));
    const nameIn = el('input', { type: 'text', placeholder: 'Your first name', maxlength: '60', value: myName(), 'aria-label': 'Your name' });
    const bodyIn = el('textarea', {
      maxlength: '2000', 'aria-label': 'New ' + TYPE_LABEL[composeType].toLowerCase(),
      placeholder: composeType === 'appointment' ? 'Dr. Reyes, cardiology — Tuesday 10am. Needs the med list.'
        : composeType === 'medication' ? 'Started 5mg lisinopril, mornings. Watch for dizziness.'
        : composeType === 'question' ? 'Ask about the swelling in her ankles at the next visit?'
        : 'She was in good spirits today. Ate a full lunch.',
      oninput: (ev) => { composeDraft = ev.target.value; },
      onfocus: () => { composeFocused = true; },
      onblur: () => { composeFocused = false; },
    });
    bodyIn.value = composeDraft;
    const addBtn = el('button', { class: 'btn primary', type: 'button',
      onclick: async () => {
        const name = nameIn.value.trim(), body = bodyIn.value.trim();
        if (!name || !body) { toast('Add your name and the note'); return; }
        saveName(name);
        try {
          const status = await D.addEntry(live.boardId, b, { authorName: name, body, type: composeType });
          composeDraft = '';
          bodyIn.value = '';
          toast(status === 'pending' ? 'Saved — waiting for approval' : 'Saved to the log');
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add to the log');
    card.append(seg, el('div', { class: 'noprint' },
      el('label', { class: 'f' }, el('span', {}, 'Your name'), nameIn),
      bodyIn,
      el('div', { style: 'margin-top:8px' }, addBtn)));
    if (composeFocused) requestAnimationFrame(() => {
      bodyIn.focus();
      bodyIn.setSelectionRange(bodyIn.value.length, bodyIn.value.length);
    });
  }

  if (live.entries.length === 0) {
    card.append(el('p', { class: 'hint', text: 'Everything the family writes lands here, newest first — so the sibling who lives far away is as caught up as the one in the next room.' }));
    return card;
  }

  const byDay = el('div', { class: 'screenonly' });
  let lastDay = null;
  for (const e of live.entries) {
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
  const actions = el('span', { style: 'float:right' });
  if (own && e.status === 'pending') actions.append(el('button', {
    class: 'btn small noprint', type: 'button',
    onclick: () => D.updateEntry(live.boardId, e.id, { status: 'ok' }).then(() => toast('Approved')).catch(err => toast(friendly(err))),
  }, '✓'));
  if (own || mineE) actions.append(el('button', {
    class: 'btn small danger noprint', type: 'button', 'aria-label': 'Delete entry', style: 'margin-left:4px',
    onclick: () => {
      if (!confirm('Remove this entry from the log?')) return;
      D.deleteEntry(live.boardId, e.id).catch(err => toast(friendly(err)));
    },
  }, '✕'));
  if (actions.childNodes.length) row.firstChild.append(actions);
  return row;
}

/* Chronological (oldest-first) version rendered only when printing — a
   timeline a doctor can read top to bottom. */
function renderPrintTimeline(b) {
  const box = el('section', { class: 'card printonly' });
  box.append(el('h2', {}, 'Timeline — ' + b.title));
  const asc = [...live.entries].filter(e => e.status === 'ok').reverse();
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
  const wrap = el('details', { class: 'manage noprint' }, el('summary', {}, 'Invite family & settings'));
  const inner = el('div', { class: 'inner' });
  wrap.append(inner);

  inner.append(el('h2', {}, 'Invite family'),
    el('div', { class: 'sharecode', text: live.code }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'button', onclick: () => copyText(url, 'Invite link copied — send it to one person at a time') }, 'Copy invite link'),
      el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code')),
    el('p', { class: 'hint', text: 'Share deliberately — everyone with the link can read and write. If a link gets loose, rotate it below and the old one dies instantly.' }));

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Print'),
    el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print the timeline for a doctor visit'));

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Settings'));
  const s = b.settings || {};
  inner.append(
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' },
      el('input', { type: 'checkbox', style: 'width:auto', ...(s.approvalRequired ? { checked: '' } : {}),
        onchange: (ev) => D.setApproval(live.boardId, s, ev.target.checked)
          .then(() => toast(ev.target.checked ? 'New entries now need your approval' : 'Entries post instantly'))
          .catch(e => toast(friendly(e))) }),
      el('span', { style: 'margin:0' }, 'Require my approval for new entries')),
    el('label', { class: 'f', style: 'display:flex;align-items:center;gap:8px' },
      el('input', { type: 'checkbox', style: 'width:auto', ...(s.locked ? { checked: '' } : {}),
        onchange: (ev) => D.setLocked(live.boardId, s, ev.target.checked)
          .then(() => toast(ev.target.checked ? 'Locked — the log is read-only' : 'Unlocked'))
          .catch(e => toast(friendly(e))) }),
      el('span', { style: 'margin:0' }, 'Lock the log (read-only)')),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!confirm('Rotate the invite link? Anyone using the old one loses access instantly.')) return;
        try { const code = await D.rotateCode(live.boardId, live.code);
          live.code = code; location.hash = '#/b/' + code; toast('New invite link ready'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Rotate invite'),
      el('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!confirm('Delete the whole log for everyone? This can’t be undone. Consider printing it first.')) return;
        try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; toast('Log deleted'); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Delete log')));

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Name & details'));
  const ti = el('input', { type: 'text', value: b.title, maxlength: '100' });
  const de = el('input', { type: 'text', value: b.description || '', maxlength: '1000', placeholder: 'Care team contact, pharmacy, door code…' });
  inner.append(
    el('label', { class: 'f' }, el('span', {}, 'Who the log is for'), ti),
    el('label', { class: 'f' }, el('span', {}, 'Details'), de),
    el('button', { class: 'btn', type: 'button', onclick: () => {
      const title = ti.value.trim();
      if (!title) { toast('A first name is plenty'); return; }
      D.updateBoard(live.boardId, { title: title.slice(0, 100), description: de.value.slice(0, 1000) })
        .then(() => toast('Saved')).catch(e => toast(friendly(e)));
    } }, 'Save'));
  return wrap;
}

let slotEditing = null;
function openSlotDlg(s) {
  slotEditing = s;
  $('slotLabel').value = s.label;
  $('slotCap').value = String(s.capacity);
  showDlg($('slotDlg'));
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
    if (cap < (slotEditing.claimedCount || 0)) { toast('Can’t go below who’s already committed'); return; }
    try { await D.updateSlot(live.boardId, slotEditing.id, { label: label.slice(0, 120), capacity: cap }); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotDelete').addEventListener('click', async () => {
    if (!confirm('Remove this day from the coverage list?')) return;
    try { await D.deleteSlot(live.boardId, slotEditing.id); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotCancel').addEventListener('click', () => closeDlg($('slotDlg')));
  $('qrClose').addEventListener('click', () => closeDlg($('qrDlg')));

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
