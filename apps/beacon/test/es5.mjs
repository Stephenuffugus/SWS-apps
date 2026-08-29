/* ═══════════════════════════════════════════════════════════════════════════
   Beacon must parse as ES5, and this is the test that keeps it that way.

   The whole premise of this app is the tablet nobody else will serve: an
   iPad 2 stuck on iOS 9.3.5, whose Safari stopped updating in 2016. One arrow
   function anywhere in the file is not a lint warning there, it is a syntax
   error that stops the entire script, and the page a child taps for help
   renders as a dead sheet of text.

   That failure is invisible on every machine anyone would develop on, which
   is exactly why it is pinned here rather than trusted to discipline. This
   uses a real parser at ecmaVersion 5 rather than a regex sweep, because a
   sweep can only find the constructs somebody remembered to look for.

     node apps/beacon/test/es5.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as acorn from 'acorn';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'index.html');
const html = readFileSync(FILE, 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  ok    ${name}`);
};

console.log('Beacon, the old-hardware contract\n');

/* ── the script ─────────────────────────────────────────────────────────── */
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).filter((s) => s.trim().length);
check('there is exactly one inline script', scripts.length === 1, `found ${scripts.length}`);

let parsed = null;
const comments = [];
try {
  parsed = acorn.parse(scripts[0], { ecmaVersion: 5, sourceType: 'script', onComment: comments });
} catch (e) {
  parsed = null;
  check('the script parses as ES5', false, e.message);
}
if (parsed) check('the script parses as ES5', true);

/* The API sweep below runs on CODE ONLY. The header comment in this app names
   the very things it forbids ("no Promise", "no Object.assign"), so scanning
   raw text reports the prose that documents the rule as a breach of it. Acorn
   already knows where every comment is, so blank them rather than soften the
   check into something that would miss a real call. */
let code = scripts[0] || '';
for (const c of comments) {
  code = code.slice(0, c.start) + ' '.repeat(c.end - c.start) + code.slice(c.end);
}

/* Parsing is necessary and not sufficient: these are ES5 *syntax* but they are
   runtime APIs that do not exist on iOS 9, so the parser waves them through
   and the tablet throws at the first call. */
const BANNED_API = [
  ['fetch(', 'fetch is iOS 10.3+'],
  ['Promise', 'no Promise on iOS 9'],
  ['Object.assign', 'ES6 runtime'],
  ['Array.from', 'ES6 runtime'],
  ['.includes(', 'String/Array.includes is ES6'],
  ['.startsWith(', 'ES6'],
  ['.endsWith(', 'ES6'],
  ['.find(', 'Array.find is ES6'],
  ['.findIndex(', 'ES6'],
  ['Object.entries', 'ES2017'],
  ['Object.values', 'ES2017'],
  ['new Map', 'ES6'],
  ['new Set', 'ES6'],
  ['Symbol', 'ES6'],
  ['requestIdleCallback', 'not on iOS 9'],
  ['IntersectionObserver', 'not on iOS 9'],
  ['navigator.sendBeacon', 'not on iOS 9'],
];
const hitApi = BANNED_API.filter(([needle]) => code.includes(needle));
check('no runtime API that iOS 9 does not have',
  hitApi.length === 0, hitApi.map(([n, w]) => `${n} (${w})`).join(', '));

/* ── the stylesheet ─────────────────────────────────────────────────────── */
const css = (html.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || '';
const BANNED_CSS = [
  [/var\(--/, 'CSS custom properties are not in iOS 9'],
  [/display\s*:\s*grid/, 'grid is not in iOS 9'],
  [/(^|[;{\s])gap\s*:/, 'flex/grid gap is far newer than iOS 9'],
  [/display\s*:\s*flex/, 'flex on iOS 9 needs prefixes and is avoided entirely here'],
  [/:\s*calc\([^)]*calc\(/, 'nested calc'],
  [/@supports/, '@supports is not in iOS 9'],
];
const hitCss = BANNED_CSS.filter(([re]) => re.test(css));
check('the stylesheet avoids everything iOS 9 cannot draw',
  hitCss.length === 0, hitCss.map(([, w]) => w).join(', '));

/* ── the promises this app makes about where messages go ────────────────── */
check('the only hosts it will talk to are Discord webhooks',
  /HOSTS\s*=\s*\[/.test(code) && /discord\.com\/api\/webhooks\//.test(code));
check('a message can never mention anyone but the configured grown-up',
  /allowed_mentions/.test(code) && /parse:\s*\[\]/.test(code),
  'without allowed_mentions a child typing @everyone would ping a whole server');
check('control characters are stripped with explicit escapes',
  /\\x00-\\x1F/.test(code),
  'a literal control character in source is invisible in every diff that will ever review it');
check('the outbox separates retryable failures from permanent ones',
  /'retry'/.test(code) && /'stop'/.test(code),
  'this is the bug that queued a mistyped webhook forever while reassuring a child');
check('a queued message cannot be retried forever',
  /n\s*>=\s*15/.test(code), 'no attempt ceiling, so one bad item blocks every later one');

/* ── the optional relay, and the line it must never cross ────────────────── */
check('a relay address is only ever accepted over https',
  /httpsOnly/.test(code) && /'https:\/\/'/.test(code),
  'plain http would put the device token on the wire from somebody else\'s wifi');
check('the relay token travels in the body, never the query string',
  !/\/inbox\?/.test(code) && !/token=' *\+/.test(code),
  'a token in a URL lands in the relay host\'s request logs forever');
/* Scoped to the send path. The first version of this compared the position of
   the DEFINITION of mirrorToRelay against the first setStatus, which is
   function-declaration order and says nothing about when it is called. */
const sendFn = (code.match(/function send\(msg\)[\s\S]*?\n  \}/) || [''])[0];
check('the send path mirrors to the relay only after the chat has taken it',
  sendFn.indexOf('mirrorToRelay') > sendFn.indexOf("setStatus('ok'")
    && sendFn.indexOf("setStatus('ok'") !== -1,
  'the ping is the product; the thread is a nicety and must not gate it');
check('and a relay is never contacted on a failed send',
  sendFn.split('mirrorToRelay').length === 2,
  'mirrorToRelay appears more than once in send(), so a failure path may hit it');
check('a relay failure cannot reach the child',
  /function mirrorToRelay[\s\S]{0,400}?relayPost\('\/send'[^;]*function \(\) \{ pollInbox\(\); \}/.test(code),
  'mirrorToRelay must ignore its own error, or a broken relay starts lying to her');

console.log(failures ? `\n${failures} check(s) failed` : '\nBEACON ES5 CONTRACT HELD');
process.exit(failures ? 1 : 0);
