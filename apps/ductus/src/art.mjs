/* DUCTUS art: a seeded hand (SEED, default 41) rendered by the engine itself into masters under ../marketing/masters/,
   then resized by src/art-sizes.py into the icons and marketing/thumb-512.png. Placeholder art in the app's own look
   until Astra draws it (the Saccade precedent). Measured, never opened:  node apps/ductus/src/art.mjs */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const require = createRequire('/workspaces/lucid-winds/package.json');
const puppeteer = require('/workspaces/sws-tools/node_modules/puppeteer');
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'marketing', 'masters'); mkdirSync(OUT, { recursive: true });
const engine = readFileSync(join(HERE, 'engine.js'), 'utf8');
const SEED = parseInt(process.env.SEED || '41', 10);
const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#15131a"><script>${engine}</script>
<canvas id=sq width=1024 height=1024></canvas><canvas id=og width=1200 height=630></canvas><canvas id=ic width=1024 height=1024></canvas>
<script>
const D = window.Ductus;
// three "imagined letters": a hooked stem, a C arc, a zigzag with a dot (the handoff's own test doodles)
const stem=[[50,10],[50,40],[50,80],[52,110],[60,125],[75,130]];
const arc=[]; for(let i=0;i<=20;i++){const a=-Math.PI/2+Math.PI*i/20; arc.push([60-40*Math.cos(a),70+55*Math.sin(a)])}
const zig=[[20,20],[80,50],[20,80],[80,110]]; const dot=[[50,5],[51,6]];
const script = D.makeScript([[stem],[arc],[zig,dot]], ${SEED});
window.scriptName = script.name;
const PAPER='#f1e9d6', INK='#1c1a22', RUB='#b8432b';
function paper(ctx,w,h){ctx.fillStyle=PAPER;ctx.fillRect(0,0,w,h);
  // faint laid lines
  ctx.strokeStyle='rgba(28,26,34,.045)';ctx.lineWidth=1;for(let y=0;y<h;y+=18){ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(w,y+.5);ctx.stroke();}}
const st=(age,weight,pen,ink)=>({age,slant:0.04,pen:{type:pen,weight},ink});
// --- square master: the alphabet grid, DUCTUS wordmark, name
{ const c=document.getElementById('sq'), x=c.getContext('2d'); paper(x,1024,1024);
  const cols=6, cell=1024/cols, H=cell*0.56; let i=0;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') { const cx=(i%cols)*cell+cell/2, cy=Math.floor(i/cols)*cell+cell*0.18+48; D.drawGlyph(x,script,ch,cx,cy,H,st(0.15,0.085,'broad',INK)); i++; }
  x.fillStyle=RUB; x.font='600 54px Georgia,serif'; x.textAlign='center'; x.letterSpacing='18px'; x.fillText('DUCTUS',512,990);
}
// --- og card 1200x630: a sentence in the hand, the key underneath, wordmark + line
{ const c=document.getElementById('og'), x=c.getContext('2d'); paper(x,1200,630);
  D.renderText(x,script,'EVERY HAND\\nGROWS ITS OWN\\nALPHABET',st(0.3,0.085,'broad',INK),{x:70,y:70,H:110,maxW:1060,showKey:true,keyColor:'rgba(28,26,34,.42)',gap:0.2,space:0.5,lineH:1.5});
  x.fillStyle=RUB; x.font='600 46px Georgia,serif'; x.textAlign='left'; x.letterSpacing='14px'; x.fillText('DUCTUS',70,588);
  x.fillStyle='rgba(28,26,34,.6)'; x.font='italic 30px Georgia,serif'; x.letterSpacing='0px'; x.textAlign='right'; x.fillText('Draw three letters. Get a font, a cipher, a game.',1130,588);
}
// --- icon master: paper, one big glyph (the A) in rubric red, the D glyph small
{ const c=document.getElementById('ic'), x=c.getContext('2d'); paper(x,1024,1024);
  D.drawGlyph(x,script,'A',512,150,720,st(0.35,0.1,'brush',INK));
  x.fillStyle=RUB; x.font='600 96px Georgia,serif'; x.textAlign='center'; x.letterSpacing='26px'; x.fillText('DUCTUS',512,960);
}
</script>`;
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage(); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.setContent(html, { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 300));
for (const [id, name] of [['sq', 'master-square.png'], ['og', 'master-og.png'], ['ic', 'master-icon.png']]) {
  const data = await page.evaluate(id => document.getElementById(id).toDataURL('image/png').split(',')[1], id);
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  // measure: distinct colours + ink coverage so a blank or flat render is caught without opening it
  const m = await page.evaluate(id => { const c = document.getElementById(id), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; const set = new Set(); let dark = 0; for (let i = 0; i < d.length; i += 16) { set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); if (d[i] + d[i + 1] + d[i + 2] < 200) dark++; } return { colours: set.size, inkPct: (100 * dark / (d.length / 16)).toFixed(1) }; }, id);
  console.log(name, statSync(join(OUT, name)).size, 'bytes', JSON.stringify(m));
}
console.log('hand:', await page.evaluate(() => window.scriptName), 'errors:', errs.length ? errs : 'none');
await browser.close();
