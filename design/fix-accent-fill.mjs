#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Sweep: --accent used as a fill behind --accent-ink

     node design/fix-accent-fill.mjs --check   report, write nothing
     node design/fix-accent-fill.mjs           fix

   --accent is the mid-tone brand colour. --accent-ink is contrast-solved by
   the build against --accent-fill, NOT against --accent, so any rule that
   paints --accent-ink onto --accent is reading off the wrong end of the
   palette. Measured across the portfolio: 3.64–4.04:1 in light mode on five
   apps, all of which clear 5.2:1 or better on --accent-fill.

   axe never caught these because every one of them is an .active / .sel /
   .winner state that does not exist until the user interacts.

   Only rules that ALSO set color:var(--accent-ink) are touched — a bare
   --accent fill with no text on it (a progress bar) is decorative and correct.
   Only the app layer is touched; the base is generated.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const END = '/* ▲▲▲ END SWS STUDIO BASE ▲▲▲ */';

const check = process.argv.includes('--check');
let changed = 0;
const report = [];

for (const slug of Object.keys(SKINS)) {
  const path = join(APPS, slug, 'index.html');
  let html;
  try { html = readFileSync(path, 'utf8'); } catch { continue; }

  const cut = html.indexOf(END);
  if (cut === -1) { report.push(`${slug}: no base sentinel — skipped`); continue; }

  const head = html.slice(0, cut);
  let tail = html.slice(cut);
  const before = tail;

  /* Walk declaration blocks. A block qualifies only if it paints accent-ink as
     its text colour AND fills with the bare --accent. */
  tail = tail.replace(/\{[^{}]*\}/g, (block) => {
    if (!/color:\s*var\(--accent-ink\)/.test(block)) return block;
    if (!/background(-color)?:\s*var\(--accent\)/.test(block)) return block;

    return block
      .replace(/background(-color)?:\s*var\(--accent\)/g, 'background$1:var(--accent-fill)')
      // The border has to follow the fill or it draws a ring in a different
      // colour around the same control.
      .replace(/border-color:\s*var\(--accent\)/g, 'border-color:var(--accent-fill)');
  });

  if (tail !== before) {
    const hits = (before.match(/\{[^{}]*\}/g) || []).filter(
      (b) => /color:\s*var\(--accent-ink\)/.test(b) && /background(-color)?:\s*var\(--accent\)/.test(b)).length;
    report.push(`${slug}: ${hits} rule(s) moved to --accent-fill`);
    changed++;
    if (!check) writeFileSync(path, head + tail);
  }
}

for (const r of report) console.log('  ' + r);
console.log(`\n${changed} app(s) ${check ? 'would change' : 'changed'}`);

/* --check is a guard, not a preview: non-zero so `npm run design:check` fails
   if this pattern comes back. It is easy to reintroduce, because --accent is
   the obvious-looking token and the failure only shows up in a state that does
   not exist until someone clicks something. */
if (check && changed) process.exit(1);
