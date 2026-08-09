#!/usr/bin/env node
/* Screenshots of the comfort panel and the states it produces.
   node design/prefs-shots.mjs [slug]   → design/out/prefs/ */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'apps');
const OUT = join(HERE, 'out', 'prefs');
mkdirSync(OUT, { recursive: true });

const slug = process.argv[2] ?? 'baby-log';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();

const SHOTS = [
  { name: '1-panel-light', scheme: 'light', prefs: {}, open: true },
  { name: '2-panel-dark', scheme: 'dark', prefs: {}, open: true },
  { name: '3-default', scheme: 'light', prefs: {} },
  { name: '4-largest-roomy', scheme: 'light', prefs: { text: 'xxl', density: 'roomy' } },
  { name: '5-compact-small', scheme: 'light', prefs: { text: 's', density: 'compact' } },
  { name: '6-dark-warm-high', scheme: 'light', prefs: { theme: 'dark', warmth: '3' } },
  { name: '7-easier-reading', scheme: 'light', prefs: { reading: 'easy', text: 'l' } },
  { name: '8-high-contrast', scheme: 'light', prefs: { contrast: 'more' } },
];

for (const s of SHOTS) {
  const ctx = await browser.newContext({
    colorScheme: s.scheme, viewport: { width: 414, height: 860 }, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/${slug}/`, { waitUntil: 'load' });
  await page.evaluate((p) => localStorage.setItem('sws.prefs', JSON.stringify(p)), s.prefs);
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (s.open) {
    await page.click('#swsPrefsBtn');
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${slug}-${s.name}.png`) });
  await ctx.close();
  console.log(`  ${s.name}`);
}

await browser.close();
server.close();
console.log(`\n→ design/out/prefs/`);
