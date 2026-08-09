// Packing List — many trips, presets + custom items, localStorage, shareable URL.
import {
  PRESETS, PRESET_LABELS, MAX_LABEL, MAX_NAME, MAX_SHARED,
  mergePreset, addCustom, mergeItems, sanitizeItems, stats, groupItems,
  encodeList, decodeList, cleanLabel,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/28E00kb5Tb9t5nvcCl7EQ0c' };

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

/* The shared runtime owns the toast, because it is the only one that can carry
   an Undo button. sws-ui.js is a classic script in <head>, so it is always
   there by the time this module runs; the fallback is belt and braces. */
const UI = window.SWS || {};
const toast = (msg, opts) => (UI.toast ? UI.toast(msg, opts) : console.log(msg));
const undoToast = (msg, fn) => (UI.undo ? UI.undo(msg, fn) : toast(msg));

/* Some warnings are true every time but only worth saying once a session. */
const said = new Set();
function sayOnce(key, msg, opts) {
  if (said.has(key)) return;
  said.add(key);
  toast(msg, opts);
}

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy — your browser blocked the clipboard. Use Show QR instead.', { assertive: true }); }
}

/* ══ State ═══════════════════════════════════════════════════════════════ */
/* v1 kept one {name, items} under 'packing-list' — a second trip in the same
   month overwrote the first as the user typed the new name. Trips are now a
   list. The old key is still written as a mirror of the active trip, so a
   browser still serving the previous app.js out of its service-worker cache
   does not open to an empty list. */
const KEY_V1 = 'packing-list';
const KEY = 'packing-list.trips';

let db = { activeId: '', trips: [] };
let hidePacked = false;      // deliberately not persisted: a cold start that
                             // hides everything is its own bug report
let saveBroken = false;

const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* A stable per-item handle for focus keys. Deriving one from the label
   collided ("Wallet & ID" and "Wallet ID" both slugged to wallet-id) and
   changed the moment an item was renamed. */
const ITEM_ID = new WeakMap();
let itemSeq = 0;
function idOf(item) {
  let v = ITEM_ID.get(item);
  if (!v) { v = 'it' + (++itemSeq); ITEM_ID.set(item, v); }
  return v;
}
const newTrip = (name, items) => ({ id: uid(), name: name || '', items: items || [] });
const cur = () => db.trips.find((t) => t.id === db.activeId) || db.trips[0];

function load() {
  let dropped = 0;
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* corrupt: start clean */ }

  const trips = [];
  if (parsed && Array.isArray(parsed.trips)) {
    for (const t of parsed.trips) {
      if (!t || typeof t !== 'object') continue;
      const s = sanitizeItems(t.items);
      dropped += s.dropped;
      trips.push({
        id: typeof t.id === 'string' && t.id ? t.id : uid(),
        name: cleanLabel(typeof t.name === 'string' ? t.name : '', MAX_NAME).label,
        items: s.items,
      });
    }
  }

  let migrated = 0;
  if (!trips.length) {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(KEY_V1)); } catch (e) { /* ignore */ }
    if (old && typeof old === 'object') {
      const s = sanitizeItems(old.items);
      dropped += s.dropped;
      if (s.items.length || (typeof old.name === 'string' && old.name.trim())) {
        trips.push(newTrip(cleanLabel(typeof old.name === 'string' ? old.name : '', MAX_NAME).label, s.items));
        migrated = s.items.length;
      }
    }
  }
  if (!trips.length) trips.push(newTrip());

  db.trips = trips;
  db.activeId = trips.some((t) => t.id === (parsed && parsed.activeId)) ? parsed.activeId : trips[0].id;
  return { dropped, migrated };
}

function save() {
  const payload = JSON.stringify({ v: 2, activeId: db.activeId, trips: db.trips });
  try {
    localStorage.setItem(KEY, payload);
  } catch (e) {
    /* A save that fails used to be swallowed by an empty catch: the item was on
       screen, absent from storage, and gone after a reload. On iOS private
       browsing that is the normal case, not an exotic one. */
    if (!saveBroken) {
      saveBroken = true;
      toast('This browser refused to save (out of room, or private browsing). '
        + 'What is on screen is safe until you close the tab — use Copy link to keep it.',
      { ms: 12000, assertive: true });
    }
    return;
  }
  if (saveBroken) { saveBroken = false; toast('Saving works again — the list is stored on this device.'); }
  try {
    const c = cur();
    localStorage.setItem(KEY_V1, JSON.stringify({ name: c.name, items: c.items.map((i) => ({ label: i.label, done: i.done })) }));
  } catch (e) { /* the mirror is a convenience; the real key already succeeded */ }
  if (UI.saved) UI.saved();
}

