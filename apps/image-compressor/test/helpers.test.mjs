// Run: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import {
  fmtBytes, scaleDims, fitBox, coverRect, savingsPct, sizeDelta, fmtGrowth,
  outName, dupeKey, preflight, decodeFailure, kbToBytes,
  readExifDate, buildExifApp1, insertApp1, uniqueNames,
} from '../helpers.js';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

ok('fmtBytes units', () => {
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(2048), '2.0 KB');
  assert.equal(fmtBytes(4_400_000), '4.2 MB');
  assert.equal(fmtBytes(-1), '—');
});
ok('scaleDims fits without upscaling', () => {
  assert.deepEqual(scaleDims(4000, 3000, 1920), { w: 1920, h: 1440 });
  assert.deepEqual(scaleDims(800, 600, 1920), { w: 800, h: 600 });
  assert.deepEqual(scaleDims(3000, 4000, 1000), { w: 750, h: 1000 });
  assert.deepEqual(scaleDims(100, 50, 0), { w: 100, h: 50 });
  assert.deepEqual(scaleDims(10000, 1, 100), { w: 100, h: 1 });
});
ok('savingsPct', () => {
  assert.equal(savingsPct(1000, 100), 90);
  assert.equal(savingsPct(1000, 1200), 0);
  assert.equal(savingsPct(0, 0), 0);
});
ok('outName swaps extension', () => {
  assert.equal(outName('IMG_2041.HEIC.jpeg', 'jpg'), 'IMG_2041.HEIC-small.jpg');
  assert.equal(outName('photo', 'webp'), 'photo-small.webp');
});

/* ── The never-worse promise ───────────────────────────────────────────── */
ok('sizeDelta can say bigger, which savingsPct never could', () => {
  assert.deepEqual(sizeDelta(1000, 100), { dir: 'smaller', pct: 90, times: 0.1 });
  assert.equal(sizeDelta(1000, 1000).dir, 'same');
  // the measured PNG case: 6.4 MB in, 21.5 MB out
  const grew = sizeDelta(6_400_000, 21_500_000);
  assert.equal(grew.dir, 'bigger');
  assert.equal(Math.round(grew.times * 10) / 10, 3.4);
  assert.equal(fmtGrowth(grew.times), '3.4× bigger');
  assert.equal(fmtGrowth(1.2), '20% bigger');
  assert.equal(fmtGrowth(0.5), '');
});

/* ── Dimensions a form can actually ask for ────────────────────────────── */
ok('fitBox never upscales and keeps the shape', () => {
  assert.deepEqual(fitBox(4000, 3000, 600, 600), { w: 600, h: 450 });
  assert.deepEqual(fitBox(400, 300, 600, 600), { w: 400, h: 300 });
  assert.deepEqual(fitBox(1000, 4000, 600, 600), { w: 150, h: 600 });
});
ok('coverRect centre-crops so 600x600 really is 600x600', () => {
  // 4000x3000 -> a 3000x3000 square taken from the middle
  assert.deepEqual(coverRect(4000, 3000, 600, 600), { sx: 500, sy: 0, sw: 3000, sh: 3000 });
  // already square: no crop
  assert.deepEqual(coverRect(1000, 1000, 600, 600), { sx: 0, sy: 0, sw: 1000, sh: 1000 });
  // portrait source, landscape target
  const r = coverRect(1000, 2000, 400, 200);
  assert.equal(r.sw, 1000);
  assert.equal(r.sh, 500);
  assert.equal(r.sy, 750);
});

/* ── Target sizes ──────────────────────────────────────────────────────── */
ok('kbToBytes uses decimal KB so it clears both readings of "200 KB"', () => {
  assert.equal(kbToBytes(200), 200000);
  assert.ok(kbToBytes(200) < 200 * 1024);
  assert.equal(kbToBytes('50'), 50000);
  assert.equal(kbToBytes(0), null);
  assert.equal(kbToBytes(-3), null);
  assert.equal(kbToBytes('abc'), null);
});

