#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — the full pass

     node design/finish.mjs           rebuild, apply, verify, capture, report
     node design/finish.mjs --quick   skip the slow capture and report steps

   Runs every step in order and keeps going when one fails, because a failing
   accessibility audit is information, not a reason to skip the screenshots.
   Prints one summary at the end and exits non-zero if anything that MATTERS
   failed — a broken test or a serious a11y violation, not a slow screenshot.
   ═══════════════════════════════════════════════════════════════════════════ */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const quick = process.argv.includes('--quick');

const STEPS = [
  { name: 'build tokens',     cmd: ['design/build.mjs'],              blocking: true },
  { name: 'apply to apps',    cmd: ['design/apply.mjs'],              blocking: true },
  { name: 'rebuild hub',      cmd: ['design/hub.mjs'],                blocking: true },
  { name: 'tests',            cmd: ['design/test-all.mjs'],           blocking: true },
  { name: 'accessibility',    cmd: ['design/a11y.mjs'],               blocking: true },
  { name: 'competitive brief', cmd: ['design/brief.mjs'],             blocking: false },
  { name: 'screenshots',      cmd: ['design/shoot-apps.mjs', 'after'], blocking: false, slow: true },
  { name: 'report',           cmd: ['design/report.mjs'],             blocking: false, slow: true },
];

const run = (args) => new Promise((resolve) => {
  const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
  p.on('close', (code) => resolve({ code, out }));
});

const results = [];

for (const step of STEPS){
  if (quick && step.slow){ results.push({ ...step, code: null, skipped: true }); continue; }
  console.log(`\n\x1b[1m── ${step.name} ─────────────────────────────────────────\x1b[0m`);
  const { code } = await run(step.cmd);
  results.push({ ...step, code });
}

console.log('\n\x1b[1m── summary ──────────────────────────────────────────────\x1b[0m');
let failed = 0;
for (const r of results){
  const state = r.skipped ? 'skipped' : r.code === 0 ? 'ok' : `FAILED (${r.code})`;
  if (!r.skipped && r.code !== 0 && r.blocking) failed++;
  console.log(`  ${String(state).padEnd(12)} ${r.name}`);
}

console.log(failed
  ? `\n${failed} blocking step(s) failed.`
  : '\nAll blocking steps passed.');

process.exit(failed ? 1 : 0);
