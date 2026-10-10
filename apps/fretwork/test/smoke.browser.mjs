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
  if (tag !== 'fretwork-v14') throw new Error('build tag missing or wrong: ' + tag);

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

  // ── his 10 Oct notes: sets that belong together, nothing twice, then a test with green / red notes ──
  const sets = await page.evaluate(() => {
    const fw = window.__fw;
    const key = (it) => fw.pc(it.root) + ':' + it.qual;
    const one = (cfg) => { const b = fw.buildShapeSet(cfg); const ks = b.list.map(key);
      return { n: ks.length, uniq: new Set(ks).size, label: b.label, roots: b.list.map(it => fw.pc(it.root)) }; };
    return {
      sev: one({ quals: ['maj7','dom7','m7'], set: [1,2,3,4], inv: '0', drop: 2 }),
      maj7: one({ quals: ['maj7'], set: [1,2,3,4], inv: '0', drop: 2 }),
      tri: one({ quals: ['maj','min'], set: [3,4,5], inv: 'mix', drop: 0 }),
    };
  });
  for (const [k, v] of Object.entries(sets)) if (v.n < 4 || v.uniq !== v.n) throw new Error(k + ' set repeats or is too short: ' + JSON.stringify(v));
  if (!sets.sev.label.startsWith('in the key of') || !sets.tri.label.startsWith('in the key of')) throw new Error('mixed qualities should come from one key: ' + JSON.stringify(sets));
  if (sets.maj7.label !== 'round the circle of fifths' || sets.maj7.n !== 8) throw new Error('one quality should walk the circle, 8 long: ' + JSON.stringify(sets.maj7));
  for (let i = 1; i < sets.maj7.roots.length; i++)
    /* a fourth each step, or two or three when a shape will not fit under the 12th fret and is skipped */
    if ([5, 10, 3].indexOf((sets.maj7.roots[i] - sets.maj7.roots[i-1] + 12) % 12) < 0) throw new Error('the circle walk should keep moving up by fourths: ' + sets.maj7.roots.join(','));
  // the lesson ends after five; the summary offers the test
  await page.evaluate(() => { const d = window.__fw.drill; d.round = d.learnN; d.skip(); });
  await page.waitForTimeout(200);
  const testBtn = await page.evaluate(() => { const b = document.querySelector('#sumExtra .btn.primary'); return b ? b.textContent : ''; });
  if (!/^Test these \d$/.test(testBtn)) throw new Error('no test offered after the lesson: ' + testBtn);
  await page.click('#sumExtra .btn.primary');
  await page.waitForTimeout(250);
  const tcur = await page.evaluate(() => { const d = window.__fw.drill; return { mode: d.mode, n: d.list.length, set: d.cur.set, inst: d.cur.inst }; });
  if (tcur.mode !== 'stest') throw new Error('the test did not start: ' + tcur.mode);
  const offString = [0,1,2,3,4,5].find(x => !tcur.set.includes(x));
  await page.click(`#runBoard rect.cell[data-s="${offString}"][data-f="3"]`);
  await page.waitForTimeout(120);
  if (!(await page.textContent('#vLine')).includes('silent for this shape')) throw new Error('a string the shape does not use should say so');
  const wrongF = tcur.inst[0] >= 12 ? tcur.inst[0] - 1 : tcur.inst[0] + 1;
  await page.click(`#runBoard rect.cell[data-s="${tcur.set[0]}"][data-f="${wrongF}"]`);
  await page.waitForTimeout(120);
  const red = await page.evaluate(() => [...document.querySelectorAll('#runBoard circle')].some(c => c.getAttribute('fill') === 'var(--fail)'));
  if (!red) throw new Error('a wrong note should show red');
  for (let i = 0; i < tcur.set.length; i++) {
    await page.click(`#runBoard rect.cell[data-s="${tcur.set[i]}"][data-f="${tcur.inst[i]}"]`);
    await page.waitForTimeout(80);
  }
  const greens = await page.evaluate(() => [...document.querySelectorAll('#runBoard circle')].filter(c => c.getAttribute('fill') === 'var(--pass)').length);
  if (greens !== tcur.set.length) throw new Error('every right note should stay green: ' + greens + ' of ' + tcur.set.length);
  // his call: a finished chord holds until Next; it must not move on by itself
  await page.waitForTimeout(1800);
  if (!/test <b>1<\/b>/.test(await page.innerHTML('#pProg'))) throw new Error('the finished chord moved on without Next');
  const badge = await page.evaluate(() => [...document.querySelectorAll('#runBoard text')].some(t => t.textContent === '\u2713'));
  if (!badge) throw new Error('right notes should carry a check mark, not colour alone');
  await page.click('#tNext');
  await page.waitForFunction(() => /test <b>2<\/b>/.test(document.getElementById('pProg').innerHTML), { timeout: 4000 });
  const res = await page.evaluate(() => window.__fw.drill.results);
  if (res.length !== 1 || res[0].r !== 'corrected') throw new Error('a chord with a miss should count as corrected: ' + JSON.stringify(res));

  // nothing twice running: name the note and intervals, many draws
  await page.click('#btnQuit');
  for (let pass = 0; pass < 3; pass++) {
    await page.click('#startName');
    await page.waitForTimeout(150);
    const ps = await page.evaluate(() => { const d = window.__fw.drill, out = [d.cur.p]; for (let i = 0; i < 10; i++){ d.skip(); out.push(d.cur.p); } return out; });
    for (let i = 1; i < ps.length; i++) if (ps[i] === ps[i-1]) throw new Error('name the note asked the same note twice running: ' + ps.join(','));
    if (pass < 2) await page.click('#btnQuit');   /* the next step quits the last one */
  }

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
  if (!recipe.includes('Dorian') || !recipe.includes('major 6th')) throw new Error('Dorian recipe wrong: ' + recipe);
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
  if (!modeLabels.includes('6')) throw new Error('Dorian altered tone not labeled 6: ' + modeLabels.slice(0, 8).join(','));
  if (!modeLabels.includes('m3')) throw new Error('scale notes should wear their interval quality: ' + modeLabels.slice(0, 8).join(','));
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

  // ── the Messiaen shelf: whole tone renders with its aug vamp ──
  await page.selectOption('#modeSel', '17');
  await page.waitForTimeout(250);
  const wtRecipe = (await page.textContent('#modeRecipe')).trim();
  if (!wtRecipe.includes('Whole tone')) throw new Error('whole tone missing: ' + wtRecipe);
  const wtCtx = (await page.textContent('#modeCtx')).trim();
  if (!wtCtx.includes('aug')) throw new Error('whole tone vamp chord should be aug: ' + wtCtx);

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

  // ── v6 on the play deck: the new voices exist and the strings chip mirrors ──
  const hasNylon = await page.evaluate(() => [...document.querySelectorAll('#playVoice option')].map(o => o.value));
  if (!hasNylon.includes('nylon') || !hasNylon.includes('keys')) throw new Error('new voices missing: ' + hasNylon.join(','));
  await page.click('#playMirror');
  await page.waitForTimeout(150);
  if (!(await page.evaluate(() => window.__fw.state.lefty))) throw new Error('the strings chip did not mirror the neck');
  await page.click('#playMirror');
  await page.waitForTimeout(150);

  // ── chord charts: build, name, order, play, survive a reload ──
  await page.click('#tabCharts');
  await page.click('#btnNewChart');
  await page.fill('#chartName', 'Smoke Test Jam');
  await page.click('.chordbox.addbox');
  await page.waitForTimeout(200);
  // the add flow opens the picker: the bank is stocked and one tap adds
  const bankN = await page.evaluate(() => document.querySelectorAll('#bankChips .chip').length);
  if (bankN < 25) throw new Error('the bank looks thin: ' + bankN);
  // his 10 Oct note: a tap PREVIEWS (hear it, see it), tapping around adds nothing, Add this one commits
  const chordsNow = () => page.evaluate(() => window.__fw.state.charts[window.__fw.state.charts.length-1].chords.length);
  await page.click('#bankChips .chip:nth-child(1)');
  await page.waitForTimeout(150);
  await page.click('#bankChips .chip:nth-child(3)');
  await page.waitForTimeout(150);
  if (await chordsNow() !== 0) throw new Error('a bank tap added a chord instead of previewing it');
  const bar = await page.evaluate(() => ({
    hidden: document.getElementById('pickBar').hidden,
    name: document.getElementById('pickName').textContent,
    want: document.querySelector('#bankChips .chip:nth-child(3)').textContent,
    pressed: [...document.querySelectorAll('#bankChips .chip[aria-pressed="true"]')].map(b => b.textContent),
    box: !!document.querySelector('#pickBox svg circle'),
  }));
  if (bar.hidden || bar.name !== bar.want || bar.pressed.length !== 1 || bar.pressed[0] !== bar.want || !bar.box)
    throw new Error('the pick bar did not follow the tapped chord: ' + JSON.stringify(bar));
  await page.click('#pickAdd');
  await page.waitForTimeout(150);
  const picked = await chordsNow();
  if (picked !== 1) throw new Error('Add this one did not add the previewed chord: ' + picked);
  const pickedName = await page.evaluate(() => { const c = window.__fw.state.charts[window.__fw.state.charts.length-1]; return c.chords[0].n; });
  if (pickedName !== bar.want) throw new Error('the chart got ' + pickedName + ' instead of the previewed ' + bar.want);
  if (await page.evaluate(() => document.getElementById('pickAfter').hidden)) throw new Error('the after-the-last-chord button should show once the chart has a chord');
  // the chord brain: an open Am7 reads as Am7 before anything is typed
  const offers = await page.evaluate(() => window.__fw.analyze([-1,0,2,0,1,0]).map(o => o.name));
  if (offers[0] !== 'Am7') throw new Error('the chord brain misread x02010: ' + offers.join(','));
  await page.click('#btnBuildNew');
  await page.waitForTimeout(200);
  await page.click('#chordBoard rect.cell[data-s="0"][data-f="5"]');
  await page.click('#chordBoard rect.cell[data-s="2"][data-f="5"]');
  await page.click('#chordBoard rect.cell[data-s="3"][data-f="5"]');
  const guessN = await page.evaluate(() => document.querySelectorAll('#guessChips .chip').length);
  if (!guessN) throw new Error('no name offers appeared on a built chord');
  await page.fill('#chordName', 'The Big One');
  await page.selectOption('#chordBeatsSel', '5');
  await page.click('#btnChordKeep');
  await page.click('#btnChordSave');
  await page.waitForTimeout(200);
  const boxTxt = (await page.textContent('#chordStrip')).trim();
  if (!boxTxt.includes('The Big One')) throw new Error('saved chord missing from the strip: ' + boxTxt);
  if (!boxTxt.includes('5 beats')) throw new Error('the odd bar is not marked on its block: ' + boxTxt);
  const kept = await page.evaluate(() => window.__fw.state.chordLib.map(c => c.n));
  if (kept.indexOf('The Big One') < 0) throw new Error('keep did not reach My chords: ' + kept.join(','));
  const lastChord = await page.evaluate(() => { const cs = window.__fw.state.charts; return cs[cs.length-1].chords[cs[cs.length-1].chords.length-1]; });
  if (lastChord.b !== 5) throw new Error('the 5 beat block did not save: ' + JSON.stringify(lastChord));
  // the jam board unfolds under the chart and is playable
  await page.click('#jamChip');
  await page.waitForTimeout(250);
  const jamCells = await page.evaluate(() => document.querySelectorAll('#jamBoard rect.cell').length);
  if (!jamCells) throw new Error('the jam board did not draw');
  await page.click('#jamChip');
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
  if (!rowTxt.includes('Smoke Test Jam') || !rowTxt.includes('2 chords')) throw new Error('chart did not survive the reload: ' + rowTxt);

  // ── 9 Oct: the open string letters above the nut, the Setup strip, a custom tuning that survives a reload ──
  await page.click('#tabPlay');
  await page.waitForTimeout(300);
  const lbl0 = await page.evaluate(() => [...document.querySelectorAll('#playBoard svg.board .openlbl')].map((t) => t.textContent).join(''));
  if (lbl0 !== 'EADGBE') throw new Error('the play board should carry EADGBE above the nut: ' + lbl0);
  const lblBand = await page.evaluate(() => { const r = document.querySelector('#playBoard svg.board rect[aria-label^="open string"]'); return r ? r.getBoundingClientRect().height : 0; });
  if (lblBand < 40) throw new Error('the letter band should be a thumb target, got ' + lblBand + ' px');
  await page.click('#tabDrills');
  await page.waitForTimeout(200);
  const strip0 = await page.evaluate(() => [...document.querySelectorAll('#tuneStrip .chip.tune b')].map((b) => b.textContent).join(''));
  if (strip0 !== 'EADGBE') throw new Error('the Setup strip should read EADGBE on a fresh save: ' + strip0);
  await page.click('#tuneStrip .chip.tune');
  await page.waitForTimeout(120);
  await page.click('#tunePop .chips .chip:nth-child(3)');
  await page.waitForTimeout(150);
  const strip1 = await page.evaluate(() => [...document.querySelectorAll('#tuneStrip .chip.tune b')].map((b) => b.textContent).join(''));
  if (strip1 !== 'DADGBE') throw new Error('retuning string 6 to D should read DADGBE: ' + strip1);
  const lowMidi = await page.evaluate(() => window.__fw.midiAt(0, 0));
  if (lowMidi !== 38) throw new Error('string 6 should be D2, midi 38, nearest to E2, got ' + lowMidi);
  const selTxt = await page.evaluate(() => document.querySelector('#setTuning option:checked').textContent);
  if (!/^Custom DADGBE/.test(selTxt)) throw new Error('the select should show the custom tuning: ' + selTxt);
  await page.click('#tabPlay');
  await page.waitForTimeout(300);
  const lbl1 = await page.evaluate(() => [...document.querySelectorAll('#playBoard svg.board .openlbl')].map((t) => t.textContent).join(''));
  if (lbl1 !== 'DADGBE') throw new Error('the play board letters should follow the custom tuning: ' + lbl1);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  const keptTune = await page.evaluate(() => ({ t: window.__fw.state.tuning, c: (window.__fw.state.custom || []).join(","), m: window.__fw.midiAt(0, 0) }));
  if (keptTune.t !== "custom" || keptTune.m !== 38) throw new Error("the custom tuning did not survive the reload: " + JSON.stringify(keptTune));
  await page.click('#tabDrills');
  await page.waitForTimeout(200);
  await page.selectOption('#setTuning', 'standard');
  await page.waitForTimeout(150);
  const strip2 = await page.evaluate(() => [...document.querySelectorAll('#tuneStrip .chip.tune b')].map((b) => b.textContent).join(''));
  if (strip2 !== 'EADGBE') throw new Error('back to standard should read EADGBE: ' + strip2);

  // ── 9 Oct: instruments. The string count is the tuning's; charts and sets follow the instrument ──
  const strip = () => page.evaluate(() => [...document.querySelectorAll('#tuneStrip .chip.tune b')].map((b) => b.textContent).join(''));
  const neck = () => page.evaluate(() => ({
    lbl: [...document.querySelectorAll('#playBoard svg.board .openlbl')].map((t) => t.textContent).join(''),
    strings: new Set([...document.querySelectorAll('#playBoard svg.board rect.cell')].map((r) => r.getAttribute('data-s'))).size,
  }));
  await page.selectOption('#setInst', 'ukulele');
  await page.waitForTimeout(200);
  if (await strip() !== 'GCEA') throw new Error('ukulele should read GCEA: ' + await strip());
  await page.click('#tabPlay'); await page.waitForTimeout(300);
  const uke = await neck();
  if (uke.lbl !== 'GCEA' || uke.strings !== 4) throw new Error('the ukulele neck should carry four strings GCEA: ' + JSON.stringify(uke));
  await page.click('#tabDrills'); await page.waitForTimeout(200);
  await page.selectOption('#setInst', 'banjo'); await page.waitForTimeout(200);
  if (await strip() !== 'GDGBD') throw new Error('banjo open G should read GDGBD: ' + await strip());
  await page.click('#tabPlay'); await page.waitForTimeout(300);
  const bj = await page.evaluate(() => ({
    lbl: [...document.querySelectorAll('#playBoard svg.board .openlbl')].map((t) => t.textContent).join(''),
    low: [...document.querySelectorAll('#playBoard svg.board rect.cell[data-s="0"]')].map((r) => +r.getAttribute('data-f')).filter((f) => f < 5).length,
    m4: window.__fw.midiAt(0, 4), m5: window.__fw.midiAt(0, 5), m7: window.__fw.midiAt(0, 7), d0: window.__fw.midiAt(1, 0),
  }));
  if (bj.lbl !== 'DGBD' || bj.low !== 0 || !Number.isNaN(bj.m4) || bj.m5 !== 67 || bj.m7 !== 69 || bj.d0 !== 50)
    throw new Error('the banjo fifth string should start at fret 5 as G4 (A at 7), no open letter, D3 beside it: ' + JSON.stringify(bj));
  // the banjo's short string sounds G4 at its start fret, not a fifth higher (Astra D23)
  const banjoG = await page.evaluate(() => { const fw = window.__fw, S = fw.state, keep = [S.inst, S.tuning];
    S.inst = 'banjo'; S.tuning = 'openg'; const m = fw.chordMidis([5, -1, -1, -1, -1]); S.inst = keep[0]; S.tuning = keep[1]; return m; });
  if (banjoG[0] !== 67) throw new Error('the banjo short string at its start fret should sound G4 (67): ' + banjoG.join(','));
  if (await page.evaluate(() => document.documentElement.innerHTML.includes('stephenfurpahs'))) throw new Error('the personal address is on the page');
  // a chart remembers its tuning: in Drop D it says so and offers to switch back (Astra D20)
  await page.click('#tabDrills'); await page.waitForTimeout(150);
  await page.selectOption('#setInst', 'guitar'); await page.waitForTimeout(200);   /* the banjo step above left the app on banjo */
  await page.evaluate(() => { const s = document.getElementById('setTuning'); s.value = 'dropd'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(150);
  await page.click('#tabCharts'); await page.waitForTimeout(150);
  await page.evaluate(() => { const rows = [...document.querySelectorAll('#chartList > *')]; const r = rows.find(x => x.textContent.includes('Smoke Test Jam')); if (r) r.click(); });
  await page.waitForTimeout(250);
  const tuneNote = await page.evaluate(() => { const n = document.getElementById('chartTuneNote'); return n.hidden ? '' : n.textContent; });
  if (!/Written in Standard/.test(tuneNote)) throw new Error('a standard chart opened in Drop D should say so: ' + tuneNote + ' ' + JSON.stringify(await page.evaluate(() => { const S = window.__fw.state; const c = S.charts.find(x => x.name === 'Smoke Test Jam'); return { tuning: S.tuning, inst: S.inst, ctun: c && c.tun, ctuning: c && c.tuning, rows: document.querySelectorAll('#chartList > *').length, view: [...document.querySelectorAll('section[id^=view-]')].filter(x => !x.hidden).map(x => x.id) }; })));
  await page.click('#chartTuneNote button');
  await page.waitForTimeout(200);
  if (await page.evaluate(() => window.__fw.state.tuning) !== 'standard') throw new Error('Switch should put the board back in standard');
  await page.click('#tabDrills'); await page.waitForTimeout(200);
  await page.selectOption('#setInst', 'mandolin'); await page.waitForTimeout(200);
  await page.click('#tabPlay'); await page.waitForTimeout(300);
  const mando = await neck();
  if (mando.lbl !== 'GDAE' || mando.strings !== 4) throw new Error('mandolin should read GDAE on four courses: ' + JSON.stringify(mando));
  await page.click('#tabDrills'); await page.waitForTimeout(200);
  await page.selectOption('#setInst', 'bass'); await page.waitForTimeout(200);
  if (await strip() !== 'EADG') throw new Error('bass should read EADG: ' + await strip());
  const triOpts = await page.evaluate(() => [...document.querySelectorAll('#triSet option')].map((o) => o.textContent).join('|'));
  if (triOpts !== '3 2 1|4 3 2') throw new Error('bass triad sets should be 3 2 1 and 4 3 2: ' + triOpts);
  await page.selectOption('#setTuning', 'five'); await page.waitForTimeout(200);
  if (await strip() !== 'BEADG') throw new Error('a five string bass is just a tuning: ' + await strip());
  await page.click('#tabCharts'); await page.waitForTimeout(200);
  const bassCharts = (await page.textContent('#chartList')).trim();
  if (bassCharts.includes('Smoke Test Jam')) throw new Error('a guitar chart must not list under the bass: ' + bassCharts);
  await page.click('#tabDrills'); await page.waitForTimeout(200);
  await page.selectOption('#setInst', 'guitar'); await page.waitForTimeout(200);
  if (await strip() !== 'EADGBE') throw new Error('back to guitar should read EADGBE: ' + await strip());
  await page.click('#tabCharts'); await page.waitForTimeout(200);
  const gtrCharts = (await page.textContent('#chartList')).trim();
  if (!gtrCharts.includes('Smoke Test Jam')) throw new Error('the guitar chart should be back: ' + gtrCharts);

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('smoke pass: try-before-you-add picker, key and circle chord sets with no repeats, the learned-chords test with green and red notes, no note twice running, oracles incl the 5x555x big shape, door, hunt with harder offer, naming, numbered triad, big-shape climb, ladder with common tones, Dorian major 6th in positions, stacked colors, hide the map, whole tone with an aug vamp, 24 frets, held slide voice, looper, new voices, the strings mirror, full screen, the bank, the chord brain naming Am7, keep to My chords, a 5 beat block, the jam board, chart round trip, rhythm room 3:2 and 4:3, reload, ' + tag);
});
