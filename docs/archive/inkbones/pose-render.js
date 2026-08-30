// Render the real shipping file's deformer output across poses, so the pinch
// can be looked at instead of inferred from a percentage.
const API = require('./harness.js');
const { S, POSES, cloneJ, rotAbout, bindAll, deform, outlineOf, activeStrokes } = API;
const fs = require('fs');
const REST = cloneJ(S.rest);

function limb(a, b, hw) {
  const A = REST[a], B = REST[b];
  let dx = B[0]-A[0], dy = B[1]-A[1];
  const L = Math.hypot(dx,dy); dx/=L; dy/=L;
  const nx=-dy, ny=dx, out=[];
  [1,-1].forEach(sd => {
    const pts=[];
    for (let t=0;t<=1.0001;t+=0.1)
      pts.push([A[0]+dx*L*t+nx*hw*sd, A[1]+dy*L*t+ny*hw*sd, 6]);
    out.push({layer:'body',slot:0,pts,bind:null,cell:null});
  });
  return out;
}
function circle(cx,cy,r){
  const pts=[];
  for(let a=0;a<=Math.PI*2+0.01;a+=Math.PI/14) pts.push([cx+Math.cos(a)*r, cy+Math.sin(a)*r, 6]);
  return [{layer:'body',slot:0,pts,bind:null,cell:null}];
}
S.strokes = [].concat(
  circle(500,222,84),
  limb('neck','hip',62),
  limb('lsho','lelb',26), limb('lelb','lwri',21),
  limb('rsho','relb',26), limb('relb','rwri',21),
  limb('lhip','lkne',32), limb('lkne','lank',25),
  limb('rhip','rkne',32), limb('rkne','rank',25),
);
bindAll();

const groups = [];
['Stand','Walk','Run','Jump','Wave','Curl'].forEach(name => {
  const J = cloneJ(S.rest);
  (POSES[name]||[]).forEach(op => rotAbout(J, op[0], op[1]));
  const list = deform(activeStrokes({outfit:-1,face:-1,kit:-1}), J, {smooth:false});
  groups.push({ label:name, polys: list.filter(st=>st.pts.length>1)
    .map(st => ({ kit:false, pts: outlineOf(st.pts).map(p=>[p[0],p[1]]) })) });
});
fs.writeFileSync('poses.json', JSON.stringify(groups));
console.log('poses: ' + groups.length);
