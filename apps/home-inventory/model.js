// Home inventory, pure model logic. No DOM, no storage, no pdf-lib.
// "I wish I'd photographed everything before the fire." That's the product.

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

/* Every cap in the app, in one place, so the UI can SAY what the limit is
   instead of silently swallowing the 81st character. */
export const LIMITS = {
  name: 80,
  room: 60,
  serial: 60,
  brand: 40,
  model: 40,
  notes: 300,
  quantity: 9999,
  valueDollars: 99999999,
  pdfNameChars: null, // the PDF now fits by measured width, not by count
};

export const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor', 'Salvage'];

export function newInventory(name) {
  return {
    v: 2,
    id: newId(),
    name: name || 'Home inventory',
    rooms: [],   // {id, name}
    items: [],   // see newItem()
    draft: null, // a photo taken but not yet named, must survive an interruption
    lastExportAt: 0,
    updatedAt: 0,
  };
}

export function newItem(fields) {
  return sanitizeItem({ id: newId(), ...fields });
}

/* Money in integer cents; comma/format tolerant ("1.234,56" and "1,234.56"). */
export function parseValue(s) {
  if (typeof s === 'number') s = String(s);
  if (typeof s !== 'string') return null;
  s = s.trim().replace(/[$\s]/g, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  if (!s || !/^\d*\.?\d*$/.test(s) || s === '.') return null;
  const v = parseFloat(s);
  if (!isFinite(v) || v < 0 || v > LIMITS.valueDollars) return null;
  return Math.round(v * 100);
}

/* Money out. Cents are shown whenever there are any: rounding to whole dollars
   is how the adjuster PDF ended up with 312 rows of $20 under a total of
   $6,237, a document whose own column does not sum to its own total. */
export function fmtCents(cents, opts) {
  const n = (Number.isFinite(Number(cents)) ? Number(cents) : 0) / 100;
  const min = (opts && opts.pad) ? 2 : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: min, maximumFractionDigits: 2,
    }).format(n);
  } catch (e) {
    return '$' + n.toFixed(n % 1 ? 2 : min);
  }
}

export function roomItems(inv, roomId) {
  return (inv.items || []).filter(i => i && typeof i === 'object' && i.roomId === roomId);
}

/* ── Sanitising ──────────────────────────────────────────────────────────
   The app tells people the backup is plain JSON they can read and edit, so a
   hand-edited file is an EXPECTED input, not an exotic one. One bare `null`
   left in the items array used to throw inside totals() on every home render
   and take the whole home screen, including the Restore button, down with
   it. Everything that comes off disk or out of a file goes through here. */

const cleanStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const cleanCents = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), LIMITS.valueDollars * 100);
};
const cleanImg = (v) => (typeof v === 'string' && v.startsWith('data:image/')) ? v : null;

export function sanitizeItem(raw) {
  const o = (raw && typeof raw === 'object') ? raw : {};
  const q = Number(o.quantity);
  return {
    id: (typeof o.id === 'string' && o.id) ? o.id.slice(0, 40) : newId(),
    roomId: cleanStr(o.roomId, 40),
    name: cleanStr(o.name, LIMITS.name) || 'Untitled item',
    serial: cleanStr(o.serial, LIMITS.serial),
    brand: cleanStr(o.brand, LIMITS.brand),
    model: cleanStr(o.model, LIMITS.model),
    condition: CONDITIONS.indexOf(o.condition) >= 0 ? o.condition : '',
    quantity: (Number.isFinite(q) && q >= 1) ? Math.min(LIMITS.quantity, Math.round(q)) : 1,
    purchaseDate: cleanStr(o.purchaseDate, 10),
    valueCents: cleanCents(o.valueCents),
    replacementCents: cleanCents(o.replacementCents),
    notes: cleanStr(o.notes, LIMITS.notes),
    photo: cleanImg(o.photo),
    receipt: cleanImg(o.receipt),
  };
}

export function sanitizeInventory(raw) {
  const o = (raw && typeof raw === 'object') ? raw : {};
  const rooms = [];
  const seen = Object.create(null);
  for (const r of (Array.isArray(o.rooms) ? o.rooms : [])) {
    if (!r || typeof r !== 'object') continue;
    const id = (typeof r.id === 'string' && r.id) ? r.id.slice(0, 40) : newId();
    if (seen[id]) continue;
    seen[id] = 1;
    rooms.push({ id, name: cleanStr(r.name, LIMITS.room) || 'Room' });
  }
  // A bare `null` left behind by a sloppy text-editor delete is dropped, not
  // resurrected as a ghost row, and the caller counts and reports how many.
  const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object').map(sanitizeItem);
  const draftPhoto = cleanImg(o.draft && o.draft.photo);
  return {
    v: 2,
    id: (typeof o.id === 'string' && o.id) ? o.id.slice(0, 40) : newId(),
    name: cleanStr(o.name, LIMITS.name) || 'Imported inventory',
    rooms,
    items,
    draft: draftPhoto ? { photo: draftPhoto, roomId: cleanStr(o.draft.roomId, 40) } : null,
    lastExportAt: Number.isFinite(Number(o.lastExportAt)) ? Number(o.lastExportAt) : 0,
    updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : 0,
  };
}

