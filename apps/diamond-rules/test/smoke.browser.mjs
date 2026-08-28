// Browser smoke for Diamond Rules v1: the force engine is checked against the
// full runner truth table, the generated ground balls always name the lead
// force base (plus first with 2 outs), and then the real app is driven by
// tapping the real field at phone width: a softball strikeout takes 4 strikes
// and a foul can never be the last one, a force play is answered on the
// diamond, a fly ball question is answered from its choices, the positioning
// mode is answered by tapping a fielder, a wrong answer lights the right one,
// settings switch the sport to baseball and the choice survives a reload, the
// feedback box opens from the settings card, the copy carries zero em dashes,
// and the service worker cache is pinned to the build tag.
import { withApp } from '../../../design/harness.mjs';
import { readFile } from 'node:fs/promises';

const fail = (m) => { throw new Error(m); };

await withApp('diamond-rules', async ({ page, errors }) => {
  await page.waitForTimeout(400);

  // ── build tag pinned to the worker cache ──
  const build = await page.evaluate(() => window.__dr.BUILD);
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  if (!sw.includes(`'${build}'`)) fail(`sw.js CACHE is not ${build}`);

  // ── oracles: the force table, the whole point of the app ──
  const table = await page.evaluate(() => {
    const f = window.__dr.forces;
    return [
      [[], f([])], [[1], f([1])], [[2], f([2])], [[3], f([3])],
      [[1, 2], f([1, 2])], [[1, 3], f([1, 3])], [[2, 3], f([2, 3])],
      [[1, 2, 3], f([1, 2, 3])],
    ];
  });
  for (const [r, f] of table) {
    const has = (n) => r.includes(n);
    if (f.B1 !== true) fail(`batter must always force 1st (${r})`);
    if (f.B2 !== has(1)) fail(`B2 force wrong for ${r}`);
    if (f.B3 !== (has(1) && has(2))) fail(`B3 force wrong for ${r}`);
    if (f.HOME !== (has(1) && has(2) && has(3))) fail(`HOME force wrong for ${r}`);
  }

  // every generated ground ball names the lead force, and first is an
  // accepted alternative exactly when there are 2 outs and a lead above 1st
  const gen = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 300; i++) {
      const s = window.__dr.makeGroundBall();
      out.push({ runners: s.runners, outs: s.outs, correct: s.correct, alt: s.alt || [], chip: s.chip });
    }
    return out;
  });
  let sawSmart = false;
  for (const s of gen) {
    if (s.correct === 'HOLD') { sawSmart = true; continue; }
    const f = { B1: true, B2: s.runners.includes(1), B3: s.runners.includes(1) && s.runners.includes(2), HOME: s.runners.length === 3 };
    const lead = f.HOME ? 'HOME' : f.B3 ? 'B3' : f.B2 ? 'B2' : 'B1';
    if (s.correct !== lead) fail(`lead force ${lead} expected, got ${s.correct} for ${s.runners}`);
    const wantAlt = s.outs === 2 && lead !== 'B1';
    if (wantAlt !== s.alt.includes('B1')) fail(`2-out alternative wrong for ${s.runners} outs ${s.outs}`);
  }
  if (!sawSmart) fail('smart-ball HOLD scenarios never appeared in 300 ground balls');

  // ── copy sweep: no em or en dashes anywhere in the app's words ──
  const dashes = await page.evaluate(() => {
    const banks = [window.__dr.FLY_BANK, window.__dr.POS_BANK, window.__dr.SMART_BANK]
      .flat().map((s) => s.prompt + s.why + (s.choices || []).map((c) => c[1]).join(''))
      .join('');
    return (document.body.innerHTML + banks).match(/[–—]/g)?.length ?? 0;
  });
  if (dashes) fail(`${dashes} em or en dashes in live copy`);

  // ── the count, softball house rules: 4 strikes, foul never the last ──
  const sport = await page.evaluate(() => window.__dr.S.sport);
  if (sport !== 'softball') fail('default sport should be softball');
  for (let i = 0; i < 3; i++) await page.click('[data-p="strike"]');
  let msg = await page.textContent('#ask');
  if (!msg.includes('0 and 3')) fail('3 strikes should not be out in softball: ' + msg);
  await page.click('[data-p="foul"]');
  msg = await page.textContent('#ask');
  if (!msg.includes('count stays')) fail('foul should not be the 4th strike: ' + msg);
  await page.click('[data-p="strike"]');
  msg = await page.textContent('#ask');
  if (!msg.includes('Strike 4! The batter is out.')) fail('4th strike should end the softball at bat: ' + msg);

  // ── the play: answer a force on the real diamond ──
  await page.click('#tab-play');
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => window.__dr.S.scenario);
  if (s.correct === 'HOLD') await page.click('#holdBtn');
  else await page.click('#base-' + s.correct, { force: true });
  await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
  let word = await page.textContent('#vWord');
  if (!['Nice play!', 'You got it!', 'Heads-up play!', 'Way to go!'].includes(word)) fail('correct base read as wrong: ' + word);
  const streak = await page.evaluate(() => window.__dr.S.streak);
  if (streak !== 1) fail('streak should be 1, got ' + streak);
  await page.click('#next');

  // and a deliberate miss lights the correct base green
  await page.waitForTimeout(200);
  s = await page.evaluate(() => window.__dr.S.scenario);
  const wrongBase = s.correct === 'B1' ? 'B2' : 'B1';
  if (s.correct === 'HOLD' || (s.alt || []).includes(wrongBase)) { await page.click('#holdBtn').catch(() => {}); }
  await page.evaluate(() => {}); // keep hold path simple: only assert on plain force scenarios
  if (s.correct !== 'HOLD' && !(s.alt || []).includes(wrongBase)) {
    await page.click('#base-' + wrongBase, { force: true });
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    word = await page.textContent('#vWord');
    if (word !== 'Not quite!') fail('wrong base read as right');
    const lit = await page.evaluate((c) => document.getElementById('base-' + c).classList.contains('hit'), s.correct);
    if (!lit) fail('correct base not shown after a miss');
    const streak0 = await page.evaluate(() => window.__dr.S.streak);
    if (streak0 !== 0) fail('streak should reset on a miss');
  }
  await page.click('#next');

  // ── fly balls: answer from the choices or the diamond ──
  await page.click('#tab-fly');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => window.__dr.S.scenario);
  if (s.kind === 'choice') await page.click(`[data-c="${s.correct}"]`);
  else await page.click('#base-' + s.correct, { force: true });
  await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
  word = await page.textContent('#vWord');
  if (word === 'Not quite!') fail('correct fly answer read as wrong');
  await page.click('#next');

  // ── take the field: tap the fielder who covers ──
  await page.click('#tab-pos');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => window.__dr.S.scenario);
  if (s.kind === 'pos') {
    await page.click('#pos-' + s.correct, { force: true });
  } else {
    await page.click(`[data-c="${s.correct}"]`);
  }
  await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
  word = await page.textContent('#vWord');
  if (word === 'Not quite!') fail('correct positioning answer read as wrong');
  await page.click('#next');

  // a wrong fielder lights the right one
  await page.waitForTimeout(200);
  for (let tries = 0; tries < 10; tries++) {
    s = await page.evaluate(() => window.__dr.S.scenario);
    if (s.kind === 'pos') break;
    await page.click(`[data-c="${s.correct}"]`);
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    await page.click('#next');
    await page.waitForTimeout(200);
  }
  if (s.kind === 'pos') {
    const wrongPos = s.correct === '8' ? '7' : '8';
    await page.click('#pos-' + wrongPos, { force: true });
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    word = await page.textContent('#vWord');
    if (word !== 'Not quite!') fail('wrong fielder read as right');
    const lit = await page.evaluate((c) => document.getElementById('pos-' + c).classList.contains('hit'), s.correct);
    if (!lit) fail('correct fielder not shown after a miss');
    await page.click('#next');
  }

  // ── settings: sport flips to baseball and survives a reload ──
  await page.click('#gear');
  const note0 = await page.textContent('#sportNote');
  if (!note0.includes('4 strikes')) fail('softball note missing: ' + note0);
  await page.click('[data-sport="baseball"]');
  const note1 = await page.textContent('#sportNote');
  if (!note1.includes('3 strikes')) fail('baseball note missing: ' + note1);

  // feedback box opens from the settings card
  await page.click('#feedbackLink');
  const fbOpen = await page.evaluate(() => !document.getElementById('fbWrap').classList.contains('hidden'));
  if (!fbOpen) fail('feedback box did not open');
  await page.click('#fbCancel');

  await page.reload();
  await page.waitForTimeout(400);
  const kept = await page.evaluate(() => window.__dr.S.sport);
  if (kept !== 'baseball') fail('sport choice did not survive a reload: ' + kept);

  // baseball strikeout takes 3
  for (let i = 0; i < 3; i++) await page.click('[data-p="strike"]');
  msg = await page.textContent('#ask');
  if (!msg.includes('Strike 3! The batter is out.')) fail('3rd strike should end the baseball at bat: ' + msg);

  // best streak persisted
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('diamond1')).best);
  if (!(best >= 1)) fail('best streak not persisted: ' + best);

  if (errors.length) fail('console errors: ' + errors.join(' | '));
  console.log('Diamond Rules smoke: all green');
});
