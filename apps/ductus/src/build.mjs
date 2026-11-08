#!/usr/bin/env node
/* DUCTUS build: inline src/engine.js into src/template.html at the __ENGINE__ comment mark and write ../index.html.
   The one build step. Run from anywhere:  node apps/ductus/src/build.mjs
   BUILD is the stamp printed in the footer and the service worker's cache name; bump both together (sw.js CACHE). */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = 'ductus-v1';
const eng = readFileSync(join(HERE, 'engine.js'), 'utf8');
const tpl = readFileSync(join(HERE, 'template.html'), 'utf8');
if (!tpl.includes('/*__ENGINE__*/')) throw new Error('template.html has no /*__ENGINE__*/ mark');
if (!tpl.includes('__BUILD__')) throw new Error('template.html has no __BUILD__ mark');
const out = tpl.replace('/*__ENGINE__*/', () => eng).split('__BUILD__').join(BUILD);
if (/[—–]/.test(out)) throw new Error('an em or en dash is in the page (house rule: none)');
const target = join(HERE, '..', 'index.html');
writeFileSync(target, out);
console.log('built', target, (statSync(target).size / 1024).toFixed(1) + 'KB', BUILD);
