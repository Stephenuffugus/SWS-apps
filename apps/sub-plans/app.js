// Sub Plans — substitute folder builder. localStorage, print-CSS output,
// whole-folder-in-a-link share. All user data rendered via textContent.

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
  // clear first: repeating an identical string fires no live-region announcement
  t.textContent = '';
  setTimeout(() => { t.textContent = msg; }, 10);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy'); }
}

/* Field schema. Each field: [key, label, multiline, placeholder].
   HEADER_KEYS compose the printed header; EMERGENCY_KEYS print in the red
   box up top; everything else prints as sections in order. */
export const SCHEMA = {
  title: 'Sub Plans',
  sections: [
    ['The basics', [
      ['teacher', 'Your name', false, 'Ms. Rivera'],
      ['class', 'Class & grade', false, '3rd grade — 24 kids'],
      ['room', 'Room', false, '12'],
      ['school', 'School', false, 'Maple Elementary'],
    ]],
    ['Today', [
      ['date', 'Date (leave blank for the binder copy)', false, 'Tuesday, Sep 8'],
      ['plan', 'The plan, hour by hour', true, '8:00 Morning work — packet on my desk\n9:15 Math — video queued on the laptop, then worksheet p. 34\n11:30 Lunch — they walk themselves down at 11:28\n12:15 Read-aloud — the bookmark is in the book\n2:45 Pack up, stack chairs'],
      ['backup', 'If you run out of material', true, 'Extra worksheets in the blue tray. Silent reading always works. They will tell you Fun Friday is a thing. It is not.'],
    ]],
    ['The class', [
      ['helpers', 'Helpers you can trust', true, 'Ava and Marcus know every routine — ask them anything.'],
      ['needs', 'Kids who need something', true, 'Jordan sits up front (glasses). Sam leaves at 1:40 for speech — he knows the way.'],
      ['behavior', 'Behavior system', true, 'Marble jar on my desk — add for good choices, never take away. If someone is really struggling, Mrs. Alvarez next door will take them for a reset.'],
    ]],
    ['Routines', [
      ['schedule', 'Bell schedule', true, '8:00 First bell — pick them up at door 4\n10:30 Recess\n11:30 Lunch\n1:00 Specials (Mon art · Tue music · Wed PE)\n3:05 Dismissal'],
      ['attendance', 'Attendance', true, 'Clipboard by the door — take it by 8:15, a helper runs the slip to the office.'],
      ['bathroom', 'Bathroom & hallway', true, 'One at a time, with the pass hanging by the door.'],
      ['dismissal', 'Dismissal', true, 'Bus riders leave at 3:05 — the list is taped by the door. Pickup kids wait on the rug until called.'],
    ]],
    ['Where things are', [
      ['where', 'Where things are', true, 'Seating chart taped to my desk. Today’s materials in the tray marked TODAY. Extra pencils in the red bin.'],
      ['tech', 'Tech', true, 'Laptop password is on a card in the top drawer. Projector remote lives in the mug. If the board freezes, unplug the black cable and count to ten.'],
    ]],
    ['People to lean on', [
      ['neighbor', 'Teacher next door', false, 'Mrs. Alvarez, Rm 14 — she knows my routines'],
      ['office', 'Office / front desk', false, 'Ext. 100'],
      ['nurse', 'Nurse', false, 'Ext. 108'],
      ['admin', 'Admin on duty', false, 'Mr. Okafor — ext. 103'],
    ]],
    ['Emergencies', [
      ['drills', 'Fire · lockdown · drills', true, 'Fire: out our door, turn left, flagpole. Grab the class list hanging by the door.\nLockdown: lights off, door locked, everyone in the corner by the cubbies.'],
      ['health', 'Health alerts', true, 'Maya R: peanut allergy — EpiPen is in the nurse’s office, plan in the red folder on my desk.'],
    ]],
    ['End of the day', [
      ['note', 'Anything else + a thank-you', true, 'Leave the room roughly standing and a note about how it went — that’s all I ask. Thank you SO much for being here.'],
    ]],
  ],
};
const HEADER_KEYS = ['teacher', 'class', 'room', 'school', 'date'];
const EMERGENCY_KEYS = ['drills', 'health'];
const FIELD_CAP = 4000;

const KEY = 'subplans';
let data = {};