/* ── Refusals that are a route out ─────────────────────────────────────── */
ok('preflight names the format instead of shrugging', () => {
  const heic = preflight({ name: 'IMG_4821.HEIC', size: 2_000_000, type: '' });
  assert.match(heic.reason, /HEIC/);
  assert.match(heic.fix, /Safari/);
  assert.match(heic.fix, /Most Compatible/);
  assert.match(preflight({ name: 'a.heif', size: 10, type: '' }).reason, /Safari/);
  assert.match(preflight({ name: 'x.jpg', size: 0, type: 'image/jpeg' }).reason, /empty/);
  assert.match(preflight({ name: 'plan.svg', size: 900, type: 'image/svg+xml' }).reason, /SVG/);
  assert.match(preflight({ name: 'DSC.CR3', size: 900, type: '' }).reason, /RAW/);
  assert.equal(preflight({ name: 'ok.jpg', size: 100, type: 'image/jpeg' }), null);
});
ok('decodeFailure names the extension it choked on', () => {
  assert.match(decodeFailure({ name: 'weird.tif' }).reason, /\.tif/);
  assert.match(decodeFailure({ name: 'noext' }).reason, /could not decode/);
});

/* ── Queue hygiene ─────────────────────────────────────────────────────── */
ok('dupeKey is name + size + mtime', () => {
  const a = { name: 'b.jpg', size: 10, lastModified: 5 };
  assert.equal(dupeKey(a), dupeKey({ ...a }));
  assert.notEqual(dupeKey(a), dupeKey({ ...a, size: 11 }));
  assert.notEqual(dupeKey(a), dupeKey({ ...a, lastModified: 6 }));
});
ok('uniqueNames stops a ZIP from colliding with itself', () => {
  assert.deepEqual(uniqueNames(['a.jpg', 'a.jpg', 'b.jpg', 'A.JPG']),
    ['a.jpg', 'a (2).jpg', 'b.jpg', 'A (3).JPG']);
  assert.deepEqual(uniqueNames(['noext', 'noext']), ['noext', 'noext (2)']);
});

/* ── EXIF: read one date, write one date, and nothing else ─────────────── */
function jpegWithExif(dateStr) {
  const app1 = buildExifApp1(dateStr);
  // SOI + APP1 + a plausible SOS so the scanner has to walk past it
  return insertApp1(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), app1).buffer;
}
ok('buildExifApp1 emits a well-formed APP1', () => {
  const a = buildExifApp1('2019:07:04 18:22:31');
  assert.equal(a[0], 0xff);
  assert.equal(a[1], 0xe1);
  assert.equal((a[2] << 8) | a[3], a.length - 2);          // length covers itself
  assert.equal(String.fromCharCode(...a.slice(4, 8)), 'Exif');
  assert.equal(a.length, 4 + 6 + 128);
  assert.equal(buildExifApp1('nonsense'), null);
  assert.equal(buildExifApp1(''), null);
});
ok('readExifDate reads back what buildExifApp1 wrote', () => {
  assert.equal(readExifDate(jpegWithExif('2019:07:04 18:22:31')), '2019:07:04 18:22:31');
  assert.equal(readExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer), null);
  assert.equal(readExifDate(new Uint8Array([1, 2, 3, 4]).buffer), null);
});
ok('the written EXIF carries the date and nothing identifying', () => {
  const a = buildExifApp1('2019:07:04 18:22:31');
  const tags = [];
  const dv = new DataView(a.buffer, 10);                    // skip FFE1 len "Exif\0\0"
  const readIfd = (at) => {
    const n = dv.getUint16(at, true);
    for (let i = 0; i < n; i++) tags.push(dv.getUint16(at + 2 + i * 12, true));
  };
  readIfd(8);
  readIfd(58);
  assert.deepEqual(tags.sort(), [0x0132, 0x8769, 0x9003, 0x9004].sort());
  // no Orientation (the pixels are already upright), no Make, no Model, no GPS
  for (const forbidden of [0x0112, 0x010f, 0x0110, 0x8825]) {
    assert.ok(!tags.includes(forbidden), 'tag 0x' + forbidden.toString(16) + ' must not be written');
  }
});
ok('insertApp1 splices after SOI and refuses anything that is not a JPEG', () => {
  const app1 = buildExifApp1('2019:07:04 18:22:31');
  const jpg = new Uint8Array([0xff, 0xd8, 0xaa, 0xbb]);
  const out = insertApp1(jpg, app1);
  assert.equal(out.length, jpg.length + app1.length);
  assert.deepEqual([...out.slice(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...out.slice(2, 4)], [0xff, 0xe1]);
  assert.deepEqual([...out.slice(-2)], [0xaa, 0xbb]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(insertApp1(png, app1), png);
  assert.equal(insertApp1(jpg, null), jpg);
});

console.log(`\n${passed} compressor helper tests passed${process.exitCode ? ' (with failures)' : ''}`);