/* ══ Focus across a redraw ═══════════════════════════════════════════════ */
/* Every tick used to leave document.activeElement === BODY, five Tab presses
   from where the user was. Each control carries a stable key and gets it back. */
function focusKey() {
  const a = document.activeElement;
  return a && a.dataset && a.dataset.fk ? a.dataset.fk : null;
}
function restoreFocus(key) {
  if (!key) return false;
  const n = document.querySelector('[data-fk="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
  if (n) { n.focus(); return true; }
  return false;
}
function redraw() {
  const k = focusKey();
  renderList();
  restoreFocus(k);
}

/* ══ Rendering ═══════════════════════════════════════════════════════════ */
function renderPresets() {
  const box = $('presets');
  box.replaceChildren();
  const have = new Set(cur().items.map((i) => i.label.toLowerCase()));
  for (const key of Object.keys(PRESETS)) {
    const list = PRESETS[key];
    const st = { size: list.length, missing: list.filter((p) => !have.has(p.label.toLowerCase())).length };
    const on = st.missing === 0;
    /* Not aria-pressed: tapping an "on" preset cannot un-press it, and a state
       the control will not change is a lie to a screen reader. The name says
       what tapping will do instead. */
    box.append(el('button', {
      class: 'chip' + (on ? ' on' : ''),
      type: 'button',
      'data-fk': 'preset:' + key,
      'aria-label': PRESET_LABELS[key] + (on
        ? ' — all ' + st.size + ' already on your list'
        : ' — add ' + st.missing + ' of ' + st.size + ' items'),
      onclick: () => addPreset(key),
    }, PRESET_LABELS[key], on ? el('span', { class: 'tick', 'aria-hidden': 'true' }, '✓') : null));
  }
}

function addPreset(key) {
  const c = cur();
  const before = c.items.slice();
  const r = mergePreset(c.items, key);
  if (!r.added) {
    toast('All ' + r.size + ' ' + PRESET_LABELS[key] + ' items are already on the list.');
    return;
  }
  c.items = r.items;
  save();
  redraw();
  const skipped = r.skipped ? ' (' + r.skipped + ' already there)' : '';
  undoToast(PRESET_LABELS[key] + ': ' + r.added + ' item' + (r.added === 1 ? '' : 's') + ' added' + skipped,
    () => { c.items = before; save(); renderList(); });
}

function updateProgress() {
  const c = cur();
  const s = stats(c.items);
  const bar = $('fillbar');
  const txt = $('fillText');
  bar.classList.toggle('hidden', s.total === 0);
  $('listTools').classList.toggle('hidden', s.total === 0);

  /* The four actions used to advertise themselves on an empty list; three then
     refused with a toast and the fourth reported success for a no-op. */
  $('shareBtn').disabled = s.total === 0;
  $('qrBtn').disabled = s.total === 0;
  $('printBtn').disabled = s.total === 0;
  $('uncheckBtn').disabled = s.done === 0;
  $('dupTripBtn').disabled = s.total === 0;

  const hideBtn = $('hideBtn');
  hideBtn.setAttribute('aria-pressed', hidePacked ? 'true' : 'false');
  hideBtn.textContent = hidePacked ? 'Show all (' + s.done + ' hidden)' : 'Hide packed (' + s.done + ')';
  hideBtn.disabled = s.done === 0 && !hidePacked;

  if (s.total === 0) {
    txt.textContent = '';
    bar.setAttribute('aria-valuemax', '1');
    bar.setAttribute('aria-valuenow', '0');
    $('fill').style.setProperty('--pct', '0%');
    stampPrintMeta();
    return;
  }
  $('fill').style.setProperty('--pct', Math.round(100 * s.done / s.total) + '%');
  bar.setAttribute('aria-valuemax', String(s.total));
  bar.setAttribute('aria-valuenow', String(s.done));
  bar.setAttribute('aria-valuetext', s.done + ' of ' + s.total + ' packed');
  txt.textContent = s.remaining === 0
    ? '🎉 All packed! ' + s.total + ' of ' + s.total + '.'
    : s.done + ' packed · ' + s.remaining + ' to go';
  stampPrintMeta();
}

function rowFor(item) {
  const id = idOf(item);
  const cb = el('input', { type: 'checkbox', 'data-fk': 'cb:' + id });
  cb.checked = !!item.done;
  const li = el('li', { class: item.done ? 'done' : '' });

  cb.addEventListener('change', () => {
    item.done = cb.checked;
    li.classList.toggle('done', item.done);
    save();
    updateProgress();               // #fillText is the polite live region
    if (hidePacked && item.done) {
      /* The row the user is standing on is about to disappear. Move to the
         next one rather than dropping focus on the floor. */
      const boxes = [...document.querySelectorAll('#list input[type=checkbox]')];
      const pos = boxes.indexOf(cb);
      renderList();
      const after = [...document.querySelectorAll('#list input[type=checkbox]')];
      (after[Math.min(Math.max(pos, 0), after.length - 1)] || $('customItem')).focus();
    }
  });

  li.append(
    el('label', {}, cb, el('span', { class: 'lbl' }, item.label)),
    el('button', {
      class: 'btn icon ghost rowbtn', type: 'button',
      'data-fk': 'ed:' + id, 'aria-label': 'Rename ' + item.label,
      onclick: () => startEdit(li, item),
    }, el('span', { 'aria-hidden': 'true' }, '✏️')),
    el('button', {
      class: 'btn icon ghost rowbtn del', type: 'button',
      'data-fk': 'rm:' + id, 'aria-label': 'Remove ' + item.label,
      onclick: () => removeItem(item),
    }, el('span', { 'aria-hidden': 'true' }, '✕')),
  );
  return li;
}

function renderList() {
  const c = cur();
  const box = $('list');
  box.replaceChildren();

  const shown = hidePacked ? c.items.filter((i) => !i.done) : c.items;
  const groups = groupItems(shown);
  const single = groups.length <= 1;

  for (const g of groups) {
    const ul = el('ul', { class: 'plain' });
    for (const item of g.items) ul.append(rowFor(item));
    const packed = g.items.filter((i) => i.done).length;
    box.append(el('section', { class: 'grp' },
      single ? null : el('h3', {}, g.cat,
        el('span', { class: 'cnt' }, packed + ' of ' + g.items.length + ' packed')),
      ul));
  }

  const s = stats(c.items);
  $('emptyHint').classList.toggle('hidden', s.total > 0);
  if (hidePacked && shown.length === 0 && s.total > 0) {
    box.append(el('p', { class: 'hint' },
      'All ' + s.total + ' items are packed and hidden. Tap “Show all” to see them.'));
  }

  $('listHead').textContent = c.name.trim() || 'Untitled trip';
  updateProgress();
  renderPresets();
  syncTripSelect();
}

/* ══ Item verbs ══════════════════════════════════════════════════════════ */
/* One 40ms double-tap on a ✕ used to delete two items: the row below slid up
   under the finger between the two clicks. Undo covers the mistake; this
   window stops the second tap of a tremor from being read as a new command. */
let lastRemoveAt = 0;

function removeItem(item) {
  const now = Date.now();
  if (now - lastRemoveAt < 450) return;   // the second tap of a double-tap
  const c = cur();
  const idx = c.items.indexOf(item);
  if (idx < 0) return;
  lastRemoveAt = now;

  const before = c.items.slice();
  const btns = [...document.querySelectorAll('#list .rowbtn.del')];
  const pos = Math.max(0, btns.findIndex((b) => b.dataset.fk === 'rm:' + idOf(item)));

  c.items = c.items.slice(0, idx).concat(c.items.slice(idx + 1));
  save();
  renderList();

  /* Land on the neighbouring row instead of on <body>. */
  const after = [...document.querySelectorAll('#list .rowbtn.del')];
  (after[Math.min(pos, after.length - 1)] || $('customItem')).focus();

  undoToast('Removed “' + item.label + '”', () => {
    cur().items = before;
    save();
    redraw();
  });
}

function startEdit(li, item) {
  const c = cur();
  const input = el('input', { type: 'text', value: item.label, maxlength: String(MAX_LABEL),
    'aria-label': 'Rename ' + item.label });
  const commit = () => {
    const cleaned = cleanLabel(input.value);
    if (!cleaned.label) { renderList(); return; }
    if (cleaned.label !== item.label
        && c.items.some((i) => i !== item && i.label.toLowerCase() === cleaned.label.toLowerCase())) {
      toast('“' + cleaned.label + '” is already on the list.');
      return;
    }
    const before = item.label;
    item.label = cleaned.label;
    save();
    renderList();
    if (cleaned.truncated) {
      toast('Item names stop at ' + MAX_LABEL + ' characters — saved as “' + cleaned.label + '”.', { ms: 7000 });
    } else if (before !== cleaned.label) {
      toast('Renamed to “' + cleaned.label + '”');
    }
  };
  const row = el('div', { class: 'editrow' }, input,
    el('button', { class: 'btn', type: 'button', onclick: commit }, 'Save'),
    el('button', { class: 'btn ghost', type: 'button', onclick: () => renderList() }, 'Cancel'));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); renderList(); }
  });
  li.replaceChildren(row);
  input.focus();
  input.select();
}

