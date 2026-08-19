// Sub Plans, substitute folder builder. localStorage, print-CSS output,
// whole-folder-in-a-link share. All user data rendered via textContent.
//
// Nothing here talks to a network. The only way a word of this leaves the
// device is a link the teacher copies by hand, and the link carries the folder
// inside its own fragment rather than pointing at a server.

const CONFIG = { tipUrl: 'https://buy.stripe.com/bJe3cw8XLfpJ6rz8m57EQ0o' };

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

/* One toast, driven through the shared runtime so an Undo button and a plain
   status message cannot fight over the same element. The element is cleared
   first because repeating an identical string fires no live-region
   announcement. */
function toast(msg, ms, opts) {
  const t = $('toast');
  if (t) t.replaceChildren();
  setTimeout(() => {
    const o = Object.assign({ ms: ms || 2400 }, opts || {});
    if (window.SWS) window.SWS.toast(msg, o);
    else if (t) { t.textContent = msg; t.classList.add('show'); }
  }, 10);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied', 4000); }
  catch (e) { toast('Could not copy'); }
}

/* Field schema. Each field: [key, label, multiline, placeholder].
   HEADER_KEYS compose the printed header; EMERGENCY_KEYS print in the alert
   box up top; FIRST_KEYS print in the "first ten minutes" block that is pinned
   to page 1; everything else prints as sections in order. */
export const SCHEMA = {
  title: 'Sub Plans',
  sections: [
    ['The basics', [
      ['teacher', 'Your name', false, 'Ms. Rivera'],
      ['class', 'Class & grade', false, '3rd grade, 24 kids'],
      ['room', 'Room', false, '12'],
      ['school', 'School', false, 'Maple Elementary'],
    ]],
    ['Today', [
      ['date', 'Date (leave blank for the binder copy)', false, 'Tuesday, Sep 8'],
      ['plan', 'The plan, hour by hour', true, '8:00 Morning work, packet on my desk\n9:15 Math, video queued on the laptop, then worksheet p. 34\n11:30 Lunch, they walk themselves down at 11:28\n12:15 Read-aloud, the bookmark is in the book\n2:45 Pack up, stack chairs'],
      ['backup', 'If you run out of material', true, 'Extra worksheets in the blue tray. Silent reading always works. They will tell you Fun Friday is a thing. It is not.'],
    ]],
    ['First ten minutes', [
      ['bathroom', 'Bathroom & hallway', true, 'One at a time, with the pass hanging by the door.'],
      ['wifi', 'WiFi & computer passwords', true, 'WiFi: MapleGuest / maple2024!\nLaptop: rivera12'],
      ['office', 'Office / front desk', false, 'Ext. 100'],
      ['neighbor', 'Teacher next door', false, 'Mrs. Alvarez, Rm 14, she knows my routines'],
    ]],
    ['The class', [
      ['helpers', 'Helpers you can trust', true, 'Ava and Marcus know every routine, ask them anything.'],
      ['needs', 'Kids who need something', true, 'Jordan sits up front (glasses). Sam leaves at 1:40 for speech, he knows the way.'],
      ['behavior', 'Behavior system', true, 'Marble jar on my desk, add for good choices, never take away. If someone is really struggling, Mrs. Alvarez next door will take them for a reset.'],
    ]],
    ['Routines', [
      ['schedule', 'Bell schedule', true, '8:00 First bell, pick them up at door 4\n10:30 Recess\n11:30 Lunch\n1:00 Specials (Mon art · Tue music · Wed PE)\n3:05 Dismissal'],
      ['attendance', 'Attendance', true, 'Clipboard by the door, take it by 8:15, a helper runs the slip to the office.'],
      ['dismissal', 'Dismissal', true, 'Bus riders leave at 3:05, the list is taped by the door. Pickup kids wait on the rug until called.'],
    ]],
    ['Where things are', [
      ['where', 'Where things are', true, 'Seating chart taped to my desk. Today’s materials in the tray marked TODAY. Extra pencils in the red bin.'],
      ['tech', 'Tech', true, 'Projector remote lives in the mug. If the board freezes, unplug the black cable and count to ten.'],
    ]],
    ['People to lean on', [
      ['nurse', 'Nurse', false, 'Ext. 108'],
      ['admin', 'Admin on duty', false, 'Mr. Okafor, ext. 103'],
    ]],
    ['Emergencies', [
      ['drills', 'Fire · lockdown · drills', true, 'Fire: out our door, turn left, flagpole. Grab the class list hanging by the door.\nLockdown: lights off, door locked, everyone in the corner by the cubbies.'],
      ['health', 'Health alerts', true, 'Maya R: peanut allergy, EpiPen is in the nurse’s office, plan in the red folder on my desk.'],
    ]],
    ['End of the day', [
      ['note', 'Anything else + a thank-you', true, 'Leave the room roughly standing and a note about how it went, that’s all I ask. Thank you SO much for being here.'],
    ]],
  ],
};

