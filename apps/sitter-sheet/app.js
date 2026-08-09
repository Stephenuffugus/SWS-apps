// Sitter Sheet — babysitter/pet-sitter one-pager.
//
// Two readers, two documents. The PARENT gets an edit form; the SITTER gets a
// read-only page led by the three things that matter in the worst three
// seconds this sheet will ever have: where you are, what they are allergic to,
// and a phone number their thumb can hit. Everything is localStorage and print
// CSS — no account, no upload, no network call after load.
//
// All user data reaches the DOM via textContent.

const CONFIG = { tipUrl: 'https://buy.stripe.com/bJe28s1vj5P98zH7i17EQ0a' };

/* The old 2,000-char cap was enforced against the STORE and not the field, so
   a long medication schedule looked complete, saved short, and only revealed
   the loss after a reload. The control now carries maxlength, so nothing can
   be typed and silently lost, and the ceiling is high enough that a chatty
   bedtime routine never reaches it. Both halves of the app must agree — the
   share decoder slices to the same number. */
const MAXLEN = 4000;
const COUNT_FROM = 200;   // show the countdown only in the last 200 chars

/* Paper geometry, US Letter at 96dpi with the base layer's 14mm @page margin.
   The on-screen preview is laid out at these exact numbers, which is what
   makes its page count a measurement rather than a guess. */
const PAPER_W = 816;      // 8.5in
const PAGE_H = 950;       // 11in − 2 × 14mm

/* A QR module below ~2 CSS pixels cannot be resolved by a phone camera at
   arm's length. Drawing one anyway is worse than refusing, because the dialog
   opens confidently and two people stand in a hallway trying. */
const QR_MIN_CSS_PX = 2;
const QR_QUIET = 4;       // quiet-zone modules each side, per the QR spec

const $ = (id) => document.getElementById(id);

/* A segmented control is a toggle-button group: .active carries the look,
   aria-pressed carries the same fact to a screen reader. Keeping the two in
   one function is what stops them drifting apart. */
const setPressed = (el, on) => {
  if (!el) return;
  el.classList.toggle('active', on);
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
};

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

/* The shared runtime (sws-ui.js) owns the toast, because it is also what
   carries Undo. It is a plain <script> so it may legitimately be absent under
   a test harness; everything below degrades to the local pill. */
let toastTimer = null;
function rawToast(msg, ms) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}
function toast(msg, opts) {
  const o = opts || {};
  if (window.SWS && window.SWS.toast) return window.SWS.toast(msg, o);
  return rawToast(msg, o.ms);
}
/* Snapshot-and-restore, never a hand-written inverse: a snapshot cannot forget
   a side effect. */
function undoable(msg, restore) {
  if (window.SWS && window.SWS.undo) return window.SWS.undo(msg, restore);
  return rawToast(msg, 4000);
}
function flagSaved() {
  if (window.SWS && window.SWS.saved) window.SWS.saved({ text: 'Saved' });
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg || 'Copied');
    return true;
  } catch (e) {
    return false;
  }
}

/* ── Schema ─────────────────────────────────────────────────────────────────
   Each field: [key, label, multiline, hint, opts].

   That fourth column used to be a `placeholder` holding a fully-written fake
   answer — "Maya: peanuts (EpiPen on the counter!)", "Dr. Chen — 555-0177".
   Inside the box, in the same typeface as real content, those read as the
   family's own words on a stranger's phone; and at High contrast the base
   layer maps --ink-3 onto --ink, so grey stopped distinguishing them at all.

   So the app no longer puts anything inside an empty field, at any contrast
   setting, in any view. The guidance is a short non-actionable hint rendered
   underneath the control and wired up with aria-describedby, which is where a
   hint belongs: it stays visible while you type, and an empty box is
   unambiguously an empty box.                                               */
