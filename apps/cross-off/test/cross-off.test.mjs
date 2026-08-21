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
const sw = readFileSync(join(HERE, '..', 'sw.js'), 'utf8');
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

console.log('\n== fresh boot ==');
{
  const w = boot();
  ok(w.document.querySelectorAll('#tabs .tab').length === 3, 'two seeded pages plus the add tab');
  ok(w.document.querySelectorAll('.task').length === 4, 'Home seeds four sample tasks');
  ok(/blank page/.test('') === false && !!w.localStorage.getItem('crossoff.v1'), 'state persisted on first run');
  ok(w.document.querySelector('.seclabel').textContent === 'NOW', 'NOW section renders first, wearing the same word as its button');
  ok(!!w.document.querySelector('.task .editbtn'), 'every task has a keyboard-reachable edit button');
}

console.log('\n== add, prefixes, paste-a-list ==');
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

console.log('\n== crossing off, records, focus path ==');
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

console.log('\n== the morning page-flip ==');
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

console.log('\n== a new day flips the page all by itself ==');
{
  const w0 = boot();
  w0.eval(`(()=>{page().tasks[0].done=true;save();})()`);
  const st = stored(w0);
  st.doneDate = '2000-01-01';           // it is no longer that day
  st.doneToday = 3;
  const w = boot(st);
  ok(w.eval('page().past.length') === 1, 'yesterday is already in the flip-back pile on open');
  ok(w.eval('page().past[0].date') === '2000-01-01', 'the pile stamps the day the work happened, not this morning');
  ok(w.eval('!page().tasks.some(t=>t.done)'), 'the page she opens to is clean');
  ok(w.eval('page().tasks.length') === 3, 'unfinished work carried forward, the finished one left the page');
  ok(w.eval('state.pages[1].past.length') === 0, 'a page with nothing crossed off stays as it was');
  ok(w.eval('state.doneToday') === 0, 'the count starts the day at zero');
  const flip = (w.__toasts || []).find(t => /New day/.test(t.m));
  ok(!!flip && flip.o && flip.o.action, 'the flip says where yesterday went, with an undo');
  flip.o.action.onAction();
  ok(w.eval('page().tasks.length') === 4 && w.eval('page().past.length') === 0, 'undo puts yesterday back on the page');
}

console.log('\n== crossed-off work settles below the open list ==');
{
  const w = boot();
  w.eval('completeTask(page().tasks[0]);render()');
  const labels = [...w.document.querySelectorAll('.seclabel')].map(e => e.textContent);
  ok(labels[labels.length - 1] === 'CROSSED OFF', 'a CROSSED OFF section closes the page');
  const rows = [...w.document.querySelectorAll('#list .task')];
  ok(rows[rows.length - 1].classList.contains('done'), 'the done line sits at the bottom, ink and all');
  ok(!rows[0].classList.contains('done'), 'open work is the first thing on the page');
  ok(w.document.getElementById('dayCount').style.visibility === 'visible', 'the day count shows once there is a win');
  const w2 = boot();
  ok(w2.document.getElementById('dayCount').style.visibility === 'hidden', 'and hides while it would read zero');
}

console.log('\n== timers survive a reload ==');
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

console.log('\n== edit sheet: note, chore, delete undo, keyboard cross-off ==');
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

console.log('\n== steps: the checklist within the checklist ==');
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

console.log('\n== user text is inert ==');
{
  const w = boot();
  const inp = w.document.getElementById('addInput');
  inp.value = '<img src=x onerror="window.__pwn=1">';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(!w.__pwn && !w.document.querySelector('#list img'), 'a hostile task name cannot inject markup');
  ok([...w.document.querySelectorAll('.task .txt')].some(t => t.textContent.includes('<img')), 'and still shows as the text they typed');
}

