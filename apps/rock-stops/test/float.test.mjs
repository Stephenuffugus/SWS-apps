/* Float, logic assertions, runnable from this repo.
 *
 * The handoff's original harness concatenated p1..p5.js and appended t_post.js.
 * Those source files do not exist here, index.html IS the app, so this runs
 * the real shipped script inside jsdom and asserts against the same functions.
 * The rule from the handoff still stands: KEEP THIS GREEN, and add assertions
 * whenever the colour maths or the backup format is touched.
 *
 *   node apps/float/test/float.test.mjs
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* The app's script is a classic <script> using top-level `const`, so its
   bindings live in script scope and never land on `window`. A second classic
   script in the same document shares that scope, so this appends one that
   hands the functions out, testing the real shipped code without altering
   the file or exporting anything into production. */
const EXPOSE = [
  'rgbToLab', 'labToBin', 'histFromPixels', 'packHist', 'unpackHist', 'histSimilarity',
  'rankByColor', 'extractStrata', 'strataCSS', 'newFind', 'newSite', 'newTrip',
  'geo', 'siteCoord', 'devgate', 'FLOAT_VERSION', 'uid', 'db', 'useMem',
];
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('</body>', `<script>window.__float = { ${EXPOSE.join(', ')} };<\/script></body>`);

const dom = new JSDOM(html, {
  url: 'https://localhost/float/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
/* jsdom implements neither of these and the app calls both on boot. */
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
/* jsdom has no structuredClone; the in-memory store fallback uses it. */
window.structuredClone = window.structuredClone || ((v) => JSON.parse(JSON.stringify(v)));

/* The gate would stop boot() before anything is defined, and every function
   under test is defined at script top level regardless, but unlock anyway so
   the harness exercises the same path a user does. */
window.localStorage.setItem('float.dev.unlocked', 'wolfden');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok:', name); }
  else { fail++; console.error('  FAIL:', name, extra === undefined ? '' : extra); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

await new Promise((r) => setTimeout(r, 300));

const w = window.__float || {};

/* ── 1. the script actually loaded ─────────────────────────────── */
check('script evaluated', typeof w.rgbToLab === 'function');
check('version exposed', typeof w.FLOAT_VERSION === 'string' && /^\d+\./.test(w.FLOAT_VERSION));

/* ── 2. Lab colour maths ───────────────────────────────────────── */
{
  /* rgbToLab returns a tuple [L, a, b], not an object. */
  const [wL, wa, wb] = w.rgbToLab(255, 255, 255);
  const [bL] = w.rgbToLab(0, 0, 0);
  check('white is L*≈100', near(wL, 100, 0.5), wL);
  check('white is neutral', Math.abs(wa) < 0.5 && Math.abs(wb) < 0.5, [wa, wb]);
  check('black is L*≈0', near(bL, 0, 0.5), bL);
  const [, ra] = w.rgbToLab(255, 0, 0);
  check('red has +a*', ra > 50, ra);
  const [, , bb] = w.rgbToLab(0, 0, 255);
  check('blue has -b*', bb < -50, bb);
}

/* ── 3. histogram bins and packing ─────────────────────────────── */
{
  const bin = w.labToBin(...w.rgbToLab(255, 255, 255));
  check('bin index in range', Number.isInteger(bin) && bin >= 0 && bin < 512, bin);

  /* histFromPixels(data, width, height), it samples centre-weighted, so the
     dimensions are not optional. */
  const flat = (r, g, b, n = 32) => {
    const px = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255; }
    return w.histFromPixels(px, n, n);
  };
  const h = flat(200, 60, 40);
  check('histogram has 512 bins', h.length === 512, h.length);
  const sum = h.reduce((a, b) => a + b, 0);
  check('histogram is normalised', near(sum, 1, 1e-3), sum);
  const nonzero = h.filter(v => v > 0).length;
  check('one flat colour lands in one bin', nonzero === 1, nonzero);

  /* The v1 bug: a linear byte scale clipped peaked histograms. sqrt packing
     fixed it, and this is the regression guard the handoff asks to keep. */
  const packed = w.packHist(h);
  const back = w.unpackHist(packed);
  const l1 = h.reduce((acc, v, i) => acc + Math.abs(v - back[i]), 0);
  check('sqrt pack/unpack round-trips (L1 < 0.02)', l1 < 0.02, l1);
  const peak = h.indexOf(Math.max(...h));
  check('a fully peaked histogram survives packing', near(back[peak], h[peak], 0.02), [h[peak], back[peak]]);
}

/* ── 4. similarity and ranking ─────────────────────────────────── */
{
  const mk = (r, g, b, n = 32) => {
    const px = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255; }
    return w.histFromPixels(px, n, n);
  };
  const red = mk(200, 60, 40), red2 = mk(198, 62, 44), blue = mk(40, 60, 200);
  check('identical histograms score 1', near(w.histSimilarity(red, red), 1, 1e-6));
  check('near colours beat far colours',
    w.histSimilarity(red, red2) > w.histSimilarity(red, blue),
    [w.histSimilarity(red, red2), w.histSimilarity(red, blue)]);

  const finds = [
    { id: 'a', label: 'red one', hist: w.packHist(red2) },
    { id: 'b', label: 'blue one', hist: w.packHist(blue) },
  ];
  const { results, confident } = w.rankByColor(red, finds);
  check('ranking puts the closer find first', results[0].find.id === 'a', results.map(r => r.find.id));
  check('confidence is a boolean', typeof confident === 'boolean');

  /* From the handoff: exact matches share a bin, so margin is zero and the
     result is deliberately NOT confident. Do not "fix" this. */
  const exact = w.rankByColor(red, [
    { id: 'x', label: 'same', hist: w.packHist(red) },
    { id: 'y', label: 'same too', hist: w.packHist(red) },
  ]);
  check('two identical candidates are not confident', exact.confident === false, exact.margin);
}

/* ── 5. strata ─────────────────────────────────────────────────── */
{
  const px = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) {
    const dark = i % 2 === 0;
    px[i * 4] = dark ? 30 : 220; px[i * 4 + 1] = dark ? 40 : 210;
    px[i * 4 + 2] = dark ? 35 : 200; px[i * 4 + 3] = 255;
  }
  const strata = w.extractStrata(px, 32, 32);
  check('strata returns bands', Array.isArray(strata) && strata.length >= 1 && strata.length <= 5, strata.length);
  check('strata weights sum to ~1', near(strata.reduce((a, s) => a + s[3], 0), 1, 0.05));
  const css = w.strataCSS(strata);
  check('strataCSS returns a gradient', typeof css === 'string' && css.includes('gradient'), css.slice(0, 40));
}

