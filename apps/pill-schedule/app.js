// Pill Schedule, printable weekly medication card. localStorage only.
// A memory aid, never medical advice. All user data rendered via textContent.

const CONFIG = { tipUrl: 'https://buy.stripe.com/3cIfZic9X91ldU131L7EQ0b' };

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

/* The shared runtime owns the toast. Its clock stops while the pointer or the
   keyboard focus is inside it, which is the whole reason Undo is trustworthy:
   the previous local setTimeout hid the toast out from under a keyboard user
   who was standing on the Undo button. */
function toast(msg, opts) {
  if (window.SWS && SWS.toast) return SWS.toast(msg, opts);
  const t = $('toast');                       // no-JS-runtime fallback only
  if (t) { t.textContent = msg; t.classList.add('show'); }
  return t;
}
function undoToast(msg, restore) {
  if (window.SWS && SWS.undo) return SWS.undo(msg, restore);
  return toast(msg);
}
function savedFlag() { if (window.SWS && SWS.saved) SWS.saved({ text: 'Saved' }); }

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy, the link is selectable under the QR code.', { assertive: true }); }
}

const KEY = 'pill-schedule';
const TIME_ORDER = ['Morning', 'Noon', 'Evening', 'Bedtime'];
const SIZES = ['std', 'lg', 'xl', 'xxl'];
/* Not "the one-page limit", the card is honest about page count now, so this
   is only a sanity ceiling on how much one card should ever hold. */
const ROW_CAP = 60;

const blankCard = () => ({
  who: '', allergies: '',
  prescriber: '', prescriberPhone: '', pharmacy: '', pharmacyPhone: '',
  clock: { Morning: '', Noon: '', Evening: '', Bedtime: '' },
  size: 'lg',
  meds: [], // {id, name, alias, dose, times[], notes, prn, max}
});
let data = blankCard();
let editingId = null;

const newId = () => Math.random().toString(36).slice(2, 9);

export function sortTimes(times) {
  return [...times].sort((a, b) => TIME_ORDER.indexOf(a) - TIME_ORDER.indexOf(b));
}

/* ---------- normalising anything that claims to be a card ----------
   Every path into the data, localStorage, a shared link, goes through here.
   A record whose shape is slightly wrong used to throw out of renderList,
   which killed init() mid-module and left Show QR, Copy link and the dialog's
   Close button with no listeners at all, over data that was still in storage. */
function str(v, n) {
  if (typeof v === 'number' && isFinite(v)) v = String(v);
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, n);
}
function coerceMed(x) {
  if (!x || typeof x !== 'object') return null;
  const name = str(x.name, 60);
  if (!name) return null;
  const prn = x.prn === true;
  const times = sortTimes([...new Set((Array.isArray(x.times) ? x.times : [])
    .filter(t => TIME_ORDER.includes(t)))]);
  if (!prn && !times.length) return null;
  return {
    id: str(x.id, 16) || newId(),
    name,
    alias: str(x.alias, 60),
    dose: str(x.dose, 40),
    times: prn ? [] : times,
    notes: str(x.notes, 120),
    prn,
    max: str(x.max, 24),
  };
}
/* A drug name may only break where a separator already exists. "Carbidopa/
   Levodopa" rendered as "Carbidopa/Levo" / "dopa" at Largest text, and a name
   split mid-syllable is an identification hazard on a medication list. <wbr>
   gives the line breaker somewhere legitimate to go, so the anywhere-break
   fallback never fires. Built from text nodes, never innerHTML. */
function nameNodes(text) {
  const s = String(text || '');
  const out = [];
  let buf = '';
  for (const ch of s) {
    buf += ch;
    if ('/--, +·'.indexOf(ch) >= 0) {
      out.push(document.createTextNode(buf));
      out.push(document.createElement('wbr'));
      buf = '';
    }
  }
  if (buf) out.push(document.createTextNode(buf));
  return out.length ? out : [document.createTextNode(s)];
}

const rowsOf = (m) => (m.prn ? 1 : Math.max(1, m.times.length));
const rowCount = (meds) => meds.reduce((a, m) => a + rowsOf(m), 0);