/* Secondary school is half the audience and the examples above are all
   elementary. Same fields, different worked examples, a teacher who reads
   "marble jar on my desk" concludes the tool was built for somebody else. */
const SECONDARY = {
  class: ['Classes & grade', '8th grade science, 6 periods, 3 preps'],
  plan: ['The plan, period by period', 'P1 8:05 Bio, video queued, worksheet in the P1 tray\nP2 9:00 Bio, same\nP3 9:55 Phys Sci, reading p. 112 + questions 1-8\nP4 10:50 PREP, no class\nP5 11:45 Lunch duty, cafeteria east door\nP6 12:40 Phys Sci, same as P3\nP7 1:35 Bio, same as P1'],
  backup: ['If you run out of material', 'Article + five questions in the folder marked SUB on the desk. Silent reading is fine. Do not start the lab.'],
  helpers: ['Students you can trust', 'P1 ask Dev or Amara. P3 ask Kayla, she runs the attendance slip.'],
  needs: ['Students who need something', 'P2 Jordan sits front (glasses). P6 Sam leaves at 1:40, signed out, he knows.'],
  behavior: ['Behavior & phones', 'Phones in the wall caddy at the bell. Warning, then move the seat, then write it up. Referral forms are in the top drawer.'],
  schedule: ['Period times', 'P1 8:05 · P2 9:00 · P3 9:55 · P4 10:50 · P5 11:45 · P6 12:40 · P7 1:35\nBells are two minutes early on Wednesdays (advisory).'],
  attendance: ['Attendance', 'Take it in the first five minutes of every period, the tablet is on the podium, it logs you out between bells.'],
  dismissal: ['End of each period', 'Nobody leaves before the bell. Stack stools, close the gas taps at the back bench.'],
  where: ['Where things are', 'Seating charts for all six periods in the black binder on the desk, one per tab. Handouts in the trays by period.'],
  tech: ['Tech', 'Projector remote lives in the mug. If the board freezes, unplug the black cable and count to ten.'],
  note: ['Anything else + a thank-you', 'Leave me the period-by-period rundown if you can, thank you for taking six groups of teenagers on short notice.'],
};

const HEADER_KEYS = ['teacher', 'class', 'room', 'school', 'date'];
const EMERGENCY_KEYS = ['drills', 'health'];
/* Everything a substitute hunts for in the first ten minutes, pinned above the
   fold of page 1. `room` also appears in the header line; two characters of
   duplication is cheaper than making her look in two places. */
const FIRST_KEYS = ['room', 'bathroom', 'wifi', 'office', 'neighbor'];
const FIRST_LABELS = {
  room: 'Room', bathroom: 'Bathroom & hallway', wifi: 'WiFi & computer passwords',
  office: 'Office / front desk', neighbor: 'Teacher next door',
};
const MONO_KEYS = ['wifi'];
/* Keys promoted into the page-1 block, so they do not also print further down. */
const PROMOTED = FIRST_KEYS.filter((k) => !HEADER_KEYS.includes(k));
const TODAY_SECTIONS = ['Today', 'Emergencies'];

const FIELD_CAP = 4000;
const CAP_WARN_AT = 3200;
/* Above this the QR needs modules smaller than about 0.4mm to fit on paper,
   which no phone camera reads off a photocopy. Measured, not guessed. */
