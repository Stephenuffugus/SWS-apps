// Run: node ../../design/harness.mjs, driven by design/test-all.mjs
//
// The whole loop, in a real browser, the way a teacher does it: add a class,
// paste a roster, mark the lesson, read the grade. Anything that only works
// because a unit test constructed the state by hand is not shipped.
import { withApp } from '../../../design/harness.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; } else { failed++; console.error('FAIL:', name, extra); process.exitCode = 1; }
};

await withApp('grade-sheet', async ({ page, errors }) => {
  const click = async (text) => {
    const b = page.locator(`button:has-text("${text}")`).first();
    await b.click();
    await page.waitForTimeout(220);
  };

  /* ── first run ── */
  await page.waitForTimeout(500);
  ok('welcome names the promise',
    (await page.innerText('body')).includes('never sent anywhere'));
  ok('the backup warning is present before anything is typed',
    await page.locator('.keepline').count() === 1);

  /* ── add a class ── */
  await click('Add your first class');
  await page.waitForTimeout(200);
  ok('a dialog opens, not a window.prompt', await page.locator('dialog[open]').count() === 1);
  await page.fill('#ask_name', '2 Kowalski');
  await page.fill('#ask_period', '3');
  await page.locator('dialog button[type="submit"]').click();
  await page.waitForTimeout(350);
  ok('lands on the paste screen', (await page.innerText('body')).includes('Paste anything'));

  /* ── paste a roster, the way a copied spreadsheet actually arrives ── */
  const roster = 'Student\tID\nMoreno, Jacob\t4412\nNguyen, Ada\t4418\nOsei, Malik\t4420\n'
               + 'Vance, Sara\t4421\nKim, Dae\t4422';
  await page.fill('textarea.paste', roster);
  await page.waitForTimeout(400);
  const pickerText = await page.innerText('body');
  ok('the header row is recognised and excluded', pickerText.includes('5 rows found') && pickerText.includes('header row ignored'),
    pickerText.slice(0, 200));
  ok('a column picker is offered rather than a template',
    await page.locator('.picker select').count() >= 2);

  await click('Add 5 students');
  await page.waitForTimeout(400);
  const afterAdd = await page.innerText('body');
  ok('students land in the class, shown in the projectable form',
    afterAdd.includes('Jacob M.') && afterAdd.includes('Ada N.'), afterAdd.slice(0, 200));
  ok('full surnames are NOT shown by default', !afterAdd.includes('Moreno'));

  /* ── mark the lesson ── */
  await click('Mark today’s lesson');
  await page.waitForTimeout(400);
  ok('the sweep is offered before any typing',
    (await page.innerText('body')).includes('Give everyone'));

  await page.locator('.rowline button:has-text("4")').first().click();
  await page.waitForTimeout(400);
  const cells = page.locator('.cell');
  ok('the sweep filled every child', await cells.count() === 5);
  ok('and they all read 4', (await cells.first().inputValue()) === '4');

  /* one child was away, one did not take part */
  await cells.nth(1).fill('M');
  await cells.nth(1).blur();
  await page.waitForTimeout(300);
  await cells.nth(2).fill('Ex');
  await cells.nth(2).blur();
  await page.waitForTimeout(300);

  const states = await page.evaluate(() =>
    [...document.querySelectorAll('.cell')].map((c) => ({ v: c.value, cls: c.className, label: c.getAttribute('aria-label') })));
  ok('missing is a distinct state, not a zero',
    states[1].cls.includes('st-missing') && /missing, counts as zero/.test(states[1].label), JSON.stringify(states[1]));
  ok('excused is a distinct state', states[2].cls.includes('st-excused') && /excused, not counted/.test(states[2].label));
  ok('a missing cell is distinguishable without colour', states[1].v === 'M');

  /* ── the grade ── */
  await click('Done');
  await page.waitForTimeout(500);
  const grid = await page.innerText('body');
  ok('the class grid shows a grade per student', /100%/.test(grid), grid.slice(0, 300));

  const rows = await page.evaluate(() => [...document.querySelectorAll('table.marks tbody tr')]
    .map((tr) => tr.children[1].innerText.replace(/\s+/g, ' ').trim()));
  // 4/4 = 100 A ; missing = 0/4 = 0 F ; excused = nothing counted =, ok('a full mark is 100%', rows[0].startsWith('100%'), rows[0]);
  ok('a missing mark is 0%, not blank', rows[1].startsWith('0%'), rows[1]);
  ok('an excused-only student has NO grade rather than a zero',
    rows[2].startsWith('—'), `expected em dash, got ${rows[2]}`);

  /* ── show your work ── */
  await page.locator('details.explain').first().click();
  await page.waitForTimeout(250);
  ok('the arithmetic is shown, not asserted',
    (await page.innerText('details.explain')).includes('out of'));

  /* ── privacy screen ── */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape blanks the names', await page.evaluate(() => document.body.dataset.names === 'hidden'));
  /* The class the studio base reserves for display:none must never be the one
     this app toggles on <body>, that hid the entire app instead of the names. */
  ok('and does not hide the whole app',
    await page.evaluate(() => getComputedStyle(document.body).display !== 'none'));
  ok('and says so', await page.locator('.hidebar').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape brings them back', await page.evaluate(() => document.body.dataset.names !== 'hidden'));

  /* ── it survives a reload, which is the entire point ── */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  const after = await page.innerText('body');
  ok('the class is still there after a reload', after.includes('2 Kowalski'), after.slice(0, 200));

  /* ── no network, ever ── */
  const external = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((r) => r.name).filter((n) => !n.startsWith(location.origin)));
  ok('nothing is fetched from anywhere else', external.length === 0, JSON.stringify(external));

  ok('no console errors across the whole run', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
});

console.log(`  grade-sheet browser: ${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
