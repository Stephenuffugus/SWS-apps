/* The rig bench.

   This file exists because the previous acceptance criterion was an average,
   and an average is how a torso keeping 27% of its area hid for weeks behind a
   headline number of 87%. Every assertion here is PER LIMB. If a limb collapses,
   this file names that limb.

   node test/rig.mjs        (design/test-all.mjs runs it with cwd apps/comic-crew)
*/
import { loadApp, fixtures, runner } from './lib/stub.mjs';

const API = loadApp(new URL('../index.html', import.meta.url));
const { S, POSES, cloneJ, rotAbout, posePreset, bindAll, rebuildKits, deform,
        activeStrokes, relOf, poseOf, doc, load, JOINTS, PARENT, CHAIN } = API;
const FIX = fixtures(API);
const t = runner('rig');

const NAMES = ['torso', 'upper arm L', 'forearm L', 'upper arm R', 'forearm R',
               'thigh L', 'shin L', 'thigh R', 'shin R'];

/* area of the quad between a limb's two contour lines, summed segment by
   segment. Collapse toward zero is the pinch. */
function limbArea(list, i) {
  const a = list[i * 2 + 1].pts, b = list[i * 2 + 2].pts;   // +1 skips the head ring
  let area = 0;
  for (let k = 0; k < a.length - 1; k++) {
    const q = [a[k], a[k + 1], b[k + 1], b[k]];
    let s = 0;
    for (let j = 0; j < 4; j++) {
      const p = q[j], r = q[(j + 1) % 4];
      s += p[0] * r[1] - r[0] * p[1];
    }
    area += Math.abs(s) / 2;
  }
  return area;
}
function bbox(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  pts.forEach((p) => { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1];
                       if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; });
  return { w: x1 - x0, h: y1 - y0 };
}

/* ── 1. every shipped pose keeps every limb ─────────────────────────────── */
S.strokes = FIX.bench();
bindAll();
const wear = { outfit: -1, face: -1, kit: -1 };
const rest = deform(activeStrokes(wear), cloneJ(S.rest));
const base = NAMES.map((_, i) => limbArea(rest, i));
const headRest = bbox(rest[0].pts);

const table = [];
for (const name of Object.keys(POSES)) {
  const J = posePreset(name);
  const got = deform(activeStrokes(wear), J);

  const keeps = NAMES.map((_, i) => limbArea(got, i) / (base[i] || 1));
  const worst = Math.min(...keeps);
  const torso = keeps[0];
  table.push([name, torso, worst]);

  /* both directions. A torso that balloons is as wrong as one that collapses,
     and only checking the floor is how the shoulder carry could have gone
     unnoticed at 125%. */
  t.atLeast(torso, 0.85, `${name}: torso keeps its area`);
  t.ok(torso <= 1.15, `${name}: torso does not balloon (got ${(torso * 100).toFixed(0)}%)`);
  t.atLeast(worst, 0.78, `${name}: worst limb (${NAMES[keeps.indexOf(worst)]}) keeps its area`);

  /* the drawn head must be rigid. It is a body stroke, so without the head
     binding it blends across the shoulders and squashes visibly flat. */
  const hb = bbox(got[0].pts);
  t.near(hb.w / headRest.w, 1, 0.06, `${name}: head width unchanged`);
  t.near(hb.h / headRest.h, 1, 0.06, `${name}: head height unchanged`);

  /* nothing may go non finite, ever: a NaN here reaches export as a blank page */
  const bad = got.some((st) => st.pts.some((p) => !isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])));
  t.ok(!bad, `${name}: no non finite points`);
}
console.log('  pose            torso   worst limb');
table.forEach(([n, a, b]) => console.log(
  `  ${n.padEnd(14)} ${(a * 100).toFixed(0).padStart(4)}%  ${(b * 100).toFixed(0).padStart(6)}%`));

/* ── 2. every point is bound to at least one bone ────────────────────────── */
let unbound = 0;
S.strokes.forEach((st) => st.bind.forEach((b) => { if (!b || !b.length) unbound++; }));
t.eq(unbound, 0, 'every drawn point is bound to a bone');

/* ── 3. determinism. The headline promise is that a character is identical in
   panel one and panel forty, and it is meant literally. ──────────────────── */
