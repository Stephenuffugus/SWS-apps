// jsdom, the sitter's half of the app: a shared link renders a read-only
// page with tap-to-call numbers, and writes nothing to the recipient's device.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SHEET = {
  kids: 'Maya (6)\nLeo (3)',
  allergies: 'Maya: peanuts, EpiPen in the red box on the counter.',
  parents: 'Sam: 555-0101\nRiver: 555-0102',
  backup: 'Grandma Pat next door: 555-0333',
  address: '412 Maple Ct',
  cross: 'corner of Maple & Elm',
  bedtime: '7:30 bath, 8:00 books, lights out 8:30.',
};
const payload = Buffer.from(JSON.stringify({ m: 'baby', d: SHEET, u: '2026-08-09' }), 'utf8')
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script type="module" src="app.js"></script>', '');
const dom = new JSDOM(html, {
  url: 'http://localhost:8097/sitter-sheet/#' + payload,
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
global.window = window;
global.document = doc;
global.location = window.location;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.localStorage = window.localStorage;
window.print = () => { window.__printed = true; };

const app = await import('../app.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(60);

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra || ''); failures = 1; }
};
const $ = (id) => doc.getElementById(id);
const text = () => $('sitterView').textContent;

/* ── The link opens the sitter's document, not the parent's form ────────── */
check('sitter view is shown', !$('sitterView').classList.contains('hidden'));
check('the edit form is hidden', $('editView').classList.contains('hidden'));
check('nothing in the sitter view is editable',
  $('sitterView').querySelectorAll('input,textarea,select').length === 0,
  $('sitterView').querySelectorAll('input,textarea,select').length);

/* ── The three-second panel ─────────────────────────────────────────────── */
const s3 = doc.querySelector('#sitterView .s3');
check('a 3-second panel exists', !!s3);
check('it carries the address', s3.textContent.includes('412 Maple Ct'));
check('it carries the cross street', s3.textContent.includes('corner of Maple & Elm'));
check('it carries the allergy line', s3.textContent.includes('EpiPen'));
check('911 is on screen', s3.textContent.includes('911'));
check('Poison Control is on screen', s3.textContent.includes('1-800-222-1222'));

/* ── Tap-to-call ────────────────────────────────────────────────────────── */
const tels = [...$('sitterView').querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
check('emergency numbers are tel: links', tels.includes('tel:911') && tels.includes('tel:18002221222'), tels);
check("the parents' numbers are tel: links", tels.includes('tel:5550101') && tels.includes('tel:5550102'), tels);
check('a time of day is not mistaken for a phone number', !tels.some((t) => /73008|8008300/.test(t)), tels);

/* ── Nothing is written to the recipient's device ───────────────────────── */
check('no sheet was persisted to this device',
  window.localStorage.getItem('sitter-baby') === null,
  window.localStorage.getItem('sitter-baby'));
check('the hash is kept so a reload still works offline',
  window.location.hash.length > 1);

/* ── No worked example is ever rendered as content ──────────────────────── */
check('no fabricated example text anywhere on the page',
  !/Maya: peanuts \(EpiPen on the counter|Dr\. Chen|Grandma Pat \(next door\)|hunter2!/.test(doc.body.textContent));
check('no field anywhere carries a placeholder',
  doc.querySelectorAll('[placeholder]').length === 0,
  doc.querySelectorAll('[placeholder]').length);

/* ── Saving is a choice, and it is undoable ─────────────────────────────── */
const saveBtn = [...$('sitterView').querySelectorAll('button')]
  .find((b) => b.textContent.includes('Save to this device'));
check('a save-to-this-device button is offered', !!saveBtn);
saveBtn.click();
check('saving writes the sheet', (window.localStorage.getItem('sitter-baby') || '').includes('412 Maple Ct'));
check('and the page now says so', text().includes('Saved to this device'));

/* ── The parent's form, once they choose to edit ────────────────────────── */
const editBtn = [...$('sitterView').querySelectorAll('button')]
  .find((b) => b.textContent.includes('Edit this sheet'));
editBtn.click();
await sleep(30);
check('editing shows the form', !$('editView').classList.contains('hidden'));
check('every field has a hint under it, not inside it',
  doc.querySelectorAll('#form .field > .hint').length === doc.querySelectorAll('#form .field').length,
  doc.querySelectorAll('#form .field > .hint').length + '/' + doc.querySelectorAll('#form .field').length);
check('filled fields are marked with a glyph, not a colour',
  doc.querySelectorAll('#form .field.is-filled .fmark').length === 7,
  doc.querySelectorAll('#form .field.is-filled .fmark').length);
check('the character cap is enforced by the control',
  [...doc.querySelectorAll('#form textarea')].every((t) => Number(t.getAttribute('maxlength')) === 4000));

/* ── The completeness nudge names the missing high-stakes fields ────────── */
check('a complete sheet is not nagged, even with 5 optional fields empty',
  $('gaps').classList.contains('hidden'),
  JSON.stringify($('gaps').textContent));

const allergyBox = doc.getElementById('f-allergies');
allergyBox.value = '';
allergyBox.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(20);
check('emptying the allergy field raises the nudge', !$('gaps').classList.contains('hidden'));
check('and the nudge names that field specifically',
  $('gaps').textContent.includes('No allergy or medication info.'),
  JSON.stringify($('gaps').textContent));
check('and stays silent about the other sixty',
  !/doctor|wifi|meals|house rules/i.test($('gaps').textContent),
  JSON.stringify($('gaps').textContent));
allergyBox.value = SHEET.allergies;
allergyBox.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(20);
check('filling it back in clears the nudge', $('gaps').classList.contains('hidden'));

/* ── The printed sheet leads with the same three things ─────────────────── */
$('printBtn').click();
await sleep(20);
const sheet = $('sheet');
check('the print sheet leads with the 3-second panel', !!sheet.querySelector('.top3'));
check('the panel precedes the columns',
  [...sheet.children].findIndex((c) => c.classList.contains('top3')) <
  [...sheet.children].findIndex((c) => c.classList.contains('cols')));
check('the printed sheet is dated', sheet.textContent.includes('Updated'));
check('the columns are CSS multi-column, not two flex children',
  sheet.querySelectorAll('.cols .col').length === 0);

/* ── The share round-trips ──────────────────────────────────────────────── */
check('the schema still exports', !!app.SCHEMAS && !!app.SCHEMAS.baby && !!app.SCHEMAS.pet);

console.log(failures ? '\nSITTER VIEW FAILED' : '\nSITTER VIEW PASSED');
process.exit(failures);