function normalizeCard(raw) {
  const card = blankCard();
  let dropped = 0, trimmed = 0;
  if (!raw || typeof raw !== 'object') return { card, dropped, trimmed };
  card.who = str(raw.who, 40);
  card.allergies = str(raw.allergies, 200);
  card.prescriber = str(raw.prescriber, 60);
  card.prescriberPhone = str(raw.prescriberPhone, 30);
  card.pharmacy = str(raw.pharmacy, 60);
  card.pharmacyPhone = str(raw.pharmacyPhone, 30);
  if (raw.clock && typeof raw.clock === 'object') {
    for (const t of TIME_ORDER) card.clock[t] = str(raw.clock[t], 12);
  }
  card.size = SIZES.includes(raw.size) ? raw.size : 'lg';
  let rows = 0;
  for (const m of (Array.isArray(raw.meds) ? raw.meds : [])) {
    const c = coerceMed(m);
    if (!c) { dropped++; continue; }
    const r = rowsOf(c);
    if (rows + r > ROW_CAP) { trimmed++; continue; }
    rows += r;
    card.meds.push(c);
  }
  return { card, dropped, trimmed };
}

function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  if (!raw) return null;
  const { card, dropped, trimmed } = normalizeCard(raw);
  data = card;
  const lost = dropped + trimmed;
  return lost ? lost + (lost === 1 ? ' saved medication was incomplete and could not be shown'
    : ' saved medications were incomplete and could not be shown') : null;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

/* ---------- brand ⇄ generic, for the duplicate check ----------
   A small bundled table, not a drug database. It exists for one job: notice
   that Norvasc and amlodipine are the same medicine before the card goes on
   the fridge. Look-alike/sound-alike confusion is behind roughly a quarter of
   reported medication errors, and nothing else in the free-printable tier
   checks for it. Worded as "double-check with your pharmacist", never as
   advice. */
const BRAND = {
  norvasc: 'amlodipine', prinivil: 'lisinopril', zestril: 'lisinopril',
  glucophage: 'metformin', fortamet: 'metformin', lipitor: 'atorvastatin',
  zocor: 'simvastatin', crestor: 'rosuvastatin', pravachol: 'pravastatin',
  coumadin: 'warfarin', jantoven: 'warfarin', eliquis: 'apixaban',
  xarelto: 'rivaroxaban', pradaxa: 'dabigatran', plavix: 'clopidogrel',
  brilinta: 'ticagrelor', synthroid: 'levothyroxine', levoxyl: 'levothyroxine',
  unithroid: 'levothyroxine', 'levo-t': 'levothyroxine', lasix: 'furosemide',
  microzide: 'hydrochlorothiazide', hydrodiuril: 'hydrochlorothiazide',
  aldactone: 'spironolactone', toprol: 'metoprolol', 'toprol xl': 'metoprolol',
  lopressor: 'metoprolol', tenormin: 'atenolol', coreg: 'carvedilol',
  bystolic: 'nebivolol', inderal: 'propranolol', cozaar: 'losartan',
  diovan: 'valsartan', avapro: 'irbesartan', benicar: 'olmesartan',
  altace: 'ramipril', vasotec: 'enalapril', accupril: 'quinapril',
  cardizem: 'diltiazem', calan: 'verapamil', catapres: 'clonidine',
  imdur: 'isosorbide mononitrate', nitrostat: 'nitroglycerin',
  lanoxin: 'digoxin', cordarone: 'amiodarone', betapace: 'sotalol',
  prilosec: 'omeprazole', nexium: 'esomeprazole', protonix: 'pantoprazole',
  prevacid: 'lansoprazole', pepcid: 'famotidine', zofran: 'ondansetron',
  tylenol: 'acetaminophen', advil: 'ibuprofen', motrin: 'ibuprofen',
  aleve: 'naproxen', mobic: 'meloxicam', celebrex: 'celecoxib',
  ultram: 'tramadol', norco: 'hydrocodone/acetaminophen',
  vicodin: 'hydrocodone/acetaminophen', percocet: 'oxycodone/acetaminophen',
  deltasone: 'prednisone', colcrys: 'colchicine', zyloprim: 'allopurinol',
  glucotrol: 'glipizide', amaryl: 'glimepiride', januvia: 'sitagliptin',
  actos: 'pioglitazone', jardiance: 'empagliflozin', farxiga: 'dapagliflozin',
  ozempic: 'semaglutide', rybelsus: 'semaglutide', trulicity: 'dulaglutide',
  zetia: 'ezetimibe', tricor: 'fenofibrate', lopid: 'gemfibrozil',
  singulair: 'montelukast', zyrtec: 'cetirizine', claritin: 'loratadine',
  allegra: 'fexofenadine', benadryl: 'diphenhydramine', flonase: 'fluticasone',
  ventolin: 'albuterol', proair: 'albuterol', proventil: 'albuterol',
  zoloft: 'sertraline', prozac: 'fluoxetine', lexapro: 'escitalopram',
  celexa: 'citalopram', paxil: 'paroxetine', effexor: 'venlafaxine',
  cymbalta: 'duloxetine', wellbutrin: 'bupropion', remeron: 'mirtazapine',
  desyrel: 'trazodone', buspar: 'buspirone', vistaril: 'hydroxyzine',
  xanax: 'alprazolam', ativan: 'lorazepam', klonopin: 'clonazepam',
  restoril: 'temazepam', ambien: 'zolpidem', neurontin: 'gabapentin',
  lyrica: 'pregabalin', keppra: 'levetiracetam', lamictal: 'lamotrigine',
  tegretol: 'carbamazepine', dilantin: 'phenytoin', depakote: 'divalproex',
  seroquel: 'quetiapine', abilify: 'aripiprazole', risperdal: 'risperidone',
  zyprexa: 'olanzapine', haldol: 'haloperidol', sinemet: 'carbidopa/levodopa',
  requip: 'ropinirole', mirapex: 'pramipexole', aricept: 'donepezil',
  namenda: 'memantine', fosamax: 'alendronate', boniva: 'ibandronate',
  flomax: 'tamsulosin', proscar: 'finasteride', hytrin: 'terazosin',
  detrol: 'tolterodine', vesicare: 'solifenacin', imitrex: 'sumatriptan',
  cipro: 'ciprofloxacin', amoxil: 'amoxicillin', zithromax: 'azithromycin',
  keflex: 'cephalexin', macrobid: 'nitrofurantoin',
  bactrim: 'sulfamethoxazole/trimethoprim', septra: 'sulfamethoxazole/trimethoprim',
  'klor-con': 'potassium chloride', 'k-dur': 'potassium chloride',
  mucinex: 'guaifenesin', lantus: 'insulin glargine', humalog: 'insulin lispro',
};
function genericKey(name) {
  const k = String(name || '').toLowerCase()
    .replace(/[^a-z0-9/ -]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!k) return '';
  return BRAND[k] || k;
}
/* Returns [{a, b}], pairs of medications that resolve to the same ingredient. */
function duplicatePairs(meds) {
  const pairs = [];
  for (let i = 0; i < meds.length; i++) {
    const ki = new Set([genericKey(meds[i].name), genericKey(meds[i].alias)].filter(Boolean));
    for (let j = i + 1; j < meds.length; j++) {
      const kj = [genericKey(meds[j].name), genericKey(meds[j].alias)].filter(Boolean);
      if (kj.some(k => ki.has(k))) pairs.push({ a: meds[i], b: meds[j] });
    }
  }
  return pairs;
}

