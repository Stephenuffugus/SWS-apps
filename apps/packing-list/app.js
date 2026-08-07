// Packing List — presets + custom items, localStorage, shareable URL state.
import {
  PRESETS, PRESET_LABELS, mergePreset, addCustom, stats, encodeList, decodeList,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/28E00kb5Tb9t5nvcCl7EQ0c' };

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

const KEY = 'packing-list';
let name = '';
let items = [];

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.items)) { name = d.name || ''; items = d.items; }
  } catch (e) {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ name, items })); } catch (e) {}
}

function renderPresets() {
  const box = $('presets');
  box.replaceChildren();
  for (const key of Object.keys(PRESETS)) {
    box.append(el('button', { class: 'chip', type: 'button',
      onclick: () => {
        const r = mergePreset(items, key);
        items = r.items;
        save(); renderList();
        toast(r.added ? r.added + ' items added' : 'Already have all of those');
      } }, PRESET_LABELS[key]));
  }
}

function renderList() {
  const list = $('list');
  list.replaceChildren();
  const s = stats(items);
  $('emptyHint').classList.toggle('hidden', items.length > 0);
  $('fill').style.width = s.total ? Math.round(100 * s.done / s.total) + '%' : '0%';
  $('fillText').textContent = s.total
    ? (s.remaining === 0 ? '🎉 All packed!' : s.done + ' packed · ' + s.remaining + ' to go')
    : '';
  $('listHead').textContent = name ? name : 'Your list';
  items.forEach((item, idx) => {
    const cb = el('input', { type: 'checkbox',
      onchange: () => { item.done = cb.checked; save(); renderList(); } });
    cb.checked = item.done;
    list.append(el('li', { class: item.done ? 'done' : '' },
      el('label', {}, cb, item.label),
      el('button', { class: 'x noprint', type: 'button', 'aria-label': 'Remove ' + item.label,
        onclick: () => { items.splice(idx, 1); save(); renderList(); } }, '✕')));
  });
}

function wire() {
  $('tripName').addEventListener('input', (ev) => {
    name = ev.target.value.slice(0, 60);
    save();
    $('listHead').textContent = name || 'Your list';
  });
  const add = () => {
    const r = addCustom(items, $('customItem').value);
    items = r.items;
    if (r.added) { $('customItem').value = ''; save(); renderList(); }
    else if ($('customItem').value.trim()) toast('That’s already on the list');
    $('customItem').focus();
  };
  $('addBtn').addEventListener('click', add);
  $('customItem').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') add(); });
  $('uncheckBtn').addEventListener('click', () => {
    items = items.map(i => ({ ...i, done: false }));
    save(); renderList();
    toast('Fresh list — same trip, next time');
  });
  $('shareBtn').addEventListener('click', () => {
    if (items.length === 0) { toast('Add some items first'); return; }
    const url = (location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname)
      + '#' + encodeList(name, items);
    copyText(url, 'Link copied — their checkboxes start fresh');
  });
  $('printBtn').addEventListener('click', () => {
    if (items.length === 0) { toast('Add some items first'); return; }
    window.print();
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
  const shared = decodeList(location.hash);
  if (shared && shared.items.length) {
    // never silently destroy the user's own list to honor a tapped link
    const hasOwn = items.length > 0;
    if (!hasOwn || confirm('Open the shared list “' + shared.name + '”? Your current list ('
        + items.length + ' items) will be replaced.')) {
      name = shared.name;
      items = shared.items;
      save();
      toast('List loaded from the link');
    }
    history.replaceState(null, '', location.pathname);
  } else if (shared) {
    history.replaceState(null, '', location.pathname); // empty share: ignore
  }
  $('tripName').value = name;
  renderPresets();
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
$('qrBtn').addEventListener('click', () => {
  if (items.length === 0) { toast('Add some items first'); return; }
  showQr((location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname)
    + '#' + encodeList(name, items));
});
