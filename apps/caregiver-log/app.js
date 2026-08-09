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
  // Stripe payment link for the tip jar — button stays hidden while empty, and
  // never shows at all on a board the viewer does not own (see setChrome).
  tipUrl: 'https://buy.stripe.com/eVq7sM0rf1yTcPX1XH7EQ03',
};

const TYPE_LABEL = {
  note: 'Note', appointment: 'Appointment', medication: 'Medication', question: 'Question',
};

const UNDO_MS = 10000;
// A second dose inside six hours is the thing the whole category exists to
// stop. Outside the window the last-given line still shows; it just does not
// stand in the way.
const DOSE_WINDOW_MS = 6 * 60 * 60 * 1000;

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
   Destructive things in a caregiver log are never worth a one-tap regret.
   The toast also TAKES focus when the control that triggered it has just been
   removed from the document — without that, the only undo in the app sits at
   the very end of the body, fifty tab stops away, behind a ten-second timer. */
function toast(msg, ms, action) {
  const t = $('toast');
  t.replaceChildren(document.createTextNode(msg));
  t.classList.toggle('act', !!action);
  let undoBtn = null;
  if (action) {
    undoBtn = el('button', {
      class: 'undo', type: 'button',
      onclick: () => { hideToast(); action.onAction(); },
    }, action.label);
    t.append(undoBtn);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 2400);
  // Only when focus was destroyed by the action itself. Stealing focus from
  // someone who still has somewhere to stand would be its own bug.
  if (undoBtn && (!document.activeElement || document.activeElement === document.body)) {
    undoBtn.focus();
  }
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
  // Already there: never re-focus, or a remote snapshot would throw the caret
  // to the end of the sentence somebody is in the middle of writing.
  if (!target || target === document.activeElement) return;
  target.focus();
  try {
    if (target.tagName === 'TEXTAREA'
      || (target.tagName === 'INPUT' && /^(text|search|url|tel)$/.test(target.type))) {
      const n = target.value.length;
      target.setSelectionRange(n, n);
    }
  } catch (e) {}
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
/* The promise as an object, not as grey copy at the bottom of the page — and
   the promise has to be the true one. This app is not on-device-only: the log
   syncs so the sibling two states away sees it. So the badge says exactly what
   travels, where it lands, and who can read it. Never soften this into
   "nothing leaves your device"; that would be a lie on this app. */
function trustStamp(extraClass) {
  return el('div', { class: 'trustrow' + (extraClass ? ' ' + extraClass : '') },
    el('div', { class: 'trust' }, lockIcon(),
      el('span', {}, el('b', {}, 'Kept between the family.'),
        ' Notes, names and coverage days sync through this app’s own database so'
        + ' every phone with the invite link stays current — never sold, never'
        + ' advertised against, and no account for the family. Anyone holding the'
        + ' link can read the log, so send it one person at a time.')));
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
  if (String(code).includes('unavailable')) return 'You look offline — it will sync when you’re back.';
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

/* "New since you last looked" is computed here, not pushed — we cannot send a
   notification and will not pretend to. */
const seenKey = () => 'cl-seen-' + (live.boardId || '');
let seenAt = 0;              // the stamp this visit is measured against
const loadSeen = () => { try { return Number(localStorage.getItem(seenKey())) || 0; } catch (e) { return 0; } };
function stampSeen() {
  try { if (live.boardId) localStorage.setItem(seenKey(), String(Date.now())); } catch (e) {}
}

/* Deleting an entry is soft for ten seconds. One shared window covers the whole
   batch: two deletes in a row used to leave the first one committed with its
   Undo silently taken away by the second toast. */
const pendingDelete = new Map(); // entryId -> entry
let deleteTimer = null;
function commitDeletes() {
  clearTimeout(deleteTimer); deleteTimer = null;
  const ids = [...pendingDelete.keys()];
  pendingDelete.clear();
  invalidateEntries();
  for (const id of ids) {
    D.deleteEntry(live.boardId, id).catch((err) => { toast(friendly(err), 4500); drawBoard(); });
  }
}
function softDeleteEntry(e) {
  if (pendingDelete.has(e.id)) return;
  pendingDelete.set(e.id, e);
  invalidateEntries();
  clearTimeout(deleteTimer);
  deleteTimer = setTimeout(commitDeletes, UNDO_MS);
  drawBoard();
  const n = pendingDelete.size;
  const firstId = [...pendingDelete.keys()][0];
  toast(n === 1 ? 'Entry removed' : n + ' entries removed', UNDO_MS, {
    label: n === 1 ? 'Undo' : 'Undo all ' + n,
    onAction: () => {
      clearTimeout(deleteTimer); deleteTimer = null;
      pendingDelete.clear();
      invalidateEntries();
      drawBoard();
      // Put the keyboard back where the delete happened, not at the top.
      restoreFocus($('view'), 'delete-' + firstId);
      toast(n === 1 ? 'Kept — nothing was deleted' : 'Kept — nothing was deleted', 4000);
    },
  });
}
window.addEventListener('pagehide', () => { commitDeletes(); stampSeen(); });

let manageOpen = false;   // the disclosure must not slam shut on every snapshot
let lastSavedAt = null;   // powers the persistent "saved" line under the composer
let freshTimer = null;    // re-ticks "last written 22 minutes ago"

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
    shell = null; comp = null; manageSig = null; editing = null; veCache = null; filterText = '';
    clearInterval(freshTimer); freshTimer = null;
  },
};