/* ---------- the editor list ---------- */
function removeMed(id) {
  const idx = data.meds.findIndex(x => x.id === id);
  if (idx < 0) return;
  const gone = data.meds[idx];
  // a snapshot cannot forget a side effect the way a hand-written inverse can
  const before = JSON.stringify(data);
  data.meds.splice(idx, 1);
  if (editingId === id) cancelEdit();
  commit();
  // focus must not fall to <body> when the button the user pressed disappears
  const buttons = $('medList').querySelectorAll('.btn.danger');
  const next = buttons[Math.min(idx, buttons.length - 1)] || $('emptyAdd');
  if (next) next.focus();
  undoToast('Removed ' + gone.name, () => {
    const { card } = normalizeCard(JSON.parse(before));
    data = card;
    commit();
    fillFromData();
    toast(gone.name + ' is back on the card');
  });
}

function renderList() {
  const list = $('medList');
  list.replaceChildren();
  $('emptyState').classList.toggle('hidden', data.meds.length > 0);
  $('actionBar').classList.toggle('hidden', data.meds.length === 0);

  const dupes = duplicatePairs(data.meds);
  const flagged = new Set();
  for (const p of dupes) { flagged.add(p.a.id); flagged.add(p.b.id); }

  for (const m of data.meds) {
    const when = m.prn
      ? 'As needed' + (m.max ? ' · up to ' + m.max + ' in 24 h' : '')
      : sortTimes(m.times).map(timeLabel).join(' · ');
    list.append(el('li', { class: editingId === m.id ? 'editing' : '' },
      el('div', { class: 'grow' },
        el('div', {},
          el('strong', {}, nameNodes(m.name)),
          m.alias ? [' (', nameNodes(m.alias), ')'] : '',
          m.dose ? ', ' + m.dose : ''),
        el('div', { class: 'sub', text: when + (m.notes ? '  ·  ' + m.notes : '') }),
        flagged.has(m.id) ? el('span', { class: 'flag' }, 'check for a duplicate') : null),
      // every button on the page would otherwise announce as "Edit" / "Remove"
      el('button', {
        class: 'btn small', type: 'button', 'aria-label': 'Edit ' + m.name,
        onclick: () => startEdit(m.id),
      }, 'Edit'),
      el('button', {
        class: 'btn small danger', type: 'button', 'aria-label': 'Remove ' + m.name,
        onclick: () => removeMed(m.id),
      }, 'Remove')));
  }

  const warn = $('dupWarn');
  if (dupes.length) {
    const names = dupes.slice(0, 3)
      .map(p => p.a.name + ' and ' + p.b.name).join('; ');
    warn.textContent = 'Two rows look like the same medicine, ' + names
      + '. Double-check with the pharmacist before this card goes on the fridge.';
    warn.classList.remove('hidden');
  } else {
    warn.textContent = '';
    warn.classList.add('hidden');
  }

  const rows = rowCount(data.meds);
  $('rowCount').textContent = data.meds.length === 0 ? ''
    : data.meds.length + (data.meds.length === 1 ? ' medication · ' : ' medications · ')
      + rows + (rows === 1 ? ' row' : ' rows') + ' on the card · room for '
      + (ROW_CAP - rows) + ' more';
}

