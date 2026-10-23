/* Saccade in a real browser through the studio harness: the sample loads, play flashes words with the pivot letter,
   the Text sheet takes a paste and reads it, the Library openings work offline, Style changes the stage, share target
   intake fills the Text box, no page errors, fonts are the local files. Shots to /tmp/fo-lead/saccade-*.png.
   node apps/saccade/test/smoke.browser.mjs */
import { withApp } from '../../../design/harness.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
await withApp('saccade', async ({ page, errors }) => {
  await sleep(600);
  const first = await page.evaluate(() => ({ stats: document.getElementById('stats').textContent, word: document.getElementById('word').textContent, pivot: document.querySelector('#word .pivot').textContent, hint: document.getElementById('hint').textContent }));
  ok(/words loaded/.test(first.stats) && first.word.length > 0 && first.pivot.length === 1, 'sample text loaded, first word shown with a one letter pivot: ' + JSON.stringify(first));
  const fonts = await page.evaluate(() => Array.from(document.fonts).map((f) => f.family + ':' + f.status));
  ok(fonts.some((f) => /Literata:loaded/.test(f)) , 'reading font loaded from the app folder (' + fonts.filter((f) => /loaded/.test(f)).join(', ') + ')');
  await page.click('#btnPlay'); await sleep(1400);
  const mid = await page.evaluate(() => ({ live: document.getElementById('stage').classList.contains('live'), pct: document.getElementById('pct').textContent, w: document.getElementById('word').textContent }));
  ok(mid.live && mid.pct !== '0%', 'playing: stage live, progress moved (' + mid.pct + ', showing "' + mid.w + '")');
  const ico = await page.evaluate(() => ({ play: getComputedStyle(document.getElementById('icoPlay')).display, pause: getComputedStyle(document.getElementById('icoPause')).display }));
  ok(ico.play === 'none' && ico.pause !== 'none', 'the big button shows the pause bars while playing ' + JSON.stringify(ico));
  await page.screenshot({ path: '/tmp/fo-lead/saccade-play.png' });
  await page.click('#btnPlay'); await sleep(200);
  ok(!(await page.evaluate(() => document.getElementById('stage').classList.contains('live'))), 'paused on the second tap');
  await page.click('#btnText'); await sleep(200);
  await page.fill('#src', 'Hello there reader. This is a pasted note, nothing more.\n\nSecond paragraph ends here.');
  await page.click('#readNow'); await sleep(900);
  const pasted = await page.evaluate(() => ({ src: document.getElementById('source').textContent, live: document.getElementById('stage').classList.contains('live'), stats: document.getElementById('stats').textContent }));
  ok(/Pasted text/.test(pasted.src) && pasted.live, 'pasted text reads at once: ' + pasted.src);
  await page.click('#btnPlay'); await sleep(200);
  await page.click('#btnLib'); await sleep(200);
  await page.click('#libDemo .book'); await sleep(500);
  const lib = await page.evaluate(() => ({ src: document.getElementById('source').textContent, hidden: document.getElementById('sheetLib').hidden }));
  ok(/Pride and Prejudice/.test(lib.src) && lib.hidden, 'library opening loads offline and the sheet closes: ' + lib.src);
  await page.click('#btnStyle'); await sleep(200);
  await page.click('#presets [data-p="night"]'); await sleep(200);
  const night = await page.evaluate(() => getComputedStyle(document.getElementById('stage')).backgroundColor);
  ok(night === 'rgb(10, 11, 15)', 'Night preset paints the stage (' + night + ')');
  await page.screenshot({ path: '/tmp/fo-lead/saccade-style.png' });
  await page.click('#closeStyle'); await sleep(100);
  const taps = await page.evaluate(() => Array.from(document.querySelectorAll('button, input, select, a')).filter((el) => el.offsetParent !== null).map((el) => { const target = (el.type === 'checkbox' && el.closest('label')) ? el.closest('label') : el; const r = target.getBoundingClientRect(); return [el.id || el.className || el.tagName, Math.round(r.width), Math.round(r.height)]; }).filter((t) => t[1] < 44 || t[2] < 44));   /* a checkbox's tap target is its label row */
  ok(taps.length === 0, 'every visible control is at least 44 px (' + JSON.stringify(taps).slice(0, 200) + ')');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
}, { width: 412, height: 915 });
await withApp('saccade/?title=Shared%20page&text=Some%20shared%20words%20to%20read.&url=https%3A%2F%2Fexample.com', async ({ page, errors }) => {
  await sleep(500);
  const st = await page.evaluate(() => ({ open: !document.getElementById('sheetText').hidden, v: document.getElementById('src').value, q: location.search }));
  ok(st.open && /Shared page/.test(st.v) && /shared words/.test(st.v) && st.q === '', 'share target intake opens the Text sheet pre filled and clears the query: ' + JSON.stringify(st).slice(0, 160));
  ok(errors.length === 0, 'no page errors on intake');
}, { width: 412, height: 915 });
await withApp('saccade', async ({ page }) => {
  await sleep(500);
  const land = await page.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(), d = document.querySelector('.deck').getBoundingClientRect(); return { stageRight: Math.round(s.right), deckLeft: Math.round(d.left), scrollX: document.documentElement.scrollWidth > innerWidth }; });
  ok(land.deckLeft >= land.stageRight && !land.scrollX, 'landscape phone: stage left, deck right, no sideways scroll ' + JSON.stringify(land));
  await page.screenshot({ path: '/tmp/fo-lead/saccade-landscape.png' });
}, { width: 915, height: 412 });
console.log(fails ? 'SMOKE_FAIL' : 'SMOKE_PASS'); process.exit(fails ? 1 : 0);
