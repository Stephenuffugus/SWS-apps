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

console.log('\n— engine: the verdict table —');
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
  ok(r.v === 'deload' && r.nw === Math.round(135 * 0.9 / 2.5) * 2.5, 'early failures: DELOAD to 90% rounded to 2.5');
  r = j([2, 2, 2], { w: 5 });
  ok(r.nw >= 5, 'deload never drops below the increment');
  r = j([12, 12, 12], { mg: 'Quads', ex: 'Back Squat', w: 225 });
  ok(r.nw === 235, 'lower-body increment is 10');
  r = j([12, 12, 12], { mg: 'Biceps', ex: 'Preacher Curl', w: 50 });
  ok(r.nw === 52.5, 'per-exercise 2.5 increment respected');
}

console.log('\n— plate math —');
{
  const w = boot();
  ok(w.eval(`plateMath(45)`) === 'empty bar', '45 lbs is the empty bar');
  ok(w.eval(`plateMath(135)`) === '45 / side', '135 = one plate per side');
  ok(w.eval(`plateMath(225)`) === '45 + 45 / side', '225 = two plates per side');
  ok(w.eval(`plateMath(190)`) === '45 + 25 + 2.5 / side', 'mixed plates resolve greedily');
}

console.log('\n— create a lift, run a session, schedule +3 days —');
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

console.log('\n— the ± weight is session-only until finish —');
{
  const w = boot({ programs: [prog()], weighins: [] });
  w.eval(`startWorkout('p1')`);
  w.document.getElementById('wUp').click();
  ok(w.document.getElementById('wkW').textContent === '140', 'the plus button raises the session weight');
  ok(w.eval('S.programs[0].w') === 135, 'but the prescription is untouched');
  w.document.getElementById('wkClose').click();
  ok(w.eval('S.programs[0].w') === 135 && stored(w).programs[0].w === 135, 'closing discards the adjustment');
}

console.log('\n— stall → swap —');
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

console.log('\n— lift settings sheet: steppers, zero typing —');
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

console.log('\n— weekly volume glance —');
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

console.log('\n— backup shape and restore —');
{
  const w = boot({ programs: [prog()], weighins: [{ date: new Date().toISOString(), bw: 180, bf: null }] });
  const b = JSON.parse(w.eval('backupJSON()'));
  ok(b.app === 'overload' && b.version === 2 && Array.isArray(b.data.programs), 'backup carries app, version and data');
  const w2 = boot();
  ok(w2.eval(`applyImportedText(${JSON.stringify(JSON.stringify(b))})`) === true, 'a backup restores');
  ok(w2.eval('S.programs.length') === 1 && w2.eval('S.weighins[0].bw') === 180, 'programs and weigh-ins arrive');
  ok(w2.eval(`applyImportedText('{"nope":1}')`) === false, 'a non-backup file is refused');
}

console.log('\n— corrupt storage cannot brick the app —');
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

console.log('\n— edge: repMin equals repMax, one set —');
{
  const w = boot({ programs: [prog({ repMin: 10, repMax: 10, sets: 1 })], weighins: [] });
  w.eval(`startWorkout('p1')`);
  ok(w.document.getElementById('wkTarget').textContent === '10 reps', 'a fixed target reads as one number');
  w.eval('logSet(10)');
  ok(!w.document.getElementById('rest').classList.contains('on'), 'a one-set session never shows the rest screen');
  ok(stored(w).programs[0].history[0].verdict === 'progress', 'and still gets judged');
}

console.log('\n— weigh-in and trend —');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
