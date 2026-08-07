// Packing list — pure logic. Tested in test/helpers.test.mjs.

export const PRESETS = {
  essentials: ['Phone charger', 'Wallet & ID', 'Keys', 'Medications', 'Toothbrush & toothpaste', 'Deodorant', 'Underwear', 'Socks', 'Sleepwear'],
  beach: ['Swimsuit', 'Sunscreen', 'Sunglasses', 'Beach towel', 'Sandals', 'Hat', 'After-sun lotion', 'Waterproof phone pouch'],
  camping: ['Tent', 'Sleeping bag', 'Headlamp', 'Camp stove & fuel', 'Water filter', 'First-aid kit', 'Bug spray', 'Rain jacket', 'Multitool', 'Matches/lighter'],
  business: ['Laptop & charger', 'Presentation clothes', 'Dress shoes', 'Notebook & pen', 'Business cards', 'Travel steamer', 'Belt'],
  kids: ['Diapers/pull-ups', 'Wipes', 'Snacks (so many)', 'Favorite stuffed animal', 'Change of clothes ×2', 'Tablet & headphones', 'Sippy cup', 'Stroller/carrier'],
  international: ['Passport', 'Travel adapter', 'Local currency / card', 'Copies of documents', 'Phone plan / eSIM', 'Neck pillow', 'Pen for customs forms'],
  winter: ['Warm coat', 'Gloves', 'Beanie', 'Thermal layers', 'Boots', 'Lip balm', 'Hand warmers'],
};

export const PRESET_LABELS = {
  essentials: '🧳 Essentials', beach: '🏖️ Beach', camping: '🏕️ Camping',
  business: '💼 Business', kids: '👶 With kids', international: '🌍 International', winter: '❄️ Winter',
};

/* Merge preset items into an existing list without duplicating (case-insensitive). */
export function mergePreset(items, presetKey) {
  const preset = PRESETS[presetKey] || [];
  const have = new Set(items.map(i => i.label.toLowerCase()));
  const added = [];
  for (const label of preset) {
    if (!have.has(label.toLowerCase())) {
      added.push({ label, done: false });
      have.add(label.toLowerCase());
    }
  }
  return { items: items.concat(added), added: added.length };
}

export function addCustom(items, label) {
  label = String(label || '').trim().slice(0, 60);
  if (!label) return { items, added: 0 };
  if (items.some(i => i.label.toLowerCase() === label.toLowerCase())) return { items, added: 0 };
  return { items: items.concat([{ label, done: false }]), added: 1 };
}

export function stats(items) {
  const done = items.filter(i => i.done).length;
  return { done, total: items.length, remaining: items.length - done };
}

/* URL-hash codec: share a list (checks reset for the recipient). */
export function encodeList(name, items) {
  const json = JSON.stringify({ n: name, i: items.map(i => i.label) });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeList(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.i)) return null;
    return {
      name: typeof obj.n === 'string' ? obj.n.slice(0, 60) : 'Shared list',
      items: obj.i.filter(x => typeof x === 'string').slice(0, 300)
        .map(label => ({ label: label.slice(0, 60), done: false })),
    };
  } catch (e) { return null; }
}
