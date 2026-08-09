// jsdom smoke test: drive the real bill-splitter UI end to end.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Drop the external vendor script tag — QR isn't exercised here and jsdom
// file-loading is flaky; everything else runs as-is.
const patched = html.replace('<script src="vendor-qrcode.js"></script>', '');

const dom = new JSDOM(patched, {
  url: 'http://localhost:8080/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function type(id, value) {
  const n = $(id);
  n.value = value;
  n.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function change(id, value) {
  const n = $(id);
  n.value = value;
  n.dispatchEvent(new window.Event('change', { bubbles: true }));
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ok:', name); }
  else { console.error('  FAIL:', name, extra || ''); failures = 1; }
}

await sleep(200); // let async init settle

check('init: dinner tab active', $('tabDinner').classList.contains('active'));
check('init: tip-jar button visible and points at Stripe',
  !$('tipLink').classList.contains('hidden') && $('tipLink').href.startsWith('https://buy.stripe.com/'));

// --- dinner flow ---
type('personInput', 'Alice'); $('personAdd').click();
type('personInput', 'Bob'); $('personAdd').click();
check('two people chips rendered', $('peopleChips').children.length === 2);

type('billAmt', '50.00');
type('taxAmt', '4.50');
type('tipAmt', '20'); // 20% default
let results = $('dinnerResults').textContent;
check('even split shows $32.25 per person', results.includes('32.25'), results.slice(0, 200));
check('total shows $64.50', results.includes('64.50'));

// who paid -> pay buttons for the other person
const aliceId = $('paidBy').options[1].value;
change('paidBy', aliceId);
results = $('dinnerResults').textContent;
check('payer marked', results.includes('paid the bill'), results.slice(0, 200));
check('copy-amount fallback button present', $('dinnerResults').querySelector('.paybtns button') !== null);

// items mode
$('segItems').click();
type('itemLabel', 'Steak'); type('itemAmt', '30'); $('itemAdd').click();
type('itemLabel', 'Salad'); type('itemAmt', '10'); $('itemAdd').click();
check('two items listed', $('itemList').children.length === 2);
// assign steak to Alice only (first item, first person chip)
$('itemList').querySelector('.chips button').click();
results = $('dinnerResults').textContent;
check('items mode renders results', results.includes('Total'), results.slice(0, 200));

// --- trip flow ---
$('tabTrip').click();
check('people box moved into trip view', $('viewTrip').contains($('peopleBox')));
type('expLabel', 'Gas'); type('expAmt', '30');
$('expAdd').click();
check('expense listed', $('expList').textContent.includes('Gas'), $('expList').textContent);
const trip = $('tripResults').textContent;
check('settle-up shows Bob → Alice', trip.includes('Bob → Alice'), trip.slice(0, 300));
check('transfer amount $15.00', trip.includes('15.00'));

// edit expense: change amount, save
$('expList').querySelector('button[aria-label^="Edit "]').click();
check('edit mode label', $('expAdd').textContent === 'Save changes');
type('expAmt', '40');
$('expAdd').click();
check('edited amount reflected', $('tripResults').textContent.includes('20.00'), $('tripResults').textContent.slice(0, 300));

// zero shares in an uneven split = excluded (review finding 3)
$('expList').querySelector('button[aria-label^="Edit "]').click();
const uneven = $('expUneven');
uneven.checked = true;
uneven.dispatchEvent(new window.Event('change', { bubbles: true }));
const weightInputs = $('expWeights').querySelectorAll('input');
check('weight inputs rendered for both people', weightInputs.length === 2);
weightInputs[0].value = '0'; // Alice: zero shares
weightInputs[0].dispatchEvent(new window.Event('input', { bubbles: true }));
$('expAdd').click();
const tripAfterZero = $('tripResults').textContent;
check('zero-share person excluded: Bob owes the full $40', tripAfterZero.includes('40.00'), tripAfterZero.slice(0, 300));

// comma-decimal parsing reachable from the page (review finding 1)
check('parseAmount("12,50") is 1250 cents', window.parseAmount('12,50') === 1250);

// removing a person who's on an expense should be blocked (via the real dialog)
$('peopleChips').querySelector('button').click(); // open Alice's edit dialog
$('pdRemove').click();                            // blocked: she paid for Gas
check('payer on expense cannot be removed', $('peopleChips').children.length === 2);
$('pdCancelBtn').click();

// --- share hash + summary (decode the real hash back into a state) ---
await sleep(700); // debounced persist
const hash = window.location.hash;
check('hash carries state (fallback codec in jsdom)', hash.startsWith('#0.'), hash.slice(0, 8));
const decoded = await window.decodeShare(hash);
check('hash decodes back to state', decoded && decoded.people.length === 2 && decoded.trip.expenses.length === 1);
const summary = window.buildSummary(decoded);
check('summary names both people', summary.includes('Alice') && summary.includes('Bob'), summary);
check('summary has settle line', summary.includes('→'));

// --- saved tab renders without storage ---
$('tabSaved').click();
await sleep(100);
check('saved tab renders, empty-state visible', !$('savedEmpty').classList.contains('hidden'));

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
