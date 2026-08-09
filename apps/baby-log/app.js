// Baby Log — giant-button logging, IndexedDB-only storage.
import {
  newId, sortedEvents, lastOfKind, activeSleep, daySummary,
  agoText, durText, summaryText,
  ROLL_HOUR, dayStart, dayEnd, dayIndexDiff, tsOk, nearestPast,
} from './model.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/fZu8wQ2zna5p4jr31L7EQ0j' };

/* A sleep timer running longer than this is far more likely to be a timer
   nobody stopped than a baby who slept that long. Past it the app stops
   presenting the number as a fact and asks. */
const STALE_SLEEP_MIN = 5 * 60;

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
/* Emoji are decoration. Screen readers should hear "Fed — left", not
   "woman feeding baby Fed dash left", so every glyph goes in its own
   aria-hidden span. */
function glyph(ch) { return el('span', { 'aria-hidden': 'true' }, ch + ' '); }

/* ---------- toast, and the undo that now outlives it ----------
   The old toast owned one node and rewrote it wholesale, so the next tap —
   and at 3am there is always a next tap — erased the Undo button 350ms into
   its promised 8 seconds. Message and undo are now two long-lived children
   with two independent clocks: a later message can never take the way back
   away, and the Undo button is never removed from the DOM while it is live,
   so focus cannot fall off it. */
let msgUntil = 0;
let undoUntil = 0;
let toastTimer = null;
let curMsg = '';
let pendingUndo = null;   // { msg, fn }
let toastHeld = false;    // pointer or focus inside — the clock stops

function paintToast() {
  const t = $('toast');
  $('toastMsg').textContent = curMsg;
  const btn = $('undoBtn');
  btn.hidden = !pendingUndo;
  if (pendingUndo) btn.setAttribute('aria-label', 'Undo — ' + pendingUndo.msg);
  t.classList.toggle('act', !!pendingUndo);
  t.classList.toggle('show', !!(curMsg || pendingUndo));
}
function armToast() {
  clearTimeout(toastTimer);
  if (toastHeld) return;
  const now = Date.now();
  const next = Math.max(curMsg ? msgUntil : 0, pendingUndo ? undoUntil : 0);
  if (next <= now) { expireToast(); return; }
  toastTimer = setTimeout(expireToast, next - now);
}
function expireToast() {
  if (toastHeld) { armToast(); return; }
  const now = Date.now();
  if (curMsg && now >= msgUntil - 10) curMsg = '';
  if (pendingUndo && now >= undoUntil - 10) dropUndo();
  paintToast();
  if (curMsg || pendingUndo) armToast();
}
/* Retiring the Undo must never leave a keyboard user standing on a button
   that has just gone. Put them back on the log. */
function dropUndo() {
  const btn = $('undoBtn');
  const hadFocus = document.activeElement === btn;
  pendingUndo = null;
  if (hadFocus) $('log').focus();
}
function toast(msg, ms) {
  curMsg = msg;
  msgUntil = Date.now() + (ms || 2400);
  paintToast();
  armToast();
}
function hideToast(keepFocus) {
  clearTimeout(toastTimer);
  curMsg = ''; msgUntil = 0;
  undoUntil = 0;
  if (keepFocus) pendingUndo = null; else dropUndo();
  paintToast();
}
/* Destructive actions never ask first; they offer a way back. `fn` restores
   only the slice that changed — a whole-state snapshot would also revert the
   baby's name if the parent happened to be typing it. */
function offerUndo(msg, fn, ms) {
  pendingUndo = { msg, fn };
  undoUntil = Date.now() + (ms || 8000);
  curMsg = msg;
  msgUntil = undoUntil;
  paintToast();
  armToast();
}
/* #toast transitions visibility, so a synchronous focus() on a toast that was
   hidden a moment ago is silently rejected — which is every returning user's
   first delete. The app layer takes visibility out of the transition; the
   frame retry is the belt to that braces. */
function focusUndo() {
  const btn = $('undoBtn');
  if (btn.hidden) return;
  btn.focus();
  if (document.activeElement !== btn) requestAnimationFrame(() => btn.focus());
}
function wireToast() {
  const t = $('toast');
  const hold = () => { toastHeld = true; clearTimeout(toastTimer); };
  const release = () => {
    setTimeout(() => {
      if (t.contains(document.activeElement) || t.matches(':hover')) return;
      toastHeld = false;
      armToast();
    }, 0);
  };
  t.addEventListener('pointerenter', hold);
  t.addEventListener('pointerleave', release);
  t.addEventListener('focusin', hold);
  t.addEventListener('focusout', release);
  $('undoBtn').addEventListener('click', () => {
    const p = pendingUndo;
    hideToast(true);
    if (p) p.fn();
  });
}