const J1 = posePreset('Running');
const a1 = deform(activeStrokes(wear), J1);
const a2 = deform(activeStrokes(wear), J1);
let drift = 0;
a1.forEach((st, i) => st.pts.forEach((p, k) => {
  drift = Math.max(drift, Math.abs(p[0] - a2[i].pts[k][0]), Math.abs(p[1] - a2[i].pts[k][1]));
}));
t.eq(drift, 0, 'two solves of the same pose drift zero pixels');

/* ── 4. a stored pose survives an edit to the rest skeleton ──────────────
   Panels used to store absolute joint positions, so nudging one joint in Fit
   silently rewrote every panel already drawn. Angles do not do that. */
const posed = posePreset('Waving');
const rel = relOf(posed);

const roundTrip = poseOf(rel);
let rtErr = 0;
JOINTS.forEach((j) => { rtErr = Math.max(rtErr, Math.abs(roundTrip[j][0] - posed[j][0]),
                                              Math.abs(roundTrip[j][1] - posed[j][1])); });
t.ok(rtErr < 1e-6, `pose survives a round trip through storage (error ${rtErr})`);

/* Now move a joint the way Fit mode does, and check the stored pose still
   means the same thing. Because a panel stores the similarity that carries the
   rest bone onto the posed bone, rather than where the joint ended up, this is
   exact: rebuilding against a CHANGED rest and re-deriving gives back the very
   same numbers. The old representation stored absolute positions and a thirty
   pixel nudge visibly shrank a saved head. */
const beforeRel = JSON.parse(JSON.stringify(rel));
S.rest.lelb = [S.rest.lelb[0] - 30, S.rest.lelb[1] + 18];
S.rest.neck = [S.rest.neck[0] + 12, S.rest.neck[1] - 9];
bindAll();
const again = relOf(poseOf(beforeRel));
let ratioErr = 0;
Object.keys(beforeRel.b).forEach((j) => {
  ratioErr = Math.max(ratioErr, Math.abs(again.b[j][0] - beforeRel.b[j][0]),
                                Math.abs(again.b[j][1] - beforeRel.b[j][1]));
});
t.ok(ratioErr < 1e-12, `a stored pose survives a Fit edit exactly (error ${ratioErr})`);
t.near(again.t[0], beforeRel.t[0], 1e-12, 'and so does where the figure stands');

/* the rebuilt figure must actually follow the new skeleton, not the old one:
   the bone that moved has to come out the length the drawing now says it is */
const rebuilt = poseOf(beforeRel);
const restLen = Math.hypot(S.rest.lelb[0] - S.rest.lsho[0], S.rest.lelb[1] - S.rest.lsho[1]);
const poseLen = Math.hypot(rebuilt.lelb[0] - rebuilt.lsho[0], rebuilt.lelb[1] - rebuilt.lsho[1]);
t.near(poseLen, restLen, 1e-9, 'a re-fitted bone keeps its new length in every saved panel');

/* a pose record with rubbish in it must be refused, not rendered as nothing */
for (const bad of [null, {}, { t: [0, 0] }, { b: {} },
                   { t: [0, 0], b: { ...beforeRel.b, lelb: [NaN, 0] } },
                   { t: [1e9, 0], b: beforeRel.b },
                   { t: [0, 0], b: { ...beforeRel.b, lelb: [900, 900] } }]) {
  const doc0 = { format: 'comic-crew/4', rest: API.REST0,
                 strokes: [{ layer: 'body', slot: 0, pts: [[10, 10, 5], [20, 20, 5]] }],
                 panels: [{ pose: bad, wear: { outfit: -1, face: 0, kit: -1 }, words: [] }] };
  load(doc0);
  const p0 = poseOf(S.panels[0].pose);
  const finite = JOINTS.every((j) => isFinite(p0[j][0]) && isFinite(p0[j][1]));
  t.ok(finite, `a broken pose record falls back to standing rather than nothing: ${JSON.stringify(bad).slice(0, 40)}`);
}
S.rest = cloneJ(API.REST0);

