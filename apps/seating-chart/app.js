// Seating Chart — Engine 2, skin A. Local-first: IndexedDB + vendored pdf-lib.
// Seating is a constraint problem: declare rules, and when the guest list
// changes we show what broke. Auto-arrange is a suggestion, never the boss.
// All user data reaches the DOM via textContent — never innerHTML.
import {
  newProject, newId, parseGuestPaste, validate, autoArrange,
  occupancy, unassignedGuests, parseGuestPasteDetailed, MAX_PASTE,
} from './model.js';
import { makeEntrancePdf, makeEscortCardsPdf, makeCatererPdf, unprintableNames } from './pdf.js';
import { saveProject, getProject, allProjects, deleteProject } from './store.js';

const CONFIG = {
  // Stripe payment link for the tip jar — button stays hidden while empty.
  // Per the product doc: we only ever ASK after an export succeeds.
  tipUrl: 'https://buy.stripe.com/eVq4gA2zn4L52bj31L7EQ05',
};

/* ---------- tiny DOM kit ---------- */
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
function showDlg(d) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
function closeDlg(d) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }

/* ---------- state ---------- */
let project = null;
let tab = 'guests';
let selected = new Set();      // guest ids picked up for seating
let guestFilter = '';
let pageSize = 'letter';
let saveTimer = null;
let saveWarned = 0;

function persistSnap(snap) {
  saveProject(snap).catch(() => {
    // storage full / private mode — the user must know their work isn't landing
    if (Date.now() - saveWarned > 60000) {
      saveWarned = Date.now();
      toast('⚠ Couldn’t save to this device — storage may be full. Export a backup file now.', 8000);
    }
  });
}

function touch() {
  if (!project) return;
  project.updatedAt = Date.now();
  // Snapshot NOW: navigation may null `project` before the debounce fires.
  const snap = JSON.parse(JSON.stringify(project));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistSnap(snap), 400);
}
window.addEventListener('pagehide', () => {
  if (!project) return;
  clearTimeout(saveTimer);
  persistSnap(JSON.parse(JSON.stringify(project)));
});

function route() {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  return m ? { view: 'editor', id: m[1] } : { view: 'home' };
}
window.addEventListener('hashchange', render);

/* ---------- home ---------- */
async function renderHome() {
  project = null;
  const v = $('view');
  v.replaceChildren();
  v.append(el('div', { class: 'hero' },
    el('h2', {}, 'Seating charts without the 2am panic'),
    el('p', {}, 'Declare the rules — who sits together, who absolutely doesn’t — and when the guest list changes, we show you exactly what broke. Then print PDFs that look like you hired someone. ',
      el('strong', {}, 'Free, no watermark, and nothing ever leaves your device.')),
    el('button', { class: 'btn primary', type: 'button', onclick: createProject }, 'New event')));

  const sec = el('section', { class: 'card' }, el('h2', {}, 'Your events'));
  const list = el('ul', { class: 'plain' });
  sec.append(list);
  let rows = [];
  try { rows = (await allProjects()) || []; } catch (e) {}
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (rows.length === 0) sec.append(el('p', { class: 'hint', text: 'Saved on this device only — export a backup file before switching computers.' }));
  for (const p of rows) {
    list.append(el('li', {},
      el('div', { class: 'grow' },
        el('div', { text: p.name }),
        el('div', { class: 'sub', text: (p.guests?.length || 0) + ' guests · ' + (p.tables?.length || 0) + ' tables' })),
      el('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/p/' + p.id; } }, 'Open'),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete event',
        onclick: async () => {
          /* Undo, not confirm. A confirm asks before you can see what you are
             about to lose, and it is dismissed on reflex; this deletes and
             offers the whole event back, restoring the exact record. */
          const snapshot = JSON.parse(JSON.stringify(p));
          try { await deleteProject(p.id); } catch (e) {}
          await renderHome();
          if (window.SWS) {
            SWS.undo('Deleted “' + p.name + '”', async () => {
              try { await saveProject(snapshot); } catch (e) {}
              renderHome();
            });
          }
        } }, '✕')));
  }
  v.append(sec);

  const file = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden',
    onchange: (ev) => { if (ev.target.files[0]) importFile(ev.target.files[0]); ev.target.value = ''; } });
  v.append(el('section', { class: 'card' },
    el('h2', {}, 'Backup'),
    el('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import an event file'),
    file,
    el('p', { class: 'hint', text: 'Local-only means you own the backup problem — every event can be exported as one .json file from its Print tab.' })));
}

