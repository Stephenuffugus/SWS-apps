// Browser smoke for Diamond Rules: the force engine is checked against the
// full runner truth table; generated ground balls always name the lead force,
// accept EVERY forced bag with 2 outs, and grade other forced bags as
// "That works!" with fewer than 2; then the real app is driven by tapping the
// real field at phone width: a softball strikeout takes 4 strikes and a foul
// can never be the last one, a wrong answer never ends the play (flash, try
// again, no reveal), the eventual right answer still teaches, positioning is
// answered on the fielders, the camera keeps home plate out from under the
// question bubble in every mode, settings survive a reload, the feedback box
// opens, the copy carries zero em dashes, and the worker cache is pinned to
// the build tag.
import { withApp } from '../../../design/harness.mjs';
import { readFile } from 'node:fs/promises';

const fail = (m) => { throw new Error(m); };
const GOOD = ['Nice play!', 'You got it!', 'Heads-up play!', 'Way to go!'];

await withApp('diamond-rules', async ({ page, errors }) => {
  await page.waitForTimeout(400);

  // the camera contract: every base (home especially) sits between the top
  // bar and the question bubble, whatever the bubble's current height
  async function assertFieldClear(where) {
    const r = await page.evaluate(() => {
      const home = document.getElementById('base-HOME').getBoundingClientRect();
      const b2 = document.getElementById('base-B2').getBoundingClientRect();
      const bub = document.querySelector('.bubble').getBoundingClientRect();
      const top = document.querySelector('.topbar').getBoundingClientRect();
      return { homeBottom: home.bottom, b2Top: b2.top, bubTop: bub.top, topBottom: top.bottom };
    });
    if (r.homeBottom > r.bubTop + 1) fail(`home plate under the bubble in ${where}: ${Math.round(r.homeBottom)} vs ${Math.round(r.bubTop)}`);
    if (r.b2Top < r.topBottom - 1) fail(`second base under the top bar in ${where}`);
  }

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

  // generated ground balls: lead force is correct; with 2 outs every forced
  // bag is fully accepted; with fewer, other forced bags land in the okay tier
  const gen = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 300; i++) {
      const s = window.__dr.makeGroundBall();
      out.push({ runners: s.runners, outs: s.outs, correct: s.correct, alt: s.alt || [], okay: s.okay, chip: s.chip });
    }
    return out;
  });
  let sawSmart = false, sawOkay = false;
  for (const s of gen) {
    if (s.correct === 'HOLD') { sawSmart = true; continue; }
    const has = (n) => s.runners.includes(n);
    const f = { B1: true, B2: has(1), B3: has(1) && has(2), HOME: has(1) && has(2) && has(3) };
    const lead = f.HOME ? 'HOME' : f.B3 ? 'B3' : f.B2 ? 'B2' : 'B1';
    if (s.correct !== lead) fail(`lead force ${lead} expected, got ${s.correct} for ${s.runners}`);
    const others = ['B1', 'B2', 'B3', 'HOME'].filter((b) => f[b] && b !== lead);
    if (lead === 'B1') continue;
    if (s.outs === 2) {
      for (const b of others) if (!s.alt.includes(b)) fail(`2-out force at ${b} not accepted for ${s.runners}`);
    } else {
      if (s.alt.length) fail(`alt should be empty under 2 outs for ${s.runners}`);
      for (const b of others) if (!s.okay || !s.okay[b]) fail(`okay tier missing ${b} for ${s.runners} outs ${s.outs}`);
      sawOkay = true;
    }
  }
  if (!sawSmart) fail('smart-ball HOLD scenarios never appeared in 300 ground balls');
  if (!sawOkay) fail('okay-tier scenarios never appeared in 300 ground balls');

  // ── copy sweep: no em or en dashes anywhere in the app's words ──
  const dashes = await page.evaluate(() => {
    const banks = [window.__dr.FLY_BANK, window.__dr.POS_BANK, window.__dr.SMART_BANK]
      .flat().map((s) => s.prompt + s.why + (s.tip || '') + (s.choices || []).map((c) => c[1]).join(''))
      .join('');
    return (document.body.innerHTML + banks).match(/[–—]/g)?.length ?? 0;
  });
  if (dashes) fail(`${dashes} em or en dashes in live copy`);

  // ── the count, softball house rules: 4 strikes, foul never the last ──
  await assertFieldClear('count');
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

  // ── the play: a wrong answer flashes and lets them try again ──
  await page.click('#tab-play');
  await page.waitForTimeout(300);
  await assertFieldClear('play');
  let s = await page.evaluate(() => window.__dr.S.scenario);
  if (s.correct !== 'HOLD') {
    await page.click('#holdBtn');   // holding is wrong on every live force play
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
    if (open) fail('a wrong answer should not end the play');
    const hint = await page.textContent('#hint');
    if (!hint.includes('Try again')) fail('no try-again hint after a miss: ' + hint);
    const streak0 = await page.evaluate(() => window.__dr.S.streak);
    if (streak0 !== 0) fail('streak should reset on a miss');
  }
  if (s.correct === 'HOLD') await page.click('#holdBtn');
  else await page.click('#base-' + s.correct, { force: true });
  await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
  let word = await page.textContent('#vWord');
  if (!GOOD.includes(word)) fail('correct answer after a retry read as wrong: ' + word);
  const streak = await page.evaluate(() => window.__dr.S.streak);
  if (streak !== 1) fail('streak should be 1 after the right answer, got ' + streak);
  await page.click('#next');

  // okay tier on the field: a force out at the wrong bag is a real out
  let okayDone = false;
  for (let tries = 0; tries < 25 && !okayDone; tries++) {
    await page.waitForTimeout(250);
    s = await page.evaluate(() => window.__dr.S.scenario);
    const okayBases = s.okay ? Object.keys(s.okay) : [];
    if (okayBases.length) {
      await page.click('#base-' + okayBases[0], { force: true });
      await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
      word = await page.textContent('#vWord');
      if (word !== 'That works!') fail('okay-tier answer got the wrong verdict: ' + word);
      okayDone = true;
    } else if (s.correct === 'HOLD') {
      await page.click('#holdBtn');
      await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    } else {
      await page.click('#base-' + s.correct, { force: true });
      await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    }
    await page.click('#next');
  }
  if (!okayDone) fail('never met an okay-tier scenario in 25 plays');

  // ── fly balls: wrong choice dims and play continues; right one teaches ──
  await page.click('#tab-fly');
  await page.waitForTimeout(300);
  await assertFieldClear('fly');
  s = await page.evaluate(() => window.__dr.S.scenario);
  if (s.kind === 'choice' && s.choices.length > 1) {
    const wrong = s.choices.find((c) => c[0] !== s.correct)[0];
    await page.click(`[data-c="${wrong}"]`);
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
    if (open) fail('a wrong choice should not end the play');
    const dimmed = await page.evaluate((w) => {
      const b = document.querySelector(`[data-c="${w}"]`);
      return b.disabled;
    }, wrong);
    if (!dimmed) fail('wrong choice not disabled for elimination');
  }
  if (s.kind === 'choice') await page.click(`[data-c="${s.correct}"]`);
  else await page.click('#base-' + s.correct, { force: true });
  await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
  word = await page.textContent('#vWord');
  if (!GOOD.includes(word)) fail('correct fly answer read as wrong: ' + word);
  await page.click('#next');

  // ── take the field: wrong fielder flashes, right fielder finishes ──
  await page.click('#tab-pos');
  await page.waitForTimeout(300);
  await assertFieldClear('pos');
  let posDone = false;
  for (let tries = 0; tries < 12 && !posDone; tries++) {
    s = await page.evaluate(() => window.__dr.S.scenario);
    if (s.kind === 'pos') {
      const wrongPos = s.correct === '8' ? '7' : '8';
      await page.click('#pos-' + wrongPos, { force: true });
      await page.waitForTimeout(300);
      const open = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
      if (open) fail('a wrong fielder should not end the play');
      await page.click('#pos-' + s.correct, { force: true });
      posDone = true;
    } else {
      await page.click(`[data-c="${s.correct}"]`);
    }
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    word = await page.textContent('#vWord');
    if (word === 'Not quite!') fail('positioning answer read as wrong');
    await page.click('#next');
    await page.waitForTimeout(250);
  }
  if (!posDone) fail('never met a tap-a-fielder scenario in 12 plays');

  // ── settings: sport flips to baseball and survives a reload ──
  await page.click('#gear');
  const note0 = await page.textContent('#sportNote');
  if (!note0.includes('4 strikes')) fail('softball note missing: ' + note0);
  await page.click('[data-sport="baseball"]');
  const note1 = await page.textContent('#sportNote');
  if (!note1.includes('3 strikes')) fail('baseball note missing: ' + note1);

  // tip jar link renders, feedback box opens from the settings card
  const tipHref = await page.evaluate(() => {
    const a = document.querySelector('#tipSlot a');
    return a ? a.href : '';
  });
  if (!tipHref.includes('buy.stripe.com')) fail('tip jar link missing from settings');
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
