// Home Inventory — Engine 2, skin B. Local-first: IndexedDB + vendored pdf-lib.
// Fast-capture is the heart: point, shoot, name, next. Detail can come later.
// All user data reaches the DOM via textContent; images only as data:image/* URLs.
import {
  newInventory, newId, parseValue, fmtCents, totals, roomItems,
} from './model.js';
import { makeInventoryPdf, makeAdjusterPdf } from './pdf.js';
import { saveInventory, getInventory, allInventories, deleteInventory } from './store.js';

const CONFIG = {
  // Stripe payment link for the tip jar — button stays hidden while empty.
  tipUrl: '',
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
const safeSrc = (u) => (typeof u === 'string' && u.startsWith('data:image/')) ? u : null;

/* Compress on capture — a 40-room house would otherwise eat gigabytes. */
async function compressImage(file, maxSide = 1280, quality = 0.8) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}

function pickImage() {
  return new Promise((resolve) => {
    const input = $('fileInput');
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return resolve(null);
      try { resolve(await compressImage(file)); }
      catch (e) {
        // no canvas/bitmap support — fall back to the raw file (may be large)
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  });
}

/* ---------- state ---------- */
let inv = null;
let tab = 'capture';
let itemFilterRoom = 'all';
let pageSize = 'letter';
let captureDraft = { photo: null };
let saveTimer = null;
let saveWarned = 0;

function persistSnap(snap) {
  saveInventory(snap).catch(() => {
    // QuotaExceededError is realistic for photo-heavy inventories — never silent
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      toast('⚠ Couldn’t save to this device — storage may be full. Export your backup NOW.', 8000);
    }
  });
}

function touch() {
  if (!inv) return;
  inv.updatedAt = Date.now();
  // Snapshot NOW: navigation may null `inv` before the debounce fires, and
  // fast-capture is exactly "save & pocket the phone".
  const snap = JSON.parse(JSON.stringify(inv));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistSnap(snap), 400);
}
window.addEventListener('pagehide', () => {
  if (!inv) return;
  clearTimeout(saveTimer);
  persistSnap(JSON.parse(JSON.stringify(inv)));
});

function route() {
  const m = location.hash.match(/^#\/i\/([\w-]+)/);
  return m ? { view: 'editor', id: m[1] } : { view: 'home' };
}
window.addEventListener('hashchange', render);

/* ---------- home ---------- */
async function renderHome() {
  inv = null;
  const v = $('view');
  v.replaceChildren();
  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'Photograph it before you need it'),
    el('p', {}, 'After the fire is the wrong time to remember what was in the house. Walk each room, point, shoot, name it — and export a PDF your insurer will actually accept. ',
      el('strong', {}, 'Free. No account. Nothing leaves your device.')),
    el('button', { class: 'btn primary', type: 'button', onclick: createInventory }, 'Start an inventory')));

  const sec = el('section', { class: 'card' }, el('h2', {}, 'Your inventories'));
  const list = el('ul', { class: 'plain' });
  sec.append(list);
  let rows = [];
  try { rows = (await allInventories()) || []; } catch (e) {}
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (rows.length === 0) sec.append(el('p', { class: 'hint', text: 'Stored on this device only — export the PDF and the backup file somewhere safe.' }));
  for (const r of rows) {
    const t = totals(r);
    list.append(el('li', {},
      el('div', { class: 'grow' },
        el('div', { text: r.name }),
        el('div', { class: 'sub', text: t.count + ' items · ' + fmtCents(t.valueCents) })),
      el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/i/' + r.id; } }, 'Open'),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete inventory',
        onclick: async () => {
          if (!confirm('Delete “' + r.name + '” and all its photos from this device?')) return;
          try { await deleteInventory(r.id); } catch (e) {}
          renderHome();
        } }, '✕')));
  }
  v.append(sec);

  const file = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden',
    onchange: (ev) => { if (ev.target.files[0]) importFile(ev.target.files[0]); ev.target.value = ''; } });
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Restore'),
    el('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import a backup file'),
    file));
}