function addItem() {
  const field = $('customItem');
  const raw = field.value;
  const c = cur();
  const r = addCustom(c.items, raw);
  if (r.added) {
    c.items = r.items;
    field.value = '';
    save();
    renderList();
    if (r.truncated) {
      toast('Item names stop at ' + MAX_LABEL + ' characters, so ' + r.dropped
        + ' were dropped — saved as “' + r.label + '”.', { ms: 8000 });
    }
  } else if (r.reason === 'duplicate') {
    toast('“' + r.label + '” is already on the list.');
  } else if (raw.trim()) {
    toast('That is only spaces — give the item a name.');
  }
  field.focus();
}

/* ══ Trips ═══════════════════════════════════════════════════════════════ */
function syncTripSelect() {
  const sel = $('tripSel');
  sel.replaceChildren();
  for (const t of db.trips) {
    const s = stats(t.items);
    sel.append(el('option', { value: t.id },
      (t.name.trim() || 'Untitled trip') + ' — ' + s.done + '/' + s.total + ' packed'));
  }
  sel.value = db.activeId;
  $('delTripBtn').disabled = false;
}

function switchTrip(id) {
  if (!db.trips.some((t) => t.id === id)) return;
  db.activeId = id;
  hidePacked = false;
  save();
  $('tripName').value = cur().name;
  renderList();
  const s = stats(cur().items);
  toast('Opened “' + (cur().name.trim() || 'Untitled trip') + '” — ' + s.total + ' items, ' + s.done + ' packed.');
}