const MAX_QR_URL = 1650;
const MAX_QR_MODULES = 137;
/* Letter, less the base layer's 14mm @page margin. */
const PAGE_PT = 792 - 2 * 39.685;

const KEY = 'subplans';
const BAND_KEY = 'subplans.band';
const QRP_KEY = 'subplans.qrpaper';
let data = {};
let band = 'elementary';
/* Off by default: a scannable QR of a whole binder is a 56mm square, and it
   costs about half a page. Page count is the loudest complaint in this
   category, so this is the teacher's trade to make, with the cost shown live
   on the Print button. */
let qrOnPaper = false;
let storageBroken = false;
let capWarned = false;

function load() {
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { data = {}; }
  try { band = localStorage.getItem(BAND_KEY) === 'secondary' ? 'secondary' : 'elementary'; }
  catch (e) { band = 'elementary'; }
  try { qrOnPaper = localStorage.getItem(QRP_KEY) === '1'; }
  catch (e) { qrOnPaper = false; }
}

/* The intro card promises that everything saves automatically. On a managed
   school profile or in a private window that promise can be false, and the old
   empty catch let the app go on lying. Say it once, assertively, and then stop
   nagging. */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    storageBroken = false;
    return true;
  } catch (e) {
    if (!storageBroken) {
      storageBroken = true;
      toast('This browser will not let the folder save, copy the link and keep it somewhere safe before you close the tab.', 9000, { assertive: true });
    }
    return false;
  }
}

let savedTimer = null;
function announceSaved() {
  if (storageBroken) return;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    if (window.SWS && window.SWS.saved) window.SWS.saved({ text: 'Saved on this device' });
  }, 700);
}

const fieldMeta = (key, label, placeholder) => {
  const o = band === 'secondary' && SECONDARY[key];
  return o ? { label: o[0], placeholder: o[1] } : { label, placeholder };
};

/* ---------- the form ---------- */
function autoGrow(node) {
  if (!node || node.tagName !== 'TEXTAREA') return;
  node.style.height = 'auto';
  const h = node.scrollHeight;
  if (h > 0) node.style.height = Math.min(h + 2, 900) + 'px';
}

function updateCount(counter, value) {
  if (!counter) return;
  const n = value.length;
  if (n < CAP_WARN_AT) { counter.textContent = ''; counter.classList.remove('near'); return; }
  counter.textContent = n >= FIELD_CAP
    ? 'Full, ' + FIELD_CAP.toLocaleString() + ' characters is the limit for this box'
    : (FIELD_CAP - n).toLocaleString() + ' characters left';
  counter.classList.toggle('near', n >= FIELD_CAP);
}

function renderForm() {
  const form = $('form');
  form.replaceChildren();
  for (const [section, fields] of SCHEMA.sections) {
    const id = 'sec-' + section.toLowerCase().replace(/[^a-z]+/g, '-');
    const wrap = el('section', {
      class: 'fsec', 'aria-labelledby': id + '-h',
      'data-today': TODAY_SECTIONS.includes(section) ? '' : null,
    }, el('h2', { id: id + '-h' }, section));

    if (section === 'The basics') wrap.append(bandPicker());

    for (const [key, rawLabel, multi, rawPlaceholder] of fields) {
      const { label, placeholder } = fieldMeta(key, rawLabel, rawPlaceholder);
      const cid = 'f-' + key;
      const counter = multi ? el('div', { class: 'count', id: cid + '-c' }) : null;
      const attrs = {
        id: cid, placeholder,
        'aria-describedby': counter ? cid + '-c' : null,
        oninput: (ev) => {
          const raw = ev.target.value;
          if (raw.length > FIELD_CAP) {
            /* Never let the screen and the disk disagree: write the truncated
               value back into the control so the teacher sees exactly what is
               being kept. */
            const cut = raw.slice(0, FIELD_CAP);
            const at = Math.min(ev.target.selectionStart, FIELD_CAP);
            ev.target.value = cut;
            try { ev.target.setSelectionRange(at, at); } catch (e2) {}
            if (!capWarned) {
              capWarned = true;
              toast('That box is full at ' + FIELD_CAP.toLocaleString() + ' characters, the rest was not kept. Split it across another field.', 8000, { assertive: true });
            }
          }
          data[key] = ev.target.value;
          updateCount(counter, ev.target.value);
          autoGrow(ev.target);
          if (save()) announceSaved();
          markDirty();
        },
      };
      const input = multi
        ? el('textarea', { ...attrs, rows: key === 'plan' ? 10 : 4 })
        : el('input', { type: 'text', ...attrs });
      input.value = data[key] || '';
      updateCount(counter, input.value);
      wrap.append(el('label', { class: 'f', for: cid },
        el('span', {}, label), input, counter));
    }
    form.append(wrap);
  }
  const grow = () => form.querySelectorAll('textarea').forEach(autoGrow);
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(grow);
  else grow();
}