function route() {
  const m = location.hash.match(/^#\/b\/([A-HJ-NP-Z2-9]{6})/);
  if (m) return { view: 'board', code: m[1] };
  return { view: 'home' };
}
window.addEventListener('hashchange', render);

const isOwner = () => !!(user && live.board && live.board.ownerUid === user.uid);

/* ---------- chrome ----------
   The loudest sourced complaint in this whole category is a donation ask riding
   on the page a family sent to forty people. So the tip jar exists only on the
   owner's own view; a relative who opened a link never sees a money ask, and
   the colophon never turns into a growth line on someone's care log. */
function setChrome({ onBoard, own }) {
  const t = $('tipLink');
  if (t) t.classList.toggle('hidden', !CONFIG.tipUrl || (onBoard && !own));
  // "Sign in" on a board contradicts the one promise the link made. Owners sign
  // in from the home screen, where "Your logs" lives.
  const a = $('authBtn');
  if (a) a.classList.toggle('hidden', onBoard && !(user && !D.isAnon(user)));
}

/* ---------- home ---------- */
async function renderHome() {
  setChrome({ onBoard: false, own: false });
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
    seenAt = loadSeen();
    lastSavedAt = null;
    announce('Log open');
    live.unsubs.push(D.watchBoard(boardId, (b) => { live.board = b; drawBoard(); },
      (e) => toast(friendly(e), 5000)));
    live.unsubs.push(D.watchSlots(boardId, (slots) => { live.slots = slots; syncClaimWatchers(); drawBoard(); },
      (e) => toast(friendly(e), 5000)));
    // "22 minutes ago" has to keep being true while the page sits open.
    freshTimer = setInterval(() => { if (shell) fillFresh(); }, 60000);
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
    (entries) => { live.entries = entries; invalidateEntries(); drawBoard(); },
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

/* ---------- when an entry actually happened ----------
   The dose written at 23:40 happened at 14:00, and a wrong time on a medication
   is worse than no entry at all. The rules this engine shares with three other
   apps pin an entry to a fixed set of fields with createdAt == the server's
   clock, so the time it HAPPENED rides in the body as a leading token. It is
   plain enough to read if anything ever fails to parse it, exact enough to sort
   by, and it is only written when the time actually differs from now. */
const WHEN_RE = /^\[when (\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})\]\s*/;
const EDIT_RE = /\s*\[edited (\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})\]$/;
const pad2 = (n) => String(n).padStart(2, '0');
function localStamp(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
/* Anyone can type square brackets. A token whose numbers are not a real date
   is left alone as ordinary text rather than rolled over into a nonsense
   timestamp — a wrong time on a medication is the thing this exists to stop. */
function parseStamp(m) {
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const out = new Date(y, mo - 1, d, h, mi);
  return out.getMonth() === mo - 1 && out.getDate() === d ? out : null;
}
function parseRaw(raw) {
  let text = String(raw == null ? '' : raw);
  let when = null, edited = null;
  const w = text.match(WHEN_RE);
  if (w) { when = parseStamp(w); if (when) text = text.slice(w[0].length); }
  const e = text.match(EDIT_RE);
  if (e) { edited = parseStamp(e); if (edited) text = text.slice(0, text.length - e[0].length); }
  return { text, when, edited };
}
/* Sorting 500 entries re-parses every body O(n log n) times without this.
   Snapshot objects are replaced wholesale, so the map empties itself. */
const bodyCache = new WeakMap();
function parseBody(e) {
  if (!e || typeof e !== 'object') return parseRaw(e);
  let p = bodyCache.get(e);
  if (!p) { p = parseRaw(e.body); bodyCache.set(e, p); }
  return p;
}
function composeBody(text, when, edited) {
  let out = String(text || '');
  if (when) out = '[when ' + localStamp(when) + '] ' + out;
  if (edited) out = out + ' [edited ' + localStamp(edited) + ']';
  return out.slice(0, 2000);
}

function entryDate(e) {
  try { return e.createdAt && e.createdAt.toDate ? e.createdAt.toDate() : null; }
  catch (err) { return null; }
}
/* The time the family cares about: when it happened, falling back to when it
   was written. Grouping, sorting and the printout all key off this. */
function effDate(e) {
  const p = parseBody(e);
  return p.when || entryDate(e) || new Date();
}
const effMs = (e) => effDate(e).getTime();

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
function agoText(d) {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const dd = Math.round(h / 24);
  if (dd === 1) return 'yesterday';
  if (dd < 7) return dd + ' days ago';
  return 'on ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Newest first by when it HAPPENED, not by when someone found a free hand.
   Memoised: one draw asks for this list five or six times. */
let veCache = null;
const invalidateEntries = () => { veCache = null; };
function visibleEntries() {
  if (!veCache) {
    veCache = live.entries
      .filter((e) => !pendingDelete.has(e.id))
      .slice()
      .sort((a, b) => effMs(b) - effMs(a));
  }
  return veCache;
}

/* ---------- medication ----------
   "Medication" used to be a badge class on a free-text note. A dose has a drug,
   a time and a person, and the one question anybody actually asks it is "has
   this already been given?" — so that answer is computed from the log itself,
   shown before the save, and stands in the way inside the interval.
   Older free-text medication notes are matched too, by name, so the guard works
   on a log that has been running since before this existed. */
const GAVE_RE = /^Gave\s+(.+?)(?:\s+—\s+(.+?))?\s*$/;
function medName(e) {
  if (e.type !== 'medication') return '';
  const first = parseBody(e).text.split('\n')[0];
  const m = first.match(GAVE_RE);
  return m ? m[1].trim() : '';
}
function knownDrugs() {
  const seen = new Map();
  for (const e of visibleEntries()) {
    const n = medName(e);
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }
  return [...seen.values()].slice(0, 30);
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function lastGivenFor(drug) {
  const q = String(drug || '').trim();
  if (q.length < 2) return null;
  let re;
  try { re = new RegExp('(^|[^\\p{L}\\p{N}])' + escRe(q) + '($|[^\\p{L}\\p{N}])', 'iu'); }
  catch (err) { re = new RegExp(escRe(q), 'i'); }
  let best = null;
  for (const e of visibleEntries()) {
    if (e.type !== 'medication') continue;
    const p = parseBody(e);
    if (!re.test(p.text)) continue;
    const when = p.when || entryDate(e);
    if (!when) continue;
    if (!best || when.getTime() > best.when.getTime()) best = { when, who: e.authorName, entry: e };
  }
  return best;
}

/* ---------- the board shell ----------
   drawBoard used to wipe #view on every snapshot, which blurred the textarea
   and dropped the caret — a sibling's write threw the slowest typist in the
   family out of the box mid-sentence. The sections below are created once per
   board and refilled in place, and the composer is never detached at all. */
let shell = null;
function ensureShell(v) {
  if (shell && shell.root === v && v.contains(shell.head)) return shell;
  // The head card is screen chrome now: the printed page carries its own
  // title, its own range line and its own disclaimer, and printing both put
  // the patient's name and the HIPAA sentence on the sheet twice.
  const head = el('section', { class: 'card noprint' });
  const banners = el('div', {});
  const cov = el('section', { class: 'card noprint' });
  const entriesBox = el('div', { class: 'screenonly' });
  // h2 first, then the composer (inserted before entriesBox when it exists),
  // then the list — so the order never depends on the order things were built.
  const timeline = el('section', { class: 'card screenonly' }, el('h2', {}, 'The log'), entriesBox);
  const manageBox = el('div', {});
  const printBox = el('div', {});
  v.replaceChildren(head, banners, cov, timeline, manageBox, printBox);
  shell = { root: v, head, banners, cov, timeline, entriesBox, manageBox, printBox, fresh: null };
  return shell;
}

function drawBoard() {
  if (route().view !== 'board' || !live.board) return;
  syncEntriesWatcher();
  const b = live.board;
  const own = isOwner();
  setChrome({ onBoard: true, own });
  const locked = !!b.settings?.locked;
  const v = $('view');
  const keepFocus = focusKey();
  const u = ensureShell(v);

  fillHead(u, b, own);
  fillBanners(u, own, locked);
  fillCoverage(u, own, locked);
  fillTimeline(u, b, own, locked);
  fillManage(u, b, own);
  // The doctor's page is built when it is asked for, not held permanently in
  // the DOM — at 500 entries the hidden copy doubled the node count.
  u.printBox.replaceChildren();

  restoreFocus(v, keepFocus);
}

/* --- head card --- */
function fillHead(u, b, own) {
  const head = u.head;
  head.replaceChildren();
  head.append(el('div', { class: 'boardhead' },
    el('h2', { class: 'boardtitle', text: 'Caring for ' + b.title }),
    own ? el('span', { class: 'badge', text: 'you started this' }) : null));
  if (b.description) head.append(el('p', { class: 'sub boarddesc', text: b.description }));

  // Freshness: we cannot send a push notification and will not pretend to, so
  // the page says out loud how current it is.
  u.fresh = el('p', { class: 'freshline noprint' });
  head.append(u.fresh);
  fillFresh();

  const pending = visibleEntries().filter(e => e.status === 'pending');
  if (own && pending.length) {
    head.append(el('div', { class: 'pendbar noprint' },
      el('span', { text: pending.length === 1
        ? '1 note is waiting for you to approve it.'
        : pending.length + ' notes are waiting for you to approve them.' }),
      el('button', {
        class: 'btn', type: 'button', 'data-fk': 'reviewpending',
        onclick: () => {
          const first = document.querySelector('[data-fk^="approve-"]');
          if (!first) return;
          first.scrollIntoView({ block: 'center' });
          first.focus();
        },
      }, 'Review the first one')));
  }

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
    onclick: openPrintDlg,
  }, 'Print for a doctor visit'));
  head.append(headActions);
  // noprint: the invite code must never ride along on a page handed to a clinic.
  if (own) head.append(el('p', { class: 'sub rowhint noprint', text: 'Invite code ' + live.code + ' — the QR code, settings and the rest are in “Invite family & settings” below.' }));

  head.append(el('p', { class: 'disclaimer', text: 'This is a shared family notebook — not a medical record, and not medical advice. It isn’t covered by HIPAA.' }));
  head.append(trustStamp('noprint'));
}

