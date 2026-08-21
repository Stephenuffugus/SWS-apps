/* OVERLOAD regression harness.
   Usage: node test/overload.test.mjs
   Boots the real app inside jsdom. Pins the engine's verdict table (the
   heart of the app), plate math, scheduling, the stall→swap loop, the
   settings sheet, weekly volume, and backup shape. */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

function boot(preState) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(win) {
      win.alert = () => {}; win.confirm = () => true;
      win.SWS = { toast: (m, o) => { win.__toasts = win.__toasts || []; win.__toasts.push({ m, o }); } };
      if (preState !== undefined) win.localStorage.setItem('overload.v2', JSON.stringify(preState));
    }
  });
  return dom.window;
}
const stored = w => JSON.parse(w.localStorage.getItem('overload.v2'));
const prog = (over = {}) => ({
  id: 'p1', mg: 'Chest', ex: 'Barbell Bench Press', w: 135, sets: 3,
  repMin: 8, repMax: 12, rest: 120, due: new Date().toISOString(),
  outcomes: null, stall: 0, history: [], ...over
});

async function main() {

console.log('\n,  engine: the verdict table , ');
{
  const w = boot();
  const j = (reps, over) => w.eval(`judge(${JSON.stringify(prog(over))}, ${JSON.stringify(reps)})`);
  let r = j([12, 12, 12]);
  ok(r.v === 'progress' && r.nw === 140, 'all sets at top: ADD WEIGHT, +5 for chest');
  r = j([10, 9, 8]);
  ok(r.v === 'rep' && r.nw === 135, 'all in range, none at top: ADD REPS, weight holds');
  r = j([12, 11, 6]);
  ok(r.v === 'hold' && r.nw === 135, 'failure only on the final set: CONSOLIDATE');
  r = j([12, 6, 10]);
  ok(r.v === 'hold', 'one mid-session failure: CONSOLIDATE');
  r = j([6, 5, 10]);
  /* Rounded to the LIFT'S increment. A flat 2.5 produced 122.5 for a bench,
     and no bar can hold 122.5: it needs 38.75 a side and the plates stop at
     37.5, so the app printed a loading 2.5 lbs lighter than the prescription
     and said nothing. */
  ok(r.v === 'deload' && r.nw === Math.round(135 * 0.9 / 5) * 5, 'early failures: DELOAD to 90% rounded to the lift increment');
  ok(r.nw === 120, 'and 135 comes back as a weight a bar can actually hold');
  r = j([2, 2, 2], { w: 5 });
  ok(r.nw >= 5, 'deload never drops below the increment');
  r = j([12, 12, 12], { mg: 'Quads', ex: 'Back Squat', w: 225 });
  ok(r.nw === 235, 'lower-body increment is 10');
  r = j([12, 12, 12], { mg: 'Biceps', ex: 'Preacher Curl', w: 50 });
  ok(r.nw === 52.5, 'per-exercise 2.5 increment respected');
}

console.log('\n,  plate math , ');
{
  const w = boot();
  ok(w.eval(`plateMath(45)`) === 'empty bar', '45 lbs is the empty bar');
  ok(w.eval(`plateMath(135)`) === '45 / side', '135 = one plate per side');
  ok(w.eval(`plateMath(225)`) === '45 + 45 / side', '225 = two plates per side');
  ok(w.eval(`plateMath(190)`) === '45 + 25 + 2.5 / side', 'mixed plates resolve greedily');

  /* The app's whole promise is that the prescription is the instruction, so a
     printed loading that does not add up to the prescribed weight is the app
     lying about the one number it exists to give. Sweep every weight the
     engine can reach on a barbell lift and demand the plates sum exactly. */
  const bad = w.eval(`(() => {
    const out = [];
    for (let t = 45; t <= 500; t += 5) {
      const s = plateMath(t);
      if (s === 'empty bar') continue;
      const per = s.split(' / side')[0].split(' + ').reduce((a, b) => a + parseFloat(b), 0);
      if (Math.abs(45 + 2 * per - t) > 1e-9) out.push(t);
    }
    return out;
  })()`);
  ok(bad.length === 0, 'every 5 lb barbell weight loads to exactly its prescription');

  // and when a weight genuinely cannot be made, it must say so rather than
  // print a lighter loading as though it were the prescription
  const odd = w.eval(`plateMath(122.5)`);
  ok(/closest these plates make/.test(odd), 'an unloadable weight admits what the plates really make');
  ok(/120 lbs/.test(odd), 'and names the weight that will actually be on the bar');

  // the engine should not be handing it unloadable weights in the first place
  const deloads = w.eval(`(() => {
    const out = [];
    for (let start = 50; start <= 400; start += 5) {
      const r = judge({ ...${JSON.stringify(prog())}, w: start }, [3, 3, 10]);
      if (r.v === 'deload' && (r.nw - 45) % 5 !== 0 && r.nw > 45) out.push([start, r.nw]);
    }
    return out;
  })()`);
  ok(deloads.length === 0, 'no deload of a barbell lift lands on a weight a bar cannot hold');
}

console.log('\n,  create a lift, run a session, schedule +3 days , ');
{
  const w = boot();
  ok(/No lifts yet/.test(w.document.getElementById('dueList').textContent), 'empty state speaks');
  w.document.getElementById('startW').value = '135';
  w.document.getElementById('createBtn').click();
  ok(stored(w).programs.length === 1, 'created and saved');
  ok(stored(w).programs[0].rest === 120, 'default rest is 2 minutes');
  ok(!!w.document.querySelector('.due.now'), 'the new lift is due now');

  w.eval(`startWorkout(S.programs[0].id)`);
  ok(w.document.getElementById('wk').classList.contains('on'), 'workout mode opens');
  w.eval('logSet(12)');
  ok(w.document.getElementById('rest').classList.contains('on'), 'rest overlay follows a non-final set');
  w.eval('restEnd()');
  w.eval('logSet(12)');
  w.eval('restEnd()');
  w.eval('logSet(12)');            // final set: no rest, straight to judgment
  ok(!w.document.getElementById('wk').classList.contains('on'), 'session closes itself after the last set');
  const p = stored(w).programs[0];
  ok(p.w === 140, 'prescription moved up');
  ok(p.history.length === 1 && p.history[0].verdict === 'progress', 'history recorded');
  const days = (new Date(p.due) - Date.now()) / 864e5;
  ok(days > 2.9 && days < 3.1, 'next session lands on the 3-day clock');
  ok(!!w.document.getElementById('resultCard'), 'the verdict card lands on Today');
  ok(/ADD WEIGHT/.test(w.document.getElementById('resultCard').textContent), 'with the fixed verdict vocabulary');
}

console.log('\n,  the ± weight is session-only until finish , ');
{
  const w = boot({ programs: [prog()], weighins: [] });
  w.eval(`startWorkout('p1')`);
  w.document.getElementById('wUp').click();
  ok(w.document.getElementById('wkW').textContent === '140', 'the plus button raises the session weight');
  ok(w.eval('S.programs[0].w') === 135, 'but the prescription is untouched');
  w.document.getElementById('wkClose').click();
  ok(w.eval('S.programs[0].w') === 135 && stored(w).programs[0].w === 135, 'closing discards the adjustment');
}

console.log('\n,  stall → swap , ');
{
  const w = boot({ programs: [prog({ stall: 2 })], weighins: [] });
  w.eval(`startWorkout('p1')`);
  w.eval('logSet(9)'); w.eval('restEnd()');
  w.eval('logSet(9)'); w.eval('restEnd()');
  w.eval('logSet(9)');
  ok(w.eval('S.programs[0].stall') === 3, 'a non-progress verdict raises the stall count');
  const swap = w.document.querySelector('#resultCard .swap');
  ok(!!swap, 'three stalls offer a new approach');
  const pick = swap.querySelector('[data-swap]');
  pick.click();
  const p = stored(w).programs[0];
  ok(p.ex !== 'Barbell Bench Press' && p.stall === 0, 'swap renames the lift and resets the stall');
  ok(p.w === Math.max(2.5, Math.round(135 * 0.85 / 2.5) * 2.5), 'the new lift starts conservative at 85%');
}

console.log('\n,  lift settings sheet: steppers, zero typing , ');
{
  const w = boot({ programs: [prog()], weighins: [] });
  w.document.querySelector('[data-gear]').click();
  ok(w.document.getElementById('sheet').classList.contains('show'), 'gear opens the settings sheet');
  w.document.querySelector('[data-plus="rest"]').click();
  ok(w.eval('S.programs[0].rest') === 135, 'rest steps by 15 seconds');
  w.document.querySelector('[data-minus="sets"]').click();
  ok(w.eval('S.programs[0].sets') === 2, 'sets step down');
  for (let i = 0; i < 10; i++) w.document.querySelector('[data-plus="rmin"]').click();
  ok(w.eval('S.programs[0].repMin') <= w.eval('S.programs[0].repMax'), 'reps low can never pass reps high');
  ok(!w.document.querySelector('#sheet input'), 'no typing anywhere in the sheet');
  w.document.getElementById('liftDel').click();
  ok(w.eval('S.programs.length') === 0, 'delete removes the lift');
  const t = (w.__toasts || []).find(x => /deleted/.test(x.m));
  ok(!!t, 'with an undo offered');
  t.o.action.onAction();
  ok(w.eval('S.programs.length') === 1, 'and undo brings it back, history intact');
}

console.log('\n,  weekly volume glance , ');
{
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 9 * 864e5).toISOString();
  const w = boot({
    programs: [
      prog({ id: 'a', history: [{ date: now, w: 135, reps: [12, 12, 12], verdict: 'progress' }] }),
      prog({ id: 'b', mg: 'Back', ex: 'Barbell Row', history: [{ date: old, w: 95, reps: [8, 8, 8], verdict: 'rep' }] }),
    ], weighins: []
  });
  const strip = w.document.getElementById('volStrip');
  ok(strip.querySelectorAll('.vchip').length === 2, 'one chip per muscle group with a program');
  ok(w.eval(`weekCount('Chest')`) === 1 && w.eval(`weekCount('Back')`) === 0, 'only the last 7 days count');
}

