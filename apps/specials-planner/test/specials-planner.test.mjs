/* Specials Planner regression harness.
   Usage: node test/specials-planner.test.mjs ./index.html
   Runs the real app inside jsdom and asserts core behavior.
   Claude Code: run this after ANY change. All green before you commit. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

/* Resolved against this file, never against the working directory. The old
   './index.html' only worked when you happened to run it from inside the app
   folder, so the moment design/test-all.mjs ran it from the repo root the app
   read as broken when nothing was wrong with it. */
const HERE = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(HERE, '..', 'index.html');
const html = readFileSync(file, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

/* The app opens on the week that contains today, so a suite that does not say
   what today is only passes during the school year it was written in. On
   2026-08-29, a Saturday, it rolled forward to the week of 08-31 and every
   assertion about the 08-24 week read as a broken app. The clock is pinned to
   a Tuesday inside baseConfig's first week so the grid below is the same grid
   forever. Parsing a given string is untouched. */
const NOW = new Date('2026-08-25T12:00:00Z');
function pinClock(win) {
  const Real = win.Date;
  function Pinned(...a) {
    if (!(this instanceof Pinned)) return new Real(NOW.getTime()).toString();
    return a.length ? new Real(...a) : new Real(NOW.getTime());
  }
  Pinned.prototype = Real.prototype;
  Pinned.now = () => NOW.getTime();
  Pinned.parse = Real.parse; Pinned.UTC = Real.UTC;
  win.Date = Pinned;
}

function boot(preState) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(win) {
      win.alert = () => {}; win.confirm = () => true;
      pinClock(win);
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
/* Read a box the way the app reads it. Each line is its own element now, so
   it can carry its own colour, and textContent joins those with nothing
   between them, which silently turns three lines into one word. The storage
   assertion below is the real contract and was never affected; this helper
   was reaching past it into the DOM shape. */
const readBox = (b) => {
  const lines = b.querySelectorAll(':scope > .ln');
  return lines.length ? [...lines].map((d) => d.textContent).join('\n') : b.textContent;
};
const textAt = (w, iso, p) => { const b = boxAt(w, iso, p); return b ? readBox(b) : null; };
const type = (w, iso, p, text) => {
  const b = boxAt(w, iso, p);
  /* Build the line elements a real browser would leave behind, so the test
     exercises the shape the app actually edits. */
  b.textContent = '';
  for (const ln of String(text).split('\n')) {
    const d = w.document.createElement('div');
    d.className = 'ln';
    d.textContent = ln;
    b.appendChild(d);
  }
  b.dispatchEvent(new w.Event('input', { bubbles: true }));
  return b;
};
const stored = w => JSON.parse(w.localStorage.getItem('palette2'));

async function main() {

console.log('\n,  fresh boot , ');
{
  const w = boot();
  ok(!!w.document.getElementById('w-fresh'), 'welcome screen shows Start fresh');
  ok(w.document.querySelector('.tabs').style.display === 'none', 'tabs hidden before setup');
  w.document.getElementById('w-fresh').click();
  ok(!!w.document.getElementById('f-apply'), 'Start fresh lands on Setup');
  ok(!!w.localStorage.getItem('palette2'), 'state persisted on start');
}

console.log('\n,  year build & rotation , ');
{
  const w = boot(baseState);
  const boxes = w.document.querySelectorAll('.box[data-p="1"]');
  ok(boxes.length === 5, 'first week renders 5 school days');
  const letters = [...boxes].map(b => b.dataset.letter).join('');
  ok(letters === 'ABCAB', 'rotation cycles A,B,C,A,B across Mon-Fri');
  ok(w.document.getElementById('wk-jump').options.length === 5, 'Aug 24, Sep 25 generates 5 weeks');
  /* Header cells now carry a paint control, so read the heading's own text
     rather than the cell's, textContent would include the button glyph. */
  const headText = (t) => {
    const c = t.cloneNode(true);
    c.querySelectorAll('button').forEach(b => b.remove());
    return c.textContent.trim();
  };
  const ths = [...w.document.querySelectorAll('table.week th')].map(headText);
  ok(ths[3] === '🍎', 'lunch column sits after period 2');
  ok(ths.length === 9, 'header = Day + 6 periods + lunch + Notes');
}

console.log('\n,  special day skips the letter , ');
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

console.log('\n,  typing persists , ');
{
  const w = boot(baseState);
  const saved = () => JSON.parse(w.localStorage.getItem('palette2'));
  const box = type(w, '2026-08-25', 2, 'Dot Day, read The Dot');
  await sleep(500);
  ok(Object.values(saved().cells).includes('Dot Day, read The Dot'), 'cell text saved to storage');
  ok(Object.keys(saved().cells).every(k => !/^\d{4}-/.test(k)), 'lessons are keyed to cycle position, not to a date');
  const nb = w.document.querySelector('.box[data-p="notes"][data-iso="2026-08-25"]');
  nb.textContent = 'Collect forms';
  nb.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(saved().notes['2026-08-25'] === 'Collect forms', 'notes saved to storage');
  box.textContent = '';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(500);
  ok(!Object.values(saved().cells).includes('Dot Day, read The Dot'), 'clearing a box removes the key');
}

console.log('\n,  copy bar , ');
{
  const w = boot(baseState);
  const box = type(w, '2026-08-25', 1, 'Clay pinch pots');
  box.dispatchEvent(new w.Event('focus'));
  ok(w.document.getElementById('bar').classList.contains('show'), 'bar shows on focus');
  ok(/Fill all B-days/.test(w.document.getElementById('bar-letter').textContent), 'letter button labeled for the day (Tue = B)');
  ok(/\(period 1\)/.test(w.document.getElementById('bar-letter').textContent), 'letter button states which period it copies');
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

console.log('\n,  destructive copy is refused, and every copy is undoable , ');
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

console.log('\n,  a cancelled day carries the plans forward with the cycle , ');
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

console.log('\n,  multi-line lessons survive a reload , ');
{
  const w = boot(clone(baseState));
  type(w, '2026-08-24', 1, 'Warm-up: djembes\nCall and response\nCool down');
  await sleep(500);
  const raw = w.localStorage.getItem('palette2');
  ok(/Warm-up: djembes\\nCall and response/.test(raw), 'newlines are stored as newlines');
  const w2 = boot(JSON.parse(raw));
  ok(textAt(w2, '2026-08-24', 1).split('\n').length === 3, 'three lines come back after a reload');
}

console.log('\n,  a write that fails is never reported as a save , ');
{
  const w = boot(clone(baseState));
  w.eval(`Storage.prototype.setItem=function(){ throw new DOMException('quota','QuotaExceededError') }`);
  type(w, '2026-08-24', 2, 'this cannot be saved');
  await sleep(500);
  ok(!w.document.getElementById('alert-wrap').hidden, 'a loud warning appears');
  ok(!w.document.getElementById('saved').classList.contains('show'), 'the Saved flag does NOT run');
  ok(/could not save|refused to save/i.test(w.document.getElementById('save-alert-text').textContent), 'the warning says what happened');
}

console.log('\n,  the last edit is flushed on the way out , ');
{
  const w = boot(clone(baseState));
  type(w, '2026-08-24', 4, 'typed and walked away');
  w.dispatchEvent(new w.Event('pagehide'));
  ok(Object.values(stored(w).cells).includes('typed and walked away'), 'pagehide writes the pending edit (no 400ms grace needed)');
}

console.log('\n,  backup round trip & migrate tolerance , ');
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

console.log('\n,  CSV export shape , ');
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

console.log('\n,  XSS safety , ');
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

console.log('\n,  setup apply reflows the grid , ');
{
  const w = boot(clone(baseState));
  w.document.querySelector('.tab[data-view="setup"]').click();
  w.document.getElementById('f-periods').value = 7;
  w.document.getElementById('f-periods').dispatchEvent(new w.Event('change', { bubbles: true }));
  w.document.getElementById('f-lunch').value = '3';
  w.document.getElementById('f-letters').value = 'A, B';
  w.document.getElementById('f-apply').click();
  /* Header cells now carry a paint control, so read the heading's own text
     rather than the cell's, textContent would include the button glyph. */
  const headText = (t) => {
    const c = t.cloneNode(true);
    c.querySelectorAll('button').forEach(b => b.remove());
    return c.textContent.trim();
  };
  const ths = [...w.document.querySelectorAll('table.week th')].map(headText);
  ok(ths.length === 10, '7 periods + lunch + day + notes = 10 headers');
  ok(ths[4] === '🍎', 'lunch moved to after period 3');
  const letters = [...w.document.querySelectorAll('.box[data-p="1"]')].map(b => b.dataset.letter).join('');
  ok(letters === 'ABABA', 'two-letter rotation applies');
  const s = JSON.parse(w.localStorage.getItem('palette2'));
  ok(s.config.periods === 7 && s.config.lunchAfter === 3, 'config saved');
}

console.log('\n,  accessibility contract , ');
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

  //, the colour editor (Stephen 2026-08-17: custom colours, add, delete), // "Edit colours" used to jump to Setup, where no editor existed. Guard the
  // real one: it opens as a modal, adds a colour, and deletes one cleanly.
  w.document.getElementById('p-edit').click();
  ok(w.document.getElementById('modal').classList.contains('show'), 'Edit colours opens the editor modal');
  const rowsBefore = w.document.querySelectorAll('#c-rows .crow').length;
  ok(rowsBefore > 0, 'editor lists the legend colours');
  ok(!!w.document.querySelector('#c-rows .crow .cswatch'), 'every colour row has a swatch button');
  // the swatch opens the wheel, not the native three-slider Android picker
  w.document.querySelector('#c-rows .crow .cswatch').click();
  const wheel = w.document.querySelector('#modal-sheet .cwheel');
  ok(!!wheel && !!wheel.querySelector('canvas') && !!wheel.querySelector('.cw-v'),
    'tapping a swatch opens the colour wheel with a brightness slider');
  w.document.querySelector('#c-rows .crow .cswatch').click();
  ok(!w.document.querySelector('#modal-sheet .cwheel'), 'tapping again folds the wheel away');
  w.document.getElementById('c-add').click();
  ok(w.document.querySelectorAll('#c-rows .crow').length === rowsBefore + 1, 'Add a colour grows the legend');
  const lastRow = [...w.document.querySelectorAll('#c-rows .crow')].pop();
  lastRow.querySelector('.crow-del').click();   // unused → deletes without confirm
  ok(w.document.querySelectorAll('#c-rows .crow').length === rowsBefore, 'deleting an unused colour removes it');
  w.document.getElementById('c-done').click();
  ok(!w.document.getElementById('modal').classList.contains('show'), 'Done closes the colour editor');

  w.document.querySelector('.tab[data-view="setup"]').click();
  const dp = w.document.querySelector('#f-days .dp');
  const before = dp.getAttribute('aria-pressed');
  dp.click();
  ok(dp.getAttribute('aria-pressed') !== before, 'day-picker toggle exposes pressed state');
}

console.log('\n,  Jessie notes 2026-08-18: period names, whole-day colour, dated rules , ');
{
  /* Custom column names: config carries them, everything spoken or printed
     reads them, and an unnamed column keeps its default. */
  const st = clone(baseState);
  st.config.periodNames = ['Kindergarten'];
  const w = boot(st);
  const headTexts = () => [...w.document.querySelectorAll('table.week thead th')].map(t => t.textContent.replace(/◧/g, '').trim());
  ok(headTexts()[1] === 'Kindergarten', 'custom name shows on the column heading');
  ok(headTexts()[2] === 'Period 2', 'an unnamed column keeps its default');
  const box = w.document.querySelector('.box[data-iso="2026-08-24"][data-p="1"]');
  ok(/Kindergarten/.test(box.getAttribute('aria-label')), 'the spoken box label carries the custom name');
  ok(w.eval('periodName(3)') === 'Period 3' && w.eval('periodName(3,true)') === 'period 3', 'defaults keep the old casing');

  // rename in place: type in the heading, blur commits, empty falls back
  let pn = w.document.querySelector('.pn-edit[data-pn="2"]');
  pn.textContent = 'Music';
  pn.dispatchEvent(new w.Event('blur'));
  ok(stored(w).config.periodNames[1] === 'Music', 'typing in the heading saves the name');
  ok(headTexts()[2] === 'Music', 'the grid re-renders with the new name');
  pn = w.document.querySelector('.pn-edit[data-pn="2"]');
  pn.textContent = '';
  pn.dispatchEvent(new w.Event('blur'));
  ok((stored(w).config.periodNames[1] || '') === '' && headTexts()[2] === 'Period 2', 'clearing the heading restores the default');

  // "Apply it to: every period this day", one apply, six boxes
  w.document.querySelector('[data-paint="cell:2026-08-25:1"]').click();
  const pick = w.document.querySelector('.cpick');
  ok(!!pick && [...pick.querySelectorAll('input[name="cp-scope"]')].some(r => r.value === 'day'), 'the picker offers every period this day');
  ok(pick.querySelector('#cp-range').hidden, 'the calendar boxes stay hidden for a one-off');
  pick.querySelector('.cs[data-id="k2"]').click();
  pick.querySelector('input[name="cp-scope"][value="day"]').click();
  pick.querySelector('#cp-ok').click();
  ok(Object.values(stored(w).fill).filter(v => v === 'k2').length === 6, 'one apply colours all six boxes of that day');

  // a notes box keeps its two choices, a heading gets dates with no radios
  w.document.querySelector('[data-paint^="note:"]').click();
  ok(w.document.querySelectorAll('.cpick input[name="cp-scope"]').length === 2, 'a notes box keeps its two choices');
  w.eval('closePicker()');
  w.document.querySelector('[data-paint="col:1"]').click();
  const pc = w.document.querySelector('.cpick');
  ok(!!pc.querySelector('#cp-range') && !pc.querySelector('#cp-range').hidden && !pc.querySelector('input[name="cp-scope"]'),
    'a column heading offers the calendar boxes straight away');
  w.eval('closePicker()');

  // "every Tuesday until Sep 4", an edited date makes a dated rule
  w.document.querySelector('[data-paint="cell:2026-08-25:3"]').click();
  const pick2 = w.document.querySelector('.cpick');
  pick2.querySelector('.cs[data-id="k1"]').click();
  pick2.querySelector('input[name="cp-scope"][value="all"]').click();
  ok(!pick2.querySelector('#cp-range').hidden, 'choosing a recurring scope reveals the calendar boxes');
  pick2.querySelector('#cp-to').value = '2026-09-04';
  pick2.querySelector('#cp-ok').click();
  const s2 = stored(w);
  ok(s2.fillRules.length === 1 && s2.fillRules[0].to === '2026-09-04' && s2.fillRules[0].p === 3 && s2.fillRules[0].dow === 2,
    'an edited date stores a dated weekly rule');
  ok(Object.keys(s2.fillDow).length === 0, 'the standing rules are untouched');
  ok(w.eval(`(()=>{buildYearIfStale();const d=YEAR[0].days.find(x=>x.iso==='2026-08-25');return (fillFor(d,3)||{}).id})()`) === 'k1',
    'the rule colours a Tuesday inside the dates');
  ok(w.eval(`(()=>{buildYearIfStale();const d=YEAR[2].days.find(x=>x.dow===2);return fillFor(d,3)})()`) === null,
    'a Tuesday after the last date stays plain');

  // precedence: naming the period beats an every-period rule, one-offs beat both
  w.eval(`(()=>{ensureColourState();S.fillRules.push({c:'k5',dow:2,p:0,from:'',to:''});persist(true)})()`);
  ok(w.eval(`(()=>{const d=YEAR[1].days.find(x=>x.dow===2);return (fillFor(d,3)||{}).id})()`) === 'k1',
    'a rule naming the period beats an every-period rule');
  ok(w.eval(`(()=>{const d=YEAR[1].days.find(x=>x.dow===2);return (fillFor(d,5)||{}).id})()`) === 'k5',
    'the every-period rule covers the rest of the day');
  ok(w.eval(`(()=>{const d=YEAR[0].days.find(x=>x.iso==='2026-08-25');return (fillFor(d,5)||{}).id})()`) === 'k2',
    'a one-off painted box still wins over every rule');

  // dated column-heading rule: on for a week inside the dates, off after
  w.eval(`(()=>{ensureColourState();S.fillColRules.push({c:'k3',col:2,from:'2026-08-24',to:'2026-08-28'});persist(true)})()`);
  ok(w.eval(`(()=>{return colFillId(2,YEAR[0])})()`) === 'k3', 'a dated heading rule colours its weeks');
  ok(w.eval(`(()=>{return colFillId(2,YEAR[1])||null})()`) === null, 'and lets go outside them');

  // the legend and the colour editor both know rules are uses
  ok(w.eval(`usedColourIds().has('k1') && usedColourIds().has('k3')`), 'rule colours count as used for the printed key');
  w.eval(`scrubColour('k1')`);
  ok(w.eval('S.fillRules.every(r=>r.c!==\'k1\')'), 'deleting a colour scrubs its rules too');

  // Setup carries the names too, for phones where the heading row is hidden
  const w3 = boot(clone(baseState));
  w3.document.querySelector('.tab[data-view="setup"]').click();
  w3.document.getElementById('f-pn-1').value = 'Art K';
  w3.document.getElementById('f-apply').click();
  ok(stored(w3).config.periodNames[0] === 'Art K', 'Setup saves a period name');
  ok([...w3.document.querySelectorAll('table.week thead th')].some(t => /Art K/.test(t.textContent)), 'and the grid heading shows it');

  // a hostile column name is text, never markup
  const evil = clone(baseState);
  evil.config.periodNames = ['"><img src=x onerror=window.__pwn=1>'];
  const w2 = boot(evil);
  ok(!w2.__pwn && !w2.document.querySelector('table.week img'), 'a hostile column name cannot inject markup');
}

console.log('\n,  Jessie notes 2026-08-18 round 2: fit mode has a way out , ');
{
  const w = boot(clone(baseState));
  ok(!!w.document.getElementById('fitbar'), 'the fitbar exists in the DOM (its CSS shipped a round early, the bar did not)');
  w.eval('toggleFit(true)');
  ok(w.document.body.classList.contains('fitscreen'), 'fit mode takes hold');
  ok(stored(w).fit === true, 'and is remembered');
  ok(!!w.document.getElementById('fit-exit'), 'an exit control exists while every other control is hidden');
  w.document.getElementById('fit-exit').click();
  ok(!w.document.body.classList.contains('fitscreen'), 'Exit full screen leaves the mode');
  ok(stored(w).fit === false, 'and the preference follows');

  w.eval('toggleFit(true)');
  w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!w.document.body.classList.contains('fitscreen'), 'Escape also leaves fit mode');

  // the two honest fits: whole week, or bigger text with a scroll
  w.eval('toggleFit(true)');
  const mb = w.document.getElementById('fit-mode');
  ok(mb.textContent === 'Bigger text', 'the mode button offers the other fit');
  mb.click();
  ok(stored(w).fitMode === 'width', 'choosing it stores the width fit');
  ok(mb.textContent === 'Whole week', 'and the button now offers the way back');
  mb.click();
  ok(stored(w).fitMode === 'all', 'which restores the whole-week fit');
  w.eval('toggleFit(false)');

  // the week arrows in the bar actually turn pages
  w.document.getElementById('fit-next').click();
  ok(w.eval('curWeek') === 1, 'the fitbar arrow reaches the next week');
}

console.log('\n,  Jessie notes 2026-08-18 round 2: select many, restyle once , ');
{
  const w = boot(clone(baseState));
  const doc = w.document;
  const md = (el, init) => el.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, ...init }));

  // the door in: a visible button, not a secret
  doc.getElementById('p-multi').click();
  ok(doc.body.classList.contains('selecting'), 'Select many turns the mode on');
  ok(doc.querySelector('.box').getAttribute('contenteditable') === 'false', 'boxes stop being text fields');
  ok(!!doc.getElementById('sel-dim'), 'the palette strip becomes the restyling toolbar');

  // pick up two lesson boxes and the notes box
  md(boxAt(w, '2026-08-24', 1));
  md(boxAt(w, '2026-08-24', 2));
  md(doc.querySelector('.box[data-iso="2026-08-24"][data-p="notes"]'));
  ok(doc.querySelectorAll('table.week td.sel').length === 3, 'three clicks hold three boxes');
  md(boxAt(w, '2026-08-24', 2));
  ok(doc.querySelectorAll('table.week td.sel').length === 2, 'clicking a held box puts it down');
  md(boxAt(w, '2026-08-24', 2));

  // one colour click lands on all of them
  doc.querySelector('[data-selpaint="k2"]').click();
  let s = stored(w);
  ok(s.fill['c0|1'] === 'k2' && s.fill['c0|2'] === 'k2' && s.fill['n2026-08-24'] === 'k2',
    'one colour click paints every held box, notes included');
  ok(doc.querySelectorAll('table.week td.sel').length === 3, 'the selection survives the repaint');

  // grey out, and back
  doc.getElementById('sel-dim').click();
  s = stored(w);
  ok(s.dim['c0|1'] === 1 && s.dim['c0|2'] === 1 && s.dim['n2026-08-24'] === 1, 'Grey out dims every held box');
  ok(doc.querySelectorAll('table.week td.dimmed').length === 3, 'and the grid shows it');
  ok(doc.getElementById('sel-dim').textContent === 'Un-grey', 'the button now offers the way back');
  doc.getElementById('sel-dim').click();
  ok(Object.keys(stored(w).dim).length === 0, 'Un-grey clears them all');

  // size and font, together, still one gesture each
  doc.getElementById('sel-sz-l').click();
  ok(stored(w).boxStyle['c0|1'].sz === 'l', 'bigger text stores its token');
  ok(boxAt(w, '2026-08-24', 1).classList.contains('sz-l'), 'and the box wears it');
  const fo = doc.getElementById('sel-font');
  fo.value = 'hand';
  fo.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(stored(w).boxStyle['c0|1'].f === 'hand', 'the font stores alongside the size');
  ok(boxAt(w, '2026-08-24', 1).classList.contains('f-hand'), 'and renders');

  // it all comes back after a reload, and an old backup without these
  // stores boots fine (every other block in this suite already proves that)
  const w2 = boot(stored(w));
  ok(boxAt(w2, '2026-08-24', 1).classList.contains('sz-l') && boxAt(w2, '2026-08-24', 1).classList.contains('f-hand'),
    'size and font survive a reload');

  // clear styling empties every store for the held boxes
  doc.getElementById('sel-sz-m').click();
  ok(stored(w).boxStyle['c0|1'].sz === undefined && stored(w).boxStyle['c0|1'].f === 'hand',
    'normal size clears the token and keeps the font');
  doc.getElementById('sel-clear').click();
  s = stored(w);
  ok(!s.fill['c0|1'] && !s.dim['c0|1'] && !s.boxStyle['c0|1'], 'Clear styling empties every store for the held boxes');

  // done: boxes are text fields again
  doc.getElementById('sel-done').click();
  ok(!doc.body.classList.contains('selecting'), 'Done leaves the mode');
  ok(doc.querySelector('.box').getAttribute('contenteditable') !== 'false', 'boxes are editable again');

  // week nav drops the handful rather than styling boxes off screen
  doc.getElementById('p-multi').click();
  md(boxAt(w, '2026-08-24', 1));
  doc.getElementById('wk-next').click();
  ok(w.eval('selBoxes.size') === 0, 'changing weeks empties the selection');
  ok(doc.body.classList.contains('selecting'), 'but the mode stays on for the new week');
  w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!doc.body.classList.contains('selecting'), 'Escape leaves select mode');

  // the laptop shortcut: Ctrl-click goes straight in
  const w3 = boot(clone(baseState));
  md(boxAt(w3, '2026-08-24', 1), { ctrlKey: true });
  ok(w3.document.body.classList.contains('selecting'), 'Ctrl-click enters select mode');
  ok(w3.document.querySelectorAll('table.week td.sel').length === 1, 'holding the box it started on');

  // keyboard path: Space toggles a focused box
  const b3 = boxAt(w3, '2026-08-24', 2);
  b3.dispatchEvent(new w3.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  ok(w3.document.querySelectorAll('table.week td.sel').length === 2, 'Space picks up the focused box');
}

