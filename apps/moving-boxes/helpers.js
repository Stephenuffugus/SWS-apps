// Moving boxes — pure logic. Tested in test/helpers.test.mjs.

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

export function nextBoxNumber(boxes) {
  return boxes.reduce((m, b) => Math.max(m, b.n || 0), 0) + 1;
}

export function parseItems(text) {
  if (typeof text !== 'string') return [];
  return text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).slice(0, 100)
    .map(s => s.slice(0, 60));
}

/* "which box has the can opener" — search items, rooms, and numbers. */
export function searchBoxes(boxes, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const b of boxes) {
    const hitItems = b.items.filter(i => i.toLowerCase().includes(q));
    const roomHit = (b.room || '').toLowerCase().includes(q);
    const numHit = String(b.n) === q.replace(/^#/, '');
    if (hitItems.length || roomHit || numHit) out.push({ box: b, hitItems });
  }
  return out;
}

/* Label QR payload: the box travels inside the link, so scanning a label on
   moving day shows the contents on any phone — no account, no lookup server. */
export function encodeBox(box) {
  const json = JSON.stringify({ n: box.n, r: box.room, i: box.items });
  return 'b.' + btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBox(hash) {
  try {
    let s = String(hash || '').replace(/^#b\./, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Number.isInteger(obj.n)) return null;
    return {
      n: obj.n,
      room: String(obj.r || '').slice(0, 40),
      items: Array.isArray(obj.i) ? obj.i.filter(x => typeof x === 'string').slice(0, 100).map(x => x.slice(0, 60)) : [],
    };
  } catch (e) { return null; }
}
export const isBoxHash = (hash) => /^#b\./.test(String(hash || ''));

/* Label QRs must stay scannable at 30mm — cap the payload, truncating the
   item list with an honest "+N more" marker rather than failing silently. */
export function encodeBoxForLabel(box, maxChars = 900) {
  let items = [...box.items];
  let removed = 0;
  for (;;) {
    const withMarker = removed ? items.concat(['…plus ' + removed + ' more (see packing list)']) : items;
    const enc = encodeBox({ n: box.n, room: box.room, items: withMarker });
    if (enc.length <= maxChars || items.length === 0) return enc;
    items.pop();
    removed++;
  }
}