function createProject() {
  const name = prompt('What’s the event?', '');
  if (name === null) return;
  project = newProject(name.trim() || 'Untitled event');
  touch();
  location.hash = '#/p/' + project.id;
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.guests)) throw new Error('bad');
      obj.id = obj.id || newId();
      obj.tables = Array.isArray(obj.tables) ? obj.tables : [];
      obj.rules = Array.isArray(obj.rules) ? obj.rules : [];
      obj.assignments = (obj.assignments && typeof obj.assignments === 'object') ? obj.assignments : {};
      obj.name = typeof obj.name === 'string' ? obj.name : 'Imported event';
      project = obj;
      touch();
      location.hash = '#/p/' + obj.id;
      toast('Imported “' + (obj.name || 'event') + '”');
    } catch (e) { toast('That file doesn’t look like a seating-chart export.'); }
  };
  reader.readAsText(file);
}

/* ---------- editor ---------- */
async function renderEditor(id) {
  if (!project || project.id !== id) {
    let loaded = null;
    try { loaded = await getProject(id); } catch (e) {}
    if (!loaded) {
      $('view').replaceChildren(el('section', { class: 'card' },
        el('p', { class: 'sub', text: 'That event isn’t on this device.' }),
        el('p', {}, el('a', { href: '#/' }, 'Go home'))));
      return;
    }
    project = loaded;
    selected = new Set();
  }
  drawEditor();
}

/**
 * Redraw the editor, putting focus and the text caret back where they were.
 *
 * drawEditor() replaces the entire view on every keystroke, click and tab
 * change, which destroys the focused element. The browser then falls back to
 * <body>, so a keyboard user lost their place on every single interaction, and
 * typing in the guest search jumped the caret to the end of the string after
 * each character.
 *
 * Elements that need to survive a redraw carry a stable `data-fk`, and this
 * matches them up again afterwards. It is keyed on identity rather than
 * position so a redraw that adds a row above the focused field still works.
 */
function drawEditor() {
  const v = $('view');

  const active = document.activeElement;
  const keep = active && v.contains(active) && active.dataset && active.dataset.fk
    ? {
      fk: active.dataset.fk,
      start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    }
    : null;

  v.replaceChildren();

  // name + tabs
  const nameIn = el('input', { type: 'text', value: project.name, maxlength: '80',
    'aria-label': 'Event name', 'data-fk': 'eventName',
    style: 'font-weight:700; font-size:1.05rem',
    oninput: (ev) => { project.name = ev.target.value.slice(0, 80); touch(); } });
  v.append(el('section', { class: 'card' },
    el('div', { class: 'row' },
      el('button', { class: 'btn small', type: 'button', style: 'flex:0 0 auto', onclick: () => { location.hash = '#/'; } }, '‹ Events'),
      nameIn)));

  const tabs = el('nav', { class: 'tabs' },
    ...[['guests', 'Guests'], ['tables', 'Tables'], ['seat', 'Seat people'], ['rules', 'Rules'], ['print', 'Print & export']]
      .map(([k, label]) => el('button', {
        type: 'button', class: k === tab ? 'active' : '',
        'aria-current': k === tab ? 'page' : null,
        'data-fk': 'tab:' + k,
        onclick: () => { tab = k; drawEditor(); },
      }, label)));
  v.append(tabs);

  /* Unseated count, visible from every tab. It was only knowable by counting
     the pool by eye on the Seat tab, so the one number that says whether the
     job is finished was invisible from four of the five tabs. */
  const left = unassignedGuests(project).length;
  v.append(el('p', { class: 'hint', id: 'seatedCount', role: 'status', style: 'margin:0 0 12px' },
    left === 0
      ? 'Everyone who has not declined has a seat.'
      : [el('b', { class: 'em' }, String(left)),
        (left === 1 ? ' guest still needs' : ' guests still need') + ' a seat.']));

  if (tab === 'guests') v.append(renderGuestsTab());
  else if (tab === 'tables') v.append(renderTablesTab());
  else if (tab === 'seat') v.append(...renderSeatTab());
  else if (tab === 'rules') v.append(renderRulesTab());
  else v.append(renderPrintTab());

  if (keep) {
    const again = v.querySelector('[data-fk="' + CSS.escape(keep.fk) + '"]');
    if (again) {
      again.focus({ preventScroll: true });
      if (keep.start !== null && typeof again.setSelectionRange === 'function') {
        try { again.setSelectionRange(keep.start, keep.end); } catch (e) { /* not a text input */ }
      }
    }
  }
}