const timeLabel = (t) => (data.clock && data.clock[t] ? t + ' (' + data.clock[t] + ')' : t);

/* ---------- the printed card ----------
   Paginated here rather than left to the browser, so the app can say honestly
   how many sheets of paper this is, and so every page carries the name and the
   date. The same function draws the on-screen preview and the paper: they
   cannot diverge, because they are the same nodes. */
const PX_PER_MM = 96 / 25.4;
const SHEET_W_MM = 182;   // A4 content width at the base sheet's 14mm @page margin
const PAGE_H_MM = 247;    // US Letter content height (251.4mm) less a safety strip
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let pageCount = 1;

const fmtDate = (d) => {
  try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (e) { return d.toISOString().slice(0, 10); }
};

function schedTable() {
  const t = el('table', { class: 'sched' },
    el('colgroup', {}, el('col', { class: 'cmed' }), ...DAYS.map(() => el('col', { class: 'cday' }))),
    el('thead', {}, el('tr', {},
      el('th', {}, 'Medication · dose · when'),
      ...DAYS.map(d => el('th', { class: 'day' }, d)))));
  t.append(el('tbody'));
  return t;
}
function prnTable() {
  const t = el('table', { class: 'prn' },
    el('colgroup', {}, el('col', { class: 'cmed' }), el('col', { class: 'cwhen' }), el('col', { class: 'cmax' })),
    el('thead', {}, el('tr', {},
      el('th', {}, 'Medication · dose'),
      el('th', {}, 'Only when needed, for'),
      el('th', {}, 'Most in 24 hours'))));
  t.append(el('tbody'));
  return t;
}
const nameLine = (m) => [
  nameNodes(m.name),
  m.alias ? [' (', nameNodes(m.alias), ')'] : null,
  m.dose ? ' · ' + m.dose : null,
];