function createInventory() {
  const name = prompt('Name it (address works well):', '');
  if (name === null) return;
  inv = newInventory(name.trim() || 'Home inventory');
  inv.rooms = [{ id: newId(), name: 'Living room' }, { id: newId(), name: 'Kitchen' }, { id: newId(), name: 'Bedroom' }];
  touch();
  location.hash = '#/i/' + inv.id;
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) throw new Error('bad');
      obj.id = obj.id || newId();
      obj.rooms = Array.isArray(obj.rooms) ? obj.rooms : [];
      obj.name = typeof obj.name === 'string' ? obj.name : 'Imported inventory';
      inv = obj;
      touch();
      location.hash = '#/i/' + obj.id;
      toast('Imported “' + (obj.name || 'inventory') + '”');
    } catch (e) { toast('That file doesn’t look like an inventory backup.'); }
  };
  reader.readAsText(file);
}

/* ---------- editor ---------- */
async function renderEditor(id) {
  if (!inv || inv.id !== id) {
    let loaded = null;
    try { loaded = await getInventory(id); } catch (e) {}
    if (!loaded) {
      $('view').replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'sub', text: 'That inventory isn’t on this device.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    inv = loaded;
    // never leak state between inventories: a pending photo from house A must
    // not land in house B, and a stale room filter hides B's items
    captureDraft = { photo: null };
    captureRoomId = null;
    itemFilterRoom = 'all';
  }
  drawEditor();
}

function drawEditor() {
  const v = $('view');
  v.replaceChildren();
  const t = totals(inv);

  v.append(el('section', { class: 'card' },
    el('div', { class: 'row' },
      el('button', { class: 'btn small', type: 'button', style: 'flex:0 0 auto', onclick: () => { location.hash = '#/'; } }, '‹ Back'),
      el('input', { type: 'text', value: inv.name, maxlength: '80', style: 'font-weight:700',
        oninput: (ev) => { inv.name = ev.target.value.slice(0, 80); touch(); } })),
    el('div', { class: 'sub', style: 'margin-top:6px', text: t.count + ' items · ' + t.photos + ' photographed · ' + fmtCents(t.valueCents) })));

  v.append(el('nav', { class: 'tabs' },
    ...[['capture', '📷 Capture'], ['items', 'Items'], ['rooms', 'Rooms'], ['export', 'Export']]
      .map(([k, label]) => el('button', {
        type: 'button', class: k === tab ? 'active' : '',
        onclick: () => { tab = k; drawEditor(); },
      }, label))));

  if (tab === 'capture') v.append(renderCapture());
  else if (tab === 'items') v.append(renderItems());
  else if (tab === 'rooms') v.append(renderRooms());
  else v.append(...renderExport());
}

/* ----- fast capture ----- */
let captureRoomId = null;
function renderCapture() {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Fast capture — point, shoot, name, next'));
  if (inv.rooms.length === 0) {
    card.append(el('p', { class: 'hint', text: 'Add a room first (Rooms tab).' }));
    return card;
  }
  if (!captureRoomId || !inv.rooms.some(r => r.id === captureRoomId)) captureRoomId = inv.rooms[0].id;

  const roomSel = el('select', { 'aria-label': 'Room',
    onchange: (ev) => { captureRoomId = ev.target.value; } },
    ...inv.rooms.map(r => el('option', { value: r.id, text: r.name })));
  roomSel.value = captureRoomId;
  card.append(el('label', { class: 'f' }, el('span', {}, 'Room'), roomSel));

  const preview = el('img', { class: 'capturephoto' + (captureDraft.photo ? '' : ' hidden'), alt: 'Captured photo' });
  if (safeSrc(captureDraft.photo)) preview.src = captureDraft.photo;
  card.append(preview);
  card.append(el('button', { class: 'btn big' + (captureDraft.photo ? '' : ' primary'), type: 'button',
    onclick: async () => {
      const dataUrl = await pickImage();
      if (dataUrl) { captureDraft.photo = dataUrl; drawEditor(); }
    } }, captureDraft.photo ? 'Retake photo' : '📷 Take photo'));

  const nameIn = el('input', { type: 'text', placeholder: 'What is it? (e.g. “65-inch TV”)', maxlength: '80',
    style: 'margin-top:10px',
    onkeydown: (ev) => { if (ev.key === 'Enter') saveBtn.click(); } });
  const valueIn = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Value $ (optional)',
    onkeydown: (ev) => { if (ev.key === 'Enter') saveBtn.click(); } });
  const saveBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => {
    const name = nameIn.value.trim();
    if (!name) { toast('Give it a name — that’s the one required field'); return; }
    inv.items.push({
      id: newId(), roomId: captureRoomId, name: name.slice(0, 80),
      serial: '', purchaseDate: '', valueCents: parseValue(valueIn.value) || 0,
      notes: '', photo: safeSrc(captureDraft.photo), receipt: null,
    });
    captureDraft = { photo: null };
    touch(); drawEditor();
    toast('Saved — next one');
  } }, 'Save & next');
  card.append(el('div', { class: 'row', style: 'margin-top:10px' }, nameIn, valueIn),
    el('div', { style: 'margin-top:10px' }, saveBtn),
    el('p', { class: 'hint', text: 'Serial numbers, receipts, and purchase dates can be added later from the Items tab. Speed now, detail later.' }));

  const recent = roomItems(inv, captureRoomId).slice(-4).reverse();
  if (recent.length) {
    const list = el('ul', { class: 'plain', style: 'margin-top:8px' });
    for (const item of recent) list.append(renderItemRow(item));
    card.append(el('h2', { style: 'margin-top:14px' }, 'Just added in this room'), list);
  }
  return card;
}

