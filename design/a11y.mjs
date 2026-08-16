#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — accessibility audit

   Runs axe-core against every app, in both colour schemes, in a real browser.

     node design/a11y.mjs                all apps
     node design/a11y.mjs qr-maker       one app
     node design/a11y.mjs --json         machine-readable, for CI

   The build already proves the PALETTE is accessible — it solves every colour
   against a WCAG target. This proves the MARKUP is: labels, accessible names,
   heading order, landmarks, live regions, and the contrast of anything an app
   hardcoded outside the token system.

   Exits non-zero if any serious or critical violation is found.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'apps');
const AXE = readFileSync(join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const asJson = process.argv.includes('--json');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
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
    /* Read BEFORE writing the header. Writing 200 first meant a missing file
       threw into a catch that could no longer set 404, and the server died
       with ERR_HTTP_HEADERS_SENT — which stayed hidden for as long as the
       service workers answered everything from cache and never asked for a
       path that does not exist. */
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const report = [];

for (const mode of ['light', 'dark']){
  const ctx = await browser.newContext({ colorScheme: mode, viewport: { width: 414, height: 900 } });

  for (const slug of slugs){
    if (!existsSync(join(ROOT, slug, 'index.html'))) continue;
    const page = await ctx.newPage();
    try {
      await page.goto(`http://127.0.0.1:${port}/${slug}/`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: AXE });

      const scan = async () => await page.evaluate(async () => await window.axe.run(document, {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      }));

      const collect = (results, surface) => {
        for (const v of results.violations){
          report.push({
            slug: surface ? `${slug} [${surface}]` : slug,
            mode, id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.length,
            sample: v.nodes[0]?.html?.slice(0, 110) ?? '',
          });
        }
      };

      collect(await scan());

      /* The comfort panel is a whole UI surface that only exists once it has
         been opened, so a page-load scan can never see it. It ships in all 23
         apps and is the one piece of chrome specifically meant for people with
         access needs — leaving it unscanned would be the wrong thing to miss. */
      const opened = await page.evaluate(() => {
        const btn = document.getElementById('swsPrefsBtn');
        if (!btn) return false;
        btn.click();
        return !!document.getElementById('swsPrefs')?.open;
      });
      if (opened){
        await page.waitForTimeout(120);
        collect(await scan(), 'comfort panel');
        await page.evaluate(() => document.getElementById('swsPrefs')?.close());
      }
    } catch (e) {
      report.push({ slug, mode, id: 'LOAD-ERROR', impact: 'critical', help: String(e).split('\n')[0], nodes: 0, sample: '' });
    }
    await page.close();
  }
  await ctx.close();
}

await browser.close();
server.close();

if (asJson){ console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 };
report.sort((a, b) => (RANK[a.impact] ?? 9) - (RANK[b.impact] ?? 9) || a.slug.localeCompare(b.slug));

const blocking = report.filter((r) => r.impact === 'critical' || r.impact === 'serious');

/* Group by rule — the same defect usually repeats across apps because they all
   came from one template, and a per-rule view says "fix this once". */
const byRule = new Map();
for (const r of report){
  const k = `${r.impact}|${r.id}|${r.help}`;
  if (!byRule.has(k)) byRule.set(k, { ...r, apps: new Set(), total: 0 });
  const e = byRule.get(k);
  e.apps.add(r.slug);
  e.total += r.nodes;
}

console.log(`axe-core — ${slugs.length} apps × light + dark\n`);
if (!byRule.size){ console.log('  No violations.'); }
for (const e of [...byRule.values()].sort((a, b) => (RANK[a.impact] ?? 9) - (RANK[b.impact] ?? 9) || b.apps.size - a.apps.size)){
  console.log(`  ${String(e.impact).padEnd(9)} ${e.id.padEnd(28)} ${String(e.apps.size).padStart(2)} apps, ${String(e.total).padStart(3)} nodes  ${e.help}`);
  console.log(`            ${[...e.apps].sort().join(', ')}`);
}

console.log(`\n${report.length} violation instances; ${blocking.length} serious or critical`);
process.exit(blocking.length ? 1 : 0);