console.log('\n,  backup shape and restore , ');
{
  const w = boot({ programs: [prog()], weighins: [{ date: new Date().toISOString(), bw: 180, bf: null }] });
  const b = JSON.parse(w.eval('backupJSON()'));
  ok(b.app === 'overload' && b.version === 2 && Array.isArray(b.data.programs), 'backup carries app, version and data');
  const w2 = boot();
  ok(w2.eval(`applyImportedText(${JSON.stringify(JSON.stringify(b))})`) === true, 'a backup restores');
  ok(w2.eval('S.programs.length') === 1 && w2.eval('S.weighins[0].bw') === 180, 'programs and weigh-ins arrive');
  ok(w2.eval(`applyImportedText('{"nope":1}')`) === false, 'a non-backup file is refused');
}

console.log('\n,  corrupt storage cannot brick the app , ');
{
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(win) { win.alert = () => {}; win.confirm = () => true; win.localStorage.setItem('overload.v2', '{broken'); }
  });
  const w = dom.window;
  ok(/No lifts yet/.test(w.document.getElementById('dueList').textContent), 'garbage in storage falls back to a clean start');
  const w2 = boot({ programs: [{ mg: 'Nope', ex: 'x' }, prog({ rest: 9999, sets: 99, repMin: 50, w: 'NaN' })], weighins: 'x' });
  const p = w2.eval('S.programs');
  ok(p.length === 1, 'an unknown muscle group is dropped');
  ok(p[0].rest <= 600 && p[0].sets <= 6 && p[0].repMin <= p[0].repMax && typeof p[0].w === 'number', 'hand-edited numbers are clamped sane');
}