function fillFresh() {
  if (!shell || !shell.fresh) return;
  const entries = visibleEntries();
  if (!entries.length) { shell.fresh.textContent = 'Nothing has been written in this log yet.'; return; }
  const newest = entries[0];
  const d = effDate(newest);
  const fresh = 'Last written ' + agoText(d) + ' by ' + newest.authorName + ' · ' + timeOf(d);
  const unseen = seenAt ? entries.filter(e => effMs(e) > seenAt).length : 0;
  shell.fresh.textContent = fresh + (unseen ? ' · ' + unseen + ' new since you last looked' : '');
}

function fillBanners(u, own, locked) {
  const box = u.banners;
  box.replaceChildren();
  // Locking used to remove the composer for the owner too, while the banner
  // told them the opposite. The rules always let the owner write; the UI now
  // agrees with them.
  if (locked) box.append(el('div', { class: 'banner', text: own
    ? 'The log is locked — family can read but not write. You can still write. Unlock it in Settings.'
    : 'The log is locked for now — you can read everything.' }));
  if (!navigator.onLine) box.append(el('div', { class: 'banner', text: 'You’re offline — you can read the log; new notes will sync when you’re back.' }));
}

/* --- coverage --- */
function fillCoverage(u, own, locked) {
  const covCard = u.cov;
  covCard.replaceChildren(el('h2', {}, 'Who’s there, and when'));
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
}

