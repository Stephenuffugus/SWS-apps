/* Sub Plans ships the strictest Content-Security-Policy in the portfolio —
 * `script-src 'self'`, no unsafe-inline — and that is the point of it. This
 * test serves the app under its REAL production CSP, read out of
 * firebase.json rather than copied here, and asserts the page still works.
 *
 * It exists because it already caught one: the shared backup runtime was
 * wired by a small inline <script> per app, which this CSP silently blocked.
 * Nothing threw. The backup card rendered its heading and its paragraph and
 * simply had no buttons — the worst possible way for a backup feature to
 * fail, since it looks finished and does nothing. The config now travels on
 * data attributes and sws-backup.js wires itself.
 *
 * Run from the repo root:  node apps/sub-plans/test/csp.browser.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const APPS = join(ROOT, 'apps');

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ok:', name); }
  else { failed++; console.error('  FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};

const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));
const rule = cfg.hosting.headers.find((h) => String(h.source).includes('sub-plans'));
const CSP = rule && rule.headers.find((h) => h.key === 'Content-Security-Policy');

check('sub-plans still has a CSP in firebase.json', !!CSP);
check('that CSP still forbids inline script',
  !!CSP && /script-src 'self'(?!.*unsafe-inline)/.test(CSP.value.split(';').find(s => s.includes('script-src')) || ''),
  CSP && CSP.value.split(';').find(s => s.includes('script-src')));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

const srv = createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(APPS, p);
  if (!f.startsWith(APPS) || !existsSync(f)) { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, {
    'Content-Type': MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream',
    'Content-Security-Policy': CSP.value,
  });
  r.end(readFileSync(f));
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const port = srv.address().port;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

const violations = [];
page.on('console', (m) => {
  if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) violations.push(m.text().slice(0, 120));
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));

await page.goto(`http://127.0.0.1:${port}/sub-plans/`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

check('the binder form renders under the CSP',
  await page.evaluate(() => !!document.getElementById('f-teacher')));

check('the backup card is present',
  await page.evaluate(() => !!document.getElementById('backupCard')));

const buttons = await page.evaluate(() => {
  const h = document.getElementById('backupControls');
  return h ? [...h.querySelectorAll('button')].map(b => b.textContent.trim()) : null;
});
check('the backup controls actually wired — the regression',
  Array.isArray(buttons) && buttons.length === 2, buttons);

check('the shared runtime loaded', await page.evaluate(() => !!(window.SWS && window.SWS.backup)));

/* A real save, under the CSP, to prove the buttons are not merely present. */
const saved = await page.evaluate(() => {
  localStorage.setItem('subplans', JSON.stringify({ teacher: 'Ms. Rivera' }));
  const out = SWS.backup.serialize({ app: 'sub-plans', name: 'Sub Plans', keys: ['subplans'] });
  return { app: out.app, has: !!out.data.subplans };
});
check('a backup can be built under the CSP', saved.app === 'sub-plans' && saved.has, saved);

check('no CSP violations at all', violations.length === 0, violations.slice(0, 3));
check('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
srv.close();

console.log(`\n${passed} passing, ${failed} failing`);
if (failed) process.exit(1);
console.log('CSP PASSED');
