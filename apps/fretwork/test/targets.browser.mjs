// Fretwork's 48 px gate (Astra D08 / D32, 10 Oct 2026): on eight screens at 360 and 412 wide, every fret cell and
// every visible control must render at least 48 x 48 CSS px, and nothing may scroll sideways. Run:
// node apps/fretwork/test/targets.browser.mjs   (exits 1 and names the offenders on any miss)
import { withApp } from '../../../design/harness.mjs';
let bad = 0;
for (const [W, H] of [[360, 740], [412, 915]]) {
  await withApp('fretwork', async ({ page }) => {
    await page.waitForTimeout(300);
    const audit = (name, board) => page.evaluate(([name, board]) => {
      const vis = e => e.offsetParent !== null || e.closest('svg');
      const cells = board ? [...document.querySelectorAll(board + ' rect.cell')].map(c => c.getBoundingClientRect()) : [];
      const ctl = [...document.querySelectorAll('button, select, a.btn, summary, .chip')].filter(e => e.offsetParent !== null);
      const small = ctl.map(e => ({ t: (e.textContent || e.id || '').trim().slice(0, 18), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }))
        .filter(x => x.h < 48 || x.w < 48);
      return { name, cellW: cells.length ? Math.min(...cells.map(r => r.width)).toFixed(1) : '-', cellH: cells.length ? Math.min(...cells.map(r => r.height)).toFixed(1) : '-',
               docW: document.documentElement.scrollWidth, small: small.slice(0, 6), smallN: small.length };
    }, [name, board]);
    const out = [];
    out.push(await audit('home', null));
    await page.click('#tabDrills'); out.push(await audit('drills', null));
    await page.evaluate(() => document.querySelectorAll('details.opts').forEach(d => { d.open = true; }));
    await page.click('#startHunt'); await page.waitForTimeout(200); out.push(await audit('hunt', '#runBoard'));
    await page.click('#btnQuit'); await page.click('#startTri'); await page.waitForTimeout(200); out.push(await audit('triads', '#runBoard'));
    await page.click('#btnQuit');
    await page.click('#tabModes'); await page.waitForTimeout(200); out.push(await audit('scales', '#modeBoard'));
    await page.click('#tabPlay'); await page.waitForTimeout(200); out.push(await audit('play', '#playBoard'));
    await page.click('#tabCharts'); await page.click('#btnNewChart'); await page.click('.chordbox.addbox'); await page.waitForTimeout(200); out.push(await audit('picker', null));
    await page.click('#btnBuildNew'); await page.waitForTimeout(200); out.push(await audit('builder', '#chordBoard'));
    for (const o of out) {
      const miss = o.smallN > 0 || (o.cellW !== '-' && (+o.cellW < 48 || +o.cellH < 48)) || o.docW > W;
      if (miss) { bad++; console.log('TARGETS_FAIL', W, JSON.stringify(o)); }
    }
  }, { width: W, height: H });
}
if (bad) process.exit(1);
console.log('TARGETS_PASS every fret cell and control at least 48 px on 8 screens at 360 and 412');