/* ----- guests tab ----- */
function renderGuestsTab() {
  const frag = document.createDocumentFragment();
  const yes = project.guests.filter(g => g.rsvp !== 'no').length;
  const add = el('section', { class: 'card' }, el('h2', {}, 'Add guests'));
  const nameIn = el('input', { type: 'text', placeholder: 'Guest name', maxlength: '80',
    onkeydown: (ev) => { if (ev.key === 'Enter') addBtn.click(); } });
  const partyIn = el('input', { type: 'text', placeholder: 'Party (optional)', maxlength: '60' });
  const addBtn = el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', onclick: () => {
    const name = nameIn.value.trim();
    if (!name) { toast('Type a name first'); return; }
    project.guests.push({ id: newId(), name: name.slice(0, 80), party: partyIn.value.trim().slice(0, 60), meal: '', tags: [], rsvp: 'unknown', notes: '' });
    nameIn.value = '';
    touch(); drawEditor();
  } }, 'Add');
  add.append(el('div', { class: 'row' }, nameIn, partyIn, addBtn));
  const ta = el('textarea', { placeholder: 'Or paste your whole list — one guest per line:\nAnn Alvarez, Alvarez family, Beef\nBen Alvarez, Alvarez family, Fish, nut allergy\nCara Chen' });
  add.append(el('details', { style: 'margin-top:10px' },
    el('summary', { class: 'sub', style: 'cursor:pointer' }, 'Paste a list or spreadsheet (nobody retypes 140 names)'),
    ta,
    el('div', { style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: () => {
        const { rows, dropped } = parseGuestPasteDetailed(ta.value);
        if (rows.length === 0) { toast('Paste one guest per line: Name, party, meal, flags'); return; }

        // Duplicates are usually a double-paste, not two people with one name —
        // but sometimes they are two people with one name, so warn, never block.
        const existing = new Set(project.guests.map(g => g.name.trim().toLowerCase()));
        const dupes = rows.filter(r => existing.has(r.name.trim().toLowerCase())).length;

        project.guests.push(...rows);
        ta.value = '';
        touch(); drawEditor();

        /* The cap used to `break` out of the loop and report success for the
           survivors: 1,200 rows became 1,000 guests and the toast said
           "1000 guests added". Losing 200 people quietly is the exact failure
           this app's whole positioning is against. */
        if (dropped > 0) {
          toast(`${rows.length} added — but ${dropped} did not fit. This app holds ${MAX_PASTE} guests per event.`, 7000);
        } else if (dupes > 0) {
          toast(`${rows.length} guests added · ${dupes} ${dupes === 1 ? 'name was' : 'names were'} already on the list`, 5000);
        } else {
          toast(rows.length + ' guests added');
        }
      } }, 'Add them all'))));
  frag.append(add);

  const listCard = el('section', { class: 'card' },
    el('h2', {}, project.guests.length + ' guests · ' + yes + ' expected'));
  /* No ad-hoc focus restore here any more. The old one handed focus back but
     always jammed the caret to the end of the string, so editing a typo in the
     middle of a search term was impossible — every keystroke teleported the
     cursor. drawEditor() now restores focus AND the selection range, for this
     field and every other one carrying a data-fk. */
  const search = el('input', { type: 'search', id: 'guestSearch', 'data-fk': 'guestSearch',
    'aria-label': 'Find a guest', placeholder: 'Find a guest…', value: guestFilter,
    oninput: (ev) => { guestFilter = ev.target.value; drawEditor(); } });
  listCard.append(search);
  const list = el('ul', { class: 'plain' });
  const q = guestFilter.trim().toLowerCase();
  for (const g of project.guests.filter(g => !q || g.name.toLowerCase().includes(q) || (g.party || '').toLowerCase().includes(q))) {
    list.append(el('li', {},
      el('div', { class: 'grow' },
        el('div', {}, g.name,
          g.rsvp === 'no' ? el('span', { class: 'sub', text: '  · declined' }) : null,
          g.rsvp === 'unknown' ? el('span', { class: 'sub', text: '  · no reply' }) : null),
        el('div', { class: 'sub', text: [g.party, g.meal, (g.tags || []).join(', ')].filter(Boolean).join(' · ') })),
      el('button', { class: 'btn small', type: 'button', onclick: () => openGuestDlg(g) }, '✎')));
  }
  if (project.guests.length === 0) listCard.append(el('p', { class: 'hint', text: 'The RSVP chaos gets manageable once it’s all in one list.' }));
  listCard.append(list);
  frag.append(listCard);
  return frag;
}

