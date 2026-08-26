// Browser smoke for Fretwork v5: the theory engine is checked against three
// shapes every guitarist knows by hand (the x3545x Cmaj7 spread, the 5-5-3 C
// major triad, and Stephen's big Am7 at 5x555x with the 5th string skipped),
// spelling is honest (Gb up a major 3rd is Bb, not A#), and then the real
// drills are driven by tapping the real board: a note hunt runs to its summary
// including a deliberate miss and offers a harder hunt, name that fret answers
// a round, a triad round is solved from the engine's own voicing, the
// inversion climb walks four shapes up the neck on the big-shape string set,
// the one note ladder morphs maj7 down to dim7 and reports exactly which voice
// moved, the scales board teaches Dorian as minor with a #6 in one position
// and in a real three notes a string form, the play board holds and slides a
// voice, records a loop, and goes full screen, a chord chart is built, named,
// played and survives a reload, and the rhythm room lights a 3 over 2. All
// through the UI at phone width, like a thumb would.
import { withApp } from '../../../design/harness.mjs';

await withApp('fretwork', async ({ page, errors }) => {
  await page.waitForTimeout(300);

  // build tag signs the copy
  const tag = (await page.textContent('.buildtag')).trim();
  if (tag !== 'fretwork-v5') throw new Error('build tag missing or wrong: ' + tag);

  // ── theory oracles ──
  const oracle = await page.evaluate(() => {
    const fw = window.__fw;
    const N = (letter, acc) => ({ letter, acc: acc || 0 });
    const spell1 = fw.nn(fw.up(N('G', -1), 'M3'));   // Gb major third
    const spell2 = fw.nn(fw.up(N('B'), 'P5'));        // B perfect fifth
    // Cmaj7 spread, root in the bass, strings 5 4 3 2 (the old drop 2 call)
    const drop = fw.shapeFor(N('C'), 'maj7', 2, [1, 2, 3, 4], true);
    // C major triad, root position, strings 3 2 1
    const tri = fw.shapeFor(N('C'), 'maj', 0, [3, 4, 5], false);
    // Stephen's big shape: Am7 rooted on the 6th string, 5th string skipped
    const big = fw.shapeFor(N('A'), 'm7', 3, [0, 2, 3, 4], 3);
    return {
      spell1, spell2,
      dropBass: drop.bassIdx,
      dropInst: drop.inst.map(a => a.join(',')),
      triInst: tri.inst.map(a => a.join(',')),
      triSpell: tri.spell.join(' '),
      bigBass: big.bassIdx,
      bigInst: big.inst.map(a => a.join(',')),
      bigSpell: big.spell.join(' '),
    };
  });
  if (oracle.spell1 !== 'B♭') throw new Error('Gb up a M3 spelled ' + oracle.spell1 + ', wanted B♭');
  if (oracle.spell2 !== 'F♯') throw new Error('B up a P5 spelled ' + oracle.spell2 + ', wanted F♯');
  if (oracle.dropBass !== 0) throw new Error('Cmaj7 spread of the 2nd inversion should put the root in the bass');
  if (!oracle.dropInst.includes('3,5,4,5')) throw new Error('x3545x missing from Cmaj7 spread instances: ' + oracle.dropInst);
  if (!oracle.triInst.includes('5,5,3')) throw new Error('5-5-3 missing from C major triad instances: ' + oracle.triInst);
  if (oracle.triSpell !== 'C E G') throw new Error('C major spelled ' + oracle.triSpell);
  if (oracle.bigBass !== 0) throw new Error('big shape should carry the root in the bass, got tone ' + oracle.bigBass);
  if (!oracle.bigInst.includes('5,5,5,5')) throw new Error('Am7 big shape should sit at 5x555x: ' + oracle.bigInst);
  if (oracle.bigSpell !== 'A G C E') throw new Error('Am7 big shape spelled ' + oracle.bigSpell + ', wanted A G C E');

  // ── the front door: brand new goes straight into the gentle hunt ──
  await page.click('#doorNew');
  await page.waitForTimeout(300);
  const door = await page.evaluate(() => ({ mode: window.__fw.drill.mode, hi: window.__fw.drill.win.hi }));
  if (door.mode !== 'hunt' || door.hi !== 5) throw new Error('brand new door routed wrong: ' + JSON.stringify(door));
  await page.click('#btnQuit');

  // ── note hunt: wrong tap flagged, every C found, celebration offers more ──
  await page.evaluate(() => document.querySelectorAll('details.opts').forEach(d => { d.open = true; }));
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
  const extraTxt = (await page.textContent('#sumExtra')).trim();
  if (!extraTxt.includes('Go harder')) throw new Error('the hunt did not offer a harder hunt: ' + extraTxt);

  // ── name that fret: answer the lit note with the right pad ──
  await page.click('#btnBack');
  await page.evaluate(() => document.querySelectorAll('details.opts').forEach(d => { d.open = true; }));
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

  // ── inversion climb on the big-shape string set: four shapes, rising bass ──
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

  // ── scales: D Dorian is minor with a #6, one position by default, 3nps draws ──
  await page.click('#tabModes');
  await page.selectOption('#modeSel', '1');
  await page.selectOption('#modeRoot', '3');
  await page.waitForTimeout(250);
  const recipe = (await page.textContent('#modeRecipe')).trim();
  if (!recipe.includes('Dorian') || !recipe.includes('♯6')) throw new Error('Dorian recipe wrong: ' + recipe);
  const ctx = (await page.textContent('#modeCtx')).trim();
  if (!ctx.includes('the 2 chord in the key of C major')) throw new Error('Dorian context wrong: ' + ctx);
  if (!ctx.includes('Dm7')) throw new Error('Dorian vamp chord wrong: ' + ctx);
  const posLabel = (await page.textContent('#posLabel')).trim();
  if (!posLabel.includes('Position 1 of 7')) throw new Error('default form should be one position: ' + posLabel);
  await page.click('#posUp');
  await page.waitForTimeout(200);
  const posLabel2 = (await page.textContent('#posLabel')).trim();
  if (!posLabel2.includes('Position 2 of 7')) throw new Error('position shift broke: ' + posLabel2);
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
  if (!modeLabels.includes('♯6')) throw new Error('Dorian altered tone not labeled #6: ' + modeLabels.slice(0, 8).join(','));
  if (!modeLabels.includes('♭3')) throw new Error('scale notes should wear their degree numbers: ' + modeLabels.slice(0, 8).join(','));
  // stacked positions paint position colors
  await page.selectOption('#modeForm', 'stack');
  await page.waitForTimeout(250);
  const colored = await page.evaluate(() =>
    [...document.querySelectorAll('#modeBoard circle')].filter(c => (c.getAttribute('fill') || '').startsWith('#')).length);
  if (colored < 20) throw new Error('stacked positions did not color the neck: ' + colored);
  // hide the map keeps only roots
  await page.click('#modeHide');
  await page.waitForTimeout(250);
  const hiddenDots = await page.evaluate(() => document.querySelectorAll('#modeBoard g[pointer-events="none"]').length);
  if (!(hiddenDots > 0 && hiddenDots < 20)) throw new Error('hide the map should leave only the roots: ' + hiddenDots);
  await page.click('#modeHide');

  // ── the neck extends: 24 frets reach the play board through the zoom ──
  await page.click('#tabDrills');
  await page.selectOption('#setFrets', '24');
  await page.click('#tabPlay');
  await page.selectOption('#playTo', '24');
  await page.waitForTimeout(300);
  const fret24 = await page.$('#playBoard rect.cell[data-f="24"]');
  if (!fret24) throw new Error('24 fret neck did not reach the board');

  // ── the instrument: hold sustains, slide follows the string, release ends ──
  await page.evaluate(() => document.querySelector('#playBoard rect.cell[data-s="2"][data-f="5"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const c1 = await (await page.$('#playBoard rect.cell[data-s="2"][data-f="5"]')).boundingBox();
  await page.mouse.move(c1.x + c1.width/2, c1.y + c1.height/2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  let voices = await page.evaluate(() => window.__fw.playVoices);
  if (voices !== 1) throw new Error('held note did not open a voice: ' + voices);
  const c2 = await (await page.$('#playBoard rect.cell[data-s="2"][data-f="7"]')).boundingBox();
  await page.mouse.move(c2.x + c2.width/2, c2.y + c2.height/2, { steps: 6 });
  await page.waitForTimeout(200);
  voices = await page.evaluate(() => window.__fw.playVoices);
  if (voices !== 1) throw new Error('slide dropped the voice: ' + voices);
  await page.mouse.up();
  await page.waitForTimeout(200);
  voices = await page.evaluate(() => window.__fw.playVoices);
  if (voices !== 0) throw new Error('release did not close the voice: ' + voices);

  // ── the looper: two notes in, the loop arms and plays ──
  await page.click('#loopRec');
  await page.click('#playBoard rect.cell[data-s="2"][data-f="5"]');
  await page.waitForTimeout(150);
  await page.click('#playBoard rect.cell[data-s="2"][data-f="7"]');
  await page.waitForTimeout(150);
  await page.click('#loopRec');
  await page.waitForTimeout(200);
  const loop = await page.evaluate(() => ({ len: window.__fw.loop.len, n: window.__fw.loop.events.length, playing: window.__fw.loop.playing }));
  if (loop.n !== 2) throw new Error('loop caught ' + loop.n + ' notes, wanted 2');
  if (!(loop.len >= 600) || !loop.playing) throw new Error('loop did not arm and play: ' + JSON.stringify(loop));
  await page.click('#loopClear');

  // ── full screen play: the chrome folds away and comes back ──
  await page.click('#btnFS');
  await page.waitForTimeout(200);
  const fsOn = await page.evaluate(() => document.body.classList.contains('playfs'));
  if (!fsOn) throw new Error('full screen class did not arm');
  await page.click('#btnFS');
  await page.waitForTimeout(200);
  const fsOff = await page.evaluate(() => document.body.classList.contains('playfs'));
  if (fsOff) throw new Error('full screen did not release');

  // ── chord charts: build, name, order, play, survive a reload ──
  await page.click('#tabCharts');
  await page.click('#btnNewChart');
  await page.fill('#chartName', 'Smoke Test Jam');
  await page.click('.chordbox.addbox');
  await page.waitForTimeout(200);
  await page.click('#chordBoard rect.cell[data-s="0"][data-f="5"]');
  await page.click('#chordBoard rect.cell[data-s="2"][data-f="5"]');
  await page.click('#chordBoard rect.cell[data-s="3"][data-f="5"]');
  await page.fill('#chordName', 'The Big One');
  await page.click('#btnChordSave');
  await page.waitForTimeout(200);
  const boxTxt = (await page.textContent('#chordStrip')).trim();
  if (!boxTxt.includes('The Big One')) throw new Error('saved chord missing from the strip: ' + boxTxt);
  await page.click('#btnChartPlay');
  await page.waitForTimeout(400);
  const nowBox = await page.$('.chordbox.playingnow');
  if (!nowBox) throw new Error('chart play did not light the current chord');
  await page.click('#btnChartPlay');

  // ── the rhythm room: 3 over 2 lights its grid ──
  await page.click('#tabDrills');
  await page.click('#startRhythm');
  await page.waitForTimeout(200);
  const slots32 = await page.evaluate(() => document.querySelectorAll('#polyGrid .slot').length);
  if (slots32 !== 12) throw new Error('3 over 2 grid should hold 12 slots (6 up, 6 down): ' + slots32);
  const hits = await page.evaluate(() => document.querySelectorAll('#polyGrid .slot.hit').length);
  if (hits !== 5) throw new Error('3 over 2 should mark 5 hits (3 right, 2 left): ' + hits);
  await page.click('#poly43');
  await page.waitForTimeout(200);
  const slots43 = await page.evaluate(() => document.querySelectorAll('#polyGrid .slot').length);
  if (slots43 !== 24) throw new Error('4 over 3 grid should hold 24 slots: ' + slots43);
  const say = (await page.textContent('#polySay')).trim().replace(/\s+/g, ' ');
  if (!say.includes('gosh')) throw new Error('the phrase is missing: ' + say);
  await page.click('#btnPolyPlay');
  await page.waitForTimeout(700);
  const litNow = await page.evaluate(() => document.querySelectorAll('#polyGrid .slot.now').length);
  if (!litNow) throw new Error('the playhead never lit a slot');
  await page.click('#btnPolyPlay');

  // ── the chart survives a reload ──
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#tabCharts');
  await page.waitForTimeout(200);
  const rowTxt = (await page.textContent('#chartList')).trim();
  if (!rowTxt.includes('Smoke Test Jam') || !rowTxt.includes('1 chord')) throw new Error('chart did not survive the reload: ' + rowTxt);

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('smoke pass: oracles incl the 5x555x big shape, door, hunt with harder offer, naming, numbered triad, big-shape climb, ladder with common tones, Dorian #6 in positions, stacked colors, hide the map, 24 frets, held slide voice, looper, full screen, chord chart round trip, rhythm room 3:2 and 4:3, reload, ' + tag);
});
