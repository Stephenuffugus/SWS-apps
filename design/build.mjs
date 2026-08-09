#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — build

   Turns each row of skins.mjs into a complete, contrast-checked token block,
   concatenates it with studio.css, and writes design/out/<app>.css.

     node design/build.mjs           build all, print the contrast audit
     node design/build.mjs --strict  exit non-zero if any check fails

   Nothing here is decorative. Every derived colour is solved against a real
   WCAG target, so a palette that would ship unreadable text fails the build
   instead of shipping.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { oklch, oklchA, contrast, solveForContrast, caret, maxChromaAt } from './color.mjs';
import { SKINS, VOICES, TEXTURES, TEXTURE_SUPPORT, PAPER_HUE, SYSTEM_STACK, FONT_FILES, LATIN_RANGE } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');

/* Contrast targets. Body text aims past the 4.5 minimum because these apps
   get read on phones in bad light by people who are busy. */
const T = {
  ink: 11,          // primary text — comfortably AAA
  ink2: 4.6,        // secondary text — AA with headroom for rounding
  ink3: 3.1,        // placeholders and disabled hints — decorative only
  accentText: 4.6,  // links, and the accent used as text
  accentInk: 4.6,   // label on a filled accent button
  focus: 3.1,       // WCAG 2.2 non-text contrast
  control: 3.05,    // input / button boundary — WCAG 1.4.11
  semantic: 4.6,
};

const audit = [];
function check(app, mode, label, fg, bg, target){
  const ratio = contrast(fg, bg);
  const pass = ratio >= target - 0.02;
  audit.push({ app, mode, label, ratio: +ratio.toFixed(2), target, pass });
  return pass;
}

/**
 * Derive one complete theme.
 * `mode` is 'light' or 'dark'; the two differ enough in construction that
 * sharing more code than this would obscure rather than help.
 */