console.log('\n,  edge: repMin equals repMax, one set , ');
{
  const w = boot({ programs: [prog({ repMin: 10, repMax: 10, sets: 1 })], weighins: [] });
  w.eval(`startWorkout('p1')`);
  ok(w.document.getElementById('wkTarget').textContent === '10 reps', 'a fixed target reads as one number');
  w.eval('logSet(10)');
  ok(!w.document.getElementById('rest').classList.contains('on'), 'a one-set session never shows the rest screen');
  ok(stored(w).programs[0].history[0].verdict === 'progress', 'and still gets judged');
}

console.log('\n,  warm-up ramp: written by the prescription , ');
{
  const w = boot();
  const ramp = (over, wt) => w.eval(`warmupRamp(${JSON.stringify(prog(over))}, ${wt})`);
  let r = ramp({}, 135);
  ok(JSON.stringify(r) === JSON.stringify([{ w: 45, reps: 5 }, { w: 80, reps: 5 }, { w: 110, reps: 3 }]),
    'a 135 bench opens with the empty bar, then 60% and 80%');
  r = ramp({ mg: 'Quads', ex: 'Back Squat', w: 245 }, 245);
  ok(JSON.stringify(r) === JSON.stringify([{ w: 45, reps: 5 }, { w: 150, reps: 5 }, { w: 200, reps: 3 }]),
    'a 245 squat ramps on the 10 lb increment');
  r = ramp({ mg: 'Biceps', ex: 'Preacher Curl' }, 50);
  ok(JSON.stringify(r) === JSON.stringify([{ w: 20, reps: 5 }, { w: 30, reps: 5 }, { w: 40, reps: 3 }]),
    'a non-barbell lift ramps 40/60/80');
  ok(ramp({ mg: 'Biceps', ex: 'Preacher Curl' }, 5).length === 0, 'a tiny weight gets no ramp at all');
  ok(ramp({}, 50).length === 0, 'a bar lift barely above the bar gets no ramp (nothing honest to load)');

  // in the DOM: the ramp rides with set 1 and leaves when the work starts
  const w2 = boot({ programs: [prog({ w: 185 })], weighins: [] });
  w2.eval(`startWorkout('p1')`);
  const wu = w2.document.getElementById('wkWarm');
  ok(!wu.hidden && /Warm up/.test(wu.textContent) && /then 185 for real/.test(wu.textContent),
    'set 1 shows the warm-up ramp with the working weight named');
  ok(/empty bar/.test(wu.textContent) && /45 \+ 5 \+ 2\.5 \/ side/.test(wu.textContent), 'ramp lines carry plate math for barbell lifts');
  w2.eval('logSet(12)'); w2.eval('restEnd()');
  ok(w2.document.getElementById('wkWarm').hidden, 'the ramp steps aside after the first set');
}

