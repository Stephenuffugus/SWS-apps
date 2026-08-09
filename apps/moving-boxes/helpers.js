// Moving boxes — pure logic. Tested in test/helpers.test.mjs.

/* Every ceiling in the app, in one place, so the UI can quote the real number
   instead of enforcing it in silence. A cap the user discovers later is the
   exact betrayal the competitor reviews are full of. */
export const LIMITS = {
  boxes: 500,
  itemsPerBox: 100,
  itemChars: 60,
  roomChars: 40,
  boxNumber: 9999,
};

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

/* The box number is the only identifier the household and the movers share, so
   it has to survive being typed at 11pm. Rejects 0, negatives, '1e3', decimals
   and the 20-digit paste that used to poison auto-numbering forever. */
export function parseBoxNumber(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  if (!s) return { n: null, error: null };
  if (!/^[0-9]+$/.test(s)) {
    return { n: null, error: 'Box numbers are whole numbers — “' + s + '” isn’t one.' };
  }
  const n = parseInt(s, 10);
  if (n < 1) return { n: null, error: 'Box numbers start at 1.' };
  if (n > LIMITS.boxNumber) {
    return { n: null, error: 'Box numbers stop at ' + LIMITS.boxNumber + '.' };
  }
  return { n, error: null };
}

export function nextBoxNumber(boxes) {
  let max = 0;
  for (const b of (Array.isArray(boxes) ? boxes : [])) {
    const n = b && Number.isInteger(b.n) && b.n > 0 && b.n <= LIMITS.boxNumber ? b.n : 0;
    if (n > max) max = n;
  }
  return Math.min(max + 1, LIMITS.boxNumber);
}

/* Returns what was kept AND what was thrown away, because the caller has to
   say so out loud. parseItems() keeps the old array-only signature. */
export function parseItemsDetailed(text) {
  if (typeof text !== 'string') return { items: [], dropped: 0, shortened: 0 };
  const all = text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
  const kept = all.slice(0, LIMITS.itemsPerBox);
  let shortened = 0;
  const items = kept.map((s) => {
    if (s.length <= LIMITS.itemChars) return s;
    shortened++;
    return s.slice(0, LIMITS.itemChars);
  });
  return { items, dropped: all.length - kept.length, shortened };
}
export function parseItems(text) {
  return parseItemsDetailed(text).items;
}

/* One record, made safe. Returns null only when there is nothing recoverable —
   a box with no usable number. Everything else is repaired, never discarded:
   a box whose `items` came back as a string still has a number and a room, and
   losing the whole move because of it is the top complaint in the category. */
function sanitizeBox(raw, tally) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const n = typeof raw.n === 'number' ? raw.n : Number(raw.n);
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.boxNumber) return null;

  let repaired = false;
  let room = '';
  if (typeof raw.room === 'string') room = raw.room.slice(0, LIMITS.roomChars);
  else if (raw.room !== undefined && raw.room !== null) repaired = true;

  let src = [];
  if (Array.isArray(raw.items)) {
    const strings = raw.items.filter(x => typeof x === 'string' && x.trim());
    if (strings.length !== raw.items.length) repaired = true;
    src = strings;
  } else if (raw.items !== undefined && raw.items !== null) {
    repaired = true;
  }

  const kept = src.slice(0, LIMITS.itemsPerBox);
  if (tally) tally.itemsDropped += src.length - kept.length;
  const items = kept.map((s) => {
    const t = s.trim();
    if (t.length <= LIMITS.itemChars) return t;
    if (tally) tally.shortened++;
    return t.slice(0, LIMITS.itemChars);
  });

  if (tally && repaired) tally.repaired++;
  const id = String(raw.id === undefined || raw.id === null ? '' : raw.id).slice(0, 12);
  return { id: id || newId(), n, room, items };
}

/* Used by BOTH load() and import — the reason the two paths used to disagree
   is that only one of them validated. */