function renderSheet() {
  const sheet = $('sheet');
  sheet.replaceChildren();
  sheet.setAttribute('data-size', data.size);
  const today = fmtDate(new Date());

  /* --- the blocks that make up the document, in order --- */
  const headBlock = el('div', { class: 'head' },
    el('h1', {}, (data.who ? data.who + '’s ' : '') + 'Medication Schedule'),
    el('div', { class: 'sub' }, 'Week of ', el('span', { class: 'fill w6' }),
      ' · tick each box when the dose is taken'),
    el('div', { class: 'alrg' },
      el('span', { class: 'lab' }, 'ALLERGIES'),
      data.allergies ? el('span', { class: 'val', text: data.allergies }) : el('span', { class: 'fill' })),
    el('div', { class: 'contacts' },
      el('span', {}, el('b', {}, 'Prescriber: '),
        data.prescriber || data.prescriberPhone
          ? [data.prescriber, data.prescriberPhone].filter(Boolean).join(' · ')
          : el('span', { class: 'fill w8' })),
      el('span', {}, el('b', {}, 'Pharmacy: '),
        data.pharmacy || data.pharmacyPhone
          ? [data.pharmacy, data.pharmacyPhone].filter(Boolean).join(' · ')
          : el('span', { class: 'fill w8' }))));

  const schedRows = [];
  for (const m of data.meds) {
    if (m.prn) continue;
    for (const time of sortTimes(m.times)) {
      schedRows.push(el('tr', {},
        el('td', {},
          el('div', { class: 'med' }, nameLine(m)),
          el('div', { class: 'when' }, timeLabel(time) + (m.notes ? ', ' + m.notes : ''))),
        ...DAYS.map(() => el('td', { class: 'day' }, el('span', { class: 'box' })))));
    }
  }
  const prnMeds = data.meds.filter(m => m.prn);
  const prnHeading = prnMeds.length
    ? el('div', { class: 'prnhead' }, 'AS NEEDED, not on the schedule. Take only when it is needed.')
    : null;
  const prnRows = prnMeds.map(m => el('tr', {},
    el('td', {}, el('div', { class: 'med' }, nameLine(m))),
    el('td', {}, el('div', { class: 'when' }, m.notes || '—')),
    el('td', {}, el('div', { class: 'when' }, m.max || '—'))));

  const foot = el('div', { class: 'foot' },
    'A family memory aid, not a medical record or medical advice. '
    + 'Confirm all doses and times with the prescriber or pharmacist.');

  /* --- measure at true print width, then pack into pages --- */
  const meas = el('div', { class: 'measure' });
  const probeHead = el('div', { class: 'runhead' }, el('span', {}, 'x'), el('span', {}, 'x'));
  const mSched = schedTable(), mPrn = prnTable();
  for (const r of schedRows) mSched.tBodies[0].append(r);
  for (const r of prnRows) mPrn.tBodies[0].append(r);
  meas.append(probeHead, headBlock, mSched);
  if (prnHeading) meas.append(prnHeading, mPrn);
  meas.append(foot);
  sheet.append(meas);

  const h = (n) => (n && n.offsetHeight) || 0;
  const runheadH = h(probeHead);
  const theadH = { sched: h(mSched.tHead), prn: h(mPrn.tHead) };
  const blockH = new Map([[headBlock, h(headBlock)], [foot, h(foot)]]);
  if (prnHeading) blockH.set(prnHeading, h(prnHeading));
  const rowH = new Map();
  for (const r of [...schedRows, ...prnRows]) rowH.set(r, h(r));
  meas.remove();

  const items = [{ node: headBlock, h: blockH.get(headBlock) }];
  for (const r of schedRows) items.push({ node: r, h: rowH.get(r), table: 'sched' });
  if (prnHeading) {
    items.push({ node: prnHeading, h: blockH.get(prnHeading) });
    for (const r of prnRows) items.push({ node: r, h: rowH.get(r), table: 'prn' });
  }
  items.push({ node: foot, h: blockH.get(foot) });

  const usable = Math.max(0, PAGE_H_MM * PX_PER_MM - runheadH);
  const pages = [];
  let page = null, used = 0;
  const startPage = () => {
    page = { node: el('div', { class: 'sheetpage' }), open: null, tbody: null };
    pages.push(page); used = 0;
  };
  startPage();
  for (const it of items) {
    const needsHead = it.table && page.open !== it.table;
    const need = it.h + (needsHead ? theadH[it.table] : 0);
    if (used > 0 && usable > 0 && used + need > usable) startPage();
    if (it.table) {
      if (page.open !== it.table) {
        const t = it.table === 'sched' ? schedTable() : prnTable();
        page.node.append(t);
        page.open = it.table;
        page.tbody = t.tBodies[0];
        used += theadH[it.table];
      }
      page.tbody.append(it.node);
    } else {
      page.node.append(it.node);
      page.open = null;
    }
    used += it.h;
  }
  // an empty card still prints a usable blank grid
  if (!schedRows.length && !prnRows.length) {
    const t = schedTable();
    pages[0].node.insertBefore(t, foot);
  }

  pageCount = pages.length;
  pages.forEach((p, i) => {
    p.node.prepend(el('div', { class: 'runhead' },
      el('span', {}, (data.who ? data.who + ' · ' : '') + 'Medication schedule'),
      el('span', {}, 'printed ' + today + ' · page ' + (i + 1) + ' of ' + pages.length)));
    sheet.append(p.node);
  });

  fitPreview();
  updateFitNote();
}

/* The preview is the real sheet at true print width, scaled to the column it
   sits in, not a redrawn approximation. */
function fitPreview() {
  const frame = $('previewFrame'), scaler = $('sheetScale'), sheet = $('sheet');
  if (!frame || !scaler) return;
  // clientWidth still counts the frame's padding, which would over-scale the
  // sheet and clip the Sunday column off the right of the preview
  const cs = window.getComputedStyle(frame);
  const avail = frame.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const w = SHEET_W_MM * PX_PER_MM;
  const k = avail > 0 ? Math.min(1, avail / w) : 1;
  scaler.style.width = w + 'px';
  scaler.style.transform = 'scale(' + k.toFixed(4) + ')';
  scaler.style.height = Math.round((sheet.offsetHeight || 0) * k) + 'px';
}