/* A second, silent channel: the status readout is rewritten every 30 seconds,
   so it cannot itself be a live region without speaking every 30 seconds.
   User-driven changes are announced through here instead. */
function announce(msg) {
  const n = $('announce');
  /* A live region only speaks when its text changes, and two identical feeds
     in the same minute produce the same sentence. Alternate an invisible
     character so the second one is still heard. */
  n.textContent = n.textContent === msg ? msg + '\u200B' : msg;
}

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy'); }
}

/* ---------- storage ----------
   Every event is its own record. The old store wrote the entire log to a
   single 'main' key on every tap, so two tabs on one phone — which is exactly
   what installing the PWA leaves behind — silently ate each other's entries:
   last writer won the whole document and the loser was told it saved. Writing
   one key per event means two tabs can only ever touch different keys, and a
   BroadcastChannel tells the other tab to re-read rather than guess. */
const DBNAME = 'sws-babylog';
const STORE = 'log';
const EKEY = (id) => 'e:' + id;

function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DBNAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function dbWrite(fn) {
  return openDb().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    try { fn(tx.objectStore(STORE)); } catch (e) { rej(e); return; }
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  }));
}
/* Reads everything and, once, folds a pre-existing single-blob log into
   per-event records. Kept in one readwrite transaction so a tab that opens
   mid-migration cannot see half a log. */
function dbLoad() {
  return openDb().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const s = tx.objectStore(STORE);
    const kq = s.getAllKeys();
    const vq = s.getAll();
    let out = { name: '', win: '24h', events: [] };
    vq.onsuccess = () => {
      const keys = kq.result || [];
      const vals = vq.result || [];
      const byId = new Map();
      let meta = null;
      let legacy = null;
      keys.forEach((k, i) => {
        const v = vals[i];
        if (k === 'main') legacy = v;
        else if (k === 'meta') meta = v;
        else if (typeof k === 'string' && k.slice(0, 2) === 'e:' && v && typeof v === 'object') {
          byId.set(String(v.id || k.slice(2)), v);
        }
      });
      if (meta && typeof meta === 'object') {
        out.name = typeof meta.name === 'string' ? meta.name : '';
        out.win = meta.win === 'day' ? 'day' : '24h';
      }
      if (legacy && Array.isArray(legacy.events)) {
        if (!meta && typeof legacy.name === 'string') out.name = legacy.name;
        for (const e of legacy.events) {
          if (!e || typeof e !== 'object') continue;
          const ev = { ...e, id: String(e.id || newId()).slice(0, 12) };
          byId.set(ev.id, ev);
          s.put(ev, EKEY(ev.id));
        }
        s.put({ name: out.name, win: out.win }, 'meta');
        s.delete('main');
      }
      out.events = [...byId.values()];
    };
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error);
  }));
}

let data = { name: '', events: [] };
let winMode = '24h';           // which window the summary card covers
let quarantined = [];          // entries whose timestamps are not dates
let saveWarned = 0;
let bc = null;

/* Persistence used to be invisible: save() only ever spoke on failure. The
   privacy promise is the product, so the device being the only copy has to be
   something the user can see. */
function setSaved(ok, when) {
  const line = $('saveState');
  line.classList.remove('hidden');
  line.classList.toggle('bad', !ok);
  $('saveStateText').textContent = ok
    ? (when ? 'Saved on this device · ' + timeOf(when) : 'Saved on this device')
    : 'Not saved — storage may be full or blocked. Export a backup.';
}
function persist(fn) {
  return dbWrite(fn).then(() => {
    setSaved(true, Date.now());
    ping();
  }).catch(() => {
    setSaved(false);
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      /* Short on purpose: the persistent line under the timeline carries the
         full explanation and does not time out. */
      toast('⚠ Couldn’t save — export a backup', 6000);
    }
  });
}
const putEvent = (e) => persist((s) => s.put(e, EKEY(e.id)));
const delEvent = (id) => persist((s) => s.delete(EKEY(id)));
const putMeta = () => persist((s) => s.put({ name: data.name, win: winMode }, 'meta'));
function replaceAll(next) {
  return persist((s) => {
    s.clear();
    for (const e of next.events) s.put(e, EKEY(e.id));
    s.put({ name: next.name, win: winMode }, 'meta');
  });
}