let guestEditing = null;
function openGuestDlg(g) {
  guestEditing = g;
  $('gName').value = g.name;
  $('gParty').value = g.party || '';
  $('gMeal').value = g.meal || '';
  $('gTags').value = (g.tags || []).join('; ');
  $('gRsvp').value = g.rsvp || 'unknown';
  showDlg($('guestDlg'));
}

/* ----- tables tab ----- */
function renderTablesTab() {
  const frag = document.createDocumentFragment();
  const occ = occupancy(project);

  const add = el('section', { class: 'card' }, el('h2', {}, 'Add a table'));
  const labelIn = el('input', { type: 'text', placeholder: 'Table ' + (project.tables.length + 1), maxlength: '40' });
  const shapeIn = el('select', {},
    el('option', { value: 'round', text: 'Round' }),
    el('option', { value: 'rect', text: 'Rectangle' }),
    el('option', { value: 'head', text: 'Head table' }));
  const seatsIn = el('input', { type: 'number', value: '8', min: '1', max: '30', 'aria-label': 'Seats' });
  add.append(el('div', { class: 'row' }, labelIn, shapeIn, seatsIn,
    el('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', onclick: () => {
      const label = labelIn.value.trim() || 'Table ' + (project.tables.length + 1);
      const seats = Math.min(Math.max(parseInt(seatsIn.value, 10) || 8, 1), 30);
      /* Seeded inside the band a table can actually be dragged to (0.07–0.93).
         The old grid was y = 0.15 + row * 0.28, which passes 1.0 at the 13th
         table — so at a normal 18-table wedding six were clipped by the floor's
         overflow:hidden and two were entirely invisible, and at 50 tables 34
         could not be seen at all. Wrapping every four rows overlaps instead,
         which is visible and can be dragged apart. */
      const i = project.tables.length;
      project.tables.push({ id: newId(), label: label.slice(0, 40), shape: shapeIn.value, seats,
        x: 0.14 + (i % 4) * 0.24, y: 0.14 + (Math.floor(i / 4) % 4) * 0.24 });
      labelIn.value = '';
      touch(); drawEditor();
    } }, 'Add')));
  add.append(el('p', { class: 'hint', text: 'Then drag tables around the floor below to match the room.' }));
  frag.append(add);

  // floor plan
  const floorCard = el('section', { class: 'card' }, el('h2', {}, 'Floor plan'));
  const floor = el('div', { class: 'floor' });
  /* Height grows with the table count. A fixed 420px box is fine for eight
     tables and unreadable for thirty — the positions are fractions of this
     box, so giving it more room spreads them out rather than stacking them. */
  const rows = Math.max(1, Math.ceil(project.tables.length / 4));
  floor.style.height = Math.min(880, Math.max(420, rows * 130 + 90)) + 'px';
  for (const t of project.tables) floor.append(renderFloorTable(t, floor, occ));
  floorCard.append(floor, el('p', { class: 'hint', text: 'Drag to arrange · tap a table to edit it. The layout is for you — the printed chart lists tables in the order added.' }));
  frag.append(floorCard);
  return frag;
}

function renderFloorTable(t, floor, occ) {
  const n = (occ[t.id] || []).filter(g => g.rsvp !== 'no').length;
  const node = el('div', { class: 'tbl ' + (t.shape || 'round') },
    el('span', {}, t.label, el('span', { class: 'n', text: n + '/' + t.seats })));
  const place = () => {
    node.style.left = 'calc(' + (t.x * 100) + '% - ' + (node.offsetWidth / 2 || 38) + 'px)';
    node.style.top = 'calc(' + (t.y * 100) + '% - ' + (node.offsetHeight / 2 || 38) + 'px)';
  };
  requestAnimationFrame(place);
  let moved = false, pid = null;
  node.addEventListener('pointerdown', (ev) => {
    pid = ev.pointerId;
    moved = false;
    node.setPointerCapture(pid);
    ev.preventDefault();
  });
  node.addEventListener('pointermove', (ev) => {
    if (pid === null) return;
    const r = floor.getBoundingClientRect();
    const nx = Math.min(0.95, Math.max(0.05, (ev.clientX - r.left) / r.width));
    const ny = Math.min(0.93, Math.max(0.07, (ev.clientY - r.top) / r.height));
    if (Math.abs(nx - t.x) > 0.004 || Math.abs(ny - t.y) > 0.004) moved = true;
    t.x = nx; t.y = ny;
    place();
  });
  node.addEventListener('pointerup', () => {
    if (pid !== null) { try { node.releasePointerCapture(pid); } catch (e) {} }
    pid = null;
    if (moved) touch();
    else openTableDlg(t);
  });
  return node;
}