function bandPicker() {
  const mk = (value, label) => el('button', {
    type: 'button', class: 'tab' + (band === value ? ' active' : ''),
    'aria-pressed': band === value ? 'true' : 'false',
    onclick: () => {
      if (band === value) return;
      band = value;
      try { localStorage.setItem(BAND_KEY, band); } catch (e) {}
      renderForm();
      applyView();
      toast(value === 'secondary' ? 'Examples switched to secondary' : 'Examples switched to elementary');
    },
  }, label);
  return el('div', { class: 'bandpick' },
    el('span', { class: 'bandlab', id: 'bandlab' }, 'Show examples for'),
    el('div', { class: 'seg', role: 'group', 'aria-labelledby': 'bandlab' },
      mk('elementary', 'Elementary'), mk('secondary', 'Secondary')));
}

/* ---------- Today view: the same fields, fewer of them ---------- */
let view = 'today';
function applyView() {
  const form = $('form');
  if (form) form.setAttribute('data-view', view);
  const t = $('viewToday'), a = $('viewAll');
  if (t) { t.classList.toggle('active', view === 'today'); t.setAttribute('aria-pressed', String(view === 'today')); }
  if (a) { a.classList.toggle('active', view === 'all'); a.setAttribute('aria-pressed', String(view === 'all')); }
  if (form) {
    /* :first-child cannot see that the sections above are display:none, so the
       leading separator rule has to be placed from here. */
    const all = [...form.querySelectorAll('.fsec')];
    all.forEach((s) => s.classList.remove('lead'));
    const shown = all.filter((s) => view === 'all' || s.hasAttribute('data-today'));
    if (shown[0]) shown[0].classList.add('lead');
  }
  const note = $('viewNote');
  if (note) {
    note.textContent = view === 'today'
      ? 'Showing only what changes on a sick day, plus the emergency block. Everything else you wrote is still saved.'
      : 'Showing all nine sections. Fill this out once, on a good day.';
  }
}

const filled = (key) => (data[key] || '').trim();