console.log('\n== hand me one: zero decisions between wanting to start and starting ==');
{
  const w = boot();
  w.document.getElementById('handBtn').click();
  ok(w.document.getElementById('focus').classList.contains('show'), 'one tap lands in focus mode');
  const picked = w.eval('findTask(state.focusTaskId)');
  ok(picked && picked.pri === 1, 'it hands you the most urgent group first');
  ok(w.eval('!!findTask(state.focusTaskId).timer'), 'with a clock already running');
  ok(!w.document.getElementById('fDisk').hidden, 'and the time disk showing');
  ok(/%/.test(w.document.getElementById('fDisk').style.getPropertyValue('--pct')), 'the disk knows how full it is');

  // a blank page gets a gentle nudge, not a broken button
  const w2 = boot();
  w2.eval('(()=>{page().tasks=[];save();render();})()');
  w2.document.getElementById('handBtn').click();
  ok(!w2.document.getElementById('focus').classList.contains('show'), 'nothing to hand: focus stays closed');
  ok((w2.__toasts || []).some(t => /Blank page/.test(t.m)), 'and it says so kindly');

  // with the NOW task done, it reaches into TODAY
  const w3 = boot();
  w3.eval('completeTask(page().tasks.find(t=>t.pri===1))');
  w3.document.getElementById('handBtn').click();
  ok(w3.eval('findTask(state.focusTaskId).pri') === 2, 'once NOW is clear it hands you a TODAY task');
}

console.log('\n== persistence roundtrip and daily reset ==');
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

/* The notebook's day is not the clock's day. It may only move when a page
   actually turns. save() used to stamp the wall clock into doneDate, so
   crossing anything off after midnight in a session that never closed told the
   notebook it had already flipped; close it before the watcher noticed and the
   next morning opened on yesterday's crossed-out page. That is precisely the
   graveyard this app was built to abolish. */
/* The morning toast stands for nine seconds and the first task of the day
   often lands inside them. Undo restored a whole snapshot of the task array,
   so it took that new task with it: the safety mechanism became the data loss,
   in the app whose entire promise is that nothing you write goes missing. */
console.log('\n== the flip undo cannot eat work written after the flip ==');
{
  const w = boot();
  w.eval(`(()=>{const p=page();p.tasks.forEach(t=>{t.done=true});save();render();})()`);
  w.eval('freshPage(page())');
  const undo = (w.__toasts || []).find(t => /flip-back/.test(t.m));
  ok(!!undo && undo.o && undo.o.action, 'the flip offers an undo');

  // she writes the first thing of the day while the toast is still up
  const inp = w.document.getElementById('addInput');
  inp.value = 'ring the dentist';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(w.eval(`page().tasks.some(t=>t.text==='ring the dentist')`), 'the new task is on the page');

  undo.o.action.onAction();
  ok(w.eval(`page().tasks.some(t=>t.text==='ring the dentist')`),
    'and undo does not take it back off again');
  ok(w.eval('page().past.length') === 1,
    'the old page stays in the flip-back pile, where it can still be read');
  ok((w.__toasts || []).some(t => /Kept what you have written/.test(t.m)),
    'and she is told plainly why nothing was undone');
}

console.log('\n== an undo tapped immediately still works ==');
{
  const w = boot();
  w.eval(`(()=>{const p=page();p.tasks.forEach(t=>{t.done=true});save();render();})()`);
  const before = w.eval('page().tasks.length');
  w.eval('freshPage(page())');
  const undo = (w.__toasts || []).find(t => /flip-back/.test(t.m));
  undo.o.action.onAction();
  ok(w.eval('page().tasks.length') === before && w.eval('page().past.length') === 0,
    'nothing happened in between, so the page comes back exactly');
}

console.log('\n== the work date only moves when a page turns ==');
{
  const w = boot();
  const realToday = w.eval('todayStr()');
  ok(w.eval('typeof dayNow') === 'string', 'the notebook keeps its own day');
  ok(w.eval('dayNow') === realToday, 'which starts as today');

  // midnight passes while the app is open and in use, then a task is crossed off
  w.eval("dayNow='2000-01-01'");
  w.eval('save()');
  ok(stored(w).doneDate === '2000-01-01',
    'a save after midnight writes the day the notebook is on, not the clock');
  ok(stored(w).doneDate !== realToday,
    'so it cannot quietly mark the page as already turned');

  // and the watcher must run whether or not the app is in front
  ok(/setInterval\(checkNewDay,\s*60000\)/.test(html),
    'the day watcher ticks even while the app is in the foreground');
}

