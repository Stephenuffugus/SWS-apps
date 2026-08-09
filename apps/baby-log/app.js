// Baby Log — giant-button logging, IndexedDB-only storage.
import {
  newId, sortedEvents, lastOfKind, activeSleep, daySummary,
  agoText, durText, summaryText,
} from './model.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/fZu8wQ2zna5p4jr31L7EQ0j' };

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

/* ---------- toast, and the undo it now carries ---------- */
let toastTimer = null;
function hideToast() { $('toast').classList.remove('show', 'act'); }
function toast(msg, ms) {
  const t = $('toast');
  t.classList.remove('act');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 2400);
}
/* Destructive actions never ask first; they offer a way back. `snapshot` is a
   whole-state copy, so one tap of Undo puts everything exactly as it was. */
function offerUndo(msg, snapshot, ms, after) {
  const t = $('toast');
  const btn = el('button', {
    class: 'undo', type: 'button',
    onclick: () => {
      data = snapshot;
      $('nameInput').value = data.name || '';
      save();
      renderAll();
      toast('Put back');
      if (after) after();
    },
  }, 'Undo');
  t.replaceChildren(document.createTextNode(msg + ' '), btn);
  t.classList.add('show', 'act');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 8000);
  return btn;
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

/* ---------- storage ---------- */
const DBNAME = 'sws-babylog';
function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DBNAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('log')) r.result.createObjectStore('log');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbGet() {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('log', 'readonly');
    const rq = tx.objectStore('log').get('main');
    tx.oncomplete = () => res(rq.result || null);
    tx.onerror = () => rej(tx.error);
  });
}
async function dbPut(data) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('log', 'readwrite');
    tx.objectStore('log').put(data, 'main');
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

let data = { name: '', events: [] };
let saveWarned = 0;

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
function save() {
  const snap = JSON.parse(JSON.stringify(data));
  return dbPut(snap).then(() => setSaved(true, Date.now())).catch(() => {
    setSaved(false);
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      /* Short on purpose: the persistent line under the timeline carries the
         full explanation and does not time out. */
      toast('⚠ Couldn’t save — export a backup', 6000);
    }
  });
}

