const API = require('./harness.js');
const { S, KITS, cloneJ, bindAll, rebuildKits, outlineOf, activeStrokes, deform, POSES, rotAbout } = API;
const fs = require('fs');

const REST = cloneJ(S.rest);

/* ---- three bodies a kid might actually draw ---- */
function limb(a, b, hw0, hw1) {
  const A = REST[a], B = REST[b];
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const nx = -dy, ny = dx, out = [];
  [1, -1].forEach(sd => {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.125) {
      const hw = hw0 + (hw1 - hw0) * t;
      pts.push([A[0] + dx * L * t + nx * hw * sd, A[1] + dy * L * t + ny * hw * sd, 6]);
    }
    out.push({ layer: 'body', slot: 0, pts, bind: null, cell: null });
  });
  return out;
}
function circle(cx, cy, r, w) {
  const pts = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 14)
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, w || 6]);
  return [{ layer: 'body', slot: 0, pts, bind: null, cell: null }];
}
function oval(cx, cy, rx, ry) {
  const pts = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 12)
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 6]);
  return [{ layer: 'body', slot: 0, pts, bind: null, cell: null }];
}
function feet(k) {
  if (!k.feet) return [];   // stick figure has none: tests the fallback
  return [].concat(
    oval(REST.lank[0] - 14 * k.feet, REST.lank[1] + 30 * k.feet, 36 * k.feet, 22 * k.feet),
    oval(REST.rank[0] + 14 * k.feet, REST.rank[1] + 30 * k.feet, 36 * k.feet, 22 * k.feet));
}
function body(k) {
  return [].concat(
    feet(k),
    circle(500, 222, 84 * k.head),
    limb('hip', 'neck', 58 * k.torso, 48 * k.torso),
    limb('lsho', 'lelb', 24 * k.arm, 20 * k.arm), limb('lelb', 'lwri', 20 * k.arm, 15 * k.arm),
    limb('rsho', 'relb', 24 * k.armR, 20 * k.armR), limb('relb', 'rwri', 20 * k.armR, 15 * k.armR),
    limb('lhip', 'lkne', 30 * k.leg, 25 * k.leg), limb('lkne', 'lank', 25 * k.leg, 18 * k.leg),
    limb('rhip', 'rkne', 30 * k.leg, 25 * k.leg), limb('rkne', 'rank', 25 * k.leg, 18 * k.leg),
    circle(REST.lwri[0], REST.lwri[1], 20 * k.arm), circle(REST.rwri[0], REST.rwri[1], 20 * k.armR),
  );
}
const BODIES = {
  stick:   { head: .7,  torso: .42, arm: .40, armR: .40, leg: .48, feet: 0 },
  potato:  { head: 1.15, torso: 1.5, arm: 1.5, armR: 1.5, leg: 1.35, feet: 1.35 },
  lopside: { head: .95, torso: .95, arm: .55, armR: 1.9, leg: 1.0, feet: 1.0 },
};


const groups = [];
Object.keys(BODIES).forEach(name => {
  S.strokes = body(BODIES[name]);
  bindAll(); rebuildKits();
  KITS.forEach((kit, i) => {
    const wear = { outfit: -1, face: -1, kit: i };
    const pose = cloneJ(S.rest);
    (name === 'lopside' ? POSES.Wave : []).forEach(op => rotAbout(pose, op[0], op[1]));
    const list = deform(activeStrokes(wear), pose, { smooth: false });
    groups.push({ label: name + " / " + kit.name,
      polys: list.filter(st=>st.pts.length>1).map(st => ({
        kit: st.layer === 'kit',
        pts: outlineOf(st.pts).map(p => [p[0], p[1]]) })) });
  });
});
fs.writeFileSync('/home/claude/fit.json', JSON.stringify(groups));
console.log('groups: ' + groups.length);
