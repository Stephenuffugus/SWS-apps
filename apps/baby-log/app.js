// Baby Log — giant-button logging, IndexedDB-only storage.
import {
  newId, sortedEvents, lastOfKind, activeSleep, daySummary,
  agoText, durText, summaryText,
} from './model.js';

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
function save() {
  const snap = JSON.parse(JSON.stringify(data));
  dbPut(snap).catch(() => {
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      toast('⚠ Couldn’t save — storage may be full or blocked. Export a backup!', 7000);
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
const KIND_TEXT = {
  feed: { left: '🤱 Fed — left', right: '🤱 Fed — right', bottle: '🍼 Bottle' },
  diaper: { wet: '💧 Diaper — wet', dirty: '💩 Diaper — dirty', both: '🌊 Diaper — both' },
  sleep_start: { '': '😴 Fell asleep' },
  sleep_end: { '': '🌅 Woke up' },
};

function renderStatus() {
  const box = $('status');
  box.replaceChildren();
  const now = Date.now();
  const sleeping = activeSleep(data.events);
  if (sleeping) {
    box.append(el('div', { class: 'sleeping' }, '😴 Asleep — ' + durText(Math.floor((now - sleeping.ts) / 60000)) + ' so far'));
  }
  const lastFeed = lastOfKind(data.events, 'feed');
  box.append(el('div', {}, lastFeed
    ? 'Last feed: ' + agoText(now - lastFeed.ts) +
      (lastFeed.detail === 'bottle' ? ' (bottle)' : ' — ' + lastFeed.detail + ' side' +
        (lastFeed.detail !== 'bottle' ? ' → start ' + (lastFeed.detail === 'left' ? 'right' : 'left') + ' next' : ''))
    : 'No feeds logged yet — the buttons below are built for one thumb in the dark.'));
  const lastDiaper = lastOfKind(data.events, 'diaper');
  if (lastDiaper) box.append(el('div', { class: 'sub' }, 'Last diaper: ' + agoText(now - lastDiaper.ts)));
  $('sleepLabel').textContent = sleeping ? 'Woke up' : 'Fell asleep';
  $('sleepBtn').classList.toggle('active', !!sleeping);
}

function renderSummary() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const s = daySummary(data.events, start.getTime(), start.getTime() + 86400000, now.getTime());
  const box = $('summary');
  box.replaceChildren(
    el('div', {}, '🍼 Feeds: ', el('b', {}, String(s.feeds))),
    el('div', {}, '😴 Sleep: ', el('b', {}, durText(s.sleepMin))),
    el('div', {}, '🧷 Diapers: ', el('b', {}, String(s.diapers))));
}

function renderTimeline() {
  const list = $('timeline');
  list.replaceChildren();
  const events = sortedEvents(data.events).slice(0, 200);
  $('emptyHint').classList.toggle('hidden', events.length > 0);
  let lastDay = null;
  for (const e of events) {
    const day = dayLabel(e.ts);
    if (day !== lastDay) {
      list.append(el('div', { class: 'dayhead', text: day }));
      lastDay = day;
    }
    const label = (KIND_TEXT[e.kind] || {})[e.detail || ''] || e.kind;
    list.append(el('li', {},
      el('span', { class: 'when', text: timeOf(e.ts) }),
      el('span', { class: 'grow', text: label }),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete entry',
        onclick: () => {
          data.events = data.events.filter(x => x.id !== e.id);
          save(); renderAll();
        } }, '✕')));
  }
}

function renderAll() {
  renderStatus();
  renderSummary();
  renderTimeline();
}

function logEvent(kind, detail) {
  data.events.push({ id: newId(), ts: Date.now(), kind, detail: detail || '' });
  if (data.events.length > 5000) data.events = sortedEvents(data.events).slice(0, 4000);
  save(); renderAll();
}

function wire() {
  $('nameInput').addEventListener('input', (ev) => {
    data.name = ev.target.value.slice(0, 40);
    save();
  });
  for (const btn of document.querySelectorAll('[data-kind]')) {
    btn.addEventListener('click', () => {
      logEvent(btn.dataset.kind, btn.dataset.detail);
      toast('Logged ✓');
    });
  }
  $('sleepBtn').addEventListener('click', () => {
    const sleeping = activeSleep(data.events);
    logEvent(sleeping ? 'sleep_end' : 'sleep_start');
    toast(sleeping ? 'Good morning ☀️' : 'Sweet dreams 🌙');
  });
  $('copyBtn').addEventListener('click', () => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const s = daySummary(data.events, start.getTime(), start.getTime() + 86400000, now.getTime());
    copyText(summaryText(data.name, s, now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })),
      'Summary copied — hand off the shift');
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
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !Array.isArray(obj.events)) throw new Error('bad');
        data = {
          name: typeof obj.name === 'string' ? obj.name.slice(0, 40) : '',
          events: obj.events.filter(e => e && Number.isFinite(e.ts) && typeof e.kind === 'string')
            .map(e => ({ id: String(e.id || newId()).slice(0, 12), ts: e.ts, kind: e.kind.slice(0, 20), detail: String(e.detail || '').slice(0, 12) }))
            .slice(0, 5000),
        };
        save();
        $('nameInput').value = data.name;
        renderAll();
        toast('Backup restored');
      } catch (e) { toast('That file doesn’t look like a Baby Log backup.'); }
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
  try {
    const stored = await dbGet();
    if (stored && Array.isArray(stored.events)) data = stored;
  } catch (e) {}
  $('nameInput').value = data.name || '';
  renderAll();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