/* ── 5. clothes fit every body, including the likeliest first drawing ───── */
S.rest = cloneJ(API.REST0);
for (const [name, make] of Object.entries({ potato: FIX.potato, stick: FIX.stick,
                                            lopside: FIX.lopside, single: FIX.single })) {
  S.strokes = make();
  bindAll(); rebuildKits();
  const kitStrokes = S.strokes.filter((s) => s.layer === 'kit');
  t.ok(kitStrokes.length > 0, `${name}: kits were built at all`);

  for (let k = 0; k < API.KITS.length; k++) {
    const list = activeStrokes({ outfit: -1, face: -1, kit: k });
    const kit = list.filter((s) => s.layer === 'kit');
    t.ok(kit.length > 0, `${name}/${API.KITS[k].name}: garment exists`);
    let w = 0;
    kit.forEach((st) => { const b = bbox(st.pts); if (b.w > w) w = b.w; });
    /* a garment that collapses into scratch marks is the failure mode here.
       Anything under a tenth of the figure's width is not clothing. */
    t.atLeast(w, 60, `${name}/${API.KITS[k].name}: garment is wide enough to read as clothing`);
  }
}

/* ── 5b. a garment stays on the body when the arms move ──────────────────
   Capes used to fly up with a raised arm, because a cape hanging behind an arm
   really is nearest that arm and the binding was rediscovered from position.
   Garment points now bind to the bone they were authored on.

   Measure only the parts authored on the spine, the belt and the cape and the
   tunic. Gloves and boots are authored on wrists and ankles and are SUPPOSED to
   travel with the limb, so including them would measure the wrong thing and the
   test would pass for the wrong reason. Under Big cheer only the arms turn, so
   anything hanging off the spine should not move at all. */
S.rest = cloneJ(API.REST0);
S.strokes = FIX.potato();
bindAll(); rebuildKits();
const SPINE = API.BONES.findIndex((b) => b[1] === 'neck');
for (let k = 0; k < API.KITS.length; k++) {
  const wr = { outfit: -1, face: -1, kit: k };
  const onSpine = (l) => l.filter((s) => s.layer === 'kit' && s.src.kb &&
                                         s.src.kb.every((b) => b === SPINE));
  const still = onSpine(deform(activeStrokes(wr), cloneJ(S.rest)));
  const up = onSpine(deform(activeStrokes(wr), posePreset('Big cheer')));
  t.ok(still.length > 0, `${API.KITS[k].name}: something is authored on the spine to measure`);
  let moved = 0;
  still.forEach((s, i) => s.pts.forEach((p, j) => {
    moved = Math.max(moved, Math.hypot(p[0] - up[i].pts[j][0], p[1] - up[i].pts[j][1]));
  }));
  t.ok(moved < 1e-9,
    `${API.KITS[k].name}: raising both arms does not move the costume on the body (moved ${moved.toFixed(1)}px)`);
}

/* ── 5c. a drawing made off the guide gets the bones brought to it ────────
   A figure drawn a long way off the armature still looks right at rest, and
   only falls apart when a pose turns a bone the ink does not belong to. Thirty
   world units, about nine millimetres on a phone, already pulls an arm off the
   body. The correction has to fire on a real miss and never on a correct
   tracing, and a centroid cannot tell those apart: it reads seventy units out
   on a correctly traced potato. */
for (const [name, make] of Object.entries({ bench: FIX.bench, potato: FIX.potato,
                                            stick: FIX.stick, lopside: FIX.lopside,
                                            single: FIX.single })) {
  /* traced correctly: the bones must not move at all */
  S.rest = cloneJ(API.REST0);
  S.strokes = make();
  bindAll();
  const before = cloneJ(S.rest);
  t.eq(API.alignBones(), false, `${name}: a correct tracing does not move the bones`);
  t.ok(JOINTS.every((j) => S.rest[j][0] === before[j][0] && S.rest[j][1] === before[j][1]),
    `${name}: and the skeleton is untouched`);

  /* drawn well off the guide: the bones must come to the drawing */
  for (const off of [60, 120]) {
    S.rest = cloneJ(API.REST0);
    S.strokes = make().map((st) => ({ ...st, bind: null,
      pts: st.pts.map((p) => [p[0] + off, p[1], p[2]]) }));
    bindAll();
    t.eq(API.alignBones(), true, `${name}: a drawing ${off} units off the guide is noticed`);
    const err = Math.abs(S.rest.hip[0] - (API.REST0.hip[0] + off));
    t.ok(err < 12, `${name}: and the bones land on it, within ${Math.round(err)} units of ${off}`);
  }
}
S.rest = cloneJ(API.REST0);