console.log('\n,  reset , ');
{
  const w = boot(clone(baseState));
  w.eval('resetAll()');
  ok(w.localStorage.getItem('palette2') === null, 'storage cleared');
  ok(!!w.document.getElementById('w-fresh'), 'back to welcome screen');
}

/* A backup file arrives from another person: this app tells teachers a backup
   "restores on any phone or computer" and offers Restore as one of three front
   doors, so passing them around is the intended workflow. Every legend colour
   is written into a style attribute in the week grid, and a hex carrying a
   quote closes that attribute and adds markup of its own, which runs as this
   origin. This origin is every app in the studio sharing one localStorage.
   Reproduced end to end through the real UI in headless Chromium before it was
   closed: the payload renamed the page and read the sibling apps' data.

   Both layers are asserted, because either one alone would close it and a
   later edit could remove the other without anyone noticing. */
console.log('\n== a hostile colour in a restored backup cannot become markup ==');
{
  // built on the real base state, or the app never finishes booting and the
  // week grid, which is the sink, is never drawn at all
  const hostile = clone(baseState);
  hostile.legend = [{ id: 'k1', name: 'Art', hex: '#ffffff;"><img src=x onerror="globalThis.__pwned=1">' }];
  hostile.fillCol = { '1': 'k1' };
  hostile.fillDay = { '1': 'k1' };
  const w = boot(hostile);
  await sleep(300);
  /* Read what the app is actually USING, not what is on disk: the stored file
     keeps whatever bytes it arrived with, which is harmless once the value is
     coerced on the way in and escaped on the way out. */
  const painted = w.document.querySelector('[style*="--cell-fill"]');
  const hex = painted ? painted.getAttribute('style') : '';
  ok(!/[<>]/.test(hex),
    `no markup survives into a style attribute (got ${JSON.stringify(hex).slice(0, 90)})`);
  ok(w.document.querySelectorAll('img[onerror], img[src="x"]').length === 0,
    'and nothing from the file becomes an element');
  ok(!w.__pwned, 'and nothing from the file runs');

  // second layer: the week grid must escape, the way every other hex sink here does
  const src = html;
  ok(!/--cell-fill:\$\{(?!esc\()/.test(src),
    'every colour written into a style attribute goes through esc()');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