export const SCHEMAS = {
  baby: {
    title: 'Babysitter Sheet',
    sections: [
      ['The kids', [
        ['kids', 'Names & ages', true, 'e.g. each child’s name, age and what to know about them'],
        ['bedtime', 'Bedtime & routine', true, 'e.g. bath, stories, lights out — and the comfort item'],
        ['meals', 'Meals & snacks', true, 'e.g. what to serve, when, and what is off limits'],
      ]],
      ['Health & safety', [
        ['allergies', 'Allergies & medications', true, 'e.g. what to avoid, any dose and time, where the EpiPen is'],
        ['rules', 'House rules', true, 'e.g. screens, rooms, going outside'],
      ]],
      ['Contacts', [
        ['parents', 'Us (the parents)', true, 'e.g. your names and mobile numbers, and when you are back'],
        ['backup', 'Backup person', false, 'e.g. a neighbour or relative nearby, with a number'],
        ['doctor', 'Doctor / after-hours', false, 'e.g. practice name and after-hours number'],
        ['address', 'Our address (for 911)', false, 'e.g. house number and street, as you would read it out', { auto: 'street-address' }],
        ['cross', 'Nearest cross street', false, 'e.g. the corner a dispatcher can find'],
      ]],
      ['The house', [
        ['wifi', 'WiFi', false, 'e.g. network name and password'],
        ['house', 'Quirks & where things are', true, 'e.g. sticky doors, thermostat, where the first-aid kit lives'],
      ]],
    ],
    /* The 3-second panel. These keys are lifted out of the columns and printed
       at the top of the page at maximum size, filled in or not. */
    top3: {
      alert: 'allergies',
      alertLabel: 'Allergies & medications',
      calls: [['Ambulance, fire, police', '911'], ['Poison Control', '1-800-222-1222']],
      extra: null,
      extraLabel: '',
    },
    /* The four or five things a sitter is actually stuck without. The app nags
       about these and stays silent about everything else. */
    needed: [
      ['allergies', 'No allergy or medication info.'],
      ['address', 'No home address for 911.'],
      ['cross', 'No cross street.'],
      ['parents', 'No way to reach you.'],
      ['backup', 'No backup contact.'],
    ],
  },
  pet: {
    title: 'Pet Sitter Sheet',
    sections: [
      ['The animals', [
        ['pets', 'Names & who they are', true, 'e.g. each animal’s name, species, age and temperament'],
        ['feeding', 'Feeding', true, 'e.g. what, how much, what time, and where it is kept'],
        ['walks', 'Walks & litter', true, 'e.g. walk times, where the harness is, litter routine'],
      ]],
      ['Health', [
        ['meds', 'Medications & allergies', true, 'e.g. what to give, how much, when — and anything to avoid'],
        ['vet', 'Vet & emergency vet', true, 'e.g. practice names and numbers, day and out-of-hours'],
      ]],
      ['Contacts', [
        ['owner', 'Us (the owners)', true, 'e.g. your names and mobile numbers, and when you are back'],
        ['backup', 'Backup person', false, 'e.g. a neighbour with a key, with a number'],
        ['address', 'Our address', false, 'e.g. house number and street', { auto: 'street-address' }],
        ['cross', 'Nearest cross street', false, 'e.g. the corner a stranger can find'],
      ]],
      ['The house', [
        ['wifi', 'WiFi', false, 'e.g. network name and password'],
        ['house', 'Quirks & where things are', true, 'e.g. leads, treats, alarm, what the animals are not allowed to do'],
      ]],
    ],
    top3: {
      alert: 'meds',
      alertLabel: 'Medications & allergies',
      calls: [['Ambulance, fire, police', '911']],
      extra: 'vet',
      extraLabel: 'Vet & emergency vet',
    },
    needed: [
      ['meds', 'No medication or allergy info.'],
      ['vet', 'No vet or emergency vet.'],
      ['address', 'No home address.'],
      ['owner', 'No way to reach you.'],
      ['backup', 'No backup contact.'],
    ],
  },
};

const EMERGENCY_NOTE = {
  baby: 'Call 911 first, then us. Poison Control: 1-800-222-1222.',
  pet: 'If anything feels wrong, call us first — then the emergency vet. Better a silly call than a sorry one.',
};

