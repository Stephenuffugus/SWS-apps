// Scan-to-PDF — pure helpers.

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
