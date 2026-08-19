// Packing list, pure logic. Tested in test/helpers.test.mjs.

/* Every limit in this app is named here and reported to the user at the moment
   it bites. A cap you only discover afterwards is the exact betrayal the
   research found in every competitor. */
export const MAX_LABEL = 60;      // characters in one item name
export const MAX_NAME = 60;       // characters in a trip name
export const MAX_SHARED = 300;    // items a shared link will carry

/* Categories exist so a merged 56-item list is not 56 unsorted rows. The order
   here is the order they are printed and shown in. */
export const CATEGORIES = [
  'Essentials', 'Documents', 'Toiletries & health', 'Clothing', 'Tech', 'Gear', 'Kids', 'Your items',
];
export const OTHER_CAT = 'Your items';

export const PRESETS = {
  essentials: [
    { label: 'Phone charger', cat: 'Tech' },
    { label: 'Wallet & ID', cat: 'Documents' },
    { label: 'Keys', cat: 'Essentials' },
    { label: 'Medications', cat: 'Toiletries & health' },
    { label: 'Toothbrush & toothpaste', cat: 'Toiletries & health' },
    { label: 'Deodorant', cat: 'Toiletries & health' },
    { label: 'Underwear', cat: 'Clothing' },
    { label: 'Socks', cat: 'Clothing' },
    { label: 'Sleepwear', cat: 'Clothing' },
  ],
  beach: [
    { label: 'Swimsuit', cat: 'Clothing' },
    { label: 'Sunscreen', cat: 'Toiletries & health' },
    { label: 'Sunglasses', cat: 'Clothing' },
    { label: 'Beach towel', cat: 'Gear' },
    { label: 'Sandals', cat: 'Clothing' },
    { label: 'Hat', cat: 'Clothing' },
    { label: 'After-sun lotion', cat: 'Toiletries & health' },
    { label: 'Waterproof phone pouch', cat: 'Tech' },
  ],
  camping: [
    { label: 'Tent', cat: 'Gear' },
    { label: 'Sleeping bag', cat: 'Gear' },
    { label: 'Headlamp', cat: 'Gear' },
    { label: 'Camp stove & fuel', cat: 'Gear' },
    { label: 'Water filter', cat: 'Gear' },
    { label: 'First-aid kit', cat: 'Toiletries & health' },
    { label: 'Bug spray', cat: 'Toiletries & health' },
    { label: 'Rain jacket', cat: 'Clothing' },
    { label: 'Multitool', cat: 'Gear' },
    { label: 'Matches/lighter', cat: 'Gear' },
  ],
  business: [
    { label: 'Laptop & charger', cat: 'Tech' },
    { label: 'Presentation clothes', cat: 'Clothing' },
    { label: 'Dress shoes', cat: 'Clothing' },
    { label: 'Notebook & pen', cat: 'Gear' },
    { label: 'Business cards', cat: 'Documents' },
    { label: 'Travel steamer', cat: 'Gear' },
    { label: 'Belt', cat: 'Clothing' },
  ],
  kids: [
    { label: 'Diapers/pull-ups', cat: 'Kids' },
    { label: 'Wipes', cat: 'Kids' },
    { label: 'Snacks (so many)', cat: 'Kids' },
    { label: 'Favorite stuffed animal', cat: 'Kids' },
    { label: 'Change of clothes ×2', cat: 'Kids' },
    { label: 'Tablet & headphones', cat: 'Kids' },
    { label: 'Sippy cup', cat: 'Kids' },
    { label: 'Stroller/carrier', cat: 'Kids' },
  ],
  international: [
    { label: 'Passport', cat: 'Documents' },
    { label: 'Travel adapter', cat: 'Tech' },
    { label: 'Local currency / card', cat: 'Documents' },
    { label: 'Copies of documents', cat: 'Documents' },
    { label: 'Phone plan / eSIM', cat: 'Tech' },
    { label: 'Neck pillow', cat: 'Gear' },
    { label: 'Pen for customs forms', cat: 'Documents' },
  ],
  winter: [
    { label: 'Warm coat', cat: 'Clothing' },
    { label: 'Gloves', cat: 'Clothing' },
    { label: 'Beanie', cat: 'Clothing' },
    { label: 'Thermal layers', cat: 'Clothing' },
    { label: 'Boots', cat: 'Clothing' },
    { label: 'Lip balm', cat: 'Toiletries & health' },
    { label: 'Hand warmers', cat: 'Gear' },
  ],
};

export const PRESET_LABELS = {
  essentials: '🧳 Essentials', beach: '🏖️ Beach', camping: '🏕️ Camping',
  business: '💼 Business', kids: '👶 With kids', international: '🌍 International', winter: '❄️ Winter',
};

/* A shared link carries only labels, to keep the QR payload as small as it can
   be. The recipient's categories are recovered from this table instead, free
   grouping for zero extra characters in the URL. */
const CAT_BY_LABEL = new Map();
for (const key of Object.keys(PRESETS)) {
  for (const p of PRESETS[key]) CAT_BY_LABEL.set(p.label.toLowerCase(), p.cat);
}
export function catFor(label) {
  return CAT_BY_LABEL.get(String(label || '').trim().toLowerCase()) || OTHER_CAT;
}

