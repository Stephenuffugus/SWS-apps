// Run: node test/core.test.mjs (pdf-lib via node_modules)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildOutput, buildSplit, planOutput, splitGroups, splitNames, parseRanges,
  loadPdf, sourceAngles, finalAngle, formatBytes, zipStore, crc32, isHuman,
} from '../core.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

async function makeSample(pages, label, rotate) {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(label + ' page ' + (i + 1), { x: 50, y: 700, size: 24, font });
    if (rotate) p.setRotation(PDFLib.degrees(rotate));
  }
  return PDFLib.PDFDocument.load(await doc.save());
}

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 400)); }
}

const docA = await makeSample(3, 'A');
const docB = await makeSample(2, 'B');

await t('merge interleaves pages in the requested order', async () => {
  const bytes = await buildOutput(PDFLib, [docA, docB], [
    { doc: 0, page: 0, rotate: 0 },
    { doc: 1, page: 1, rotate: 0 },
    { doc: 0, page: 2, rotate: 0 },
  ]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPageCount(), 3);
});
await t('rotation is applied on top of existing rotation', async () => {
  const bytes = await buildOutput(PDFLib, [docA], [{ doc: 0, page: 0, rotate: 90 }]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPage(0).getRotation().angle, 90);
  const bytes2 = await buildOutput(PDFLib, [await PDFLib.PDFDocument.load(bytes)],
    [{ doc: 0, page: 0, rotate: 270 }]);
  const again = await PDFLib.PDFDocument.load(bytes2);
  assert.equal(again.getPage(0).getRotation().angle, 0, '90 + 270 wraps to 0');
});
await t('out-of-range pages are skipped; empty selection throws', async () => {
  const bytes = await buildOutput(PDFLib, [docA], [
    { doc: 0, page: 99, rotate: 0 }, { doc: 0, page: 1, rotate: 0 },
  ]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPageCount(), 1);
  await assert.rejects(() => buildOutput(PDFLib, [docA], []), /no pages/);
});
await t('planOutput reports the pages buildOutput would silently drop', () => {
  const { keep, dropped } = planOutput([docA], [
    { doc: 0, page: 99, rotate: 0 }, { doc: 0, page: 1, rotate: 0 }, { doc: 7, page: 0, rotate: 0 },
  ]);
  assert.deepEqual(keep, [1]);
  assert.deepEqual(dropped, [0, 2], 'the caller can now name what went missing');
});
await t('duplicating the same page in the order works', async () => {
  const bytes = await buildOutput(PDFLib, [docA], [
    { doc: 0, page: 0, rotate: 0 }, { doc: 0, page: 0, rotate: 0 },
  ]);
  const merged = await PDFLib.PDFDocument.load(bytes);
  assert.equal(merged.getPageCount(), 2);
});
await t('shared resources are not re-embedded per page (size stays sane)', async () => {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.TimesRoman);
  const filler = 'lorem '.repeat(200);
  for (let i = 0; i < 10; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(filler + i, { x: 20, y: 700, size: 8, font, maxWidth: 570, lineHeight: 10 });
  }
  const src = await PDFLib.PDFDocument.load(await doc.save());
  const mergedBytes = await buildOutput(PDFLib, [src],
    Array.from({ length: 10 }, (_, page) => ({ doc: 0, page, rotate: 0 })));
  const singles = [];
  for (let page = 0; page < 10; page++)
    singles.push(await buildOutput(PDFLib, [src], [{ doc: 0, page, rotate: 0 }]));
  const singlesTotal = singles.reduce((a, b) => a + b.length, 0);
  assert.ok(mergedBytes.length < singlesTotal * 0.6,
    `merged ${mergedBytes.length} vs naive ${singlesTotal}`);
});

/* ── Split: the blocker. It used to walk the SOURCE document. ───────────── */

