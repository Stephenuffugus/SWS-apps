// Wheel picker — pure logic. Tested in test/helpers.test.mjs.

export function parseNames(text) {
  if (typeof text !== 'string') return [];
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 100)
    .map(s => s.slice(0, 40));
}

/* Which slice is under the pointer (12 o'clock) when the wheel has rotated
   by `rotation` radians? Slice i spans [i*arc, (i+1)*arc) from the wheel's 0
   (pointing up, clockwise). */
export function sliceAtPointer(rotation, count) {
  if (count <= 0) return -1;
  const arc = (Math.PI * 2) / count;
  const norm = ((-rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(norm / arc) % count;
}

/* Ease-out cubic for the spin animation. */
export function easeOut(t) {
  return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
}

/* URL-hash state codec (names + removeMode). */
export function encodeState(state) {
  const json = JSON.stringify({ n: state.names, r: state.removeMode ? 1 : 0 });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeState(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.n)) return null;
    return {
      names: obj.n.filter(x => typeof x === 'string').slice(0, 100).map(x => x.slice(0, 40)),
      removeMode: obj.r === 1,
    };
  } catch (e) { return null; }
}

export const WHEEL_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be185d', '#475569'];

/* Adjacent slices must differ; with an odd fit we'd wrap into a clash. */
export function sliceColor(i, count) {
  const n = WHEEL_COLORS.length;
  if (count > 1 && i === count - 1 && count % n === 1) return WHEEL_COLORS[1];
  return WHEEL_COLORS[i % n];
}
