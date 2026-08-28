#!/usr/bin/env node
/**
 * Off the Ball, browser smoke.
 *
 *   node apps/off-the-ball/test/smoke.browser.mjs
 *
 * engine-test.mjs proves the simulation. This proves the part a person
 * touches: the board renders, a play runs and produces a verdict and a
 * ledger, the playbook saves, exports, imports and refuses rubbish, and a
 * share link survives a round trip into a fresh tab.
 *
 * The two files are deliberately separate. The engine harness must never
 * touch the DOM, see HANDOFF.md section 2.
 */
import { withApp } from '../../../design/harness.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  ok    ${name}`);
};
const FILE = join(tmpdir(), 'otb-playbook-test.json');

await withApp('off-the-ball', async ({ page, errors, overflow }) => {
  await page.waitForTimeout(900);

  /* ---- the board is actually there ---- */
  check('the pitch canvas renders', await page.evaluate(() =>
    !!document.getElementById('pitch') && document.getElementById('pitch').width > 0));
  check('no horizontal overflow', (await overflow()) === 0);

  /* ---- a play runs and says something diagnostic ---- */
  await page.click('#play');
  await page.waitForTimeout(4200);
  const verdict = (await page.textContent('#verdict')).trim();
  check('running the play produces a verdict', verdict.length > 8, verdict);
  /* the whole product is diagnostic, never a score. If a win state ever
     appears this is where it gets caught. */
  check('the verdict is not a score', !/\b(win|lose|won|lost|score:|points?)\b/i.test(verdict), verdict);
  const ledger = await page.evaluate(() => document.getElementById('ledger').textContent.trim());
  check('the ledger reports what the defenders did', ledger.length > 20);

  /* ---- the playbook, which is how a team keeps anything ---- */
  await page.evaluate(() => localStorage.removeItem('otb.playbook'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  for (const [name, preset] of [['Wall', 'giveandgo'], ['Penny', 'decoy']]) {
    await page.selectOption('#preset', preset);
    await page.waitForTimeout(350);
    await page.fill('#callname', name);
    await page.click('#saveplay');
    await page.waitForTimeout(250);
  }
  const saved = await page.evaluate(() =>
    [...document.getElementById('playbook').options].map(o => o.text));
  check('two plays save to the playbook', saved.includes('Wall') && saved.includes('Penny'), saved.join(','));

  /* export, wipe, import: the round trip a squad relies on */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportbook')]);
  await dl.saveAs(FILE);
  const doc = JSON.parse(readFileSync(FILE, 'utf8'));
  check('the export is a self describing playbook file',
    doc.app === 'off-the-ball' && doc.kind === 'playbook' && doc.v >= 1 && doc.plays.length === 2,
    JSON.stringify({ app: doc.app, v: doc.v, n: doc.plays && doc.plays.length }));

  await page.evaluate(() => localStorage.removeItem('otb.playbook'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.setInputFiles('#bookfile', FILE);
  await page.waitForTimeout(600);
  check('importing puts them back', /2 added/.test(await page.textContent('#toast')),
    await page.textContent('#toast'));

  await page.setInputFiles('#bookfile', FILE);
  await page.waitForTimeout(600);
  check('importing twice replaces rather than duplicating',
    /2 replaced/.test(await page.textContent('#toast')), await page.textContent('#toast'));

  writeFileSync(FILE + '.bad', 'not json at all');
  await page.setInputFiles('#bookfile', FILE + '.bad');
  await page.waitForTimeout(500);
  check('rubbish is refused, not swallowed',
    /not a playbook/i.test(await page.textContent('#toast')), await page.textContent('#toast'));

  writeFileSync(FILE + '.mix', JSON.stringify({ app: 'off-the-ball', kind: 'playbook', v: 1,
    plays: [{ n: 'Broken', d: 'not-decodable' }, { n: 'Fresh', d: doc.plays[0].d }] }));
  await page.setInputFiles('#bookfile', FILE + '.mix');
  await page.waitForTimeout(600);
  check('a play that will not open is counted, not dropped in silence',
    /could not be read/i.test(await page.textContent('#toast')), await page.textContent('#toast'));

  /* ---- the share link, which is the whole no-account sharing story ---- */
  await page.fill('#callname', 'Round Trip');
  await page.waitForTimeout(200);
  await page.click('#copylink');
  await page.waitForTimeout(300);
  const url = await page.evaluate(() => location.origin + location.pathname + location.hash);
  check('sharing writes a play into the URL', /#p=/.test(url));
  const fresh = await page.context().newPage();
  await fresh.goto(url, { waitUntil: 'load' });
  await fresh.waitForTimeout(900);
  check('a shared link opens the same call in a fresh tab',
    (await fresh.evaluate(() => document.getElementById('callname').value)) === 'Round Trip');
  await fresh.close();

  const real = errors.filter((e) => !/favicon/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));
});

console.log(failures ? `\n${failures} check(s) failed` : '\nOFF THE BALL BROWSER PASSED');
process.exit(failures ? 1 : 0);