/* Tell the other tab something moved. Nothing leaves the device: the channel
   is same-origin and carries a bare timestamp, and the localStorage fallback
   holds one number, never a log entry. */
function ping() {
  if (bc) { try { bc.postMessage(Date.now()); return; } catch (e) {} }
  /* Only where BroadcastChannel is missing, and only ever a bare number. */
  try { localStorage.setItem('sws.babylog.ping', String(Date.now())); } catch (e) {}
}
let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncFromDb, 120);
}
async function syncFromDb() {
  let stored;
  try { stored = await dbLoad(); } catch (e) { return; }
  intake(stored.events);
  /* Never yank the field out from under someone mid-word. */
  if (document.activeElement !== $('nameInput')) {
    data.name = stored.name;
    $('nameInput').value = stored.name;
  }
  renderAll();
}
function wireSync() {
  try {
    bc = new BroadcastChannel('sws-babylog');
    bc.addEventListener('message', scheduleSync);
  } catch (e) { bc = null; }
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'sws.babylog.ping') scheduleSync();
  });
  /* Coming back to a backgrounded tab is the other moment its copy is stale. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });
}

/* Split what loaded into what can be shown and what cannot. An entry with a
   timestamp of 1e18 is not a date; it used to render a row reading literally
   "Invalid Date" and drive the hero readout to six-figure hour counts. It is
   held aside rather than deleted, and it still goes into the backup. */
function intake(events) {
  const now = Date.now();
  const ok = [];
  const bad = [];
  for (const e of events) {
    if (!e || typeof e !== 'object' || typeof e.kind !== 'string') continue;
    (tsOk(e.ts, now) ? ok : bad).push(e);
  }
  data.events = ok;
  quarantined = bad;
  return bad.length;
}