/* Unicode-normalised comparison key. Without NFC, "Café" typed on a Mac and
   "Café" pasted from a web page are different strings and the list ends up
   with two rows that look identical. */
const norm = (s) => String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Tidy a label the way the list wants it, and SAY whether anything was lost.
 * Pasted newlines become spaces rather than silently welding two words
 * together ("line one\nline two" used to arrive as "line onetwo").
 */
export function cleanLabel(raw, max) {
  const limit = max || MAX_LABEL;
  const full = String(raw == null ? '' : raw).normalize('NFC').replace(/\s+/g, ' ').trim();
  return { label: full.slice(0, limit), truncated: full.length > limit, dropped: Math.max(0, full.length - limit) };
}

/** Merge preset items into an existing list without duplicating. */
export function mergePreset(items, presetKey) {
  const preset = PRESETS[presetKey] || [];
  const have = new Set(items.map((i) => norm(i && i.label)));
  const added = [];
  for (const p of preset) {
    const k = norm(p.label);
    if (!have.has(k)) {
      added.push({ label: p.label, cat: p.cat, done: false });
      have.add(k);
    }
  }
  return { items: items.concat(added), added: added.length, skipped: preset.length - added.length, size: preset.length };
}

export function addCustom(items, raw) {
  const c = cleanLabel(raw);
  if (!c.label) return { items, added: 0, reason: 'empty', label: '', truncated: false };
  const k = norm(c.label);
  if (items.some((i) => norm(i && i.label) === k)) {
    return { items, added: 0, reason: 'duplicate', label: c.label, truncated: c.truncated };
  }
  return {
    items: items.concat([{ label: c.label, cat: catFor(c.label), done: false }]),
    added: 1, reason: 'added', label: c.label, truncated: c.truncated, dropped: c.dropped,
  };
}

/** Fold one list into another, what a couple sharing a trip actually wants. */
export function mergeItems(items, incoming) {
  const have = new Set(items.map((i) => norm(i && i.label)));
  const added = [];
  for (const it of incoming || []) {
    const label = it && typeof it.label === 'string' ? it.label : '';
    const k = norm(label);
    if (!k || have.has(k)) continue;
    have.add(k);
    added.push({ label, cat: it.cat || catFor(label), done: false });
  }
  return { items: items.concat(added), added: added.length, skipped: (incoming || []).length - added.length };
}

/**
 * One malformed entry used to brick the app permanently: {"items":[null]}
 * threw at boot and again on every preset tap. Storage is not a trusted input.
 */
export function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return { items: [], dropped: 0 };
  const out = [];
  let dropped = 0;
  for (const it of raw) {
    if (!it || typeof it !== 'object') { dropped++; continue; }
    const src = typeof it.label === 'string' ? it.label
      : (typeof it.label === 'number' && Number.isFinite(it.label) ? String(it.label) : '');
    const c = cleanLabel(src);
    if (!c.label) { dropped++; continue; }
    out.push({
      label: c.label,
      cat: typeof it.cat === 'string' && it.cat ? it.cat.slice(0, 40) : catFor(c.label),
      done: it.done === true,
    });
  }
  return { items: out, dropped };
}

export function stats(items) {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, remaining: items.length - done };
}

export function groupItems(items) {
  const map = new Map();
  for (const it of items) {
    const c = it.cat || OTHER_CAT;
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  const known = CATEGORIES.filter((c) => map.has(c));
  const extra = [...map.keys()].filter((c) => CATEGORIES.indexOf(c) < 0).sort();
  return known.concat(extra).map((c) => ({ cat: c, items: map.get(c) }));
}

/* URL-hash codec: share a list (checks reset for the recipient). */
export function encodeList(name, items) {
  const json = JSON.stringify({ n: name, i: items.map((i) => i.label) });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Returns one of:
 *   null, no share link in this hash at all
 *   { error: 'unreadable' }, there WAS one and it is broken/clipped
 *   { name, items, droppedItems, longLabels, nameTruncated }
 *
 * The old version returned null for every one of those, so a link clipped by an
 * SMS gateway rendered as an empty app with no message.
 */
export function decodeList(hash) {
  const raw = String(hash == null ? '' : hash).replace(/^#/, '').trim();
  if (!raw) return null;
  // Our payloads are long base64url. "#main" from the skip link is not a share.
  if (!/^[A-Za-z0-9_-]{16,}$/.test(raw)) return null;
  let obj;
  try {
    let s = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    obj = JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch (e) { return { error: 'unreadable' }; }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.i)) return { error: 'unreadable' };

  const all = obj.i.filter((x) => typeof x === 'string');
  const kept = all.slice(0, MAX_SHARED);
  let longLabels = 0;
  const items = [];
  for (const l of kept) {
    const c = cleanLabel(l);
    if (!c.label) continue;
    if (c.truncated) longLabels++;
    items.push({ label: c.label, cat: catFor(c.label), done: false });
  }
  const n = cleanLabel(typeof obj.n === 'string' ? obj.n : '', MAX_NAME);
  return {
    name: n.label || 'Shared list',
    items,
    droppedItems: all.length - kept.length,
    longLabels,
    nameTruncated: n.truncated,
  };
}
