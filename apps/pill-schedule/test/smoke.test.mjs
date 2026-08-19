// jsdom smoke, add meds, persistence, printed grid rows.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script type="module" src="app.js"></script>', '');
const dom = new JSDOM(html, { url: 'http://localhost:8098/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
global.window = window;
global.document = doc;
global.location = window.location;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.localStorage = window.localStorage;
window.print = () => { window.__printed = true; };

await import('../app.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(50);

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra || ''); failures = 1; }
};
const $ = (id) => doc.getElementById(id);
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new window.Event('input', { bubbles: true })); };

type('whoInput', 'Mom');
type('medName', 'Lisinopril');
type('medDose', '5 mg');
const boxes = $('medTimes').querySelectorAll('input');
boxes[0].checked = true;  // Morning
boxes[3].checked = true;  // Bedtime
$('addMed').click();
await sleep(20);
check('med listed with times in canonical order', $('medList').textContent.includes('Morning · Bedtime'));
check('persisted', (window.localStorage.getItem('pill-schedule') || '').includes('Lisinopril'));

type('medName', 'Metformin');
boxes[1].checked = true;
$('addMed').click();
await sleep(20);

$('printBtn').click();
await sleep(20);
check('print invoked', window.__printed === true);
const rows = $('sheet').querySelectorAll('tbody tr');
check('one grid row per med per time (3 total)', rows.length === 3, 'got ' + rows.length);
check('7 day cells per row', rows[0].querySelectorAll('td.day').length === 7);
check('title uses the name', $('sheet').textContent.includes('Mom’s Medication Schedule'));
check('disclaimer printed', $('sheet').textContent.includes('not a medical record'));

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