/* ── 6. the character file round trips, panels and words included ────────── */
S.rest = cloneJ(API.REST0);
S.strokes = FIX.potato();
bindAll(); rebuildKits();
S.name = 'Captain Sock';
const J2 = posePreset('Jumping');
S.panels[0] = { pose: relOf(J2), wear: { outfit: -1, face: 0, kit: 1 },
                words: [{ text: 'up we go', kind: 'shout', x: 300, y: 220, tail: 'head' }] };
S.panels[2] = { pose: relOf(cloneJ(S.rest)), wear: { outfit: -1, face: 1, kit: -1 }, words: [] };
const saved = JSON.stringify(doc());
const bodyCount = S.strokes.filter((s) => s.layer === 'body').length;

load(JSON.parse(saved));
t.eq(S.name, 'Captain Sock', 'name round trips');
t.eq(S.strokes.filter((s) => s.layer === 'body').length, bodyCount, 'body strokes round trip');
t.eq(S.strokes.filter((s) => s.layer === 'kit').length > 0, true, 'kits are rebuilt, not restored');
t.ok(S.panels[0] && S.panels[0].words.length === 1, 'panel words round trip');
t.eq(S.panels[0].words[0].text, 'up we go', 'balloon text round trips');
t.eq(S.panels[0].wear.kit, 1, 'panel costume round trips');
t.eq(S.panels[1], null, 'an empty panel stays empty');
t.eq(S.panels[2].wear.face, 1, 'panel face round trips');
const reposed = poseOf(S.panels[0].pose);
let poseErr = 0;
JOINTS.forEach((j) => { poseErr = Math.max(poseErr, Math.abs(reposed[j][0] - J2[j][0]),
                                                 Math.abs(reposed[j][1] - J2[j][1])); });
t.ok(poseErr < 1e-6, `panel pose round trips through the file (error ${poseErr})`);

/* ── 7. a wrong file must not leave the app half loaded ─────────────────── */
const good = JSON.stringify(doc());
for (const junk of ['{}', '{"rest":null}', '{"rest":{"head":[1,2]}}',
                    '{"rest":' + JSON.stringify(API.REST0) + '}',
                    '{"format":"comic-crew/4","rest":' + JSON.stringify(API.REST0) + ',"strokes":"nope"}']) {
  let threw = false;
  try { load(JSON.parse(junk)); } catch (e) { threw = true; }
  t.ok(threw, `junk file rejected: ${junk.slice(0, 32)}`);
  t.eq(Object.keys(S.rest).length, 15, 'skeleton still has all fifteen joints after a bad file');
}
load(JSON.parse(good));
t.eq(Object.keys(S.rest).length, 15, 'a good file still loads afterwards');

/* points that are not numbers must be dropped, not stored */
load({ format: 'comic-crew/4', rest: API.REST0, strokes: [
  { layer: 'body', slot: 0, pts: [[10, 10, 5], ['x', 2, 3], [20, 20, 5]] },
  { layer: 'body', slot: 0, pts: [] },
  { layer: 'nonsense', slot: 99, pts: [[30, 30, 5], [40, 40, 5]] },
] });
t.eq(S.strokes.filter((s) => s.layer === 'body').length, 2, 'bad points are dropped, good strokes kept');
t.ok(S.strokes.every((s) => s.pts.every((p) => p.every(isFinite))), 'no non finite point survives a load');

/* ── 7b. balloons are sized in the font they are drawn in ────────────────
   A bubble measured before its font is set comes out sized for the browser
   default of ten pixels, and the lettering spills straight out of it. That
   shipped once and was invisible until somebody looked at a screenshot. */
{
  const ctx = { font: '', measureText(s) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font || '');
    const px = m ? parseFloat(m[1]) : 10;
    return { width: String(s).length * px * 0.48 };
  } };
  const long = { text: 'Hello! I am made of bones.', kind: 'speech', x: 300, y: 120, tail: 'head' };
  const box = API.balloonBox(ctx, long);
  t.ok(box.lines.length >= 2, `long text wraps (got ${box.lines.length} lines)`);
  const widest = Math.max(...box.lines.map((l) => l.length * box.size * 0.48));
  t.ok(box.w >= widest, `bubble is wide enough for its own words (${Math.round(box.w)} vs ${Math.round(widest)})`);
  t.ok(box.w >= 200, `bubble is not sized for the default font (${Math.round(box.w)})`);

  const empty = API.balloonBox(ctx, { text: '', kind: 'speech', x: 0, y: 0, tail: '' });
  t.ok(empty.w >= 140 && empty.h >= 90, 'an empty bubble still has a shape');

  /* the font must be left as it was found, or the next thing drawn inherits it */
  ctx.font = 'sentinel';
  API.balloonBox(ctx, long);
  t.eq(ctx.font, 'sentinel', 'measuring a bubble does not leak its font');
}

