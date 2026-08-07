// Scan to PDF — capture, compress, reorder, rotate, export. All on-device.
import { moveItem } from './helpers.js';
import { makePdfFromImages } from './pdf.js';

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
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}

let pages = []; // {dataUrl}

async function compressImage(file, maxSide = 2000, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}

function rotateDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const safeSrc = (u) => (typeof u === 'string' && u.startsWith('data:image/')) ? u : null;

function render() {
  const box = $('pages');
  box.replaceChildren();
  $('emptyHint').classList.toggle('hidden', pages.length > 0);
  $('pageHead').textContent = pages.length ? pages.length + (pages.length === 1 ? ' page' : ' pages') : 'Pages';
  pages.forEach((p, i) => {
    const img = el('img', { alt: 'Page ' + (i + 1) });
    if (safeSrc(p.dataUrl)) img.src = p.dataUrl;
    box.append(el('div', { class: 'pagecard' },
      img,
      el('div', { class: 'bar' },
        el('span', { class: 'num', text: String(i + 1) }),
        el('span', {},
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Move earlier',
            onclick: () => { pages = moveItem(pages, i, -1); render(); } }, '←'),
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Rotate',
            onclick: async () => { pages[i].dataUrl = await rotateDataUrl(p.dataUrl); render(); } }, '⟳'),
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Move later',
            onclick: () => { pages = moveItem(pages, i, +1); render(); } }, '→'),
          el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete page',
            onclick: () => { pages.splice(i, 1); render(); } }, '✕')))));
  });
}

function wire() {
  $('addBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    const memBytes = () => pages.reduce((a, p) => a + p.dataUrl.length * 0.75, 0);
    for (const f of files) {
      if (pages.length >= 100) { toast('100-page limit — make this PDF and start another'); break; }
      if (memBytes() > 150 * 1024 * 1024) {
        toast('That’s a lot of pages for one go — make this PDF now and start a second one.', 6000);
        break;
      }
      try { pages.push({ dataUrl: await compressImage(f) }); }
      catch (e) {
        // no canvas support — raw file fallback
        await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => { if (typeof r.result === 'string') pages.push({ dataUrl: r.result }); res(); };
          r.onerror = () => res();
          r.readAsDataURL(f);
        });
      }
    }
    render();
  });
  $('makeBtn').addEventListener('click', async (ev) => {
    if (pages.length === 0) { toast('Add at least one page'); return; }
    const btn = ev.target;
    btn.disabled = true; btn.textContent = 'Working…';
    try {
      const { bytes, skipped } = await makePdfFromImages(window.PDFLib, pages, $('pageSize').value);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'scan.pdf' });
      document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast(skipped ? 'PDF saved (' + skipped + ' unreadable page(s) skipped)' : 'PDF saved — no watermark, obviously', 4000);
    } catch (e) {
      toast('PDF failed: ' + (e.message || 'unknown error'), 5000);
    }
    btn.disabled = false; btn.textContent = 'Make the PDF';
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