/* ── 6. domain records are sync-ready ──────────────────────────── */
{
  const f = w.newFind({ siteId: 's1', zoneId: 'z1' });
  check('newFind carries id', 'id' in f);
  check('newFind carries deleted', f.deleted === false);
  check('newFind keeps zoneId', f.zoneId === 'z1');

  /* The sync-ready contract is on the PERSISTED record, not the constructor:
     db.put() is what stamps the timestamps, and several views sort on
     createdAt, so a record that reached storage without one would throw. */
  const saved = await w.db.put('finds', w.newFind({ label: 'stamp test' }));
  for (const k of ['id', 'createdAt', 'updatedAt', 'deleted'])
    check(`a saved find carries ${k}`, k in saved, Object.keys(saved).join(','));
  check('createdAt is an ISO timestamp', !Number.isNaN(Date.parse(saved.createdAt)), saved.createdAt);
  const again = await w.db.put('finds', { ...saved, label: 'edited' });
  check('createdAt survives an edit', again.createdAt === saved.createdAt);
  check('updatedAt moves on an edit', again.updatedAt >= saved.updatedAt);
  const s = w.newSite('Quarry');
  check('newSite starts with no coordinates', s.lat === null && s.lon === null);
  check('newSite starts with an empty zone list', Array.isArray(s.zones) && s.zones.length === 0);
}