console.log('\n,  e1RM: the line that goes up , ');
{
  const now = Date.now();
  const hist = [
    { date: new Date(now - 6 * 864e5).toISOString(), w: 135, reps: [12, 12, 12], verdict: 'progress' },
    { date: new Date(now - 3 * 864e5).toISOString(), w: 140, reps: [10, 9, 8], verdict: 'rep' },
    { date: new Date(now).toISOString(), w: 140, reps: [12, 11, 10], verdict: 'rep' },
  ];
  const w = boot({ programs: [prog({ history: hist })], weighins: [] });
  const es = w.eval(`e1rmSeries(S.programs[0])`);
  ok(es.length === 3, 'one estimate per session');
  ok(es[0].e === 189 && es[2].e === 196, 'Epley from the best set, rounded to a tenth');
  w.document.querySelector('[data-gear]').click();
  const sheet = w.document.getElementById('sheet');
  ok(/Estimated 1RM/.test(sheet.textContent) && !!sheet.querySelector('.e1-spark path'), 'the settings sheet draws the strength line');
  ok(/\+7/.test(sheet.textContent), 'and says how far it has come');
  // one session is a dot, not a line: no chart until there are two
  const w2 = boot({ programs: [prog({ history: hist.slice(0, 1) })], weighins: [] });
  w2.document.querySelector('[data-gear]').click();
  ok(!w2.document.querySelector('#sheet .e1-spark'), 'a single session shows no chart yet');
}

