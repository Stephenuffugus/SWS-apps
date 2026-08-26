// Browser smoke for Fretwork: the theory engine is checked against two shapes
// every guitarist knows by hand (the x3545x Cmaj7 drop 2 and the 5-5-3 C major
// triad on the top strings), spelling is honest (Gb up a major 3rd is Bb, not
// A#), and then the real drills are driven by tapping the real board: a note
// hunt runs to its summary including a deliberate miss, name that fret answers
// a round, a triad round is solved from the engine's own voicing, the
// inversion climb walks four drop 2 shapes up the neck, the one note ladder
// morphs maj7 down to dim7 and reports exactly which voice moved, the modes
// board teaches Dorian as minor with a #6 and draws a real three notes a
// string form, and the stats survive a reload. All through the UI at phone
// width, like a thumb would.
import { withApp } from '../../../design/harness.mjs';

await withApp('fretwork', async ({ page, errors }) => {
  await page.waitForTimeout(300);

  // build tag signs the copy
  const tag = (await page.textContent('.buildtag')).trim();
  if (tag !== 'fretwork-v3') throw new Error('build tag missing or wrong: ' + tag);

  // ── theory oracles ──
  const oracle = await page.evaluate(() => {
    const fw = window.__fw;
    const N = (letter, acc) => ({ letter, acc: acc || 0 });
    const spell1 = fw.nn(fw.up(N('G', -1), 'M3'));   // Gb major third
    const spell2 = fw.nn(fw.up(N('B'), 'P5'));        // B perfect fifth
    // Cmaj7 drop 2, root in the bass, strings 5 4 3 2: from close 2nd inversion
    const drop = fw.shapeFor(N('C'), 'maj7', 2, [1, 2, 3, 4], true);
    // C major triad, root position, strings 3 2 1
    const tri = fw.shapeFor(N('C'), 'maj', 0, [3, 4, 5], false);
    return {
      spell1, spell2,
      dropBass: drop.bassIdx,
      dropInst: drop.inst.map(a => a.join(',')),
      triInst: tri.inst.map(a => a.join(',')),
      triSpell: tri.spell.join(' '),
    };
  });
  if (oracle.spell1 !== 'B♭') throw new Error('Gb up a M3 spelled ' + oracle.spell1 + ', wanted B♭');
  if (oracle.spell2 !== 'F♯') throw new Error('B up a P5 spelled ' + oracle.spell2 + ', wanted F♯');
  if (oracle.dropBass !== 0) throw new Error('Cmaj7 drop 2 of the 2nd inversion should put the root in the bass');
  if (!oracle.dropInst.includes('3,5,4,5')) throw new Error('x3545x missing from Cmaj7 drop 2 instances: ' + oracle.dropInst);
  if (!oracle.triInst.includes('5,5,3')) throw new Error('5-5-3 missing from C major triad instances: ' + oracle.triInst);
  if (oracle.triSpell !== 'C E G') throw new Error('C major spelled ' + oracle.triSpell);

  // ── note hunt: wrong tap flagged, every C found, summary appears ──
  await page.selectOption('#huntWin', '0-5');
  await page.click('#startHunt');
  await page.waitForTimeout(300);
  const hunt = await page.evaluate(() => ({
    targets: window.__fw.drill.targets,
    note: window.__fw.nn(window.__fw.drill.note),
  }));
  if (hunt.note !== 'C') throw new Error('hunt note should default to C, got ' + hunt.note);
  if (hunt.targets.length < 3) throw new Error('too few C targets in 0-5: ' + hunt.targets.length);

  const missCell = await page.evaluate(() => {
    const t = new Set(window.__fw.drill.targets.map(a => a.join(',')));
    for (let s = 0; s < 6; s++) for (let f = 0; f <= 5; f++)
      if (!t.has(s + ',' + f)) return [s, f];
  });
  await page.click(`rect.cell[data-s="${missCell[0]}"][data-f="${missCell[1]}"]`);
  await page.waitForTimeout(150);
  const missN = await page.evaluate(() => window.__fw.drill.miss);
  if (missN !== 1) throw new Error('deliberate miss was not counted: ' + missN);

  for (const [s, f] of hunt.targets) {
    await page.click(`rect.cell[data-s="${s}"][data-f="${f}"]`);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const sumBig = (await page.textContent('#sumBig')).trim();
  if (sumBig !== 'Every C') throw new Error('hunt summary wrong: ' + sumBig);
  const sumSub = (await page.textContent('#sumSub')).trim();
  if (!sumSub.includes('1 miss')) throw new Error('summary forgot the miss: ' + sumSub);

  // ── name that fret: answer the lit note with the right pad ──
  await page.click('#btnBack');
  await page.click('#startName');
  await page.waitForTimeout(300);
  const curPc = await page.evaluate(() => window.__fw.drill.cur.p);
  await page.click(`#padHost button[data-pc="${curPc}"]`);
  await page.waitForTimeout(200);
  const named = await page.evaluate(() => window.__fw.drill.right);
  if (named !== 1) throw new Error('correct pad was not accepted');

  // ── triads: solve one round from the engine's own voicing ──
  await page.click('#btnQuit');
  await page.click('#startTri');
  await page.waitForTimeout(300);
  const shape = await page.evaluate(() => ({
    set: window.__fw.drill.cur.set,
    frets: window.__fw.drill.cur.shape.inst[0],
  }));
  for (let i = 0; i < shape.set.length; i++) {
    await page.click(`rect.cell[data-s="${shape.set[i]}"][data-f="${shape.frets[i]}"]`);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  const solved = await page.evaluate(() => window.__fw.drill.right);
  if (solved !== 1) throw new Error('correct triad voicing was not accepted');
  const triLabels = await page.evaluate(() => [...document.querySelectorAll('#runBoard text')].map(t => t.textContent));
  if (!triLabels.includes('R')) throw new Error('numbers-first labels missing on a solved triad: ' + triLabels.join(','));

  // ── inversion climb: four drop 2 shapes, each with a higher bass fret ──
  await page.click('#btnQuit');
  await page.click('#startClimb');
  let lastBass = -1;
  for (let step = 0; step < 4; step++) {
    await page.waitForFunction(() => window.__fw.drill && window.__fw.drill.cur, { timeout: 5000 });
    const cur = await page.evaluate(() => ({
      set: window.__fw.drill.cur.set,
      inst: window.__fw.drill.cur.inst,
    }));
    if (!(cur.inst[0] > lastBass)) throw new Error('climb step ' + step + ' did not climb: bass ' + cur.inst[0] + ' after ' + lastBass);
    lastBass = cur.inst[0];
    for (let i = 0; i < cur.set.length; i++) {
      await page.click(`rect.cell[data-s="${cur.set[i]}"][data-f="${cur.inst[i]}"]`);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1500);
  const climbBig = (await page.textContent('#sumBig')).trim();
  if (climbBig !== 'Climbed the neck') throw new Error('climb summary wrong: ' + climbBig);

  // ── the one note ladder: maj7 to dim7, the changed voice is named ──
  await page.click('#btnBack');
  await page.click('#startMorph');
  for (let step = 0; step < 5; step++) {
    await page.waitForFunction(() => window.__fw.drill && window.__fw.drill.cur, { timeout: 5000 });
    const cur = await page.evaluate(() => ({
      set: window.__fw.drill.cur.set,
      inst: window.__fw.drill.cur.inst,
    }));
    for (let i = 0; i < cur.set.length; i++) {
      await page.click(`rect.cell[data-s="${cur.set[i]}"][data-f="${cur.inst[i]}"]`);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(250);
    if (step === 1) {
      const v = (await page.textContent('#vLine')).trim();
      if (!v.includes('Only the 7th moved')) throw new Error('ladder did not name the moved voice: ' + v);
      if (!v.includes('Common tones')) throw new Error('ladder did not name the common tones: ' + v);
    }
  }
  await page.waitForTimeout(1700);
  const morphBig = (await page.textContent('#sumBig')).trim();
  if (morphBig !== 'The whole ladder') throw new Error('ladder summary wrong: ' + morphBig);

  // ── modes: D Dorian is minor with a #6, the 2 chord of C major, 3nps draws ──
  await page.click('#tabModes');
  await page.selectOption('#modeSel', '1');
  await page.selectOption('#modeRoot', '3');
  await page.waitForTimeout(250);
  const recipe = (await page.textContent('#modeRecipe')).trim();
  if (!recipe.includes('Dorian') || !recipe.includes('♯6')) throw new Error('Dorian recipe wrong: ' + recipe);
  const ctx = (await page.textContent('#modeCtx')).trim();
  if (!ctx.includes('the 2 chord in the key of C major')) throw new Error('Dorian context wrong: ' + ctx);
  if (!ctx.includes('Dm7')) throw new Error('Dorian vamp chord wrong: ' + ctx);
  await page.selectOption('#modeForm', '3nps');
  await page.waitForTimeout(250);
  const dots = await page.evaluate(() => document.querySelectorAll('#modeBoard g[pointer-events="none"]').length);
  if (dots !== 15) throw new Error('D Dorian 3nps should draw 15 notes, drew ' + dots);
  await page.click('#modeVamp');
  await page.waitForTimeout(300);
  const vampOn = await page.getAttribute('#modeVamp', 'aria-pressed');
  if (vampOn !== 'true') throw new Error('vamp did not arm');
  await page.click('#modeVamp');
  const vampOff = await page.getAttribute('#modeVamp', 'aria-pressed');
  if (vampOff !== 'false') throw new Error('vamp did not stop');
  const modeLabels = await page.evaluate(() => [...document.querySelectorAll('#modeBoard text')].map(t => t.textContent));
  if (!modeLabels.includes('\u266f6')) throw new Error('Dorian altered tone not labeled #6: ' + modeLabels.slice(0, 8).join(','));

  // ── the neck extends: 24 frets reach the explore board ──
  await page.click('#tabDrills');
  await page.selectOption('#setFrets', '24');
  await page.click('#tabExplore');
  await page.waitForTimeout(300);
  const fret24 = await page.$('rect.cell[data-f="24"]');
  if (!fret24) throw new Error('24 fret neck did not reach the board');

  // ── stats teach: the weak spot list is populated by this session's misses ──
  await page.click('#tabStats');
  await page.waitForTimeout(300);
  const weak = (await page.textContent('#weakSpots')).trim();
  if (!weak.includes('String')) throw new Error('weak spots list empty despite misses: ' + weak);
  const hidden = await page.getAttribute('#heatEmpty', 'hidden');
  if (hidden === null) throw new Error('empty state showing despite recorded taps');

  // ── stats survive a reload ──
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  const taps = await page.evaluate(() => window.__fw.state.stats.taps);
  if (!(taps > 0)) throw new Error('stats did not survive the reload');
  await page.click('#tabStats');
  await page.waitForTimeout(200);
  const acc = (await page.textContent('#stAcc')).trim();
  if (!/\d+%/.test(acc)) throw new Error('accuracy did not render: ' + acc);

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('smoke pass: oracles, hunt, naming, numbered triad, climb, ladder with common tones, Dorian #6, 24 frets, weak spots, reload, ' + tag);
});