function snapshotDb() {
  return { activeId: db.activeId, trips: db.trips.map((t) => ({ id: t.id, name: t.name, items: t.items.slice() })) };
}
function restoreDb(snap) {
  db = { activeId: snap.activeId, trips: snap.trips };
  save();
  $('tripName').value = cur().name;
  renderList();
}

/* ══ Sharing ═════════════════════════════════════════════════════════════ */
function shareUrl() {
  const c = cur();
  const base = location.origin === 'null'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
  return base + '#' + encodeList(c.name, c.items);
}

/* ══ Boot ════════════════════════════════════════════════════════════════ */
function wire() {
  $('tripName').addEventListener('input', (ev) => {
    const v = ev.target.value;
    cur().name = v.slice(0, MAX_NAME);
    $('listHead').textContent = cur().name.trim() || 'Untitled trip';
    save();
    syncTripSelect();
    if (v.length >= MAX_NAME) {
      sayOnce('nameCap', 'Trip names stop at ' + MAX_NAME + ' characters.');
    }
  });

  $('addBtn').addEventListener('click', addItem);
  $('customItem').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addItem(); } });

  $('hideBtn').addEventListener('click', () => {
    hidePacked = !hidePacked;
    redraw();
  });

  $('tripSel').addEventListener('change', (ev) => switchTrip(ev.target.value));

  $('newTripBtn').addEventListener('click', () => {
    const snap = snapshotDb();
    const t = newTrip();
    db.trips.push(t);
    db.activeId = t.id;
    hidePacked = false;
    save();
    $('tripName').value = '';
    renderList();
    $('tripName').focus();
    undoToast('New trip started — your other ' + (db.trips.length - 1) + ' trip'
      + (db.trips.length === 2 ? ' is' : 's are') + ' still under Saved trips.',
    () => restoreDb(snap));
  });

  $('dupTripBtn').addEventListener('click', () => {
    const c = cur();
    if (!c.items.length) { toast('This trip has no items to duplicate yet.'); return; }
    const snap = snapshotDb();
    const t = newTrip((c.name.trim() || 'Untitled trip') + ' (copy)',
      c.items.map((i) => ({ label: i.label, cat: i.cat, done: false })));
    t.name = t.name.slice(0, MAX_NAME);
    db.trips.push(t);
    db.activeId = t.id;
    hidePacked = false;
    save();
    $('tripName').value = t.name;
    renderList();
    undoToast('Copied ' + t.items.length + ' items into “' + t.name + '”, all unpacked. '
      + 'The old trip is untouched.', () => restoreDb(snap));
  });

  $('delTripBtn').addEventListener('click', () => {
    const c = cur();
    const snap = snapshotDb();
    const label = c.name.trim() || 'Untitled trip';
    const n = c.items.length;
    db.trips = db.trips.filter((t) => t.id !== c.id);
    if (!db.trips.length) db.trips.push(newTrip());
    db.activeId = db.trips[0].id;
    hidePacked = false;
    save();
    $('tripName').value = cur().name;
    renderList();
    undoToast('Deleted “' + label + '” and its ' + n + ' item' + (n === 1 ? '' : 's') + '.',
      () => restoreDb(snap));
  });

  $('uncheckBtn').addEventListener('click', () => {
    const c = cur();
    const s = stats(c.items);
    if (s.done === 0) { toast('Nothing is ticked yet.'); return; }
    /* A snapshot, not a hand-written inverse: it cannot forget a side effect.
       The live objects are mutated in place so focus keys survive. */
    const before = c.items.map((i) => ({ label: i.label, cat: i.cat, done: i.done }));
    for (const i of c.items) i.done = false;
    save();
    redraw();
    undoToast('Unchecked ' + s.done + ' of ' + s.total + ' items.', () => {
      cur().items = before;
      save();
      redraw();
    });
  });

  $('shareBtn').addEventListener('click', () => {
    const c = cur();
    if (!c.items.length) { toast('Add some items first — there is nothing to share yet.'); return; }
    const url = shareUrl();
    if (c.items.length > MAX_SHARED) {
      toast('A link carries the first ' + MAX_SHARED + ' items; this trip has ' + c.items.length
        + ', so ' + (c.items.length - MAX_SHARED) + ' will not arrive.', { ms: 9000, assertive: true });
    }
    copyText(url, 'Link copied (' + url.length + ' characters) — their checkboxes start fresh.');
  });

  $('printBtn').addEventListener('click', () => {
    const c = cur();
    if (!c.items.length) { toast('Add some items first — there is nothing to print yet.'); return; }
    window.print();
  });

  $('qrBtn').addEventListener('click', showQr);
  $('qrCopy').addEventListener('click', () => copyText(shareUrl(), 'Link copied — paste it into any message.'));
  $('qrClose').addEventListener('click', closeQr);

  /* Ctrl-P bypasses the button entirely, so the printed sheet has to be right
     whatever route it was reached by. */
  window.addEventListener('beforeprint', stampPrintMeta);
}

