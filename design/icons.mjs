#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — re-hue the app icons

   The icons were drawn against the old palette and it shows: four of them are
   the same teal, four the same purple, three the same blue. They are the most
   public surface the studio has — browser tab, phone home screen, share card,
   the hub grid — so leaving them behind would undo the restyle everywhere the
   user actually looks.

   Rather than redraw 23 icons, each colour is decomposed into OKLCH and only
   its HUE is replaced. Lightness and chroma stay exactly as drawn, so the
   artwork keeps its internal structure — a pale highlight stays a pale
   highlight — while the whole tile moves onto the app's colour.

     node design/icons.mjs           re-hue all, regenerate PNGs
     node design/icons.mjs --dry     print what would change

   Whites, near-blacks and transparents are left alone.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hexToOklch, oklch } from './color.mjs';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const palette = JSON.parse(readFileSync(join(HERE, 'out', 'palette.json'), 'utf8'));

const dry = process.argv.includes('--dry');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* PNG sizes each app ships. apple-touch-icon is the iOS home screen; thumb-256
   is what the hub and the marketing pages use. */
const PNGS = [
  ['apple-touch-icon.png', 180],
  ['marketing/thumb-256.png', 256],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

const changed = [];

for (const [slug, skin] of Object.entries(SKINS)){
  if (only.length && !only.includes(slug)) continue;
  const svgPath = join(APPS, slug, 'icon.svg');
  if (!existsSync(svgPath)){ console.log(`  !! ${slug}: no icon.svg`); continue; }

  const original = readFileSync(svgPath, 'utf8');
  const hue = skin.hue;
  const seen = new Map();

  let svg = original.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    const { L, C } = hexToOklch(hex);

    // leave the neutrals: white glyphs, near-black outlines, pure greys
    if (L > 0.955 || L < 0.09 || C < 0.012) return hex;

    // A near-achromatic app (Signature Maker, Caregiver Log) would otherwise
    // get a flat grey icon; give those a little more chroma than the skin uses
    // on screen so the tile still reads as a colour at 32px.
    const chroma = Math.max(C, skin.chroma < 0.05 ? 0.05 : 0);
    const out = oklch(L, Math.min(chroma, C * 1.05 + 0.01), hue);
    seen.set(hex, out);
    return out;
  });

  /* The first full-bleed rect is the tile. Pin it to accent-deep rather than a
     re-hued original, so the icon background matches the app's primary button
     exactly and white glyphs on it are contrast-solved by construction. */
  svg = svg.replace(
    /(<rect\b[^>]*\bwidth="(\d+)"[^>]*\bheight="\2"[^>]*\bfill=")(#[0-9a-fA-F]{6}|url\([^)]*\))(")/,
    `$1${palette[slug].accentDeep}$4`,
  );

  if (svg !== original){
    changed.push({ slug, map: [...seen.entries()] });
    if (!dry) writeFileSync(svgPath, svg);
  }
}

for (const { slug, map } of changed){
  console.log(`  ${slug.padEnd(20)} bg → ${palette[slug].accentDeep}   ${map.length} glyph tint(s) re-hued`);
}
console.log(`\n${changed.length} icons ${dry ? 'would be' : ''} re-hued`);

if (dry) process.exit(0);

/* ── Regenerate the PNGs from the updated SVGs ──────────────────────────── */
const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
let written = 0;

for (const [slug] of Object.entries(SKINS)){
  if (only.length && !only.includes(slug)) continue;
  const svgPath = join(APPS, slug, 'icon.svg');
  if (!existsSync(svgPath)) continue;
  const svg = readFileSync(svgPath, 'utf8');

  for (const [rel, size] of PNGS){
    const out = join(APPS, slug, rel);
    if (!existsSync(out)) continue;   // only regenerate what the app already ships

    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'load' });
    await page.screenshot({ path: out, omitBackground: true });
    await page.close();
    written++;
  }
}

await browser.close();
console.log(`${written} PNGs regenerated`);