let tableEditing = null;
function openTableDlg(t) {
  tableEditing = t;
  $('tLabel').value = t.label;
  $('tShape').value = t.shape || 'round';
  $('tSeats').value = String(t.seats);
  showDlg($('tableDlg'));
}

/* ----- seat tab ----- */
function renderSeatTab() {
  const out = [];
  const violations = validate(project);
  if (violations.length) {
    const box = el('div', { class: 'violations' }, el('h3', {}, violations.length + ' to fix'));
    for (const v of violations) box.append(el('div', { text: '• ' + v.message }));
    out.push(box);
  } else if (project.guests.length && Object.keys(project.assignments).length) {
    out.push(el('div', { class: 'allclear', text: '✓ No broken rules. Everyone fits.' }));
  }

  const un = unassignedGuests(project);
  const pool = el('section', { class: 'card' },
    el('h2', {}, un.length ? 'Not seated yet (' + un.length + ') — tap to pick up, then tap a table' : 'Everyone is seated'));
  const byParty = Object.create(null);
  for (const g of un) (byParty[g.party || ''] = byParty[g.party || ''] || []).push(g);
  const chips = el('div', { class: 'chips' });
  for (const party of Object.keys(byParty).sort()) {
    if (party) {
      const ids = byParty[party].map(g => g.id);
      const allSel = ids.every(id => selected.has(id));
      chips.append(el('div', { class: 'partyhead', text: party }));
      chips.append(el('button', { class: 'chip' + (allSel ? ' sel' : ''), type: 'button',
        onclick: () => {
          if (allSel) ids.forEach(id => selected.delete(id));
          else ids.forEach(id => selected.add(id));
          drawEditor();
        } }, 'whole party (' + ids.length + ')'));
    }
    for (const g of byParty[party]) {
      const on = selected.has(g.id);
      chips.append(el('button', { class: 'chip' + (on ? ' sel' : ''), type: 'button',
        onclick: () => { on ? selected.delete(g.id) : selected.add(g.id); drawEditor(); } }, g.name));
    }
  }
  pool.append(chips);
  if (un.length === 0 && project.guests.length === 0)
    pool.append(el('p', { class: 'hint', text: 'Add guests first — then seating them takes minutes.' }));
  pool.append(el('div', { class: 'row', style: 'margin-top:10px' },
    el('button', { class: 'btn', type: 'button', onclick: () => {
      /* Hand-placed seating is hours of work. This used to be guarded by a
         confirm(), which asks before you know what you are losing; undo lets
         you see the result and change your mind. */
      const before = { ...project.assignments };
      project.assignments = autoArrange(project);
      selected = new Set();
      touch(); drawEditor();

      const left = unassignedGuests(project).length;
      const msg = left
        ? `Seating suggested — ${left} could not be placed`
        : 'Seating suggested — rearrange anything you like';

      if (window.SWS && Object.keys(before).length) {
        SWS.undo(msg, () => { project.assignments = before; touch(); drawEditor(); },
          { label: 'Put mine back' });
      } else {
        toast(msg);
      }
    } }, 'Suggest an arrangement'),
    el('button', { class: 'btn', type: 'button', onclick: () => {
      const before = { ...project.assignments };
      if (!Object.keys(before).length) { toast('Nobody is seated yet'); return; }
      project.assignments = {};
      touch(); drawEditor();
      if (window.SWS) {
        SWS.undo('Everyone unseated', () => { project.assignments = before; touch(); drawEditor(); });
      }
    } }, 'Clear all seats')));
  out.push(pool);

  const occ = occupancy(project);
  const tablesCard = el('section', { class: 'card' }, el('h2', {}, 'Tables'));
  if (project.tables.length === 0)
    tablesCard.append(el('p', { class: 'hint', text: 'Add tables in the Tables tab first.' }));
  for (const t of project.tables) {
    const guests = (occ[t.id] || []).filter(g => g.rsvp !== 'no');
    const over = guests.length > t.seats;
    const seatHere = () => {
      const moved = [...selected];
      const previous = moved.map((id) => [id, project.assignments[id]]);
      for (const id of moved) project.assignments[id] = t.id;
      selected = new Set();
      touch(); drawEditor();
      if (window.SWS) {
        SWS.undo(`${moved.length} seated at ${t.label}`, () => {
          for (const [id, before] of previous) {
            if (before === undefined) delete project.assignments[id];
            else project.assignments[id] = before;
          }
          selected = new Set(moved);
          touch(); drawEditor();
        });
      }
    };

    const card = el('div', { class: 'tablecard' + (selected.size ? ' droptarget' : '') },
      el('div', { class: 'thead' },
        el('span', { class: 'tname', text: t.label }),
        el('span', { class: 'tcount' + (over ? ' over' : ''), text: guests.length + ' / ' + t.seats })));

    /* The core verb — "put these people at that table" — was a click listener
       on an unfocusable <div>, so a keyboard user could select guests and then
       had nowhere to put them. A real button says what it does, is reachable
       by Tab, and does not need a nested-interactive workaround the way
       role="button" on a card full of chips would. */
    if (selected.size) {
      card.querySelector('.thead').append(el('button', {
        class: 'btn small primary', type: 'button',
        'data-fk': 'seatAt:' + t.id,
        'aria-label': `Seat ${selected.size} selected ${selected.size === 1 ? 'guest' : 'guests'} at ${t.label}`,
        onclick: seatHere,
      }, `Seat ${selected.size} here`));
    }

    const gchips = el('div', { class: 'chips' });
    for (const g of guests) {
      gchips.append(el('button', {
        class: 'chip', type: 'button',
        'data-fk': 'unseat:' + g.id,
        'aria-label': `Unseat ${g.name} from ${t.label}`,
        onclick: () => {
          const from = project.assignments[g.id];
          delete project.assignments[g.id];
          touch(); drawEditor();
          // The most destructive action in the app had no confirm and no undo:
          // one mis-tap silently undid a hand-placed seat.
          if (window.SWS) {
            SWS.undo(`${g.name} unseated`, () => {
              project.assignments[g.id] = from;
              touch(); drawEditor();
            });
          }
        },
      }, g.name, el('span', { class: 'x', 'aria-hidden': 'true' }, '✕')));
    }
    card.append(gchips);

    if (selected.size) {
      // Mouse users keep the whole-card target; it is faster than aiming.
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('.chip') || ev.target.closest('button')) return;
        seatHere();
      });
      card.style.cursor = 'pointer';
    }
    tablesCard.append(card);
  }
  out.push(tablesCard);
  return out;
}