/* ---------- rendering ---------- */
function timeOf(ts) {
  if (!tsOk(ts)) return '—';
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function dateOf(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
/* Labels a LOG day (5am → 5am), not a calendar day, so the 11pm feed and the
   2am feed that followed it sit under one heading. */
function dayLabel(ts) {
  const diff = dayIndexDiff(Date.now(), ts);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(dayStart(ts)).toLocaleDateString(undefined,
    { weekday: 'long', month: 'short', day: 'numeric' });
}
/* Plain words for a resolved time, so "22:00" typed at 00:40 is unambiguous
   before it is saved. */
function whenWords(ts) {
  const diff = dayIndexDiff(Date.now(), ts);
  const t = timeOf(ts);
  if (diff === 0) return 'Today, ' + t;
  if (diff === 1) return 'Yesterday, ' + t;
  return dateOf(ts) + ', ' + t;
}
/* Glyph and words kept apart so the words can stand alone in an accessible
   name and on the printed page. */
const KIND_TEXT = {
  feed: {
    left: { glyph: '🤱', text: 'Fed — left' },
    right: { glyph: '🤱', text: 'Fed — right' },
    bottle: { glyph: '🍼', text: 'Bottle' },
  },
  diaper: {
    wet: { glyph: '💧', text: 'Diaper — wet' },
    dirty: { glyph: '💩', text: 'Diaper — dirty' },
    both: { glyph: '🌊', text: 'Diaper — both' },
  },
  sleep_start: { '': { glyph: '😴', text: 'Fell asleep' } },
  sleep_end: { '': { glyph: '🌅', text: 'Woke up' } },
};
function describe(e) {
  return (KIND_TEXT[e.kind] || {})[e.detail || ''] || { glyph: '', text: e.kind };
}
/* Pair each wake with the sleep it ended, so paper reads "Woke up — slept
   1h 30m" instead of making a pediatrician do subtraction on two rows. */
function napLengths(events) {
  const out = new Map();
  const sleeps = events.filter(e => e.kind === 'sleep_start' || e.kind === 'sleep_end')
    .sort((a, b) => a.ts - b.ts);
  let open = null;
  for (const e of sleeps) {
    if (e.kind === 'sleep_start') open = e;
    else if (open) { out.set(e.id, Math.round((e.ts - open.ts) / 60000)); open = null; }
  }
  return out;
}

function renderStatus() {
  const box = $('status');
  if (statusEditing) return statusSaid;   // an inline editor is open in here
  box.replaceChildren();
  const now = Date.now();
  const said = [];

  const sleeping = activeSleep(data.events);
  if (sleeping) {
    const mins = Math.floor((now - sleeping.ts) / 60000);
    const stale = mins >= STALE_SLEEP_MIN;
    const line = 'Asleep — ' + durText(Math.max(0, mins)) + ' so far';
    box.append(el('div', { class: 'sleeping' }, glyph('😴'), line));
    said.push(line);
    if (stale) {
      /* Not an error state and not a modal: the timer has simply been running
         longer than a nap, and the way out is one tap. */
      const q = 'Still asleep after ' + durText(mins) + '? A timer left running turns the day’s sleep total into nonsense.';
      box.append(el('div', { class: 'stillgoing' },
        el('p', { class: 'sg-q', text: q }),
        el('div', { class: 'sg-acts' },
          el('button', {
            class: 'btn small', type: 'button',
            onclick: () => { endSleep(Date.now()); },
          }, 'Woke up just now'),
          el('button', {
            class: 'btn small', type: 'button',
            onclick: (ev) => openEndEditor(ev.currentTarget, sleeping),
          }, 'Set when they woke'))));
      said.push('Still asleep after ' + durText(mins) + '? Check the timer.');
    }
  }

  const lastFeed = lastOfKind(data.events, 'feed');
  let nextSide = '';
  let feedLine;
  if (!lastFeed) {
    feedLine = 'No feeds logged yet — the buttons below are built for one thumb in the dark.';
  } else if (lastFeed.detail === 'bottle') {
    feedLine = 'Last feed: ' + agoText(now - lastFeed.ts) + ' (bottle)';
  } else {
    nextSide = lastFeed.detail === 'left' ? 'right' : 'left';
    feedLine = 'Last feed: ' + agoText(now - lastFeed.ts) + ' — ' + lastFeed.detail +
      ' side → start ' + nextSide + ' next';
  }
  box.append(el('div', {}, feedLine));
  said.push(feedLine);

  const lastDiaper = lastOfKind(data.events, 'diaper');
  if (lastDiaper) {
    const line = 'Last diaper: ' + agoText(now - lastDiaper.ts);
    box.append(el('div', { class: 'sub' }, line));
    said.push(line);
  }

  /* The sleep toggle is a real toggle: state rides on aria-pressed and on the
     swapped label, not on the fill colour alone. */
  const sleepBtn = $('sleepBtn');
  $('sleepLabel').textContent = sleeping ? 'Woke up' : 'Fell asleep';
  sleepBtn.classList.toggle('active', !!sleeping);
  sleepBtn.setAttribute('aria-pressed', sleeping ? 'true' : 'false');

  /* Mark the side that comes next — ringed and worded, never colour alone. */
  for (const b of document.querySelectorAll('.bigbtns button[data-kind="feed"]')) {
    const mark = b.querySelector('.nextmark');
    const isNext = !!nextSide && b.dataset.detail === nextSide;
    b.classList.toggle('suggest', isNext);
    if (mark) mark.classList.toggle('off', !isNext);
  }

  statusSaid = said.join('. ');
  return statusSaid;
}
let statusSaid = '';
let statusEditing = false;

/* ---------- the summary window ----------
   "Today" as calendar midnight-to-midnight split every newborn night in half:
   four feeds before midnight and one after produced a handoff message reading
   "Feeds: 1". Two honest windows instead, both named on the page and in the
   copied text. */
function summaryWindow() {
  const now = Date.now();
  if (winMode === 'day') {
    const start = dayStart(now);
    return {
      start, end: dayEnd(now), now,
      label: dayLabel(now) + ' — ' + dateOf(start) + ', 5am to 5am',
      note: 'The log day turns over at 5am, so a night counts with the day it started.',
    };
  }
  const start = now - 24 * 3600000;
  return {
    start, end: now + 1, now,
    label: 'the last 24 hours (since ' + whenWords(start) + ')',
    note: 'Everything since ' + whenWords(start) + '.',
  };
}

function renderSummary() {
  const w = summaryWindow();
  const s = daySummary(data.events, w.start, w.end, w.now);
  const box = $('summary');
  $('winNote').textContent = w.note;
  const inWindow = s.feeds + s.diapers + s.sleepMin;
  /* Three zeros is not a summary, it is a shrug. The old guard tested every
     event ever, so it never fired for a returning parent and shrugged at
     everyone five minutes past midnight. */
  if (!inWindow) {
    box.replaceChildren(el('div', {},
      data.events.length
        ? (winMode === 'day'
          ? 'Nothing logged since 5am. Switch to Last 24 hours to see the night.'
          : 'Nothing logged in the last 24 hours.')
        : 'Nothing logged yet. The first tap starts the day.'));
    return;
  }
  const kids = [
    el('div', {}, glyph('🍼'), 'Feeds: ', el('b', {}, String(s.feeds))),
    el('div', {}, glyph('😴'), 'Sleep: ', el('b', {}, durText(s.sleepClosedMin))),
    el('div', {}, glyph('🧷'), 'Diapers: ', el('b', {}, String(s.diapers))),
  ];
  if (s.sleepOpenMin > 0) {
    kids.splice(2, 0, el('div', { class: 'sub' },
      s.sleepOpenMin >= STALE_SLEEP_MIN
        ? 'A sleep timer has been running ' + durText(s.sleepOpenMin) + ' — end it above and it will count.'
        : 'Asleep now — ' + durText(s.sleepOpenMin) + ' more so far, counted once they wake.'));
  }
  box.replaceChildren(...kids);
}

/* ---------- the timeline ----------
   The list used to be sliced to 200 BEFORE paging, so 340 of a 540-entry log
   could not be viewed, printed or corrected and the button that would have
   said so hid itself. Paging now runs over the whole log. */
const FIRST_PAGE = 30;
const PAGE_STEP = 200;
let limit = FIRST_PAGE;
let printAll = false;

function removeEntry(entry, fromKeyboard) {
  data.events = data.events.filter((x) => x.id !== entry.id);
  delEvent(entry.id);
  renderAll();
  offerUndo('Deleted: ' + describe(entry).text + ', ' + timeOf(entry.ts), () => {
    data.events.push(entry);
    putEvent(entry);
    renderAll();
    toast('Put back');
    const back = document.querySelector('#timeline [data-eid="' + entry.id + '"]');
    if (back) back.focus();
  }, 8000);
  /* Keyboard activation reports detail 0. Only then do we chase focus into the
     toast — a thumb tap should never have the page move under it. */
  if (fromKeyboard) focusUndo();
}

function setEntryTime(entry, ts) {
  const was = entry.ts;
  entry.ts = ts;
  putEvent(entry);
  renderAll();
  offerUndo('Time changed to ' + whenWords(ts), () => {
    entry.ts = was;
    putEvent(entry);
    renderAll();
    toast('Time put back');
  }, 8000);
  announce(describe(entry).text + ' moved to ' + whenWords(ts));
}

/* One inline editor, shared by "fix this row's time" and "set when they woke".
   A sheet, never a modal — nothing may open over the log surface. */
function timeEditor(opts) {
  const id = 'te-' + Math.random().toString(36).slice(2, 8);
  const base = opts.baseTs;
  const d = new Date(opts.initial);
  const pad = (n) => String(n).padStart(2, '0');
  const out = el('div', { class: 'tedit' });
  const input = el('input', {
    type: 'time', id: id, value: pad(d.getHours()) + ':' + pad(d.getMinutes()),
  });
  const resolved = el('p', { class: 'tedit-when' });
  let picked = opts.initial;
  const recompute = () => {
    const m = /^(\d{1,2}):(\d{2})/.exec(input.value || '');
    if (!m) { resolved.textContent = 'Enter a time.'; return false; }
    picked = nearestPast(base, Number(m[1]), Number(m[2]), Date.now());
    resolved.textContent = whenWords(picked);
    return true;
  };
  input.addEventListener('input', recompute);
  out.append(
    el('label', { class: 'f', for: id }, el('span', {}, opts.label || 'Time'), input),
    resolved,
    el('p', { class: 'hint', text: 'A time later than now means yesterday — the line above shows the day it will be saved on.' }),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn primary', type: 'button',
        onclick: () => { if (recompute()) opts.onSave(picked); },
      }, opts.saveLabel || 'Save time'),
      el('button', { class: 'btn plain', type: 'button', onclick: () => opts.onCancel() }, 'Cancel')));
  recompute();
  out._focus = () => input.focus();
  return out;
}

