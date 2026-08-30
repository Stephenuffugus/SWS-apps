/* Accessibility, in a real browser, in both colour schemes.

   This lives here rather than being picked up by design/a11y.mjs because that
   script builds its slug list from design/skins.mjs, and Comic Crew is
   deliberately not in skins.mjs: adding it would let design/apply.mjs delete
   the app's own bristol board CSS on the next build. So the fleet's a11y run
   will never open this app, and without this file nothing ever would.

   Fails on any serious or critical violation.

   node test/a11y.browser.mjs
*/
import { readFileSync } from 'node:fs';
import { withApp } from '../../../design/harness.mjs';

const AXE = readFileSync(new URL('../../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

const fails = [];
let n = 0;
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const eq = (a, b, m) => { n++; if (a !== b) fails.push(`${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); };

/* every state a child can actually be looking at, not just the empty page */
async function drawSomething(page) {
  const map = (pts) => page.evaluate((p) => {
    const r = document.getElementById('stage').getBoundingClientRect();
    const s = Math.min(r.width / 1000, r.height / 1400);
    const ox = r.left + (r.width - 1000 * s) / 2, oy = r.top + (r.height - 1400 * s) / 2;
    return p.map((q) => [ox + q[0] * s, oy + q[1] * s]);
  }, pts);
  const line = async (a, b) => {
    const pts = await map(Array.from({ length: 9 }, (_, i) =>
      [a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8]));
    await page.evaluate((pts) => {
      const c = document.getElementById('stage');
      const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {
        pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true,
        clientX: x, clientY: y, pressure: 0.6 }));
      ev('pointerdown', pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ev('pointermove', pts[i][0], pts[i][1]);
      ev('pointerup', pts[8][0], pts[8][1]);
    }, pts);
  };
  await line([440, 370], [440, 730]);
  await line([560, 370], [560, 730]);
  await line([420, 395], [330, 700]);
  await line([460, 740], [430, 1130]);
}

for (const scheme of ['light', 'dark']) {
  await withApp('comic-crew', async ({ page, errors }) => {
    /* in through the real gate, then audit the app behind it. The gate itself
       is audited as its own state below. */
    await page.addInitScript(() => {
      try { localStorage.setItem('sws.gate.comic-crew', 'wolfden'); } catch (e) {}
    });
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: AXE });
    await drawSomething(page);

    const states = [
      ['drawing', async () => { await page.click('#mDraw'); }],
      ['dressing up', async () => { await page.click('#mDress'); }],
      ['moving', async () => { await page.click('#mPose'); }],
      ['the words sheet', async () => { await page.click('#mPose'); await page.click('#btnWords'); }],
      ['the grown ups sheet', async () => {
        await page.evaluate(() => document.getElementById('wordDone').click());
        await page.click('#btnGrown');
      }],
      ['the finished page', async () => {
        await page.evaluate(() => document.getElementById('grownClose').click());
        await page.evaluate(() => document.querySelectorAll('.panel')[0].click());
        await page.click('#btnPage');
      }],
    ];

    for (const [name, go] of states) {
      await go();
      await page.waitForTimeout(260);
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length,
                         where: v.nodes.slice(0, 2).map((x) => x.target.join(' ')) }));
      });
      ok(res.length === 0, `${scheme} / ${name}: ${JSON.stringify(res)}`);
    }

    /* the hint is the only instruction in the app and it must be announced,
       because a child using a screen reader gets nothing else */
    const live = await page.evaluate(() => {
      const h = document.getElementById('hint');
      return { role: h.getAttribute('role'), live: h.getAttribute('aria-live') };
    });
    ok(live.live === 'polite', `the instruction line is a live region (got ${JSON.stringify(live)})`);

    /* the canvas is the app. Something has to name it. */
    const named = await page.evaluate(() => {
      const c = document.getElementById('stage');
      return !!(c.getAttribute('aria-label') || c.getAttribute('role') || c.textContent.trim());
    });
    ok(named, 'the drawing canvas has an accessible name');

    ok(errors.length === 0, `${scheme}: no console errors (${JSON.stringify(errors).slice(0, 300)})`);
  }, { width: 414, height: 900, scheme });
}

/* ── the gate is the first thing anybody meets, so it gets audited too ──── */
for (const scheme of ['light', 'dark']) {
  await withApp('comic-crew', async ({ page, errors }) => {
    await page.addScriptTag({ content: AXE });
    await page.waitForTimeout(250);
    const up = await page.evaluate(() => !!document.querySelector('.gate'));
    ok(up, `${scheme}: the gate is up to be audited`);
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length,
                       where: v.nodes.slice(0, 2).map((x) => x.target.join(' ')) }));
    });
    ok(res.length === 0, `${scheme} / the gate: ${JSON.stringify(res)}`);

    /* the passphrase box has a real label, and the error is announced */
    const shape = await page.evaluate(() => {
      const i = document.getElementById('gatepass');
      const l = document.querySelector('.gate label');
      const e = document.querySelector('.gate .gerr');
      const b = document.getElementById('gatego');
      const rb = b.getBoundingClientRect(), ri = i.getBoundingClientRect();
      return { labelFor: l && l.getAttribute('for'), id: i.id,
               described: i.getAttribute('aria-describedby'),
               errRole: e && e.getAttribute('role'),
               btn: [Math.round(rb.width), Math.round(rb.height)],
               box: [Math.round(ri.width), Math.round(ri.height)] };
    });
    eq(shape.labelFor, shape.id, `${scheme}: the passphrase box has a real label`);
    ok(shape.described, `${scheme}: and an explanation tied to it`);
    eq(shape.errRole, 'alert', `${scheme}: a wrong passphrase is announced, not just coloured`);
    ok(shape.btn[1] >= 44 && shape.box[1] >= 44,
      `${scheme}: both are 44px targets (${JSON.stringify(shape)})`);

    ok(errors.length === 0, `${scheme}: no console errors at the gate (${JSON.stringify(errors).slice(0, 200)})`);
  }, { width: 414, height: 900, scheme });
}

if (fails.length) {
  console.error(`a11y.browser: ${fails.length} of ${n} checks failed`);
  fails.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(`a11y.browser: ${n} checks passed`);