/* ----- rules tab ----- */
function renderRulesTab() {
  const frag = document.createDocumentFragment();
  const nameOf = Object.create(null);
  for (const g of project.guests) nameOf[g.id] = g.name;
  const tableOf = Object.create(null);
  for (const t of project.tables) tableOf[t.id] = t.label;

  const card = el('section', { class: 'card' }, el('h2', {}, 'Rules — declared once, checked forever'));
  const list = el('ul', { class: 'plain' });
  const words = { together: 'Keep together', apart: 'Keep apart', mustTable: 'Must be at' };
  for (const r of project.rules) {
    const names = r.guestIds.map(id => nameOf[id]).filter(Boolean).join(', ');
    const text = words[r.type] + ': ' + names + (r.type === 'mustTable' ? ' → ' + (tableOf[r.tableId] || '?') : '');
    list.append(el('li', {},
      el('div', { class: 'grow', text: text }),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete rule',
        onclick: () => { project.rules = project.rules.filter(x => x.id !== r.id); touch(); drawEditor(); } }, '✕')));
  }
  if (project.rules.length === 0)
    card.append(el('p', { class: 'hint', text: '“Grandma near the front.” “The exes at different tables.” Write them down once — every future change gets checked against them automatically.' }));
  card.append(list,
    el('div', { style: 'margin-top:10px' },
      el('button', { class: 'btn primary', type: 'button', onclick: openRuleDlg }, 'Add a rule')));
  frag.append(card);
  return frag;
}

let ruleGuestSel = new Set();
function openRuleDlg() {
  if (project.guests.length < 1) { toast('Add guests first'); return; }
  ruleGuestSel = new Set();
  $('rType').value = 'together';
  const box = $('rGuests');
  box.replaceChildren();
  for (const g of project.guests) {
    box.append(el('button', { class: 'chip', type: 'button',
      onclick: (ev) => {
        if (ruleGuestSel.has(g.id)) { ruleGuestSel.delete(g.id); ev.target.classList.remove('sel'); }
        else { ruleGuestSel.add(g.id); ev.target.classList.add('sel'); }
      } }, g.name));
  }
  const tsel = $('rTable');
  tsel.replaceChildren();
  for (const t of project.tables) tsel.append(el('option', { value: t.id, text: t.label }));
  $('rTableWrap').classList.toggle('hidden', $('rType').value !== 'mustTable');
  showDlg($('ruleDlg'));
}

