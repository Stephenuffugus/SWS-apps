const API = require('./harness.js');
const { S, POSES, cloneJ, rotAbout, bindAll, deform } = API;

/* ---- synthesise a drawn figure: outlined limbs and torso, like a kid tracing
       the blue armature. Each limb is two parallel contour lines. ---- */
const REST = cloneJ(S.rest);
function limb(a, b, halfWidth) {
  const A = REST[a], B = REST[b];
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const nx = -dy, ny = dx;
  const out = [];
  [1, -1].forEach(side => {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      pts.push([
        A[0] + dx * L * t + nx * halfWidth * side,
        A[1] + dy * L * t + ny * halfWidth * side,
        6,
      ]);
    }
    out.push({ layer: 'body', slot: 0, pts, bind: null, cell: null });
  });
  return out;
}
S.strokes = [].concat(
  limb('neck', 'hip', 62),
  limb('lsho', 'lelb', 26), limb('lelb', 'lwri', 21),
  limb('rsho', 'relb', 26), limb('relb', 'rwri', 21),
  limb('lhip', 'lkne', 32), limb('lkne', 'lank', 25),
  limb('rhip', 'rkne', 32), limb('rkne', 'rank', 25),
);
bindAll();

/* ---- polygon area of the quad formed by the two contour lines of a limb,
       sampled segment by segment. Collapse toward zero = the pinch. ---- */
function limbArea(list, i) {
  const a = list[i * 2].pts, b = list[i * 2 + 1].pts;
  let area = 0;
  for (let k = 0; k < a.length - 1; k++) {
    const quad = [a[k], a[k + 1], b[k + 1], b[k]];
    let s = 0;
    for (let j = 0; j < 4; j++) {
      const p = quad[j], q = quad[(j + 1) % 4];
      s += p[0] * q[1] - q[0] * p[1];
    }
    area += Math.abs(s) / 2;
  }
  return area;
}
const NAMES = ['torso', 'upper arm L', 'forearm L', 'upper arm R', 'forearm R',
               'thigh L', 'shin L', 'thigh R', 'shin R'];

function run(poseName) {
  const J = cloneJ(S.rest);
  (POSES[poseName] || []).forEach(op => rotAbout(J, op[0], op[1]));

  const rest = S.strokes;
  const fast = deform(rest, cloneJ(S.rest), { smooth: false });
  const base = NAMES.map((_, i) => limbArea(fast, i));

  const posedFast = deform(rest, J, { smooth: false });
  const t0 = performance.now();
  const posedSmooth = deform(rest, J, { smooth: true, iters: 14 });
  const ms = performance.now() - t0;

  console.log('\n=== pose: ' + poseName + ' ===');
  console.log('limb           rest area   LBS      keeps    SMOOTH   keeps');
  let wf = 1, ws = 1;
  NAMES.forEach((n, i) => {
    const f = limbArea(posedFast, i), s = limbArea(posedSmooth, i);
    const rf = f / base[i], rs = s / base[i];
    wf = Math.min(wf, rf); ws = Math.min(ws, rs);
    console.log(
      n.padEnd(14) +
      base[i].toFixed(0).padStart(9) +
      f.toFixed(0).padStart(9) + (rf * 100).toFixed(0).padStart(8) + '%' +
      s.toFixed(0).padStart(9) + (rs * 100).toFixed(0).padStart(7) + '%');
  });
  console.log('worst limb: LBS ' + (wf * 100).toFixed(0) + '%  ·  smooth ' +
              (ws * 100).toFixed(0) + '%   solve ' + ms.toFixed(1) + ' ms');
  return { wf, ws, ms };
}

const L = API.getLattice && (API.buildLattice(), API.getLattice());
console.log('lattice: ' + (L ? L.rest.length + ' verts, ' + L.clusters.length + ' clusters' : 'none'));

const results = ['Walk', 'Run', 'Jump', 'Curl'].map(run);

/* ---- repeatability: same character + same pose must give identical ink ---- */
const J = cloneJ(S.rest);
POSES.Curl.forEach(op => rotAbout(J, op[0], op[1]));
const a = deform(S.strokes, J, { smooth: true, iters: 14 });
const b = deform(S.strokes, cloneJ(J), { smooth: true, iters: 14 });
let maxDrift = 0;
a.forEach((st, i) => st.pts.forEach((p, k) => {
  maxDrift = Math.max(maxDrift,
    Math.abs(p[0] - b[i].pts[k][0]), Math.abs(p[1] - b[i].pts[k][1]));
}));
console.log('\ndeterminism: max drift between two solves of the same pose = ' +
            maxDrift.toExponential(1) + ' px');

const slowest = Math.max(...results.map(r => r.ms));
console.log('slowest solve across poses: ' + slowest.toFixed(1) + ' ms');
