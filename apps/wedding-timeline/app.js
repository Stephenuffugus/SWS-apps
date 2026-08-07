// Wedding Day Timeline — time-sorted moments, elegant print, URL sharing.
import { parseTime, fmtTime, sortEvents, encodeTimeline, decodeTimeline } from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/9B6aEYc9X5P95nvaud7EQ0d' };

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

const KEY = 'wedding-timeline';
let state = { title: '', date: '', events: [] }; // events: {minutes|null, what, who}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.events)) state = d;
  } catch (e) {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

function renderList() {
  const list = $('evList');
  list.replaceChildren();
  $('emptyHint').classList.toggle('hidden', state.events.length > 0);
  const sorted = sortEvents(state.events);
  for (const ev of sorted) {
    list.append(el('li', {},
      el('span', { class: 'time', text: ev.minutes === null ? '—' : fmtTime(ev.minutes) }),
      el('div', { class: 'grow' },
        el('div', { text: ev.what }),
        ev.who ? el('div', { class: 'sub', text: ev.who }) : null),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove ' + ev.what,
        onclick: () => {
          state.events = state.events.filter(x => x !== ev);
          save(); renderList();
        } }, '✕')));
  }
}

function renderSheet() {
  const sheet = $('sheet');
  sheet.replaceChildren();
  sheet.append(el('div', { class: 'head' },
    el('h1', {}, state.title || 'The Wedding Day'),
    state.date ? el('div', { class: 'date', text: state.date }) : null,
    el('div', { class: 'rule' })));
  for (const ev of sortEvents(state.events)) {
    sheet.append(el('div', { class: 'ev' },
      el('div', { class: 't', text: ev.minutes === null ? '' : fmtTime(ev.minutes) }),
      el('div', { class: 'w' },
        el('div', {}, ev.what),
        ev.who ? el('div', { class: 'who', text: ev.who }) : null)));
  }
  sheet.append(el('div', { class: 'foot' }, 'Breathe. Everything else is somebody else’s job today.'));
}

function wire() {
  // Ctrl/Cmd+P must print the current timeline, not a blank/stale sheet
  window.addEventListener('beforeprint', renderSheet);
  $('titleInput').addEventListener('input', (ev) => { state.title = ev.target.value.slice(0, 80); save(); });
  $('dateInput').addEventListener('input', (ev) => { state.date = ev.target.value.slice(0, 40); save(); });
  const add = () => {
    const what = $('evWhat').value.trim();
    if (!what) { toast('What’s happening at that time?'); return; }
    const rawTime = $('evTime').value.trim();
    const minutes = rawTime ? parseTime(rawTime) : null;
    if (rawTime && minutes === null) { $('timeWarn').classList.remove('hidden'); return; }
    $('timeWarn').classList.add('hidden');
    if (state.events.length >= 100) { toast('That’s a very full day — 100 moments max'); return; }
    state.events.push({ minutes, what: what.slice(0, 120), who: $('evWho').value.trim().slice(0, 80) });
    $('evTime').value = ''; $('evWhat').value = ''; $('evWho').value = '';
    save(); renderList();
    $('evTime').focus();
  };
  $('addEv').addEventListener('click', add);
  for (const id of ['evTime', 'evWhat', 'evWho'])
    $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') add(); });
  $('printBtn').addEventListener('click', () => {
    if (state.events.length === 0) { toast('Add the day’s moments first'); return; }
    renderSheet();
    window.print();
  });
  $('shareBtn').addEventListener('click', () => {
    if (state.events.length === 0) { toast('Add the day’s moments first'); return; }
    const url = (location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname)
      + '#' + encodeTimeline(state);
    copyText(url, 'Link copied — send it to the whole wedding party');
  });
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  const shared = decodeTimeline(location.hash);
  if (shared && shared.events.length) {
    // never silently destroy the user's own timeline to honor a tapped link
    const hasOwn = state.events.length > 0;
    if (!hasOwn || confirm('Open the shared timeline “' + (shared.title || 'Untitled') + '”? Your current timeline ('
        + state.events.length + ' moments) will be replaced.')) {
      state = shared;
      save();
      toast('Timeline loaded from the link');
    }
    history.replaceState(null, '', location.pathname);
  } else if (shared) {
    history.replaceState(null, '', location.pathname);
  }
  $('titleInput').value = state.title;
  $('dateInput').value = state.date;
  renderList();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