/* ── 7c. the printed page is laid out for the panels that exist ───────────
   Four empty framed boxes around one drawing is not a comic page, it is a form
   with one field filled in, and that is what a child would have been handed. */
{
  const counts = [1, 2, 3, 4].map((n) => API.pageLayout(n).length);
  t.eq(JSON.stringify(counts), JSON.stringify([1, 2, 3, 4]),
    'one cell per filled panel, never four regardless');
  for (const n of [1, 2, 3, 4]) {
    const cells = API.pageLayout(n);
    let area = 0;
    cells.forEach((q) => { area += q[2] * q[3]; });
    t.near(area, 1, 1e-9, `${n} panels fill the page exactly once`);
    /* and no two cells overlap */
    let overlap = false;
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        if (a[0] < b[0] + b[2] - 1e-9 && b[0] < a[0] + a[2] - 1e-9 &&
            a[1] < b[1] + b[3] - 1e-9 && b[1] < a[1] + a[3] - 1e-9) overlap = true;
      }
    t.ok(!overlap, `${n} panels do not overlap`);
  }
}

/* ── 7d. a handful of taps on blank paper is not a person ─────────────────
   Six dots used to count, and the costumes then rendered on nothing at all. */
{
  S.rest = cloneJ(API.REST0);
  S.strokes = [];
  t.eq(API.bodyDrawn(), false, 'an empty page is not a body');
  S.strokes = Array.from({ length: 8 }, (_, i) => ({ layer: 'body', slot: 0,
    pts: [[500 + i, 700, 6]], bind: null, cell: null }));
  bindAll();
  t.eq(API.bodyDrawn(), false, 'eight dots in one spot are not a body either');
  S.strokes = FIX.stick();
  bindAll();
  t.eq(API.bodyDrawn(), true, 'the thinnest figure in the fixtures is');
}

/* ── 7e. a file from a later build is refused, not silently downgraded ────
   The version was written on every save and never read, so a newer file would
   have been loaded as best it could and written back in this build's shape. */
{
  S.rest = cloneJ(API.REST0);
  S.strokes = FIX.potato();
  bindAll();
  const good = JSON.parse(JSON.stringify(doc()));
  let threw = false;
  try { load({ ...good, format: 'comic-crew/9' }); } catch (e) { threw = true; }
  t.ok(threw, 'a file from a later build is refused');
  t.eq(Object.keys(S.rest).length, 15, 'and nothing was touched on the way');
  load(good);
  t.ok(S.strokes.length > 0, 'this build still loads its own files');
  /* the older format is still readable, because children keep files */
  const old3 = { format: 'comic-crew/3', rest: API.REST0,
    strokes: [{ layer: 'body', slot: 0, pts: [[100, 100, 5], [200, 200, 5]] }] };
  let ok3 = true;
  try { load(old3); } catch (e) { ok3 = false; }
  t.ok(ok3, 'and a file from the first shipped format still opens');
}

/* ── 8. house rules ─────────────────────────────────────────────────────── */
const { readFileSync } = await import('node:fs');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
t.eq(/[\u2013\u2014]/.test(html), false, 'no em or en dashes anywhere in the app');
t.eq(html.includes('fonts.googleapis.com'), false, 'no runtime network call to Google Fonts');
t.eq(html.includes('user-scalable=no'), false, 'pinch zoom is not blocked');
t.ok(/var BUILD = '([a-z0-9-]+)'/.test(html), 'a build tag is present');

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const build = html.match(/var BUILD = '([a-z0-9-]+)'/)[1];
t.ok(sw.includes(`'${build}'`), `the worker caches the shipped build (${build})`);
t.ok(/const CACHE\s*=/.test(sw), 'the cache name is a const, so design/bump-sw.mjs can see it');

t.done();