/* ----- items ----- */
function renderItems() {
  const card = el('section', { class: 'card' }, el('h2', {}, inv.items.length + ' items'));
  const chips = el('div', { class: 'chips', style: 'margin-bottom:10px' });
  const mkChip = (id, label) => el('button', {
    class: 'chip' + (itemFilterRoom === id ? ' sel' : ''), type: 'button',
    onclick: () => { itemFilterRoom = id; drawEditor(); } }, label);
  chips.append(mkChip('all', 'All'));
  for (const r of inv.rooms) chips.append(mkChip(r.id, r.name));
  card.append(chips);
  const list = el('ul', { class: 'plain' });
  const items = itemFilterRoom === 'all' ? inv.items : roomItems(inv, itemFilterRoom);
  for (const item of [...items].reverse()) list.append(renderItemRow(item));
  if (items.length === 0) card.append(el('p', { class: 'hint', text: 'Nothing here yet — the Capture tab is the fast way in.' }));
  card.append(list);
  return card;
}

function renderItemRow(item) {
  const roomName = (inv.rooms.find(r => r.id === item.roomId) || {}).name || 'Unsorted';
  const thumb = safeSrc(item.photo)
    ? el('img', { class: 'thumb', src: item.photo, alt: '' })
    : el('div', { class: 'thumb empty', text: 'no photo' });
  return el('li', {},
    thumb,
    el('div', { class: 'grow' },
      el('div', { text: item.name }),
      el('div', { class: 'sub', text: [roomName, item.valueCents ? fmtCents(item.valueCents) : null, item.serial ? 'SN ' + item.serial : null].filter(Boolean).join(' · ') })),
    el('button', { class: 'btn small', type: 'button', onclick: () => openItemDlg(item) }, '✎'));
}