/* ---------- the printed folder ---------- */
const NS = 'http://www.w3.org/2000/svg';
function qrSvg(qr, count) {
  const q = 4, size = count + q * 2;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code that opens this sub folder');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('fill', '#fff');
  svg.append(bg);
  let d = '';
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
    if (qr.isDark(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(path);
  return svg;
}

/* Error correction M survives a photocopy far better than L; drop to L only
   when M would push the code past what fits on paper at a scannable size. */
let qrBuilt = { url: null, out: null };
function buildQr(url) {
  if (typeof qrcode !== 'function') return null;
  if (qrBuilt.url === url) return qrBuilt.out;
  let out = null;
  for (const ec of ['M', 'L']) {
    try {
      const qr = qrcode(0, ec);
      qr.addData(url); qr.make();
      const count = qr.getModuleCount();
      if (count <= MAX_QR_MODULES) { out = { qr, count, ec }; break; }
    } catch (e) { /* payload does not fit at this level */ }
  }
  qrBuilt = { url, out };
  return out;
}

function printQrBlock() {
  if (!qrOnPaper || qrDirty || !qrUrl) return null;
  const built = buildQr(qrUrl);
  if (!built) return null;
  const mm = Math.min(58, Math.max(28, Math.round((built.count + 8) * 0.4)));
  const svg = qrSvg(built.qr, built.count);
  svg.setAttribute('style', 'width:' + mm + 'mm;height:' + mm + 'mm;display:block');
  return el('div', { class: 'qrbox' }, svg,
    el('div', { class: 'qrcap' }, 'Scan for a copy on your phone'));
}

function renderSheet(target, pages) {
  const sheet = target || $('sheet');
  sheet.replaceChildren();

  if (!hasContent()) {
    sheet.append(el('div', { class: 'emptynote' },
      'Sub Plans, this folder is empty. Fill in at least one field, then print.'));
    return;
  }

  const body = el('td', { class: 'pwbody' });
  const runBits = [filled('teacher'), filled('room') ? 'Room ' + data.room.trim() : '',
    filled('school'), filled('date')].filter(Boolean);
  if (pages > 1) runBits.push(pages + ' pages in this packet');
  const table = el('table', { class: 'pw' },
    el('thead', {}, el('tr', {}, el('td', { class: 'run' },
      runBits.length ? runBits.join(' · ') : 'Sub Plans'))),
    el('tbody', {}, el('tr', {}, body)));
  sheet.append(table);

  // header composed from the basics
  const subBits = ['class', 'room', 'school', 'date']
    .map((k) => (k === 'room' && filled(k) ? 'Room ' + data[k].trim() : filled(k)))
    .filter(Boolean);
  const qrb = printQrBlock();
  body.append(el('div', { class: 'shead' },
    el('div', { class: 'headtext' },
      el('h1', {}, 'Sub Plans' + (filled('teacher') ? ', ' + data.teacher.trim() : '')),
      subBits.length ? el('div', { class: 'sub', text: subBits.join(' · ') }) : null,
      el('div', { class: 'warm', text: 'Thank you for being here today, this folder has everything you need.' })),
    qrb));

  // emergency box first: the page a sub needs before anything goes wrong
  const em = EMERGENCY_KEYS.filter(filled);
  if (em.length) {
    const box = el('div', { class: 'alert' },
      el('h2', {}, alertIcon(), 'In an emergency'));
    const labels = { drills: 'Fire · lockdown · drills', health: 'Health alerts' };
    for (const key of em) {
      box.append(el('div', { class: 'block' },
        el('h3', {}, labels[key]),
        el('div', { class: 'v', text: data[key] })));
    }
    body.append(box);
  }

  // the first ten minutes, pinned to page 1 under the header
  const first = FIRST_KEYS.filter(filled);
  if (first.length) {
    const box = el('div', { class: 'first' }, el('h2', {}, 'Your first ten minutes'));
    const grid = el('div', { class: 'fgrid' });
    for (const key of first) {
      grid.append(el('div', { class: 'block' },
        el('h3', {}, FIRST_LABELS[key]),
        el('div', { class: 'v' + (MONO_KEYS.includes(key) ? ' mono' : ''), text: data[key] })));
    }
    box.append(grid);
    body.append(box);
  }

  // remaining sections in schema order
  for (const [section, fields] of SCHEMA.sections) {
    if (section === 'The basics' || section === 'Emergencies' || section === 'First ten minutes') continue;
    const keep = fields.filter(([key]) => !HEADER_KEYS.includes(key) && !PROMOTED.includes(key) && filled(key));
    if (section !== 'End of the day' && !keep.length) continue;
    const sec = el('div', { class: 'sec' }, el('h2', {}, section));
    for (const [key, rawLabel] of keep) {
      sec.append(el('div', { class: 'block' },
        el('h3', {}, fieldMeta(key, rawLabel, '').label),
        el('div', { class: 'v', text: data[key] })));
    }
    if (section === 'End of the day') sec.append(feedbackBox());
    body.append(sec);
  }
}

function alertIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'alerticon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M12 2.6 23 21.4H1zM12 9v6M12 17.6v.8');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.2');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('stroke-linecap', 'round');
  svg.append(p);
  return svg;
}

/* An empty rectangle gets "they were great, thanks!". Checkboxes get answers, the research says this page is in every credible template. */
const FEEDBACK_TICKS = [
  'We got through the plan', 'We did not finish it', 'I used the backup activity',
  'Someone was a real help', 'Someone struggled', 'I left work to grade',
  'Something broke or ran out', 'Please call me',
];
function feedbackBox() {
  const box = el('div', { class: 'noteback' },
    el('h3', {}, 'How did it go? Leave me a note , '));
  const ticks = el('ul', { class: 'ticks' });
  for (const t of FEEDBACK_TICKS) ticks.append(el('li', {}, el('span', { class: 'box' }), t));
  box.append(ticks);
  for (let i = 0; i < 3; i++) box.append(el('div', { class: 'rule' }));
  return box;
}