let mode = 'baby';
const KEY = (m) => 'sitter-' + m;
let data = {};

/* view: 'edit' — the parent's form.
   'sitter' — the read-only page, either because a link carried a sheet
   ('link') or because the parent asked to see it ('preview'). */
let view = 'edit';
let sitterFrom = 'link';

const isField = (k) => k.charAt(0) !== '_';
const fieldKeys = (m) => SCHEMAS[m].sections.flatMap(([, fields]) => fields.map(([key]) => key));
const val = (k) => (data[k] || '').trim();
const hasContent = () => Object.keys(data).some((k) => isField(k) && val(k));

function load() {
  try { data = JSON.parse(localStorage.getItem(KEY(mode))) || {}; }
  catch (e) { data = {}; }
  if (!data || typeof data !== 'object') data = {};
}
function save() {
  try { localStorage.setItem(KEY(mode), JSON.stringify(data)); } catch (e) {}
}
function touch() { data._u = new Date().toISOString().slice(0, 10); }

function prettyDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(iso);
  try { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return String(iso); }
}

/* ── Phone numbers ──────────────────────────────────────────────────────────
   Every number in this app used to live inside a <textarea>, so it was not
   even long-pressable. In the sitter view each run of digits becomes a tel:
   anchor sized as a real target. The character class deliberately excludes
   ":" and newline so "7:30 bath, 8:00 books" is not a phone number, and a
   run has to hold 7–15 digits to qualify.                                   */
const PHONE = /\+?\d[\d\-().  \t]{5,}\d/g;

function linkifyPhones(text) {
  const out = [];
  let last = 0, m;
  PHONE.lastIndex = 0;
  while ((m = PHONE.exec(text)) !== null) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    const dateish = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw);
    if (digits.length < 7 || digits.length > 15 || dateish) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(el('a', {
      class: 'tel',
      href: 'tel:' + (raw.charAt(0) === '+' ? '+' : '') + digits,
    }, raw));
    last = m.index + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

/* ── The parent's form ──────────────────────────────────────────────────── */
let saveTimer = null;
function renderForm() {
  setPressed($('modeBaby'), mode === 'baby');
  setPressed($('modePet'), mode === 'pet');
  const schema = SCHEMAS[mode];
  const form = $('form');
  form.replaceChildren();
  for (const [section, fields] of schema.sections) {
    form.append(el('h3', {}, section));
    for (const [key, label, multi, hint, opts] of fields) {
      const o = opts || {};
      const id = 'f-' + key;
      const hintId = 'h-' + key;
      /* The tick and the counter are decoration for someone looking at the
         field. aria-hidden keeps them out of the input's accessible name,
         which is the label text and nothing else. */
      const mark = el('span', { class: 'fmark', 'aria-hidden': 'true' });
      const count = el('span', { class: 'cnt', 'aria-hidden': 'true' });
      const attrs = {
        id,
        maxlength: MAXLEN,
        autocomplete: o.auto || 'off',
        'aria-describedby': hintId,
      };
      const input = multi ? el('textarea', attrs) : el('input', { type: 'text', ...attrs });
      input.value = data[key] || '';
      const wrap = el('div', { class: 'field' },
        el('label', { for: id }, label, mark),
        input,
        el('p', { class: 'hint', id: hintId, text: hint }),
        count);

      const paint = () => {
        const v = input.value;
        const filled = !!v.trim();
        wrap.classList.toggle('is-filled', filled);
        /* A tick, not a colour: at High contrast the base layer collapses
           --ink-3 into --ink, so anything that relied on grey to say "empty"
           stops saying it. A glyph survives every contrast setting. */
        mark.textContent = filled ? ' ✓' : '';
        const left = MAXLEN - v.length;
        count.textContent = left <= COUNT_FROM ? left + ' characters left' : '';
      };
      input.addEventListener('input', () => {
        data[key] = input.value.slice(0, MAXLEN);
        touch();
        save();
        paint();
        renderGaps();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { flagSaved(); schedulePreview(); }, 400);
      });
      paint();
      form.append(wrap);
    }
  }
  renderGaps();
  schedulePreview();
}

