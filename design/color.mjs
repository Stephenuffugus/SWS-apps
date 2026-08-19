/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, colour engine

   Every colour in the portfolio is specified in OKLCH and compiled to hex.
   Two reasons that matters more than it sounds:

   1. OKLCH lightness is perceptually uniform, so "L = 0.55" looks equally
      dark whether the hue is yellow or blue. Picking 23 palettes by hand in
      hex guarantees the yellow app comes out washed and the blue app comes
      out heavy. Here they come out matched.

   2. It lets the build ASSERT contrast rather than hope for it. Every derived
      token is checked against WCAG 2.1, and anything that misses is nudged
      along the L axis until it passes, so a palette cannot ship broken.

   Output is plain hex, so nothing depends on browser oklch() support.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── OKLCH → sRGB ───────────────────────────────────────────────────────── */

function linearToSrgb(x){
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function srgbToLinear(x){
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** OKLCH (L 0 to 1, C 0 to 0.4, H degrees) → [r,g,b] in 0 to 1 gamma sRGB, unclamped. */
function oklchToRgbRaw(L, C, H){
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(linearToSrgb);
}

const inGamut = (rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

/**
 * OKLCH → hex, reducing chroma until the colour fits in sRGB.
 * Preserving L and H while giving up C is what keeps a palette's lightness
 * relationships intact when one hue (yellow, cyan) runs out of gamut early.
 */
export function oklch(L, C, H){
  L = Math.min(1, Math.max(0, L));
  let lo = 0, hi = C;
  if (inGamut(oklchToRgbRaw(L, C, H))) lo = C;
  else {
    for (let i = 0; i < 28; i++){
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToRgbRaw(L, mid, H))) lo = mid; else hi = mid;
    }
  }
  const rgb = oklchToRgbRaw(L, lo, H).map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/* ── Contrast ───────────────────────────────────────────────────────────── */

export function hexToRgb(hex){
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function relativeLuminance(hex){
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrast(a, b){
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Find the OKLCH lightness nearest `startL` whose colour clears `target`
 * contrast against `against`. Walks away from the background, so text on a
 * light page darkens and text on a dark page lightens.
 *
 * Returns { L, hex, ok }, ok:false means even pure black/white missed, which
 * only happens for a mid-grey background and is worth failing the build over.
 */
export function solveForContrast({ startL, C, H, against, target, direction }){
  const dir = direction ?? (relativeLuminance(against) > 0.35 ? -1 : 1);
  for (let step = 0; step <= 100; step++){
    const L = startL + dir * step * 0.01;
    if (L < 0 || L > 1) break;
    const hex = oklch(L, C, H);
    if (contrast(hex, against) >= target) return { L, hex, ok: true };
  }
  const fallback = dir < 0 ? 0 : 1;
  return { L: fallback, hex: oklch(fallback, 0, H), ok: false };
}

/**
 * hex → OKLCH. The inverse trip, used to re-hue existing artwork.
 *
 * The app icons were drawn with the old palette baked in, a background tile
 * plus glyph details tinted from that same accent. Decomposing each colour and
 * swapping ONLY the hue keeps the artwork's internal light/dark relationships
 * exactly as the illustrator set them, while moving the whole icon onto the
 * app's new colour. Recolouring by hand would lose that structure.
 */
export function hexToOklch(hex){
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  return {
    L,
    C: Math.hypot(A, B),
    H: (Math.atan2(B, A) * 180) / Math.PI,
  };
}

/**
 * The most chroma sRGB can actually hold at this lightness and hue.
 *
 * This is what makes yellows behave differently from blues. A blue at L=0.52
 * still has plenty of chroma available; a yellow at L=0.52 has almost none,
 * which is why darkening a yellow to pass contrast turns it olive. Knowing the
 * ceiling lets the build choose a different strategy for those hues instead of
 * shipping mud.
 */
export function maxChromaAt(L, H){
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 24; i++){
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbRaw(L, mid, H))) lo = mid; else hi = mid;
  }
  return lo;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** rgba() string from an OKLCH colour, used for tinted shadows and veils. */
export function oklchA(L, C, H, alpha){
  const [r, g, b] = hexToRgb(oklch(L, C, H)).map((c) => Math.round(c * 255));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Inline SVG caret for <select>, tinted to the theme's secondary ink. */
export function caret(colorHex){
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" fill="none">` +
    `<path d="M1 1.5 6 6.5 11 1.5" stroke="${colorHex}" stroke-width="1.75" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