export function sanitizeBoxes(arr) {
  const tally = { boxes: [], skipped: 0, overflow: 0, itemsDropped: 0, shortened: 0, repaired: 0 };
  if (!Array.isArray(arr)) { tally.unusable = true; return tally; }
  for (const raw of arr) {
    if (tally.boxes.length >= LIMITS.boxes) { tally.overflow++; continue; }
    const b = sanitizeBox(raw, tally);
    if (b) tally.boxes.push(b); else tally.skipped++;
  }
  return tally;
}

/* Import merges by box number: the number is the identity of a physical box,
   so importing a newer backup should update box #12, not fork it. */
export function mergeBoxes(current, incoming) {
  const out = (Array.isArray(current) ? current : []).map(b => ({ ...b, items: [...b.items] }));
  const at = new Map();
  out.forEach((b, i) => { if (!at.has(b.n)) at.set(b.n, i); });
  let added = 0, updated = 0, overflow = 0, unchanged = 0;
  for (const b of incoming) {
    const i = at.get(b.n);
    if (i !== undefined) {
      const was = out[i];
      const same = was.room === b.room && was.items.length === b.items.length
        && was.items.every((x, k) => x === b.items[k]);
      out[i] = { ...b, id: was.id };
      if (same) unchanged++; else updated++;
    } else if (out.length >= LIMITS.boxes) {
      overflow++;
    } else {
      at.set(b.n, out.length);
      out.push(b);
      added++;
    }
  }
  return { boxes: out, added, updated, unchanged, overflow };
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

/* A spreadsheet is what a normal person means by "a copy of my list", so the
   CSV is a first-class export. Leading =,+,-,@ get quoted off so opening the
   file in Excel cannot execute a cell someone typed into a box list. */
export function boxesToCsv(boxes) {
  const cell = (v) => {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = [['Box', 'Room', 'Things inside', 'Contents'].map(cell).join(',')];
  for (const b of [...boxes].sort((x, y) => x.n - y.n)) {
    rows.push([b.n, b.room || '', b.items.length, b.items.join('; ')].map(cell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

/* Label QR payload: the box travels inside the link, so scanning a label on
   moving day shows the contents on any phone — no account, no lookup server. */
export function encodeBox(box) {
  const o = { n: box.n, r: box.room, i: box.items };
  if (Number.isInteger(box.total) && box.total > 0) o.t = box.total;
  const json = JSON.stringify(o);
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
      room: String(obj.r || '').slice(0, LIMITS.roomChars),
      items: Array.isArray(obj.i)
        ? obj.i.filter(x => typeof x === 'string').slice(0, LIMITS.itemsPerBox)
          .map(x => x.slice(0, LIMITS.itemChars))
        : [],
      total: Number.isInteger(obj.t) && obj.t > 0 ? obj.t : null,
    };
  } catch (e) { return null; }
}
export const isBoxHash = (hash) => /^#b\./.test(String(hash || ''));

/* Fit a box into one label QR.
 *
 * `fit` is either a character budget or, better, a predicate the caller builds
 * from the REAL constraint — how many modules the finished code has, and
 * therefore how wide each module prints. A character cap cannot see that: the
 * old 900-char ceiling produced 101-module codes that printed at 0.278mm per
 * module, which no phone camera reads off cardboard in a garage.
 *
 * Returns { payload, kept, dropped } so the caller can tell the user which
 * boxes lost contents instead of hiding it behind a "+N more" marker.
 */
export function encodeBoxForLabel(box, fit = 900) {
  const test = typeof fit === 'function' ? fit : (enc) => enc.length <= fit;
  const items = Array.isArray(box.items) ? box.items : [];
  const total = items.length;
  const build = (k) => {
    const kept = items.slice(0, k);
    const dropped = total - k;
    if (dropped) kept.push('…plus ' + dropped + ' more — on the packing list');
    return { payload: encodeBox({ ...box, items: kept }), kept: k, dropped };
  };

  const whole = build(total);
  if (test(whole.payload)) return whole;

  // Payload length grows with the item count, so the largest k that fits is a
  // binary search — 7 encodes for a 100-item box instead of 100.
  let lo = 0, hi = total - 1, best = build(0);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = build(mid);
    if (test(c.payload)) { best = c; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best;
}