function load() {
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { data = {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

function renderForm() {
  const form = $('form');
  form.replaceChildren();
  for (const [section, fields] of SCHEMA.sections) {
    form.append(el('h2', {}, section));
    for (const [key, label, multi, placeholder] of fields) {
      const attrs = {
        placeholder, value: multi ? undefined : (data[key] || ''),
        oninput: (ev) => { data[key] = ev.target.value.slice(0, FIELD_CAP); save(); },
      };
      const input = multi ? el('textarea', attrs) : el('input', { type: 'text', ...attrs });
      if (multi) input.value = data[key] || '';
      form.append(el('label', { class: 'f' }, el('span', {}, label), input));
    }
  }
}

const filled = (key) => (data[key] || '').trim();

function renderSheet() {
  const sheet = $('sheet');
  sheet.replaceChildren();

  // header composed from the basics
  const subBits = ['class', 'room', 'school', 'date']
    .map((k) => (k === 'room' && filled(k) ? 'Room ' + data[k].trim() : filled(k)))
    .filter(Boolean);
  sheet.append(el('div', { class: 'shead' },
    el('h1', {}, 'Sub Plans' + (filled('teacher') ? ' — ' + data.teacher.trim() : '')),
    subBits.length ? el('div', { class: 'sub', text: subBits.join(' · ') }) : null,
    el('div', { class: 'warm', text: 'Thank you for being here today — this folder has everything you need.' })));

  // emergency box first: the page a sub needs before anything goes wrong
  const em = EMERGENCY_KEYS.filter(filled);
  if (em.length) {
    const box = el('div', { class: 'em' }, el('h2', {}, 'In an emergency'));
    const labels = { drills: 'Fire · lockdown · drills', health: 'Health alerts' };
    for (const key of em) {
      box.append(el('div', { class: 'block' },
        el('h3', {}, labels[key]),
        el('div', { class: 'v', text: data[key] })));
    }
    sheet.append(box);
  }

  // remaining sections in schema order
  for (const [section, fields] of SCHEMA.sections) {
    if (section === 'The basics' || section === 'Emergencies') continue;
    const keep = fields.filter(([key]) => !HEADER_KEYS.includes(key) && filled(key));
    if (section !== 'End of the day' && !keep.length) continue;
    const sec = el('div', { class: 'sec' }, el('h2', {}, section));
    for (const [key, label] of keep) {
      sec.append(el('div', { class: 'block' },
        el('h3', {}, label),
        el('div', { class: 'v', text: data[key] })));
    }
    if (section === 'End of the day') {
      sec.append(el('div', { class: 'noteback' },
        el('h3', {}, 'How did it go? Leave me a note —')));
    }
    sheet.append(sec);
  }
}

const hasContent = () => SCHEMA.sections.some(([, fields]) => fields.some(([key]) => filled(key)));

function wire() {
  // Ctrl/Cmd+P must print the CURRENT folder, not a blank or stale one
  window.addEventListener('beforeprint', renderSheet);
  $('printBtn').addEventListener('click', () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    renderSheet();
    window.print();
  });
}

/* Share: the whole folder travels inside the URL — nothing uploaded anywhere. */
function encodeSheet() {
  const d = {};
  for (const [k, v] of Object.entries(data)) if ((v || '').trim()) d[k] = v;
  const json = JSON.stringify({ v: 1, d });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeSheet(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return null;
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || obj.v !== 1 || typeof obj.d !== 'object' || !obj.d) return null;
    const keys = new Set(SCHEMA.sections.flatMap(([, fields]) => fields.map(([key]) => key)));
    const d = {};
    for (const [k, v] of Object.entries(obj.d))
      if (keys.has(k) && typeof v === 'string' && v.trim()) d[k] = v.slice(0, FIELD_CAP);
    return Object.keys(d).length ? d : null;
  } catch (e) { return null; }
}
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
    // never silently destroy the teacher's own folder to honor a tapped link
    if (!hasContent() || confirm('Open the shared folder? Your saved one will be replaced.')) {
      data = shared;
      save();
      toast('Folder loaded from the link', 4000);
    }
    history.replaceState(null, '', location.pathname);
  }
  renderForm();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

/* ---------- QR share ---------- */
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
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); $('qrClose').focus(); }
}
$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
$('shareBtn').addEventListener('click', () => {
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  copyText(sheetShareUrl(), 'Link copied — the whole folder is inside it');
});
$('qrBtn').addEventListener('click', () => {
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  const url = sheetShareUrl();
  // past ~1.2KB the QR modules get too small for phone cameras to scan
  if (url.length > 1200) { toast('This folder is too big for a QR — use Copy link instead'); return; }
  showQr(url);
});