let editingId = null;
function openRowEditor(entry) {
  editingId = entry.id;
  renderTimeline();
  const box = $('timeline').querySelector('.tedit');
  if (box && box._focus) box._focus();
}
function closeRowEditor(focusBack) {
  const id = editingId;
  editingId = null;
  renderTimeline();
  if (focusBack && id) {
    const b = document.querySelector('#timeline [data-eid="' + id + '"]');
    if (b) b.focus();
  }
}

function endSleep(ts) {
  const e = { id: newId(), ts, kind: 'sleep_end', detail: '' };
  data.events.push(e);
  putEvent(e);
  const said = renderAll();
  toast('Good morning ☀️');
  announce(said);
}
function openEndEditor(btn, sleepStart) {
  const holder = btn.closest('.stillgoing');
  if (!holder || holder.querySelector('.tedit')) return;
  const ed = timeEditor({
    baseTs: Date.now(),
    initial: Date.now(),
    label: 'They woke at',
    saveLabel: 'Save wake time',
    /* A wake time before the sleep started is not a wake time. */
    onSave: (ts) => { statusEditing = false; endSleep(Math.max(ts, sleepStart.ts + 60000)); },
    onCancel: () => { statusEditing = false; renderStatus(); },
  });
  holder.append(ed);
  statusEditing = true;
  ed._focus();
}

