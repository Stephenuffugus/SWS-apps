#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — the Google Play packaging layer

   23 apps means 23 Play listings, and none of them should be assembled by
   hand. Everything Play needs that a machine can derive is derived here, from
   the same single source of truth the rest of the studio uses: skins.mjs for
   identity, palette.json for the solved colours, and each app's own icon.svg.

     node design/play.mjs             generate everything
     node design/play.mjs --icons     icons only
     node design/play.mjs --check     verify readiness; non-zero exit on gaps
     node design/play.mjs qr-maker    limit to one app

   What it writes, per app:

     apps/<slug>/icon-192.png            web manifest, purpose "any"
     apps/<slug>/icon-512.png            web manifest + Bubblewrap source icon
     apps/<slug>/icon-maskable-512.png   web manifest, purpose "maskable"
     apps/<slug>/manifest.webmanifest    upgraded in place, key order preserved
     design/out/play/<slug>/play-icon-512.png   Play Console listing icon (opaque)
     design/out/play/<slug>/twa-manifest.json   Bubblewrap input

   And once, for the whole origin:

     apps/.well-known/assetlinks.json    Digital Asset Links, all 23 statements

   ── Two things here are load-bearing and easy to get wrong ────────────────

   1. MASKABLE IS NOT THE SAME ICON. Android masks an adaptive icon to a
      circle, a squircle or a teardrop depending on the launcher, and it does
      it to a FULL-BLEED image. Shipping the rounded-corner tile as maskable
      gets the corners shaved and the glyph cropped. So the maskable variant
      paints the tile colour edge to edge and scales the whole drawing to 72%
      about the centre, which keeps every glyph inside the 80%-diameter safe
      circle. The inner rounded tile becomes invisible because it is already
      exactly --accent-deep, the same colour now behind it.

   2. DIGITAL ASSET LINKS MUST ACTUALLY BE SERVED. All 23 apps share one
      origin, so one /.well-known/assetlinks.json carries a statement per app.
      firebase.json carries a dotfile ignore glob, which silently swallows any
      dotted directory — the file would deploy to nothing and every TWA would
      fall back to a Chrome address bar with no error anywhere. --check asserts
      the hosting config actually serves it.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS, VOICES, TEXTURES, TEXTURE_SUPPORT, FONT_FILES } from './skins.mjs';
import { oklch, oklchA, contrast } from './color.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const APPS = join(ROOT, 'apps');
const OUT = join(HERE, 'out', 'play');

const palette = JSON.parse(readFileSync(join(HERE, 'out', 'palette.json'), 'utf8'));

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const only = argv.filter((a) => !a.startsWith('--'));
const check = flags.has('--check');
const iconsOnly = flags.has('--icons');

const slugs = Object.keys(SKINS).filter((s) => !only.length || only.includes(s));

/* The origin every app is served from, and the Android package prefix. Both
   are single points of truth — changing the domain must not mean editing 23
   files. */
export const ORIGIN = 'https://sws-apps-9646d.web.app';
export const PKG_PREFIX = 'app.skywolfstudios';

/* Play Console category per app. Play requires exactly one, and it decides
   which charts the app can ever appear in, so it is a positioning decision
   rather than a formality. */
const CATEGORY = {
  'baby-log': 'PARENTING',
  'bill-splitter': 'FINANCE',
  'bracket-maker': 'SPORTS',
  'caregiver-log': 'MEDICAL',
  'grocery-list': 'SHOPPING',
  'home-inventory': 'HOUSE_AND_HOME',
  'image-compressor': 'TOOLS',
  'moving-boxes': 'HOUSE_AND_HOME',
  'packing-list': 'TRAVEL_AND_LOCAL',
  'pdf-tools': 'PRODUCTIVITY',
  'pill-schedule': 'MEDICAL',
  'qr-maker': 'TOOLS',
  'scan-to-pdf': 'PRODUCTIVITY',
  'seating-chart': 'EVENTS',
  'secret-santa': 'ENTERTAINMENT',
  'signature-maker': 'PRODUCTIVITY',
  'signup-sheets': 'PRODUCTIVITY',
  'sitter-sheet': 'PARENTING',
  'specials-planner': 'BUSINESS',
  'sub-plans': 'EDUCATION',
  'team-parent': 'SPORTS',
  'wedding-timeline': 'EVENTS',
  'wheel-picker': 'ENTERTAINMENT',
};

