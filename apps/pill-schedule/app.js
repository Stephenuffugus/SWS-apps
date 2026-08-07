// Pill Schedule — printable weekly medication card. localStorage only.
// A memory aid, never medical advice. All user data rendered via textContent.

const CONFIG = { tipUrl: 'https://buy.stripe.com/3cIfZic9X91ldU131L7EQ0b' };

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

const KEY = 'pill-schedule';
const TIME_ORDER = ['Morning', 'Noon', 'Evening', 'Bedtime'];
let data = { who: '', meds: [] }; // meds: {id, name, dose, times[], notes}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.meds)) data = d;
  } catch (e) {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}
const newId = () => Math.random().toString(36).slice(2, 9);

export function sortTimes(times) {
  return [...times].sort((a, b) => TIME_ORDER.indexOf(a) - TIME_ORDER.indexOf(b));
}

function renderList() {
  const list = $('medList');
  list.replaceChildren();
  $('emptyHint').classList.toggle('hidden', data.meds.length > 0);
  for (const m of data.meds) {
    list.append(el('li', {},
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, m.name), m.dose ? ' — ' + m.dose : ''),
        el('div', { class: 'sub', text: sortTimes(m.times).join(' · ') + (m.notes ? '  ·  ' + m.notes : '') })),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove ' + m.name,
        onclick: () => {
          data.meds = data.meds.filter(x => x.id !== m.id);
          save(); renderList();
        } }, '✕')));
  }
}

function renderSheet() {
  const sheet = $('sheet');
  sheet.replaceChildren();
  sheet.append(el('h1', {}, (data.who ? data.who + '’s ' : '') + 'Medication Schedule'));
  sheet.append(el('div', { class: 'sub', text: 'Week of ______________ · check each box when taken' }));
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Medication & when'),
      ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => el('th', { style: 'text-align:center' }, d)))));
  const tbody = el('tbody');
  for (const m of data.meds) {
    for (const time of sortTimes(m.times)) {
      tbody.append(el('tr', {},
        el('td', {},
          el('div', { class: 'med' }, m.name + (m.dose ? ' · ' + m.dose : '')),
          el('div', { class: 'when' }, time + (m.notes ? ' — ' + m.notes : ''))),
        ...Array.from({ length: 7 }, () => el('td', { class: 'day' }, el('span', { class: 'box' })))));
    }
  }
  table.append(tbody);
  sheet.append(table);
  sheet.append(el('div', { class: 'foot' },
    'A family memory aid, not a medical record or medical advice. Confirm all doses and times with the prescriber or pharmacist.'));
}

function wire() {
  // Ctrl/Cmd+P must print the CURRENT card — stale medication info is dangerous
  window.addEventListener('beforeprint', renderSheet);
  $('whoInput').addEventListener('input', (ev) => { data.who = ev.target.value.slice(0, 40); save(); });
  $('addMed').addEventListener('click', () => {
    const name = $('medName').value.trim();
    if (!name) { toast('What’s the medication called?'); return; }
    const times = [...$('medTimes').querySelectorAll('input:checked')].map(c => c.value);
    if (times.length === 0) { toast('Pick at least one time of day'); return; }
    // the printed card gets one ROW per med×time — cap rows, not meds
    const rows = data.meds.reduce((a, m) => a + m.times.length, 0);
    if (rows + times.length > 30) { toast('That’s the one-page limit (30 rows) — split into two schedules'); return; }
    data.meds.push({
      id: newId(),
      name: name.slice(0, 60),
      dose: $('medDose').value.trim().slice(0, 40),
      times,
      notes: $('medNotes').value.trim().slice(0, 120),
    });
    $('medName').value = ''; $('medDose').value = ''; $('medNotes').value = '';
    $('medTimes').querySelectorAll('input').forEach(c => { c.checked = false; });
    save(); renderList();
    $('medName').focus();
  });
  $('printBtn').addEventListener('click', () => {
    if (data.meds.length === 0) { toast('Add the medications first'); return; }
    renderSheet();
    window.print();
  });
}

/* Share: the whole schedule travels inside the URL — nothing uploaded anywhere. */
function encodeCard() {
  const json = JSON.stringify({ w: data.who || '', m: data.meds.map(m => [m.name, m.dose, m.times, m.notes]) });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCard(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return null;
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.m)) return null;
    const meds = obj.m.filter(x => Array.isArray(x)).slice(0, 30).map(([name, dose, times, notes]) => ({
      id: newId(),
      name: String(name || '').slice(0, 60),
      dose: String(dose || '').slice(0, 40),
      times: (Array.isArray(times) ? times : []).filter(t => TIME_ORDER.includes(t)),
      notes: String(notes || '').slice(0, 120),
    })).filter(m => m.name && m.times.length);
    return meds.length ? { who: String(obj.w || '').slice(0, 40), meds } : null;
  } catch (e) { return null; }
}
const cardShareUrl = () => (location.origin === 'null' || location.protocol === 'file:'
  ? location.href.split('#')[0] : location.origin + location.pathname) + '#' + encodeCard();

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  const shared = decodeCard(location.hash);
  if (shared) {
    // never silently destroy the user's own schedule to honor a tapped link
    if (data.meds.length === 0 || confirm('Open the shared schedule' + (shared.who ? ' for ' + shared.who : '')
        + '? Your current one (' + data.meds.length + ' medications) will be replaced.')) {
      data = shared;
      save();
      toast('Schedule loaded from the link');
    }
    history.replaceState(null, '', location.pathname);
  }
  $('whoInput').value = data.who || '';
  renderList();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

/* ---------- QR share (scan instead of typing a link) ---------- */
function showQr(url) {
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
  } catch (e) { toast('Could not draw the QR'); return; }
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
$('shareBtn').addEventListener('click', () => {
  if (data.meds.length === 0) { toast('Add the medications first'); return; }
  copyText(cardShareUrl(), 'Link copied \u2014 the whole schedule is inside it');
});
$('qrBtn').addEventListener('click', () => {
  if (data.meds.length === 0) { toast('Add the medications first'); return; }
  showQr(cardShareUrl());
});