await t('split works on the assembled order, not the source document', async () => {
  // page 2 of a 3-page file deleted, page 1 rotated. The old splitAll()
  // re-emitted the deleted page and came back at 0 degrees.
  const order = [
    { doc: 0, page: 0, rotate: 90 },
    { doc: 0, page: 2, rotate: 0 },
  ];
  const groups = splitGroups(order.length, 'each');
  assert.equal(groups.length, 2, 'two rows on screen means two files, not three');
  const outs = await buildSplit(PDFLib, [docA], order, groups);
  assert.equal(outs.length, 2);
  const first = await PDFLib.PDFDocument.load(outs[0]);
  assert.equal(first.getPageCount(), 1);
  assert.equal(first.getPage(0).getRotation().angle, 90, 'rotation shown on screen is carried');
});
await t('split carries pages from several source documents', async () => {
  const order = [
    { doc: 1, page: 0, rotate: 0 },
    { doc: 0, page: 1, rotate: 180 },
    { doc: 1, page: 1, rotate: 0 },
  ];
  const groups = splitGroups(order.length, 'ranges', '1-2, 3');
  assert.deepEqual(groups, [[0, 1], [2]]);
  const outs = await buildSplit(PDFLib, [docA, docB], order, groups);
  const a = await PDFLib.PDFDocument.load(outs[0]);
  const b = await PDFLib.PDFDocument.load(outs[1]);
  assert.equal(a.getPageCount(), 2);
  assert.equal(b.getPageCount(), 1);
  assert.equal(a.getPage(1).getRotation().angle, 180);
});
await t('split modes group the way their labels promise', () => {
  assert.deepEqual(splitGroups(5, 'each'), [[0], [1], [2], [3], [4]]);
  assert.deepEqual(splitGroups(5, 'every', '2'), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(splitGroups(5, 'at', '3'), [[0, 1], [2, 3, 4]]);
  assert.deepEqual(splitGroups(5, 'at', '2, 4'), [[0], [1, 2], [3, 4]]);
  assert.deepEqual(splitGroups(5, 'ranges', '1-2,4'), [[0, 1], [3]]);
  assert.deepEqual(splitGroups(5, 'extract', '2-4'), [[1, 2, 3]]);
});
await t('a cap or a bad range says its own name, with the real numbers', () => {
  for (const [mode, spec, re] of [
    ['ranges', '1-9', /9 does not exist.*5 pages long.*highest you can ask for is 5/s],
    ['ranges', '0-2', /no page 0.*numbered 1 to 5/s],
    ['every', '9', /only 5 pages long.*below 5/s],
    ['every', 'x', /whole number/],
    ['ranges', 'abc', /not a page or a range/],
  ]) {
    let msg = null;
    try { splitGroups(5, mode, spec); } catch (e) { msg = e; }
    assert.ok(msg && isHuman(msg), mode + '/' + spec + ' should throw a human error');
    assert.match(msg.message, re, mode + '/' + spec);
  }
  assert.deepEqual(parseRanges('3', 5), [[2, 2]]);
});
await t('split filenames are previewable, unique and readable', () => {
  assert.deepEqual(splitNames('contract.pdf', [[0], [1, 2], [4]]),
    ['contract-p1.pdf', 'contract-p2-3.pdf', 'contract-p5.pdf']);
  // a path separator in a source name must not become a path
  assert.deepEqual(splitNames('a/b:c', [[0]]), ['a_b_c-p1.pdf']);
});
await t('buildSplit reports progress and honours cancel', async () => {
  const order = [0, 1, 2].map(page => ({ doc: 0, page, rotate: 0 }));
  const seen = [];
  await buildSplit(PDFLib, [docA], order, splitGroups(3, 'each'),
    (done, total) => { seen.push(done + '/' + total); });
  assert.deepEqual(seen, ['1/3', '2/3', '3/3']);

  let stop = false;
  await assert.rejects(
    () => buildSplit(PDFLib, [docA], order, splitGroups(3, 'each'),
      () => { stop = true; }, () => stop),
    (e) => e.cancelled === true);
});

/* ── Rotation display ──────────────────────────────────────────────────── */

await t('the angle shown is the angle the page comes out at', async () => {
  const preRotated = await makeSample(1, 'R', 90);
  assert.deepEqual(sourceAngles(preRotated), [90]);
  // one tap on a page already at 90 must read 180, not 90.
  assert.equal(finalAngle(90, 90), 180);
  assert.equal(finalAngle(270, 180), 90);
  assert.equal(finalAngle(0, 0), 0);
  const bytes = await buildOutput(PDFLib, [preRotated], [{ doc: 0, page: 0, rotate: 90 }]);
  const out = await PDFLib.PDFDocument.load(bytes);
  assert.equal(out.getPage(0).getRotation().angle, finalAngle(90, 90),
    'the badge and the written file agree');
});

/* ── Loading ───────────────────────────────────────────────────────────── */

await t('loadPdf gives a human message for junk bytes', async () => {
  await assert.rejects(() => loadPdf(PDFLib, new Uint8Array([1, 2, 3, 4])),
    (e) => isHuman(e) && /readable PDF/.test(e.message));
});
await t('a truncated PDF fails inside the guard, not as a raw exception', async () => {
  const whole = await (await makeSample(2, 'T')).save();
  const cut = whole.slice(0, Math.floor(whole.length * 0.55));
  await assert.rejects(() => loadPdf(PDFLib, cut), (e) => {
    assert.ok(isHuman(e), 'must be tagged human, got: ' + e.message);
    assert.doesNotMatch(e.message, /undefined|Cannot read|\[object/,
      'must never surface a raw exception string');
    return true;
  });
});

/* ── ZIP ───────────────────────────────────────────────────────────────── */

await t('formatBytes reads like a size', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(999), '999 B');
  assert.equal(formatBytes(1500), '1.5 kB');
  assert.equal(formatBytes(197800000), '198 MB');
});
await t('crc32 matches the known PKZIP check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});
await t('zipStore produces an archive the system unzip agrees with', async () => {
  const outs = await buildSplit(PDFLib, [docA],
    [0, 1, 2].map(page => ({ doc: 0, page, rotate: 0 })), splitGroups(3, 'each'));
  const names = splitNames('contract', splitGroups(3, 'each'));
  const zip = zipStore(outs.map((b, i) => ({ name: names[i], bytes: b })));
  const dir = mkdtempSync(join(tmpdir(), 'sws-zip-'));
  writeFileSync(join(dir, 'out.zip'), zip);
  execFileSync('unzip', ['-qq', '-o', 'out.zip', '-d', 'x'], { cwd: dir });
  const got = readdirSync(join(dir, 'x')).sort();
  assert.deepEqual(got, names.slice().sort());
  for (let i = 0; i < names.length; i++) {
    const round = readFileSync(join(dir, 'x', names[i]));
    assert.equal(round.length, outs[i].length, names[i] + ' survives the round trip');
    const d = await PDFLib.PDFDocument.load(round);
    assert.equal(d.getPageCount(), 1);
  }
});
await t('zipStore handles a non-ASCII filename', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.4 not really');
  const zip = zipStore([{ name: '確定申告書-p1.pdf', bytes }]);
  const dir = mkdtempSync(join(tmpdir(), 'sws-zip-u-'));
  writeFileSync(join(dir, 'u.zip'), zip);
  execFileSync('unzip', ['-qq', '-o', 'u.zip', '-d', 'x'], { cwd: dir });
  assert.deepEqual(readdirSync(join(dir, 'x')), ['確定申告書-p1.pdf']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
