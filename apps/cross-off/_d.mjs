import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync('index.html','utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
 beforeParse(w){w.alert=()=>{};w.confirm=()=>true;w.SWS={toast:()=>{}};
  w.localStorage.setItem('crossoff.v1','{"pages":[{"name":"Sept", oops');}});
const w=dom.window;
console.log('loadState:', w.eval('loadState'));
console.log('readyState:', w.document.readyState);
console.log('STORE now:', JSON.stringify(w.localStorage.getItem('crossoff.v1')).slice(0,60));
console.log('BROKEN  :', JSON.stringify(w.localStorage.getItem('crossoff.v1.unreadable')).slice(0,60));
console.log('bar hidden:', w.document.getElementById('storageWarn')?.hidden);
console.log('bar text:', (w.document.getElementById('storageWarn')?.textContent||'').slice(0,60));