function stampPrintMeta() {
  const c = cur();
  const s = stats(c.items);
  const when = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  $('printMeta').textContent = s.total === 0
    ? 'This list is empty — printed ' + when + '.'
    : s.done + ' of ' + s.total + ' packed · printed ' + when + ' · Packing List by Sky Wolf Studios';
}

/* ══ Shared links ════════════════════════════════════════════════════════ */
function clearHash() {
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// */ }
}

function sharedNotes(shared) {
  const notes = [];
  if (shared.droppedItems > 0) {
    notes.push('A link carries at most ' + MAX_SHARED + ' items, so the last '
      + shared.droppedItems + ' of the ' + (shared.items.length + shared.droppedItems)
      + ' they sent are not in it.');
  }
  if (shared.longLabels > 0) {
    notes.push(shared.longLabels + ' item name' + (shared.longLabels === 1 ? ' was' : 's were')
      + ' shortened to ' + MAX_LABEL + ' characters.');
  }
  return notes;
}

function adoptShared(shared, mode) {
  const snap = snapshotDb();
  const c = cur();
  let msg = '';
  if (mode === 'new') {
    const t = newTrip(shared.name, shared.items);
    db.trips.push(t);
    db.activeId = t.id;
    msg = 'Opened “' + shared.name + '” as a new trip — ' + shared.items.length
      + ' items. Your own trip is still under Saved trips.';
  } else if (mode === 'merge') {
    const r = mergeItems(c.items, shared.items);
    c.items = r.items;
    msg = 'Merged in ' + r.added + ' item' + (r.added === 1 ? '' : 's')
      + (r.skipped ? ' — ' + r.skipped + ' were already on your list.' : '.');
  } else {
    c.name = shared.name;
    c.items = shared.items;
    msg = 'Replaced this trip with “' + shared.name + '” — ' + shared.items.length + ' items.';
  }
  hidePacked = false;
  save();
  $('tripName').value = cur().name;
  renderList();
  clearHash();
  $('importBar').classList.add('hidden');
  $('importBar').replaceChildren();
  const notes = sharedNotes(shared);
  undoToast(msg + (notes.length ? ' ' + notes.join(' ') : '') + ' Copy link makes the same link again.',
    () => restoreDb(snap));
}

