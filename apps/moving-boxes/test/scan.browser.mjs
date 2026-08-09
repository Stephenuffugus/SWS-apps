/* The headline feature, driven in a real browser.
 *
 * Two elements shared id="main", so getElementById('main') returned the <main>
 * that CONTAINS the reveal card, and scanning a printed label produced a blank
 * 225px page with zero console errors. helpers.test.mjs only covers pure
 * functions and could never have caught it — this can. It asserts the reveal
 * card has a non-zero bounding box, AND that the packer's private inventory
 * and editor are not visible to whoever scanned the box.
 *
 * Run from the repo root:  node apps/moving-boxes/test/scan.browser.mjs */
import assert from 'node:assert/strict';
import { withApp } from '../../../design/harness.mjs';

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { process.exitCode = 1; console.error('  FAIL  ' + name + '\n    ' + e.message); }
};

await withApp('moving-boxes', async ({ page, errors, url }) => {
  // Seal a real box through the real UI, then read back the exact label URL
  // the app itself would print — no hand-built payload.
  await page.fill('#boxRoom', 'Kitchen');
  await page.fill('#boxItems', 'Can opener\nPots and pans\nThe good knife\nColander\nTea towels');
  await page.click('#addBox');
  await page.waitForFunction(() => document.querySelectorAll('#boxList li').length === 1);

  const labelUrl = await page.evaluate(async () => {
    const h = await import('./helpers.js');
    const boxes = JSON.parse(localStorage.getItem('moving-boxes'));
    const base = location.origin + location.pathname;
    return base + '#' + h.encodeBoxForLabel({ ...boxes[0], total: boxes.length }, 586).payload;
  });

  // A fragment-only goto does not reload, which is exactly how this bug hid.
  await page.goto('about:blank');
  await page.goto(labelUrl);
  await page.waitForFunction(() => !document.getElementById('reveal').classList.contains('hidden'));

  const m = await page.evaluate(() => {
    const box = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;   // display:none
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      reveal: box('#reveal .revealbox'),
      num: document.getElementById('revNum').textContent,
      count: document.getElementById('revCount').textContent,
      items: [...document.querySelectorAll('#revItems li')].map(li => li.textContent),
      bodyH: Math.round(document.body.getBoundingClientRect().height),
      appHidden: getComputedStyle(document.getElementById('app')).display === 'none',
      packVisible: !!box('#packCard'),
      listVisible: !!box('#boxList'),
      exportVisible: !!box('#exportBtn'),
      duplicateMainIds: document.querySelectorAll('#main').length,
      actions: document.querySelectorAll('#reveal button, #reveal a').length,
    };
  });

  ok('the scanned box actually renders', () => {
    assert.ok(m.reveal && m.reveal.w > 0 && m.reveal.h > 0,
      'reveal card bounding box is ' + JSON.stringify(m.reveal));
    assert.ok(m.bodyH > 400, 'page is only ' + m.bodyH + 'px tall');
    assert.equal(m.num, 'Box #1');
    assert.deepEqual(m.items.slice(0, 2), ['Can opener', 'Pots and pans']);
  });

  ok('only one element claims id="main"', () => {
    assert.equal(m.duplicateMainIds, 1);
  });

  ok('the scanner sees the box and nothing else of the household', () => {
    assert.equal(m.appHidden, true, '#app must be hidden');
    assert.equal(m.packVisible, false, 'the editor must not be reachable from a scan');
    assert.equal(m.listVisible, false, 'the whole inventory must not be on show');
    assert.equal(m.exportVisible, false);
  });

  ok('the scan view says what it is and offers a way onward', () => {
    assert.equal(m.count, 'Box 1 of 1 in this move');
    assert.ok(m.actions >= 2, 'only ' + m.actions + ' actions in the reveal card');
  });

  // "Save this box to my own list" is the last-resort restore from paper.
  await page.click('#revSave');
  await page.waitForFunction(() => document.querySelectorAll('#boxList li').length === 1);
  const after = await page.evaluate(() => ({
    hash: location.hash,
    stored: JSON.parse(localStorage.getItem('moving-boxes')).length,
    revealHidden: document.getElementById('reveal').classList.contains('hidden'),
  }));
  ok('a scanned box can be saved onto a fresh device', () => {
    assert.equal(after.stored, 1);
    assert.equal(after.hash, '');
    assert.equal(after.revealHidden, true);
  });

  ok('no console errors for the whole run', () => {
    assert.deepEqual(errors, [], JSON.stringify(errors));
  });
  void url;
});

console.log(`\n${passed} moving-boxes scan tests passed${process.exitCode ? ' (with failures)' : ''}`);
