// Sitter Sheet — babysitter/pet-sitter one-pager. localStorage per mode,
// print-CSS output. All user data rendered via textContent.

const CONFIG = { tipUrl: 'https://buy.stripe.com/bJe28s1vj5P98zH7i17EQ0a' };

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

/* Field schema per mode. Each: [key, label, multiline, placeholder] grouped in sections. */
export const SCHEMAS = {
  baby: {
    title: 'Babysitter Sheet',
    sections: [
      ['The kids', [
        ['kids', 'Names & ages', true, 'Maya (6) — the negotiator\nLeo (3) — climbs everything'],
        ['bedtime', 'Bedtime & routine', true, '7:30 bath, 8:00 books, lights out 8:30. Leo needs his dinosaur.'],
        ['meals', 'Meals & snacks', true, 'Dinner is in the fridge — 90 sec in the microwave. No juice after 7.'],
      ]],
      ['Health & safety', [
        ['allergies', 'Allergies & medications', true, 'Maya: peanuts (EpiPen on the counter!). No meds tonight.'],
        ['rules', 'House rules', true, 'Screens off at 7. Backyard okay, front yard no.'],
      ]],
      ['Contacts', [
        ['parents', 'Us (the parents)', true, 'Sam: 555-0101\nRiver: 555-0102\nBack ~11pm — Luigi’s downtown'],
        ['backup', 'Backup person', false, 'Grandma Pat (next door): 555-033'],
        ['doctor', 'Doctor / after-hours', false, 'Dr. Chen — 555-0177'],
        ['address', 'Our address (for 911)', false, '412 Maple Ct'],
      ]],
      ['The house', [
        ['wifi', 'WiFi', false, 'Network: CasaSam · Password: hunter2!'],
        ['house', 'Quirks & where things are', true, 'Back door sticks — lift the handle. First-aid kit under the kitchen sink.'],
      ]],
    ],
    emergency: 'Emergency: call 911 first, then us. Poison Control: 1-800-222-1222.',
  },
  pet: {
    title: 'Pet Sitter Sheet',
    sections: [
      ['The animals', [
        ['pets', 'Names & who they are', true, 'Biscuit — golden retriever, 4. Friendly, dramatic about thunder.\nClementine — orange cat. Will lie about not being fed.'],
        ['feeding', 'Feeding', true, 'Biscuit: 1 cup kibble 7am & 6pm.\nClementine: half can wet food at 6pm. Water fountain on the counter.'],
        ['walks', 'Walks & litter', true, 'Biscuit: 20 min morning walk, harness by the door. Litter box in laundry room — scoop daily.'],
      ]],
      ['Health', [
        ['meds', 'Medications & allergies', true, 'Biscuit: joint chew with breakfast (jar on the fridge).'],
        ['vet', 'Vet & emergency vet', true, 'Parkside Vet: 555-0155\n24h ER: Animal Care Center, 555-0199'],
      ]],
      ['Contacts', [
        ['owner', 'Us (the owners)', true, 'Sam: 555-0101 — text anytime, send pictures!'],
        ['backup', 'Backup person', false, 'Neighbor Kim (has a key): 555-0144'],
        ['address', 'Our address', false, '412 Maple Ct'],
      ]],
      ['The house', [
        ['wifi', 'WiFi', false, 'Network: CasaSam · Password: hunter2!'],
        ['house', 'Quirks & where things are', true, 'Leash and treats in the mudroom. Biscuit is NOT allowed on the couch. He will tell you otherwise.'],
      ]],
    ],
    emergency: 'If anything feels wrong, call us first — then the emergency vet. Better a silly call than a sorry one.',
  },
};

let mode = 'baby';
const KEY = (m) => 'sitter-' + m;
let data = {};

function load() {
  try { data = JSON.parse(localStorage.getItem(KEY(mode))) || {}; }
  catch (e) { data = {}; }
}
function save() {
  try { localStorage.setItem(KEY(mode), JSON.stringify(data)); } catch (e) {}
}