function showImportChoice(shared) {
  const c = cur();
  const bar = $('importBar');
  const notes = sharedNotes(shared);
  const panel = el('div', { class: 'warn' },
    el('p', {}, el('b', {}, 'Someone shared a packing list with you.'), ' “' + shared.name + '” — '
      + shared.items.length + ' item' + (shared.items.length === 1 ? '' : 's')
      + '. Your open trip “' + (c.name.trim() || 'Untitled trip') + '” has ' + c.items.length + '.'),
    notes.length ? el('p', {}, notes.join(' ')) : null,
    el('div', { class: 'cluster' },
      el('button', { class: 'btn primary', type: 'button', onclick: () => adoptShared(shared, 'new') },
        'Open as a new trip'),
      el('button', { class: 'btn', type: 'button', onclick: () => adoptShared(shared, 'merge') },
        'Merge into this trip'),
      el('button', { class: 'btn danger', type: 'button', onclick: () => adoptShared(shared, 'replace') },
        'Replace this trip'),
      el('button', { class: 'btn ghost', type: 'button',
        onclick: () => {
          bar.classList.add('hidden');
          bar.replaceChildren();
          clearHash();
          toast('Kept your own list. The shared one is gone unless they send the link again.');
        } }, 'Keep mine')),
  );
  bar.replaceChildren(panel);
  bar.classList.remove('hidden');
  bar.focus();
  toast('A shared list is waiting at the top of the page — choose what to do with it.',
    { ms: 8000, assertive: true });
}

