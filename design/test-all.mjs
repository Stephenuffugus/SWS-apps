#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Run every app's tests and report them together.

     node design/test-all.mjs
     node design/test-all.mjs qr-maker seating-chart

   Tests that need the Firebase emulator are listed and skipped rather than
   counted as failures, they cannot run here, and burying five permanent reds
   in the output is how a real regression gets missed.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');

/** Needs `firebase emulators:exec`; see apps/signup-sheets/package.json. */
const NEEDS_EMULATOR = new Set([
  'signup-sheets/rules.test.mjs',
  'signup-sheets/data.test.mjs',
  'signup-sheets/care.test.mjs',
  'signup-sheets/team.test.mjs',
  'signup-sheets/grocery.test.mjs',
]);

const only = process.argv.slice(2);
const results = { pass: [], fail: [], skip: [] };

for (const slug of readdirSync(APPS).sort()){
  if (only.length && !only.includes(slug)) continue;
  const testDir = join(APPS, slug, 'test');
  if (!existsSync(testDir)) continue;

  for (const file of readdirSync(testDir).filter((f) => f.endsWith('.mjs'))){
    const id = `${slug}/${file}`;
    if (NEEDS_EMULATOR.has(id)){ results.skip.push(id); continue; }

    // specials-planner's runner takes the html path as an argument
    const args = [join(testDir, file)];
    if (slug === 'specials-planner') args.push(join(APPS, slug, 'index.html'));

    try {
      await run('node', args, { cwd: join(APPS, slug), timeout: 120000 });
      results.pass.push(id);
    } catch (e) {
      const msg = (e.stderr || e.stdout || String(e)).trim().split('\n').filter(Boolean).slice(-2).join(' | ');
      results.fail.push({ id, msg: msg.slice(0, 220) });
    }
  }
}

for (const id of results.pass) console.log(`  pass  ${id}`);
for (const id of results.skip) console.log(`  skip  ${id}  (needs firebase emulator)`);
for (const { id, msg } of results.fail) console.log(`  FAIL  ${id}\n        ${msg}`);

console.log(`\n${results.pass.length} passing, ${results.fail.length} failing, ${results.skip.length} skipped`);
process.exit(results.fail.length ? 1 : 0);