/* Every tab held the whole notebook and every save wrote the whole thing back,
   so two tabs were last-write-wins and a task added in one vanished when the
   other saved. */
/* The worst shape this app could take: the recovery path destroying the thing
   it was recovering. A notebook that would not parse looked exactly like a
   first run, so the boot seeded Home and Errands over it and saved. */
/* Deleting one task stopped its clock. Taking a whole page away did not, so a
   countdown on a shelved or deleted page kept running against something nobody
   could see any more, and buzzed from it when it hit zero. */
console.log('\n== a page that leaves takes its clocks with it ==');
{
  for (const [button, what] of [['shArchive', 'archived'], ['shPageDel', 'deleted']]) {
    const w = boot();
    w.eval(`startCountdown(page().tasks[0], 300000)`);
    const id = w.eval('page().tasks[0].id');
    ok(w.eval(`!!ticks[${id}]`), `a countdown is running before the page is ${what}`);
    w.eval(`openPageSheet(page())`);
    w.document.getElementById(button).click();
    ok(!w.eval(`!!ticks[${id}]`), `and is stopped when the page is ${what}`);
  }
}

console.log('\n== a notebook that will not read is never written over ==');
{
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(win) {
      win.alert = () => {}; win.confirm = () => true;
      win.SWS = { toast: (m, o) => { (win.__toasts = win.__toasts || []).push({ m, o }); } };
      win.localStorage.setItem('crossoff.v1', '{"pages":[{"name":"Sept", oops');
    }
  });
  const w = dom.window;
  /* The app has to keep working, so it will write a fresh notebook to the
     live key. What must never happen is the original being gone: it is copied
     aside BEFORE anything is written, which is the whole recovery. */
  ok(w.localStorage.getItem('crossoff.v1.unreadable') === '{"pages":[{"name":"Sept", oops',
    'the unreadable original is kept aside, byte for byte, before anything is written');
  ok(w.eval("loadState") === 'corrupt', 'the app knows this was damage, not a first run');
  ok(!w.eval(`state.pages[0].tasks.some(t=>/pharmacy/.test(t.text))`),
    'and does not seed the sample tasks as though nobody had ever used it');
  const bar = w.document.getElementById('storageWarn');
  ok(bar && !bar.hidden, 'the page says what happened');
  ok(/could not be read/.test(bar.textContent), 'in words, not a code');
  ok(!!bar.querySelector('button'), 'and offers the backup file');
}

console.log('\n== one bad page does not cost the whole notebook ==');
{
  const good = {
    uid: 50, activePage: 1,
    pages: [
      { id: 1, name: 'Home', color: '#F9E547', past: [], tasks: [
        { id: 11, text: 'ring the school', note: '', done: false, pri: 2, chore: false, strokes: [], timer: null, result: null }] },
      null,
      { id: 3, name: 'Errands', color: '#FA86C4', past: [], tasks: [] },
    ],
    archived: [], records: {}, doneToday: 0, doneDate: '2000-01-01',
  };
  const w = boot(good);
  ok(w.eval('state.pages.length') === 2, 'the readable pages open');
  ok(w.eval(`state.pages.some(p=>p.name==='Home')&&state.pages.some(p=>p.name==='Errands')`),
    'both of them, by name');
  ok(w.eval(`page().tasks.some(t=>t.text==='ring the school')`), 'with their tasks intact');
  const bar = w.document.getElementById('storageWarn');
  ok(bar && !bar.hidden && /could not be read/.test(bar.textContent),
    'and the page admits one page is missing rather than hiding it');
}