/* ── Completeness: name the missing high-stakes fields, nothing else ────── */
function missing() {
  return SCHEMAS[mode].needed.filter(([k]) => !val(k)).map(([, say]) => say);
}
function renderGaps() {
  const box = $('gaps');
  if (!box) return;
  const gaps = missing();
  box.classList.toggle('hidden', !gaps.length || !hasContent());
  if (!gaps.length) return;
  box.replaceChildren(
    el('b', {}, 'Before you hand this over: '),
    document.createTextNode(gaps.join(' ')),
  );
}

/* ── The sheet: one renderer, used for paper and for the on-screen preview ─ */
function filledSections(skip) {
  return SCHEMAS[mode].sections
    .map(([name, fields]) => [name, fields.filter(([key]) => val(key) && !skip.has(key))])
    .filter(([, fields]) => fields.length);
}

function top3El() {
  const t = SCHEMAS[mode].top3;
  const none = '— not filled in —';
  const where = el('div', { class: 't3 where' },
    el('div', { class: 't3l', text: 'Where you are' }),
    el('div', { class: 't3v', text: val('address') || none }));
  if (val('cross')) where.append(el('div', { class: 't3v2', text: 'Nearest cross street: ' + val('cross') }));
  const alert = el('div', { class: 't3 alert' },
    el('div', { class: 't3l', text: t.alertLabel }),
    el('div', { class: 't3v', text: val(t.alert) || none }));
  const call = el('div', { class: 't3 call' },
    el('div', { class: 't3l', text: 'In an emergency' }),
    el('div', { class: 't3v', text: t.calls.map(([lbl, num]) => lbl + ' ' + num).join('  ·  ') }));
  const out = [where, alert];
  if (t.extra) out.push(el('div', { class: 't3 vet' },
    el('div', { class: 't3l', text: t.extraLabel }),
    el('div', { class: 't3v2', text: val(t.extra) || none })));
  out.push(call);
  return el('div', { class: 'top3' }, out);
}

function buildSheet(target) {
  const schema = SCHEMAS[mode];
  target.replaceChildren();
  const head = el('div', { class: 'shead' },
    el('h1', {}, schema.title),
    el('div', { class: 'sub', text: 'Thank you for taking care of them 💛' }));
  if (data._u) head.append(el('div', { class: 'stamp', text: 'Updated ' + prettyDate(data._u) }));
  target.append(head);

  if (!hasContent()) {
    target.append(el('div', { class: 'nothing', text:
      'Nothing filled in yet. Add a few details and this page fills itself.' }));
    return;
  }

  target.append(top3El());

  const t = schema.top3;
  const skip = new Set(['address', 'cross', t.alert, t.extra].filter(Boolean));
  /* CSS multi-column, not two flex children. A flex row cannot fragment across
     a page, which is why 18 lines used to cost a second page for 69 characters
     and 40 lines lost nine of them entirely. Multicol paginates natively. */
  const cols = el('div', { class: 'cols' });
  for (const [, fields] of filledSections(skip)) {
    for (const [key, label] of fields) {
      cols.append(el('div', { class: 'block' },
        el('h2', {}, label),
        el('div', { class: 'v', text: data[key] })));
    }
  }
  target.append(cols);
  target.append(el('div', { class: 'em' }, el('b', {}, '! '), EMERGENCY_NOTE[mode]));
}

function renderSheet() { buildSheet($('sheet')); }