const hasContent = () => SCHEMA.sections.some(([, fields]) => fields.some(([key]) => filled(key)));

/* ---------- page count, measured off-screen at the real paper width ----------
   Not height / page-height: the blocks that carry break-inside:avoid get moved
   whole to the next sheet, which is exactly what inflates the count. So walk
   the unbreakable atoms in order and push them the way the printer will. */
const ATOMS = '.shead,.alert,.first,.sec>h2,.sec>.block>h3,.noteback>h3,.ticks,.rule,.emptynote';
function computePages() {
  const m = $('measure');
  if (!m || !hasContent()) return 0;
  renderSheet(m, 0);
  const box = m.getBoundingClientRect();
  if (!m.scrollHeight) return 0;
  const nodes = [...m.querySelectorAll(ATOMS)]
    .filter((n) => !n.parentElement.closest('.alert,.first'));
  let shift = 0, last = 0, flat = 0;
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    const raw = (r.top - box.top) * 0.75;
    const h = r.height * 0.75;
    let top = raw + shift;
    const pageEnd = (Math.floor(top / PAGE_PT) + 1) * PAGE_PT;
    if (h <= PAGE_PT && top + h > pageEnd) { shift += pageEnd - top; top = pageEnd; }
    last = Math.max(last, top + h);
    flat = Math.max(flat, raw + h);
  }
  // whatever sits below the final atom, box padding, borders, the sheet's own
  // trailing space, still occupies paper
  last += Math.max(0, box.height * 0.75 - flat);
  return Math.max(1, Math.ceil(last / PAGE_PT));
}
let pageCount = 0;
function updatePageCount() {
  pageCount = computePages();
  const out = $('pageCount');
  if (!out) return;
  out.textContent = pageCount ? '· ' + pageCount + (pageCount === 1 ? ' page' : ' pages') : '';
}

let dirtyTimer = null;
function markDirty() {
  qrDirty = true;
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => { updatePageCount(); refreshQr(); refreshShareNote(); }, 350);
}

/* ---------- share: the whole folder travels inside the URL ---------- */
function payloadJson() {
  const d = {};
  for (const [k, v] of Object.entries(data)) if ((v || '').trim()) d[k] = v;
  return JSON.stringify({ v: 1, d });
}
const toB64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromB64url(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return atob(t);
}
export function encodeSheet() {
  return toB64url(unescape(encodeURIComponent(payloadJson())));
}

/* deflate-raw before base64. Measured on a realistic binder: the share URL
   drops from 2,780 characters to 1,549, which is the difference between a QR
   nobody can have and one that prints. Old plain links keep working. */
async function encodeBest() {
  const plain = encodeSheet();
  if (typeof CompressionStream !== 'function') return plain;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(payloadJson()));
    w.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    const packed = 'z.' + toB64url(bin);
    return packed.length < plain.length ? packed : plain;
  } catch (e) { return plain; }
}

function sanitize(obj) {
  if (!obj || obj.v !== 1 || typeof obj.d !== 'object' || !obj.d) return null;
  const keys = new Set(SCHEMA.sections.flatMap(([, fields]) => fields.map(([key]) => key)));
  const d = {};
  for (const [k, v] of Object.entries(obj.d))
    if (keys.has(k) && typeof v === 'string' && v.trim()) d[k] = v.slice(0, FIELD_CAP);
  return Object.keys(d).length ? d : null;
}
export function decodeSheet(hash) {
  try {
    const s = String(hash || '').replace(/^#/, '');
    if (!s || s.slice(0, 2) === 'z.') return null;
    return sanitize(JSON.parse(decodeURIComponent(escape(fromB64url(s)))));
  } catch (e) { return null; }
}
export async function decodeAny(hash) {
  const s = String(hash || '').replace(/^#/, '');
  if (s.slice(0, 2) !== 'z.') return decodeSheet(s);
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const bin = fromB64url(s.slice(2));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes); w.close();
    const json = await new Response(ds.readable).text();
    return sanitize(JSON.parse(json));
  } catch (e) { return null; }
}

