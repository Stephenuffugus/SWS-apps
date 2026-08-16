#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — give the remaining apps a backup file

   Local-only storage means the backup problem belongs to the user, and only
   six apps handed them a way to solve it. This installs the shared runtime
   (design/backup.js → sws-backup.js) into the apps that hold real data and
   had no export, and drops the two controls into each one's page.

     node design/add-backup.mjs           install
     node design/add-backup.mjs --check   report only, exit 1 if any app lacks it

   Apps NOT listed here, and why:
     · the four Firestore apps — their data already lives on a shared board
     · pdf-tools, image-compressor, scan-to-pdf, signature-maker — pipelines
       that deliberately keep nothing between sessions
     · the six that already had a working export/restore pair
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const check = process.argv.includes('--check');

/* app → the localStorage keys it owns, and the human name used in the
   wrong-file message. Keys were read out of each app's own source; a key that
   is not listed is never written on restore. */
const TARGETS = {
  'bracket-maker':  { name: 'Bracket Maker',  keys: ['bracket-maker', 'bracket-maker.visiting'] },
  'packing-list':   { name: 'Packing List',   keys: ['packing-list', 'packing-list.trips'] },
  'pill-schedule':  { name: 'Pill Schedule',  keys: ['pill-schedule'] },
  'secret-santa':   { name: 'Secret Santa',   keys: ['sws.secret-santa.v1'] },
  'sub-plans':      { name: 'Sub Plans',      keys: ['subplans'] },
};

const problems = [];

for (const [slug, cfg] of Object.entries(TARGETS)) {
  const dir = join(APPS, slug);
  const page = join(dir, 'index.html');
  if (!existsSync(page)) { problems.push(`${slug}: no index.html`); continue; }

  let html = readFileSync(page, 'utf8');
  const wired = html.includes('sws-backup.js') && html.includes('SWS.backup.wire');

  if (check) {
    if (!wired) problems.push(`${slug}: no backup`);
    continue;
  }
  if (wired) { console.log(`  ${slug.padEnd(16)} already wired`); continue; }

  copyFileSync(join(HERE, 'backup.js'), join(dir, 'sws-backup.js'));

  /* Load it beside the other shared runtime, so it is cached and precached
     exactly like sws-ui.js is. */
  if (!html.includes('sws-backup.js')) {
    html = html.replace('<script src="sws-ui.js"></script>',
      '<script src="sws-ui.js"></script>\n<script src="sws-backup.js"></script>');
  }

  /* The card goes just before the closing </main>: every one of these apps
     ends with its own content, and backup is a footer concern, not a step in
     the task. */
  const card = `
<section class="card noprint" id="backupCard">
  <h2>Keep a copy</h2>
  <p class="hint">Everything here is saved on this device only — no account, nothing uploaded.
  That also means a cleared browser or a lost phone takes it with them. Save a backup file
  now and again; it lands in your downloads and restores everything exactly as it was.</p>
  <div id="backupControls"></div>
</section>
`;
  if (!html.includes('id="backupCard"')) {
    const i = html.lastIndexOf('</main>');
    if (i === -1) { problems.push(`${slug}: no </main> to anchor the card`); continue; }
    html = html.slice(0, i) + card + html.slice(i);
  }

  /* Wire on load. Deferred to DOMContentLoaded because these apps run their
     own module scripts and the host element must exist first. */
  const boot = `
<script>
document.addEventListener('DOMContentLoaded', function () {
  var host = document.getElementById('backupControls');
  if (!host || !window.SWS || !SWS.backup) return;
  host.appendChild(SWS.backup.wire({
    app: ${JSON.stringify(slug)},
    name: ${JSON.stringify(cfg.name)},
    keys: ${JSON.stringify(cfg.keys)}
  }).el);
});
</script>
`;
  if (!html.includes('SWS.backup.wire')) {
    const j = html.lastIndexOf('</body>');
    html = html.slice(0, j) + boot + html.slice(j);
  }

  writeFileSync(page, html);

  /* Precache it, or the card renders empty offline — which is exactly the
     situation a backup button exists for. apply.mjs does this automatically
     for runtime it installs; this script installs its own, so it has to. */
  const swPath = join(dir, 'sw.js');
  if (existsSync(swPath)) {
    let sw = readFileSync(swPath, 'utf8');
    if (!sw.includes('sws-backup.js')) {
      const m = /(ASSETS\s*=\s*\[)([\s\S]*?)(\])/.exec(sw);
      if (m) {
        sw = sw.replace(m[0], `${m[1]}${m[2]}, "./sws-backup.js"${m[3]}`);
        /* Bump, or everyone who has already opened the app keeps the old
           shell and never sees the button at all. */
        sw = sw.replace(/((?:VERSION|CACHE)\s*=\s*['"][a-z0-9-]*?-v)(\d+)(['"])/i,
          (_, a, n, z) => a + (Number(n) + 1) + z);
        writeFileSync(swPath, sw);
      } else {
        problems.push(`${slug}: could not find an ASSETS list in sw.js`);
      }
    }
  }

  console.log(`  ${slug.padEnd(16)} backup added (${cfg.keys.join(', ')})`);
}

if (check) {
  if (problems.length) {
    console.log(`\n${problems.length} app(s) without backup:\n`);
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(TARGETS).length} target app(s) have backup\n`);
  process.exit(0);
}

if (problems.length) {
  console.log('\nproblems:');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log(`\n${Object.keys(TARGETS).length} app(s) processed`);