/* ── Print preview: literally the printed page, at 1:1 geometry then scaled ─ */
let pvTimer = null;
function schedulePreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(renderPreview, 120);
}
function renderPreview() {
  const paper = $('pvPaper');
  if (!paper) return;
  const content = el('div', { class: 'pcontent' });
  buildSheet(content);
  paper.replaceChildren(content);
  layoutPreview();
}
function layoutPreview() {
  const scroll = $('pvScroll'), stage = $('pvStage'), paper = $('pvPaper');
  if (!scroll || !stage || !paper) return;
  const content = paper.firstElementChild;
  if (!content) return;
  const pages = Math.max(1, Math.ceil(content.scrollHeight / PAGE_H));

  // page-break guides, in paper coordinates
  for (const old of [...paper.querySelectorAll('.pgline')]) old.remove();
  for (let i = 1; i < pages; i++) {
    paper.append(el('div', { class: 'pgline', style: 'top:' + (53 + i * PAGE_H) + 'px' },
      el('span', { text: 'page ' + (i + 1) })));
  }
  paper.style.height = (53 + pages * PAGE_H) + 'px';

  const avail = scroll.clientWidth || PAPER_W;
  const s = Math.min(1, avail / PAPER_W);
  paper.style.transform = 'scale(' + s + ')';
  stage.style.height = Math.round((53 + pages * PAGE_H) * s) + 'px';

  const count = $('pvCount');
  if (count) count.textContent = pages === 1
    ? 'Fits on one page.'
    : pages + ' pages. Shorten an answer if you want it on one.';
}

/* ── The sitter's page ──────────────────────────────────────────────────── */
function telRow(label, num) {
  return el('a', { class: 'tel big', href: 'tel:' + num.replace(/[^\d+]/g, '') },
    el('span', { class: 'tellbl', text: label }),
    el('span', { class: 'telnum', text: num }));
}

function renderSitter() {
  const box = $('sitterView');
  const schema = SCHEMAS[mode];
  const t = schema.top3;
  const none = '— not filled in —';
  box.replaceChildren();

  const head = el('section', { class: 'card' },
    el('h2', { class: 'stitle' }, schema.title));
  if (data._u) head.append(el('p', { class: 'sub', text: 'Updated ' + prettyDate(data._u) }));
  box.append(head);

  /* The 3-second panel. Address, allergies, and a number a thumb can hit —
     pinned above everything else whether or not the parent filled them in. */
  const panel = el('section', { class: 'card s3' });
  panel.append(el('h2', { class: 'sr-only' }, 'The three things you may need in a hurry'));

  const where = el('div', { class: 'scell' },
    el('div', { class: 'slabel', text: 'Where you are' }),
    el('div', { class: 'sbig', text: val('address') || none }));
  if (val('cross')) where.append(el('div', { class: 'sval', text: 'Nearest cross street: ' + val('cross') }));
  panel.append(where);

  panel.append(el('div', { class: 'scell alert' },
    el('div', { class: 'slabel' }, el('span', { class: 'rchip', text: 'Important' }), ' ' + t.alertLabel),
    el('div', { class: 'sbig', text: val(t.alert) || none })));

  if (t.extra) {
    panel.append(el('div', { class: 'scell' },
      el('div', { class: 'slabel', text: t.extraLabel }),
      el('div', { class: 'sval' }, linkifyPhones(val(t.extra) || none))));
  }

  const calls = el('div', { class: 'scell calls' },
    el('div', { class: 'slabel', text: 'In an emergency' }));
  for (const [lbl, num] of t.calls) calls.append(telRow(lbl, num));
  panel.append(calls);
  box.append(panel);

  const skip = new Set(['address', 'cross', t.alert, t.extra].filter(Boolean));
  for (const [name, fields] of filledSections(skip)) {
    const card = el('section', { class: 'card' }, el('h2', {}, name));
    for (const [key, label] of fields) {
      card.append(el('div', { class: 'scell' },
        el('div', { class: 'slabel', text: label }),
        el('div', { class: 'sval' }, linkifyPhones(data[key]))));
    }
    box.append(card);
  }

  /* What this page did and did not do to your phone, said out loud. */
  const foot = el('section', { class: 'card' });
  if (sitterFrom === 'link' || sitterFrom === 'saved') {
    const saved = sitterFrom === 'saved';
    foot.append(el('p', { class: 'trust' },
      shieldIcon(),
      saved
        ? el('span', {}, el('b', {}, 'Saved to this device.'),
          ' It lives in this browser only — nothing was uploaded. Clear it any time from the edit screen.')
        : el('span', {}, el('b', {}, 'Nothing has been saved to this phone.'),
          ' This sheet is being read straight out of the link. Keep the link and it works offline; ' +
          'save it only if you want it to survive losing the message.')));
    const row = el('div', { class: 'row' });
    if (!saved) row.append(el('button', { class: 'btn', type: 'button', onclick: saveShared }, 'Save to this device'));
    row.append(
      el('button', { class: 'btn', type: 'button', onclick: editShared }, 'Edit this sheet'),
      el('button', { class: 'btn', type: 'button', onclick: printNow }, 'Print / Save as PDF'));
    foot.append(row);
  } else {
    foot.append(el('p', { class: 'hint', text:
      'This is exactly what the sitter sees when they open your link or scan the QR.' }));
    foot.append(el('div', { class: 'row' },
      el('button', { class: 'btn', type: 'button', onclick: backToEdit }, 'Back to editing'),
      el('button', { class: 'btn', type: 'button', onclick: printNow }, 'Print / Save as PDF')));
  }
  box.append(foot);
}

function shieldIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 3 4 6.5v5c0 4.6 3.2 8.3 8 9.5 4.8-1.2 8-4.9 8-9.5v-5L12 3Z', 'm9 12 2 2 4-4']) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function setView(next) {
  view = next;
  $('editView').classList.toggle('hidden', next !== 'edit');
  $('sitterView').classList.toggle('hidden', next !== 'sitter');
  if (next === 'sitter') renderSitter();
  else { renderForm(); }
  window.scrollTo(0, 0);
}

function showSitter(from) { sitterFrom = from; setView('sitter'); }
function backToEdit() { setView('edit'); }

function stripHash() {
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}

function restoreKey(m, before) {
  try {
    if (before === null) localStorage.removeItem(KEY(m));
    else localStorage.setItem(KEY(m), before);
  } catch (e) {}
}

function saveShared() {
  const m = mode;
  const before = localStorage.getItem(KEY(m));
  save();
  stripHash();
  sitterFrom = 'saved';
  renderSitter();
  /* Undo restores the STORE and leaves the sheet on screen — the link is still
     readable, it just is not on this phone any more. */
  undoable('Saved to this device.', () => {
    restoreKey(m, before);
    sitterFrom = 'link';
    renderSitter();
    toast('Removed. Nothing of theirs is on this device.');
  });
}
function editShared() {
  const m = mode;
  const before = localStorage.getItem(KEY(m));
  save();
  stripHash();
  setView('edit');
  undoable('Saved here, and open for editing.', () => {
    restoreKey(m, before);
    load();
    setView('edit');
    toast('Put back — your own sheet is as it was.');
  });
}
function printNow() {
  renderSheet();
  window.print();
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */
function switchMode(next) {
  if (mode === next) return;
  mode = next;
  load();
  setView('edit');
  const other = next === 'baby' ? 'pet sitter' : 'babysitter';
  toast('Showing your ' + (next === 'baby' ? 'babysitter' : 'pet sitter') +
    ' sheet — your ' + other + ' sheet is still saved.');
}

function wire() {
  $('modeBaby').addEventListener('click', () => switchMode('baby'));
  $('modePet').addEventListener('click', () => switchMode('pet'));
  // Ctrl/Cmd+P must print the CURRENT sheet, not a blank or stale one
  window.addEventListener('beforeprint', renderSheet);
  $('printBtn').addEventListener('click', () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    const gaps = missing();
    if (gaps.length) toast('Printing. Still missing: ' + gaps.join(' '), { ms: 6000 });
    printNow();
  });
  $('sitterBtn').addEventListener('click', () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    showSitter('preview');
  });
  $('textBtn').addEventListener('click', async () => {
    if (!hasContent()) { toast('Fill in at least one field first'); return; }
    const ok = await copyText(sheetText(), 'Copied as plain text — paste it into a message');
    if (!ok) showFallback(sheetText(), 'Your browser blocked the copy. Select the text below and copy it by hand.');
  });
  $('dlBtn').addEventListener('click', downloadSheet);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', importSheet);
  $('clearBtn').addEventListener('click', clearSheet);
  window.addEventListener('resize', layoutPreview);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => layoutPreview());
    const s = $('pvScroll');
    if (s) ro.observe(s);
  }
}