const SIZE_PT = { std: '11 pt', lg: '18 pt', xl: '22 pt', xxl: '28 pt' };
function updateFitNote() {
  const rows = rowCount(data.meds);
  const pages = pageCount;
  $('fitNote').textContent = rows + (rows === 1 ? ' row' : ' rows') + ' at ' + SIZE_PT[data.size]
    + ', ' + (pages === 1 ? 'fits on one page (Letter or A4).'
      : pages + ' pages. Each one carries the name, the date and its page number.');
}

function commit() {
  save();
  renderList();
  renderSheet();
}

/* ---------- add / edit ---------- */
function readForm() {
  const name = $('medName').value.trim();
  if (!name) { toast('What’s the medication called?', { assertive: true }); $('medName').focus(); return null; }
  const prn = $('medPrn').checked;
  const times = [...$('medTimes').querySelectorAll('input:checked')].map(c => c.value);
  if (!prn && times.length === 0) {
    toast('Pick a time of day, or mark it as needed', { assertive: true });
    $('medTimes').querySelector('input').focus();
    return null;
  }
  return coerceMed({
    name,
    alias: $('medAlias').value,
    dose: $('medDose').value,
    times, prn,
    notes: $('medNotes').value,
    max: $('medMax').value,
  });
}
function clearForm() {
  for (const id of ['medName', 'medAlias', 'medDose', 'medNotes', 'medMax']) $(id).value = '';
  $('medPrn').checked = false;
  $('medTimes').querySelectorAll('input').forEach(c => { c.checked = false; });
  syncPrn();
}
function startEdit(id) {
  const m = data.meds.find(x => x.id === id);
  if (!m) return;
  editingId = id;
  $('medName').value = m.name;
  $('medAlias').value = m.alias;
  $('medDose').value = m.dose;
  $('medNotes').value = m.notes;
  $('medMax').value = m.max;
  $('medPrn').checked = m.prn;
  $('medTimes').querySelectorAll('input').forEach(c => { c.checked = m.times.includes(c.value); });
  syncPrn();
  $('addMed').textContent = 'Save changes';
  $('cancelEdit').classList.remove('hidden');
  $('addHeading').textContent = 'Edit ' + m.name;
  renderList();
  const card = $('addCard');
  if (card.scrollIntoView) card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  $('medName').focus();
  $('medName').select();
}
function cancelEdit() {
  editingId = null;
  $('addMed').textContent = 'Add to the schedule';
  $('cancelEdit').classList.add('hidden');
  $('addHeading').textContent = 'Add a medication';
  clearForm();
}
function reducedMotion() {
  if (document.documentElement.getAttribute('data-motion') === 'less') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
function syncPrn() {
  const prn = $('medPrn').checked;
  $('medTimes').closest('.whenset').classList.toggle('dim', prn);
  $('medTimes').querySelectorAll('input').forEach(c => { c.disabled = prn; });
  $('maxField').classList.toggle('hidden', !prn);
}

function submitMed() {
  const med = readForm();
  if (!med) return;
  const others = data.meds.filter(m => m.id !== editingId);
  if (rowCount(others) + rowsOf(med) > ROW_CAP) {
    toast('That is ' + ROW_CAP + ' rows, as much as one card should hold. '
      + 'Print this one, then start a second card.', { assertive: true, ms: 6000 });
    return;
  }
  if (editingId) {
    const idx = data.meds.findIndex(m => m.id === editingId);
    med.id = editingId;
    data.meds[idx] = med;
    cancelEdit();
    commit();
    savedFlag();
    toast('Saved changes to ' + med.name + ' · ' + pageWord());
    const btn = $('medList').querySelector('li:nth-child(' + (idx + 1) + ') .btn');
    if (btn) btn.focus(); else $('medName').focus();
  } else {
    data.meds.push(med);
    clearForm();
    commit();
    savedFlag();
    toast(med.name + ' added to the card · ' + pageWord());
    $('medName').focus();
  }
}
const pageWord = () => (pageCount === 1 ? 'prints on 1 page' : 'prints on ' + pageCount + ' pages');

/* ---------- share ----------
   The payload is kept as small as it can honestly be: times ride as a 4-bit
   mask, empty fields are dropped rather than encoded as "", and empty tails
   are trimmed. That is not tidiness, every character is more QR modules, and
   the code stops being scannable long before the link stops working. */
const TIME_BIT = { Morning: 1, Noon: 2, Evening: 4, Bedtime: 8 };
function encodeCard() {
  const out = { v: 2 };
  const put = (k, v) => { if (v) out[k] = v; };
  put('w', data.who); put('a', data.allergies);
  put('pr', data.prescriber); put('prp', data.prescriberPhone);
  put('ph', data.pharmacy); put('php', data.pharmacyPhone);
  if (TIME_ORDER.some(t => data.clock[t])) out.c = data.clock;
  if (data.size !== 'lg') out.s = data.size;
  out.m = data.meds.map(m => {
    const mask = m.prn ? 0 : m.times.reduce((a, t) => a | TIME_BIT[t], 0);
    const row = [m.name, mask, m.dose, m.alias, m.notes, m.max];
    while (row.length > 2 && !row[row.length - 1]) row.pop();
    return row;
  });
  return btoa(unescape(encodeURIComponent(JSON.stringify(out))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCard(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return null;
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.m)) return null;
    // v1 links carried [name, dose, times[], notes]; v2 is [name, mask, dose, alias, notes, max]
    const meds = obj.m.filter(Array.isArray).map((a) => {
      if (Array.isArray(a[2])) return { name: a[0], dose: a[1], times: a[2], notes: a[3] };
      const mask = typeof a[1] === 'number' ? a[1] : 0;
      return {
        name: a[0], dose: a[2], alias: a[3], notes: a[4], max: a[5],
        times: TIME_ORDER.filter(t => mask & TIME_BIT[t]),
        prn: mask === 0,
      };
    });
    const raw = {
      who: obj.w, allergies: obj.a,
      prescriber: obj.pr, prescriberPhone: obj.prp,
      pharmacy: obj.ph, pharmacyPhone: obj.php,
      clock: obj.c, size: obj.s, meds,
    };
    const { card, dropped, trimmed } = normalizeCard(raw);
    return card.meds.length ? { card, dropped, trimmed } : null;
  } catch (e) { return null; }
}
const cardShareUrl = () => (location.origin === 'null' || location.protocol === 'file:'
  ? location.href.split('#')[0] : location.origin + location.pathname) + '#' + encodeCard();

/* An incoming link is somebody else's work. Cancelling used to strip the hash
   as well, so "no thanks" destroyed the payload and the sender had to resend. */
function offerShared(shared) {
  const n = shared.card.meds.length;
  const mine = data.meds.length;
  const accept = () => {
    data = shared.card;
    save();
    fillFromData();
    commit();
    history.replaceState(null, '', location.pathname);
    box.remove();
    let msg = 'Schedule loaded from the link';
    if (shared.trimmed) {
      msg += ', ' + shared.trimmed + (shared.trimmed === 1 ? ' medication' : ' medications')
        + ' past the ' + ROW_CAP + '-row limit had to be left off';
    }
    toast(msg, { ms: shared.trimmed ? 6000 : 4000 });
    $('whoInput').focus();
  };
  const keep = () => {
    box.remove();
    toast('Kept your card. The shared link is still in the address bar if you change your mind.', { ms: 6000 });
    $('whoInput').focus();
  };
  const box = el('section', { class: 'card offer', id: 'sharedOffer', tabindex: '-1' },
    el('h2', {}, 'Someone shared a schedule with you'),
    el('p', {}, 'This link holds ' + n + (n === 1 ? ' medication' : ' medications')
      + (shared.card.who ? ' for ' + shared.card.who : '') + '. Opening it replaces the card on this device ('
      + mine + (mine === 1 ? ' medication' : ' medications') + ').'),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'button', onclick: accept }, 'Open the shared card'),
      el('button', { class: 'btn', type: 'button', onclick: keep }, 'Keep mine')));
  $('editor').prepend(box);
  box.focus();
}