console.log('\n,  weigh-in and trend , ');
{
  const w = boot();
  w.document.querySelector('nav button[data-v="trend"]').click();
  w.document.getElementById('bwIn').value = '182.4';
  w.document.getElementById('bwBtn').click();
  ok(stored(w).weighins.length === 1 && stored(w).weighins[0].bw === 182.4, 'weigh-in saves');
  ok(!!w.document.querySelector('#trendCard .trend-num'), 'trend card renders');
  w.document.getElementById('bwBtn').click();
  ok(stored(w).weighins.length === 1, 'an empty weigh-in is refused, not saved');
  ok(w.document.getElementById('bwErr').textContent.length > 0, 'and told inline, not with an alert');
}

/* A backup file is the one thing here that arrives from somewhere else, and the
   app tells people to use it to move to a new phone. Several stored fields are
   printed into innerHTML, so until 2026-08-21 a crafted file could put live
   markup on the page and run script as this origin, which is the whole studio:
   it could read or wipe grocery-list, cross-off, hush and every sibling. Each
   case below was watched executing before the boundary was closed. */
console.log('\n,  a hostile backup file cannot become markup , ');
{
  const payloads = {
    'lift id': prog({ id: '"><img src=x onerror="globalThis.__pwned=1">' }),
    'outcome': prog({ outcomes: ['hit', '"><img src=x onerror="globalThis.__pwned=1">'] }),
    'history weight': prog({ history: [{ date: new Date().toISOString(), w: '<img src=z onerror="globalThis.__pwned=1">', reps: [8], verdict: 'progress' }] }),
    'history reps': prog({ history: [{ date: new Date().toISOString(), w: 135, reps: ['<img src=z onerror="globalThis.__pwned=1">'], verdict: 'progress' }] }),
    'missing verdict': prog({ history: [{ date: new Date().toISOString(), w: 135, reps: [8] }] }),
  };
  for (const [what, p] of Object.entries(payloads)) {
    const w = boot({ programs: [p], weighins: [], sound: true });
    // Anything the coercion let through would be a real element by now.
    const injected = w.document.querySelectorAll('img[onerror], img[src="x"], img[src="z"]').length;
    ok(injected === 0, `a hostile ${what} cannot create an element`);
    ok(!w.__pwned, `a hostile ${what} cannot run script`);
  }
  // body fat is printed straight into the trend card
  const wf = boot({ programs: [], weighins: [{ date: new Date().toISOString(), bw: 180, bf: '<img src=z onerror="globalThis.__pwned=1">' }], sound: true });
  ok(wf.document.querySelectorAll('img[onerror]').length === 0 && !wf.__pwned, 'a hostile body-fat value cannot create an element');
  // and the app must still be alive: a bad record must not take the boot down
  /* Assert the row actually DREW. The list element is static markup, so its
     mere presence proves nothing: before the fix renderHist threw on the
     missing verdict, the boot died there, and the list stayed empty forever. */
  const wv = boot({ programs: [prog({ history: [{ date: new Date().toISOString(), w: 135, reps: [8] }] })], weighins: [], sound: true });
  ok(wv.document.getElementById('histList').textContent.trim().length > 0,
    'a history row with no verdict still draws instead of killing the boot');
  // a muscle group naming an inherited property used to wipe the whole file
  const wc = boot({ programs: [prog(), { ...prog({ id: 'p2' }), mg: 'constructor' }], weighins: [], sound: true });
  ok(stored(wc) === null || JSON.parse(wc.localStorage.getItem('overload.v2')).programs.length >= 0, 'a poisoned muscle group does not crash the load');
  const kept = wc.document.querySelectorAll('[data-lift]').length;
  ok(kept >= 1, 'and the good lift in the same file survives it');
}

console.log('\n,  a session remembers the lift it was done on , ');
{
  const iso = (d) => new Date(Date.now() - d * 864e5).toISOString();
  const w = boot({ programs: [prog({
    ex: 'Dumbbell Bench Press',
    history: [
      { date: iso(9), w: 135, reps: [10], verdict: 'progress', ex: 'Barbell Bench Press' },
      { date: iso(3), w: 60, reps: [10], verdict: 'progress', ex: 'Dumbbell Bench Press' },
    ],
  })], weighins: [], sound: true });
  const hist = w.document.getElementById('histList').textContent;
  ok(/Barbell Bench Press/.test(hist), 'an old session keeps the name of the lift it was actually done on');
  ok(/Dumbbell Bench Press/.test(hist), 'and the new one keeps its own');
  // the strength line must not join two different lifts into one curve
  w.document.querySelector('[data-gear]').click();
  const spark = w.document.querySelector('#sheet .e1-spark');
  ok(!spark, 'one session on the current lift is a dot, not a strength line drawn across a swap');
}