function derive(slug, skin, mode){
  const { hue, chroma } = skin;
  const dark = mode === 'dark';

  /* -- paper ------------------------------------------------------------- */
  // 'warm' apps get a cream page whatever their accent hue is; 'cool' apps
  // get a page tinted with their own hue. Only meaningful in light mode —
  // in the dark every app tints with its own hue.
  const warm = skin.paper === 'warm' && !dark;
  const pH = warm ? PAPER_HUE : hue;
  const pC = warm ? 0.018 : 0.013;

  const t = {};

  if (!dark){
    t.canvas    = oklch(0.977, pC, pH);
    t['canvas-2'] = oklch(0.956, pC * 1.35, pH);
    t.surface   = oklch(0.996, pC * 0.32, pH);
    t['surface-2'] = oklch(0.967, pC * 1.15, pH);
    t.field     = oklch(0.987, pC * 0.55, pH);
    t.line      = oklch(0.897, pC * 1.7, pH);
  } else {
    const cL = skin.darkCanvasL ?? 0.192;
    t.canvas    = oklch(cL, pC * 1.4, pH);
    t['canvas-2'] = oklch(cL - 0.035, pC * 1.4, pH);
    t.surface   = oklch(cL + 0.045, pC * 1.5, pH);
    t['surface-2'] = oklch(cL + 0.085, pC * 1.6, pH);
    t.field     = oklch(cL + 0.012, pC * 1.5, pH);
    t.line      = oklch(cL + 0.13, pC * 1.8, pH);
  }

  /* Anything that must stay legible appears on three backgrounds — the page,
     a card, and an inset well — and they are not equally forgiving. Solve
     against whichever of the three is hardest for a colour of this weight,
     and the other two come free. */
  const backdrops = [t.canvas, t.surface, t['surface-2']];
  const hardestFor = (probe) =>
    backdrops.reduce((a, b) => (contrast(probe, b) < contrast(probe, a) ? b : a));

  // --line is decorative (card edges, row rules) and may stay faint.
  // --line-2 is the visible boundary of an input or a button, which WCAG
  // 1.4.11 puts at 3:1 — so it gets solved, not guessed. The washed-out
  // #e3e8ee these apps shipped with is the single biggest reason the forms
  // read as unfinished.
  const lineProbe = oklch(dark ? 0.45 : 0.72, pC * 2.1, pH);
  t['line-2'] = solveForContrast({
    startL: dark ? 0.45 : 0.72, C: pC * 2.1, H: pH,
    against: hardestFor(lineProbe), target: T.control,
  }).hex;

  /* -- ink --------------------------------------------------------------- */
  // Ink carries a trace of the app's hue. It is why a warm app's "black" and
  // a cool app's "black" feel different even though both read as near-black.
  const inkC = dark ? 0.014 : 0.024;
  t.ink = dark ? oklch(0.938, inkC, hue) : oklch(0.245, inkC, hue);

  // Secondary and tertiary ink are solved against SURFACE, which is the
  // lighter (light mode) / darker (dark mode) of the two backgrounds they
  // appear on — clear there means clear everywhere.
  t['ink-2'] = solveForContrast({
    startL: dark ? 0.74 : 0.50, C: inkC, H: hue,
    against: hardestFor(oklch(dark ? 0.74 : 0.50, inkC, hue)), target: T.ink2,
  }).hex;
  t['ink-3'] = solveForContrast({
    startL: dark ? 0.62 : 0.63, C: inkC, H: hue,
    against: hardestFor(oklch(dark ? 0.62 : 0.63, inkC, hue)), target: T.ink3,
  }).hex;

  /* -- accent ------------------------------------------------------------ */
  const aC = dark ? chroma * 0.88 : chroma;

  t.accent = dark ? oklch(0.77, aC, hue) : oklch(0.605, aC, hue);

  // accent-deep does double duty: link text on the page, and the fill behind
  // a primary button. It has to clear 4.6:1 against the surface either way.
  const deep = solveForContrast({
    startL: dark ? 0.80 : 0.52, C: aC, H: hue,
    against: hardestFor(oklch(dark ? 0.80 : 0.52, aC, hue)), target: T.accentText,
  });
  t['accent-deep'] = deep.hex;
  t['accent-soft'] = dark ? oklch(0.30, aC * 0.42, hue) : oklch(0.946, aC * 0.30, hue);

  /* The button fill is a SEPARATE token from the link colour, and that split
     is what keeps the yellow-ish apps from going olive.

     --accent-deep has to be dark enough to read as text on a white card, and
     for a hue near yellow there is almost no chroma available down there — so
     forcing the button to use it turns marigold into mud. But a button does
     not need dark-on-light: it can be a bright fill with a dark label.

     So: compare the chroma sRGB can actually hold at the dark lightness
     against what it holds at a bright one. If the bright version is markedly
     more saturated, the fill goes bright and the label goes dark. Blues and
     violets keep the classic deep fill with a white label, because for them
     the dark end loses nothing. */
  const brightL = dark ? 0.80 : 0.755;
  const cAtDeep = Math.min(aC, maxChromaAt(deep.L, hue));
  const cAtBright = Math.min(aC, maxChromaAt(brightL, hue));
  // 1.10 is where the two strategies actually diverge in practice: golds and
  // cyans land at 1.13–1.36, blues and violets at 0.84–1.07. A skin can force
  // either with `fill: 'bright' | 'deep'` when the heuristic reads it wrong.
  const preferBright = skin.fill
    ? skin.fill === 'bright' && !dark
    : !dark && cAtBright > cAtDeep * 1.10;

  const fillL = preferBright ? brightL : deep.L;
  t['accent-fill'] = oklch(fillL, aC, hue);
  t['accent-press'] = oklch(preferBright ? fillL - 0.075 : (dark ? fillL + 0.07 : fillL - 0.065), aC, hue);

  // Whichever of near-white / near-black reads better on the fill we chose.
  const lightInk = oklch(0.99, aC * 0.05, hue);
  const darkInk = oklch(0.175, aC * 0.30, hue);
  t['accent-ink'] =
    contrast(lightInk, t['accent-fill']) >= contrast(darkInk, t['accent-fill']) ? lightInk : darkInk;

  /* -- focus ------------------------------------------------------------- */
  // Must clear 3:1 on BOTH backgrounds, so solve against whichever is harder.
  t.focus = solveForContrast({
    startL: dark ? 0.78 : 0.55, C: Math.max(aC, 0.06), H: hue,
    against: hardestFor(oklch(dark ? 0.78 : 0.55, Math.max(aC, 0.06), hue)), target: T.focus,
  }).hex;
  t['focus-halo'] = oklchA(dark ? 0.78 : 0.55, Math.max(aC, 0.06), hue, dark ? 0.30 : 0.22);

  /* -- semantics --------------------------------------------------------- */
  // Warning/positive/negative hues rotate slightly toward the app's own hue so
  // they read as part of the palette rather than three bootstrap colours.
  const pull = (base, amount = 0.12) => base + (((hue - base + 540) % 360) - 180) * amount;

  for (const [name, baseHue, baseC] of [['neg', 27, 0.16], ['pos', 152, 0.13], ['warn', 75, 0.15]]){
    const h = pull(baseHue);
    t[name] = solveForContrast({
      startL: dark ? 0.76 : 0.53, C: baseC * (dark ? 0.85 : 1), H: h,
      against: hardestFor(oklch(dark ? 0.76 : 0.53, baseC * (dark ? 0.85 : 1), h)), target: T.semantic,
    }).hex;
    t[`${name}-soft`] = dark ? oklch(0.29, baseC * 0.40, h) : oklch(0.955, baseC * 0.28, h);
    t[`${name}-line`] = dark ? oklch(0.42, baseC * 0.55, h) : oklch(0.855, baseC * 0.45, h);
  }

  /* -- surfaces that sit outside the page ------------------------------- */
  t['toast-bg'] = dark ? oklch(0.90, inkC, hue) : oklch(0.235, inkC, hue);
  t['toast-ink'] = dark ? oklch(0.16, inkC * 1.5, hue) : oklch(0.985, inkC * 0.4, hue);
  t.veil = oklchA(dark ? (skin.darkCanvasL ?? 0.192) : 0.977, pC, pH, 0.86);

  /* -- elevation --------------------------------------------------------- */
  // Shadows are tinted with the app's ink rather than pure black. Black
  // shadows on a warm page look like dirt; tinted ones look like depth.
  const sh = (a) => oklchA(dark ? 0.04 : 0.28, dark ? 0 : inkC * 1.5, hue, a);
  t['shadow-0'] = `0 1px 0 ${sh(dark ? 0.30 : 0.045)}`;
  t['shadow-1'] = `0 1px 2px ${sh(dark ? 0.34 : 0.05)}, 0 8px 20px -14px ${sh(dark ? 0.5 : 0.24)}`;
  t['shadow-2'] = `0 2px 6px ${sh(dark ? 0.38 : 0.07)}, 0 18px 44px -18px ${sh(dark ? 0.62 : 0.32)}`;

  t.caret = caret(t['ink-2']);

  /* -- app-specific semantics ------------------------------------------- */
  /* An app's own colours get the same treatment as the system's. `role` says
     how each is used, so the build can check the right thing:
       fill — a button/badge background; also emits a solved --<name>-ink
       tint — a soft highlight background that --ink must stay readable on
       line — a border, held to the 3:1 control boundary
       text — a colour used as text, held to 4.6:1 */
  for (const [name, spec] of Object.entries(skin.extra ?? {})){
    const h = spec.h ?? hue;
    const c = spec.c ?? chroma * 0.4;
    const L = dark ? (spec.dl ?? spec.l) : spec.l;
    const cc = dark ? c * 0.88 : c;

    if (spec.role === 'line'){
      t[name] = solveForContrast({
        startL: L, C: cc, H: h, against: hardestFor(oklch(L, cc, h)), target: T.control,
      }).hex;
    } else if (spec.role === 'text'){
      t[name] = solveForContrast({
        startL: L, C: cc, H: h, against: hardestFor(oklch(L, cc, h)), target: T.semantic,
      }).hex;
    } else {
      t[name] = oklch(L, cc, h);
    }

    if (spec.role === 'fill'){
      const lightOn = oklch(0.99, cc * 0.06, h);
      const darkOn = oklch(0.17, cc * 0.35, h);
      t[`${name}-ink`] =
        contrast(lightOn, t[name]) >= contrast(darkOn, t[name]) ? lightOn : darkOn;
    }
  }

  return t;
}