/* ---------- QR ---------- */
const MIN_MODULE_PX = 4;   // below this a phone camera cannot resolve the code
const qrBoxPx = () => Math.max(200, Math.min(360, Math.round(window.innerWidth * 0.92) - 56));
function showQr(url) {
  const dlg = $('qrDlg');
  const canvas = $('qrCanvas');
  const note = $('qrNote');
  $('qrUrl').value = url;
  let qr = null, count = 0;
  try {
    qr = window.qrcode(0, 'L');           // L holds the most data; this is a link, not a label
    qr.addData(url); qr.make();
    count = qr.getModuleCount();
  } catch (e) { qr = null; }

  const quiet = 4;
  const box = qrBoxPx();
  // an integer number of CSS pixels per module, a fractionally scaled canvas
  // is a blurred code, which is the failure this fix exists to end
  const cssModule = qr ? Math.floor(box / (count + quiet * 2)) : 0;
  if (!qr || cssModule < MIN_MODULE_PX) {
    canvas.classList.add('hidden');
    note.textContent = 'This schedule is too big for a QR code a phone camera could read '
      + '(' + data.meds.length + ' medications). Use the link below instead, it holds exactly the same card.';
  } else {
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const cell = cssModule * dpr;
    const px = cell * (count + quiet * 2);
    canvas.width = px; canvas.height = px;
    canvas.style.width = (cssModule * (count + quiet * 2)) + 'px';
    canvas.classList.remove('hidden');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = '#000';
      for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
    note.textContent = 'Point another phone’s camera at it. The whole schedule travels inside the code, '
      + 'nothing is uploaded.';
  }
  try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
}