/* ---------- rendering ---------- */
function timeOf(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
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

function renderStatus() {
  const box = $('status');
  box.replaceChildren();
  const now = Date.now();
  const said = [];

  const sleeping = activeSleep(data.events);
  if (sleeping) {
    const line = 'Asleep — ' + durText(Math.floor((now - sleeping.ts) / 60000)) + ' so far';
    box.append(el('div', { class: 'sleeping' }, glyph('😴'), line));
    said.push(line);
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
    if (mark) mark.hidden = !isNext;
  }

  return said.join('. ');
}

/* Today's window uses real calendar midnights — a fixed +24h drops the last
   hour of fall-back DST days (an 11:15pm feed would vanish from the summary). */
function todayWindow() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function renderSummary() {
  const now = new Date();
  const { start: ws, end: we } = todayWindow();
  const s = daySummary(data.events, ws, we, now.getTime());
  const box = $('summary');
  /* Three zeros is not a summary, it is a shrug. Say something instead. */
  if (!data.events.length) {
    box.replaceChildren(el('div', {}, 'Nothing logged today yet. The first tap starts the day.'));
    return;
  }
  box.replaceChildren(
    el('div', {}, glyph('🍼'), 'Feeds: ', el('b', {}, String(s.feeds))),
    el('div', {}, glyph('😴'), 'Sleep: ', el('b', {}, durText(s.sleepMin))),
    el('div', {}, glyph('🧷'), 'Diapers: ', el('b', {}, String(s.diapers))));
}

/* The list used to render up to 200 rows uncollapsed, which put ~200 delete
   buttons between the keyboard and the Backup card. */
const FIRST_PAGE = 30;
let showAll = false;

function removeEntry(entry, fromKeyboard) {
  const snapshot = JSON.parse(JSON.stringify(data));
  const what = 'Deleted: ' + describe(entry).text + ', ' + timeOf(entry.ts);
  data.events = data.events.filter((x) => x.id !== entry.id);
  save();
  renderAll();
  const btn = offerUndo(what, snapshot, 8000, () => {
    const back = document.querySelector('#timeline [data-eid="' + entry.id + '"]');
    if (back) back.focus();
  });
  /* Keyboard activation reports detail 0. Only then do we chase focus into the
     toast — a thumb tap should never have the page move under it. */
  if (fromKeyboard && btn) btn.focus();
}

function renderTimeline() {
  const list = $('timeline');
  list.replaceChildren();
  const all = sortedEvents(data.events).slice(0, 200);
  const shown = showAll ? all : all.slice(0, FIRST_PAGE);

  $('timelineEmpty').classList.toggle('hidden', all.length > 0);
  $('timelineHint').classList.toggle('hidden', all.length === 0);
  const more = $('moreBtn');
  const rest = all.length - shown.length;
  more.classList.toggle('hidden', rest === 0);
  if (rest) more.textContent = 'Show ' + rest + ' earlier ' + (rest === 1 ? 'entry' : 'entries');

  let lastDay = null;
  for (const e of shown) {
    const day = dayLabel(e.ts);
    if (day !== lastDay) {
      /* A <ul> may only hold <li>, so the day separator is an li that carries
         a real heading and steps out of the list semantics itself. */
      list.append(el('li', { class: 'dayhead', role: 'presentation' }, el('h3', { text: day })));
      lastDay = day;
    }
    const d = describe(e);
    list.append(el('li', {},
      el('span', { class: 'when', text: timeOf(e.ts) }),
      el('span', { class: 'rowglyph', 'aria-hidden': 'true', text: d.glyph }),
      el('span', { class: 'grow', text: d.text }),
      el('button', {
        class: 'btn icon plain rowdel noprint', type: 'button',
        'data-eid': e.id,
        /* Every delete used to announce "Delete entry". Now each one names
           its own row. */
        'aria-label': 'Delete ' + d.text + ' at ' + timeOf(e.ts),
        onclick: (ev) => removeEntry(e, ev.detail === 0),
      }, '✕')));
  }
}

function renderPrintHead() {
  const now = new Date();
  $('printName').textContent = (data.name || 'Baby') + ' — feeding, sleep & diaper log';
  $('printDate').textContent = 'Printed ' +
    now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
    ' · kept on one phone, never uploaded';
}

function renderAll() {
  const said = renderStatus();
  renderSummary();
  renderTimeline();
  renderPrintHead();
  return said;
}

function logEvent(kind, detail) {
  data.events.push({ id: newId(), ts: Date.now(), kind, detail: detail || '' });
  if (data.events.length > 5000) data.events = sortedEvents(data.events).slice(0, 4000);
  save();
  return renderAll();
}

function wire() {
  $('nameInput').addEventListener('input', (ev) => {
    data.name = ev.target.value.slice(0, 40);
    save();
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
  $('moreBtn').addEventListener('click', () => {
    showAll = true;
    renderTimeline();
    const first = $('timeline').children[FIRST_PAGE];
    if (first) first.scrollIntoView({ block: 'center' });
  });
  $('copyBtn').addEventListener('click', () => {
    const now = new Date();
    const { start: ws, end: we } = todayWindow();
    const s = daySummary(data.events, ws, we, now.getTime());
    copyText(summaryText(data.name, s, now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })),
      'Summary copied — hand off the shift');
  });
  $('printBtn').addEventListener('click', () => window.print());
  /* Ctrl+P has to produce the same paper as the button, so the expansion hangs
     off beforeprint rather than off the click. */
  window.addEventListener('beforeprint', () => {
    renderPrintHead();
    if (!showAll) { showAll = true; renderTimeline(); }
  });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'baby-log.json' });
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
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !Array.isArray(obj.events)) throw new Error('bad');
        next = {
          name: typeof obj.name === 'string' ? obj.name.slice(0, 40) : '',
          events: obj.events.filter(e => e && Number.isFinite(e.ts) && typeof e.kind === 'string')
            .map(e => ({ id: String(e.id || newId()).slice(0, 12), ts: e.ts, kind: e.kind.slice(0, 20), detail: String(e.detail || '').slice(0, 12) }))
            .slice(0, 5000),
        };
      } catch (e) { toast('That file doesn’t look like a Baby Log backup.'); return; }
      /* Restore used to overwrite weeks of nights on one tap of the wrong
         file. Now it says what it is about to destroy, and it is reversible. */
      const have = data.events.length;
      if (have && !confirm(
        'Restore this backup?\n\nIt replaces the ' + have + ' ' + (have === 1 ? 'entry' : 'entries') +
        ' currently logged on this phone with ' + next.events.length + ' from the file.\n\n' +
        'You can undo it straight afterwards.')) {
        toast('Nothing changed');
        return;
      }
      const snapshot = JSON.parse(JSON.stringify(data));
      data = next;
      save();
      $('nameInput').value = data.name;
      showAll = false;
      renderAll();
      offerUndo('Backup restored — ' + data.events.length +
        (data.events.length === 1 ? ' entry.' : ' entries.'), snapshot, 10000);
    };
    reader.readAsText(f);
  });
  // keep "X min ago" fresh while the app is open
  setInterval(() => { renderStatus(); renderSummary(); }, 30000);
}

async function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  let restored = false;
  try {
    const stored = await dbGet();
    if (stored && Array.isArray(stored.events)) { data = stored; restored = true; }
  } catch (e) {}
  $('nameInput').value = data.name || '';
  renderAll();
  if (restored) setSaved(true, null);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