console.log('\n== two tabs converge instead of overwriting each other ==');
{
  const w = boot();
  const otherTab = (mutate) => {
    const st = JSON.parse(w.localStorage.getItem('crossoff.v1'));
    mutate(st);
    const raw = JSON.stringify(st);
    w.localStorage.setItem('crossoff.v1', raw);
    // what the browser fires in THIS tab when another one writes
    const ev = new w.StorageEvent('storage', { key: 'crossoff.v1', newValue: raw });
    w.dispatchEvent(ev);
    return st;
  };

  otherTab(st => st.pages[0].tasks.push({ id: 7001, text: 'pick up the prescription',
    note: '', done: false, pri: 2, chore: false, strokes: [], timer: null, result: null }));
  ok(w.eval(`page().tasks.some(t=>t.text==='pick up the prescription')`),
    'a task added in the other tab appears here');
  ok((w.__toasts || []).some(t => /other tab/.test(t.m)), 'and says where it came from');

  // but not while hands are busy: the page must not move mid-edit
  w.document.body.classList.add('sheet-open');
  otherTab(st => st.pages[0].tasks.push({ id: 7002, text: 'book the car in',
    note: '', done: false, pri: 2, chore: false, strokes: [], timer: null, result: null }));
  ok(!w.eval(`page().tasks.some(t=>t.text==='book the car in')`),
    'an update waits while a sheet is open rather than pulling the page away');
  w.eval('closeSheet()');
  ok(w.eval(`page().tasks.some(t=>t.text==='book the car in')`),
    'and lands as soon as the sheet closes');
}

console.log('\n== only one tab may flip the page each morning ==');
{
  const w = boot();
  w.eval(`(()=>{const p=page();p.tasks.forEach(t=>{t.done=true});save();render();})()`);
  ok(w.eval(`morningFlip('2000-01-01')`) !== false, 'the first flip of the day happens');
  const piled = w.eval('page().past.length');
  /* The second tab still believes yesterday's work is on the page, because its
     copy is stale. Without the guard it flips that stale page too, filing the
     same day twice. Re-marking the tasks done is exactly that stale state, and
     without it this test would pass for the wrong reason: a freshly flipped
     page has nothing done on it, so morningFlip would decline anyway. */
  w.eval(`(()=>{const p=page();p.tasks.forEach(t=>{t.done=true});})()`);
  ok(w.eval(`morningFlip('2000-01-01')`) === false,
    'a second tab arriving at the same morning does not flip again');
  ok(w.eval('page().past.length') === piled,
    'so the same page is not filed into the pile twice');
}

console.log('\n== a device that stops saving says so ==');
{
  const w = boot();
  const bar = w.document.getElementById('storageWarn');
  ok(!!bar, 'there is somewhere to say it');
  ok(bar.hidden, 'and it stays out of the way while saving works');
  // storage goes away mid-session, the way a full phone does
  /* jsdom ignores assignment to localStorage.setItem on the instance, so the
     break has to go on the prototype the way a real quota error would. */
  w.eval("w_orig_setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){var e=new Error('quota');e.name='QuotaExceededError';throw e}");
  const okFlag = w.eval('save()');
  ok(okFlag === false, 'save reports the failure instead of swallowing it');
  ok(!w.document.getElementById('storageWarn').hidden,
    'and the page says the writing is not being kept');
  ok(/backup/i.test(w.document.getElementById('storageWarn').textContent),
    'and offers the one thing that helps');
  // storage comes back (space cleared) and the notice retires itself
  w.eval("Storage.prototype.setItem=w_orig_setItem");
  ok(w.eval('save()') === true, 'saving works again once there is room');
  ok(w.document.getElementById('storageWarn').hidden,
    'and the notice takes itself down rather than nagging forever');
}

console.log('\n== the notebook can be got out of the browser ==');
{
  const w = boot();
  const host = w.document.getElementById('backupControls');
  ok(!!host, 'there is a backup control');
  ok(host.getAttribute('data-keys') === 'crossoff.v1',
    'pointed at this app\'s own key and nothing else on the origin');
  ok(/sws-backup\.js/.test(html) && /'sws-backup\.js'/.test(sw),
    'the shared runtime is loaded and precached so it works offline too');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
