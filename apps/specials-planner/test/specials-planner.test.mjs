/* Specials Planner regression harness.
   Usage: node test/specials-planner.test.mjs ./index.html
   Runs the real app inside jsdom and asserts core behavior.
   Claude Code: run this after ANY change. All green before you commit. */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const file = process.argv[2] || './index.html';
const html = readFileSync(file, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

function boot(preState) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(win) {
      win.alert = () => {}; win.confirm = () => true;
      if (preState !== undefined) win.localStorage.setItem('palette2', JSON.stringify(preState));
    }
  });
  return dom.window;
}

const baseConfig = {
  yearStart: '2026-08-24', yearEnd: '2026-09-25',
  workDays: [1, 2, 3, 4, 5], periods: 6, lunchAfter: 2,
  letters: ['A', 'B', 'C'], teacher: 'Test', driveFileId: ''
};
const baseState = { config: baseConfig, cells: {}, notes: {}, special: {} };
const clone = o => JSON.parse(JSON.stringify(o));

/* Lessons are keyed to CYCLE POSITION now ("c7|3"), not to the calendar date,
   so these read through the rendered grid instead of guessing at a key. That
   is the contract that matters anyway: what does the teacher see on that day. */
const boxAt = (w, iso, p) => w.document.querySelector(`.box[data-iso="${iso}"][data-p="${p}"]`);
const textAt = (w, iso, p) => { const b = boxAt(w, iso, p); return b ? b.textContent : null; };
const type = (w, iso, p, text) => {
  const b = boxAt(w, iso, p);
  b.textContent = text;
  b.dispatchEvent(new w.Event('input', { bubbles: true }));
  return b;
};
const stored = w => JSON.parse(w.localStorage.getItem('palette2'));

