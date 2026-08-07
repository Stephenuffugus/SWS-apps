// Moving Boxes — numbered boxes, searchable contents, printable QR labels.
// Scanning a label opens this app with the box encoded in the URL hash.
import {
  newId, nextBoxNumber, parseItems, searchBoxes, encodeBox, decodeBox, isBoxHash,
} from './helpers.js';

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

const KEY = 'moving-boxes';
let boxes = [];
let saveWarned = 0;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(d)) boxes = d;
  } catch (e) {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(boxes)); }
  catch (e) {
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      toast('⚠ Couldn’t save — storage may be full. Export a backup!', 7000);
    }
  }
}

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

function renderRoomList() {
  const dl = $('roomList');
  dl.replaceChildren();
  for (const room of [...new Set(boxes.map(b => b.room).filter(Boolean))])
    dl.append(el('option', { value: room }));
}

function renderBoxes() {
  const list = $('boxList');
  list.replaceChildren();
  $('emptyHint').classList.toggle('hidden', boxes.length > 0);
  $('boxHead').textContent = boxes.length
    ? boxes.length + ' boxes · ' + boxes.reduce((a, b) => a + b.items.length, 0) + ' things'
    : 'Boxes';
  for (const b of [...boxes].sort((x, y) => x.n - y.n)) {
    list.append(el('li', {},
      el('span', { class: 'boxnum', text: '#' + b.n }),
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, b.room || 'Unlabeled room')),
        el('div', { class: 'sub', text: b.items.join(', ') || 'empty?' })),
      el('button', { class: 'btn small screenonly', type: 'button', 'aria-label': 'Edit box',
        onclick: () => {
          $('boxNum').value = String(b.n);
          $('boxRoom').value = b.room;
          $('boxItems').value = b.items.join('\n');
          boxes = boxes.filter(x => x.id !== b.id);
          save(); renderBoxes();
          $('boxItems').focus();
          toast('Box #' + b.n + ' reopened — edit and seal it again');
        } }, '✎'),
      el('button', { class: 'btn small danger screenonly', type: 'button', 'aria-label': 'Delete box',
        onclick: () => {
          if (!confirm('Delete box #' + b.n + '?')) return;
          boxes = boxes.filter(x => x.id !== b.id);
          save(); renderBoxes(); renderRoomList();
        } }, '✕')));
  }
  $('boxNum').placeholder = String(nextBoxNumber(boxes));
}

function renderSearch() {
  const results = $('searchResults');
  results.replaceChildren();
  const hits = searchBoxes(boxes, $('searchInput').value);
  for (const { box, hitItems } of hits.slice(0, 10)) {
    results.append(el('li', {},
      el('span', { class: 'boxnum', text: '#' + box.n }),
      el('div', { class: 'grow' },
        el('div', {}, el('strong', {}, box.room || 'Unlabeled')),
        el('div', { class: 'sub' },
          hitItems.length
            ? ['Has: ', el('span', { class: 'hit', text: hitItems.join(', ') })]
            : box.items.slice(0, 5).join(', ')))));
  }
}

function qrDataUrl(text) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = 4, quiet = 4;
    const size = (count + quiet * 2) * cell;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return canvas.toDataURL('image/png');
  } catch (e) { return null; }
}

function renderLabels() {
  const wrap = $('labels');
  wrap.replaceChildren();
  for (const b of [...boxes].sort((x, y) => x.n - y.n)) {
    const url = baseUrl() + '#' + encodeBox(b);
    const img = el('img', { alt: 'QR for box ' + b.n });
    const data = qrDataUrl(url);
    if (data) img.src = data;
    wrap.append(el('div', { class: 'label' },
      el('div', { class: 'lt' },
        el('div', { class: 'ln', text: '#' + b.n }),
        el('div', { class: 'lr', text: b.room || '' }),
        el('div', { class: 'li', text: b.items.slice(0, 4).join(' · ') + (b.items.length > 4 ? ' …' : '') })),
      img));
  }
}

function showScanned(box) {
  $('main').classList.add('hidden');
  $('reveal').classList.remove('hidden');
  $('revNum').textContent = 'Box #' + box.n;
  $('revRoom').textContent = box.room || '';
  const ul = $('revItems');
  ul.replaceChildren();
  for (const item of box.items) ul.append(el('li', {}, item));
  if (box.items.length === 0) ul.append(el('li', { class: 'sub' }, '(nothing listed)'));
}

function wire() {
  $('addBox').addEventListener('click', () => {
    const items = parseItems($('boxItems').value);
    if (items.length === 0) { toast('List what’s inside first'); return; }
    const n = parseInt($('boxNum').value, 10);
    boxes.push({
      id: newId(),
      n: (Number.isInteger(n) && n > 0) ? n : nextBoxNumber(boxes),
      room: $('boxRoom').value.trim().slice(0, 40),
      items,
    });
    $('boxNum').value = ''; $('boxItems').value = '';
    save(); renderBoxes(); renderRoomList();
    toast('Sealed 📦 — next box');
    $('boxItems').focus();
  });
  $('searchInput').addEventListener('input', renderSearch);
  $('printBtn').addEventListener('click', () => {
    if (boxes.length === 0) { toast('Pack a box first'); return; }
    renderLabels();
    window.print();
  });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(boxes, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'moving-boxes.json' });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Backup exported — email it to yourself');
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('bad');
        boxes = arr.filter(b => b && Number.isInteger(b.n))
          .map(b => ({
            id: String(b.id || newId()).slice(0, 12),
            n: b.n,
            room: String(b.room || '').slice(0, 40),
            items: Array.isArray(b.items) ? b.items.filter(x => typeof x === 'string').slice(0, 100).map(x => x.slice(0, 60)) : [],
          })).slice(0, 500);
        save(); renderBoxes(); renderRoomList();
        toast('Backup restored — ' + boxes.length + ' boxes');
      } catch (e) { toast('That file doesn’t look like a Moving Boxes backup.'); }
    };
    reader.readAsText(f);
  });
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  if (isBoxHash(location.hash)) {
    const box = decodeBox(location.hash);
    if (box) { showScanned(box); return; }
  }
  load();
  renderBoxes();
  renderRoomList();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