/* Tolerant of partial objects (hand-edited or old backups), the home screen
   iterates every stored inventory and must never die on one bad row. */
export function totals(inv) {
  inv = { rooms: [], items: [], ...(inv && typeof inv === 'object' ? inv : {}) };
  const rooms = Array.isArray(inv.rooms) ? inv.rooms.filter(r => r && typeof r === 'object') : [];
  const items = Array.isArray(inv.items) ? inv.items.filter(i => i && typeof i === 'object') : [];
  const val = (i) => (Number.isFinite(Number(i.valueCents)) ? Number(i.valueCents) : 0);
  const qty = (i) => {
    const q = Number(i.quantity);
    return (Number.isFinite(q) && q >= 1) ? Math.min(LIMITS.quantity, Math.round(q)) : 1;
  };
  let count = 0, valueCents = 0, photos = 0, units = 0;
  const perRoom = [];
  for (const r of rooms) {
    const mine = items.filter(i => i.roomId === r.id);
    const v = mine.reduce((a, i) => a + val(i) * qty(i), 0);
    perRoom.push({ room: r, count: mine.length, valueCents: v });
    count += mine.length;
    units += mine.reduce((a, i) => a + qty(i), 0);
    valueCents += v;
    photos += mine.filter(i => i.photo).length;
  }
  const orphans = items.filter(i => !rooms.some(r => r.id === i.roomId));
  if (orphans.length) {
    const v = orphans.reduce((a, i) => a + val(i) * qty(i), 0);
    perRoom.push({ room: { id: '', name: 'Unsorted' }, count: orphans.length, valueCents: v });
    count += orphans.length;
    units += orphans.reduce((a, i) => a + qty(i), 0);
    valueCents += v;
    photos += orphans.filter(i => i.photo).length;
  }
  return { count, units, valueCents, photos, perRoom };
}

/* What adjusters actually want: everything, most valuable first. */
export function byValueDesc(inv) {
  const items = (inv.items || []).filter(i => i && typeof i === 'object');
  return items.sort((a, b) => ((b.valueCents || 0) * (b.quantity || 1)) - ((a.valueCents || 0) * (a.quantity || 1)));
}

export function dataUrlToBytes(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i < 0) return null;
  try {
    const bin = atob(dataUrl.slice(i + 1));
    const u = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
    return u;
  } catch (e) { return null; }
}

/* ── CSV ─────────────────────────────────────────────────────────────────
   Verisk's XactContents and ClaimXperience ingest spreadsheets, and State
   Farm publishes its Contents Inventory Aids in Excel. The PDF is the human
   exhibit; this is the file the other side of the table can actually load. */

export const CSV_COLUMNS = [
  'Quantity', 'Description', 'Brand/Make', 'Model', 'Serial', 'Room',
  'Purchase date', 'Condition', 'Original cost', 'Replacement cost',
  'Photo file', 'Notes',
];

function csvCell(v) {
  let s = (v === null || v === undefined) ? '' : String(v);
  // A cell starting = + - @ is executed as a formula by Excel and Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function photoFileName(item, index) {
  const stem = String(item.name || 'item').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'item';
  return 'photos/' + String(index + 1).padStart(3, '0') + '-' + stem + '.jpg';
}

/** Rows in the same order as the ZIP's photo files, so the two line up. */
export function csvRows(inv) {
  const roomName = Object.create(null);
  for (const r of (inv.rooms || [])) if (r && typeof r === 'object') roomName[r.id] = r.name;
  const items = (inv.items || []).filter(i => i && typeof i === 'object');
  return items.map((item, idx) => ({
    item,
    photoName: item.photo ? photoFileName(item, idx) : '',
    cells: [
      item.quantity || 1,
      item.name || '',
      item.brand || '',
      item.model || '',
      item.serial || '',
      roomName[item.roomId] || 'Unsorted',
      item.purchaseDate || '',
      item.condition || '',
      item.valueCents ? (item.valueCents / 100).toFixed(2) : '',
      item.replacementCents ? (item.replacementCents / 100).toFixed(2) : '',
      item.photo ? photoFileName(item, idx) : '',
      item.notes || '',
    ],
  }));
}

export function toCsv(inv) {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const row of csvRows(inv)) lines.push(row.cells.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}
