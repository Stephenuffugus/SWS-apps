#!/usr/bin/env node
/**
 * Off the Ball, headless engine harness
 * ---------------------------------------------------------------------------
 *   node apps/off-the-ball/test/engine-test.mjs            run all checks
 *   node apps/off-the-ball/test/engine-test.mjs --sweep    print the preset x skill matrix
 *   node apps/off-the-ball/test/engine-test.mjs --scout    print one preset against every archetype
 *
 * Every engine bug found so far was found by this file, not by looking at the
 * animation. Run it before and after any change to the simulation.
 *
 * It works by slicing the <script> block out of index.html and taking
 * everything above the RENDER banner, which is deliberately free of DOM calls.
 * That split is load-bearing: keep all canvas and document access below the
 * banner or this harness stops working.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* The app moved into the studio at apps/off-the-ball/ and this harness moved
   with it into test/, so the page is one directory up and is called
   index.html like every other app in the fleet. The RENDER split it depends
   on is unchanged and must stay that way. */
const HTML = path.join(HERE, '..', 'index.html');
const BANNER = '/* ================================================================ RENDER';

function loadEngine() {
  const html = fs.readFileSync(HTML, 'utf8');
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block found in index.html');
  const js = m[1];
  const cut = js.indexOf(BANNER);
  if (cut < 0) throw new Error('RENDER banner missing, the DOM/engine split is gone');

  const shim = `
    export const API = { clonePlay, buildSim, step, compile, makeProfile,
      SKILLS, PRESETS, MOVES, ARCHETYPES, PROF_KEYS, PROF_LIMITS,
      FORMATS, setFormat, offsideLine, getField: () => FIELD,
      goalSight, goalSightSpan, keeperTarget, inPenaltyArea, shotRange,
      setPlay: p => { play = p; }, setSkill: s => { skill = s; },
      getPlay: () => play };
  `;
  const tmp = path.join(HERE, '.engine.tmp.mjs');
  fs.writeFileSync(tmp, js.slice(0, cut) + shim);
  return tmp;
}

const tmp = loadEngine();
const { API } = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

/* ------------------------------------------------------------------ utils */
const MAX_FRAMES = 3000;                       // 50s of sim at 1/60

function simulate(playObj, tierKey) {
  API.setPlay(playObj);
  API.setSkill(API.SKILLS[tierKey]);
  const S = API.buildSim();
  let n = 0;
  while (!S.done && n < MAX_FRAMES) { API.step(S); n++; }
  return { S, frames: n, hung: n >= MAX_FRAMES };
}

function preset(key, tierKey, arch = 'balanced') {
  const p = API.clonePlay(key);
  for (const d of p.defenders) d.prof = API.makeProfile(tierKey, arch);
  return p;
}