function dayTotalsLine(start, end) {
  const s = daySummary(data.events, start, end, Date.now());
  const wet = (s.diaperDetail.wet || 0) + (s.diaperDetail.both || 0);
  const dirty = (s.diaperDetail.dirty || 0) + (s.diaperDetail.both || 0);
  return 'Feeds ' + s.feeds + ' · Wet ' + wet + ' · Dirty ' + dirty +
    ' · Sleep ' + durText(s.sleepClosedMin) +
    (s.sleepOpenMin > 0 ? ' (+ ' + durText(s.sleepOpenMin) + ' still running)' : '');
}

function renderTimeline() {
  const root = $('timeline');
  root.replaceChildren();
  const all = sortedEvents(data.events);
  const cap = printAll ? all.length : Math.min(limit, all.length);
  const shown = all.slice(0, cap);
  const naps = napLengths(data.events);

  $('timelineEmpty').classList.toggle('hidden', all.length > 0);
  $('timelineHint').classList.toggle('hidden', all.length === 0);
  $('skipList').classList.toggle('hidden', all.length < 10);

  const more = $('moreBtn');
  const rest = all.length - shown.length;
  more.classList.toggle('hidden', rest === 0);
  if (rest) {
    more.textContent = rest > PAGE_STEP
      ? 'Show ' + PAGE_STEP + ' more — ' + rest + ' older entries not shown'
      : 'Show ' + rest + ' earlier ' + (rest === 1 ? 'entry' : 'entries');
  }
  $('hiddenNote').textContent = rest
    ? rest + ' older ' + (rest === 1 ? 'entry is' : 'entries are') + ' further down the log — nothing is deleted or capped.'
    : '';
  $('hiddenNote').classList.toggle('hidden', !rest);

  let curKey = null;
  let list = null;
  for (const e of shown) {
    const key = dayStart(e.ts);
    if (key !== curKey) {
      curKey = key;
      list = el('ul', { class: 'plain daylist' });
      root.append(el('div', { class: 'dayblock' },
        el('h3', { class: 'dayhead', text: dayLabel(e.ts) }),
        el('p', { class: 'daytotals', text: dayTotalsLine(key, dayEnd(e.ts)) }),
        list));
    }
    const d = describe(e);
    const nap = naps.get(e.id);
    const text = nap ? d.text + ' — slept ' + durText(nap) : d.text;
    const row = el('li', {},
      /* The timestamp is the edit affordance. A feed logged 97 minutes late
         used to be uncorrectable; now the time itself is the button. */
      el('button', {
        class: 'btn plain when', type: 'button', 'data-eid': e.id,
        'aria-expanded': editingId === e.id ? 'true' : 'false',
        'aria-label': 'Change the time of ' + text + ', currently ' + timeOf(e.ts),
        onclick: () => (editingId === e.id ? closeRowEditor(true) : openRowEditor(e)),
      }, timeOf(e.ts)),
      el('span', { class: 'rowglyph', 'aria-hidden': 'true', text: d.glyph }),
      el('span', { class: 'grow', text: text }),
      el('button', {
        class: 'btn icon plain rowdel noprint', type: 'button',
        'data-del': e.id,
        /* Every delete used to announce "Delete entry". Now each one names
           its own row. */
        'aria-label': 'Delete ' + text + ' at ' + timeOf(e.ts),
        onclick: (ev) => removeEntry(e, ev.detail === 0),
      }, '✕'));
    if (editingId === e.id) {
      row.append(timeEditor({
        baseTs: e.ts,
        initial: e.ts,
        label: 'This happened at',
        onSave: (ts) => { editingId = null; setEntryTime(e, ts); },
        onCancel: () => closeRowEditor(true),
      }));
    }
    list.append(row);
  }
}