/* ── Emit ───────────────────────────────────────────────────────────────── */

function tokenBlock(t, indent = '  '){
  const order = [
    'canvas','canvas-2','surface','surface-2','field','line','line-2',
    'ink','ink-2','ink-3',
    'accent','accent-deep','accent-fill','accent-press','accent-soft','accent-ink',
    'focus','focus-halo',
    'neg','neg-soft','neg-line','pos','pos-soft','pos-line','warn','warn-soft','warn-line',
    'toast-bg','toast-ink','veil','shadow-0','shadow-1','shadow-2','caret',
  ];
  const seen = new Set(order);
  const lines = [];
  for (const k of order) if (t[k] !== undefined) lines.push(`${indent}--${k}:${t[k]};`);
  const extras = Object.keys(t).filter((k) => !seen.has(k));
  if (extras.length){
    lines.push(`${indent}/* app-specific */`);
    for (const k of extras) lines.push(`${indent}--${k}:${t[k]};`);
  }
  return lines.join('\n');
}

function textureFor(skin, t, dark){
  const kind = skin.texture ?? 'none';
  const image = TEXTURES[kind]({
    dark,
    a: kind === 'band' || kind === 'rule' ? t['accent-deep'] : oklchA(dark ? 0.72 : 0.60, skin.chroma, skin.hue, dark ? 0.10 : 0.07),
    b: oklchA(dark ? 0.72 : 0.60, skin.chroma * 0.8, skin.support ?? (skin.hue + 150) % 360, dark ? 0.09 : 0.06),
    rule: oklchA(dark ? 0.65 : 0.42, skin.chroma * 0.5, skin.hue, dark ? 0.075 : 0.055),
  });
  return { image, support: TEXTURE_SUPPORT[kind] ?? '' };
}

