#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, screenshot the real apps

   The skin preview shows what the design system looks like in the abstract.
   This shows what the actual shipped apps look like, which is the only thing
   that matters. Run it before a change to bank a baseline, then after.

     node design/shoot-apps.mjs before
     node design/shoot-apps.mjs after
     node design/shoot-apps.mjs after qr-maker pdf-tools

   Serves apps/ over HTTP rather than file:// because every app loads its logic
   as an ES module, and module scripts are blocked under the file: scheme.

   Output: design/out/apps-<label>/<slug>-<light|dark>.png
   ═══════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'apps');
const OUT = join(HERE, 'out');

const label = process.argv[2] ?? 'shot';
const only = process.argv.slice(3);
const slugs = Object.keys(SKINS).filter((s) => !only.length || only.includes(s));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();

const dir = join(OUT, `apps-${label}`);
mkdirSync(dir, { recursive: true });

const problems = [];

for (const mode of ['light', 'dark']){
  const ctx = await browser.newContext({
    colorScheme: mode,
    viewport: { width: 414, height: 1000 },
    deviceScaleFactor: 2,
  });

  for (const slug of slugs){
    if (!existsSync(join(ROOT, slug, 'index.html'))) continue;
    const page = await ctx.newPage();

    // A console error in one of these apps is a real defect, not noise, // collect them so a restyle that breaks the JS cannot pass silently.
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    try {
      await page.goto(`http://127.0.0.1:${port}/${slug}/`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(dir, `${slug}-${mode}.png`), fullPage: true });

      /* Horizontal overflow is the single most common mobile-layout defect and
         it is invisible in a full-page screenshot, so measure it directly. */
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 2) problems.push(`${slug} (${mode}): page scrolls sideways by ${overflow}px`);
    } catch (e) {
      problems.push(`${slug} (${mode}): ${String(e).split('\n')[0]}`);
    }

    for (const e of errors) problems.push(`${slug} (${mode}) console: ${e}`);
    await page.close();
  }

  await ctx.close();
  console.log(`  shot ${mode}`);
}

await browser.close();
server.close();

console.log(`\n${slugs.length} apps → design/out/apps-${label}/`);
if (problems.length){
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
} else {
  console.log('No console errors, no horizontal overflow.');
}
