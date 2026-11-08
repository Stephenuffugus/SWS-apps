/* DUCTUS engine, headless: the pure engine (src/engine.js, also inlined into index.html) run in node.
   Uniqueness, bounds, NaN, hand code round trip, garbage decode, TrueType bytes for every pen, and the built page
   carries the same engine. From the handoff's test.js and test2.js.   node apps/ductus/test/engine.mjs */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const D = require(join(HERE, '..', 'src', 'engine.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const stem = [[50, 10], [50, 40], [50, 80], [52, 110], [60, 125], [75, 130]];
const arc = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + Math.PI * i / 20; arc.push([60 - 40 * Math.cos(a), 70 + 55 * Math.sin(a)]); }
const zig = [[20, 20], [80, 50], [20, 80], [80, 110]]; const dot = [[50, 5], [51, 6]];
const doodles = [[stem], [arc], [zig, dot]];
const CHARS = D.LETTERS + D.DIGITS;
for (const seed of [1, 2, 3, 41]) {
  const s = D.makeScript(doodles, seed);
  const sigs = new Set(); let dup = 0, oob = 0, nan = 0;
  for (const ch of CHARS) {
    const g = s.glyphs[ch]; const k = JSON.stringify(g.strokes.map(x => x.nodes)); if (sigs.has(k)) dup++; sigs.add(k);
    for (const st of g.strokes) for (const n of st.nodes) if (n[0] < 0 || n[0] > 2 || n[1] < 0 || n[1] > 3) oob++;
    for (const p of D.glyphPaths(g, { age: 0.9, slant: 0.1 })) for (const q of p.pts) if (!isFinite(q[0]) || !isFinite(q[1])) nan++;
  }
  ok(dup === 0 && oob === 0 && nan === 0, `seed ${seed} "${s.name}": 36 glyphs, ${dup} duplicates, ${oob} off grid nodes, ${nan} NaN points (${s.traits.join(', ')})`);
  ok(Object.keys(s.glyphs).length >= 43, `seed ${seed}: letters, digits, ? and the six fixed marks (${Object.keys(s.glyphs).length} glyphs)`);
  const same = D.makeScript(doodles, seed);
  ok(JSON.stringify(same.glyphs) === JSON.stringify(s.glyphs) && same.name === s.name, `seed ${seed}: deterministic (daily puzzles stay shared)`);
}
const r = D.makeScript([], 7);
ok(r && r.name && Object.keys(r.glyphs).length >= 43, 'no doodles at all still forges a whole hand: ' + r.name);
const s = D.makeScript(doodles, 5);
const code = D.encodeScript(s); const back = D.decodeScript(code);
ok(code.startsWith('DUCTUS1|') && code.length < 1200, 'hand code is a DUCTUS1 string under 1200 chars (' + code.length + ')');
ok(back && JSON.stringify(Object.fromEntries(CHARS.split('').map(c => [c, back.glyphs[c].strokes.map(x => x.nodes)]))) === JSON.stringify(Object.fromEntries(CHARS.split('').map(c => [c, s.glyphs[c].strokes.map(x => x.nodes)]))), 'hand code round trip keeps every node');
ok(back && back.name === s.name, 'hand code carries the name: ' + (back && back.name));
ok(D.decodeScript('DUCTUS1|garbage') === null && D.decodeScript('') === null && D.decodeScript('x'.repeat(2000)) === null, 'garbage hand codes decode to null, never throw');
for (const pen of ['round', 'broad', 'brush']) {
  const bytes = D.buildFont(s, { age: 0.2, slant: 0.05, pen: { type: pen, weight: 0.08 } }, 'Test ' + pen);
  const magic = bytes.length > 4 && bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0;
  ok(bytes instanceof Uint8Array && bytes.length > 15000 && magic, `${pen} pen: a TrueType file with the 00 01 00 00 magic, ${bytes.length} bytes`);
}
const page = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
const engineSrc = readFileSync(join(HERE, '..', 'src', 'engine.js'), 'utf8');
ok(page.includes(engineSrc.slice(0, 400)) && page.includes(engineSrc.slice(-200)), 'index.html carries the same engine as src/engine.js (rebuild with src/build.mjs if not)');
ok(!/[—–]/.test(page), 'no em or en dash anywhere in the built page');
ok(/<p class="buildtag">ductus-v\d+<\/p>/.test(page), 'the build tag is stamped');
const sw = readFileSync(join(HERE, '..', 'sw.js'), 'utf8');
const tag = page.match(/<p class="buildtag">(ductus-v\d+)<\/p>/)[1];
ok(sw.includes(`var CACHE = '${tag}'`), `sw.js CACHE matches the build tag (${tag})`);
console.log(fails ? `\nDUCTUS ENGINE: ${fails} FAILED` : '\nDUCTUS ENGINE OK');
process.exit(fails ? 1 : 0);
