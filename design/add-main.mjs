#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Add the <main> landmark.

   axe flagged 14 apps for having no main landmark, and 148 nodes of content
   sitting outside any landmark at all. It is also what the base's skip link
   points at, the link exists and styles correctly but, without a target, does
   nothing for the keyboard user it was added for.

   Everything between the app header and the close of .wrap becomes <main>.
   Found by counting div depth from the .wrap open rather than by regex, so a
   nested div cannot fool it.

     node design/add-main.mjs           all apps missing one
     node design/add-main.mjs --dry     report only
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const dry = process.argv.includes('--dry');

/** Index just past the </div> that closes the div opened at `openIdx`. */
function closeOfDiv(html, openIdx){
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = openIdx;
  let depth = 0, m;
  while ((m = re.exec(html))){
    if (m[0].toLowerCase() === '</div>'){
      if (--depth === 0) return m.index;
    } else depth++;
  }
  return -1;
}

let changed = 0, skipped = 0;

for (const slug of Object.keys(SKINS)){
  const path = join(APPS, slug, 'index.html');
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');

  if (/<main\b/i.test(html)){ skipped++; continue; }

  const wrapOpen = html.search(/<div class="wrap"/i);
  const headerClose = html.search(/<\/header>/i);
  if (wrapOpen === -1 || headerClose === -1 || headerClose < wrapOpen){
    console.log(`  !! ${slug}: no .wrap / </header> pair, needs a hand`);
    continue;
  }

  const wrapClose = closeOfDiv(html, wrapOpen);
  if (wrapClose === -1 || wrapClose < headerClose){
    console.log(`  !! ${slug}: could not match the .wrap close`);
    continue;
  }

  const afterHeader = headerClose + '</header>'.length;
  const next =
    html.slice(0, afterHeader) +
    '\n\n  <main id="main">' +
    html.slice(afterHeader, wrapClose) +
    '  </main>\n' +
    html.slice(wrapClose);

  if (!dry) writeFileSync(path, next);
  changed++;
  console.log(`  ${dry ? 'would wrap' : 'wrapped'}  ${slug}`);
}

console.log(`\n${changed} wrapped, ${skipped} already had one`);