/* ----- print tab ----- */
function renderPrintTab() {
  const frag = document.createDocumentFragment();
  const card = el('section', { class: 'card' }, el('h2', {}, 'Print-ready PDFs — free, no watermark'));

  const sizeSel = el('select', { style: 'flex:0 0 110px', 'aria-label': 'Page size',
    onchange: (ev) => { pageSize = ev.target.value; } },
    el('option', { value: 'letter', text: 'US Letter' }),
    el('option', { value: 'a4', text: 'A4' }));
  sizeSel.value = pageSize;
  card.append(el('div', { class: 'row', style: 'margin-bottom:6px' },
    el('span', { class: 'sub', style: 'align-self:center' }, 'Page size'), sizeSel));

  const exports = [
    ['Entrance display', 'Big and pretty, by table — frame it or pin it at the door.', makeEntrancePdf, 'entrance'],
    ['Escort cards', 'Alphabetical by last name, ten per page, dashed cut lines.', makeEscortCardsPdf, 'escort-cards'],
    ['Caterer’s sheet', 'Table by table with meal counts, dietary flags, and totals — the one venues ask for a week out.', makeCatererPdf, 'caterer-sheet'],
  ];
  for (const [title, desc, fn, slug] of exports) {
    card.append(el('div', { class: 'exportcard' },
      el('div', { class: 'grow' }, el('b', {}, title), el('span', {}, desc)),
      el('button', { class: 'btn primary small', type: 'button', onclick: async (ev) => {
        const btn = ev.target;
        btn.disabled = true; btn.textContent = '…';
        try {
          const bytes = await fn(window.PDFLib, project, pageSize);
          downloadBytes(bytes, slugify(project.name) + '-' + slug + '.pdf');
          afterExportAsk();
        } catch (e) { toast('PDF failed: ' + (e.message || 'unknown error'), 5000); }
        btn.disabled = false; btn.textContent = 'PDF';
      } }, 'PDF')));
  }
  /* Say it BEFORE the export, not after the reception.
     PDF standard-14 fonts are WinAnsi-only. Accented Latin now folds to a
     readable letter, but CJK, Cyrillic, Arabic, Hebrew, Greek and Thai cannot
     be drawn at all, and the guest whose escort card says "?? ??" is the one
     person guaranteed to notice. */
  const cannot = unprintableNames(project);
  if (cannot.length) {
    const names = cannot.slice(0, 6).map(g => g.name).join(', ');
    card.append(el('div', { class: 'warn', style: 'margin-bottom:12px' },
      el('b', {}, cannot.length === 1
        ? 'One name cannot be printed in these PDFs'
        : `${cannot.length} names cannot be printed in these PDFs`),
      el('div', { style: 'margin-top:4px' },
        names + (cannot.length > 6 ? ` and ${cannot.length - 6} more` : '') +
        ' — the built-in PDF fonts cover Latin script only, so these come out as question marks. ' +
        'Write those cards by hand, or add a Latin spelling in the guest’s name field.')));
  }

  card.append(el('p', { class: 'hint', text: 'Print one physical page before the big day — paper always finds something screens miss.' }));
  frag.append(card);

  const backup = el('section', { class: 'card' }, el('h2', {}, 'Backup'));
  backup.append(el('button', { class: 'btn', type: 'button', onclick: () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: slugify(project.name) + '.seating.json' });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Exported — email it to yourself; this device is the only copy otherwise');
  } }, 'Export this event as a file'));
  frag.append(backup);
  return frag;
}

function slugify(s) {
  return String(s || 'event').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'event';
}
function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function afterExportAsk() {
  // The doc's rule: ask after the export succeeds — never before, never mid-flow.
  if (!CONFIG.tipUrl) { toast('Exported ✓'); return; }
  const t = $('toast');
  t.replaceChildren('Exported ✓  ',
    el('a', { href: CONFIG.tipUrl, target: '_blank', rel: 'noopener',
      style: 'color:inherit; text-decoration:underline; pointer-events:auto' }, 'Tip jar ♥'));
  t.style.pointerEvents = 'auto';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); t.style.pointerEvents = ''; }, 6000);
}