const TIERS = Object.keys(API.SKILLS);
const KEYS = Object.keys(API.PRESETS);

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  ok    ${name}`);
};

/* ------------------------------------------------------------ reporting */
if (process.argv.includes('--sweep')) {
  console.log('\npreset x opposition baseline\n');
  for (const key of KEYS) {
    const row = TIERS.map(t => simulate(preset(key, t), t).S.verdict.text.split(': ')[0].padEnd(15));
    console.log('  ' + key.padEnd(12) + row.join('| '));
  }
  console.log('');
  process.exit(0);
}

if (process.argv.includes('--scout')) {
  const key = process.argv[process.argv.indexOf('--scout') + 1] || 'overlap';
  console.log(`\n${key} vs every scouted back line (Sunday league base)\n`);
  for (const arch of Object.keys(API.ARCHETYPES)) {
    const { S } = simulate(preset(key, 'rec', arch), 'rec');
    console.log('  ' + API.ARCHETYPES[arch].name.padEnd(22) + S.verdict.text);
  }
  console.log('');
  process.exit(0);
}

/* ------------------------------------------------------------ the checks */
console.log('\nOff the Ball, engine checks\n');

console.log('termination');
for (const key of KEYS) for (const t of TIERS) {
  const { S, hung } = simulate(preset(key, t), t);
  check(`${key}/${t} settles`, !hung && S.done && !!S.verdict,
        hung ? 'ran past the frame cap' : 'no verdict produced');
}

/* ---------------------------------------------------------------- golden
   THE SWEEP IS THE CONTRACT, per HANDOFF section 6, and until now it was a
   contract enforced by a human reading a terminal. Pinned here as a literal
   so any change to the simulation has to be argued for rather than noticed.

   Re-bless it deliberately:  node apps/off-the-ball/test/engine-test.mjs --bless
   That prints the block to paste in, so a change to tuned behaviour always
   shows up as a diff somebody signed off, never as a silent drift.

   Recorded honestly: giveandgo and isolate still read CLEAR CHANCE at all
   three tiers, so by LABEL a third of the library does not discriminate
   between opposition levels. Since the shot model landed the numbers inside
   those verdicts do move (giveandgo shows 2.6, 2.2 and 2.3 metres of open
   goal across the tiers), so the sweep is no longer blind there, only coarse.
   Still a tuning question for Stephen rather than something to paper over. */
const GOLDEN = {
  giveandgo: ['CLEAR CHANCE', 'CLEAR CHANCE', 'CLEAR CHANCE'],
  /* Moved 2026-08-29 by the keeper and the shot model. The competitive cell
     was HALF A YARD, which described the 2.3m of space around the receiver
     and said nothing about the goal, because there was no goalkeeper to say
     anything about. He is in the area with 2.1m of net showing past the
     keeper, so it is a half chance, and HALF CHANCE is the honest name for
     it. Watched in the browser before blessing. */
  decoy:     ['SMOTHERED', 'SMOTHERED', 'HALF CHANCE'],
  /* Moved 2026-08-29 by attacker reactivity, and this is the row that
     increment was for. HANDOFF issue 1 was that the overlapping fullback
     sprinted past his own passing lane and killed the move; at rec that read
     NO PASS ON. He now reads the cover at 1.87s, checks his run, and the ball
     reaches him with 1.6m of lane and 8.4m of space. Watched in the browser
     before blessing. All three tiers improve, which is the right direction
     and the whole point of the change. */
  overlap:   ['SPACE CREATED', 'SPACE CREATED', 'SPACE CREATED'],
  trap:      ['NO PASS ON', 'NO PASS ON', 'CLEAR CHANCE'],
  isolate:   ['CLEAR CHANCE', 'CLEAR CHANCE', 'CLEAR CHANCE'],
  blank:     ['NOTHING HAPPENS', 'NOTHING HAPPENS', 'NOTHING HAPPENS'],
};
const sweepRow = (key) =>
  TIERS.map((t) => simulate(preset(key, t), t).S.verdict.text.split(': ')[0]);

if (process.argv.includes('--bless')) {
  console.log('\nconst GOLDEN = {');
  for (const key of KEYS) console.log(`  ${key}: ${JSON.stringify(sweepRow(key))},`);
  console.log('};\n');
  process.exit(0);
}

console.log('\nthe sweep contract');
{
  const moved = [];
  for (const key of KEYS) {
    const want = GOLDEN[key];
    if (!want) { moved.push(`${key} is new and unpinned`); continue; }
    const got = sweepRow(key);
    got.forEach((cell, i) => {
      if (cell !== want[i]) moved.push(`${key}/${TIERS[i]}: ${want[i]} became ${cell}`);
    });
  }
  for (const key of Object.keys(GOLDEN)) {
    if (!KEYS.includes(key)) moved.push(`${key} is pinned but no longer exists`);
  }
  check('the preset x tier matrix is unchanged', moved.length === 0,
    moved.join(' | ') + '  (run with --bless if this change was intended)');
}

/* ------------------------------------------------------------- the keeper
   HANDOFF issues 2 and 3. The geometry is worth pinning by hand because it is
   the one place in this engine where a plausible looking number can be
   completely wrong and nobody would notice from the animation. */
console.log('\nthe keeper and the shot');
{
  API.setFormat('11v11');
  const F = API.getField();
  const goal = { x: F.cx, y: F.goalY };
  const wide = F.postR - F.postL;

  check('the goal is the width the Laws say', Math.abs(wide - 7.32) < 0.01, String(wide));

  /* nobody in the way */
  const far = { x: F.cx, y: F.goalY - 20 };
  check('with no keeper the whole goal is open',
    Math.abs(API.goalSight(far, null) - wide) < 0.01);

  /* a keeper right on top of the ball leaves nothing */
  check('a keeper on top of the ball leaves no goal',
    API.goalSight(far, { x: far.x, y: far.y + 0.2 }) === 0);

  /* a keeper BEHIND the shooter is not blocking anything */
  check('a keeper the runner has gone past blocks nothing',
    Math.abs(API.goalSight({ x: F.cx, y: F.goalY - 1 },
                           { x: F.cx, y: F.goalY - 3 }) - wide) < 0.01);

  /* central shooter, central keeper: both slivers equal, and each is less
     than half the goal because the body covers the middle */
  const mid = API.goalSightSpan(far, { x: F.cx, y: F.goalY - 4 });
  check('a set keeper narrows a central shot', mid.w > 0 && mid.w < wide / 2,
    `gap was ${mid.w.toFixed(2)}m of ${wide}m`);

  /* the gap opens on the FAR side from a wide shooter, which is the whole
     reason a keeper covers his near post */
  const fromRight = { x: F.postR + 8, y: F.goalY - 12 };
  const k = API.keeperTarget(fromRight);
  const span = API.goalSightSpan(fromRight, k);
  check('from a wide angle the keeper covers the near post',
    span.b <= F.cx + 0.01,
    `the visible gap was ${span.a.toFixed(1)}..${span.b.toFixed(1)} with centre ${F.cx}`);
  check('and a wide angle leaves less goal than a central one',
    span.w < mid.w * 2 + 0.01);

  /* he walks out as the ball comes, and gives ground back rather than being
     rounded, which was a real bug: the bisector rule alone stood him four
     metres behind a runner who was 1.5m from the line */
  const outFar = F.goalY - API.keeperTarget({ x: F.cx, y: F.goalY - 40 }).y;
  const outMid = F.goalY - API.keeperTarget({ x: F.cx, y: F.goalY - 14 }).y;
  const outNear = F.goalY - API.keeperTarget({ x: F.cx, y: F.goalY - 1.2 }).y;
  check('he stays home when the ball is miles away', outFar < 2.0, `${outFar.toFixed(2)}m`);
  check('he comes out as it approaches', outMid > outFar, `${outMid.toFixed(2)}m`);
  check('and he never lets the ball get goalside of him',
    outNear <= 1.2 + 1e-6, `he was ${outNear.toFixed(2)}m out with the ball 1.2m from the line`);

  /* the penalty area is the real one, per format, not 11v11 literals */
  for (const key of ['5v5', '7v7', '9v9', '11v11']) {
    API.setFormat(key);
    const f = API.getField();
    check(`${key}: the spot is inside its own penalty area`,
      API.inPenaltyArea({ x: f.cx, y: f.spotY }),
      'inBox used hardcoded 11v11 numbers and was false on every small pitch');
    check(`${key}: the halfway line is not in the penalty area`,
      !API.inPenaltyArea({ x: f.cx, y: 0 }));
    check(`${key}: shooting range fits the pitch`,
      API.shotRange() > 0 && API.shotRange() <= f.goalY,
      `range ${API.shotRange().toFixed(1)} on a half pitch of ${f.goalY.toFixed(1)}`);
  }
  API.setFormat('11v11');

  /* the stripe on the goal line is driven by S.shot, so a play that never got
     to a shot must not leave one behind for the renderer to draw */
  const shotOf = (key, tier) => {
    const p = API.clonePlay(key);
    for (const d of p.defenders) d.prof = API.makeProfile(tier, 'balanced');
    API.setPlay(p); API.setSkill(API.SKILLS[tier]);
    const S = API.buildSim();
    let n = 0; while (!S.done && n < 3000) { API.step(S); n += 1; }
    return { shot: S.shot, verdict: S.verdict.text };
  };
  const broke = shotOf('trap', 'rec');
  check('a play that broke down records no shot',
    /NO PASS ON|BROKE DOWN/.test(broke.verdict) && !broke.shot, broke.verdict);
  const scored = shotOf('giveandgo', 'rec');
  check('a play that reached a shooting position records one',
    !!scored.shot && scored.shot.w > 0, scored.verdict);
  check('and the recorded gap is inside the posts',
    scored.shot.a >= API.getField().postL - 1e-6
    && scored.shot.b <= API.getField().postR + 1e-6,
    `${scored.shot.a.toFixed(2)}..${scored.shot.b.toFixed(2)}`);
  check('and it matches the width the verdict quotes',
    Math.abs(scored.shot.w - parseFloat(scored.verdict.match(/([\d.]+)m of open goal/)[1])) < 0.06);
}

console.log('\nformats');
{
  /* The 11v11 row must reproduce the literals FIELD used to be typed as,
     exactly, because the sweep contract is pinned to plays measured on it.
     If this ever drifts, every pinned cell is meaningless. */
  API.setFormat('11v11');
  const F = API.getField();
  check('11v11 reproduces the original geometry exactly',
    F.w === 68 && F.goalY === 52.5 && F.yMin === -10 && F.cx === 34 &&
    F.pen.x0 === 13.84 && F.pen.x1 === 54.16 && F.pen.y0 === 36 &&
    F.ga.x0 === 24.84 && F.ga.x1 === 43.16 && F.ga.y0 === 47 &&
    F.spotY === 41.5 && F.postL === 30.34 && F.postR === 37.66 &&
    F.keeperY === 48 && F.circleR === 9.15 && F.k === 1,
    JSON.stringify({ w: F.w, goalY: F.goalY, yMin: F.yMin, pen: F.pen, keeperY: F.keeperY }));

  for (const k of Object.keys(API.FORMATS)) {
    API.setFormat(k);
    const G = API.getField();
    check(`${k}: the goal fits inside the penalty area`,
      G.pen.shape === 'arc' ? G.pen.r > (G.postR - G.postL) / 2
                            : G.pen.x0 < G.postL && G.pen.x1 > G.postR);
    check(`${k}: the penalty spot is on the pitch`, G.spotY > 0 && G.spotY < G.goalY);
    check(`${k}: the keeper stands in front of his own line`,
      G.keeperY > 0 && G.keeperY < G.goalY);
  }

  /* Offside is the rule that actually differs, and it is the one that would
     silently ruin a small sided board: null+0.4 reads as 0.4 and flags
     almost everybody offside, so this asserts Infinity rather than falsy. */
  API.setFormat('5v5');
  check('5 a side plays no offside',
    API.offsideLine({ defenders: [{ pos: { x: 10, y: 16 } }, { pos: { x: 14, y: 15 } }] }) === Infinity);
  API.setFormat('7v7');
  check('7 a side plays no offside',
    API.offsideLine({ defenders: [{ pos: { x: 10, y: 16 } }, { pos: { x: 14, y: 15 } }] }) === Infinity);
  API.setFormat('9v9');
  check('9 v 9 takes the second deepest player',
    API.offsideLine({ defenders: [{ pos: { x: 10, y: 30 } }, { pos: { x: 14, y: 28 } }] }) === 30);
  API.setFormat('11v11');
  check('11 a side still takes the second deepest player',
    API.offsideLine({ defenders: [{ pos: { x: 10, y: 44 } }, { pos: { x: 14, y: 40 } }] }) === 44);
  API.setFormat('11v11');
}

console.log('\nmove library');
{
  const bad = [];
  for (const [id, m] of Object.entries(API.MOVES)) {
    const p = preset('blank', 'rec');
    p.attackers[1].moves = [id];
    const { S } = simulate(p, 'rec');
    const a = S.attackers[1];
    if (m.kind !== 'combo' && a.len < 0.5) bad.push(`${id}: produced no run`);
    if (a.pos.x < 0 || a.pos.x > 68 || a.pos.y > 52.5) bad.push(`${id}: ended off the pitch`);
    if (!m.name || !m.aka || !m.teach || !m.signal) bad.push(`${id}: missing copy`);
    if (!(m.diff >= 1 && m.diff <= 3)) bad.push(`${id}: bad difficulty`);
  }
  check(`all ${Object.keys(API.MOVES).length} moves compile, stay in play, carry copy`,
        bad.length === 0, bad.join('; '));
}

console.log('\nprofiles');
{
  // Every archetype must stay inside the documented limits.
  const bad = [];
  for (const t of TIERS) for (const a of Object.keys(API.ARCHETYPES)) {
    const p = API.makeProfile(t, a);
    for (const k of API.PROF_KEYS) {
      const [lo, hi] = API.PROF_LIMITS[k];
      if (!(p[k] >= lo && p[k] <= hi)) bad.push(`${t}/${a}.${k}=${p[k]}`);
    }
  }
  check('every tier x archetype stays inside PROF_LIMITS', bad.length === 0, bad.join(' '));

  // Scouting one defender differently must change what happens to him. If this
  // ever passes trivially the per-defender plumbing has been broken again.
  const line = arch => {
    const p = preset('giveandgo', 'rec');
    p.defenders[0].prof = API.makeProfile('rec', arch);
    const { S } = simulate(p, 'rec');
    /* The ledger writes "<label>: <what he did>". This used to look for an
       em dash, and when the studio dash sweep changed the separator the
       find returned nothing for all three archetypes, so three empty
       strings compared equal and the check failed as "all three identical"
       rather than "I could not find the line". Match the label, and say so
       when there is no line at all. */
    const ev = S.events.find(e => e.msg.startsWith(`${S.defenders[0].label}:`));
    return ev ? ev.msg : '';
  };
  const straight = line('balanced'), diver = line('diver'), deep = line('deep');
  check('the ledger reports on the rescouted defender at all',
        !!straight, 'no ledger line found for the first defender');
  check('rescouting one defender changes his own outcome',
        !!straight && straight !== diver && straight !== deep,
        `all three identical: ${straight}`);

  // An aggressive defender must be draggable further than a disciplined one.
  const drift = arch => {
    const p = preset('giveandgo', 'rec');
    p.defenders[0].prof = API.makeProfile('rec', arch);
    return simulate(p, 'rec').S.defenders[0].maxDrift;
  };
  check('"dives in" is dragged further than "sits deep"', drift('diver') > drift('deep'),
        `diver ${drift('diver').toFixed(1)}m vs deep ${drift('deep').toFixed(1)}m`);
}

console.log('\nperception and feints');
{
  // A slow-reacting defender must buy a feint harder than a quick-reading one.
  const bought = arch => {
    const p = preset('isolate', 'rec', arch);
    const { S } = simulate(p, 'rec');
    const ev = S.events.find(e => e.cls === 'trick');
    return ev ? parseFloat(ev.msg.match(/([\d.]+)m/)?.[1] ?? 0) : 0;
  };
  check('a reader buys a feint less than a plain defender',
        bought('reader') < bought('balanced'),
        `reader ${bought('reader')}m vs balanced ${bought('balanced')}m`);
}

console.log('\nreading the run');
{
  /* A controlled fixture rather than a preset, so the claim is about the
     mechanism and not about tuned geometry. One runner, one long straight
     run, and a cone: a defender with ballPull 0 so he stays where he is put.
     The fixture self checks, because a cone that drifts proves nothing. */
  /* The runner uses a MOVE, never a drawn path. A drawn path is exempt from
     diverting by design, so building the fixture out of one would make this
     whole block test nothing, which is what the first version of it did. */
  const cone = (at) => {
    const p = API.clonePlay('blank');
    p.attackers = [
      { id: 'a1', label: '1', x: 34, y: 12, hasBall: true, moves: [], custom: '', path: [] },
      { id: 'a2', label: '2', x: 20, y: 16, hasBall: false, moves: ['blindside'], custom: '', path: [] },
    ];
    /* A genuinely static cone. ballPull 0 alone was not enough: a zone
       defender still drifts, and a fixture whose cone wanders is a fixture
       that stops proving anything. */
    const prof = API.makeProfile('rec', 'balanced');
    prof.ballPull = 0; prof.zoneR = 0.1; prof.stepUp = 0;
    prof.topSpeed = 0.01; prof.accel = 0.01;
    p.defenders = [{ id: 'd1', label: 'D', x: at.x, y: at.y, mode: 'zone', mark: null,
      anchor: { x: at.x, y: at.y }, prof }];
    p.passes = [];
    return p;
  };
  const run = (p) => { API.setPlay(p); API.setSkill(API.SKILLS.rec);
    const S = API.buildSim(); let n = 0;
    while (!S.done && n < MAX_FRAMES) { API.step(S); n++; }
    return S; };

  /* Where does that run actually END? Solve it rather than assume it: run
     once with the cone parked in the far corner, and read the finish. Then
     put the cone exactly there. A fixture that guesses the target space is a
     fixture that can silently stop proving anything. */
  const clear = run(cone({ x: 64, y: 18 }));
  const r = clear.attackers[1];
  const spot = { x: r.pos.x, y: r.pos.y };
  check('an uncontested run is never touched', r.bails === 0,
    `bailed ${r.bails} times with nobody near him`);
  check('the fixture finds a real run to test',
    Math.hypot(spot.x - 20, spot.y - 16) > 8,
    `the run only covered ${Math.hypot(spot.x - 20, spot.y - 16).toFixed(1)}m`);

  const covered = run(cone(spot));
  const coneEnd = covered.defenders[0].pos;
  check('the fixture cone stays on the target space',
    Math.hypot(coneEnd.x - spot.x, coneEnd.y - spot.y) < 3.5,
    `cone drifted to ${coneEnd.x.toFixed(1)},${coneEnd.y.toFixed(1)}`);
  check('a run into a covered space diverts',
    covered.attackers[1].bails > 0,
    'the runner carried on into a space with a defender standing in it');
  check('a diverted runner ends up somewhere else',
    Math.hypot(covered.attackers[1].pos.x - spot.x,
               covered.attackers[1].pos.y - spot.y) > 1.5);

  /* a dragged line is a statement of intent, not a suggestion */
  const drawn = cone(spot);
  drawn.attackers[1].path = [{ x: 20, y: 16 }, { x: 20, y: 26 }, { x: spot.x, y: spot.y }];
  const hand = run(drawn);
  check('a hand drawn run is never diverted', hand.attackers[1].bails === 0);

  /* and the read is late, like everything else in this engine */
  const firstRead = covered.events.find((e) => e.cls === 'read');
  check('a divert is reported in the ledger', !!firstRead);
  if (firstRead) check('no read fires before a runner could have seen anything',
    firstRead.t >= 0.35, `fired at ${firstRead.t}s`);

  /* nobody dithers: the cap holds across every preset and tier */
  let worst = 0;
  for (const key of KEYS) for (const t of TIERS) {
    const { S } = simulate(preset(key, t), t);
    for (const a of S.attackers) worst = Math.max(worst, a.bails || 0);
  }
  check('nobody reroutes more than twice', worst <= 2, `somebody bailed ${worst} times`);
  check('bails is always a real number',
    KEYS.every((k) => simulate(preset(k, 'rec'), 'rec').S.attackers.every((a) => typeof a.bails === 'number')));
}

console.log('\npassing');
{
  // A pass must be withheld rather than played into a defender.
  let anySkipped = false;
  for (const key of KEYS) for (const t of TIERS) for (const a of Object.keys(API.ARCHETYPES)) {
    const { S } = simulate(preset(key, t, a), t);
    if (S.passes.some(p => p.skipped)) { anySkipped = true; break; }
  }
  check('a covered pass is withheld, not forced', anySkipped);

  // No pass may ever be logged as played while its receiver is offside.
  const bad = [];
  for (const key of KEYS) for (const t of TIERS) {
    const { S } = simulate(preset(key, t), t);
    if (S.events.some(e => e.cls === 'pass') && /offside/i.test(S.verdict.text)) bad.push(`${key}/${t}`);
  }
  check('no pass is played to an offside runner', bad.length === 0, bad.join(' '));
}

console.log('\nshare round-trip');
{
  // encode/decode lives below the RENDER banner, so this only checks that the
  // profile shape a share link has to carry is stable.
  const p = preset('overlap', 'rec', 'watcher');
  const keys = API.PROF_KEYS.every(k => typeof p.defenders[0].prof[k] === 'number');
  check('defender profiles are all numeric and serialisable',
        keys && typeof p.defenders[0].prof.arch === 'string');
}

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' check(s) failed'}\n`);
process.exit(failures === 0 ? 0 : 1);