/* ---------- print ----------
   The sheet the whole print path exists to produce. It used to make the
   pediatrician count 151 rows by hand. */
function renderPrintHead() {
  const now = new Date();
  $('printName').textContent = (data.name || 'Baby') + ' — feeding, sleep & diaper log';
  $('printDate').textContent = 'Printed ' +
    now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
    ' · kept on one phone, never uploaded';

  const box = $('printTotals');
  box.replaceChildren();
  if (!data.events.length) return;
  const days = [];
  const seen = new Set();
  for (const e of sortedEvents(data.events)) {
    const k = dayStart(e.ts);
    if (seen.has(k)) continue;
    seen.add(k);
    days.push({ start: k, end: dayEnd(e.ts) });
    if (days.length >= 21) break;
  }
  const head = el('tr', {},
    el('th', { text: 'Day' }), el('th', { text: 'Feeds' }),
    el('th', { text: 'Wet' }), el('th', { text: 'Dirty' }), el('th', { text: 'Sleep' }));
  const rows = days.map((d) => {
    const s = daySummary(data.events, d.start, d.end, Date.now());
    const wet = (s.diaperDetail.wet || 0) + (s.diaperDetail.both || 0);
    const dirty = (s.diaperDetail.dirty || 0) + (s.diaperDetail.both || 0);
    return el('tr', {},
      el('td', { text: dateOf(d.start) }),
      el('td', { text: String(s.feeds) }),
      el('td', { text: String(wet) }),
      el('td', { text: String(dirty) }),
      el('td', { text: durText(s.sleepClosedMin) }));
  });
  box.append(
    el('h3', { text: 'Daily totals — ' + days.length + ' ' + (days.length === 1 ? 'day' : 'days') }),
    el('table', { class: 'totals' }, el('thead', {}, head), el('tbody', {}, rows)),
    el('p', { class: 'sub', text: 'A day runs 5am to 5am, so a night is counted with the day it started. A “both” diaper counts once as wet and once as dirty.' }));
}

function renderAll() {
  const said = renderStatus();
  renderSummary();
  renderTimeline();
  renderPrintHead();
  return said;
}

function logEvent(kind, detail) {
  const e = { id: newId(), ts: Date.now(), kind, detail: detail || '' };
  data.events.push(e);
  putEvent(e);
  /* No trim. The old cap silently dropped the oldest 1,000 entries at 5,000
     under a "Logged ✓", and a later export could not get them back. */
  if (data.events.length === 10000) {
    toast('Your log has 10,000 entries. Everything is kept — export a backup now and then.', 6000);
  }
  return renderAll();
}

function fileStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = (data.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 24);
  return 'baby-log' + (name ? '-' + name : '') + '-' +
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
}

