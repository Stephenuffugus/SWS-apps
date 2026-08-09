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

// --- a11y contract on static chrome
check('QR dialog has an accessible name', $('qrDlg').getAttribute('aria-labelledby') === 'qrTitle' && !!$('qrTitle'));
check('QR canvas has a text alternative', $('qrCanvas').getAttribute('role') === 'img' && !!$('qrCanvas').getAttribute('aria-label'));

// --- guards before any content (toast text lands async so repeats re-announce)
$('shareBtn').click();
await sleep(30);
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
await sleep(120);
check('print invoked', window.__printed === true);
check('header carries the teacher name', $('sheet').querySelector('h1').textContent.includes('Ms. Vega'));
check('plan text on the folder', $('sheet').textContent.includes('volcano video'));
check('empty blocks omitted', !$('sheet').textContent.includes('Tech'));
check('no emergency box before it is filled', !$('sheet').querySelector('.alert'));
check('leave-me-a-note box always prints', $('sheet').textContent.includes('Leave me a note'));

// --- header composition
setField(byPlaceholder('3rd grade'), '4th grade');
setField(byPlaceholder('12'), '7');
setField(byPlaceholder('Maple Elementary'), 'Cedar Elementary');
setField(byPlaceholder('Tuesday, Sep 8'), 'Friday, Sep 11');
$('printBtn').click();
await sleep(120);
const sub = $('sheet').querySelector('.sub').textContent;
check('header sub joins the basics', sub === '4th grade · Room 7 · Cedar Elementary · Friday, Sep 11');

// --- emergency box
setField(byPlaceholder('Fire: out our door'), 'Fire: right, then the big oak.');
$('printBtn').click();
await sleep(120);
const em = $('sheet').querySelector('.alert');
check('emergency box renders once filled', !!em && em.textContent.includes('In an emergency') && em.textContent.includes('big oak'));
check('emergency box sits before the day plan', $('sheet').innerHTML.indexOf('In an emergency') < $('sheet').innerHTML.indexOf('volcano'));

// --- XSS inertness
setField(byPlaceholder('Ava and Marcus'), '<img src=x onerror="window.__pwned=1">');
$('printBtn').click();
await sleep(120);
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

// --- QR size guard (folder is now way past scannable QR size)
setField(byPlaceholder('8:00 First bell'), 'z'.repeat(3000));
$('qrBtn').click();
await sleep(120);
check('oversize folder steers QR to Copy link', $('toast').textContent.includes('Copy link'));

// --- the cap writes back to the control, so screen and disk agree
const needs = byPlaceholder('Jordan sits up front');
setField(needs, 'q'.repeat(5000));
check('cap writes the truncation back to the field', needs.value.length === 4000);
check('cap keeps screen and storage in step', JSON.parse(window.localStorage.getItem('subplans')).needs.length === needs.value.length);
check('a counter appears near the cap', ($('f-needs-c') || {}).textContent.includes('4,000'));

// --- fields carry ids, so anchors and describedby become possible
check('controls have ids keyed off the schema', inputs().every((i) => /^f-[a-z]+$/.test(i.id)));

// --- every schema section is a real, named region
const secs = [...$('form').querySelectorAll('section.fsec')];
check('each schema section is a labelled region', secs.length === SCHEMA.sections.length
  && secs.every((s) => !!doc.getElementById(s.getAttribute('aria-labelledby'))));
check('Today view hides the sections it is not about', secs.filter((s) => s.hasAttribute('data-today')).length === 2);

// --- the page-1 block and the running header
setField(byPlaceholder('MapleGuest'), 'WiFi: CedarGuest / cedar2024!');
$('printBtn').click();
await sleep(120);
const first = $('sheet').querySelector('.first');
check('first-ten-minutes block prints', !!first && first.textContent.includes('Room'));
check('passwords render monospaced', !!$('sheet').querySelector('.first .mono'));
check('a running header exists for page 2 onward', !!$('sheet').querySelector('table.pw > thead .run'));
check('feedback page has checkboxes, not just a rectangle', $('sheet').querySelectorAll('.noteback .ticks li').length >= 6);

// --- the emergency box no longer borrows the base .em utility
check('printed alert box is not the shared .em utility', !$('sheet').querySelector('#sheet .em') && !!$('sheet').querySelector('.alert svg'));

// --- compressed share links round-trip and are still allowlisted
const { decodeAny, encodeSheet } = app;
check('a compressed hash is refused by the sync decoder', decodeSheet('#z.abc') === null);
if (typeof CompressionStream === 'function') {
  const json = JSON.stringify({ v: 1, d: { teacher: 'Mr. Ito', health: 'nut allergy', evil: 'nope' } });
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(json)); w.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
  const packed = 'z.' + Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const back = await decodeAny(packed);
  check('compressed link round-trips', back && back.teacher === 'Mr. Ito' && back.health === 'nut allergy');
  check('compressed link is still allowlisted', back && !('evil' in back));
  check('compressed link is shorter than the plain one', packed.length < encodeSheet().length);
} else {
  console.log('  skip: CompressionStream unavailable in this runtime');
}

console.log(failures ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
process.exit(failures);
