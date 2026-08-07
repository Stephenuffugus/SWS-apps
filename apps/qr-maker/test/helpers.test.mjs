// Run: node test/helpers.test.mjs (qrcode-generator via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildPayload, escapeWifi, qrToSvg } from '../helpers.js';

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

console.log(`\n${passed} qr helper test groups passed${process.exitCode ? ' (with failures)' : ''}`);
