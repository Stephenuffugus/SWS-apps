// jsdom smoke — form persists, folder prints only filled blocks, share link
// round-trips, hostile input stays inert.
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

const app = await import('../app.js');
const { SCHEMA, decodeSheet } = app;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(50);

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra || ''); failures = 1; }
};
const $ = (id) => doc.getElementById(id);
const setField = (elm, v) => { elm.value = v; elm.dispatchEvent(new window.Event('input', { bubbles: true })); };
const inputs = () => [...$('form').querySelectorAll('input,textarea')];
const byPlaceholder = (frag) => inputs().find((i) => (i.placeholder || '').includes(frag));

// --- schema sanity
const keys = SCHEMA.sections.flatMap(([, fields]) => fields.map(([k]) => k));
check('schema keys are unique', new Set(keys).size === keys.length);

// --- form renders
check('form renders all sections', $('form').textContent.includes('Bell schedule') && $('form').textContent.includes('Helpers you can trust'));

// --- guards before any content
$('shareBtn').click();
check('share guard with empty folder', $('toast').textContent.includes('at least one field'));

// --- typing persists
setField(byPlaceholder('Ms. Rivera'), 'Ms. Vega');
setField(byPlaceholder('8:00 Morning work'), 'Math packet, then the volcano video');
check('teacher persisted', (window.localStorage.getItem('subplans') || '').includes('Ms. Vega'));
check('plan persisted', (window.localStorage.getItem('subplans') || '').includes('volcano'));

// --- field cap
setField(byPlaceholder('Extra worksheets'), 'x'.repeat(5000));
check('field capped at 4000 chars', JSON.parse(window.localStorage.getItem('subplans')).backup.length === 4000);

// --- print: filled blocks in, empty blocks out, no emergency box yet
$('printBtn').click();
await sleep(20);
check('print invoked', window.__printed === true);
check('header carries the teacher name', $('sheet').querySelector('h1').textContent.includes('Ms. Vega'));
check('plan text on the folder', $('sheet').textContent.includes('volcano video'));
check('empty blocks omitted', !$('sheet').textContent.includes('Tech'));
check('no emergency box before it is filled', !$('sheet').querySelector('.em'));
check('leave-me-a-note box always prints', $('sheet').textContent.includes('Leave me a note'));

// --- header composition
setField(byPlaceholder('3rd grade'), '4th grade');
setField(byPlaceholder('12'), '7');
setField(byPlaceholder('Maple Elementary'), 'Cedar Elementary');
setField(byPlaceholder('Tuesday, Sep 8'), 'Friday, Sep 11');
$('printBtn').click();
const sub = $('sheet').querySelector('.sub').textContent;
check('header sub joins the basics', sub === '4th grade · Room 7 · Cedar Elementary · Friday, Sep 11');

// --- emergency box
setField(byPlaceholder('Fire: out our door'), 'Fire: right, then the big oak.');
$('printBtn').click();
const em = $('sheet').querySelector('.em');
check('emergency box renders once filled', !!em && em.textContent.includes('In an emergency') && em.textContent.includes('big oak'));
check('emergency box sits before the day plan', $('sheet').innerHTML.indexOf('In an emergency') < $('sheet').innerHTML.indexOf('volcano'));

// --- XSS inertness
setField(byPlaceholder('Ava and Marcus'), '<img src=x onerror="window.__pwned=1">');
$('printBtn').click();
await sleep(20);
check('hostile text stays inert', !window.__pwned && !$('sheet').querySelector('img'));
check('hostile text shown as text', $('sheet').textContent.includes('<img'));

// --- share link round trip
const enc = (obj) => {
  const json = JSON.stringify(obj);
  return Buffer.from(unescape(encodeURIComponent(json)), 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const good = decodeSheet('#' + enc({ v: 1, d: { teacher: 'Mr. Ito', plan: 'Quiet reading' } }));
check('share link decodes', good && good.teacher === 'Mr. Ito' && good.plan === 'Quiet reading');
check('garbage hash rejected', decodeSheet('#not-base64!!!') === null);
check('wrong version rejected', decodeSheet('#' + enc({ v: 9, d: { teacher: 'x' } })) === null);
const stripped = decodeSheet('#' + enc({ v: 1, d: { teacher: 'ok', evil: 'nope' } }));
check('unknown keys stripped', stripped && stripped.teacher === 'ok' && !('evil' in stripped));
const capped = decodeSheet('#' + enc({ v: 1, d: { plan: 'y'.repeat(9000) } }));
check('decoded fields capped', capped && capped.plan.length === 4000);

// --- QR size guard (folder is now way past QR capacity)
setField(byPlaceholder('8:00 First bell'), 'z'.repeat(3000));
$('qrBtn').click();
check('oversize folder steers QR to Copy link', $('toast').textContent.includes('Copy link'));

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