function buildApp(slug, skin){
  const light = derive(slug, skin, 'light');
  const dark = derive(slug, skin, 'dark');
  const voice = VOICES[skin.voice];

  /* audit the pairs that actually matter on screen */
  for (const [mode, t] of [['light', light], ['dark', dark]]){
    const on = [['canvas', t.canvas], ['surface', t.surface], ['surface-2', t['surface-2']]];
    for (const [bgName, bg] of on){
      check(slug, mode, `ink / ${bgName}`, t.ink, bg, T.ink);
      check(slug, mode, `ink-2 / ${bgName}`, t['ink-2'], bg, T.ink2);
      check(slug, mode, `ink-3 / ${bgName}`, t['ink-3'], bg, T.ink3);
      check(slug, mode, `accent-deep / ${bgName}`, t['accent-deep'], bg, T.accentText);
      check(slug, mode, `focus / ${bgName}`, t.focus, bg, T.focus);
      check(slug, mode, `line-2 / ${bgName}`, t['line-2'], bg, T.control);
      check(slug, mode, `neg / ${bgName}`, t.neg, bg, T.semantic);
      check(slug, mode, `pos / ${bgName}`, t.pos, bg, T.semantic);
      check(slug, mode, `warn / ${bgName}`, t.warn, bg, T.semantic);
    }
    check(slug, mode, 'accent-ink / accent-fill', t['accent-ink'], t['accent-fill'], T.accentInk);
    check(slug, mode, 'accent-ink / accent-press', t['accent-ink'], t['accent-press'], T.accentInk);
    check(slug, mode, 'toast-ink / toast-bg', t['toast-ink'], t['toast-bg'], T.ink2);
    check(slug, mode, 'ink / accent-soft', t.ink, t['accent-soft'], T.ink2);
    check(slug, mode, 'ink / neg-soft', t.ink, t['neg-soft'], T.ink2);
    check(slug, mode, 'ink / warn-soft', t.ink, t['warn-soft'], T.ink2);

    // and the app's own colours, by the role each declares
    for (const [name, spec] of Object.entries(skin.extra ?? {})){
      if (spec.role === 'fill') check(slug, mode, `${name}-ink / ${name}`, t[`${name}-ink`], t[name], T.accentInk);
      if (spec.role === 'tint') check(slug, mode, `ink / ${name}`, t.ink, t[name], T.ink2);
      if (spec.role === 'line') for (const [bgName, bg] of on) check(slug, mode, `${name} / ${bgName}`, t[name], bg, T.control);
      if (spec.role === 'text') for (const [bgName, bg] of on) check(slug, mode, `${name} / ${bgName}`, t[name], bg, T.semantic);
    }
  }

  const texL = textureFor(skin, light, false);
  const texD = textureFor(skin, dark, true);
  const attach = { wash: 'fixed', grid: 'fixed', grain: 'scroll', band: 'scroll', rule: 'scroll', none: 'scroll' }[skin.texture ?? 'none'];

  const scale = skin.scale ? `\n  --t-base:${(1 * skin.scale).toFixed(3)}rem;\n  --t-lg:${(1.0625 * skin.scale).toFixed(3)}rem;\n  --t-sm:${(0.9375 * skin.scale).toFixed(3)}rem;` : '';

  const fontKey = voice.font;
  const face = fontKey ? FONT_FILES[fontKey] : null;
  // Headings only, latin only, served from this app's own directory so the
  // service worker can cache it. Never a CDN — that would break offline and
  // leak a request, and "nothing leaves your device" has to be literal.
  const fontFace = face ? `@font-face{
  font-family:'${face.family}';
  font-style:normal;
  font-weight:${face.weights};
  font-display:swap;
  src:url(fonts/${face.file}) format('woff2');
  unicode-range:${LATIN_RANGE};
}
` : '';

  return `/* ═══════════════════════════════════════════════════════════════════════
   ${slug} — ${skin.note}
   GENERATED by design/build.mjs from design/skins.mjs + design/studio.css.
   Do not edit here; edit the source and rebuild.
   ═══════════════════════════════════════════════════════════════════════ */
${fontFace}:root{
  color-scheme:light dark;
  --r:${skin.r}px;
  --wrap:${skin.wrap};
  --font-text:${SYSTEM_STACK};
  --font-display:${voice.display};
  --display-weight:${voice.weight};
  --display-tracking:${voice.tracking};${scale}
${tokenBlock(light)}

  /* Legacy aliases. Every app shipped against the old token names; these keep
     an app rendering correctly the moment the base layer lands, before its own
     rules have been migrated. They resolve through var(), so they follow the
     dark-mode values automatically and cost nothing to leave in place. */
  --bg:var(--canvas);
  --card:var(--surface);
  --muted:var(--ink-2);
  --chip:var(--surface-2);
  --chip-ink:var(--ink);
  --line-strong:var(--line-2);
  --paper:var(--canvas);
  --paper-2:var(--canvas-2);
  --ink-soft:var(--ink-2);
  --radius:var(--r-card);
  --shadow:var(--shadow-1);
}
@media (prefers-color-scheme:dark){
  :root{
${tokenBlock(dark)}
  }
}

${readFileSync(join(HERE, 'studio.css'), 'utf8')}

/* ── ${slug} texture — must follow the base layer to win the cascade ───── */
body{
  background-image:${texL.image};
  background-attachment:${attach};
  ${texL.support}
}
@media (prefers-color-scheme:dark){
  body{background-image:${texD.image}}
}`;
}

