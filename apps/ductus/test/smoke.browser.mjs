/* DUCTUS in a real browser through the studio's static server: three doodles drawn with a real pointer, the alphabet
   forged (37 generated glyphs, ink on the canvas), a note written and rendered, the font exported as TrueType bytes,
   today's Decipher puzzle opened with 26 picker keys, Scribe shown, the studio foot and build tag, no horizontal
   overflow, the worker registered, and zero page errors. Chrome comes from the fleet's puppeteer (the studio harness
   wants playwright's own browser, which this box does not have); the server is the harness's.
   node apps/ductus/test/smoke.browser.mjs            shots (never opened here) go to $SHOTS or /tmp/ductus-shots */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { serveApps } from '../../../design/harness.mjs';
const require = createRequire('/workspaces/lucid-winds/package.json');
let puppeteer; try { puppeteer = require('/workspaces/sws-tools/node_modules/puppeteer'); } catch (e) { puppeteer = require('puppeteer'); }
const OUT = process.env.SHOTS || '/tmp/ductus-shots'; mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const site = await serveApps();
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage(); const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url().slice(0, 120)));
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(site.url('ductus'), { waitUntil: 'load', timeout: 30000 });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await sleep(300);
const ink = (sel) => page.evaluate((sel) => { const c = document.querySelector(sel); if (!c) return -1; const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 300) n++; return n; }, sel);
ok((await page.evaluate(() => document.querySelectorAll('nav.tabs button').length)) === 4, 'four tabs: Forge, Alphabet, Write, Play');
ok((await page.evaluate(() => window.DUCTUS_STATE().tab)) === 'forge', 'a fresh visit opens on Forge');
/* draw: a hooked stem, a C arc, a zigzag with a dot, with the mouse (a pointer, as a finger is) */
const boxes = await page.$$('.boxes .box canvas');
ok(boxes.length === 3, 'three drawing boxes');
async function draw(el, pts) { const b = await el.boundingBox(); const P = pts.map(([x, y]) => [b.x + b.width * x, b.y + b.height * y]); await page.mouse.move(P[0][0], P[0][1]); await page.mouse.down(); for (const [x, y] of P.slice(1)) { await page.mouse.move(x, y, { steps: 4 }); } await page.mouse.up(); await sleep(60); }
await draw(boxes[0], [[0.5, 0.1], [0.5, 0.5], [0.52, 0.8], [0.65, 0.9]]);
await draw(boxes[1], [[0.75, 0.15], [0.45, 0.2], [0.25, 0.5], [0.45, 0.8], [0.75, 0.85]]);
await draw(boxes[2], [[0.2, 0.15], [0.8, 0.4], [0.2, 0.65], [0.8, 0.9]]); await draw(boxes[2], [[0.5, 0.06], [0.51, 0.07]]);
const doodles = await page.evaluate(() => window.DUCTUS_STATE().doodles.map((d) => d.length));
ok(doodles[0] === 1 && doodles[1] === 1 && doodles[2] === 2, 'the strokes landed: ' + JSON.stringify(doodles));
await page.click('#forgeBtn'); await sleep(900);
const forged = await page.evaluate(() => { const s = window.DUCTUS_STATE(); return { tab: s.tab, name: s.script && s.script.name, n: s.script ? Object.keys(s.script.glyphs).length : 0, traits: s.script && s.script.traits }; });
ok(forged.tab === 'alpha' && forged.n >= 43, `forged "${forged.name}" with ${forged.n} glyphs and landed on Alphabet (${(forged.traits || []).join(', ')})`);
ok((await ink('#alphaCanvas')) > 400, 'the alphabet grid has ink');
await page.screenshot({ path: OUT + '/alphabet.png' });
const font = await page.evaluate(() => { const s = window.DUCTUS_STATE(); const b = window.Ductus.buildFont(s.script, { age: s.style.age, slant: s.style.slant, pen: { type: s.style.pen, weight: s.style.weight } }, s.script.name); return { len: b.length, magic: b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0 }; });
ok(font.len > 15000 && font.magic, 'the font export is a TrueType file (' + font.len + ' bytes)');
await page.click('nav.tabs button[data-tab="write"]'); await sleep(200);
await page.type('#text', 'MEET AT NOON'); await sleep(400);
ok((await ink('#noteCanvas')) > 150, 'a typed note renders in the hand');
await page.screenshot({ path: OUT + '/write.png' });
await page.click('nav.tabs button[data-tab="play"]'); await sleep(200);
await page.click('#todayBtn'); await sleep(700);
const board = await page.evaluate(() => ({ board: document.getElementById('board').style.display !== 'none', keys: document.querySelectorAll('#picker button').length, hand: document.getElementById('pHand').textContent }));
ok(board.board && board.keys >= 26, `today's Decipher puzzle is up in the ${board.hand} with ${board.keys} picker keys`);
ok((await ink('#puzzleCanvas')) > 200, 'the puzzle board has ink');
await page.screenshot({ path: OUT + '/decipher.png' });
await page.click('#quitBtn'); await sleep(200);
await page.click('#playMode button[data-m="scribe"]'); await sleep(300);
ok((await page.evaluate(() => document.getElementById('scribeView').style.display !== 'none' && document.getElementById('targetLetter').textContent.length === 1)), 'Scribe shows a target letter to copy');
const chrome = await page.evaluate(() => ({ foot: document.querySelector('.foot') && document.querySelector('.foot').textContent, tag: document.querySelector('.buildtag') && document.querySelector('.buildtag').textContent, studio: document.getElementById('studioLink') && document.getElementById('studioLink').getAttribute('href'), privacy: !!document.querySelector('.foot a[href="privacy.html"]') }));
ok(/Sky Wolf Studio/.test(chrome.foot || '') && chrome.studio === '../' && chrome.privacy && /^ductus-v\d+$/.test(chrome.tag || ''), 'the studio foot (hub link, Privacy, Feedback) and the build tag ' + chrome.tag);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 2, 'no horizontal overflow on a 412 px phone (' + overflow + ' px)');
const small = await page.evaluate(() => { let n = 0; document.querySelectorAll('button').forEach((b) => { const r = b.getBoundingClientRect(); if (r.width && r.height && r.height < 36) n++; }); return n; });
ok(small === 0, 'no visible button shorter than 36 px (' + small + ')');
await sleep(800);
const sw = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r).catch(() => false));
ok(sw, 'the service worker registered');
const tiny = await page.evaluate(() => { let n = 0; document.querySelectorAll('p, button, textarea, label, span.v').forEach((el) => { const s = getComputedStyle(el); if (el.offsetParent !== null && parseFloat(s.fontSize) < 12) n++; }); return n; });
ok(tiny === 0, 'no visible copy under 12 px (' + tiny + ')');
ok(errors.length === 0, 'zero page errors' + (errors.length ? ': ' + errors.join(' ; ') : ''));
await browser.close(); site.close();
console.log(fails ? `\nDUCTUS SMOKE: ${fails} FAILED` : '\nDUCTUS SMOKE OK');
process.exit(fails ? 1 : 0);