function renderCoverageDay(s, own, locked) {
  const claims = live.claims.get(s.id) || [];
  const mine = user && claims.find(c => c.uid === user.uid);
  const left = Math.max(0, (s.capacity || 1) - (s.claimedCount || 0));
  const box = el('div', { class: 'slot' });
  // The label and the status wrap together inside their own box, so the edit
  // pencil keeps one address — the end of the first line — instead of dropping
  // onto its own row directly above "I can be there" whenever the status badge
  // is the wider one. A 78-year-old aiming for the volunteer button should
  // never find a destructive owner tool under her thumb.
  const meta = el('div', { class: 'slotmeta' },
    el('span', { class: 'label', text: s.label }),
    el('span', { class: 'count ' + (left === 0 ? 'covered' : 'needed'), text: left === 0 ? 'Covered' : 'Needs someone' }));
  const top = el('div', { class: 'top' }, meta);
  // Repeated controls name their own row — a screen reader listing buttons used
  // to get N identical "Edit day"s.
  if (own) top.append(el('button', {
    class: 'btn icon noprint slotedit', type: 'button',
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

const slotLabelFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
/* Pressing this twice is the default mistake — it is the empty state's own call
   to action. It now skips the days already on the list and says what it did,
   instead of quietly producing fourteen rows for seven days. */
async function addWeek() {
  const have = new Set(live.slots.map(s => String(s.label || '').trim().toLowerCase()));
  const rows = [];
  let already = 0;
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    const label = slotLabelFmt.format(d);
    if (have.has(label.trim().toLowerCase())) already++;
    else rows.push({ label, capacity: 1 });
    d.setDate(d.getDate() + 1);
  }
  if (!rows.length) { toast('Those 7 days are already on the list — nothing added.', 4500); return; }
  try {
    await addSlotsChecked(rows, already);
  } catch (e) { toast(friendly(e), 4500); }
}

/* Reuses #slotDlg in "add" mode rather than a native prompt() — unlabelled,
   unstyled, and suppressible by the browser. */
function addCustomDay() { openSlotDlg(null); }

async function addSlotsChecked(rows, already) {
  // No cap and no counter. The people this app is for are fleeing apps that
  // count their days and then tell them to delete their history.
  let order = live.slots.reduce((m, s) => Math.max(m, s.order || 0), 0);
  rows.forEach((r, i) => { r.order = order + i + 1; });
  await D.addSlots(live.boardId, rows);
  const added = rows.length === 1 ? 'Added 1 day' : 'Added ' + rows.length + ' days';
  toast(already ? added + ' · ' + already + ' were already there' : added, already ? 4500 : 2400);
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

/* ---------- the composer ----------
   Built once and never detached, so a remote write cannot close the keyboard
   or drop the caret. Everything that changes between draws is patched in
   place. */
let composeType = 'note';
let composeDraft = '';
let comp = null;
let whenOpen = false;

const PLACEHOLDER = {
  note: 'She was in good spirits today. Ate a full lunch.',
  appointment: 'Dr. Reyes, cardiology — Tuesday 10am. Needs the med list.',
  medication: 'Anything worth knowing about this dose — refused it, took it late, seemed drowsy after.',
  question: 'Ask about the swelling in her ankles at the next visit?',
};
const BODY_LABEL = {
  note: 'What happened?', appointment: 'What’s the appointment?',
  medication: 'Anything else about this dose? (optional)', question: 'What should we ask?',
};

function saveLineText() {
  if (composeDraft) return 'Draft kept on this device — closing the page won’t lose it.';
  if (lastSavedAt) return 'Saved to the log at ' + timeOf(lastSavedAt);
  return '';
}

function buildComposer() {
  const c = {};
  c.seg = el('div', { class: 'seg noprint', role: 'group', 'aria-label': 'Entry type' });
  c.segBtns = {};
  for (const [k, label] of Object.entries(TYPE_LABEL)) {
    const btn = el('button', {
      type: 'button', 'data-fk': 'seg-' + k,
      onclick: () => { composeType = k; patchComposer(); },
    }, label);
    c.segBtns[k] = btn;
    c.seg.append(btn);
  }

  // Medication: a drug, a dose, and the answer to the only question anyone asks.
  c.drug = el('input', {
    type: 'text', maxlength: '80', list: 'drugList', autocomplete: 'off',
    'data-fk': 'drug', placeholder: 'Donepezil',
    oninput: () => { medConfirmed = ''; patchLastGiven(); },
  });
  c.dose = el('input', { type: 'text', maxlength: '60', 'data-fk': 'dose', placeholder: '5mg, one tablet' });
  c.lastGiven = el('p', { class: 'lastgiven hidden', role: 'status' });
  c.med = el('div', { class: 'medfields noprint hidden' },
    el('label', { class: 'f' }, el('span', {}, 'Which medicine?'), c.drug),
    el('label', { class: 'f' }, el('span', {}, 'Dose (optional)'), c.dose),
    c.lastGiven);

  c.name = el('input', {
    type: 'text', placeholder: 'Your first name', maxlength: '60', value: myName(),
    'aria-label': 'Your name', 'data-fk': 'authorname',
  });
  c.body = el('textarea', {
    maxlength: '1900', 'data-fk': 'composebody',
    oninput: (ev) => {
      composeDraft = ev.target.value;
      saveDraft(composeDraft);
      patchSaveLine();
    },
  });
  c.bodyLabelText = el('span', {}, BODY_LABEL.note);

  // Defaults to now; one tap to say it happened earlier.
  c.whenSummary = el('span', { class: 'whennow', text: 'Happened just now' });
  c.whenBtn = el('button', {
    class: 'btn', type: 'button', 'data-fk': 'whenbtn',
    onclick: () => {
      whenOpen = !whenOpen;
      if (whenOpen && !c.whenInput.value) c.whenInput.value = localStamp(new Date());
      patchWhen();
      if (whenOpen) c.whenInput.focus();
    },
  }, 'It happened earlier');
  c.whenInput = el('input', {
    type: 'datetime-local', 'data-fk': 'wheninput', 'aria-label': 'When did this happen?',
    onchange: () => patchWhen(),
  });
  c.whenField = el('label', { class: 'f hidden' }, el('span', {}, 'When did it happen?'), c.whenInput);
  c.whenRow = el('div', { class: 'whenrow noprint' }, c.whenSummary, c.whenBtn);

  c.saveLine = el('p', { class: 'saveline hidden' });
  c.pendNote = el('p', { class: 'sub pendnote hidden' });
  c.addBtn = el('button', { class: 'btn primary', type: 'button', 'data-fk': 'addentry', onclick: submitEntry }, 'Add to the log');

  c.wrap = el('div', { class: 'composer noprint' },
    c.seg,
    c.med,
    el('label', { class: 'f' }, el('span', {}, 'Your name'), c.name),
    // A stable visible label. The aria-label used to change under the user
    // every time the type picker moved.
    el('label', { class: 'f' }, c.bodyLabelText, c.body),
    c.whenRow, c.whenField,
    el('div', { class: 'claimrow' }, c.addBtn),
    c.saveLine, c.pendNote);
  c.body.value = composeDraft;
  return c;
}

function patchSaveLine() {
  if (!comp) return;
  const t = saveLineText();
  comp.saveLine.textContent = t;
  comp.saveLine.classList.toggle('hidden', !t);
}
function patchWhen() {
  if (!comp) return;
  comp.whenField.classList.toggle('hidden', !whenOpen);
  comp.whenBtn.textContent = whenOpen ? 'It happened just now' : 'It happened earlier';
  comp.whenBtn.setAttribute('aria-expanded', whenOpen ? 'true' : 'false');
  const picked = whenOpen && comp.whenInput.value ? new Date(comp.whenInput.value) : null;
  comp.whenSummary.textContent = picked && !isNaN(picked)
    ? 'Happened ' + dayKey(picked) + ' at ' + timeOf(picked)
    : 'Happened just now';
}
function patchLastGiven() {
  if (!comp) return;
  const last = composeType === 'medication' ? lastGivenFor(comp.drug.value) : null;
  if (!last) { comp.lastGiven.classList.add('hidden'); comp.lastGiven.textContent = ''; return; }
  const inWindow = Date.now() - last.when.getTime() < DOSE_WINDOW_MS;
  comp.lastGiven.textContent = 'Last given ' + timeOf(last.when) + ' ' + dayKey(last.when)
    + ' by ' + last.who + ' — ' + agoText(last.when) + '.';
  comp.lastGiven.classList.toggle('soon', inWindow);
  comp.lastGiven.classList.remove('hidden');
}
function patchComposer() {
  if (!comp) return;
  for (const [k, btn] of Object.entries(comp.segBtns)) {
    const on = k === composeType;
    btn.className = on ? 'active' : '';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  comp.med.classList.toggle('hidden', composeType !== 'medication');
  comp.body.placeholder = PLACEHOLDER[composeType];
  comp.bodyLabelText.textContent = BODY_LABEL[composeType];
  patchLastGiven();
  patchWhen();
  patchSaveLine();
  const opts = $('drugList');
  if (opts) opts.replaceChildren(...knownDrugs().map(n => el('option', { value: n })));
  const needsApproval = !isOwner() && !!(live.board && live.board.settings && live.board.settings.approvalRequired);
  comp.pendNote.textContent = needsApproval
    ? 'Notes you add wait for the person who started the log to approve them before the rest of the family sees them.'
    : '';
  comp.pendNote.classList.toggle('hidden', !needsApproval);
}

let medConfirmed = '';   // the drug name the double-dose prompt has been cleared for
function submitEntry() {
  const name = comp.name.value.trim();
  const drug = composeType === 'medication' ? comp.drug.value.trim() : '';
  const dose = composeType === 'medication' ? comp.dose.value.trim() : '';
  const extra = comp.body.value.trim();
  if (!name) { toast('Add your name first'); comp.name.focus(); return; }
  if (composeType === 'medication' && !drug && !extra) {
    toast('Which medicine was given?'); comp.drug.focus(); return;
  }
  if (composeType !== 'medication' && !extra) { toast('Add the note'); comp.body.focus(); return; }

  if (drug && medConfirmed.toLowerCase() !== drug.toLowerCase()) {
    const last = lastGivenFor(drug);
    if (last && Date.now() - last.when.getTime() < DOSE_WINDOW_MS) { openDoseDlg(drug, last); return; }
  }

  let text = extra;
  if (drug) text = ('Gave ' + drug + (dose ? ' — ' + dose : '')) + (extra ? '\n' + extra : '');
  text = text.slice(0, 1900);   // leaves room for the when/edited tokens under the 2000 cap
  const when = whenOpen && comp.whenInput.value ? new Date(comp.whenInput.value) : null;
  const useWhen = when && !isNaN(when) && Math.abs(when.getTime() - Date.now()) > 120000 ? when : null;
  saveEntry(name, composeBody(text, useWhen, null), composeType);
}

async function saveEntry(name, body, type) {
  saveName(name);
  try {
    const status = await D.addEntry(live.boardId, live.board, { authorName: name, body, type });
    composeDraft = '';
    saveDraft('');
    comp.body.value = '';
    comp.drug.value = '';
    comp.dose.value = '';
    medConfirmed = '';
    whenOpen = false;
    comp.whenInput.value = '';
    lastSavedAt = new Date();
    patchComposer();
    toast(status === 'pending'
      ? 'Saved — it will appear for the family once the log’s owner approves it'
      : 'Saved to the log', 4000);
  } catch (e) { toast(friendly(e), 4500); }
}

let doseCtx = null;
function openDoseDlg(drug, last) {
  doseCtx = { drug };
  $('doseDrug').textContent = drug;
  $('doseWhen').textContent = last.who + ' logged it at ' + timeOf(last.when) + ', ' + dayKey(last.when)
    + ' — ' + agoText(last.when) + '.';
  showDlg($('doseDlg'));
  $('doseCancel').focus();
}

/* --- timeline --- */
function fillTimeline(u, b, own, locked) {
  const card = u.timeline;
  // The whole card is screen-only: its contents are the composer, the type
  // picker and the newest-first list, none of which belong on the printed page.
  // Owners may write while the log is locked — that is what the rules say and
  // what the banner claims.
  const canWrite = !locked || own;
  if (canWrite) {
    if (!comp) comp = buildComposer();
    // Never detached once mounted: detaching blurs the textarea, closes the
    // mobile keyboard and drops the caret.
    if (comp.wrap.parentNode !== card) card.insertBefore(comp.wrap, u.entriesBox);
    patchComposer();
  } else if (comp && comp.wrap.parentNode === card) {
    comp.wrap.remove();
  }

  // A year of logging is 500 entries and 55,000 pixels. Once the log is long
  // enough to be worth searching, it becomes searchable — nothing appears
  // before then, because a filter box over nine notes is furniture.
  const all = visibleEntries();
  if (!u.filterRow) u.filterRow = buildFilter();
  if (all.length > 25) {
    if (u.filterRow.parentNode !== card) card.insertBefore(u.filterRow, u.entriesBox);
  } else if (u.filterRow.parentNode === card) {
    u.filterRow.remove();
    filterText = '';
  }
  const q = filterText.trim().toLowerCase();
  const entries = q
    ? all.filter(e => (parseBody(e).text + ' ' + e.authorName + ' ' + (TYPE_LABEL[e.type] || '')).toLowerCase().includes(q))
    : all;
  if (u.filterCount) {
    u.filterCount.textContent = q
      ? 'Showing ' + entries.length + ' of ' + all.length + ' entries'
      : all.length + ' entries in the log';
  }
  u.entriesBox.replaceChildren();

  if (entries.length === 0 && q) {
    u.entriesBox.append(el('div', { class: 'empty' },
      el('h3', {}, 'Nothing matches “' + q + '”'),
      el('p', {}, 'Try a name, a medicine, or a word from the note.')));
    return;
  }

  if (entries.length === 0) {
    u.entriesBox.append(el('div', { class: 'empty' },
      el('div', { class: 'glyph', 'aria-hidden': 'true' }, '📝'),
      el('h3', {}, 'Nothing written down yet'),
      el('p', {}, 'Everything the family writes lands here, newest first — so the sibling who lives far away is as caught up as the one in the next room.'),
      !canWrite ? null : el('button', {
        class: 'btn primary', type: 'button',
        onclick: () => { comp.body.focus(); comp.body.scrollIntoView({ block: 'center' }); },
      }, 'Write the first note')));
    return;
  }

  let lastDay = null;
  let dividerDone = !seenAt || !!q;   // "since you last looked" means nothing inside a filter
  for (const e of entries) {
    const d = effDate(e);
    if (!dividerDone && effMs(e) <= seenAt) {
      u.entriesBox.append(el('div', { class: 'seenline' },
        el('span', { text: 'Everything below was here last time you looked' })));
      dividerDone = true;
    }
    const key = dayKey(d);
    if (key !== lastDay) { u.entriesBox.append(el('div', { class: 'dayhead', text: key })); lastDay = key; }
    u.entriesBox.append(renderEntry(e, own, locked));
  }
}

let filterText = '';
/* Persistent, like the composer: typing here must survive the redraw a
   sibling's note triggers. */
function buildFilter() {
  const input = el('input', {
    type: 'search', 'data-fk': 'filter', 'aria-label': 'Find in the log',
    placeholder: 'donepezil, Rosalie, “fell”…',
    oninput: (ev) => { filterText = ev.target.value; drawBoard(); },
  });
  const count = el('span', { class: 'filtercount', role: 'status' });
  if (shell) shell.filterCount = count;
  return el('div', { class: 'filterrow noprint' },
    el('label', { class: 'f' }, el('span', {}, 'Find in the log'), input), count);
}

let editing = null;   // { id, text, when } — survives the redraw a snapshot forces
function renderEntry(e, own, locked) {
  const mineE = user && e.creatorUid === user.uid;
  const p = parseBody(e);
  const d = effDate(e);
  const written = entryDate(e);
  const backdated = !!p.when && written && Math.abs(p.when.getTime() - written.getTime()) > 120000;

  if (editing && editing.id === e.id) return renderEntryEditor(e, p);

  const meta = el('div', { class: 'meta' },
    el('span', { class: 'who', text: e.authorName }),
    e.type !== 'note' ? el('span', { class: 'badge t-' + e.type, text: TYPE_LABEL[e.type] || e.type }) : null,
    el('span', { class: 'when', text: timeOf(d) }),
    backdated ? el('span', { class: 'when logged', text: '· logged ' + timeOf(written) }) : null,
    p.edited ? el('span', { class: 'when logged', text: '· edited ' + timeOf(p.edited) }) : null,
    e.status === 'pending' ? el('span', { class: 'badge pending', text: 'awaiting approval' }) : null,
    e.type === 'question' && e.done ? el('span', { class: 'badge asked', text: 'asked' }) : null);
  const row = el('div', { class: 'entry' }, meta, el('div', { class: 'body', text: p.text }));

  // Both names carry the author and the time, so a list of buttons in a screen
  // reader is not N identical "Delete entry"s.
  const who = e.authorName + (d ? ' at ' + timeOf(d) : '');
  const actions = el('span', { class: 'entry-actions noprint' });
  // A running "ask at the next appointment" list only works if a question can
  // be crossed off. Any link-holder may — whoever is in the room.
  if (e.type === 'question' && !locked) actions.append(el('button', {
    class: 'btn icon', type: 'button',
    'aria-label': (e.done ? 'Put the question back on the list: ' : 'Mark as asked: ') + who,
    'data-fk': 'asked-' + e.id,
    onclick: () => D.updateEntry(live.boardId, e.id, { done: !e.done })
      .then(() => toast(e.done ? 'Back on the list for the next visit' : 'Marked as asked', 3000))
      .catch(err => toast(friendly(err), 4500)),
  }, e.done ? '↺' : '☑'));
  if (own && e.status === 'pending') actions.append(el('button', {
    class: 'btn icon', type: 'button',
    'aria-label': 'Approve the entry by ' + who, 'data-fk': 'approve-' + e.id,
    onclick: () => D.updateEntry(live.boardId, e.id, { status: 'ok' })
      .then(() => toast('Approved — the family can see it now', 4000))
      .catch(err => toast(friendly(err), 4500)),
  }, '✓'));
  // Fixing a typo at 2am must not mean deleting the note and retyping it. The
  // rules let the person who wrote an entry edit its text, and only them — so
  // that is exactly who gets the button.
  if (mineE && !locked) actions.append(el('button', {
    class: 'btn icon', type: 'button',
    'aria-label': 'Edit the entry by ' + who, 'data-fk': 'edit-entry-' + e.id,
    onclick: () => { editing = { id: e.id, text: p.text, when: p.when || d }; drawBoard(); },
  }, '✎'));
  if (own || mineE) actions.append(el('button', {
    class: 'btn icon danger', type: 'button',
    'aria-label': 'Remove the entry by ' + who, 'data-fk': 'delete-' + e.id,
    // Soft delete with an Undo toast. A mis-tap used to lose a medication note
    // permanently behind a single native confirm().
    onclick: () => softDeleteEntry(e),
  }, '✕'));
  if (actions.childNodes.length) meta.append(actions);
  return row;
}

function renderEntryEditor(e, p) {
  const ta = el('textarea', {
    maxlength: '1900', 'data-fk': 'editbody-' + e.id, 'aria-label': 'Edit this entry',
    oninput: (ev) => { editing.text = ev.target.value; },
  });
  ta.value = editing.text;
  const when = el('input', {
    type: 'datetime-local', 'data-fk': 'editwhen-' + e.id, 'aria-label': 'When did this happen?',
    value: localStamp(editing.when),
    onchange: (ev) => { editing.when = new Date(ev.target.value); },
  });
  const save = el('button', {
    class: 'btn primary', type: 'button', 'data-fk': 'editsave-' + e.id,
    onclick: async () => {
      const text = String(editing.text || '').trim();
      if (!text) { toast('An entry needs some words'); ta.focus(); return; }
      const written = entryDate(e) || new Date();
      const w = editing.when && !isNaN(editing.when) ? editing.when : null;
      const useWhen = w && Math.abs(w.getTime() - written.getTime()) > 120000 ? w : null;
      const body = composeBody(text, useWhen, new Date());
      const id = e.id;
      editing = null;
      try {
        await D.updateEntry(live.boardId, id, { body });
        toast('Entry updated', 3000);
      } catch (err) { toast(friendly(err), 4500); }
      drawBoard();
      restoreFocus($('view'), 'edit-entry-' + id);
    },
  }, 'Save the change');
  const cancel = el('button', {
    class: 'btn', type: 'button', 'data-fk': 'editcancel-' + e.id,
    onclick: () => { const id = e.id; editing = null; drawBoard(); restoreFocus($('view'), 'edit-entry-' + id); },
  }, 'Cancel');
  return el('div', { class: 'entry editing' },
    el('div', { class: 'meta' },
      el('span', { class: 'who', text: e.authorName }),
      el('span', { class: 'when', text: 'editing' })),
    el('label', { class: 'f' }, el('span', {}, 'The note'), ta),
    el('label', { class: 'f' }, el('span', {}, 'When did it happen?'), when),
    el('div', { class: 'row' }, cancel, save));
}

/* ---------- the doctor-visit page ----------
   One button used to print the entire log — 56 Letter pages at 500 entries,
   with no medication list and the questions scattered through it. The page a
   clinician gets is now a defined artifact: standing details, the open
   questions, the medications given in the range, then the timeline. */
let printRange = 7;   // days; 0 = everything

function openPrintDlg() {
  const r = $('printDlg').querySelector('input[value="' + printRange + '"]');
  if (r) r.checked = true;
  showDlg($('printDlg'));
}

function rangeStart() {
  if (!printRange) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (printRange - 1));
  return d;
}

function buildPrintPage() {
  const b = live.board;
  if (!b || !shell) return;
  const box = el('section', { class: 'card printonly' });
  const from = rangeStart();
  const all = visibleEntries();
  const shown = all.filter(e => e.status === 'ok' && (!from || effMs(e) >= from.getTime()));
  const withheld = all.filter(e => e.status !== 'ok' && (!from || effMs(e) >= from.getTime())).length;
  const asc = shown.slice().reverse();

  // A <thead> is the one thing browsers genuinely repeat on every printed page
  // — a position:fixed header renders on every page too, but on top of the
  // body text. Fifty-six loose Letter pages go onto a clipboard with three
  // other patients' paperwork; page 34 has to say whose mother it is.
  const sheet = el('table', { class: 'printsheet' },
    el('thead', {}, el('tr', {}, el('th', { class: 'runhead', scope: 'col',
      text: b.title + ' — family-kept care log · not a medical record' }))));
  const cell = el('td', {});
  sheet.append(el('tbody', {}, el('tr', {}, cell)));
  box.append(sheet);
  const page = { append: (...n) => cell.append(...n) };
  page.append(el('h2', {}, 'Care log — ' + b.title));
  page.append(el('p', { class: 'printmeta', text:
    (from ? 'Covering ' + from.toLocaleDateString(undefined, { dateStyle: 'long' }) + ' to today'
      : 'Covering the whole log')
    + ' · printed ' + new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
    + (withheld ? ' · ' + withheld + ' entr' + (withheld === 1 ? 'y is' : 'ies are') + ' still awaiting approval and not shown' : '') }));

  // 1. The standing reference block every paper caregiver binder has.
  if (b.description) {
    page.append(el('h3', { class: 'printsec' }, 'Standing details'));
    page.append(el('p', { class: 'refblock', text: b.description }));
  }

  // 2. The running "ask at the next appointment" list, at the top where the
  //    guides tell families to put it — open questions from the whole log, not
  //    just the printed range.
  const questions = all.filter(e => e.type === 'question' && e.status === 'ok' && !e.done);
  if (questions.length) {
    page.append(el('h3', { class: 'printsec' }, 'Questions for this visit'));
    const ul = el('ul', { class: 'plain printq' });
    for (const q of questions.slice().reverse()) {
      const d = effDate(q);
      ul.append(el('li', {}, el('span', { text: parseBody(q).text }),
        el('span', { class: 'qsrc', text: ' — ' + q.authorName + ', ' + dayKey(d) })));
    }
    page.append(ul);
  }

  // 3. Medications given in the range, grouped by drug — the thing the medical
  //    assistant has ninety seconds to copy onto the encounter note.
  const meds = shown.filter(e => e.type === 'medication');
  if (meds.length) {
    page.append(el('h3', { class: 'printsec' }, 'Medication given' + (from ? ' in this period' : '')));
    const groups = new Map();
    const loose = [];
    for (const m of meds.slice().reverse()) {
      const n = medName(m);
      if (!n) { loose.push(m); continue; }
      const k = n.toLowerCase();
      if (!groups.has(k)) groups.set(k, { name: n, rows: [] });
      groups.get(k).rows.push(m);
    }
    const ul = el('ul', { class: 'plain printmeds' });
    for (const g of groups.values()) {
      const times = g.rows.map(m => {
        const d = effDate(m);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + timeOf(d)
          + ' (' + m.authorName + ')';
      });
      const doses = [...new Set(g.rows.map(m => {
        const mm = parseBody(m).text.split('\n')[0].match(GAVE_RE);
        return mm && mm[2] ? mm[2].trim() : '';
      }).filter(Boolean))];
      ul.append(el('li', {},
        el('b', { text: g.name + (doses.length ? ' — ' + doses.join(' / ') : '') }),
        el('div', { class: 'qsrc', text: g.rows.length + (g.rows.length === 1 ? ' dose logged: ' : ' doses logged: ') + times.join('; ') })));
    }
    for (const m of loose) {
      const d = effDate(m);
      ul.append(el('li', {}, el('span', { text: parseBody(m).text }),
        el('span', { class: 'qsrc', text: ' — ' + m.authorName + ', ' + dayKey(d) + ' ' + timeOf(d) })));
    }
    page.append(ul);
  }

  // 4. The timeline itself, oldest first, so it reads top to bottom.
  page.append(el('h3', { class: 'printsec' }, 'What happened'));
  if (asc.length === 0) page.append(el('p', {}, 'Nothing was written in this period.'));
  let lastDay = null;
  for (const e of asc) {
    const d = effDate(e);
    const key = dayKey(d);
    if (key !== lastDay) { page.append(el('div', { class: 'dayhead', text: key })); lastDay = key; }
    page.append(el('div', { class: 'entry' },
      el('div', { class: 'meta' },
        el('span', { class: 'who', text: e.authorName }),
        el('span', { text: (TYPE_LABEL[e.type] || 'Note') + ' · ' + timeOf(d) })),
      el('div', { class: 'body', text: parseBody(e).text })));
  }
  page.append(el('p', { class: 'disclaimer', text: 'Family-kept notebook. Not a medical record. Not covered by HIPAA.' }));
  shell.printBox.replaceChildren(box);
}

/* ---------- owner manage ---------- */
let manageSig = null;
function fillManage(u, b, own) {
  if (!own) { u.manageBox.replaceChildren(); manageSig = null; return; }
  // Rebuilt only when something in it actually changed — otherwise a sibling's
  // note wiped whatever the owner was halfway through typing in here.
  const sig = JSON.stringify([b.title, b.description || '', b.settings || {}, live.code]);
  if (sig === manageSig && u.manageBox.firstChild) return;
  manageSig = sig;
  u.manageBox.replaceChildren(renderManage(b));
}

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
            .then(() => toast(ev.target.checked ? 'Locked — the family can read but not write' : 'Unlocked', 4000))
            .catch(e => toast(friendly(e), 4500)) }),
        el('span', {}, 'Lock the log for the family (you can still write)'))),
    el('div', { class: 'row' },
      el('button', { class: 'btn', type: 'button', 'data-fk': 'rotate', onclick: async () => {
        if (!confirm('Rotate the invite link? Anyone using the old one loses access instantly.')) return;
        try { const code = await D.rotateCode(live.boardId, live.code);
          live.code = code; location.hash = '#/b/' + code; toast('New invite link ready — the old one no longer works', 5000); }
        catch (e) { toast(friendly(e), 4500); }
      } }, 'Rotate invite')));

  inner.append(el('h3', {}, 'Name & standing details'));
  const ti = el('input', { type: 'text', value: b.title, maxlength: '100', 'data-fk': 'boardtitle' });
  const de = el('textarea', {
    maxlength: '1000', rows: '5', 'data-fk': 'boarddetails',
    placeholder: 'Current medicines and doses · allergies · GP and cardiologist, with numbers · pharmacy · where the advance directive is kept',
  });
  de.value = b.description || '';
  inner.append(
    el('label', { class: 'f' }, el('span', {}, 'Who the log is for'), ti),
    el('label', { class: 'f' }, el('span', {}, 'Standing details — these print at the top of the doctor’s page'), de),
    el('button', { class: 'btn', type: 'button', 'data-fk': 'savedetails', onclick: () => {
      const title = ti.value.trim();
      if (!title) { toast('A first name is plenty'); return; }
      D.updateBoard(live.boardId, { title: title.slice(0, 100), description: de.value.slice(0, 1000) })
        .then(() => toast('Saved', 4000)).catch(e => toast(friendly(e), 4500));
    } }, 'Save'));

  inner.append(el('h3', {}, 'Keep your own copy'));
  inner.append(
    el('p', { class: 'sub', text: 'A year of a family’s log should never be one tap away from gone. This downloads everything written here as a file on your device.' }),
    el('button', { class: 'btn', type: 'button', 'data-fk': 'export', onclick: exportLog }, 'Download a copy'));

  // The ask lives here — on the owner's own device, in a panel only they can
  // open — and never on the page a grieving family opened from a text message.
  if (CONFIG.tipUrl) {
    inner.append(el('h3', {}, 'Support the app'));
    inner.append(
      el('p', { class: 'sub', text: 'Caregiver Log is free, ad-free and has no subscription. A tip goes to the developer who builds it — never to a family, and never asked for on a log you shared.' }),
      el('a', { class: 'btn', href: CONFIG.tipUrl, target: '_blank', rel: 'noopener', 'data-fk': 'tipmanage' }, '♥ Tip jar'));
  }

  // The one irreversible action gets its own fenced ground instead of sitting
  // beside "Rotate invite" at the same size and shape.
  inner.append(el('div', { class: 'dangerzone' },
    el('h3', {}, 'Delete this log'),
    el('p', {}, 'This removes the whole family’s record for everyone, permanently. Download a copy or print the timeline first if anyone might still need it.'),
    el('button', { class: 'btn danger', type: 'button', 'data-fk': 'deletelog', onclick: async () => {
      if (!confirm('Delete the whole log for everyone? This can’t be undone. Consider downloading a copy first.')) return;
      if (!confirm('Last check: delete “' + b.title + '” and everything written in it, for every family member?')) return;
      try { await D.deleteBoard(live.boardId, live.code); location.hash = '#/'; toast('Log deleted', 5000); }
      catch (e) { toast(friendly(e), 4500); }
    } }, 'Delete log')));
  return wrap;
}

