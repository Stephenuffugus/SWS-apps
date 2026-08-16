#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — document-photo fixtures for Scan to PDF

   Scan to PDF turns phone photos of paper into a straight, sharp PDF, and a
   headless browser has no camera. These are photographs-of-paper as a rendered
   scene: a sheet on a desk surface, rotated a few degrees, with a soft shadow
   and a slight warm cast — the conditions the app exists to correct for. Shot
   as JPEG because that is what a camera roll actually hands over.

     node design/fixtures/make-photos.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });

const SHEETS = [
  {
    file: 'photo-receipt-1.jpg', tilt: -3.4, shift: '-1.5%',
    head: 'PINE & PAPER HARDWARE', sub: '412 Mill Road · (555) 0143',
    rows: [['Interior latex, 1 gal', '38.99'], ['Roller frame + covers', '12.49'],
      ['Painter tape 1.5in x2', '9.98'], ['Drop cloth, canvas', '21.00'],
      ['Spackle, 8oz', '6.49']],
    total: ['Subtotal', '88.95', 'Tax', '7.56', 'TOTAL', '96.51'],
  },
  {
    file: 'photo-receipt-2.jpg', tilt: 2.6, shift: '1%',
    head: 'NORTHSIDE AUTO SERVICE', sub: 'Invoice 20261 · 12 Aug 2026',
    rows: [['Oil and filter change', '64.00'], ['Cabin air filter', '38.50'],
      ['Tyre rotation', '25.00'], ['Shop supplies', '7.25']],
    total: ['Subtotal', '134.75', 'Tax', '11.45', 'TOTAL', '146.20'],
  },
  {
    file: 'photo-receipt-3.jpg', tilt: -1.8, shift: '0.5%',
    head: 'CEDAR STREET PHARMACY', sub: 'Rx 88-40231 · 14 Aug 2026',
    rows: [['Prescription copay', '15.00'], ['Vitamin D3 1000IU', '11.99'],
      ['Bandages, assorted', '6.79']],
    total: ['Subtotal', '33.78', 'Tax', '1.44', 'TOTAL', '35.22'],
  },
];

const html = (s) => `<!doctype html><meta charset=utf-8><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:900px;height:1200px;overflow:hidden}
body{
  /* a desk, not a scanner bed — uneven light is the whole point */
  background:
    radial-gradient(120% 90% at 22% 8%, #efe7db 0%, #d9cdbb 46%, #bdae99 100%);
  display:flex; align-items:center; justify-content:center;
  font-family:"Courier New",Courier,monospace;
}
.sheet{
  width:560px; padding:44px 40px 56px;
  background:linear-gradient(178deg,#fffefb 0%,#fbf8f1 62%,#f4efe4 100%);
  transform:rotate(${s.tilt}deg) translateY(${s.shift});
  box-shadow:0 26px 48px rgba(60,44,26,.34), 0 4px 10px rgba(60,44,26,.22);
  color:#20201d;
}
h1{font-size:21px;letter-spacing:.06em;text-align:center;font-weight:700}
.sub{font-size:12.5px;text-align:center;color:#55524a;margin-top:6px;letter-spacing:.03em}
.rule{border-top:1.5px dashed #a49c8c;margin:18px 0}
.row{display:flex;justify-content:space-between;font-size:14px;padding:5px 0}
.tot{display:flex;justify-content:space-between;font-size:14px;padding:4px 0}
.grand{font-weight:700;font-size:16.5px;padding-top:8px}
.foot{text-align:center;font-size:11.5px;color:#6a665c;margin-top:26px;letter-spacing:.04em}
</style>
<div class="sheet">
  <h1>${s.head}</h1>
  <div class="sub">${s.sub}</div>
  <div class="rule"></div>
  ${s.rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('')}
  <div class="rule"></div>
  <div class="tot"><span>${s.total[0]}</span><span>${s.total[1]}</span></div>
  <div class="tot"><span>${s.total[2]}</span><span>${s.total[3]}</span></div>
  <div class="tot grand"><span>${s.total[4]}</span><span>${s.total[5]}</span></div>
  <div class="foot">THANK YOU — KEEP THIS RECEIPT</div>
</div>`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
for (const s of SHEETS) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(html(s), { waitUntil: 'load' });
  await page.screenshot({ path: join(HERE, s.file), type: 'jpeg', quality: 82 });
  await page.close();
  console.log(`  ${s.file}`);
}
await browser.close();
console.log(`\n${SHEETS.length} photo fixture(s) written`);
