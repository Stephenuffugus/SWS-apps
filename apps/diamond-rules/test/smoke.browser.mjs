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
  let sawSmart = false, sawOkay = false, sawPower = false;
  for (const s of gen) {
    if (s.chip === 'Smart ball') { sawSmart = true; continue; }
    const has = (n) => s.runners.includes(n);
    // runners on 2nd and 3rd with fewer than 2 outs is the power play:
    // hold, concede first, and every base becomes a force
    if (has(2) && has(3) && !has(1) && s.outs < 2) {
      if (s.correct !== 'HOLD' || s.chip !== 'Power play') fail(`power play not taught for [2,3] with ${s.outs} outs: ${s.correct}/${s.chip}`);
      if (!s.okay || !s.okay.B1) fail('power play must still grade first base as a real out');
      sawPower = true;
      continue;
    }
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
  if (!sawPower) fail('the power play never appeared in 300 ground balls');

  // ── copy sweep: no em or en dashes anywhere in the app's words ──
  const dashes = await page.evaluate(() => {
    const banks = [window.__dr.FLY_BANK, window.__dr.POS_BANK, window.__dr.SMART_BANK, window.__dr.RUN_BANK]
      .flat().map((s) => s.prompt + s.why + (s.tip || '') + (s.choices || []).map((c) => c[1]).join(''))
      .join('');
    return (document.body.innerHTML + banks).match(/[–—]/g)?.length ?? 0;
  });
  if (dashes) fail(`${dashes} em or en dashes in live copy`);

  // ── the count, softball house rules: 4 strikes, foul never the last ──
  await assertFieldClear('count');
  const chipHiddenCount = await page.evaluate(() => document.getElementById('holdChip').hidden);
  if (!chipHiddenCount) fail('hold chip should hide in count mode');
  const sport = await page.evaluate(() => window.__dr.S.sport);
  if (sport !== 'softball8') fail('default should be softball 8U, got ' + sport);
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
  const chipShown = await page.evaluate(() => !document.getElementById('holdChip').hidden);
  if (!chipShown) fail('hold chip should show on the field in play mode');
  let s = await page.evaluate(() => window.__dr.S.scenario);
  if (s.correct !== 'HOLD') {
    await page.click('#holdChip');   // holding is wrong on every live force play
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
    if (open) fail('a wrong answer should not end the play');
    const hint = await page.textContent('#hint');
    if (!hint.includes('Try again')) fail('no try-again hint after a miss: ' + hint);
    const streak0 = await page.evaluate(() => window.__dr.S.streak);
    if (streak0 !== 0) fail('streak should reset on a miss');
  }
  if (s.correct === 'HOLD') await page.click('#holdChip');
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
      await page.click('#holdChip');
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

  // ── mix mode serves every kind of question on one tab ──
  await page.click('#tab-mix');
  await page.waitForTimeout(300);
  await assertFieldClear('mix');
  const kinds = new Set();
  for (let i = 0; i < 20 && kinds.size < 3; i++) {
    s = await page.evaluate(() => window.__dr.S.scenario);
    kinds.add(s.kind);
    if (s.kind === 'choice') await page.click(`[data-c="${s.correct}"]`);
    else if (s.kind === 'pos') await page.click('#pos-' + s.correct, { force: true });
    else if (s.correct === 'HOLD') await page.click('#holdChip');
    else await page.click('#base-' + s.correct, { force: true });
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    word = await page.textContent('#vWord');
    if (word === 'Not quite!') fail('correct mix answer read as wrong (' + s.kind + ')');
    await page.click('#next');
    await page.waitForTimeout(250);
  }
  if (kinds.size < 2) fail('mix mode never varied its question kind: ' + [...kinds]);

  // ── the bottom row carries labels, feedback, and the ballpark organ ──
  const labels = await page.evaluate(() => [...document.querySelectorAll('.tlbl')].map((l) => l.textContent));
  for (const want of ['Music', 'Batting', 'Grounders', 'Fly balls', 'Positions', 'Mix', 'Feedback'])
    if (!labels.includes(want)) fail('tab label missing: ' + want + ' (got ' + labels + ')');
  await page.click('#fbBtn');
  const fbMain = await page.evaluate(() => !document.getElementById('fbWrap').classList.contains('hidden'));
  if (!fbMain) fail('feedback box did not open from the main screen');
  await page.click('#fbCancel');
  await page.click('#musicBtn');
  await page.waitForTimeout(400);
  const musicOn = await page.evaluate(() => document.getElementById('musicBtn').getAttribute('aria-pressed'));
  if (musicOn !== 'true') fail('music button did not arm');
  await page.click('#musicBtn');
  const musicOff = await page.evaluate(() => document.getElementById('musicBtn').getAttribute('aria-pressed'));
  if (musicOff !== 'false') fail('music button did not disarm');

  // the center fielder stands inside the fence (curve is at y=133 mid-field),
  // and the corner infielders stand off their baselines, not on them
  const geom = await page.evaluate(() => {
    const at = (k) => {
      const c = document.querySelector('#pos-' + k + ' .body');
      return { x: +c.getAttribute('cx'), y: +c.getAttribute('cy') };
    };
    return { cf: at(8), b1: at(3), b3: at(5) };
  });
  if (geom.cf.y < 148) fail('center fielder is in the sky: y=' + geom.cf.y);
  const off1 = Math.abs((460 - (geom.b1.x - 200)) - geom.b1.y);
  const off3 = Math.abs((460 - (200 - geom.b3.x)) - geom.b3.y);
  if (off1 < 10) fail('first baseman standing on the baseline');
  if (off3 < 10) fail('third baseman standing on the baseline');

  // ── Play 10: a scored round with one planned miss lands at 9 of 10 ──
  await page.click('#tab-play');
  await page.waitForTimeout(300);
  const rbShown = await page.evaluate(() => !document.getElementById('roundBtn').hidden);
  if (!rbShown) fail('Play 10 button missing in a scenario mode');
  await page.click('#roundBtn');
  await page.waitForTimeout(300);
  for (let i = 0; i < 10; i++) {
    s = await page.evaluate(() => window.__dr.S.scenario);
    if (i === 0) {
      // planned miss: hold on a force play, or a bag that is neither correct nor okay
      if (s.correct !== 'HOLD') await page.click('#holdChip');
      else await page.click('#base-B2', { force: true });
      await page.waitForTimeout(300);
      const open = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
      if (open) fail('round miss should not end the play');
    }
    if (s.correct === 'HOLD') await page.click('#holdChip');
    else await page.click('#base-' + s.correct, { force: true });
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    const line = await page.textContent('#vRound');
    if (!line.includes('10') && !line.includes('Round over')) fail('round progress line missing: ' + line);
    await page.click('#next');
    await page.waitForTimeout(250);
  }
  const cardUp = await page.evaluate(() => !document.getElementById('roundCard').classList.contains('hidden'));
  if (!cardUp) fail('round card did not appear after 10 plays');
  const score = (await page.textContent('#rdScore')).trim();
  if (score !== '9 / 10') fail('planned-miss round should score 9 / 10, got ' + score);
  const wordR = await page.textContent('#rdWord');
  if (wordR !== 'ALL-STAR!') fail('9 of 10 should be ALL-STAR!, got ' + wordR);
  await page.click('#roundFree');
  await page.waitForTimeout(250);
  const freed = await page.evaluate(() => window.__dr.S.round === null);
  if (!freed) fail('free play did not end the round');

  // ── the ballpark organ carries the real 1908 melody, not a guess ──
  const song = await page.evaluate(() => window.__dr.SONG);
  const beats = song.reduce((a, n) => a + n[1], 0);
  if (beats !== 96) fail('chorus should be 32 bars of 3/4 (96 beats), got ' + beats);
  if (song[1][0] !== 12) fail('the opening octave leap is missing');
  if (!song.some((n) => n[0] === 8)) fail('the G sharp in the Cracker Jack line is missing');
  if (!song.some((n) => n[0] === 6)) fail('the F sharp under "at the old" is missing');
  const oneTwoThree = song.map((n) => n.join(',')).join(' ');
  if (!oneTwoThree.includes('12,3 12,3 12,1 11,1 9,1')) fail('one, two, three strikes must sit on the same high C');
  if (song[song.length - 1].join(',') !== '12,6') fail('the final "game" should hold high C');

  // ── settings: sport flips to baseball and survives a reload ──
  await page.click('#gear');
  const note0 = await page.textContent('#sportNote');
  if (!note0.includes('4 strikes')) fail('softball note missing: ' + note0);
  await page.click('[data-sport="baseball"]');
  const note1 = await page.textContent('#sportNote');
  if (!note1.includes('3 strikes')) fail('baseball note missing: ' + note1);

  // ── 10U kid pitch: 3 strikes, dropped third strike, runner IQ unlocks ──
  await page.click('[data-sport="softball10"]');
  const note10 = await page.textContent('#sportNote');
  if (!note10.includes('10U kid pitch')) fail('10U note missing: ' + note10);
  const gates = await page.evaluate(() => {
    const d = window.__dr, out = {}, cur = d.S.sport;
    for (const k of ['softball8', 'softball10', 'baseball']) { d.S.sport = k; out[k] = d.scenarioMakers().length; }
    d.S.sport = cur;
    return out;
  });
  if (gates.softball8 !== 3 || gates.baseball !== 3) fail('runner IQ leaked below 10U: ' + JSON.stringify(gates));
  if (gates.softball10 !== 4) fail('runner IQ missing at 10U: ' + JSON.stringify(gates));
  await page.click('#closeSettings');
  await page.click('#tab-count');
  await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) await page.click('[data-p="strike"]');
  msg = await page.textContent('#ask');
  if (!msg.includes('RUN to first')) fail('10U strikeout should teach dropped third strike: ' + msg);
  await page.click('#tab-mix');
  let sawRun = false;
  const RUNCHIPS = ['No early leadoffs', 'Steal it!', 'Dropped third strike'];
  for (let i = 0; i < 40 && !sawRun; i++) {
    await page.waitForTimeout(200);
    s = await page.evaluate(() => window.__dr.S.scenario);
    if (RUNCHIPS.includes(s.chip)) sawRun = true;
    if (s.kind === 'choice') await page.click(`[data-c="${s.correct}"]`);
    else if (s.kind === 'pos') await page.click('#pos-' + s.correct, { force: true });
    else if (s.correct === 'HOLD') await page.click('#holdChip');
    else await page.click('#base-' + s.correct, { force: true });
    await page.waitForSelector('#overlay:not(.hidden)', { timeout: 3000 });
    await page.click('#next');
  }
  if (!sawRun) fail('runner IQ never served in 40 mix plays at 10U');
  await page.click('#gear');
  await page.click('[data-sport="baseball"]');

  // tip jar link renders, feedback box opens from the settings card
  const tipHref = await page.evaluate(() => {
    const a = document.querySelector('#tipSlot a');
    return a ? a.href : '';
  });
  if (!tipHref.includes('buy.stripe.com')) fail('tip jar link missing from settings');
  // add to home screen: offered in settings, and as a banner from the hub link
  const installShown = await page.evaluate(() => !document.getElementById('swsInstall').hidden);
  if (!installShown) fail('add to home screen button missing from settings');
  await page.click('#feedbackLink');
  const fbOpen = await page.evaluate(() => !document.getElementById('fbWrap').classList.contains('hidden'));
  if (!fbOpen) fail('feedback box did not open');
  await page.click('#fbCancel');
  const base = page.url().split('?')[0];
  await page.goto(base + '?sws-install=1');
  await page.waitForTimeout(500);
  const banner = await page.evaluate(() => !!document.getElementById('installBanner'));
  if (!banner) fail('hub install link did not raise the banner');
  await page.goto(base);
  await page.waitForTimeout(400);
  await page.click('#gear');
  await page.click('[data-sport="baseball"]');
  await page.click('#closeSettings');

  await page.reload();
  await page.waitForTimeout(400);
  const kept = await page.evaluate(() => window.__dr.S.sport);
  if (kept !== 'baseball') fail('sport choice did not survive a reload: ' + kept);
  const rbCount = await page.evaluate(() => document.getElementById('roundBtn').hidden);
  if (!rbCount) fail('Play 10 button should hide in batting mode');

  // baseball strikeout takes 3
  for (let i = 0; i < 3; i++) await page.click('[data-p="strike"]');
  msg = await page.textContent('#ask');
  if (!msg.includes('Strike 3! The batter is out.')) fail('3rd strike should end the baseball at bat: ' + msg);

  // best streak persisted
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('diamond1')).best);
  if (!(best >= 1)) fail('best streak not persisted: ' + best);

  // stored pre-level saves migrate: 'softball' becomes 8U
  await page.evaluate(() => localStorage.setItem('diamond1', JSON.stringify({ sport: 'softball' })));
  await page.reload();
  await page.waitForTimeout(400);
  const mig = await page.evaluate(() => window.__dr.S.sport);
  if (mig !== 'softball8') fail("old 'softball' save did not migrate to 8U: " + mig);

  if (errors.length) fail('console errors: ' + errors.join(' | '));
  console.log('Diamond Rules smoke: all green');
});
