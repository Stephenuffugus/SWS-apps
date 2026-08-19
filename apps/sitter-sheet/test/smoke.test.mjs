// jsdom smoke, fields persist, sheet renders only filled blocks.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script type="module" src="app.js"></script>', '');
const dom = new JSDOM(html, { url: 'http://localhost:8097/', runScripts: 'dangerously', pretendToBeVisual: true });
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

check('babysitter form renders', $('form').textContent.includes('Bedtime & routine'));

// type into the kids field
const ta = $('form').querySelector('textarea');
ta.value = 'Maya (6)';
ta.dispatchEvent(new window.Event('input', { bubbles: true }));
check('value persisted to localStorage', (window.localStorage.getItem('sitter-baby') || '').includes('Maya (6)'));

// switch to pet mode and back, data survives
$('modePet').click();
check('pet form renders', $('form').textContent.includes('Walks & litter'));
$('modeBaby').click();
check('baby data restored after mode switch', $('form').querySelector('textarea').value === 'Maya (6)');

// print renders only filled blocks
$('printBtn').click();
await sleep(20);
check('print invoked', window.__printed === true);
check('sheet shows the filled block', $('sheet').textContent.includes('Maya (6)'));
check('sheet omits empty blocks', !$('sheet').textContent.includes('WiFi'));
check('emergency line present', $('sheet').textContent.includes('Poison Control'));

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
