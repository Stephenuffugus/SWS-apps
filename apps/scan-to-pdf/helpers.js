// Scan-to-PDF, pure helpers. No DOM, no browser APIs, so node can test them.

export function dataUrlToBytes(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i < 0) return null;
  try {
    const bin = atob(dataUrl.slice(i + 1));
    const u = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
    return u;
  } catch (e) { return null; }
}

/* Reorder helper: move index i by delta within bounds; returns a new array. */
export function moveItem(arr, i, delta) {
  const j = i + delta;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/* Rotation is stored as metadata, never baked into the pixels: a quarter turn
   used to mean a fresh JPEG re-encode, and four taps measurably degraded the
   scan (PSNR 37.7 dB) while growing the file. Clockwise degrees, CSS sense. */
export function normRot(r) {
  const n = Math.round((Number(r) || 0) / 90) * 90;
  return ((n % 360) + 360) % 360;
}

/* File sizes the way a person reads them, because "will this clear the 5 MB
   upload cap" is a question the app should answer before the download, not
   after. */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return Math.round(n) + ' B';
  const kb = n / 1024;
  if (kb < 1000) return (kb < 10 ? kb.toFixed(1) : String(Math.round(kb))) + ' KB';
  const mb = kb / 1024;
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + ' MB';
}

/* The images are ~99.9% of a scan PDF; the rest is a page object, an XObject
   entry and a small content stream each, plus the trailer. Fitted against real
   pdf-lib exports at 1/2/12/50 pages: 340 per page over a 700-byte base. */
export function estimatePdfBytes(imageBytes, pageCount) {
  if (!pageCount) return 0;
  return Math.round(imageBytes + pageCount * 340 + 700);
}

/* Local date, not UTC, someone scanning at 9pm on the 8th should not get the
   9th in their filename. */
export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export const NAME_MAX = 60;

/* A name a filesystem will accept, that never silently becomes empty and never
   silently loses the whole thing to one slash. Returns "<name>.pdf". */
export function safeFileName(raw, fallback = 'scan') {
  let s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/^\.+/, '')
    .trim();
  if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX);
  s = s.replace(/[. ]+$/, '').trim();
  return (s || fallback) + '.pdf';
}
