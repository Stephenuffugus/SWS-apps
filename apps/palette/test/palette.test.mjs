/* Palette regression harness.
   Usage: node palette.test.mjs ./index.html
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
  const box = w.document.querySelector('.box[data-iso="2026-08-25"][data-p="2"]');
  box.textContent = 'Dot Day — read The Dot';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(saved().cells['2026-08-25|2'] === 'Dot Day — read The Dot', 'cell text saved to storage');
  const nb = w.document.querySelector('.box[data-p="notes"][data-iso="2026-08-25"]');
  nb.textContent = 'Collect forms';
  nb.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(saved().notes['2026-08-25'] === 'Collect forms', 'notes saved to storage');
  box.textContent = '';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(saved().cells['2026-08-25|2'] === undefined, 'clearing a box removes the key');
}

console.log('\n— copy bar —');
{
  const w = boot(baseState);
  const box = w.document.querySelector('.box[data-iso="2026-08-25"][data-p="1"]');
  box.textContent = 'Clay pinch pots';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  box.dispatchEvent(new w.Event('focus'));
  ok(w.document.getElementById('bar').classList.contains('show'), 'bar shows on focus');
  ok(w.document.getElementById('bar-letter').textContent === 'Fill all B-days', 'letter button labeled for the day (Tue = B)');
  w.document.getElementById('bar-day').click();
  const st = JSON.parse(w.localStorage.getItem('palette2'));
  ok(st.cells['2026-08-25|6'] === 'Clay pinch pots', 'Fill whole day copies to period 6');
  box.dispatchEvent(new w.Event('focus'));
  w.document.getElementById('bar-letter').click();
  const st2 = JSON.parse(w.localStorage.getItem('palette2'));
  ok(st2.cells['2026-08-28|3'] === 'Clay pinch pots', 'Fill all B-days copies to Friday (B)');
  ok(st2.cells['2026-08-26|1'] === undefined, 'B-day untouched');
  const notesBox = w.document.querySelector('.box[data-p="notes"]');
  notesBox.dispatchEvent(new w.Event('focus'));
  ok(!w.document.getElementById('bar').classList.contains('show'), 'bar hides for notes boxes');
}

console.log('\n— backup round trip & migrate tolerance —');
{
  const w = boot(clone(baseState));
  const oldBackup = { app:'palette', version:2, state:{ config:{ yearStart:'2026-08-24', yearEnd:'2026-09-04', periods:4, lunchAfter:9 }, cells:{ '2026-08-25|1':'restored' } } };
  const okImport = w.eval(`applyImportedText(${JSON.stringify(JSON.stringify(oldBackup))})`);
  ok(okImport === true, 'old backup with missing keys imports');
  const s2 = JSON.parse(w.localStorage.getItem('palette2'));
  ok(s2.cells['2026-08-25|1'] === 'restored', 'imported cell text present');
  ok(Array.isArray(s2.config.letters) && s2.config.letters.join('') === 'ABC', 'missing letters defaulted');
  ok(s2.config.lunchAfter <= s2.config.periods, 'lunchAfter clamped to periods');
  ok(w.eval(`applyImportedText('{"nope":1}')`) === false, 'garbage file rejected politely');
}

console.log('\n— CSV export shape —');
{
  const st = clone(baseState);
  st.cells['2026-08-24|1'] = 'has, comma and "quotes"';
  const w = boot(st);
  const csv = w.eval(`(()=>{buildYearIfStale();const c=S.config;const head=['Date','Weekday','Rotation',...Array.from({length:c.periods},(_,i)=>'Period '+(i+1)),'Notes'];const lines=[head.join(',')];for(const wk of YEAR)for(const d of wk.days){const row=[d.iso,DAYNAMES[d.dow],d.special?d.special:(d.letter||'')];for(let p=1;p<=c.periods;p++)row.push(S.cells[d.iso+'|'+p]||'');row.push(S.notes[d.iso]||'');lines.push(row.map(csvField).join(','))}return lines})()`);
  ok(csv[0] === 'Date,Weekday,Rotation,Period 1,Period 2,Period 3,Period 4,Period 5,Period 6,Notes', 'CSV header correct');
  ok(csv[1].includes('"has, comma and ""quotes"""'), 'CSV quoting correct');
  ok(csv.length === 26, '25 school days + header');
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
