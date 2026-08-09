// PDF Tools — merge, reorder, rotate, delete, split. All in-browser.
import {
  buildOutput, buildSplit, planOutput, splitGroups, splitNames,
  loadPdf, sourceAngles, finalAngle, formatBytes, zipStore, isHuman, SPLIT_MODES,
} from './core.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/6oU9AU4HvcdxaHPcCl7EQ0h' };

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

/* Every message the user reads goes through the shared runtime, so the Undo
   affordance and the "pointer is inside, stop the clock" behaviour come for
   free. Local toast() implementations were the reason undo never shipped. */
function say(msg, opts) { window.SWS.toast(msg, opts); }
function sayUndo(msg, fn) { window.SWS.undo(msg, fn, { ms: 9000 }); }

function lessMotion() {
  if (window.SWS && typeof window.SWS.prefersLessMotion === 'function') return window.SWS.prefersLessMotion();
  const m = document.documentElement.getAttribute('data-motion');
  if (m === 'less') return true;
  if (m === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function download(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/pdf' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── State ─────────────────────────────────────────────────────────────── */

let docs = [];     // { id, name, pdf, size, pages, angles: number[] }
let order = [];    // { doc: index into docs, page, rotate }
let issues = [];   // { kind:'bad'|'note', name, reason } — survives until dismissed
let nextDocId = 1;
let nameTouched = false;
let busy = false;
let cancelRequested = false;

const snapshot = () => ({
  docs: docs.slice(),
  order: order.map(o => ({ ...o })),
  issues: issues.slice(),
  name: $('outName').value,
});
function restore(s) {
  docs = s.docs.slice();
  order = s.order.map(o => ({ ...o }));
  issues = s.issues.slice();
  $('outName').value = s.name;
  renderAll();
}

/* ── Names and sizes ───────────────────────────────────────────────────── */

const stripExt = (n) => String(n || '').replace(/\.pdf$/i, '');
const safeName = (n) => (String(n || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pages');

function defaultName() {
  if (!docs.length) return 'pages';
  const base = safeName(stripExt(docs[0].name));
  return docs.length > 1 ? base + '-merged' : base + '-edited';
}
function outName() {
  const typed = safeName($('outName').value);
  return (typed || defaultName()) + '.pdf';
}
function zipName() {
  return safeName(stripExt($('outName').value) || defaultName()) + '-split.zip';
}

/* An estimate, labelled as one. Merging three 66 MB files used to produce a
   197.8 MB download with nothing said about it beforehand. */
function estimateBytes() {
  const used = new Map();
  for (const it of order) used.set(it.doc, (used.get(it.doc) || 0) + 1);
  let sum = 0;
  for (const [i, n] of used) {
    const d = docs[i];
    if (!d) continue;
    sum += d.size * Math.min(1, n / Math.max(1, d.pages));
  }
  return Math.round(sum);
}

function shortMiddle(name, max) {
  const s = String(name || '');
  if (s.length <= max) return s;
  const tail = Math.max(8, Math.floor(max / 3));
  return s.slice(0, max - tail - 1) + '…' + s.slice(-tail);
}

function pageAngle(item) {
  const d = docs[item.doc];
  const src = d && d.angles ? (d.angles[item.page] || 0) : 0;
  return finalAngle(src, item.rotate);
}
function pageDesc(item) {
  const d = docs[item.doc];
  return 'page ' + (item.page + 1) + ' of ' + (d ? d.name : 'a removed file');
}

/* ── Loaded-file list ──────────────────────────────────────────────────── */

function renderFiles() {
  const wrap = $('fileList');
  wrap.replaceChildren();
  $('fileListBox').classList.toggle('hidden', docs.length === 0);
  $('fileCount').textContent = docs.length === 1
    ? '1 file loaded'
    : docs.length + ' files loaded';
  docs.forEach((d) => {
    const used = order.filter(o => o.doc === docs.indexOf(d)).length;
    wrap.append(el('li', { 'data-file': d.id },
      el('div', { class: 'grow' },
        el('div', { class: 'fname', title: d.name, text: shortMiddle(d.name, 48) }),
        el('div', { class: 'sub', text: d.pages + (d.pages === 1 ? ' page' : ' pages') +
          ' · ' + formatBytes(d.size) + ' · ' + used + ' in the list' })),
      el('button', {
        class: 'btn small danger', type: 'button', 'data-act': 'delfile',
        'aria-label': 'Remove the file ' + d.name + ' and its ' + used + ' page' + (used === 1 ? '' : 's') + ' from the list',
        onclick: () => removeFile(d.id),
      }, 'Remove file')));
  });
}

function removeFile(id) {
  if (busy) return;
  const idx = docs.findIndex(d => d.id === id);
  if (idx < 0) return;
  const snap = snapshot();
  const gone = docs[idx];
  const lost = order.filter(o => o.doc === idx).length;
  order = order.filter(o => o.doc !== idx).map(o => ({ ...o, doc: o.doc > idx ? o.doc - 1 : o.doc }));
  docs.splice(idx, 1);
  if (!nameTouched) $('outName').value = defaultName();
  renderAll();
  sayUndo('Removed ' + gone.name + ' and its ' + lost + ' page' + (lost === 1 ? '' : 's') +
    '. ' + order.length + ' page' + (order.length === 1 ? '' : 's') + ' left.', () => restore(snap));
  ($('addBtn')).focus();
}

/* ── Problems, said once and left on screen ────────────────────────────── */

function renderIssues() {
  const box = $('loadReport');
  box.replaceChildren();
  if (!issues.length) return;
  const bad = issues.filter(i => i.kind === 'bad').length;
  box.append(el('div', { class: 'warn', role: 'group', 'aria-label': 'Problems with files you added' },
    el('p', { class: 'warnhead', text: bad
      ? bad + ' of the files you added could not be used:'
      : 'Worth a look before you save:' }),
    el('ul', { class: 'warnlist' }, issues.map(i =>
      el('li', {}, el('b', { text: i.name }), ' — ' + i.reason))),
    el('button', {
      class: 'btn small', type: 'button',
      onclick: () => { issues = []; renderIssues(); $('addBtn').focus(); },
    }, 'Dismiss')));
}

/* ── The page list ─────────────────────────────────────────────────────── */

/* render() rebuilds the list, which destroys whatever had focus. Every caller
   that acted on a row says where focus should land afterwards; anything else
   falls back to "the same control on the same row". Without this, moving page
   40 to the front of a bundle by keyboard costs one move per journey through
   the whole list. */
function renderPages(hint) {
  const list = $('pageList');

  let restoreTo = hint || null;
  if (!restoreTo) {
    const a = document.activeElement;
    const li = a && a.closest ? a.closest('#pageList li[data-idx]') : null;
    if (li && a.dataset && a.dataset.act) restoreTo = { idx: Number(li.dataset.idx), act: a.dataset.act };
  }

  list.replaceChildren();
  const n = order.length;
  $('emptyState').classList.toggle('hidden', n > 0);
  list.classList.toggle('hidden', n === 0);
  $('pagesHead').textContent = n
    ? n + (n === 1 ? ' page' : ' pages') + ' — in output order'
    : 'Pages — in output order';

  order.forEach((item, i) => {
    const d = docs[item.doc];
    const angle = pageAngle(item);
    const where = 'row ' + (i + 1) + ' of ' + n;
    const what = pageDesc(item);
    list.append(el('li', { 'data-idx': i, 'aria-posinset': i + 1, 'aria-setsize': n },
      el('span', { class: 'pagetag', 'aria-hidden': 'true', text: String(i + 1) }),
      el('div', { class: 'grow' },
        el('div', { class: 'pline' },
          el('span', { class: 'pnum', text: 'Page ' + (item.page + 1) }),
          angle ? el('span', { class: 'rot', text: '↻ ' + angle + '°' }) : null),
        el('div', { class: 'doclabel', title: d ? d.name : '', text: d ? shortMiddle(d.name, 44) : '(file removed)' })),
      el('div', { class: 'rowbtns' },
        el('button', {
          class: 'btn icon', type: 'button', 'data-act': 'up',
          'aria-label': 'Move ' + where + ', ' + what + ', up',
          onclick: () => moveRow(i, -1),
        }, '↑'),
        el('button', {
          class: 'btn icon', type: 'button', 'data-act': 'down',
          'aria-label': 'Move ' + where + ', ' + what + ', down',
          onclick: () => moveRow(i, 1),
        }, '↓'),
        el('button', {
          class: 'btn icon', type: 'button', 'data-act': 'rot',
          'aria-label': 'Rotate ' + where + ', ' + what + '. Currently ' + angle + ' degrees',
          onclick: () => rotateRow(i),
        }, '↻'),
        el('button', {
          class: 'btn icon danger', type: 'button', 'data-act': 'del',
          'aria-label': 'Remove ' + where + ', ' + what + ', from the output',
          onclick: () => removeRow(i),
        }, '✕'))));
  });

  if (restoreTo && n) {
    const idx = Math.max(0, Math.min(n - 1, restoreTo.idx));
    const btn = list.querySelector('li[data-idx="' + idx + '"] [data-act="' + restoreTo.act + '"]');
    if (btn) btn.focus();
  } else if (restoreTo && !n) {
    $('addBtn').focus();
  }
}

function moveRow(i, dir) {
  if (busy) return;
  const j = i + dir;
  if (j < 0 || j >= order.length) {
    say('Page is already ' + (dir < 0 ? 'first' : 'last') + ' — nothing moved.', { ms: 1800 });
    return;
  }
  const item = order[i];
  [order[j], order[i]] = [order[i], order[j]];
  renderPages({ idx: j, act: dir < 0 ? 'up' : 'down' });
  renderBar();
  say(pageDesc(item).replace(/^p/, 'P') + ' is now row ' + (j + 1) + ' of ' + order.length + '.', { ms: 1800 });
}

function rotateRow(i) {
  if (busy) return;
  const item = order[i];
  item.rotate = (item.rotate + 90) % 360;
  renderPages({ idx: i, act: 'rot' });
  say(pageDesc(item).replace(/^p/, 'P') + ' will come out at ' + pageAngle(item) + '°.', { ms: 1800 });
}

function removeRow(i) {
  if (busy) return;
  const snap = snapshot();
  const item = order[i];
  const what = pageDesc(item);
  order.splice(i, 1);
  renderPages({ idx: Math.min(i, order.length - 1), act: 'del' });
  renderAllButPages();
  sayUndo('Removed ' + what + '. ' + order.length + ' page' + (order.length === 1 ? '' : 's') +
    ' left in the output.', () => { restore(snap); renderPages({ idx: i, act: 'del' }); });
}

/* ── Split settings ────────────────────────────────────────────────────── */

function currentSplit() {
  const mode = $('splitMode').value;
  const spec = $('splitSpec').value;
  try {
    const groups = splitGroups(order.length, mode, spec);
    return { groups, names: splitNames(stripExt($('outName').value) || defaultName(), groups), error: null };
  } catch (e) {
    return { groups: null, names: null, error: isHuman(e) ? e.message : 'Those split settings could not be read.' };
  }
}

function renderSplit() {
  const mode = SPLIT_MODES.find(m => m.id === $('splitMode').value) || SPLIT_MODES[0];
  const needsSpec = !!mode.spec;
  $('splitSpecField').classList.toggle('hidden', !needsSpec);
  $('splitSpec').placeholder = mode.placeholder || '';
  $('splitSpecLabel').textContent = mode.id === 'every'
    ? 'Pages per file'
    : mode.id === 'at' ? 'Start a new file at page' : 'Pages';

  const out = $('splitPreview');
  out.replaceChildren();
  const bar = $('splitMeta');

  if (!order.length) {
    out.append(el('p', { class: 'hint', text: 'Add a PDF and the file names will be listed here before anything is written.' }));
    bar.textContent = '';
    $('splitBtn').disabled = true;
    return;
  }
  const plan = currentSplit();
  if (plan.error) {
    out.append(el('p', { class: 'warn', text: plan.error }));
    bar.textContent = 'Split: check the settings';
    $('splitBtn').disabled = true;
    return;
  }
  $('splitBtn').disabled = false;
  const names = plan.names;
  const zip = $('splitDelivery').value === 'zip' && names.length > 1;
  const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ', … ' + names[names.length - 1] : '');
  out.append(el('p', { class: 'previewline' },
    el('b', { text: names.length + (names.length === 1 ? ' file' : ' files') }),
    ' — ' + shown));
  if (zip) {
    out.append(el('p', { class: 'hint', text: 'Delivered as one download, ' + zipName() +
      '. Your browser will not ask permission for multiple downloads.' }));
  } else if (names.length > 1) {
    out.append(el('p', { class: 'warn', text: names.length + ' separate downloads, about ' +
      Math.ceil(names.length * 0.25) + ' seconds of saving. Your browser will ask permission for multiple downloads, and they land in your Downloads folder one at a time.' }));
  }
  bar.textContent = 'Split: ' + names.length + (names.length === 1 ? ' file' : ' files') +
    (zip ? ' in one .zip' : ' saved separately');
}

/* ── The sticky bar ────────────────────────────────────────────────────── */

function renderBar() {
  const on = order.length > 0;
  $('actionbar').classList.toggle('hidden', !on);
  $('printMeta').textContent = on
    ? outName() + ' · ' + order.length + (order.length === 1 ? ' page' : ' pages') +
      ' from ' + docs.length + (docs.length === 1 ? ' file' : ' files')
    : 'Nothing assembled.';
  if (!on) return;
  const est = estimateBytes();
  $('barMeta').textContent = order.length + (order.length === 1 ? ' page' : ' pages') +
    ' · ' + outName() + ' · about ' + formatBytes(est);
  $('sizeNote').textContent = est > 20 * 1000 * 1000
    ? 'About ' + formatBytes(est) + '. Big enough that some upload forms will refuse it — many cap somewhere between 5 MB and 25 MB.'
    : 'About ' + formatBytes(est) + ' — the exact size is shown once it is written.';
}

function renderAllButPages() {
  renderFiles();
  renderIssues();
  renderSplit();
  renderBar();
}
function renderAll() {
  renderPages();
  renderAllButPages();
}

/* ── Loading files ─────────────────────────────────────────────────────── */

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  const snap = snapshot();
  let added = 0, pagesAdded = 0;
  const fresh = [];

  for (const f of files) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pdf = await loadPdf(window.PDFLib, bytes);
      const dup = docs.find(d => d.name === f.name && d.size === f.size);
      const doc = {
        id: nextDocId++, name: f.name, pdf, size: f.size,
        pages: pdf.getPageCount(), angles: sourceAngles(pdf),
      };
      const docIdx = docs.length;
      docs.push(doc);
      for (let p = 0; p < doc.pages; p++) order.push({ doc: docIdx, page: p, rotate: 0 });
      added++; pagesAdded += doc.pages;
      fresh.push(doc);
      if (dup) {
        issues.push({
          kind: 'note', name: f.name,
          reason: 'added twice — same name and same size. The list now holds ' +
            (dup.pages + doc.pages) + ' pages from it. Remove one copy below if that was not intended.',
        });
      }
    } catch (e) {
      issues.push({
        kind: 'bad', name: f.name,
        reason: isHuman(e) ? e.message : 'could not be opened by this browser. It may be damaged, or too large for the memory this tab has.',
      });
    }
  }

  if (!nameTouched) $('outName').value = defaultName();
  renderAll();

  if (added) {
    sayUndo(added + (added === 1 ? ' file' : ' files') + ' added — ' + pagesAdded +
      (pagesAdded === 1 ? ' page' : ' pages') + ', ' +
      formatBytes(fresh.reduce((a, d) => a + d.size, 0)) + '. Nothing was uploaded.',
    () => restore(snap));
  } else {
    say('Nothing was added — see the note above the Add button.', { assertive: true, ms: 6000 });
  }
  if (order.length > 400) {
    issues.push({
      kind: 'note', name: order.length + ' pages',
      reason: 'this list is long, so scrolling and redraws may feel slow. Nothing is capped — every page will be written.',
    });
    renderIssues();
  }
}

/* ── Saving ────────────────────────────────────────────────────────────── */

function setBusy(state, label) {
  busy = state;
  for (const id of ['addBtn', 'mergeBtn', 'splitBtn']) $(id).disabled = state;
  $('progressBox').classList.toggle('hidden', !state);
  if (label) $('progressText').textContent = label;
  if (!state) cancelRequested = false;
}

function failMessage(e) {
  if (isHuman(e)) return e.message;
  const raw = String((e && e.message) || '');
  if (/memory|allocat|Array buffer allocation/i.test(raw)) {
    return 'This browser tab ran out of memory before it finished. Try fewer or smaller files in one go — nothing was uploaded and nothing was lost.';
  }
  return 'Something went wrong while writing the PDF. Your files are untouched and still listed here.';
}

async function runMerge() {
  if (busy) return;
  if (!order.length) { say('Add a PDF first — there is nothing assembled yet.'); return; }
  const btn = $('mergeBtn');
  const loaded = docs.map(d => d.pdf);
  const { dropped } = planOutput(loaded, order);
  setBusy(true, 'Writing ' + outName() + '…');
  btn.textContent = 'Working…';
  try {
    await frame();
    const bytes = await buildOutput(window.PDFLib, loaded, order);
    const name = outName();
    download(bytes, name);
    $('sizeNote').textContent = name + ' — ' + formatBytes(bytes.length) + ', written just now.';
    say('Saved ' + name + ' — ' + (order.length - dropped.length) + ' pages, ' +
      formatBytes(bytes.length) + '. It never left your device.' +
      (dropped.length ? ' ' + dropped.length + ' row(s) pointed at pages that no longer exist and were left out.' : ''),
    { ms: 7000 });
  } catch (e) {
    say(failMessage(e), { assertive: true, ms: 8000 });
  }
  btn.textContent = 'Save as one PDF';
  setBusy(false);
  if (document.activeElement === document.body) btn.focus();
}

async function runSplit() {
  if (busy) return;
  const plan = currentSplit();
  if (plan.error) {
    say(plan.error, { assertive: true, ms: 7000 });
    $('splitSpec').focus();
    return;
  }
  const btn = $('splitBtn');
  const groups = plan.groups;
  const names = plan.names;
  const zip = $('splitDelivery').value === 'zip' && names.length > 1;
  const loaded = docs.map(d => d.pdf);

  setBusy(true, 'Building 0 of ' + groups.length + '…');
  btn.textContent = 'Working…';
  try {
    const outs = await buildSplit(window.PDFLib, loaded, order, groups, async (done, total) => {
      $('progressText').textContent = 'Building ' + done + ' of ' + total + '…';
      await frame();
    }, () => cancelRequested);

    if (zip) {
      $('progressText').textContent = 'Packing ' + names.length + ' files into ' + zipName() + '…';
      await frame();
      const bytes = zipStore(outs.map((b, i) => ({ name: names[i], bytes: b })));
      download(bytes, zipName(), 'application/zip');
      say('Saved ' + zipName() + ' — ' + names.length + ' PDFs, ' + formatBytes(bytes.length) +
        '. Nothing left your device.', { ms: 7000 });
    } else {
      let saved = 0;
      for (let i = 0; i < outs.length; i++) {
        if (cancelRequested) break;
        $('progressText').textContent = 'Saving ' + (i + 1) + ' of ' + outs.length + ' — ' + names[i];
        download(outs[i], names[i]);
        saved++;
        await sleep(250);
      }
      say(cancelRequested
        ? 'Stopped after ' + saved + ' of ' + outs.length + ' files. The ones already saved are in your Downloads folder; the page list is unchanged.'
        : saved + ' files saved to your Downloads folder. Nothing left your device.', { ms: 7000 });
    }
  } catch (e) {
    if (e && e.cancelled) {
      say('Split cancelled. Nothing was written and the page list is unchanged.', { ms: 5000 });
    } else {
      say(failMessage(e), { assertive: true, ms: 8000 });
    }
  }
  btn.textContent = 'Split';
  setBusy(false);
  if (document.activeElement === document.body) btn.focus();
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

function wire() {
  $('addBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    await addFiles(files);
  });

  /* Without these, a PDF dropped anywhere on the window makes the browser
     navigate to it, which throws away an arrangement that is held only in
     this tab. Preventing the default everywhere is the safety net; the card
     is the affordance. */
  const zone = $('dropZone');
  const stop = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  for (const ev of ['dragenter', 'dragover']) {
    document.addEventListener(ev, (e) => { e.preventDefault(); });
    zone.addEventListener(ev, (e) => { stop(e); zone.classList.add('over'); });
  }
  document.addEventListener('drop', (e) => e.preventDefault());
  for (const ev of ['dragleave', 'dragend']) {
    zone.addEventListener(ev, (e) => { if (e.target === zone) zone.classList.remove('over'); });
  }
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    if (busy) return;
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])]
      .filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const rejected = [...((e.dataTransfer && e.dataTransfer.files) || [])].length - files.length;
    if (rejected) {
      issues.push({ kind: 'bad', name: rejected + (rejected === 1 ? ' dropped file' : ' dropped files'), reason: 'not a PDF, so it was ignored. This tool only reads PDFs.' });
      renderIssues();
    }
    await addFiles(files);
  });

  $('outName').addEventListener('input', () => { nameTouched = true; renderBar(); renderSplit(); });
  $('splitMode').addEventListener('change', renderSplit);
  $('splitSpec').addEventListener('input', renderSplit);
  $('splitDelivery').addEventListener('change', renderSplit);

  $('mergeBtn').addEventListener('click', runMerge);
  $('splitBtn').addEventListener('click', runSplit);
  $('cancelBtn').addEventListener('click', () => {
    cancelRequested = true;
    $('progressText').textContent = 'Stopping…';
  });
  $('topBtn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: lessMotion() ? 'auto' : 'smooth' });
    $('addBtn').focus();
  });

  /* Nothing here is persisted — deliberately, it is the privacy promise — so
     the arrangement dies with the tab. Say so before it happens. */
  window.addEventListener('beforeunload', (e) => {
    if (order.length === 0) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function init() {
  const modes = $('splitMode');
  for (const m of SPLIT_MODES) modes.append(el('option', { value: m.id, text: m.label }));
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  renderAll();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