/* The web manifest "categories" member is a different vocabulary from the Play
   Console one above — lowercase, from the W3C registry. */
const WEB_CATEGORIES = {
  'baby-log': ['lifestyle', 'health'],
  'bill-splitter': ['finance', 'utilities'],
  'bracket-maker': ['sports', 'utilities'],
  'caregiver-log': ['health', 'medical'],
  'grocery-list': ['shopping', 'food'],
  'home-inventory': ['utilities', 'lifestyle'],
  'image-compressor': ['utilities', 'photo'],
  'moving-boxes': ['utilities', 'lifestyle'],
  'packing-list': ['travel', 'utilities'],
  'pdf-tools': ['productivity', 'utilities'],
  'pill-schedule': ['health', 'medical'],
  'qr-maker': ['utilities', 'productivity'],
  'scan-to-pdf': ['productivity', 'utilities'],
  'seating-chart': ['productivity', 'lifestyle'],
  'secret-santa': ['entertainment', 'social'],
  'signature-maker': ['productivity', 'business'],
  'signup-sheets': ['productivity', 'social'],
  'sitter-sheet': ['lifestyle', 'health'],
  'specials-planner': ['business', 'food'],
  'sub-plans': ['education', 'productivity'],
  'team-parent': ['sports', 'social'],
  'wedding-timeline': ['lifestyle', 'events'],
  'wheel-picker': ['entertainment', 'utilities'],
};

const problems = [];
const fail = (slug, msg) => problems.push(`${String(slug).padEnd(18)} ${msg}`);

/* ── Icons ───────────────────────────────────────────────────────────────── */

/* Every icon.svg is a 64-unit square: a full-bleed rounded rect in
   --accent-deep, then the glyph. For the maskable variant we want the same
   drawing, smaller, on a square of the identical colour. Scaling the whole
   SVG (tile included) is what makes that trivial — the tile's rounded corners
   disappear into a background that is already its own colour. */
const MASKABLE_SCALE = 0.72;

function maskableSvg(slug, svg) {
  const bg = palette[slug].accentDeep;
  const inner = svg
    .replace(/^[\s\S]*?<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  const t = (1 - MASKABLE_SCALE) * 32; // re-centre after scaling about the origin
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${bg}"/>
  <g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${MASKABLE_SCALE})">${inner}</g>
</svg>`;
}

/* Play's listing icon spec is 512x512 32-bit PNG *with* alpha, so transparency
   is allowed here — but Play paints its own rounding and shadow underneath, and
   a transparent corner over that reads as a chipped tile. Same drawing, opaque.
   (The feature graphic and screenshots are the ones where alpha is forbidden.) */
function opaqueSvg(slug, svg) {
  const bg = palette[slug].accentDeep;
  const inner = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${bg}"/>${inner}
</svg>`;
}

async function renderIcons() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch();
  let written = 0;

  const shoot = async (svg, size, out, opaque) => {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}` +
        `svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: out, omitBackground: !opaque });
    await page.close();
    written++;
  };

  for (const slug of slugs) {
    const svgPath = join(APPS, slug, 'icon.svg');
    if (!existsSync(svgPath)) { fail(slug, 'no icon.svg'); continue; }
    const svg = readFileSync(svgPath, 'utf8');

    mkdirSync(join(OUT, slug), { recursive: true });

    /* purpose "any" — the drawing as designed, rounded corners intact */
    await shoot(svg, 192, join(APPS, slug, 'icon-192.png'), false);
    await shoot(svg, 512, join(APPS, slug, 'icon-512.png'), false);

    /* purpose "maskable" — full bleed, glyph inside the safe circle */
    await shoot(maskableSvg(slug, svg), 512, join(APPS, slug, 'icon-maskable-512.png'), true);

    /* Play Console listing icon — 512x512, opaque */
    await shoot(opaqueSvg(slug, svg), 512, join(OUT, slug, 'play-icon-512.png'), true);

    /* iOS home screen, unchanged in size but regenerated so it never drifts */
    await shoot(svg, 180, join(APPS, slug, 'apple-touch-icon.png'), false);
  }

  await browser.close();
  return written;
}