function handleShared() {
  const shared = decodeList(location.hash);
  if (!shared) return;

  if (shared.error) {
    clearHash();
    const bar = $('importBar');
    bar.replaceChildren(el('div', { class: 'warn' },
      el('p', {}, el('b', {}, 'That shared link did not arrive in one piece.'),
        ' Packing-list links are long — a 26-item list is about 700 characters — and some'
        + ' messaging apps and link previewers cut them short. Ask whoever sent it to paste'
        + ' the whole link again, or to show you the QR instead.'),
      el('div', { class: 'cluster' },
        el('button', { class: 'btn', type: 'button',
          onclick: () => { bar.classList.add('hidden'); bar.replaceChildren(); } }, 'Dismiss'))));
    bar.classList.remove('hidden');
    bar.focus();
    toast('That shared link looks cut off — nothing was changed.', { ms: 8000, assertive: true });
    return;
  }

  if (!shared.items.length) {
    clearHash();
    toast('That shared link has no items in it — nothing was changed.', { ms: 6000 });
    return;
  }

  if (cur().items.length === 0 && !cur().name.trim()) {
    adoptShared(shared, 'replace');   // nothing of the user's to lose
    return;
  }
  showImportChoice(shared);
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }

  const loaded = load();
  $('tripName').value = cur().name;
  renderList();
  handleShared();

  if (loaded.dropped > 0) {
    toast(loaded.dropped + ' saved item' + (loaded.dropped === 1 ? ' was' : 's were')
      + ' unreadable and had to be skipped. Everything else is here.', { ms: 9000, assertive: true });
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

/* ══ QR share (scan instead of typing a link) ════════════════════════════ */
/* Error correction 'M' was hardcoded and the payload simply overflowed past
   ~99 preset-length items — 26 if the labels are descriptive — surfacing as
   "Could not draw the QR" with no route out. 'L' buys roughly 25% more data,
   and when even that will not fit the dialog opens and says so. */
function buildQr(url) {
  for (const ec of ['M', 'L']) {
    try {
      const qr = qrcode(0, ec);
      qr.addData(url);
      qr.make();
      return { qr, ec };
    } catch (e) { /* try the next level */ }
  }
  return null;
}

function openQr() {
  const d = $('qrDlg');
  if (d.open || d.hasAttribute('open')) return;   // a redraw must not re-open it
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
function closeQr() {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
}

function showQr() {
  const c = cur();
  if (!c.items.length) { toast('Add some items first — there is nothing to put in a QR yet.'); return; }

  const url = shareUrl();
  const canvas = $('qrCanvas');
  const note = $('qrNote');
  const built = buildQr(url);

  if (!built) {
    canvas.classList.add('hidden');
    note.className = 'warn';
    note.textContent = 'Too long for a QR — use Copy link. This trip is ' + c.items.length
      + ' items and ' + url.length + ' characters; a QR code tops out near 2,300, and it is the'
      + ' length of the names that decides, not the count. A link has no such limit.';
    openQr();
    return;
  }

  const { qr } = built;
  const count = qr.getModuleCount();
  const quiet = 4;
  const total = count + quiet * 2;

  /* The canvas was hardcoded at 300px and squeezed to 246 CSS px on a 320px
     phone — 1.49px per module. Size it from the viewport instead, fill the
     whole box the dialog can give it, and render into a backing store at the
     device's real pixel density. Module edges are snapped with Math.round so
     the squares tile exactly however the scale falls: a rounded-up cell would
     leave the code a fraction of the space it could have had, and a rounded-
     down one leaves hairline gaps a camera reads as noise. */
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const avail = Math.max(180, Math.min(420,
    Math.min(window.innerWidth * 0.92 - 44, window.innerHeight - 220)));
  const scale = avail * dpr / total;
  const px = Math.round(scale * total);

  canvas.classList.remove('hidden');
  canvas.width = px;
  canvas.height = px;
  /* Width only — the stylesheet keeps height:auto and max-width:100%, so a
     viewport too small for the computed size shrinks it without distorting. */
  canvas.style.width = (px / dpr) + 'px';

  const at = (i) => Math.round(i * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) {
    const y = at(quiet + r);
    const h = at(quiet + r + 1) - y;
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(r, col)) continue;
      const x = at(quiet + col);
      ctx.fillRect(x, y, at(quiet + col + 1) - x, h);
    }
  }

  const cssPerModule = scale / dpr;
  note.className = 'hint';
  note.textContent = cssPerModule < 2
    ? 'Dense code: ' + count + '×' + count + ' squares for ' + c.items.length
      + ' items, about ' + cssPerModule.toFixed(1) + ' screen pixels each. Hold the other phone'
      + ' close, turn the brightness up, or use Copy link if it will not read.'
    : 'Their checkboxes start fresh. ' + count + '×' + count + ' squares for ' + c.items.length + ' items.';
  openQr();
}

/* A canvas gets no cascade: it does not hear about a rotated phone or a change
   in the comfort panel (the dialog's max-width is in rem). Redraw it by hand.
   `avail` is derived from the viewport, never from the canvas, so this cannot
   feed back on itself. */
let qrRedrawTimer = null;
function redrawQrIfOpen() {
  const d = $('qrDlg');
  if (!d.open && !d.hasAttribute('open')) return;
  clearTimeout(qrRedrawTimer);
  qrRedrawTimer = setTimeout(() => { if (d.open || d.hasAttribute('open')) showQr(); }, 120);
}
window.addEventListener('resize', redrawQrIfOpen);
new MutationObserver(redrawQrIfOpen).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-text', 'data-density', 'data-theme', 'data-reading'],
});