/* ----- rooms ----- */
function renderRooms() {
  const card = el('section', { class: 'card' }, el('h2', {}, 'Rooms'));
  const nameIn = el('input', { type: 'text', placeholder: 'Garage, attic, storage unit…', maxlength: '60',
    onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); } });
  const addBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', onclick: () => {
    const name = nameIn.value.trim();
    if (!name) return;
    inv.rooms.push({ id: newId(), name: name.slice(0, 60) });
    nameIn.value = '';
    touch(); drawEditor();
  } }, 'Add');
  card.append(el('div', { class: 'row' }, nameIn, addBtn));
  const list = el('ul', { class: 'plain', style: 'margin-top:8px' });
  for (const r of inv.rooms) {
    const n = roomItems(inv, r.id).length;
    list.append(el('li', {},
      el('div', { class: 'grow' }, el('div', { text: r.name }), el('div', { class: 'sub', text: n + ' items' })),
      el('button', { class: 'btn small', type: 'button', onclick: () => {
        const name = prompt('Rename room:', r.name);
        if (name && name.trim()) { r.name = name.trim().slice(0, 60); touch(); drawEditor(); }
      } }, '✎'),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete room', onclick: () => {
        if (!confirm(n ? 'Delete ' + r.name + '? Its ' + n + ' items move to “Unsorted”.' : 'Delete ' + r.name + '?')) return;
        inv.rooms = inv.rooms.filter(x => x.id !== r.id);
        touch(); drawEditor();
      } }, '✕')));
  }
  card.append(list);
  return card;
}

/* ----- export ----- */
function renderExport() {
  const out = [];
  out.push(el('div', { class: 'warnbanner' },
    'A local-only inventory that burns up with the house is a cruel joke. ',
    el('strong', {}, 'After exporting, email the files to yourself'), ' or save them to cloud storage — anywhere that isn’t this device.'));

  const card = el('section', { class: 'card' }, el('h2', {}, 'Exports'));
  const sizeSel = el('select', { style: 'flex:0 0 110px', 'aria-label': 'Page size',
    onchange: (ev) => { pageSize = ev.target.value; } },
    el('option', { value: 'letter', text: 'US Letter' }),
    el('option', { value: 'a4', text: 'A4' }));
  sizeSel.value = pageSize;
  card.append(el('div', { class: 'row', style: 'margin-bottom:6px' },
    el('span', { class: 'sub', style: 'align-self:center' }, 'Page size'), sizeSel));

  const exports = [
    ['Full report', 'Cover summary, then a page per room with photo grid and values.', makeInventoryPdf, 'inventory'],
    ['Adjuster’s list', 'Every item sorted by value, highest first — the format insurance adjusters ask for.', makeAdjusterPdf, 'by-value'],
  ];
  for (const [title, desc, fn, slug] of exports) {
    card.append(el('div', { class: 'exportcard' },
      el('div', { class: 'grow' }, el('b', {}, title), el('span', {}, desc)),
      el('button', { class: 'btn primary small', type: 'button', onclick: async (ev) => {
        const btn = ev.target;
        btn.disabled = true; btn.textContent = '…';
        try {
          const bytes = await fn(window.PDFLib, inv, pageSize);
          downloadBytes(bytes, slugify(inv.name) + '-' + slug + '.pdf', 'application/pdf');
          afterExportAsk();
        } catch (e) { toast('PDF failed: ' + (e.message || 'unknown error'), 5000); }
        btn.disabled = false; btn.textContent = 'PDF';
      } }, 'PDF')));
  }
  card.append(el('div', { class: 'exportcard' },
    el('div', { class: 'grow' }, el('b', {}, 'Backup file'), el('span', {}, 'Everything including photos, restorable on any device.')),
    el('button', { class: 'btn small', type: 'button', onclick: () => {
      const blob = new Blob([JSON.stringify(inv)], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: slugify(inv.name) + '.inventory.json' });
      document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Backup exported — now get it OFF this device', 5000);
    } }, '.json')));
  out.push(card);
  return out;
}