/* ── Feature graphics ────────────────────────────────────────────────────── */

/* 1024x500, one per listing, and the most-seen studio surface after the icon.
   The brief it has to satisfy is the same contradiction the whole design system
   answers: 23 of these sat next to each other must read as one studio, and each
   one alone must read as its own product.

   So the LAYOUT is invariant — identical grid, identical icon size and
   position, identical type hierarchy, identical studio line — and everything
   the skin already varies is allowed to vary here too: hue, chroma, paper
   warmth, the display face, and the background texture. It is the same trade
   the apps make, applied to a marketing asset, which is why they end up
   looking related without anyone having to art-direct 23 files.

   Play crops this asset on some surfaces and paints UI over it on others, so
   nothing that has to survive lives in the outer 6%. */

const PROMISE = {
  'baby-log': 'Feeds, naps and diapers — one thumb, in the dark',
  'bill-splitter': 'Split a bill fairly, down to the last cent',
  'bracket-maker': 'A tournament bracket that prints properly',
  'caregiver-log': 'One shared log every caregiver can read',
  'grocery-list': 'A shared list that works in the aisle',
  'home-inventory': 'Room-by-room proof, for the day you need it',
  'image-compressor': 'Smaller images, without uploading them',
  'moving-boxes': 'Number the box, find it again in the new house',
  'packing-list': 'Pack once, forget nothing',
  'pdf-tools': 'Merge, split and rotate — nothing uploaded',
  'pill-schedule': 'A large-print medication card for the fridge',
  'qr-maker': 'QR codes that never expire',
  'scan-to-pdf': 'Phone photos into a straight, sharp PDF',
  'seating-chart': 'Seat the room, print the plan',
  'secret-santa': 'Draw names without anyone seeing the hat',
  'signature-maker': 'A clean signature you own the file of',
  'signup-sheets': 'A signup sheet with no accounts to chase',
  'sitter-sheet': 'Everything the sitter needs, on one page',
  'specials-planner': 'A term of specials lessons, planned once',
  'sub-plans': 'A substitute binder that writes itself',
  'team-parent': 'Snack rota and rides, settled in one link',
  'wedding-timeline': 'The whole day on one printed page',
  'wheel-picker': 'Spin to decide, and prove it was fair',
};

function fontFace(voice) {
  const key = VOICES[voice]?.font;
  if (!key) return '';
  const file = FONT_FILES[key]?.file;
  if (!file || !existsSync(join(HERE, 'fonts', file))) return '';
  const b64 = readFileSync(join(HERE, 'fonts', file)).toString('base64');
  return `@font-face{font-family:"${FONT_FILES[key].family}";` +
    `src:url(data:font/woff2;base64,${b64}) format("woff2");` +
    `font-weight:${FONT_FILES[key].weights};font-display:block}`;
}

