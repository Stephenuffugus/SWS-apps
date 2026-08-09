/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — app driving harness

   Serves apps/ over HTTP and hands you a live page, so a test can do the thing
   a user would rather than reason about the source. Everything that drives a
   real browser in this repo should go through here.

   Serving over HTTP is not optional: every app loads its logic as an ES
   module, and module scripts are blocked under the file: scheme.

     import { withApp } from './harness.mjs';

     await withApp('qr-maker', async ({ page, errors, overflow }) => {
       await page.fill('#text', 'x'.repeat(5000));
       console.log('overflow:', await overflow());
       console.log('errors:', errors);
     });

   Options: { scheme:'light'|'dark', width, height, prefs:{...}, slowMo }
   `prefs` is written to localStorage before the app loads, so a run can start
   already at Largest text or in high contrast.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'apps');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** Start a static server over apps/. Returns { port, url(slug), close() }. */
export async function serveApps() {
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
  return {
    port,
    url: (slug) => `http://127.0.0.1:${port}/${slug}/`,
    close: () => server.close(),
  };
}

/**
 * Open one app and hand it to `fn`.
 *
 * `errors` accumulates page errors and console errors for the whole run — read
 * it at the END of your callback, not the start. In these apps a console error
 * is a real defect, not noise.
 */
export async function withApp(slug, fn, opts = {}) {
  const {
    scheme = 'light', width = 414, height = 900, prefs = null,
    slowMo = 0, deviceScaleFactor = 1,
  } = opts;

  const site = await serveApps();
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ slowMo });
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width, height },
    deviceScaleFactor,
  });

  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url().slice(0, 120)}`));

  try {
    if (prefs) {
      // Seed the origin before the app's first load, so the run starts in the
      // requested comfort state instead of switching into it mid-flight.
      await page.goto(site.url(slug), { waitUntil: 'domcontentloaded' });
      await page.evaluate((p) => localStorage.setItem('sws.prefs', JSON.stringify(p)), prefs);
    }
    await page.goto(site.url(slug), { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);

    /** Pixels the page scrolls sideways. Anything over ~2 is a layout defect. */
    const overflow = () => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);

    /** Every element sticking out past the viewport, for diagnosing overflow. */
    const offenders = () => page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > vw + 1 || r.left < -1) {
          out.push({
            sel: el.tagName.toLowerCase() +
              (el.id ? `#${el.id}` : '') +
              (typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''),
            left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
            text: (el.textContent || '').trim().slice(0, 40),
          });
        }
      });
      return out.slice(0, 20);
    });

    /** Interactive elements whose hit area is under the 44px comfort floor. */
    const smallTargets = () => page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a,button,input,select,textarea,[role=button],[tabindex]').forEach((el) => {
        if (el.disabled) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        if (r.height < 44 || r.width < 24) {
          out.push({
            sel: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') +
              (typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ''),
            w: Math.round(r.width), h: Math.round(r.height),
            label: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 30),
          });
        }
      });
      return out.slice(0, 25);
    });

    /** Run axe against the current DOM state, whatever it has become. */
    const axe = async () => {
      const src = await readFile(join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
      if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: src });
      return page.evaluate(async () => {
        const r = await window.axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        });
        return r.violations.map((v) => ({
          id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
          sample: v.nodes[0]?.html?.slice(0, 120),
        }));
      });
    };

    /** Everything localStorage holds for this origin, and how big it is. */
    const storage = () => page.evaluate(() => {
      const out = {};
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        bytes += k.length + v.length;
        out[k] = v.length > 200 ? `${v.slice(0, 200)}… (${v.length} chars)` : v;
      }
      return { keys: out, bytes };
    });

    const shot = (name) =>
      page.screenshot({ path: join(HERE, 'out', `drive-${slug}-${name}.png`), fullPage: true });

    return await fn({ page, ctx, browser, errors, url: site.url(slug), overflow, offenders, smallTargets, axe, storage, shot });
  } finally {
    await browser.close();
    site.close();
  }
}
