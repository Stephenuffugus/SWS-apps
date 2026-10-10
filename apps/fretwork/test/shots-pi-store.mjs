// Fretwork's Pi listing pictures (10 Oct 2026): three 750x1500 previews (a 375x750 phone at 2x) on the Pi rail, so no
// tip jar and no studio exit shows in a Pi listing; the tabs reached by real taps. Writes to the folder given.
//   node apps/fretwork/test/shots-pi-store.mjs <out dir>
import { serveApps } from '../../../design/harness.mjs';
const out = process.argv[2] || '.';
const site = await serveApps();
const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 750 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.route('https://sdk.minepi.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.goto(site.url('fretwork') + '?rail=pi', { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/preview-1-home.jpg`, type: 'jpeg', quality: 88 });
await page.click('#tabPlay'); await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/preview-2-play.jpg`, type: 'jpeg', quality: 88 });
await page.click('#tabDrills'); await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/preview-3-drills.jpg`, type: 'jpeg', quality: 88 });
await browser.close(); site.close();
console.log('SHOTS 3 written to ' + out);
