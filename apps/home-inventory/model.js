// Home inventory — pure model logic. No DOM, no storage, no pdf-lib.
// "I wish I'd photographed everything before the fire." That's the product.

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

export function newInventory(name) {
  return {
    v: 1,
    id: newId(),
    name: name || 'Home inventory',
    rooms: [],   // {id, name}
    items: [],   // {id, roomId, name, serial, purchaseDate, valueCents, notes,
                 //  photo (jpeg dataURL|null), receipt (jpeg dataURL|null)}
    updatedAt: 0,
  };
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
  if (!isFinite(v) || v < 0 || v > 99999999) return null;
  return Math.round(v * 100);
}

export function fmtCents(cents) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
      .format(Math.round((cents || 0) / 100));
  } catch (e) { return '$' + Math.round((cents || 0) / 100); }
}

export function roomItems(inv, roomId) {
  return (inv.items || []).filter(i => i.roomId === roomId);
}

/* Tolerant of partial objects (hand-edited or old backups) — the home screen
   iterates every stored inventory and must never die on one bad row. */
export function totals(inv) {
  inv = { rooms: [], items: [], ...inv };
  let count = 0, valueCents = 0, photos = 0;
  const perRoom = [];
  for (const r of inv.rooms) {
    const items = roomItems(inv, r.id);
    const v = items.reduce((a, i) => a + (i.valueCents || 0), 0);
    perRoom.push({ room: r, count: items.length, valueCents: v });
    count += items.length;
    valueCents += v;
    photos += items.filter(i => i.photo).length;
  }
  const orphans = inv.items.filter(i => !inv.rooms.some(r => r.id === i.roomId));
  if (orphans.length) {
    const v = orphans.reduce((a, i) => a + (i.valueCents || 0), 0);
    perRoom.push({ room: { id: '', name: 'Unsorted' }, count: orphans.length, valueCents: v });
    count += orphans.length;
    valueCents += v;
    photos += orphans.filter(i => i.photo).length;
  }
  return { count, valueCents, photos, perRoom };
}

/* What adjusters actually want: everything, most valuable first. */
export function byValueDesc(inv) {
  return [...inv.items].sort((a, b) => (b.valueCents || 0) - (a.valueCents || 0));
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