/* ── Run ────────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });

for (const [slug, skin] of Object.entries(SKINS)){
  writeFileSync(join(OUT, `${slug}.css`), buildApp(slug, skin));
}

// The hub page paints each card in its app's own accent; this is where it
// reads them from, so the two can never drift apart.
writeFileSync(join(OUT, 'palette.json'), JSON.stringify(
  Object.fromEntries(Object.entries(SKINS).map(([slug, skin]) => {
    const l = derive(slug, skin, 'light');
    const d = derive(slug, skin, 'dark');
    return [slug, {
      accent: l.accent, accentDeep: l['accent-deep'], accentFill: l['accent-fill'],
      darkAccent: d.accent, canvas: l.canvas, darkCanvas: d.canvas, note: skin.note,
      hue: skin.hue, voice: skin.voice, paper: skin.paper,
    }];
  })), null, 2));

// apply.mjs reads this to know which font file each app needs copied in.
writeFileSync(join(OUT, 'fonts.json'), JSON.stringify(
  Object.fromEntries(Object.entries(SKINS).map(([slug, skin]) => {
    const key = VOICES[skin.voice].font;
    return [slug, key ? FONT_FILES[key].file : null];
  })), null, 2));

const failures = audit.filter((a) => !a.pass);
const byApp = new Map();
for (const a of audit){
  if (!byApp.has(a.app)) byApp.set(a.app, []);
  byApp.get(a.app).push(a);
}

console.log(`Built ${Object.keys(SKINS).length} skins → design/out/`);
console.log(`Contrast checks: ${audit.length - failures.length}/${audit.length} pass\n`);

if (failures.length){
  console.log('FAILURES');
  for (const f of failures){
    console.log(`  ${f.app.padEnd(20)} ${f.mode.padEnd(6)} ${f.label.padEnd(26)} ${f.ratio} (need ${f.target})`);
  }
  console.log('');
}

// Worst pair per app — a quick way to see which palettes have no headroom.
console.log('Tightest check per app');
for (const [app, list] of byApp){
  const worst = list.reduce((a, b) => (b.ratio / b.target < a.ratio / a.target ? b : a));
  console.log(`  ${app.padEnd(20)} ${String(worst.ratio).padStart(5)}:1  ${worst.label} (${worst.mode}, need ${worst.target})`);
}

if (failures.length && process.argv.includes('--strict')) process.exit(1);
