// Wheel picker, pure logic. Tested in test/helpers.test.mjs.

/* The two caps, named rather than buried in a .slice(). The UI has to be able
   to say what they are, a wheel that silently drops 400 of the 500 names you
   pasted is not a limit, it is a lie. */
export const MAX_NAMES = 100;
export const MAX_NAME_LEN = 40;

export function parseNames(text) {
  return parseNamesDetailed(text).names;
}

/**
 * Same parse, but reports what it had to throw away.
 *
 * Pasting a 500-name roster used to produce exactly 100 names and no comment,
 * and a 43-character name was stored truncated while the textarea still showed
 * it in full, so the wheel and the box disagreed and only one of them was
 * honest. Callers use `dropped` and `truncated` to say so out loud.
 */
export function parseNamesDetailed(text) {
  if (typeof text !== 'string') return { names: [], dropped: 0, truncated: 0 };

  const all = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const kept = all.slice(0, MAX_NAMES);
  const truncated = kept.filter(s => s.length > MAX_NAME_LEN).length;

  return {
    names: kept.map(s => s.slice(0, MAX_NAME_LEN)),
    dropped: all.length - kept.length,
    truncated,
  };
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

/* Wedge colours, arranged in three LIGHTNESS tiers rather than six hues.
 *
 * The old palette was six colours of near-identical lightness: measured
 * adjacent-pair contrast ran 1.04 to 1.47:1, so on a projector, in greyscale, or
 * to a colour-blind viewer the wheel was one flat disc with faint seams. Hue
 * alone does not separate two shapes that touch.
 *
 * Three tiers and not two because the wedges form a CYCLE, and an odd cycle
 * cannot be two-coloured, with six alternating colours every odd name count
 * put two same-lightness wedges side by side at the wrap. Three tiers can
 * always be arranged so no two neighbours match.
 */
/* Chosen by measured relative luminance, not by eye. The bands are roughly
   0.05 / 0.72 / 0.25, which puts every adjacent pair at 2.5:1 or better, deep↔pale 7.3, pale↔mid 2.6, mid↔deep 2.9. Picking "a dark violet and a
   dark blue" by name is exactly how the previous palette ended up at 1.04. */
const TIERS = [
  ['#1e3a8a', '#134e4a', '#4c1d95', '#881337'],  // 0, deep, L 0.046 to 0.061
  ['#a7f3d0', '#fbcfe8', '#fde68a', '#bbf7d0'],  // 1, pale, L 0.710 to 0.816
  ['#0891b2', '#ea580c', '#0d9488'],             // 2, mid,  L 0.230 to 0.245
];

/* Kept as a flat list because the test suite and any other caller still expect
   the name to exist. */
export const WHEEL_COLORS = [TIERS[0][0], TIERS[1][0], TIERS[2][0], TIERS[0][1], TIERS[1][1], TIERS[2][1]];

/**
 * Which lightness tier slice `i` sits in, for a wheel of `count` slices.
 *
 * i % 3 walks the tiers, which properly colours the cycle except when
 * count % 3 === 1, there the last slice lands on tier 0 beside slice 0, also
 * tier 0. Its neighbours are then tiers 2 and 0, so tier 1 is the one free
 * choice, and it is always available.
 */
function tierOf(i, count) {
  if (count > 2 && count % 3 === 1 && i === count - 1) return 1;
  return i % 3;
}

export function sliceColor(i, count) {
  const tier = TIERS[tierOf(i, count)];
  return tier[Math.floor(i / 3) % tier.length];
}

/* Relative luminance, so the label colour is decided by measurement rather
   than by which tier a colour was filed under. */
function luminance(hex) {
  const p = hex.slice(1).match(/../g).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const LABEL_DARK = '#1f2937';
const LABEL_LIGHT = '#ffffff';

/**
 * The label colour for slice `i`, whichever of near-white and near-black
 * actually reads better on that wedge.
 *
 * Same approach the design system's build uses for --accent-ink. Deriving it
 * means a wedge colour can never be changed without its label following.
 */
export function sliceInk(i, count) {
  const fill = sliceColor(i, count);
  return ratio(LABEL_LIGHT, fill) >= ratio(LABEL_DARK, fill) ? LABEL_LIGHT : LABEL_DARK;
}
