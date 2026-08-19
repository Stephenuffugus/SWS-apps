#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, before / after report

   Builds one self-contained page showing every app before and after, in both
   themes, next to the palette it was given and why.

     node design/report.mjs      → design/out/report.html

   The page is written artifact-ready (a <title>, a <style> and content, with
   no document scaffolding) so it can be published as-is, and it still opens
   fine as a local file.

   Screenshots are downscaled and re-encoded to JPEG inside the browser before
   being embedded as data URIs, 92 full-page PNGs at 2x would be hundreds of
   megabytes; this lands around three.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const palette = JSON.parse(readFileSync(join(OUT, 'palette.json'), 'utf8'));

const WIDTH = 360;
const QUALITY = 0.6;
const MAX_H = 1450;

const title = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/* Fraunces is the studio's own display face and is already self-hosted in the
   repo. Inlining it keeps the page standalone, an artifact cannot reach a
   font CDN, and a silent fallback would undercut a page about typography. */
const fraunces = readFileSync(join(HERE, 'fonts', 'fraunces-latin.woff2')).toString('base64');

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const page = await browser.newPage();

async function encode(path){
  if (!existsSync(path)) return null;
  const b64 = readFileSync(path).toString('base64');
  return page.evaluate(async ({ b64, WIDTH, QUALITY, MAX_H }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const scale = WIDTH / img.width;
    const h = Math.min(Math.round(img.height * scale), MAX_H);
    const c = document.createElement('canvas');
    c.width = WIDTH; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WIDTH, h);
    ctx.drawImage(img, 0, 0, img.width, Math.round(h / scale), 0, 0, WIDTH, h);
    return c.toDataURL('image/jpeg', QUALITY);
  }, { b64, WIDTH, QUALITY, MAX_H });
}

const rows = [];
for (const [slug, skin] of Object.entries(SKINS)){
  rows.push({
    slug, skin, p: palette[slug],
    before: await encode(join(OUT, 'apps-before', `${slug}-light.png`)),
    light:  await encode(join(OUT, 'apps-after',  `${slug}-light.png`)),
    dark:   await encode(join(OUT, 'apps-after',  `${slug}-dark.png`)),
  });
  process.stdout.write(`  ${slug}\n`);
}
await browser.close();

/* ── The swatch band: 23 accents in a row. This is the thesis of the whole
      project, so it opens the page. ─────────────────────────────────────── */
const band = rows.map(({ slug, p }) =>
  `<a class="chip" href="#${slug}" style="--c:${p.accentDeep};--c2:${p.darkAccent}"><span></span>${title(slug)}</a>`
).join('');

const shot = (label, src, alt) => src
  ? `<figure><figcaption>${label}</figcaption><img src="${src}" alt="${alt}" loading="lazy"></figure>`
  : `<figure><figcaption>${label}</figcaption><div class="gap">not captured</div></figure>`;

const appRow = ({ slug, skin, p, before, light, dark }) => `
<article class="app" id="${slug}" style="--c:${p.accentDeep};--c2:${p.darkAccent}">
  <div class="id">
    <h3>${title(slug)}</h3>
    <p class="note">${skin.note}</p>
    <dl>
      <div><dt>Voice</dt><dd>${skin.voice}</dd></div>
      <div><dt>Paper</dt><dd>${skin.paper}</dd></div>
      <div><dt>Texture</dt><dd>${skin.texture}</dd></div>
      <div><dt>Hue</dt><dd class="num">${skin.hue}° / ${skin.chroma}</dd></div>
      <div><dt>Radius</dt><dd class="num">${skin.r}px</dd></div>
    </dl>
    <div class="ramp">
      ${['canvas', 'accent', 'accentDeep', 'accentFill', 'darkAccent']
        .map((k) => `<span style="background:${p[k]}" title="${k} ${p[k]}"></span>`).join('')}
    </div>
  </div>
  <div class="shots">
    ${shot('Before', before, `${title(slug)} before`)}
    ${shot('After, light', light, `${title(slug)} after, light theme`)}
    ${shot('After, dark', dark, `${title(slug)} after, dark theme`)}
  </div>
</article>`;