function wire() {
  wireToast();
  $('nameInput').addEventListener('input', (ev) => {
    data.name = ev.target.value.slice(0, 40);
    putMeta();
    renderPrintHead();
  });
  for (const btn of document.querySelectorAll('[data-kind]')) {
    btn.addEventListener('click', () => {
      const said = logEvent(btn.dataset.kind, btn.dataset.detail);
      toast('Logged ✓');
      announce(said);
    });
  }
  $('sleepBtn').addEventListener('click', () => {
    const sleeping = activeSleep(data.events);
    const said = logEvent(sleeping ? 'sleep_end' : 'sleep_start');
    toast(sleeping ? 'Good morning ☀️' : 'Sweet dreams 🌙');
    announce(said);
  });
  for (const b of document.querySelectorAll('.winseg button')) {
    b.addEventListener('click', () => {
      winMode = b.dataset.win === 'day' ? 'day' : '24h';
      for (const o of document.querySelectorAll('.winseg button')) {
        const on = o === b;
        o.classList.toggle('active', on);
        o.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      renderSummary();
      putMeta();
      announce($('winNote').textContent);
    });
  }
  $('moreBtn').addEventListener('click', () => {
    const was = limit;
    limit = Math.min(data.events.length, limit + PAGE_STEP);
    renderTimeline();
    /* "Show earlier" used to drop focus on <body> at scroll 2848 of a
       16,099px page and announce nothing at all. */
    const rows = $('timeline').querySelectorAll('.when');
    const first = rows[was];
    if (first) { first.scrollIntoView({ block: 'center' }); first.focus(); }
    announce((limit - was) + ' more entries shown. ' +
      Math.max(0, data.events.length - limit) + ' still hidden.');
  });
  $('copyBtn').addEventListener('click', () => {
    const w = summaryWindow();
    const s = daySummary(data.events, w.start, w.end, w.now);
    const notes = s.sleepOpenMin >= STALE_SLEEP_MIN
      ? ['(a sleep timer is still running — end it for an accurate total)'] : [];
    copyText(summaryText(data.name, s, w.label, notes), 'Summary copied — hand off the shift');
  });
  $('printBtn').addEventListener('click', () => window.print());
  /* Ctrl+P has to produce the same paper as the button, so the expansion hangs
     off beforeprint rather than off the click. */
  window.addEventListener('beforeprint', () => {
    printAll = true;
    editingId = null;
    renderPrintHead();
    renderTimeline();
  });
  window.addEventListener('afterprint', () => {
    printAll = false;
    renderTimeline();
  });
  $('exportBtn').addEventListener('click', () => {
    /* Quarantined entries go back into the file: the app will not show a
       nonsense date, but it will not lose the row either. */
    const out = { name: data.name, events: data.events.concat(quarantined) };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: fileStamp() });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Backup exported');
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      let next;
      let skipped = 0;
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !Array.isArray(obj.events)) throw new Error('bad');
        const now = Date.now();
        const clean = [];
        for (const e of obj.events) {
          if (!e || typeof e.kind !== 'string') { skipped++; continue; }
          /* Number.isFinite used to be the only guard, so 1e18 imported
             cleanly and rendered "Invalid Date". */
          if (!tsOk(e.ts, now)) { skipped++; continue; }
          clean.push({
            id: String(e.id || newId()).slice(0, 12),
            ts: e.ts,
            kind: e.kind.slice(0, 20),
            detail: String(e.detail || '').slice(0, 12),
          });
          if (clean.length >= 20000) break;
        }
        next = { name: typeof obj.name === 'string' ? obj.name.slice(0, 40) : '', events: clean };
      } catch (e) { toast('That file doesn’t look like a Baby Log backup.'); return; }
      /* Restore replaces weeks of nights. This one destructive action still
         says what it is about to do before it does it — everything else in
         the app is undo-only. */
      const have = data.events.length;
      if (have && !confirm(
        'Restore this backup?\n\nIt replaces the ' + have + ' ' + (have === 1 ? 'entry' : 'entries') +
        ' currently logged on this phone with ' + next.events.length + ' from the file.\n\n' +
        'You can undo it straight afterwards.')) {
        toast('Nothing changed');
        return;
      }
      const snapshot = { name: data.name, events: data.events.concat(quarantined) };
      data.name = next.name;
      intake(next.events);
      $('nameInput').value = data.name;
      limit = FIRST_PAGE;
      editingId = null;
      replaceAll({ name: data.name, events: data.events.concat(quarantined) });
      renderAll();
      offerUndo('Backup restored — ' + data.events.length +
        (data.events.length === 1 ? ' entry.' : ' entries.') +
        (skipped ? ' ' + skipped + ' skipped: impossible dates.' : ''), () => {
        data.name = snapshot.name;
        intake(snapshot.events);
        $('nameInput').value = data.name;
        replaceAll({ name: data.name, events: data.events.concat(quarantined) });
        renderAll();
        toast('Put back');
      }, 10000);
    };
    reader.readAsText(f);
  });
  // keep "X min ago" fresh while the app is open
  setInterval(() => { renderStatus(); renderSummary(); }, 30000);
}

async function init() {
  wire();
  wireSync();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  let restored = false;
  let bad = 0;
  try {
    const stored = await dbLoad();
    data.name = stored.name || '';
    winMode = stored.win || '24h';
    bad = intake(stored.events);
    restored = true;
  } catch (e) {}
  for (const o of document.querySelectorAll('.winseg button')) {
    const on = o.dataset.win === winMode;
    o.classList.toggle('active', on);
    o.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('nameInput').value = data.name || '';
  renderAll();
  if (restored) setSaved(true, null);
  if (bad) {
    toast(bad + ' ' + (bad === 1 ? 'entry has' : 'entries have') +
      ' an impossible date and are hidden — they are still in your backup.', 8000);
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
