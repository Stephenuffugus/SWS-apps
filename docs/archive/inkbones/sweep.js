const fs=require('fs'),cp=require('child_process');
const SRC='/mnt/user-data/outputs/inkbones-v3.html';
const base=fs.readFileSync(SRC,'utf8');

const configs=[
  {lo:.55,hi:.92,smin:.90,smax:1.12,cell:30},
  {lo:.45,hi:.70,smin:.90,smax:1.12,cell:30},
  {lo:.35,hi:.60,smin:.85,smax:1.18,cell:30},
  {lo:.45,hi:.70,smin:.90,smax:1.12,cell:22},
];
fs.writeFileSync('/home/claude/metric.js',`
const API=require('./harness.js');
const {S,POSES,cloneJ,rotAbout,bindAll,deform}=API;
const REST=cloneJ(S.rest);
function limb(a,b,hw){const A=REST[a],B=REST[b];let dx=B[0]-A[0],dy=B[1]-A[1];
 const L=Math.hypot(dx,dy);dx/=L;dy/=L;const nx=-dy,ny=dx;const out=[];
 [1,-1].forEach(sd=>{const pts=[];for(let t=0;t<=1.0001;t+=0.1)
   pts.push([A[0]+dx*L*t+nx*hw*sd,A[1]+dy*L*t+ny*hw*sd,6]);
  out.push({layer:'body',slot:0,pts,bind:null,cell:null});});return out;}
S.strokes=[].concat(
 limb('lsho','lelb',26),limb('lelb','lwri',21),
 limb('rsho','relb',26),limb('relb','rwri',21),
 limb('lhip','lkne',32),limb('lkne','lank',25),
 limb('rhip','rkne',32),limb('rkne','rank',25));
bindAll();
// cross-section width where a limb meets the next joint (the candy-wrapper spot)
function endWidth(list,i){const a=list[i*2].pts,b=list[i*2+1].pts,k=a.length-1;
 return Math.hypot(a[k][0]-b[k][0],a[k][1]-b[k][1]);}
function area(list,i){const a=list[i*2].pts,b=list[i*2+1].pts;let s=0;
 for(let k=0;k<a.length-1;k++){const q=[a[k],a[k+1],b[k+1],b[k]];let t=0;
  for(let j=0;j<4;j++){const p=q[j],r=q[(j+1)%4];t+=p[0]*r[1]-r[0]*p[1];}s+=Math.abs(t)/2;}return s;}
const N=8;
const rest0=deform(S.strokes,cloneJ(S.rest),{smooth:false});
const bw=[...Array(N)].map((_,i)=>endWidth(rest0,i));
const ba=[...Array(N)].map((_,i)=>area(rest0,i));
let wF=9,wS=9,aF=9,aS=9,ms=0;
['Walk','Run','Jump','Curl'].forEach(p=>{
 const J=cloneJ(S.rest);POSES[p].forEach(o=>rotAbout(J,o[0],o[1]));
 const f=deform(S.strokes,J,{smooth:false});
 const t0=performance.now();
 const s=deform(S.strokes,J,{smooth:true,iters:12});ms=Math.max(ms,performance.now()-t0);
 for(let i=0;i<N;i++){
  wF=Math.min(wF,endWidth(f,i)/bw[i]); wS=Math.min(wS,endWidth(s,i)/bw[i]);
  aF=Math.min(aF,area(f,i)/ba[i]);     aS=Math.min(aS,area(s,i)/ba[i]);}
});
console.log(JSON.stringify({wF,wS,aF,aS,ms,verts:(API.buildLattice(),API.getLattice().rest.length)}));
`);
console.log('cfg                         joint width  |  limb area  | verts  ms');
console.log('                             LBS  smooth |  LBS smooth |');
configs.forEach(c=>{
  let s=base
   .replace(/ANCHOR_LO=\.\d+, ANCHOR_HI=\.\d+/,`ANCHOR_LO=${c.lo}, ANCHOR_HI=${c.hi}`)
   .replace(/const CELL=\d+/,`const CELL=${c.cell}`)
   .replace(/s=s<\.\d+\?\.\d+:s>1\.\d+\?1\.\d+:s;/,
            `s=s<${c.smin}?${c.smin}:s>${c.smax}?${c.smax}:s;`);
  fs.writeFileSync('/home/claude/tmp.html',s);
  const out=cp.execSync('node metric.js /home/claude/tmp.html',{cwd:'/home/claude'}).toString().trim();
  const r=JSON.parse(out.split('\n').pop());
  console.log(`lo${c.lo} hi${c.hi} s[${c.smin},${c.smax}] c${c.cell}`.padEnd(28)+
    (r.wF*100).toFixed(0).padStart(5)+'%'+(r.wS*100).toFixed(0).padStart(7)+'%  |'+
    (r.aF*100).toFixed(0).padStart(5)+'%'+(r.aS*100).toFixed(0).padStart(6)+'%  |'+
    String(r.verts).padStart(6)+r.ms.toFixed(1).padStart(6));
});