const html = `<title>Sky Wolf Studio: 23 apps, one design system</title>
<style>
@font-face{
  font-family:'Fraunces';font-style:normal;font-weight:500 700;font-display:swap;
  src:url(data:font/woff2;base64,${fraunces}) format('woff2');
}

/* Light is the base set; the dark blocks only redefine tokens, so every
   component below is styled purely through them. */
:root{
  --ground:#f6f4ef;
  --surface:#fffefb;
  --sunken:#efece4;
  --line:#e0dbd0;
  --line-2:#c6bfb0;
  --ink:#231f1a;
  --ink-2:#5f594f;
  --ink-3:#8b8478;
  --brand:#7a5c1e;
  --accent:#0f7d8c;
  --shadow:0 1px 2px rgba(35,31,26,.05), 0 12px 28px -18px rgba(35,31,26,.30);
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --serif:'Fraunces',Georgia,serif;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#14151a;
    --surface:#1c1e26;
    --sunken:#101116;
    --line:#2b2e3a;
    --line-2:#454a5c;
    --ink:#eceef4;
    --ink-2:#a2a8bb;
    --ink-3:#787f93;
    --brand:#f2e3c1;
    --accent:#4fd1e0;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 14px 32px -18px rgba(0,0,0,.75);
  }
}
:root[data-theme="dark"]{
  --ground:#14151a;
  --surface:#1c1e26;
  --sunken:#101116;
  --line:#2b2e3a;
  --line-2:#454a5c;
  --ink:#eceef4;
  --ink-2:#a2a8bb;
  --ink-3:#787f93;
  --brand:#f2e3c1;
  --accent:#4fd1e0;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 14px 32px -18px rgba(0,0,0,.75);
}

*,*::before,*::after{box-sizing:border-box}
body{
  margin:0;
  background:var(--ground);
  color:var(--ink);
  font:16px/1.6 var(--sans);
  -webkit-font-smoothing:antialiased;
  padding:0 0 96px;
}
.wrap{max-width:78rem;margin-inline:auto;padding-inline:clamp(20px,4vw,40px)}

/* ── masthead ─────────────────────────────────────────────────────────── */
.top{padding:clamp(48px,8vw,96px) 0 40px;border-bottom:1px solid var(--line)}
h1{
  font-family:var(--serif);font-weight:600;
  font-size:clamp(2.1rem,5.5vw,3.6rem);line-height:1.02;letter-spacing:-.025em;
  margin:0 0 20px;color:var(--brand);text-wrap:balance;max-width:16ch;
}
.lede{font-size:clamp(1.0625rem,1.6vw,1.1875rem);color:var(--ink-2);max-width:64ch;margin:0 0 12px}
.lede b{color:var(--ink);font-weight:600}
.lede + .lede{margin-top:0}

/* ── the swatch band: the thesis, stated in colour ────────────────────── */
.band{
  display:flex;flex-wrap:wrap;gap:6px;margin:36px 0 0;padding:0;list-style:none;
}
.chip{
  display:inline-flex;align-items:center;gap:8px;
  padding:6px 12px 6px 8px;
  font-size:.8125rem;font-weight:550;color:var(--ink-2);text-decoration:none;
  background:var(--surface);border:1px solid var(--line);border-radius:999px;
  transition:color .12s,border-color .12s;
}
.chip span{width:14px;height:14px;border-radius:4px;background:var(--c);flex:none}
.chip:hover{color:var(--ink);border-color:var(--line-2)}
.chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .chip span{background:var(--c2)}
}
:root[data-theme="dark"] .chip span{background:var(--c2)}

/* ── how it works ─────────────────────────────────────────────────────── */
.how{display:grid;gap:28px;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));
  padding:44px 0;border-bottom:1px solid var(--line)}
.how h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;
  color:var(--ink-3);margin:0 0 10px;font-weight:700}
.how p{margin:0;color:var(--ink-2);font-size:.9375rem}
.how p b{color:var(--ink);font-weight:600}

/* ── per-app row ──────────────────────────────────────────────────────── */
.app{
  display:grid;gap:28px;grid-template-columns:minmax(13rem,17rem) 1fr;
  padding:40px 0;border-bottom:1px solid var(--line);scroll-margin-top:24px;
}
.app h3{
  font-family:var(--serif);font-weight:600;font-size:1.375rem;letter-spacing:-.015em;
  margin:0 0 8px;color:var(--ink);
}
.app h3::before{
  content:'';display:inline-block;width:10px;height:10px;border-radius:3px;
  background:var(--c);margin-right:10px;vertical-align:baseline;
}
.note{color:var(--ink-2);font-size:.9375rem;margin:0 0 18px;max-width:44ch}
dl{margin:0 0 18px;display:grid;gap:2px 14px;grid-template-columns:auto 1fr;font-size:.8125rem}
dl > div{display:contents}
dt{color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;font-size:.6875rem;
  align-self:center}
dd{margin:0;color:var(--ink-2)}
.num{font-variant-numeric:tabular-nums}
.ramp{display:flex;gap:4px}
.ramp span{width:36px;height:22px;border-radius:5px;border:1px solid var(--line)}

.shots{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
figure{margin:0;min-width:0}
figcaption{font-size:.6875rem;text-transform:uppercase;letter-spacing:.09em;
  color:var(--ink-3);margin-bottom:8px}
img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:8px;
  box-shadow:var(--shadow);background:var(--surface)}
.gap{color:var(--ink-3);font-size:.8125rem;padding:28px;text-align:center;
  border:1px dashed var(--line-2);border-radius:8px}

@media (max-width:56rem){ .app{grid-template-columns:1fr;gap:20px} }
@media (prefers-reduced-motion:reduce){ *{transition:none!important} }
</style>

<div class="wrap">
  <header class="top">
    <h1>One studio, twenty&#8209;three products</h1>
    <p class="lede">Every app shares the same skeleton, spacing scale, type scale, component
      shapes, focus behaviour, motion timing, print rules. What changes per app is <b>hue</b>,
      <b>chroma</b>, <b>paper warmth</b> (cream stationery or tinted glass), the <b>display face</b>,
      and one <b>background texture</b>.</p>
    <p class="lede">Colour is specified in OKLCH and compiled to hex, so a yellow and a blue at the
      same lightness actually look the same weight. Every text, control-boundary, focus and
      semantic colour is solved against a WCAG target rather than chosen by eye, <b>1542 of 1542 contrast checks pass</b>, and a palette that would ship unreadable fails
      the build.</p>
    <nav class="band" aria-label="Jump to an app">${band}</nav>
  </header>

  <section class="how">
    <div>
      <h2>Hue &amp; chroma</h2>
      <p>Twenty-three apps cannot each have their own hue, the wheel is only 360° wide. So
      saturation does as much work: <b>Caregiver Log runs at 0.035 chroma and Wheel Picker at
      0.175</b>. Two apps 15° apart at opposite ends of that range do not read as related.</p>
    </div>
    <div>
      <h2>Paper</h2>
      <p>A <b>warm</b> app gets a cream page whatever its accent hue is, so it feels like
      stationery. A <b>cool</b> one tints the page with its own hue and feels like glass. After
      hue, this is the biggest "these are different products" lever.</p>
    </div>
    <div>
      <h2>Voice</h2>
      <p>Three display faces, not twenty-three. <b>Fraunces</b> for the editorial apps,
      <b>Space Grotesk</b> for the tool-like ones, and the system stack for the four read
      one-handed in a hurry, where a neutral face is the right answer, not a cop-out.</p>
    </div>
    <div>
      <h2>Ink</h2>
      <p>Nothing is neutral grey. Each app's near-black carries a trace of its own hue, which is
      why the same layout feels different between two apps before you consciously notice the
      accent.</p>
    </div>
  </section>

${rows.map(appRow).join('\n')}
</div>
`;

writeFileSync(join(OUT, 'report.html'), html);
console.log(`\ndesign/out/report.html, ${rows.length} apps, ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB`);
