// jsdom smoke test: drive the seating-chart UI end to end (no IndexedDB in
// jsdom, the app must degrade gracefully; PDFLib is stubbed).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script src="vendor-pdf-lib.js"></script>', '')
  .replace('<script type="module" src="app.js"></script>', '');

const dom = new JSDOM(html, { url: 'http://localhost:8095/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
global.window = window;
global.document = doc;
global.location = window.location;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
window.prompt = global.prompt = () => 'Rivera Wedding';
window.confirm = global.confirm = () => true;
window.PDFLib = null; // print buttons untested here; pdf.test.mjs covers the pipeline

// import the app as a module in this process, bound to the jsdom globals
await import('../app.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(100);

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra || ''); failures = 1; }
};
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const clickText = (root, tag, text) => {
  const n = [...root.querySelectorAll(tag)].find(b => b.textContent.trim() === text);
  if (!n) throw new Error(`no <${tag}> "${text}"`);
  n.click();
  return n;
};

check('home renders hero', $('view').textContent.includes('Seating charts without the 2am panic'));

// Naming an event goes through #nameDlg, not a native prompt(), a system
// prompt is the one surface the comfort panel cannot reach.
clickText($('view'), 'button', 'New event');
await sleep(50);
check('name dialog opens', $('nameDlg') && $('nameDlg').hasAttribute('open'));
check('the name field takes focus', document.activeElement === $('nameField'));
type($('nameField'), 'Rivera Wedding');
clickText($('nameDlg'), 'button', 'Create');
await sleep(50);
check('name dialog closes', !$('nameDlg').hasAttribute('open'));
check('editor opens with project name', [...$('view').querySelectorAll('input')].some(i => i.value === 'Rivera Wedding'));

// guests: bulk paste
const ta = $('view').querySelector('textarea');
type(ta, 'Ann Alvarez, Alvarez family, Beef\nBen Alvarez, Alvarez family, Fish\nCara Chen, Veg, nut allergy\nDev Chen');
clickText($('view'), 'button', 'Add them all');
await sleep(20);
check('guests added', $('view').textContent.includes('4 guests'), $('view').textContent.slice(0, 120));

// tables tab: add two tables
clickText($('view'), 'button', 'Tables');
await sleep(20);
const seats = [...$('view').querySelectorAll('input[type=number]')][0];
seats.value = '3';
clickText($('view'), 'button', 'Add');
clickText($('view'), 'button', 'Add');
await sleep(20);
check('two tables on the floor plan', $('view').querySelectorAll('.floor .tbl').length === 2);

// seat tab: select the Alvarez party, place at table 1
clickText($('view'), 'button', 'Seat people');
await sleep(20);
check('unseated pool lists guests', $('view').textContent.includes('Not seated yet (4)'));
clickText($('view'), 'button', 'whole party (2)');
await sleep(20);
const tableCard = $('view').querySelector('.tablecard');
tableCard.click();
await sleep(20);
check('party seated at first table', tableCard === null ? false : $('view').textContent.includes('Not seated yet (2)'), $('view').textContent.slice(0, 300));

// auto-arrange the rest
clickText($('view'), 'button', 'Suggest an arrangement');
await sleep(20);
check('everyone seated after suggestion', $('view').textContent.includes('Everyone is seated'));
check('no violations', $('view').textContent.includes('No broken rules'));

// overload a table to trigger a violation: move everyone to table 1 (3 seats)
const proj = null; // internal state not exposed; drive via UI, unseat + place all at T1
clickText($('view'), 'button', 'Clear all seats');
await sleep(20);
// select all four individually
for (const chip of [...$('view').querySelectorAll('.chip')].filter(c => !c.textContent.includes('party'))) chip.click();
await sleep(20);
$('view').querySelector('.tablecard').click();
await sleep(20);
check('capacity violation surfaces', $('view').textContent.includes('to fix') && /people for 3 seats/.test($('view').textContent),
  $('view').textContent.slice(0, 300));

// rules tab renders
clickText($('view'), 'button', 'Rules');
await sleep(20);
check('rules tab empty-state', $('view').textContent.includes('declared once, checked forever'));

// print tab renders export cards
clickText($('view'), 'button', 'Print & export');
await sleep(20);
check('three export cards', $('view').querySelectorAll('.exportcard').length === 3);
check('caterer sheet described', $('view').textContent.includes('Caterer'));

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