function slugify(s) {
  return String(s || 'inventory').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'inventory';
}
function downloadBytes(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function afterExportAsk() {
  if (!CONFIG.tipUrl) { toast('Exported ✓ — email it to yourself right now.', 5000); return; }
  const t = $('toast');
  t.replaceChildren('Exported ✓ — email it to yourself.  ',
    el('a', { href: CONFIG.tipUrl, target: '_blank', rel: 'noopener',
      style: 'color:inherit; text-decoration:underline; pointer-events:auto' }, 'Tip jar ♥'));
  t.style.pointerEvents = 'auto';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); t.style.pointerEvents = ''; }, 7000);
}

/* ---------- item dialog ---------- */
let itemEditing = null;
let dlgPhotos = { photo: undefined, receipt: undefined }; // staged: applied on Save only
function openItemDlg(item) {
  itemEditing = item;
  dlgPhotos = { photo: undefined, receipt: undefined };
  const photo = $('iPhoto');
  if (safeSrc(item.photo)) { photo.src = item.photo; photo.classList.remove('hidden'); }
  else photo.classList.add('hidden');
  const rec = $('iReceiptImg');
  if (safeSrc(item.receipt)) { rec.src = item.receipt; rec.classList.remove('hidden'); }
  else rec.classList.add('hidden');
  $('iName').value = item.name;
  const roomSel = $('iRoom');
  roomSel.replaceChildren(...inv.rooms.map(r => el('option', { value: r.id, text: r.name })));
  if (inv.rooms.some(r => r.id === item.roomId)) roomSel.value = item.roomId;
  // full precision — rounding here would corrupt the value on save
  $('iValue').value = item.valueCents ? String(item.valueCents / 100) : '';
  $('iSerial').value = item.serial || '';
  $('iDate').value = item.purchaseDate || '';
  $('iNotes').value = item.notes || '';
  showDlg($('itemDlg'));
}

function wire() {
  $('iSave').addEventListener('click', () => {
    const item = itemEditing;
    if (item) {
      item.name = $('iName').value.trim().slice(0, 80) || item.name;
      item.roomId = $('iRoom').value || item.roomId;
      item.valueCents = parseValue($('iValue').value) || 0;
      item.serial = $('iSerial').value.trim().slice(0, 60);
      item.purchaseDate = $('iDate').value;
      item.notes = $('iNotes').value.trim().slice(0, 300);
      if (dlgPhotos.photo !== undefined) item.photo = dlgPhotos.photo;
      if (dlgPhotos.receipt !== undefined) item.receipt = dlgPhotos.receipt;
      touch(); drawEditor();
    }
    closeDlg($('itemDlg'));
  });
  $('iCancel').addEventListener('click', () => closeDlg($('itemDlg')));
  $('iDelete').addEventListener('click', () => {
    if (!confirm('Delete ' + itemEditing.name + ' and its photos?')) return;
    inv.items = inv.items.filter(x => x.id !== itemEditing.id);
    touch(); drawEditor();
    closeDlg($('itemDlg'));
  });
  $('iRephoto').addEventListener('click', async () => {
    const dataUrl = await pickImage();
    if (dataUrl && itemEditing) {
      dlgPhotos.photo = dataUrl;          // staged — Cancel discards it
      $('iPhoto').src = dataUrl;
      $('iPhoto').classList.remove('hidden');
    }
  });
  $('iReceipt').addEventListener('click', async () => {
    const dataUrl = await pickImage();
    if (dataUrl && itemEditing) {
      dlgPhotos.receipt = dataUrl;        // staged — Cancel discards it
      $('iReceiptImg').src = dataUrl;
      $('iReceiptImg').classList.remove('hidden');
    }
  });
}

/* ---------- boot ---------- */
function render() {
  const r = route();
  if (r.view === 'editor') renderEditor(r.id);
  else renderHome();
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
