// Browser smoke for Coverage: the screen starts EMPTY (no demo numbers), the
// save button refuses an empty screen with words, a filled screen renders a
// verdict and a reverse solve, a saved deal survives a reload (the IndexedDB
// store round-trips), and the footer signs which copy the phone is running.
// The math itself is proven by harness.mjs against a frozen oracle.
import { withApp } from '../../../design/harness.mjs';

await withApp('coverage', async ({ page, errors }) => {
  await page.waitForTimeout(300);

  // empty start: neutral verdict, no big numbers waiting in the fields
  const dscr0 = (await page.textContent('#vDscr')).trim();
  const state0 = (await page.textContent('#vState')).trim();
  if (dscr0 !== '—' || state0 !== 'Ready') throw new Error('did not start empty: ' + state0 + ' ' + dscr0);
  const price0 = await page.inputValue('#iPrice');
  if (price0 !== '') throw new Error('price field starts pre-filled: ' + price0);

  // saving an empty screen must explain, not write junk
  await page.click('#btnSave');
  await page.waitForTimeout(300);
  const count0 = (await page.textContent('#savedCount')).trim();
  if (count0 !== '0') throw new Error('empty screen was saved anyway');

  // a filled screen renders verdict and solve
  await page.fill('#iPrice', '600000');
  await page.fill('#iDown', '180000');
  await page.fill('#iRent', '4200');
  await page.waitForTimeout(200);
  const dscr = (await page.textContent('#vDscr')).trim();
  if (!/^\d+\.\d\d$/.test(dscr)) throw new Error('verdict did not render a DSCR: ' + dscr);
  const lead = (await page.textContent('#solveLead')).trim();
  if (!lead.includes('Qualifies') && !lead.includes('qualify')) throw new Error('reverse solve did not render: ' + lead);

  await page.click('#btnSave');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  const count = (await page.textContent('#savedCount')).trim();
  if (count !== '1') throw new Error('saved deal did not survive reload, count: ' + count);

  const tag = (await page.textContent('.buildtag')).trim();
  if (tag !== 'coverage-v2') throw new Error('build tag missing or wrong: ' + tag);

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('smoke pass: empty start, save gate, verdict ' + dscr + ', reload survived, ' + tag);
});