/* ── 7. geo: projection, distance, site centroid ───────────────── */
{
  check('geo exists', typeof w.geo === 'object');
  const eq = w.geo.merc(0, 0);
  check('equator/prime meridian is the origin', near(eq.x, 0, 1e-6) && near(eq.y, 0, 1e-6), eq);
  check('mercator y grows north', w.geo.merc(45, 0).y > w.geo.merc(10, 0).y);
  check('mercator x grows east', w.geo.merc(0, 30).x > w.geo.merc(0, -30).x);
  /* A pole must not produce Infinity and blow the whole viewport fit. */
  check('latitude is clamped at the mercator limit', Number.isFinite(w.geo.merc(90, 0).y), w.geo.merc(90, 0).y);

  /* One degree of latitude is about 111 km anywhere on Earth. */
  const d = w.geo.dist({ lat: 42, lon: -89 }, { lat: 43, lon: -89 });
  check('1° of latitude ≈ 111 km', d > 110000 && d < 112000, Math.round(d));
  check('zero distance is zero', w.geo.dist({ lat: 1, lon: 2 }, { lat: 1, lon: 2 }) === 0);
  check('distance formats in km', /km$/.test(w.geo.fmtDist(5400)), w.geo.fmtDist(5400));
  check('distance formats in m', /m$/.test(w.geo.fmtDist(240)), w.geo.fmtDist(240));

  const site = { id: 's1', lat: null, lon: null };
  const finds = [
    { siteId: 's1', lat: 10, lon: 20 },
    { siteId: 's1', lat: 12, lon: 22 },
    { siteId: 'other', lat: 80, lon: 80 },   // must not drag the centroid
    { siteId: 's1', lat: null, lon: null },  // must not count as 0,0
  ];
  const c = w.siteCoord(site, finds);
  check('site centre falls back to its finds', near(c.lat, 11, 1e-9) && near(c.lon, 21, 1e-9), c);
  check('derived centre is flagged as derived', c.derived === true);
  check('other sites do not move the centre', c.lat < 13);
  const fixed = w.siteCoord({ id: 's1', lat: 1, lon: 2 }, finds);
  check('an explicit coordinate wins', fixed.lat === 1 && fixed.derived === false);
  check('a site with nothing to go on has no position',
    w.siteCoord({ id: 'empty', lat: null, lon: null }, finds) === null);
}

/* ── 8. palette contrast ───────────────────────────────────────────
   Float sits outside the studio design system, so nothing solves its
   colours against a WCAG target and `npm run design:check` never sees
   it. axe found --mist failing on every view in both themes, 3.18:1
   on limestone and 3.9:1 on basalt2, because one grey was being asked
   to serve as secondary text on both a light and a dark ground, which
   no single value can do above 4.5:1. It is now two values. This is
   the guard so it stays that way. */
{
  const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tok = (name, scope) => {
    const re = scope
      ? new RegExp(scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*--' + name + ':\\s*(#[0-9a-fA-F]{6})')
      : new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})');
    const m = re.exec(css);
    return m ? m[1] : null;
  };
  const lum = (hex) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const limestone = tok('limestone'), basalt = tok('basalt'), basalt2 = tok('basalt2');
  const ink = tok('ink'), mistLight = tok('mist'), mistDark = tok('mist', '.view.dark,#tabbar');

  check('palette tokens are readable from the file',
    !!(limestone && basalt && basalt2 && ink && mistLight && mistDark),
    { limestone, basalt, basalt2, ink, mistLight, mistDark });

  check('body ink clears 4.5:1 on limestone', ratio(ink, limestone) >= 4.5, ratio(ink, limestone).toFixed(2));
  check('secondary text clears 4.5:1 on limestone',
    ratio(mistLight, limestone) >= 4.5, ratio(mistLight, limestone).toFixed(2));
  check('secondary text clears 4.5:1 on basalt',
    ratio(mistDark, basalt) >= 4.5, ratio(mistDark, basalt).toFixed(2));
  check('secondary text clears 4.5:1 on basalt2 (the harder of the two)',
    ratio(mistDark, basalt2) >= 4.5, ratio(mistDark, basalt2).toFixed(2));
  check('the light and dark greys are genuinely different values',
    mistLight.toLowerCase() !== mistDark.toLowerCase(), [mistLight, mistDark]);
}

/* ── 9. the development gate ───────────────────────────────────── */
{
  check('gate exists', typeof w.devgate === 'object');
  check('gate reads unlocked from storage', w.devgate.unlocked === true);
  window.localStorage.setItem('float.dev.unlocked', 'nope');
  check('gate rejects a wrong value', w.devgate.unlocked === false);
  window.localStorage.setItem('float.dev.unlocked', 'wolfden');
}

console.log(`\n${pass} passing, ${fail} failing`);
if (fail) process.exit(1);
console.log('FLOAT LOGIC PASSED');