function featureGraphicHtml(slug) {
  const skin = SKINS[slug];
  const pal = palette[slug];
  const voice = VOICES[skin.voice];
  const mf = JSON.parse(readFileSync(join(APPS, slug, 'manifest.webmanifest'), 'utf8'));
  const icon = readFileSync(join(APPS, slug, 'icon.svg'), 'utf8');

  const kind = skin.texture ?? 'none';
  const image = TEXTURES[kind]({
    dark: false,
    a: kind === 'band' || kind === 'rule'
      ? pal.accentDeep
      : oklchA(0.60, skin.chroma, skin.hue, 0.07),
    b: oklchA(0.60, skin.chroma * 0.8, skin.support ?? (skin.hue + 150) % 360, 0.06),
    rule: oklchA(0.42, skin.chroma * 0.5, skin.hue, 0.055),
  });

  /* The apps paint texture on a full page; here it has to read across 1024x500,
     so the graph-paper grid gets a larger cell and the top band is thicker. */
  const support = (TEXTURE_SUPPORT[kind] ?? '')
    .replace('background-size:26px 26px', 'background-size:34px 34px')
    .replace('background-size:100% 4px', 'background-size:100% 8px')
    .replace('background-size:100% 2px', 'background-size:100% 6px');

  const name = mf.short_name && mf.name.length > 22 ? mf.name.split(/[—-]/)[0].trim() : mf.name;
  const promise = PROMISE[slug] ?? mf.description ?? '';

  /* The promise line is the only body text on the asset, so it gets solved
     against the canvas the same way --ink-2 is in the apps rather than picked.
     Walk it darker until it clears 4.6:1 — a feature graphic that looks fine on
     a monitor and turns to mush on a phone in daylight is the usual failure. */
  let ink2 = oklch(0.42, skin.chroma * 0.6, skin.hue);
  for (let L = 0.42; L > 0.16 && contrast(ink2, pal.canvas) < 4.6; L -= 0.02) {
    ink2 = oklch(L, skin.chroma * 0.6, skin.hue);
  }

  return `<!doctype html><meta charset="utf-8"><style>
${fontFace(skin.voice)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1024px;height:500px}
body{
  background-color:${pal.canvas};
  background-image:${image};
  ${support}
  color:${pal.accentDeep};
  /* Centred, not left-aligned. Play crops this asset toward the middle on
     several surfaces, so a composition weighted to one side loses its icon. */
  display:flex; align-items:center; justify-content:center; gap:56px;
  padding:0 76px 34px;
  font-family:${VOICES.plain.display};
  -webkit-font-smoothing:antialiased;
}
.mark{width:188px;height:188px;flex:none;border-radius:42px;overflow:hidden;
  box-shadow:0 18px 40px ${oklchA(0.30, skin.chroma * 0.6, skin.hue, 0.22)},
             0 2px 6px ${oklchA(0.30, skin.chroma * 0.6, skin.hue, 0.14)}}
.mark svg{display:block;width:188px;height:188px}
.copy{min-width:0}
h1{
  font-family:${voice.display};
  font-weight:${voice.weight};
  letter-spacing:${voice.tracking};
  font-size:${name.length > 16 ? 62 : 72}px;
  line-height:1.02;
  color:${pal.accentDeep};
}
p{
  margin-top:18px;
  font-size:30px; line-height:1.28; font-weight:450;
  color:${ink2};
  max-width:19ch;
}
.studio{
  position:absolute; left:0; right:0; bottom:34px;
  text-align:center;
  font-size:19px; font-weight:600; letter-spacing:0.02em;
  color:${pal.accentDeep}; opacity:.62;
}
</style>
<div class="mark">${icon}</div>
<div class="copy"><h1>${name}</h1><p>${promise}</p></div>
<div class="studio">Sky Wolf Studios · free, no ads, no account</div>`;
}

/* ── The web manifest ────────────────────────────────────────────────────── */

/* Bubblewrap reads the live manifest and refuses to build without a 512x512
   icon; Play's own PWA quality bar wants a maskable one as well. Everything
   added here is additive — an existing hand-written description or name is
   never overwritten. */
function upgradeManifest(slug) {
  const p = join(APPS, slug, 'manifest.webmanifest');
  if (!existsSync(p)) { fail(slug, 'no manifest.webmanifest'); return false; }

  let mf;
  try { mf = JSON.parse(readFileSync(p, 'utf8')); }
  catch { fail(slug, 'manifest is not valid JSON'); return false; }

  const before = JSON.stringify(mf);

  mf.id ??= `/${slug}/`;
  mf.lang ??= 'en';
  mf.dir ??= 'ltr';
  mf.orientation ??= 'portrait-primary';
  mf.categories ??= WEB_CATEGORIES[slug] ?? ['utilities'];

  /* short_name drives the launcher label. Android truncates past ~12
     characters, so anything longer is a silently broken home screen. */
  if (mf.short_name && mf.short_name.length > 12) {
    fail(slug, `short_name "${mf.short_name}" is ${mf.short_name.length} chars; Android truncates past 12`);
  }

  const keep = (mf.icons ?? []).filter((i) => i.src === 'icon.svg');
  mf.icons = [
    ...keep,
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
  ];

  if (JSON.stringify(mf) === before) return false;
  writeFileSync(p, JSON.stringify(mf, null, 2) + '\n');
  return true;
}