/* ---------- wiring ---------- */
function bindText(id, key, max) {
  const input = $(id);
  input.addEventListener('input', () => {
    data[key] = str(input.value, max);
    save();
    renderSheet();
  });
  input.addEventListener('change', savedFlag);
}
function fillFromData() {
  $('whoInput').value = data.who;
  $('allergyInput').value = data.allergies;
  $('prescriber').value = data.prescriber;
  $('prescriberPhone').value = data.prescriberPhone;
  $('pharmacy').value = data.pharmacy;
  $('pharmacyPhone').value = data.pharmacyPhone;
  for (const t of TIME_ORDER) $('clock' + t).value = data.clock[t] || '';
  setSize(data.size, true);
}
function setSize(size, quiet) {
  data.size = SIZES.includes(size) ? size : 'lg';
  for (const b of $('sizeSeg').querySelectorAll('button')) {
    const on = b.dataset.size === data.size;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (!quiet) { save(); renderSheet(); toast('Printed text set to ' + SIZE_PT[data.size] + ' · ' + pageWord()); }
}

function wire() {
  // Ctrl/Cmd+P must print the CURRENT card, stale medication info is dangerous
  window.addEventListener('beforeprint', renderSheet);
  bindText('whoInput', 'who', 40);
  bindText('allergyInput', 'allergies', 200);
  bindText('prescriber', 'prescriber', 60);
  bindText('prescriberPhone', 'prescriberPhone', 30);
  bindText('pharmacy', 'pharmacy', 60);
  bindText('pharmacyPhone', 'pharmacyPhone', 30);
  for (const t of TIME_ORDER) {
    const input = $('clock' + t);
    input.addEventListener('input', () => { data.clock[t] = str(input.value, 12); save(); renderList(); renderSheet(); });
    input.addEventListener('change', savedFlag);
  }
  $('medPrn').addEventListener('change', syncPrn);
  $('addMed').addEventListener('click', submitMed);
  $('cancelEdit').addEventListener('click', () => { cancelEdit(); renderList(); $('medName').focus(); });
  $('emptyAdd').addEventListener('click', () => { $('medName').focus(); });
  for (const b of $('sizeSeg').querySelectorAll('button')) {
    b.addEventListener('click', () => setSize(b.dataset.size));
  }
  $('printBtn').addEventListener('click', () => { renderSheet(); window.print(); });
  $('qrClose').addEventListener('click', () => {
    const d = $('qrDlg');
    try { d.close(); } catch (e) { d.removeAttribute('open'); }
  });
  $('qrCopy').addEventListener('click', () => copyText($('qrUrl').value, 'Link copied'));
  $('shareBtn').addEventListener('click', () => {
    if (data.meds.length === 0) { toast('Add the medications first'); return; }
    copyText(cardShareUrl(), 'Link copied, the whole schedule is inside it');
  });
  $('qrBtn').addEventListener('click', () => {
    if (data.meds.length === 0) { toast('Add the medications first'); return; }
    showQr(cardShareUrl());
  });
  let rafId = 0;
  window.addEventListener('resize', () => {
    if (!window.requestAnimationFrame) { fitPreview(); return; }
    window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(fitPreview);
  });
  // the comfort panel changes the width of the column the preview sits in
  if (window.MutationObserver) {
    new window.MutationObserver(() => fitPreview()).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-text', 'data-density', 'style'] });
  }
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  const lostNotice = load();
  const shared = decodeCard(location.hash);
  let sharedTaken = false;
  if (shared && data.meds.length === 0) {
    // nothing of the user's to destroy
    data = shared.card;
    save();
    sharedTaken = true;
  }
  fillFromData();
  commit();
  if (shared && !sharedTaken) offerShared(shared);
  else if (sharedTaken) { history.replaceState(null, '', location.pathname); toast('Schedule loaded from the link'); }
  else if (lostNotice) toast(lostNotice, { ms: 7000, assertive: true });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
