// Image compressor — pure helpers. Tested in test/helpers.test.mjs.

export function fmtBytes(n) {
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

/* Fit (w,h) within maxSide preserving aspect; never upscale. */
export function scaleDims(w, h, maxSide) {
  if (!maxSide || maxSide <= 0) return { w, h };
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export function savingsPct(before, after) {
  if (!before || after >= before) return 0;
  return Math.round(100 * (1 - after / before));
}

/* filename.jpg -> filename-small.jpg (with the output extension) */
export function outName(name, ext) {
  const base = String(name || 'image').replace(/\.[^.]+$/, '');
  return base + '-small.' + ext;
}