/* ── Plain text: the one share path that has no failure mode ────────────── */
function sheetText() {
  const schema = SCHEMAS[mode];
  const t = schema.top3;
  const lines = [schema.title.toUpperCase()];
  if (data._u) lines.push('Updated ' + prettyDate(data._u));
  lines.push('');
  if (val('address')) lines.push('WHERE WE ARE: ' + val('address'));
  if (val('cross')) lines.push('Nearest cross street: ' + val('cross'));
  if (val(t.alert)) lines.push(t.alertLabel.toUpperCase() + ': ' + val(t.alert));
  lines.push('IN AN EMERGENCY: ' + t.calls.map(([l, n]) => l + ' ' + n).join(' · '));
  const skip = new Set(['address', 'cross', t.alert].filter(Boolean));
  for (const [name, fields] of filledSections(skip)) {
    lines.push('', '— ' + name + ' —');
    for (const [key, label] of fields) lines.push(label + ': ' + val(key));
  }
  return lines.join('\n');
}

/* ── Take your data with you ────────────────────────────────────────────── */
function downloadSheet() {
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  const payload = { app: 'sitter-sheet', v: 1, mode, updated: data._u || null, sheet: {} };
  for (const k of fieldKeys(mode)) if (val(k)) payload.sheet[k] = data[k];
  let url = '';
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'sitter-sheet-' + mode + '.json' });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Downloaded. It is a plain JSON file — yours to keep.');
  } catch (e) {
    toast('Could not build the file');
  }
  if (url) setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importSheet(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    let obj = null;
    try { obj = JSON.parse(String(reader.result)); } catch (e) { obj = null; }
    const incoming = obj && obj.sheet && typeof obj.sheet === 'object' ? obj.sheet : null;
    if (!incoming) { toast('That does not look like a sitter sheet file'); return; }
    const m = obj.mode === 'pet' ? 'pet' : 'baby';
    const before = { mode, snapshot: JSON.stringify(data) };
    mode = m;
    load();
    const next = {};
    for (const k of fieldKeys(m)) {
      const v = incoming[k];
      if (typeof v === 'string' && v.trim()) next[k] = v.slice(0, MAXLEN);
    }
    if (!Object.keys(next).length) { mode = before.mode; load(); toast('That file had no sheet in it'); return; }
    if (typeof obj.updated === 'string') next._u = obj.updated;
    const overwritten = localStorage.getItem(KEY(m));
    data = next;
    save();
    setView('edit');
    undoable('Loaded ' + file.name + '.', () => {
      try {
        if (overwritten === null) localStorage.removeItem(KEY(m));
        else localStorage.setItem(KEY(m), overwritten);
      } catch (e) {}
      mode = before.mode;
      load();
      setView('edit');
    });
  };
  reader.readAsText(file);
}

function clearSheet() {
  if (!hasContent()) { toast('Nothing to clear'); return; }
  const snapshot = JSON.stringify(data);
  data = {};
  save();
  renderForm();
  undoable('Sheet cleared from this device.', () => {
    try { data = JSON.parse(snapshot) || {}; } catch (e) { data = {}; }
    save();
    renderForm();
    toast('Put back.');
  });
}

/* ── Share: the whole sheet travels inside the URL — nothing uploaded ────── */
function encodeSheet() {
  const filled = {};
  for (const [k, v] of Object.entries(data)) if (isField(k) && (v || '').trim()) filled[k] = v;
  const json = JSON.stringify({ m: mode, d: filled, u: data._u || undefined });
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
    const keys = new Set(fieldKeys(obj.m));
    const d = {};
    for (const [k, v] of Object.entries(obj.d))
      if (keys.has(k) && typeof v === 'string' && v.trim()) d[k] = v.slice(0, MAXLEN);
    if (!Object.keys(d).length) return null;
    if (typeof obj.u === 'string') d._u = obj.u;
    return { mode: obj.m, data: d };
  } catch (e) { return null; }
}
const sheetShareUrl = () => (location.origin === 'null' || location.protocol === 'file:'
  ? location.href.split('#')[0] : location.origin + location.pathname) + '#' + encodeSheet();

