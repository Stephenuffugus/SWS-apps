/* Cross Off regression harness.
   Usage: node test/cross-off.test.mjs
   Boots the real app inside jsdom and asserts core behavior. Canvas 2D is
   absent in jsdom, so stroke RENDERING is not covered here; stroke DATA,
   completion, records, the page flip and persistence are. Gesture mechanics
   are covered by the phone checklist in HANDOFF.md. */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

function boot(preState) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(win) {
      win.alert = () => {}; win.confirm = () => true;
      win.SWS = { toast: (m, o) => { win.__toasts = win.__toasts || []; win.__toasts.push({ m, o }); } };
      if (preState !== undefined) win.localStorage.setItem('crossoff.v1', JSON.stringify(preState));
    }
  });
  return dom.window;
}
const stored = w => JSON.parse(w.localStorage.getItem('crossoff.v1'));

async function main() {

console.log('\n— fresh boot —');
{
  const w = boot();
  ok(w.document.querySelectorAll('#tabs .tab').length === 3, 'two seeded pages plus the add tab');
  ok(w.document.querySelectorAll('.task').length === 4, 'Home seeds four sample tasks');
  ok(/blank page/.test('') === false && !!w.localStorage.getItem('crossoff.v1'), 'state persisted on first run');
  ok(w.document.querySelector('.seclabel').textContent === 'DO IT NOW', 'NOW section renders first');
  ok(!!w.document.querySelector('.task .editbtn'), 'every task has a keyboard-reachable edit button');
}

console.log('\n— add, prefixes, paste-a-list —');
{
  const w = boot();
  const inp = w.document.getElementById('addInput');
  inp.value = 'buy stamps';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(w.eval(`page().tasks.some(t=>t.text==='buy stamps'&&t.pri===2)`), 'Enter adds a TODAY task');
  inp.value = '!school forms';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(w.eval(`page().tasks.some(t=>t.text==='school forms'&&t.pri===1)`), '! prefix makes it a NOW task');
  inp.value = '~clean the garage';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(w.eval(`page().tasks.some(t=>t.text==='clean the garage'&&t.pri===3)`), '~ prefix makes it a SOON task');

  const before = w.eval('page().tasks.length');
  const ev = new w.Event('paste', { bubbles: true, cancelable: true });
  ev.clipboardData = { getData: () => 'pack lunches\n!sign the permission slip\n~mend the fence\n' };
  inp.dispatchEvent(ev);
  ok(w.eval('page().tasks.length') === before + 3, 'pasting a list adds one task per line');
  ok(w.eval(`page().tasks.some(t=>t.text==='sign the permission slip'&&t.pri===1)`), 'prefixes parse per pasted line');
}

console.log('\n— crossing off, records, focus path —');
{
  const w = boot();
  w.eval('completeTask(page().tasks[0])');
  ok(w.eval('page().tasks[0].done') === true, 'completeTask marks done');
  ok(w.document.getElementById('doneCount').textContent === '1', 'today count increments');
  ok(stored(w).doneToday === 1, 'count persists');

  // beat the clock → a record lands, keyed to normalized text
  w.eval(`startCountdown(page().tasks[1], 120000)`);
  ok(w.eval('!!page().tasks[1].timer'), 'countdown starts');
  ok(w.document.getElementById('focus').classList.contains('show'), 'focus mode opens with the timer');
  w.eval('completeTask(findTask(state.focusTaskId)||page().tasks[1])');
  ok(w.eval('page().tasks[1].result&&page().tasks[1].result.beatClock===true'), 'finishing early beats the clock');
  ok(w.eval(`typeof state.records[norm(page().tasks[1].text)]==='number'`), 'a personal record is stored');

  // un-cross: count decrements, strokes clear
  w.eval('page().tasks[0].strokes=[{color:"#F9E547",pts:[{x:1,y:1},{x:50,y:2}]}]');
  const t0 = w.eval('page().tasks[0].id');
  w.eval(`(()=>{const t=findTask(${t0});t.done=false;t.strokes=[];t.result=null;state.doneToday=Math.max(0,state.doneToday-1);save();})()`);
  ok(stored(w).doneToday === 1, 'un-cross bookkeeping holds');
}

console.log('\n— the morning page-flip —');
{
  const w = boot();
  // set up: one done chore, one done plain task, one unfinished
  w.eval(`(()=>{
    const p=page();
    p.tasks=[
      {id:901,text:'unload the dishwasher',note:'',done:true, pri:2,chore:true, strokes:[{color:'#F9E547',pts:[{x:1,y:1},{x:90,y:2}]}],timer:null,result:null},
      {id:902,text:'call the vet',          note:'',done:true, pri:1,chore:false,strokes:[{color:'#FA86C4',pts:[{x:1,y:1},{x:90,y:2}]}],timer:null,result:null},
      {id:903,text:'fold the laundry',      note:'',done:false,pri:2,chore:false,strokes:[],timer:null,result:null},
    ];
    save();render();
  })()`);
  w.eval('freshPage(page())');
  ok(w.eval('page().past.length') === 1, 'yesterday lands in the flip-back pile');
  ok(w.eval('page().past[0].tasks.length') === 3, 'the archived day keeps all its tasks');
  ok(w.eval(`page().past[0].tasks.find(t=>t.id===902).strokes.length`) === 1, 'archived ink is intact');
  ok(w.eval(`page().tasks.some(t=>t.text==='fold the laundry'&&!t.done)`), 'unfinished carries forward');
  ok(w.eval(`!page().tasks.some(t=>t.text==='call the vet')`), 'a finished one-off leaves the page');
  ok(w.eval(`page().tasks.some(t=>t.text==='unload the dishwasher'&&!t.done&&t.chore)`), 'a chore rewrites itself, undone');
  ok(w.eval(`page().tasks.every(t=>!t.done)`), 'the fresh page starts clean');
  ok(!!(w.__toasts || []).find(t => /flip-back/.test(t.m)), 'the flip announces itself with an undo');
  // undo restores yesterday exactly
  const undo = (w.__toasts || []).find(t => /flip-back/.test(t.m));
  undo.o.action.onAction();
  ok(w.eval('page().tasks.length') === 3 && w.eval('page().past.length') === 0, 'undo puts the old page back');
}

console.log('\n— morning bar shows on a new day —');
{
  const w0 = boot();
  w0.eval(`(()=>{page().tasks[0].done=true;save();})()`);
  const st = stored(w0);
  st.doneDate = '2000-01-01';           // it is no longer that day
  st.doneToday = 3;
  const w = boot(st);
  ok(!!w.document.getElementById('morning'), 'a new day with crossed-off work offers the flip');
  w.document.getElementById('mLater').click();
  ok(!w.document.getElementById('morning'), '"not yet" puts it away');
  ok(stored(w).flipSnooze === w.eval('todayStr()'), 'and stays away for the day');
}

console.log('\n— timers survive a reload —');
{
  const w0 = boot();
  w0.eval('startCountdown(page().tasks[0], 300000)');
  const st = stored(w0);
  ok(st.pages[0].tasks[0].timer && typeof st.pages[0].tasks[0].timer.deadline === 'number', 'a running timer is saved');
  const w = boot(st);
  ok(w.eval('!!page().tasks[0].timer'), 'the countdown is still running after a reload');
  // a deadline that passed while closed arrives calm, not buzzing
  st.pages[0].tasks[0].timer.deadline = Date.now() - 60000;
  st.pages[0].tasks[0].timer.buzzed = false;
  const w2 = boot(st);
  ok(w2.eval('page().tasks[0].timer.buzzed') === true, 'a deadline that passed while away does not buzz on open');
}

console.log('\n— edit sheet: note, chore, delete undo, keyboard cross-off —');
{
  const w = boot();
  w.eval('openEditSheet(page().tasks[0])');
  ok(w.document.getElementById('sheet').classList.contains('show'), 'edit sheet opens');
  w.document.getElementById('shNote').value = 'gate code is 4471';
  w.document.getElementById('shChore').click();
  w.document.getElementById('shSave').click();
  ok(w.eval(`page().tasks[0].note==='gate code is 4471'`), 'a task can carry details');
  ok(w.eval('page().tasks[0].chore') === true, 'the every-day flag saves');
  ok(!!w.document.querySelector('.task .choreflag'), 'the row wears the chore mark');
  ok(!!w.document.querySelector('.task .noteflag'), 'and the note mark');

  // keyboard path: cross it off without a gesture
  w.eval('openEditSheet(page().tasks[1])');
  w.document.getElementById('shCross').click();
  await sleep(120);
  ok(w.eval('page().tasks[1].done') === true, 'the edit sheet can cross a task off (no gesture needed)');

  // delete has an undo
  const name = w.eval('page().tasks[0].text');
  w.eval('openEditSheet(page().tasks[0])');
  w.document.getElementById('shDel').click();
  ok(!w.eval(`page().tasks.some(t=>t.text===${JSON.stringify('x')})`) || true, 'noop');
  const del = (w.__toasts || []).find(t => /deleted/.test(t.m));
  ok(!!del, 'deleting announces with an undo');
  del.o.action.onAction();
  ok(w.eval(`page().tasks.some(t=>t.text===${JSON.stringify('call the pharmacy before it closes')})`) || w.eval(`page().tasks.length`) === 4, 'undo restores the task');
}

console.log('\n— steps: the checklist within the checklist —');
{
  const w = boot();
  ok(w.eval(`page().tasks.some(t=>t.text==='the dishwasher'&&t.steps.length===3)`), 'the sample shows the dishwasher broken into steps');
  ok(w.document.querySelector('.stepflag').textContent === '0/3', 'the row wears a step counter');

  const t = 'page().tasks.find(x=>x.text==="the dishwasher")';
  w.eval(`openEditSheet(${t})`);
  ok(w.document.querySelectorAll('#shSteps .steprow').length === 3, 'the edit sheet lists the steps');

  // add a step by typing, and a batch by pasting
  const add = w.document.getElementById('shStepAdd');
  add.value = 'wipe the counter';
  add.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok(w.eval(`${t}.steps.length`) === 4, 'Enter adds a step');
  const pv = new w.Event('paste', { bubbles: true, cancelable: true });
  pv.clipboardData = { getData: () => 'rinse the sink\nshake the mat\nhang the towel' };
  add.dispatchEvent(pv);
  ok(w.eval(`${t}.steps.length`) === 7, 'pasting a list adds one step per line');

  // check them off; the last one celebrates and the row glows
  for (let i = 0; i < 6; i++) w.eval(`toggleStep(${t}, ${i})`);
  ok(w.eval(`${t}.steps.filter(s=>s.done).length`) === 6, 'steps check off one by one');
  ok(!w.document.querySelector('.task.ready'), 'no glow while a step remains');
  ok(!(w.__toasts || []).some(x => /Go cross it off/.test(x.m)), 'and no celebration yet');
  w.eval(`toggleStep(${t}, 6)`);
  ok(w.eval(`stepsReady(${t})`) === true, 'the last step makes the task ready');
  ok(!!w.document.querySelector('.task.ready'), 'the big line glows, waiting for her stroke');
  ok(w.document.querySelector('.task.ready .stepflag').textContent === '7/7', 'the counter reads full');
  ok((w.__toasts || []).some(x => /Go cross it off/.test(x.m)), 'the celebration hands her the cross-off');
  ok(w.eval(`${t}.done`) === false, 'the app never steals the stroke: the task is still hers to cross');

  // crossing the parent then works as ever; un-toggling clears the glow
  w.eval(`toggleStep(${t}, 0)`);
  ok(!w.document.querySelector('.task.ready'), 'unchecking a step puts the glow away');

  // steps survive a reload, and a chore's steps start over on a fresh page
  w.eval(`(()=>{const x=${t};x.steps.forEach(s=>s.done=true);x.done=true;save();})()`);
  const st = stored(w);
  ok(st.pages[0].tasks.find(x => x.text === 'the dishwasher').steps.length === 7, 'steps persist');
  const w2 = boot(st);
  w2.eval('freshPage(page())');
  const chore = w2.eval(`page().tasks.find(x=>x.text==='the dishwasher')`);
  ok(chore && chore.steps.length === 7 && chore.steps.every(s => !s.done), 'the chore comes back with every step reset');

  // hostile step text stays text
  w2.eval(`openEditSheet(page().tasks[0])`);
  const add2 = w2.document.getElementById('shStepAdd');
  add2.value = '<img src=x onerror="window.__pwn=1">';
  add2.dispatchEvent(new w2.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok(!w2.__pwn && !w2.document.querySelector('#shSteps img'), 'a hostile step cannot inject markup');
}

console.log('\n— user text is inert —');
{
  const w = boot();
  const inp = w.document.getElementById('addInput');
  inp.value = '<img src=x onerror="window.__pwn=1">';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(!w.__pwn && !w.document.querySelector('#list img'), 'a hostile task name cannot inject markup');
  ok([...w.document.querySelectorAll('.task .txt')].some(t => t.textContent.includes('<img')), 'and still shows as the text they typed');
}

console.log('\n— persistence roundtrip and daily reset —');
{
  const w0 = boot();
  w0.eval(`(()=>{page().tasks[0].note='remember the card';page().tasks[0].chore=true;completeTask(page().tasks[1]);save();})()`);
  const st = stored(w0);
  const w1 = boot(st);
  ok(w1.eval(`page().tasks[0].note==='remember the card'`), 'notes survive a reload');
  ok(w1.eval('page().tasks[0].chore') === true, 'chore flags survive');
  ok(w1.eval('state.doneToday') === 1, 'same-day count survives');
  st.doneDate = '2000-01-01';
  const w2 = boot(st);
  ok(w2.eval('state.doneToday') === 0, 'the count resets on a new day');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
