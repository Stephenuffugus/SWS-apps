// Image Compressor — canvas resize + re-encode, entirely on-device.
import { fmtBytes, scaleDims, savingsPct, outName } from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/14AaEYfm9a5paHP7i17EQ0i' };

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

let items = []; // {file, thumbUrl, w, h, outBlob, outExt, outW, outH}

/* Full-resolution bitmaps are NOT retained (50 photos ≈ gigabytes of RAM on
   mobile). We keep only the File and a small thumb; compression re-decodes. */
async function readImage(file) {
  const bmp = await createImageBitmap(file);
  const t = document.createElement('canvas');
  const td = scaleDims(bmp.width, bmp.height, 120);
  t.width = td.w; t.height = td.h;
  t.getContext('2d').drawImage(bmp, 0, 0, td.w, td.h);
  const meta = { file, thumbUrl: t.toDataURL('image/jpeg', 0.7), w: bmp.width, h: bmp.height, outBlob: null, outExt: null };
  bmp.close && bmp.close();
  return meta;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressOne(item, maxSide, format, quality) {
  const bmp = await createImageBitmap(item.file);
  const { w, h } = scaleDims(item.w, item.h, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (format === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } // no black transparency
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const type = 'image/' + format;
  let blob = await canvasToBlob(canvas, type, format === 'png' ? undefined : quality);
  if (!blob || (blob.type !== type && format === 'webp')) {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality); // Safari-old fallback
  }
  item.outBlob = blob;
  // the extension must reflect what was ACTUALLY encoded, not the current dropdown
  item.outExt = blob ? (blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg') : null;
  item.outW = w; item.outH = h;
}

function download(blob, filename) {
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function downloadStaggered(list) {
  // browsers gate multi-download; fire sequentially so the permission prompt
  // can catch up, and tell the user what to click
  if (list.length > 1) toast('If the browser asks about multiple downloads, allow it', 4000);
  for (const [blob, name] of list) {
    download(blob, name);
    await new Promise(r => setTimeout(r, 350));
  }
}

function render() {
  const list = $('list');
  list.replaceChildren();
  $('emptyHint').classList.toggle('hidden', items.length > 0);
  $('listHead').textContent = items.length ? items.length + ' image(s)' : 'Images';
  for (const item of items) {
    const before = item.file.size;
    const after = item.outBlob ? item.outBlob.size : null;
    const img = el('img', { class: 'thumb', alt: '' });
    if (item.thumbUrl && item.thumbUrl.startsWith('data:image/')) img.src = item.thumbUrl;
    list.append(el('li', {},
      img,
      el('div', { class: 'grow' },
        el('div', { text: item.file.name }),
        el('div', { class: 'sub' },
          item.w + '×' + item.h + ' · ' + fmtBytes(before),
          after !== null ? el('span', {}, '  →  ' + item.outW + '×' + item.outH + ' · ' + fmtBytes(after) + '  ') : null,
          after !== null && savingsPct(before, after) > 0
            ? el('span', { class: 'savings', text: savingsPct(before, after) + '% smaller' }) : null)),
      item.outBlob
        ? el('button', { class: 'btn small', type: 'button',
            onclick: () => download(item.outBlob, outName(item.file.name, item.outExt || 'jpg')) }, 'Save')
        : null));
  }
}

function wire() {
  $('quality').addEventListener('input', (ev) => { $('qLabel').textContent = ev.target.value + '%'; });
  $('addBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    for (const f of files) {
      if (items.length >= 50) { toast('50 at a time — download these first'); break; }
      try { items.push(await readImage(f)); }
      catch (e) { toast('Couldn’t read ' + f.name); }
    }
    render();
  });
  $('runBtn').addEventListener('click', async (ev) => {
    if (items.length === 0) { toast('Choose images first'); return; }
    const btn = ev.target;
    btn.disabled = true; btn.textContent = 'Working…';
    const maxSide = parseInt($('maxSide').value, 10);
    const format = $('format').value;
    const quality = parseInt($('quality').value, 10) / 100;
    for (const item of items) {
      try { await compressOne(item, maxSide, format, quality); }
      catch (e) { /* leave item without output */ }
    }
    render();
    const total = items.reduce((a, i) => a + i.file.size, 0);
    const out = items.reduce((a, i) => a + (i.outBlob ? i.outBlob.size : i.file.size), 0);
    toast('Done — ' + fmtBytes(total) + ' → ' + fmtBytes(out) +
      (savingsPct(total, out) ? ' (' + savingsPct(total, out) + '% smaller)' : ''), 4500);
    btn.disabled = false; btn.textContent = 'Compress';
  });
  $('allBtn').addEventListener('click', async () => {
    const ready = items.filter(i => i.outBlob);
    if (ready.length === 0) { toast('Press Compress first'); return; }
    await downloadStaggered(ready.map(i => [i.outBlob, outName(i.file.name, i.outExt || 'jpg')]));
    toast(ready.length + ' download(s) started');
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