function exportLog() {
  const b = live.board;
  const data = {
    app: 'caregiver-log', version: 1,
    exportedAt: new Date().toISOString(),
    board: { title: b.title, description: b.description || '' },
    coverage: live.slots.map(s => ({
      label: s.label, capacity: s.capacity,
      people: (live.claims.get(s.id) || []).map(c => ({ name: c.name, note: c.note || '' })),
    })),
    entries: visibleEntries().slice().reverse().map(e => {
      const p = parseBody(e);
      return {
        author: e.authorName, type: e.type, text: p.text,
        happenedAt: effDate(e).toISOString(),
        writtenAt: (entryDate(e) || effDate(e)).toISOString(),
        editedAt: p.edited ? p.edited.toISOString() : null,
        status: e.status,
      };
    }),
  };
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', {
      href: URL.createObjectURL(blob),
      download: 'care-log-' + String(b.title).replace(/[^\w-]+/g, '-').toLowerCase() + '.json',
    });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Downloaded — keep it somewhere you will find it', 4500);
  } catch (e) { toast('Could not build the file on this device', 4500); }
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
      try { await addSlotsChecked([{ label: label.slice(0, 120), capacity: cap }], 0); }
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

  $('doseCancel').addEventListener('click', () => { closeDlg($('doseDlg')); if (comp) comp.drug.focus(); });
  $('doseGo').addEventListener('click', () => {
    closeDlg($('doseDlg'));
    if (!doseCtx) return;
    medConfirmed = doseCtx.drug;
    submitEntry();
  });

  $('printCancel').addEventListener('click', () => closeDlg($('printDlg')));
  $('printGo').addEventListener('click', () => {
    const sel = $('printDlg').querySelector('input[name="printrange"]:checked');
    printRange = sel ? Number(sel.value) : 7;
    closeDlg($('printDlg'));
    buildPrintPage();
    window.print();
  });
  // Ctrl+P and the browser menu have to produce the same page as the button.
  window.addEventListener('beforeprint', () => { if (live.board && shell && !shell.printBox.firstChild) buildPrintPage(); });
  window.addEventListener('afterprint', () => { if (shell) shell.printBox.replaceChildren(); });

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
  else { stampSeen(); renderHome(); }
}

function refreshAuthBtn() {
  const btn = $('authBtn');
  if (user && !D.isAnon(user)) btn.textContent = 'Sign out';
  else btn.textContent = 'Sign in';
}

async function init() {
  wire();
  try {
    await D.completeEmailLink(async () => prompt('Confirm your email to finish signing in:'));
  } catch (e) { toast('That sign-in link didn’t work — request a fresh one.', 6000); }
  try { await D.completeRedirect(); }
  catch (e) { toast('Google sign-in didn’t complete (' + ((e && e.code) || '?') + ')', 6000); }
  if (CONFIG.tipUrl) $('tipLink').href = CONFIG.tipUrl;
  D.onAuth((u) => { user = u; refreshAuthBtn(); render(); });
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !firebaseConfig.projectId.startsWith('demo-')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
