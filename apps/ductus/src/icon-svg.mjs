/* icon.svg for DUCTUS (node apps/ductus/src/icon-svg.mjs): the seeded hand's A as stroked polylines on a paper tile (64 viewBox), from the engine in node. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const D = require(join(HERE, 'engine.js'));
const stem=[[50,10],[50,40],[50,80],[52,110],[60,125],[75,130]];
const arc=[]; for(let i=0;i<=20;i++){const a=-Math.PI/2+Math.PI*i/20; arc.push([60-40*Math.cos(a),70+55*Math.sin(a)])}
const zig=[[20,20],[80,50],[20,80],[80,110]]; const dot=[[50,5],[51,6]];
const script = D.makeScript([[stem],[arc],[zig,dot]], parseInt(process.env.SEED || '41', 10));
const paths = D.glyphPaths(script.glyphs['A'], { age: 0.35, slant: 0.04 });
let minx = 9, maxx = -9; for (const p of paths) for (const q of p.pts) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); }
const H = 40, W = H * 0.78, ox = 32 - ((minx + maxx) / 2) * W, oy = 10;
const f = v => v.toFixed(2);
let body = '';
for (const p of paths) {
  if (p.dot) { const [x, y] = p.pts[0]; body += `<circle cx="${f(ox + x * W)}" cy="${f(oy + y * H)}" r="2.6" fill="#1c1a22"/>`; continue; }
  body += `<polyline points="${p.pts.map(([x, y]) => f(ox + x * W) + ',' + f(oy + y * H)).join(' ')}" fill="none" stroke="#1c1a22" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f1e9d6"/>${body}<rect x="18" y="56" width="28" height="2.2" rx="1.1" fill="#b8432b"/></svg>`;
writeFileSync(join(HERE, '..', 'icon.svg'), svg); console.log('icon.svg', svg.length, 'bytes, paths', paths.length, 'hand', script.name);
