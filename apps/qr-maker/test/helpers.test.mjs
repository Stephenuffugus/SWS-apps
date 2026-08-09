// Run: node test/helpers.test.mjs (qrcode-generator via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  buildPayload, buildPayloadInfo, escapeWifi, qrToSvg, parseTel, installUtf8,
  utf8Bytes, byteLen, CAPACITY, qrPixelSize, sizePlan, sizeById, slugFor,
} from '../helpers.js';
import { decodeQr } from './qrdecode.mjs';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('url payload adds https:// unless a known link scheme is present', () => {
  assert.equal(buildPayload('url', { url: 'skywolf.example' }), 'https://skywolf.example');
  assert.equal(buildPayload('url', { url: 'https://a.b/c?d=e' }), 'https://a.b/c?d=e');
  assert.equal(buildPayload('url', { url: 'mailto:x@y.z' }), 'mailto:x@y.z');
  assert.equal(buildPayload('url', { url: '  ' }), '');
  // a host:port is NOT a scheme — this used to produce a broken QR
  assert.equal(buildPayload('url', { url: 'example.com:8080/menu' }), 'https://example.com:8080/menu');
  assert.equal(buildPayload('url', { url: 'localhost:3000' }), 'https://localhost:3000');
  // hostile schemes are neutralized rather than encoded verbatim
  assert.equal(buildPayload('url', { url: 'javascript:alert(1)' }), 'https://javascript:alert(1)');
});
ok('wifi payload escapes special chars', () => {
  assert.equal(escapeWifi('my;net:wo,rk"\\'), 'my\\;net\\:wo\\,rk\\"\\\\');
  assert.equal(
    buildPayload('wifi', { ssid: 'Cafe;Net', pass: 'p:a,ss', auth: 'WPA' }),
    'WIFI:T:WPA;S:Cafe\\;Net;P:p\\:a\\,ss;;');
  assert.equal(buildPayload('wifi', { ssid: 'Open Net', auth: 'nopass' }), 'WIFI:T:nopass;S:Open Net;;');
  assert.equal(buildPayload('wifi', { ssid: '' }), '');
});
ok('tel strips formatting, keeps +', () => {
  assert.equal(buildPayload('tel', { tel: '+1 (555) 010-1234' }), 'tel:+15550101234');
  assert.equal(buildPayload('tel', { tel: '' }), '');
});
ok('email + text payloads', () => {
  assert.equal(buildPayload('email', { email: 'a@b.c' }), 'mailto:a@b.c');
  assert.equal(buildPayload('text', { text: 'hello world' }), 'hello world');
});
ok('svg output is well-formed and non-trivial', () => {
  const qr = qrcode(0, 'M');
  qr.addData('https://example.com');
  qr.make();
  const svg = qrToSvg(qr);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('crispEdges'));
  assert.ok(svg.length > 500, 'has real path data');
  const n = qr.getModuleCount();
  assert.ok(svg.includes('viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '"'), 'quiet zone included');
});

/* ── The one the old suite could not see ─────────────────────────────────
   Everything above asserts on strings the app produced. None of it can tell
   a code that says 'Café' from a code that says two bytes of garbage, which
   is why the UTF-8 defect shipped. These decode the modules back out. */

ok('the default vendor encoder really is broken (the bug this proves fixed)', () => {
  const fresh = require('qrcode-generator');
  // Re-establish the shipped default before asserting on it.
  fresh.stringToBytes = fresh.stringToBytesFuncs['default'];
  const qr = fresh(0, 'L');
  qr.addData('Café');
  qr.make();
  assert.throws(() => decodeQr(qr), /not valid for encoding utf-8/i,
    'charCodeAt & 0xff should emit an illegal lone 0xE9');
  installUtf8(fresh);
});

installUtf8(qrcode);

ok('round-trips every alphabet through a real decode of the modules', () => {
  const cases = [
    'HELLO',
    'Café',
    '日本語のメニュー',
    'Привет',
    'مطاعم القرية',
    '🍕',
    'Nadia Ünlü — Straße 7',
    'WIFI:T:WPA;S:Café Nest;P:naïve;;',
    'tel:+15550101234;ext=22',
    'https://café.example/menü',
  ];
  for (const s of cases) {
    const qr = qrcode(0, 'L');
    qr.addData(s);
    qr.make();
    const d = decodeQr(qr);
    assert.equal(d.text, s, 'decoded ' + JSON.stringify(d.text) + ' from ' + JSON.stringify(s));
    assert.deepEqual(d.bytes, utf8Bytes(s), 'byte stream is UTF-8 for ' + JSON.stringify(s));
  }
});

ok('round-trips at the app default error-correction level too', () => {
  for (const s of ['Café', 'Привет', '🍕']) {
    const qr = qrcode(0, 'M');
    qr.addData(s);
    qr.make();
    assert.equal(decodeQr(qr).text, s);
  }
});

ok('byteLen matches the bytes the encoder actually writes', () => {
  for (const s of ['abc', 'Café', '日本語', '🍕']) {
    assert.equal(byteLen(s), utf8Bytes(s).length);
    const qr = qrcode(0, 'L');
    qr.addData(s);
    qr.make();
    assert.equal(decodeQr(qr).bytes.length, byteLen(s));
  }
});

ok('the stated capacity is the real capacity, to the byte', () => {
  for (const level of ['M', 'Q', 'H']) {
    const cap = CAPACITY[level];
    const atCap = qrcode(0, level);
    atCap.addData('x'.repeat(cap));
    atCap.make();
    assert.equal(atCap.getModuleCount(), 177, level + ' at capacity should be version 40');
    assert.throws(() => {
      const over = qrcode(0, level);
      over.addData('x'.repeat(cap + 1));
      over.make();
    }, undefined, level + ' should refuse one byte past ' + cap);
  }
});

/* ── Phone numbers: every measured mangling ─────────────────────────────── */

ok('vanity numbers become dialable digits instead of tel:1800', () => {
  const r = parseTel('1-800-FLOWERS');
  assert.equal(r.number, '18003569377');
  assert.equal(buildPayload('tel', { tel: '1-800-FLOWERS' }), 'tel:18003569377');
  assert.ok(r.notes.some((n) => /keypad digits/.test(n.text)), 'says what it did');
});

ok('an extension is split out, not welded onto the number', () => {
  const r = parseTel('555.010.1234 x22');
  assert.equal(r.number, '5550101234');
  assert.equal(r.ext, '22');
  assert.equal(buildPayload('tel', { tel: '555.010.1234 x22' }), 'tel:5550101234;ext=22');
  assert.equal(buildPayload('tel', { tel: '+1 555 010 1234 ext. 907' }), 'tel:+15550101234;ext=907');
  assert.equal(buildPayload('tel', { tel: '+441632960123,45' }), 'tel:+441632960123;ext=45');
});

ok('prose is refused out loud rather than encoded as a phone number', () => {
  const info = buildPayloadInfo('tel', { tel: 'call me' });
  assert.equal(info.payload, '');
  assert.match(info.problem, /not a phone number/);
  const short = buildPayloadInfo('tel', { tel: '12' });
  assert.equal(short.payload, '');
  assert.match(short.problem, /at least 3 digits/);
});

ok('an unreachable international number is flagged', () => {
  const info = buildPayloadInfo('tel', { tel: '555 010 1234' });
  assert.equal(info.payload, 'tel:5550101234');
  assert.ok(info.notes.some((n) => n.level === 'warn' && /country code/.test(n.text)));
});

/* ── Every other silent rewrite the readout has to surface ──────────────── */

ok('reports the rewrites it makes instead of making them quietly', () => {
  assert.ok(buildPayloadInfo('url', { url: 'skywolf.example' }).notes.some((n) => /https:\/\/ added/.test(n.text)));
  assert.ok(buildPayloadInfo('url', { url: 'javascript:alert(1)' }).notes.some((n) => n.level === 'warn'));
  assert.ok(buildPayloadInfo('wifi', { ssid: ' Nest ', pass: 'x' }).notes.some((n) => /Spaces at the start or end/.test(n.text)));
  assert.ok(buildPayloadInfo('wifi', { ssid: 'Nest', pass: '' }).notes.some((n) => /No password typed/.test(n.text)));
  assert.equal(buildPayloadInfo('wifi', { ssid: 'Nest', pass: 'x', hidden: true }).payload,
    'WIFI:T:WPA;S:Nest;P:x;H:true;;');
});

ok('a non-address is refused rather than encoded as mailto:not an email', () => {
  const info = buildPayloadInfo('email', { email: 'not an email' });
  assert.equal(info.payload, '');
  assert.match(info.problem, /not an email address/);
  assert.equal(buildPayload('email', { email: 'hello@example.com' }), 'mailto:hello@example.com');
});

/* ── Sizing: the promise has to be kept ─────────────────────────────────── */

ok('the pixel count is never short of the size asked for', () => {
  for (let n = 21; n <= 177; n += 4) {
    for (const px of [472, 512, 945, 1024, 2048]) {
      const p = qrPixelSize(n, px, false);
      assert.ok(p.px >= px, n + ' modules at ' + px + 'px produced ' + p.px);
      assert.equal(p.px % (n + 8), 0, 'whole modules only');
      assert.ok(p.px - px < n + 8, 'never overshoots by more than one module row');
    }
  }
});

ok('the on-screen preview still fits its box', () => {
  const p = qrPixelSize(177, 300, true);
  assert.ok(p.px <= 300, 'preview must not overflow the well');
});

ok('every size preset states a DPI it actually reaches', () => {
  for (const id of ['card', 'tent', 'flyer', 'poster']) {
    const size = sizeById(id);
    for (const n of [21, 57, 133, 177]) {
      const p = sizePlan(size, n);
      assert.ok(p.dpi >= size.dpi, id + ' at ' + n + ' modules claimed ' + p.dpi + ' DPI, wanted ' + size.dpi);
      assert.ok(Math.abs(p.moduleMm * (n + 8) - size.mm) < 1e-9, 'module width and sheet width agree');
    }
  }
});

ok('the SVG carries a real physical size for the print shop', () => {
  const qr = qrcode(0, 'M');
  qr.addData('https://example.com');
  qr.make();
  assert.ok(qrToSvg(qr, { mm: 40 }).includes('width="40mm" height="40mm"'));
  assert.ok(!/<svg[^>]*mm"/.test(qrToSvg(qr)), 'plain call stays viewBox-only');
});

ok('filenames mean something', () => {
  assert.equal(slugFor('url', { url: 'https://skywolf.example/menu' }, 'https://skywolf.example/menu'), 'skywolf-example');
  assert.equal(slugFor('wifi', { ssid: 'Nest Guest' }, ''), 'wifi-nest-guest');
  assert.equal(slugFor('tel', {}, 'tel:+15550101234'), 'tel-15550101234');
  assert.equal(slugFor('text', { text: '' }, ''), 'qr-code');
  assert.ok(slugFor('text', { text: 'x'.repeat(200) }, '').length <= 48);
});

console.log(`\n${passed} qr helper test groups passed${process.exitCode ? ' (with failures)' : ''}`);
