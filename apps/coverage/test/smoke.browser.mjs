// Browser smoke for Coverage: the defaults render a verdict and a reverse
// solve, a saved deal survives a reload (the IndexedDB store round-trips),
// and the footer signs which copy of the app the phone is running.
// The math itself is proven by harness.mjs against a frozen oracle.
import { withApp } from '../../../design/harness.mjs';

await withApp('coverage', async ({ page, errors }) => {
  await page.waitForTimeout(300);
  const dscr = (await page.textContent('#vDscr')).trim();
  if (!/^\d+\.\d\d$/.test(dscr)) throw new Error('verdict did not render a DSCR: ' + dscr);

  const lead = (await page.textContent('#solveLead')).trim();
  if (lead === '' || lead.includes('—')) throw new Error('reverse solve did not render: ' + lead);

  await page.click('#btnSave');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  const count = (await page.textContent('#savedCount')).trim();
  if (count !== '1') throw new Error('saved deal did not survive reload, count: ' + count);

  const tag = (await page.textContent('.buildtag')).trim();
  if (tag !== 'coverage-v1') throw new Error('build tag missing or wrong: ' + tag);

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('smoke pass: verdict ' + dscr + ', deal survived reload, ' + tag);
});