const baseUrl = () => (location.origin === 'null' || location.protocol === 'file:'
  ? location.href.split('#')[0] : location.origin + location.pathname);
const shareUrl = async () => baseUrl() + '#' + await encodeBest();

let qrUrl = null;
let qrDirty = true;
async function refreshQr() {
  qrDirty = false;
  qrUrl = null;
  if (!hasContent()) return;
  const url = await shareUrl();
  if (url.length <= MAX_QR_URL) qrUrl = url;
}

/* Say what is about to travel BEFORE the button is pressed, not in a toast
   afterwards. These two fields are the FERPA-shaped ones. */
const SENSITIVE = { health: 'your health alerts', needs: 'your notes on the kids who need something' };
function refreshShareNote() {
  const out = $('shareWhat');
  if (!out) return;
  const inside = Object.keys(SENSITIVE).filter(filled).map((k) => SENSITIVE[k]);
  const list = inside.length > 1
    ? inside.slice(0, -1).join(', ') + ' and ' + inside[inside.length - 1]
    : inside[0];
  out.textContent = inside.length
    ? 'This link will carry ' + list + ' inside the web address itself. Send it only to someone you would hand the paper folder to.'
    : 'The whole folder travels inside the web address itself. Nothing is uploaded, but a web address is easy to forward on, send it only to someone you would hand the paper folder to.';
}

/* ---------- wiring ---------- */
function wire() {
  // Ctrl/Cmd+P must print the CURRENT folder, not a blank or stale one
  window.addEventListener('beforeprint', () => {
    if (!hasContent()) toast('Nothing is filled in yet, that print will be one near-blank sheet.', 5000);
    renderSheet($('sheet'), pageCount);
  });
  $('printBtn').addEventListener('click', async () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    if (qrDirty) await refreshQr();
    updatePageCount();
    renderSheet($('sheet'), pageCount);
    window.print();
  });

  $('viewToday').addEventListener('click', () => { view = 'today'; applyView(); });
  $('viewAll').addEventListener('click', () => { view = 'all'; applyView(); });

  const qp = $('qrPrint');
  qp.checked = qrOnPaper;
  qp.addEventListener('change', async () => {
    qrOnPaper = qp.checked;
    try { localStorage.setItem(QRP_KEY, qrOnPaper ? '1' : '0'); } catch (e) {}
    if (qrDirty) await refreshQr();
    if (qrOnPaper && !qrUrl && hasContent()) {
      toast('This folder is too long for a QR anyone could scan, so nothing will be printed, use Copy link instead.', 7000);
    }
    updatePageCount();
    if ($('sheet').classList.contains('preview')) renderSheet($('sheet'), pageCount);
  });

  const pv = $('previewBtn');
  pv.addEventListener('click', async () => {
    const sheet = $('sheet');
    const on = sheet.classList.contains('preview');
    if (on) {
      sheet.classList.remove('preview');
      pv.setAttribute('aria-expanded', 'false');
      pv.textContent = 'Read it as your sub would';
      return;
    }
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    if (qrDirty) await refreshQr();
    updatePageCount();
    renderSheet(sheet, pageCount);
    sheet.classList.add('preview');
    pv.setAttribute('aria-expanded', 'true');
    pv.textContent = 'Hide the preview';
    sheet.scrollIntoView({ block: 'start' });
  });

  $('qrClose').addEventListener('click', () => {
    const d = $('qrDlg');
    try { d.close(); } catch (e) { d.removeAttribute('open'); }
  });
  $('shareBtn').addEventListener('click', async () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    const url = await shareUrl();
    const long = url.length > 2000
      ? ' It is ' + url.length.toLocaleString() + ' characters long, so some apps will cut it in half, printing is safer for a folder this size.'
      : '';
    copyText(url, 'Link copied, the whole folder is inside it.' + long);
  });
  $('qrBtn').addEventListener('click', async () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    const url = await shareUrl();
    if (url.length > MAX_QR_URL) {
      toast('This folder is about ' + Math.round((url.length - MAX_QR_URL) / 10) * 10
        + ' characters too long for a QR anyone could scan, use Copy link instead, or shorten the longest boxes.', 7000);
      return;
    }
    showQr(url);
  });

  /* A share link pasted into an already-open tab is a same-document
     navigation: init() has long since run. Honour it or say why not. */
  window.addEventListener('hashchange', () => { openShared(location.hash); });
}