/* When the clipboard is refused — routine in iOS in-app browsers and over
   plain http on a LAN — the text has to appear somewhere selectable, or the
   output simply has no path at all. */
function showFallback(text, msg) {
  const box = $('fallback');
  const ta = $('fallbackText');
  if (!box || !ta) { toast('Could not copy'); return; }
  ta.value = text;
  box.classList.remove('hidden');
  $('fallbackMsg').textContent = msg;
  ta.focus();
  try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
}

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
    /* The recipient's phone does NOT get a silent copy of a stranger's
       address, wifi password and children's medications. The sheet is held in
       memory, shown read-only, and only written if they ask. The hash stays in
       the URL so a reload — offline, in someone else's basement — still works. */
    mode = shared.mode;
    data = shared.data;
    showSitter('link');
    toast('Sheet opened from the link. Nothing was saved to this device.', { ms: 6000 });
  } else {
    setView('edit');
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

/* ── QR share ───────────────────────────────────────────────────────────────
   The old path cornered itself twice: the bundled encoder's ceiling is 2,331
   characters and a realistic sheet makes a longer URL, and well below that
   ceiling it drew 1–2px modules into a fixed 300px bitmap — a code that opens
   confidently and cannot be scanned. Now: try a lower error-correction level
   before giving up, size the bitmap from the module count and the device pixel
   ratio, and when the sheet genuinely will not fit, say so and hand over a
   share path that works.                                                    */
function qrEncode(url) {
  if (typeof qrcode !== 'function') return null;
  for (const ecc of ['M', 'L']) {
    try {
      const q = qrcode(0, ecc);
      q.addData(url);
      q.make();
      return q;
    } catch (e) { /* over capacity at this level — try the next */ }
  }
  return null;
}

function qrTooBig() {
  toast('This sheet is too long for a QR code. The link carries all of it — send that instead.', {
    ms: 9000,
    action: {
      label: 'Copy link',
      onAction: async () => {
        const url = sheetShareUrl();
        if (!await copyText(url, 'Link copied — the whole sheet is inside it')) {
          showFallback(url, 'Your browser blocked the copy. Select the link below and copy it by hand.');
        }
      },
    },
  });
}

function showQr(url) {
  const canvas = $('qrCanvas');
  const q = qrEncode(url);
  const avail = Math.max(220, Math.min(420, (window.innerWidth || 414) - 64));
  if (!q) { qrTooBig(); return; }
  const count = q.getModuleCount();
  const total = count + QR_QUIET * 2;
  if (total * QR_MIN_CSS_PX > avail) { qrTooBig(); return; }

  const dpr = Math.max(2, Math.min(4, Math.round(window.devicePixelRatio || 1)));
  const cell = Math.max(1, Math.floor((avail * dpr) / total));
  const px = cell * total;
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = Math.round(px / dpr) + 'px';
  canvas.style.height = canvas.style.width;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
    if (q.isDark(r, c)) ctx.fillRect((c + QR_QUIET) * cell, (r + QR_QUIET) * cell, cell, cell);

  const note = $('qrNote');
  if (note) note.textContent = 'It carries the whole sheet. Nothing is uploaded.';
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}

$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
$('shareBtn').addEventListener('click', async () => {
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  const url = sheetShareUrl();
  if (!await copyText(url, 'Link copied — the whole sheet is inside it')) {
    showFallback(url, 'Your browser blocked the copy. Select the link below and copy it by hand.');
  }
});
$('qrBtn').addEventListener('click', () => {
  if (!hasContent()) { toast('Fill in at least one field first'); return; }
  showQr(sheetShareUrl());
});
$('fallbackClose').addEventListener('click', () => $('fallback').classList.add('hidden'));