/* ── Bubblewrap input ────────────────────────────────────────────────────── */

function twaManifest(slug) {
  const mf = JSON.parse(readFileSync(join(APPS, slug, 'manifest.webmanifest'), 'utf8'));
  const pal = palette[slug];
  return {
    packageId: `${PKG_PREFIX}.${slug.replace(/-/g, '')}`,
    host: ORIGIN.replace(/^https:\/\//, ''),
    name: mf.name,
    launcherName: mf.short_name ?? mf.name,
    display: 'standalone',
    themeColor: mf.theme_color ?? pal.accentDeep,
    themeColorDark: pal.darkCanvas,
    navigationColor: mf.theme_color ?? pal.accentDeep,
    backgroundColor: mf.background_color ?? pal.canvas,
    enableNotifications: false,
    startUrl: `/${slug}/`,
    iconUrl: `${ORIGIN}/${slug}/icon-512.png`,
    maskableIconUrl: `${ORIGIN}/${slug}/icon-maskable-512.png`,
    splashScreenFadeOutDuration: 300,
    signingKey: { path: './android.keystore', alias: 'android' },
    appVersionName: '1.0.0',
    appVersionCode: 1,
    shortcuts: [],
    generatorApp: 'sws-play.mjs',
    webManifestUrl: `${ORIGIN}/${slug}/manifest.webmanifest`,
    fallbackType: 'customtabs',
    features: {},
    alphaDependencies: { enabled: false },
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    isMetaQuest: false,
    fullScopeUrl: `${ORIGIN}/${slug}/`,
    minSdkVersion: 21,
    orientation: 'portrait',
    playCategory: CATEGORY[slug] ?? 'TOOLS',
  };
}

/* ── Digital Asset Links ─────────────────────────────────────────────────── */

/* One origin, 23 apps, one file. Each statement needs the release signing
   fingerprint from Play App Signing, which does not exist until the first
   upload — so the file is generated with a placeholder and --check refuses to
   call the portfolio ready while any placeholder survives. */
const FINGERPRINT_FILE = join(HERE, 'play-fingerprints.json');

function assetlinks() {
  const prints = existsSync(FINGERPRINT_FILE)
    ? JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8'))
    : {};

  const statements = Object.keys(SKINS).map((slug) => {
    const pkg = `${PKG_PREFIX}.${slug.replace(/-/g, '')}`;
    return {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: pkg,
        sha256_cert_fingerprints: prints[slug] ? [prints[slug]] : ['REPLACE_WITH_PLAY_APP_SIGNING_SHA256'],
      },
    };
  });

  const dir = join(APPS, '.well-known');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'assetlinks.json'), JSON.stringify(statements, null, 2) + '\n');

  const missing = Object.keys(SKINS).filter((s) => !prints[s]);
  return { count: statements.length, missing };
}

/* Digital Asset Links only works if the file is actually served. Two ways it
   silently is not: the dotfile ignore glob, and the wrong content type. */
function hostingServesAssetlinks() {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));
  const ignore = cfg.hosting?.ignore ?? [];
  const swallowed = ignore.includes('**/.*') && !ignore.some((g) => g.includes('!'));
  const typed = (cfg.hosting?.headers ?? []).some(
    (h) => String(h.source).includes('assetlinks') &&
      h.headers.some((x) => x.key.toLowerCase() === 'content-type' && x.value.includes('application/json')),
  );
  return { swallowed, typed };
}

async function renderGraphics() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch();
  let n = 0;
  for (const slug of slugs) {
    if (!existsSync(join(APPS, slug, 'icon.svg'))) { fail(slug, 'no icon.svg'); continue; }
    mkdirSync(join(OUT, slug), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await page.setContent(featureGraphicHtml(slug), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, slug, 'feature-graphic-1024x500.png') });
    await page.close();
    n++;
  }
  await browser.close();
  return n;
}