function renderForm() {
  $('modeBaby').classList.toggle('active', mode === 'baby');
  $('modePet').classList.toggle('active', mode === 'pet');
  const schema = SCHEMAS[mode];
  const form = $('form');
  form.replaceChildren();
  for (const [section, fields] of schema.sections) {
    form.append(el('h2', {}, section));
    for (const [key, label, multi, placeholder] of fields) {
      const attrs = {
        placeholder, value: multi ? undefined : (data[key] || ''),
        oninput: (ev) => { data[key] = ev.target.value.slice(0, 2000); save(); },
      };
      const input = multi ? el('textarea', attrs) : el('input', { type: 'text', ...attrs });
      if (multi) input.value = data[key] || '';
      form.append(el('label', { class: 'f' }, el('span', {}, label), input));
    }
  }
}

function renderSheet() {
  const schema = SCHEMAS[mode];
  const sheet = $('sheet');
  sheet.replaceChildren();
  sheet.append(el('div', { class: 'shead' },
    el('h1', {}, schema.title),
    el('div', { class: 'sub', text: 'Thank you for taking care of them 💛' })));
  const filledSections = schema.sections
    .map(([name, fields]) => [name, fields.filter(([key]) => (data[key] || '').trim())])
    .filter(([, fields]) => fields.length);
  const colA = el('div', { class: 'col' });
  const colB = el('div', { class: 'col' });
  // balance columns by rough content height
  let a = 0, b = 0;
  for (const [name, fields] of filledSections) {
    const weight = fields.reduce((acc, [key]) => acc + 2 + (data[key].match(/\n/g) || []).length, 2);
    const target = a <= b ? colA : colB;
    if (target === colA) a += weight; else b += weight;
    for (const [key, label] of fields) {
      target.append(el('div', { class: 'block' },
        el('h2', {}, label),
        el('div', { class: 'v', text: data[key] })));
    }
  }
  sheet.append(el('div', { class: 'cols' }, colA, colB));
  sheet.append(el('div', { class: 'em' }, el('b', {}, '! '), schema.emergency));
}

function wire() {
  $('modeBaby').addEventListener('click', () => { mode = 'baby'; load(); renderForm(); });
  $('modePet').addEventListener('click', () => { mode = 'pet'; load(); renderForm(); });
  // Ctrl/Cmd+P must print the CURRENT sheet, not a blank or stale one
  window.addEventListener('beforeprint', renderSheet);
  $('printBtn').addEventListener('click', () => {
    if (!Object.values(data).some(v => (v || '').trim())) { toast('Fill in at least one field first'); return; }
    renderSheet();
    window.print();
  });
}

/* Share: the whole sheet travels inside the URL — nothing uploaded anywhere. */
function encodeSheet() {
  const filled = {};
  for (const [k, v] of Object.entries(data)) if ((v || '').trim()) filled[k] = v;
  const json = JSON.stringify({ m: mode, d: filled });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeSheet(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return null;
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || (obj.m !== 'baby' && obj.m !== 'pet') || typeof obj.d !== 'object' || !obj.d) return null;
    const keys = new Set(SCHEMAS[obj.m].sections.flatMap(([, fields]) => fields.map(([key]) => key)));
    const d = {};
    for (const [k, v] of Object.entries(obj.d))
      if (keys.has(k) && typeof v === 'string' && v.trim()) d[k] = v.slice(0, 2000);
    return Object.keys(d).length ? { mode: obj.m, data: d } : null;
  } catch (e) { return null; }
}
const hasContent = () => Object.values(data).some(v => (v || '').trim());
const sheetShareUrl = () => (location.origin === 'null' || location.protocol === 'file:'
  ? location.href.split('#')[0] : location.origin + location.pathname) + '#' + encodeSheet();

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  const shared = decodeSheet(location.hash);
  if (shared) {
    mode = shared.mode;
    load();
    // never silently destroy the user's own sheet to honor a tapped link
    if (!hasContent() || confirm('Open the shared sheet? Your saved one will be replaced.')) {
      data = shared.data;
      save();
      toast('Sheet loaded from the link');
    }
    history.replaceState(null, '', location.pathname);
  }
  renderForm();
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
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  copyText(sheetShareUrl(), 'Link copied \u2014 the whole sheet is inside it');
});
$('qrBtn').addEventListener('click', () => {
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  showQr(sheetShareUrl());
});