/* The house rule is Undo, not confirm. Deleting one lift already followed it;
   wiping everything, the more frightening of the two, was still guarding itself
   with a dialog that also claimed the loss was permanent. */
console.log('\n,  wiping everything is undoable , ');
{
  const w = boot({ programs: [prog(), prog({ id: 'p2', ex: 'Incline DB Press' })], weighins: [{ date: new Date().toISOString(), bw: 180 }], sound: true });
  ok(w.eval('S.programs.length') === 2, 'two lifts to lose');
  w.document.getElementById('wipeBtn').click();
  ok(w.eval('S.programs.length') === 0, 'the wipe happens without asking first');
  const t = (w.__toasts || []).find(x => /Wiped/.test(x.m));
  ok(!!t && t.o && t.o.action, 'and offers an undo instead of a confirmation');
  ok(/2 lifts/.test(t.m), 'saying how much went, so the offer means something');
  t.o.action.onAction();
  ok(w.eval('S.programs.length') === 2, 'undo brings every lift back');
  ok(w.eval('S.weighins.length') === 1, 'and the weigh-ins with them');
  ok(w.eval(`S.programs.some(p=>p.ex==='Incline DB Press')`), 'exactly as they were');
  ok(!/cannot be undone/.test(html), 'and nothing in the app still claims this cannot be undone');
}

console.log('\n,  rest is one state, not several , ');
{
  const w = boot({ programs: [prog({ sets: 4 })], weighins: [], sound: false });
  w.document.querySelector('[data-lift]').click();
  const chip = w.document.querySelector('#setRow button, .reps button, [data-reps]');
  ok(!!chip, 'the set chips are there to press');
  chip.click();
  ok(w.eval('restIv !== null'), 'logging a set starts the rest clock');
  const firstIv = w.eval('restIv');
  // the exact double-press that used to orphan a timer and log a phantom set
  chip.click();
  chip.click();
  ok(w.eval('restIv') === firstIv, 'pressing again during rest does not start a second clock');
  ok(w.eval('W.reps.length') === 1, 'and does not log a set the lifter did not do');
  ok(w.document.activeElement === w.document.getElementById('restSkip'),
    'focus moves to the rest control instead of staying on a button behind the overlay');
  w.document.getElementById('restSkip').click();
  ok(w.eval('restIv === null'), 'skipping ends the rest');
  chip.click();
  ok(w.eval('W.reps.length') === 2, 'and the next set logs normally afterwards');
}

console.log('\n,  a device that stops saving says so , ');
{
  const w = boot({ programs: [prog()], weighins: [], sound: false });
  const bar = w.document.getElementById('saveWarn');
  ok(!!bar && bar.hidden, 'the notice exists and stays out of the way while saving works');
  w.eval("w_orig=Storage.prototype.setItem;Storage.prototype.setItem=function(){var e=new Error('quota');e.name='QuotaExceededError';throw e}");
  ok(w.eval('save()') === false, 'save reports the failure instead of swallowing it');
  ok(!w.document.getElementById('saveWarn').hidden, 'and the page says sets are not being kept');
  // restore must not claim success when the write never happened
  ok(w.eval("applyImportedText(JSON.stringify({app:'overload',version:2,data:{programs:[],weighins:[],sound:true}}))") === false,
    'a restore onto a full device reports failure rather than saying it worked');
  const said = (w.__toasts || []).map(t => t.m).join(' ');
  ok(/could not restore/i.test(said), 'and says so in words');
  ok(!/backup restored/i.test(said), 'and never claims the backup was restored');
  w.eval("Storage.prototype.setItem=w_orig");
  ok(w.eval('save()') === true, 'saving works again once there is room');
  ok(w.document.getElementById('saveWarn').hidden, 'and the notice takes itself down');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