async function main() {

console.log('\n— fresh boot —');
{
  const w = boot();
  ok(!!w.document.getElementById('w-fresh'), 'welcome screen shows Start fresh');
  ok(w.document.querySelector('.tabs').style.display === 'none', 'tabs hidden before setup');
  w.document.getElementById('w-fresh').click();
  ok(!!w.document.getElementById('f-apply'), 'Start fresh lands on Setup');
  ok(!!w.localStorage.getItem('palette2'), 'state persisted on start');
}

console.log('\n— year build & rotation —');
{
  const w = boot(baseState);
  const boxes = w.document.querySelectorAll('.box[data-p="1"]');
  ok(boxes.length === 5, 'first week renders 5 school days');
  const letters = [...boxes].map(b => b.dataset.letter).join('');
  ok(letters === 'ABCAB', 'rotation cycles A,B,C,A,B across Mon–Fri');
  ok(w.document.getElementById('wk-jump').options.length === 5, 'Aug 24 – Sep 25 generates 5 weeks');
  const ths = [...w.document.querySelectorAll('table.week th')].map(t => t.textContent.trim());
  ok(ths[3] === '🍎', 'lunch column sits after period 2');
  ok(ths.length === 9, 'header = Day + 6 periods + lunch + Notes');
}

console.log('\n— special day skips the letter —');
{
  const st = clone(baseState);
  st.special['2026-08-24'] = 'Teacher work day';
  const w = boot(st);
  const boxes = [...w.document.querySelectorAll('.box[data-p="1"]')];
  ok(boxes[0].dataset.letter === '', 'special Monday has no letter');
  ok(boxes[1].dataset.letter === 'A', 'Tuesday takes A (rotation not consumed)');
  ok(boxes[4].dataset.letter === 'A', 'Friday wraps back to A');
  ok(w.document.querySelector('.sp-banner').textContent === 'Teacher work day', 'banner renders');
}

console.log('\n— typing persists —');
{
  const w = boot(baseState);
  const saved = () => JSON.parse(w.localStorage.getItem('palette2'));
  const box = type(w, '2026-08-25', 2, 'Dot Day — read The Dot');
  await sleep(500);
  ok(Object.values(saved().cells).includes('Dot Day — read The Dot'), 'cell text saved to storage');
  ok(Object.keys(saved().cells).every(k => !/^\d{4}-/.test(k)), 'lessons are keyed to cycle position, not to a date');
  const nb = w.document.querySelector('.box[data-p="notes"][data-iso="2026-08-25"]');
  nb.textContent = 'Collect forms';
  nb.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(saved().notes['2026-08-25'] === 'Collect forms', 'notes saved to storage');
  box.textContent = '';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(!Object.values(saved().cells).includes('Dot Day — read The Dot'), 'clearing a box removes the key');
}

console.log('\n— copy bar —');
{
  const w = boot(baseState);
  const box = type(w, '2026-08-25', 1, 'Clay pinch pots');
  box.dispatchEvent(new w.Event('focus'));
  ok(w.document.getElementById('bar').classList.contains('show'), 'bar shows on focus');
  ok(/Fill all B-days/.test(w.document.getElementById('bar-letter').textContent), 'letter button labeled for the day (Tue = B)');
  ok(/period 1, all year/.test(w.document.getElementById('bar-letter').textContent), 'letter button states its real scope');
  w.document.getElementById('bar-day').click();
  ok(textAt(w, '2026-08-25', 6) === 'Clay pinch pots', 'Fill whole day copies to period 6');
  box.dispatchEvent(new w.Event('focus'));
  w.document.getElementById('bar-letter').click();
  ok(textAt(w, '2026-08-28', 1) === 'Clay pinch pots', 'Fill all B-days copies to Friday period 1 (B)');
  ok(textAt(w, '2026-08-28', 3) === '', 'the letter fill leaves the other periods of that day alone');
  ok(textAt(w, '2026-08-26', 1) === '', 'a non-B day is untouched');
  // the year, not just this week: Sep 8 is the next Tuesday-as-B in this config
  const laterB = [...w.document.querySelectorAll('.box[data-p="1"]')];
  ok(laterB.length === 5, 'still one week on screen');
  w.document.getElementById('wk-next').click();
  const wk2 = [...w.document.querySelectorAll('.box[data-p="1"][data-letter="B"]')];
  ok(wk2.length > 0 && wk2.every(b => b.textContent === 'Clay pinch pots'), 'the letter fill reached B-days in later weeks too');
  w.document.getElementById('wk-prev').click();
  const notesBox = w.document.querySelector('.box[data-p="notes"]');
  notesBox.dispatchEvent(new w.Event('focus'));
  ok(!w.document.getElementById('bar').classList.contains('show'), 'bar hides for notes boxes');
}

console.log('\n— destructive copy is refused, and every copy is undoable —');
{
  const w = boot(baseState);
  for (let p = 1; p <= 6; p++) type(w, '2026-08-25', p, `period ${p} plan`);
  await sleep(500);
  const cleared = type(w, '2026-08-25', 3, '');
  cleared.dispatchEvent(new w.Event('focus'));
  w.document.getElementById('bar-day').click();
  await sleep(60);
  ok(textAt(w, '2026-08-25', 1) === 'period 1 plan', 'Fill whole day from an emptied box does NOT wipe the day');
  ok(/nothing to copy/i.test(w.document.getElementById('live').textContent), 'and says why');

  const src = type(w, '2026-08-25', 3, 'djembes');
  src.dispatchEvent(new w.Event('focus'));
  w.document.getElementById('bar-day').click();
  ok(textAt(w, '2026-08-25', 1) === 'djembes', 'copy applied');
  w.eval('SWS._undo()');
  ok(textAt(w, '2026-08-25', 1) === 'period 1 plan', 'undo puts the overwritten periods back');
  ok(textAt(w, '2026-08-25', 3) === 'djembes', 'undo leaves the source alone');
}

console.log('\n— a cancelled day carries the plans forward with the cycle —');
{
  const st = clone(baseState);
  const w = boot(st);
  const days = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
  const letters = () => [...w.document.querySelectorAll('.box[data-p="1"]')].map(b => b.dataset.letter).join('');
  days.forEach((iso, i) => type(w, iso, 1, `LESSON FOR LETTER ${'ABCAB'[i]}`));
  await sleep(500);
  ok(letters() === 'ABCAB', 'letters start A B C A B');
  w.eval(`setSpecial('2026-08-26','No school')`);
  ok(letters() === 'ABCA', 'letters after the cancellation read A, B, (none), C, A');
  ok(textAt(w, '2026-08-27', 1) === 'LESSON FOR LETTER C', 'Thursday is letter C and now holds the C lesson');
  ok(w.document.querySelector('.box[data-iso="2026-08-27"][data-p="1"]').dataset.letter === 'C', 'Thursday really is letter C');
  ok(textAt(w, '2026-08-28', 1) === 'LESSON FOR LETTER A', 'Friday took the next lesson in the cycle');
  ok(textAt(w, '2026-08-26', 1) === '', 'the cancelled day is not holding a stranded lesson');
  w.eval('SWS._undo()');
  ok(letters() === 'ABCAB', 'undo restores the rotation');
  ok(textAt(w, '2026-08-27', 1) === 'LESSON FOR LETTER A', 'and the lessons slide back with it');
}

console.log('\n— multi-line lessons survive a reload —');
{
  const w = boot(clone(baseState));
  type(w, '2026-08-24', 1, 'Warm-up: djembes\nCall and response\nCool down');
  await sleep(500);
  const raw = w.localStorage.getItem('palette2');
  ok(/Warm-up: djembes\\nCall and response/.test(raw), 'newlines are stored as newlines');
  const w2 = boot(JSON.parse(raw));
  ok(textAt(w2, '2026-08-24', 1).split('\n').length === 3, 'three lines come back after a reload');
}

console.log('\n— a write that fails is never reported as a save —');
{
  const w = boot(clone(baseState));
  w.eval(`Storage.prototype.setItem=function(){ throw new DOMException('quota','QuotaExceededError') }`);
  type(w, '2026-08-24', 2, 'this cannot be saved');
  await sleep(500);
  ok(!w.document.getElementById('alert-wrap').hidden, 'a loud warning appears');
  ok(!w.document.getElementById('saved').classList.contains('show'), 'the Saved flag does NOT run');
  ok(/could not save|refused to save/i.test(w.document.getElementById('save-alert-text').textContent), 'the warning says what happened');
}

console.log('\n— the last edit is flushed on the way out —');
{
  const w = boot(clone(baseState));
  type(w, '2026-08-24', 4, 'typed and walked away');
  w.dispatchEvent(new w.Event('pagehide'));
  ok(Object.values(stored(w).cells).includes('typed and walked away'), 'pagehide writes the pending edit (no 400ms grace needed)');
}

console.log('\n— backup round trip & migrate tolerance —');
{
  const w = boot(clone(baseState));
  const oldBackup = { app:'palette', version:2, state:{ config:{ yearStart:'2026-08-24', yearEnd:'2026-09-04', periods:4, lunchAfter:9 }, cells:{ '2026-08-25|1':'restored' } } };
  const okImport = w.eval(`applyImportedText(${JSON.stringify(JSON.stringify(oldBackup))})`);
  ok(okImport === true, 'old backup with missing keys imports');
  w.eval('render()');
  const s2 = JSON.parse(w.localStorage.getItem('palette2'));
  ok(textAt(w, '2026-08-25', 1) === 'restored', 'a date-keyed legacy backup lands on the right day');
  ok(Object.keys(s2.cells).every(k => !/^\d{4}-/.test(k)), 'and is rewritten to cycle keys on the way in');
  ok(Array.isArray(s2.config.letters) && s2.config.letters.join('') === 'ABC', 'missing letters defaulted');
  ok(s2.config.lunchAfter <= s2.config.periods, 'lunchAfter clamped to periods');
  ok(w.eval(`applyImportedText('{"nope":1}')`) === false, 'garbage file rejected politely');
}

console.log('\n— CSV export shape —');
{
  const st = clone(baseState);
  st.cells['2026-08-24|1'] = 'has, comma and "quotes"';
  const w = boot(st);
  const csv = w.eval(`(()=>{buildYearIfStale();const c=S.config;const head=['Date','Weekday','Rotation',...Array.from({length:c.periods},(_,i)=>'Period '+(i+1)),'Notes'];const lines=[head.join(',')];for(const wk of YEAR)for(const d of wk.days){const row=[d.iso,DAYNAMES[d.dow],d.special?d.special:(d.letter||'')];for(let p=1;p<=c.periods;p++)row.push(cellText(d,p));row.push(S.notes[d.iso]||'');lines.push(row.map(csvField).join(','))}return lines})()`);
  ok(csv[0] === 'Date,Weekday,Rotation,Period 1,Period 2,Period 3,Period 4,Period 5,Period 6,Notes', 'CSV header correct');
  ok(csv[1].includes('"has, comma and ""quotes"""'), 'CSV quoting correct');
  ok(csv.length === 26, '25 school days + header');
  ok(w.eval(`csvField('=HYPERLINK("http://evil.test","prize")')`).startsWith("\"'="), 'a cell starting with = is neutralised for Excel');
  ok(w.eval(`csvField('- warm up')`) === "'- warm up", 'so is a leading minus');
}

console.log('\n— XSS safety —');
{
  const st = clone(baseState);
  st.cells['2026-08-24|1'] = '<img src=x onerror="window.__pwned=1">';
  st.special['2026-08-28'] = '<b>bold?</b> day';
  const w = boot(st);
  ok(!w.__pwned, 'hostile cell text stays inert');
  const b = w.document.querySelector('.box[data-iso="2026-08-24"][data-p="1"]');
  ok(b.textContent.includes('<img'), 'hostile text displayed as text');
  ok(!b.querySelector('img'), 'no element injected into cell');
  const banner = w.document.querySelector('.sp-banner');
  ok(banner && !banner.querySelector('b'), 'banner label escaped');
}

console.log('\n— setup apply reflows the grid —');
{
  const w = boot(clone(baseState));
  w.document.querySelector('.tab[data-view="setup"]').click();
  w.document.getElementById('f-periods').value = 7;
  w.document.getElementById('f-periods').dispatchEvent(new w.Event('change', { bubbles: true }));
  w.document.getElementById('f-lunch').value = '3';
  w.document.getElementById('f-letters').value = 'A, B';
  w.document.getElementById('f-apply').click();
  const ths = [...w.document.querySelectorAll('table.week th')].map(t => t.textContent.trim());
  ok(ths.length === 10, '7 periods + lunch + day + notes = 10 headers');
  ok(ths[4] === '🍎', 'lunch moved to after period 3');
  const letters = [...w.document.querySelectorAll('.box[data-p="1"]')].map(b => b.dataset.letter).join('');
  ok(letters === 'ABABA', 'two-letter rotation applies');
  const s = JSON.parse(w.localStorage.getItem('palette2'));
  ok(s.config.periods === 7 && s.config.lunchAfter === 3, 'config saved');
}

console.log('\n— accessibility contract —');
{
  const w = boot(clone(baseState));
  ok(w.document.querySelector('.tab[data-view="week"]').getAttribute('aria-current') === 'page', 'active view button exposes aria-current');
  ok(!w.document.getElementById('view').hasAttribute('aria-live'), 'main view is not a live region (announcements go to #live)');
  const box = w.document.querySelector('.box[data-iso="2026-08-24"][data-p="1"]');
  ok(box.getAttribute('role') === 'textbox' && box.getAttribute('aria-multiline') === 'true', 'grid box announces as a multiline textbox');
  ok(/Monday/.test(box.getAttribute('aria-label')) && /period 1/i.test(box.getAttribute('aria-label')), 'grid box has a spoken name (day + period)');

  w.document.getElementById('wk-next').click();
  await sleep(80);
  ok(/Week 2/.test(w.document.getElementById('live').textContent), 'week change is announced politely');
  w.document.getElementById('wk-prev').click();
  await sleep(80);

  const gear = w.document.querySelector('[data-gear]');
  const iso = gear.dataset.gear;
  gear.click();
  ok(w.document.getElementById('modal').classList.contains('show'), 'gear opens the day modal');
  ok(w.document.getElementById('modal').getAttribute('aria-labelledby') === 'modal-title' && !!w.document.getElementById('modal-title'), 'modal has an accessible name');
  ok(w.document.activeElement && w.document.activeElement.closest('#modal-sheet'), 'focus moves into the modal');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  ok(!w.document.getElementById('modal').classList.contains('show'), 'Escape closes the modal');

  w.document.querySelector(`[data-gear="${iso}"]`).click();
  w.document.querySelector('#modal-sheet [data-sp]').click();
  ok(w.document.activeElement === w.document.querySelector(`[data-gear="${iso}"]`), 'saving a special day returns focus to its gear');

  const box2 = w.document.querySelector('.box[data-p="1"]');
  box2.dispatchEvent(new w.Event('focus'));
  box2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  ok(w.document.activeElement === w.document.getElementById('bar-day'), 'Ctrl+Enter jumps focus to the copy buttons');

  w.document.querySelector('.tab[data-view="setup"]').click();
  const dp = w.document.querySelector('#f-days .dp');
  const before = dp.getAttribute('aria-pressed');
  dp.click();
  ok(dp.getAttribute('aria-pressed') !== before, 'day-picker toggle exposes pressed state');
}

console.log('\n— reset —');
{
  const w = boot(clone(baseState));
  w.eval('resetAll()');
  ok(w.localStorage.getItem('palette2') === null, 'storage cleared');
  ok(!!w.document.getElementById('w-fresh'), 'back to welcome screen');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
