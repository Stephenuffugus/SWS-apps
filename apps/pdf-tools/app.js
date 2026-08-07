// PDF Tools — merge, reorder, rotate, delete, split. All in-browser.
import { buildOutput, splitAll, loadPdf } from './core.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/6oU9AU4HvcdxaHPcCl7EQ0h' };

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
function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

let docs = [];   // { name, pdf: PDFDocument }
let order = [];  // { doc, page, rotate }

function render() {
  const list = $('pageList');
  list.replaceChildren();
  $('emptyHint').classList.toggle('hidden', order.length > 0);
  $('pagesHead').textContent = order.length
    ? order.length + ' pages (in output order)'
    : 'Pages (in output order)';
  order.forEach((item, i) => {
    list.append(el('li', {},
      el('span', { class: 'pagetag', text: String(i + 1) }),
      el('div', { class: 'grow' },
        el('div', {}, 'Page ' + (item.page + 1),
          item.rotate ? el('span', { class: 'rot', text: '  ⟳' + item.rotate + '°' }) : null),
        el('div', { class: 'doclabel', text: docs[item.doc].name })),
      el('button', { class: 'btn small', type: 'button', 'aria-label': 'Move up',
        onclick: () => { if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; render(); } } }, '↑'),
      el('button', { class: 'btn small', type: 'button', 'aria-label': 'Move down',
        onclick: () => { if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; render(); } } }, '↓'),
      el('button', { class: 'btn small', type: 'button', 'aria-label': 'Rotate 90 degrees',
        onclick: () => { item.rotate = (item.rotate + 90) % 360; render(); } }, '⟳'),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove page',
        onclick: () => { order.splice(i, 1); render(); } }, '✕')));
  });
}

function wire() {
  $('addBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const pdf = await loadPdf(window.PDFLib, bytes);
        const docIdx = docs.length;
        docs.push({ name: f.name, pdf });
        for (let p = 0; p < pdf.getPageCount(); p++) order.push({ doc: docIdx, page: p, rotate: 0 });
        toast(f.name + ' — ' + pdf.getPageCount() + ' pages loaded');
      } catch (e) {
        toast(e.message || 'Couldn’t read ' + f.name, 6000);
      }
    }
    render();
  });
  $('mergeBtn').addEventListener('click', async (ev) => {
    if (order.length === 0) { toast('Add a PDF first'); return; }
    const btn = ev.target;
    btn.disabled = true; btn.textContent = 'Working…';
    try {
      const bytes = await buildOutput(window.PDFLib, docs.map(d => d.pdf), order);
      download(bytes, docs.length === 1 ? 'edited.pdf' : 'merged.pdf');
      toast('Saved — and it never left your device');
    } catch (e) { toast('Failed: ' + (e.message || 'unknown error'), 5000); }
    btn.disabled = false; btn.textContent = 'Save as one PDF';
  });
  $('splitBtn').addEventListener('click', async (ev) => {
    if (docs.length === 0) { toast('Add a PDF first'); return; }
    if (docs.length > 1) { toast('Split works on one file at a time — reload with just that file'); return; }
    const total = docs[0].pdf.getPageCount();
    if (total > 30 && !confirm('This will download ' + total + ' separate files. Continue?')) return;
    const btn = ev.target;
    btn.disabled = true; btn.textContent = 'Working…';
    try {
      const outs = await splitAll(window.PDFLib, docs[0].pdf);
      const base = docs[0].name.replace(/\.pdf$/i, '');
      toast('If the browser asks about multiple downloads, allow it', 4000);
      for (let i = 0; i < outs.length; i++) {
        download(outs[i], base + '-page-' + (i + 1) + '.pdf');
        await new Promise(r => setTimeout(r, 350));
      }
      toast(outs.length + ' download(s) started');
    } catch (e) { toast('Failed: ' + (e.message || 'unknown error'), 5000); }
    btn.disabled = false; btn.textContent = 'Split into one file per page';
  });
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
