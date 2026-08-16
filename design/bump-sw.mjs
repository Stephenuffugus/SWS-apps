#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — bump the service-worker cache version

   Every app is offline-first: its service worker caches index.html under a
   named version and serves that copy until the name changes. So editing an
   app's HTML and deploying is not enough — a returning visitor keeps the old
   page forever, and the change reaches only people who have never opened the
   app before.

   That is a correctness problem in general and a compliance problem in
   particular: Play requires the privacy policy to be reachable from inside the
   app, and the health apps now carry a disclaimer they are required to show.
   Neither reaches an existing user until the cache name moves.

     node design/bump-sw.mjs             bump every app
     node design/bump-sw.mjs qr-maker    bump one
     node design/bump-sw.mjs --dry       show what would change
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const only = argv.filter((a) => !a.startsWith('--'));
/* Discovered from the filesystem, not from skins.mjs. Keying this off the
   design system meant an app outside it — Float — was silently skipped, which
   is the one failure this script exists to prevent: an un-bumped worker keeps
   serving the old page to everyone who has already opened it. Any directory
   under apps/ with a service worker counts. */
const slugs = readdirSync(APPS)
  .filter((d) => {
    try { return statSync(join(APPS, d)).isDirectory() && existsSync(join(APPS, d, 'sw.js')); }
    catch (e) { return false; }
  })
  .sort()
  .filter((s) => !only.length || only.includes(s));

let n = 0;
for (const slug of slugs) {
  const p = join(APPS, slug, 'sw.js');
  if (!existsSync(p)) { console.log(`  !! ${slug}: no sw.js`); continue; }
  const src = readFileSync(p, 'utf8');

  /* The name is <prefix>-v<number>, and the prefix is load-bearing: the
     activate handler deletes caches starting with it, so renaming the prefix
     would orphan the old cache instead of clearing it. Only the number moves.

     Two constant names are in use — most apps call it VERSION, specials-planner
     calls it CACHE — so match either rather than skipping the odd one out. An
     app quietly left un-bumped is exactly the failure this script exists to
     prevent, so a miss is reported loudly instead. */
  const m = src.match(/(const\s+(?:VERSION|CACHE)\s*=\s*['"])([a-z0-9-]*?-v)(\d+)(['"])/i);
  if (!m) { console.log(`  !! ${slug}: no VERSION/CACHE = '<name>-v<n>' found`); continue; }

  const next = Number(m[3]) + 1;
  const out = src.replace(m[0], `${m[1]}${m[2]}${next}${m[4]}`);
  if (!dry) writeFileSync(p, out);
  console.log(`  ${slug.padEnd(20)} ${m[2]}${m[3]} → ${m[2]}${next}`);
  n++;
}

console.log(`\n${n} service worker(s) ${dry ? 'would be ' : ''}bumped`);