/* ---------- dialogs ---------- */
function wire() {
  $('gSave').addEventListener('click', () => {
    const g = guestEditing;
    if (g) {
      g.name = $('gName').value.trim().slice(0, 80) || g.name;
      g.party = $('gParty').value.trim().slice(0, 60);
      g.meal = $('gMeal').value.trim().slice(0, 40);
      g.tags = $('gTags').value.split(/[;]+/).map(t => t.trim()).filter(Boolean).slice(0, 8);
      g.rsvp = $('gRsvp').value;
      touch(); drawEditor();
    }
    closeDlg($('guestDlg'));
  });
  $('gCancel').addEventListener('click', () => closeDlg($('guestDlg')));
  $('gDelete').addEventListener('click', () => {
    /* Removing a guest also strips them out of every rule and can delete rules
       that fall below their minimum — far more than the confirm() described.
       Undo restores all of it, because a snapshot cannot forget a side effect
       the way a hand-written inverse can. */
    const name = guestEditing.name;
    const before = {
      guests: project.guests.slice(),
      assignments: { ...project.assignments },
      rules: JSON.parse(JSON.stringify(project.rules)),
    };

    project.guests = project.guests.filter(x => x.id !== guestEditing.id);
    delete project.assignments[guestEditing.id];
    for (const r of project.rules) r.guestIds = r.guestIds.filter(id => id !== guestEditing.id);
    project.rules = project.rules.filter(r => r.guestIds.length > (r.type === 'mustTable' ? 0 : 1));
    touch(); drawEditor();
    closeDlg($('guestDlg'));

    if (window.SWS) {
      SWS.undo(`${name} removed`, () => {
        project.guests = before.guests;
        project.assignments = before.assignments;
        project.rules = before.rules;
        touch(); drawEditor();
      });
    }
  });

  $('tSave').addEventListener('click', () => {
    const t = tableEditing;
    if (t) {
      t.label = $('tLabel').value.trim().slice(0, 40) || t.label;
      t.shape = $('tShape').value;
      t.seats = Math.min(Math.max(parseInt($('tSeats').value, 10) || t.seats, 1), 30);
      touch(); drawEditor();
    }
    closeDlg($('tableDlg'));
  });
  $('tCancel').addEventListener('click', () => closeDlg($('tableDlg')));
  $('tDelete').addEventListener('click', () => {
    const label = tableEditing.label;
    const n = Object.values(project.assignments).filter(tid => tid === tableEditing.id).length;
    const before = {
      tables: project.tables.slice(),
      assignments: { ...project.assignments },
      rules: JSON.parse(JSON.stringify(project.rules)),
    };

    project.tables = project.tables.filter(x => x.id !== tableEditing.id);
    for (const gid of Object.keys(project.assignments))
      if (project.assignments[gid] === tableEditing.id) delete project.assignments[gid];
    project.rules = project.rules.filter(r => !(r.type === 'mustTable' && r.tableId === tableEditing.id));
    touch(); drawEditor();
    closeDlg($('tableDlg'));

    const msg = n
      ? `${label} deleted — ${n} ${n === 1 ? 'guest is' : 'guests are'} back in the pool`
      : `${label} deleted`;
    if (window.SWS) {
      SWS.undo(msg, () => {
        project.tables = before.tables;
        project.assignments = before.assignments;
        project.rules = before.rules;
        touch(); drawEditor();
      });
    } else {
      toast(msg);
    }
  });

  $('rType').addEventListener('change', (ev) => {
    $('rTableWrap').classList.toggle('hidden', ev.target.value !== 'mustTable');
  });
  $('rSave').addEventListener('click', () => {
    const type = $('rType').value;
    const ids = [...ruleGuestSel];
    if (type === 'mustTable') {
      if (ids.length < 1 || !$('rTable').value) { toast('Pick at least one guest and a table'); return; }
      project.rules.push({ id: newId(), type, guestIds: ids, tableId: $('rTable').value });
    } else {
      if (ids.length < 2) { toast('Pick at least two guests'); return; }
      project.rules.push({ id: newId(), type, guestIds: ids });
    }
    touch(); drawEditor();
    closeDlg($('ruleDlg'));
  });
  $('rCancel').addEventListener('click', () => closeDlg($('ruleDlg')));
}

/* ---------- boot ---------- */
function render() {
  const r = route();
  if (r.view === 'editor') renderEditor(r.id);
  else renderHome();
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
