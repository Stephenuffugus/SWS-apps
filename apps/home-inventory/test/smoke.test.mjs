// jsdom smoke test — drives the home-inventory UI (no IndexedDB, no canvas;
// the app must degrade; photo capture is exercised via a stubbed pick).
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script src="vendor-pdf-lib.js"></script>', '')
  .replace('<script type="module" src="app.js"></script>', '');

const dom = new JSDOM(html, { url: 'http://localhost:8096/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
global.window = window;
global.document = doc;
global.location = window.location;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
// No native dialogs anywhere any more: prompt() and confirm() are replaced by
// #askDlg and by SWS.undo. If the app ever calls one again, this fails loudly.
window.prompt = global.prompt = () => { throw new Error('app called prompt()'); };
window.confirm = global.confirm = () => { throw new Error('app called confirm()'); };
window.PDFLib = null;

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
const clickText = (root, text) => {
  const n = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  if (!n) throw new Error(`no button "${text}"`);
  n.click();
};

check('home hero renders', $('view').textContent.includes('Photograph it before you need it'));

check('trust badge states where the data lives', $('view').textContent.includes('stay in this browser'));

clickText($('view'), 'Start an inventory');
await sleep(20);
check('naming happens in a real dialog, not prompt()', $('askDlg').hasAttribute('open') || $('askTitle').textContent === 'Name this inventory');
$('askField').value = '42 Wallaby Way';
clickText($('askBtns'), 'Create');
await sleep(60);
check('editor opens with default rooms', $('view').textContent.includes('Living room'));

// capture an item (no photo — jsdom has no canvas; name-only path)
const nameIn = $('capName');
type(nameIn, '65-inch TV');
const valIn = $('capValue');
type(valIn, '1,200');
clickText($('view'), 'Save & next');
await sleep(20);
check('item saved with value in summary', $('view').textContent.includes('1 items') && $('view').textContent.includes('1,200'),
  $('view').textContent.slice(0, 200));

// items tab shows it
clickText($('view'), 'Items');
await sleep(20);
check('items list shows the TV', $('view').textContent.includes('65-inch TV'));

// edit dialog: add serial
[...$('view').querySelectorAll('button')].find(b => b.textContent.trim() === '✎').click();
await sleep(20);
$('iSerial').value = 'SN-99';
$('iSave').click();
await sleep(20);
check('serial saved and shown', $('view').textContent.includes('SN SN-99'), $('view').textContent.slice(0, 300));

// rooms tab: add a room
clickText($('view'), 'Rooms');
await sleep(20);
const roomIn = [...$('view').querySelectorAll('input')].find(i => i.placeholder && i.placeholder.includes('Garage'));
type(roomIn, 'Home office');
clickText($('view'), 'Add');
await sleep(20);
check('room added', $('view').textContent.includes('Home office'));

// export tab renders with the off-device warning
clickText($('view'), 'Export');
await sleep(20);
check('off-device warning is loud', $('view').textContent.includes('cruel joke'));
check('two PDFs + CSV + backup offered', $('view').querySelectorAll('.exportcard').length === 4,
  'exportcards: ' + $('view').querySelectorAll('.exportcard').length);
check('the CSV is offered and the PDF is not called what adjusters ask for',
  $('view').textContent.includes('Spreadsheet (CSV)') && !$('view').textContent.includes('the format insurance adjusters ask for'));

// search and sort exist, and the count line never hides a filter
clickText($('view'), 'Items');
await sleep(20);
check('search field exists', !!$('itemSearch'));
check('sort control exists', !!$('itemSort'));
check('the list says how much of itself it is showing', $('view').textContent.includes('Showing all 1 items'),
  $('view').textContent.slice(0, 300));
type($('itemSearch'), 'zzzz');
await sleep(20);
check('a search that hides rows says so', $('view').textContent.includes('Showing 0 of 1 items'),
  $('view').textContent.slice(0, 300));
check('main is not a live region', !$('view').hasAttribute('aria-live'));

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