function openShared(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return;
  const apply = (shared) => {
    if (!shared) {
      history.replaceState(null, '', location.pathname + location.search);
      toast('That link does not carry a readable folder, it may have been cut short in the message.', 6000);
      return;
    }
    if (hasContent() && !confirm('Open the shared folder? Your saved one will be replaced.')) {
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    const before = JSON.parse(JSON.stringify(data));
    data = shared;
    save();
    renderForm(); applyView(); markDirty();
    history.replaceState(null, '', location.pathname + location.search);
    if (window.SWS && window.SWS.undo) {
      window.SWS.undo('Folder loaded from the link, your own folder was replaced.', () => {
        data = before;
        save();
        renderForm(); applyView(); markDirty();
        toast('Your folder is back.', 3000);
      }, { ms: 12000 });
    } else {
      toast('Folder loaded from the link', 4000);
    }
  };
  const sync = decodeSheet(raw);
  if (sync) { apply(sync); return; }
  if (raw.slice(0, 2) === 'z.') { decodeAny(raw).then(apply); return; }
  apply(null);
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  $('qrPrint').checked = qrOnPaper;   // wire() ran before the preference was read
  renderForm();
  /* A returning teacher on a sick morning wants Today; a first-time teacher on
     an August prep day wants the whole thing. */
  view = hasContent() ? 'today' : 'all';
  applyView();
  refreshShareNote();
  updatePageCount();
  refreshQr();
  if (location.hash) openShared(location.hash);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

/* ---------- QR on screen ---------- */
function showQr(url) {
  const built = buildQr(url);
  if (!built) { toast('Could not draw the QR, use Copy link instead.'); return; }
  const { qr, count } = built;
  const canvas = $('qrCanvas');
  /* Module size follows the module count, and the bitmap stays an exact
     integer multiple of the CSS size so no module is ever a fraction wide. */
  const avail = Math.min(560, Math.max(232, (window.innerWidth || 360) - 96));
  const span = count + 8;
  const cssCell = Math.max(2, Math.min(6, Math.floor(avail / span)));
  const cssSize = span * cssCell;
  const scale = 3;
  canvas.width = cssSize * scale;
  canvas.height = cssSize * scale;
  canvas.style.width = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  const cell = cssCell * scale;
  const off = 4 * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) { toast('Could not draw the QR, use Copy link instead.'); return; }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
    if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); $('qrClose').focus(); }
}

/* Sky Wolf Studio install affordance, injected studio-wide 2026-08-18.
   Chrome hands over a real install prompt; iOS gets directions; nothing
   shows once the app is already installed. */
(function(){
  if (matchMedia('(display-mode: standalone)').matches) return;
  var evt = null;
  function place(){
    var a = document.getElementById('swsInstall');
    if (a) return a;
    a = document.createElement('button');
    a.id = 'swsInstall'; a.type = 'button'; a.textContent = '\u2913 Install this app';
    a.style.cssText = 'font:inherit;font-size:12px;color:inherit;opacity:.75;background:none;border:1px solid currentColor;border-radius:10px;padding:6px 12px;margin-top:10px;cursor:pointer;display:inline-block';
    var host = document.querySelector('footer.colophon, .colophon, .footnote, footer');
    if (host){ host.appendChild(document.createElement('br')); host.appendChild(a); }
    else { a.style.cssText += ';position:fixed;right:12px;bottom:76px;z-index:60'; document.body.appendChild(a); }
    return a;
  }
  addEventListener('beforeinstallprompt', function(e){
    e.preventDefault(); evt = e;
    place().onclick = function(){ if (evt) evt.prompt(); };
  });
  if (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone){
    place().onclick = function(){ alert('To install: tap the Share button, then "Add to Home Screen".'); };
  }
})();

