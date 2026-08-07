// Team Parent — Engine 1, skin B. One coach signs in; every family taps a link.
// Same engine as signup-sheets: slots are events/duties, claims are RSVPs,
// entries are announcements (owner) and notes (anyone).
// All user data reaches the DOM via textContent (the el() helper) — never innerHTML.
import {
  normalizeCode, parseBulkSlots, dateRangeSlots, fillStats, shareUrl,
} from './helpers.js';
import * as D from './data.js';
import { firebaseConfig } from './firebase-config.js';

D.initFirebase(firebaseConfig);

const CONFIG = {
  // Stripe payment link for the tip jar — button stays hidden while empty.
  tipUrl: '',
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
async function renderHome() {
  live.stop();
  applyTheme(null);
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

const THEMES = { blue: '#2563eb', green: '#0f766e', plum: '#7c3aed', slate: '#475569', amber: '#b45309' };
function applyTheme(themeKey) {
  const c = THEMES[themeKey];
  if (c) document.documentElement.style.setProperty('--accent', c);
  else document.documentElement.style.removeProperty('--accent');
}

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

function drawBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  const locked = !!b.settings?.locked;
  applyTheme(b.settings?.theme);
  const v = $('view');
  v.replaceChildren();

  // --- title ---
  const head = el('section', { class: 'card' });
  head.append(el('div', { style: 'display:flex;align-items:baseline;gap:8px' },
    el('h2', { style: 'all:unset;font-size:1.3rem;font-weight:700;flex:1;overflow-wrap:anywhere', text: b.title }),
    own ? el('span', { class: 'badge', text: 'you run this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub', style: 'margin:6px 0 0', text: b.description }));
  v.append(head);

  if (own) {
    const url = shareUrl(live.code, baseUrl());
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
      el('div', { style: 'font-weight:600', text: '📣 ' + latest.body }),
      el('div', { class: 'who', text: latest.authorName }),
      announcements.length > 1
        ? el('details', { style: 'margin-top:8px' },
            el('summary', { class: 'sub', style: 'cursor:pointer' }, 'Older announcements (' + (announcements.length - 1) + ')'),
            el('ul', { class: 'plain' },
              announcements.slice(1).map(a => el('li', {},
                el('div', { class: 'grow' }, el('div', {}, a.body), el('div', { class: 'sub', text: a.authorName }),
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
    // live snapshots redraw this whole view — the draft must survive redraws
    const input = el('input', { type: 'text', maxlength: '2000', placeholder: 'Practice cancelled — field is flooded…',
      'aria-label': 'New announcement', value: announceDraft,
      oninput: (ev) => { announceDraft = ev.target.value; },
      onkeydown: (ev) => { if (ev.key === 'Enter') postBtn.click(); } });
    const postBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto',
      onclick: async () => {
        const body = input.value.trim();
        if (!body) return;
        try {
          await D.addEntry(live.boardId, b, { authorName: b.title + ' organizer', body, type: 'announcement' });
          announceDraft = '';
          input.value = '';
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Post');
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Post an announcement'),
      el('div', { class: 'row' }, input, postBtn),
      el('p', { class: 'hint', text: 'Pinned to the top of the page for every family.' })));
  }

  // --- schedule ---
  const schedCard = el('section', { class: 'card' }, el('h2', {}, 'Schedule & duties'));
  const stats = fillStats(live.slots.filter(s => s.capacity < RSVP_CAP));
  if (stats.total > 0) schedCard.append(el('div', { class: 'sub', style: 'margin-bottom:6px', text: 'Duties filled: ' + stats.taken + ' of ' + stats.total }));
  if (live.slots.length === 0) {
    schedCard.append(el('p', { class: 'hint', text: own
      ? 'No events yet — open Manage below to add practices, games, and duty slots.'
      : 'The organizer hasn’t added the schedule yet.' }));
  }
  for (const s of live.slots) schedCard.append(renderEvent(s, own, locked));
  v.append(schedCard);

  // --- notes ---
  v.append(renderNotes(b, own, locked));

  // --- manage ---
  if (own) v.append(renderManage(b));

  if (!own) {
    v.append(el('section', { class: 'card noprint' },
      el('h2', {}, 'Share'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', onclick: () => copyText(shareUrl(live.code, baseUrl()), 'Link copied') }, 'Copy link'),
        el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'))));
  }
}

function renderEvent(s, own, locked) {
  const claims = live.claims.get(s.id) || [];
  const mine = user && claims.find(c => c.uid === user.uid);
  const isRSVP = (s.capacity || 1) >= RSVP_CAP;
  const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
  const box = el('div', { class: 'slot' });
  const countText = isRSVP
    ? (s.claimedCount || 0) + ' going'
    : (left === 0 ? 'Covered' : (s.claimedCount || 0) + ' of ' + s.capacity);
  const top = el('div', { class: 'top' },
    el('span', { class: 'label', text: s.label }),
    el('span', { class: 'count' + (!isRSVP && left === 0 ? ' full' : ''), text: countText }));
  if (own) top.append(el('button', { class: 'btn small noprint', type: 'button', 'aria-label': 'Edit event', onclick: () => openSlotDlg(s) }, '✎'));
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
          toast(isMine ? (isRSVP ? 'RSVP withdrawn' : 'Duty released') : 'Removed');
        } catch (e) { toast(friendly(e), 4500); }
      },
    }, '✕'));
    chips.append(chip);
  }
  if (!isRSVP) for (let i = 0; i < left; i++) chips.append(el('span', { class: 'chip printonly', text: '________________' }));
  if (claims.length || (!isRSVP && left)) box.append(chips);
  if (!mine && left > 0 && !locked) {
    box.append(el('div', { class: 'noprint', style: 'margin-top:8px' },
      el('button', { class: 'btn primary small', type: 'button', onclick: () => openClaim(s, isRSVP) },
        isRSVP ? "I'm going" : 'I’ll cover this')));
  }
  return box;
}

let claimTarget = null;
function openClaim(slot, isRSVP) {
  claimTarget = slot;
  $('nameDlgTitle').textContent = isRSVP ? 'Count us in' : 'Cover this duty';
  $('nameDlgSlot').textContent = slot.label;
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

/* ---------- owner manage panel ---------- */
let addMode = 'single';
let announceDraft = '';
function renderManage(b) {
  const url = shareUrl(live.code, baseUrl());
  const wrap = el('details', { class: 'manage noprint' }, el('summary', {}, 'Manage this team page'));
  const inner = el('div', { class: 'inner' });
  wrap.append(inner);

  inner.append(el('h2', {}, 'Add to the schedule'));
  const seg = el('div', { class: 'seg' },
    ...[['single', 'One event'], ['range', 'Repeating'], ['bulk', 'Paste a list']].map(([k, label]) =>
      el('button', { type: 'button', class: k === addMode ? 'active' : '', onclick: () => { addMode = k; drawBoard(); } }, label)));
  inner.append(seg);

  if (addMode === 'single') {
    const lab = el('input', { type: 'text', placeholder: 'Game vs Hawks', maxlength: '80' });
    const date = el('input', { type: 'date' });
    const time = el('input', { type: 'text', placeholder: '5pm (optional)', maxlength: '20' });
    const need = el('input', { type: 'number', placeholder: 'spots', min: '1', max: '998', 'aria-label': 'Volunteers needed (blank = open RSVP)' });
    inner.append(
      el('label', { class: 'f' }, el('span', {}, 'Event'), lab),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Date (optional)'), date),
        el('label', { class: 'f' }, el('span', {}, 'Time (optional)'), time),
        el('label', { class: 'f' }, el('span', {}, 'Needed (blank = RSVP)'), need)),
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const name = lab.value.trim();
        if (!name) { toast('Give the event a name'); return; }
        let label = name;
        if (date.value) {
          const d = new Date(date.value + 'T00:00:00');
          label += ' · ' + new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
        }
        if (time.value.trim()) label += ' · ' + time.value.trim();
        const cap = parseInt(need.value, 10);
        try {
          await addSlotsChecked([{ label, capacity: (isFinite(cap) && cap >= 1) ? Math.min(cap, 998) : RSVP_CAP }]);
          lab.value = ''; need.value = '';
        } catch (e) { toast(friendly(e), 4500); }
      } }, 'Add event'));
  } else if (addMode === 'range') {
    const start = el('input', { type: 'date' });
    const end = el('input', { type: 'date' });
    const time = el('input', { type: 'text', placeholder: '5–6:30pm (optional)', maxlength: '40' });
    const prefix = el('input', { type: 'text', placeholder: 'Practice', maxlength: '60' });
    const need = el('input', { type: 'number', placeholder: 'blank = RSVP', min: '1', max: '998' });
    const days = el('div', { class: 'wkdays' },
      ...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) =>
        el('label', {}, el('input', { type: 'checkbox', value: String(i) }), d)));
    inner.append(
      el('label', { class: 'f' }, el('span', {}, 'What repeats?'), prefix),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'From'), start),
        el('label', { class: 'f' }, el('span', {}, 'To'), end)),
      el('label', { class: 'f' }, el('span', {}, 'On these days'), days),
      el('div', { class: 'row' },
        el('label', { class: 'f' }, el('span', {}, 'Time (optional)'), time),
        el('label', { class: 'f' }, el('span', {}, 'Needed (blank = RSVP)'), need)),
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        const weekdays = [...days.querySelectorAll('input:checked')].map(c => parseInt(c.value, 10));
        const cap = parseInt(need.value, 10);
        const rows = dateRangeSlots({
          start: start.value, end: end.value, weekdays,
          timeText: time.value, prefix: prefix.value || 'Practice',
          capacity: (isFinite(cap) && cap >= 1) ? Math.min(cap, 998) : RSVP_CAP,
        });
        if (rows.length === 0) { toast('Pick a date range and at least one weekday'); return; }
        if (!confirm('Add ' + rows.length + ' events?')) return;
        try { await addSlotsChecked(rows); } catch (e) { toast(friendly(e), 4500); }
      } }, 'Generate events'));
  } else {
    const ta = el('textarea', { placeholder: 'One per line — add ×N when you need volunteers:\nSnack duty — Sat game x2\nScorekeeper x1\nCarpool to regionals x4\nTeam photo day' });
    inner.append(ta, el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        // parse per-line so an EXPLICIT "x1" stays a 1-person duty slot,
        // while unmarked lines become open RSVPs
        const rows = ta.value.split(/\r?\n/).map(line => {
          const r = parseBulkSlots(line)[0];
          if (!r) return null;
          const explicit = /(?:[x×]\s*\d{1,3}|\(\d{1,3}\))\s*$/i.test(line.trim());
          return { ...r, capacity: explicit ? r.capacity : RSVP_CAP };
        }).filter(Boolean).slice(0, 100);
        if (rows.length === 0) { toast('Paste one event per line first'); return; }
        try { await addSlotsChecked(rows); ta.value = ''; }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Add all')));
    inner.append(el('p', { class: 'hint', text: 'Lines without ×N become open RSVPs; “x2” (or even “x1”) makes a duty slot needing that many people.' }));
  }

  inner.append(el('h2', { style: 'margin-top:16px' }, 'Share & print'));
  inner.append(el('div', { class: 'row', style: 'flex-wrap:wrap' },
    el('button', { class: 'btn', type: 'button', onclick: () => copyText(url, 'Link copied') }, 'Copy link'),
    el('button', { class: 'btn', type: 'button', onclick: showQR }, 'QR code'),
    el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print schedule')));

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
            .catch(e => toast(friendly(e), 5000)),
        }))),
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
  let order = live.slots.reduce((m, s) => Math.max(m, s.order || 0), 0);
  rows.forEach((r, i) => { r.order = order + i + 1; });
  await D.addSlots(live.boardId, rows);
  toast(rows.length === 1 ? 'Added to the schedule' : rows.length + ' events added');
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
    if (!name) { toast('Just a family name is fine'); return; }
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
    if (!label) { toast('The event needs a name'); return; }
    if (cap < (slotEditing.claimedCount || 0)) { toast('Can’t go below the ' + slotEditing.claimedCount + ' people already in'); return; }
    try { await D.updateSlot(live.boardId, slotEditing.id, { label: label.slice(0, 120), capacity: cap }); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); }
  });
  $('slotDelete').addEventListener('click', async () => {
    const n = slotEditing.claimedCount || 0;
    if (!confirm(n ? 'Delete this event and its ' + n + ' RSVP(s)?' : 'Delete this event?')) return;
    try { await D.deleteSlot(live.boardId, slotEditing.id); closeDlg($('slotDlg')); }
    catch (e) { toast(friendly(e), 4500); }
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