/* ── Run ─────────────────────────────────────────────────────────────────── */

if (check) {
  for (const slug of slugs) {
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      if (!existsSync(join(APPS, slug, f))) fail(slug, `missing ${f}`);
    }
    const p = join(APPS, slug, 'manifest.webmanifest');
    if (existsSync(p)) {
      const mf = JSON.parse(readFileSync(p, 'utf8'));
      if (!(mf.icons ?? []).some((i) => i.sizes === '512x512' && i.purpose === 'maskable')) {
        fail(slug, 'manifest declares no maskable 512x512 icon — Bubblewrap will warn, launcher will crop');
      }
      if (!(mf.icons ?? []).some((i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('any'))) {
        fail(slug, 'manifest declares no 512x512 "any" icon — Bubblewrap refuses to build');
      }
      if (!mf.id) fail(slug, 'manifest has no id');
    }
    if (!existsSync(join(APPS, slug, 'privacy.html'))) {
      fail(slug, 'no privacy.html — Play requires a reachable privacy policy URL');
    } else if (!/href="\.?\/?privacy\.html"/.test(readFileSync(join(APPS, slug, 'index.html'), 'utf8'))) {
      /* The Console listing field is only half of it: Play requires the policy
         to be reachable from inside the app too, and in a TWA the app IS this
         page. Easy to satisfy and easy to forget. */
      fail(slug, 'privacy.html exists but index.html never links to it — Play requires an in-app link');
    }
  }

  const al = join(APPS, '.well-known', 'assetlinks.json');
  if (!existsSync(al)) fail('origin', 'no .well-known/assetlinks.json');
  else {
    const txt = readFileSync(al, 'utf8');
    if (txt.includes('REPLACE_WITH_PLAY_APP_SIGNING_SHA256')) {
      const n = (txt.match(/REPLACE_WITH_PLAY_APP_SIGNING_SHA256/g) || []).length;
      fail('origin', `${n} assetlinks statement(s) still hold a placeholder fingerprint`);
    }
  }

  const h = hostingServesAssetlinks();
  if (h.swallowed) fail('origin', 'firebase.json ignores "**/.*" — .well-known/assetlinks.json will NOT deploy');
  if (!h.typed) fail('origin', 'no application/json Content-Type header for assetlinks.json');

  if (problems.length) {
    console.log(`\nPlay readiness — ${problems.length} gap(s)\n`);
    for (const p of problems) console.log('  ' + p);
    console.log('');
    process.exit(1);
  }
  console.log(`\nPlay readiness — ${slugs.length} app(s) ready\n`);
  process.exit(0);
}

console.log(`Generating Play packaging for ${slugs.length} app(s)…\n`);

if (flags.has('--graphics')) {
  const g = await renderGraphics();
  console.log(`  ${g} feature graphic(s) rendered to design/out/play/<slug>/`);
  if (problems.length) for (const p of problems) console.log('  ' + p);
  process.exit(0);
}

const written = await renderIcons();
console.log(`  ${written} icon PNG(s) rendered`);

if (!iconsOnly) {
  const g = await renderGraphics();
  console.log(`  ${g} feature graphic(s) rendered`);
  let bumped = 0;
  for (const slug of slugs) if (upgradeManifest(slug)) bumped++;
  console.log(`  ${bumped} manifest(s) upgraded`);

  for (const slug of slugs) {
    mkdirSync(join(OUT, slug), { recursive: true });
    writeFileSync(join(OUT, slug, 'twa-manifest.json'), JSON.stringify(twaManifest(slug), null, 2) + '\n');
  }
  console.log(`  ${slugs.length} twa-manifest.json written to design/out/play/`);

  const al = assetlinks();
  console.log(`  .well-known/assetlinks.json — ${al.count} statements, ${al.missing.length} awaiting a real fingerprint`);

  const h = hostingServesAssetlinks();
  if (h.swallowed) {
    console.log('\n  !! firebase.json ignores "**/.*" — assetlinks.json will not deploy.');
    console.log('     Every TWA would fall back to a browser address bar, with no error to find.');
  }
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ' + p);
}
console.log('\nNext: node design/play.mjs --check');
