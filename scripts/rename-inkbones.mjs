#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Rename the app currently called Inkbones.

   The working title collides with Inkbones Media, a live graphic design studio,
   and with an abandoned Inkscape bone rigging extension of the same name. This
   does the whole rename in one go so the decision costs a command rather than
   an afternoon.

     node scripts/rename-inkbones.mjs "Doodlebones"
     node scripts/rename-inkbones.mjs "Doodlebones" --mark "DOODLE|BONES"
     node scripts/rename-inkbones.mjs "Paper Puppet" --dry

   The slug is derived from the name: lower case, spaces to hyphens. The mark is
   the logo in the top bar, which is two coloured halves, so give it as
   "FIRST|SECOND" if the split is not obvious. Default splits a single word in
   the middle and a two word name at the space.

   WHAT IT DELIBERATELY DOES NOT TOUCH:
   - docs/archive/inkbones/, which is the prototype exactly as it arrived. It is
     a record of a thing that really was called Inkbones, and renaming it would
     make the record false.
   - apps/index.html, apps/catalogue.json, apps/sitemap.xml and
     apps/manifest.webmanifest, which are generated. Run the hub afterwards, as
     this script reminds you.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OLD_SLUG = 'inkbones';
const OLD_NAME = 'Inkbones';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const markArg = (() => { const i = argv.indexOf('--mark'); return i >= 0 ? argv[i + 1] : null; })();
const NEW_NAME = argv.filter((a) => !a.startsWith('--') && a !== markArg)[0];

if (!NEW_NAME) {
  console.error('usage: node scripts/rename-inkbones.mjs "New Name" [--mark "FIRST|SECOND"] [--dry]');
  process.exit(1);
}
const NEW_SLUG = NEW_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!/^[a-z][a-z0-9-]*$/.test(NEW_SLUG)) {
  console.error(`the name "${NEW_NAME}" does not make a usable slug (got "${NEW_SLUG}")`);
  process.exit(1);
}
if (existsSync(join(ROOT, 'apps', NEW_SLUG))) {
  console.error(`apps/${NEW_SLUG} already exists`);
  process.exit(1);
}

/* the logo is two coloured halves, so it needs a split point */
const mark = (() => {
  if (markArg && markArg.includes('|')) {
    const [a, b] = markArg.split('|');
    return [a.toUpperCase(), b.toUpperCase()];
  }
  const up = NEW_NAME.toUpperCase();
  if (up.includes(' ')) { const i = up.indexOf(' '); return [up.slice(0, i), up.slice(i + 1)]; }
  const i = Math.ceil(up.length / 2);
  return [up.slice(0, i), up.slice(i)];
})();

const APP_OLD = join(ROOT, 'apps', OLD_SLUG);
if (!existsSync(APP_OLD)) { console.error(`apps/${OLD_SLUG} is not here; has it already been renamed?`); process.exit(1); }

/* ── every file that carries the name, minus the archive ──────────────────── */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === 'node_modules' || e === '.git' || e === 'out') continue;
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const TEXT = /\.(html|mjs|js|json|md|webmanifest|xml|css|txt|svg)$/;
const GENERATED = new Set(['apps/index.html', 'apps/catalogue.json',
                           'apps/sitemap.xml', 'apps/manifest.webmanifest']);

const targets = [
  ...walk(APP_OLD),
  join(ROOT, 'design', 'hub.mjs'),
  join(ROOT, 'design', 'privacy-facts.json'),
  join(ROOT, 'docs', `${OLD_NAME.toUpperCase()}-NOTES-2026-08-30.md`),
].filter((p) => existsSync(p) && TEXT.test(p))
 .filter((p) => !p.includes(join('docs', 'archive')))
 .filter((p) => !GENERATED.has(p.slice(ROOT.length + 1).split('\\').join('/')));

/* ── the substitutions, most specific first ───────────────────────────────── */
const rules = [
  /* the split logo, which no plain replace would catch */
  [`INK<em>BONES</em>`, `${mark[0]}<em>${mark[1]}</em>`],
  /* the notes doc points at the archive, which keeps its old name on purpose */
  [`docs/archive/${OLD_SLUG}/`, `docs/archive/${OLD_SLUG}/`],
  [OLD_NAME.toUpperCase(), NEW_NAME.toUpperCase()],
  [OLD_NAME, NEW_NAME],
  [OLD_SLUG, NEW_SLUG],
];

/* Some sentences have to keep saying the OLD name, because they are about the
   old name. "Inkbones collides with Inkbones Media" is true; rename it and it
   becomes a sentence claiming the new name collides with a studio that does not
   exist. Anything between the markers is lifted out, left alone, and put back. */
const KEEP_OPEN = '<!-- KEEP-OLD-NAME -->', KEEP_SHUT = '<!-- /KEEP-OLD-NAME -->';
function protect(text) {
  const kept = [];
  const out = text.replace(
    new RegExp(KEEP_OPEN + '[\\s\\S]*?' + KEEP_SHUT, 'g'),
    (m) => { kept.push(m); return `\u0000KEEP${kept.length - 1}\u0000`; });
  return [out, kept];
}
const restore = (text, kept) =>
  text.replace(/\u0000KEEP(\d+)\u0000/g, (_, i) => kept[+i]);

let changed = 0, edits = 0, protectedBlocks = 0;
for (const file of targets) {
  const before = readFileSync(file, 'utf8');
  const [masked, kept] = protect(before);
  protectedBlocks += kept.length;
  let after = masked;
  for (const [from, to] of rules) {
    if (from === to) continue;
    after = after.split(from).join(to);
  }
  after = restore(after, kept);
  if (after !== before) {
    changed++;
    edits += before.split(OLD_SLUG).length - 1 + (before.split(OLD_NAME).length - 1);
    if (!dry) writeFileSync(file, after);
  }
}

/* ── the folder and the notes file ────────────────────────────────────────── */
const moves = [
  [join('apps', OLD_SLUG), join('apps', NEW_SLUG)],
  [join('docs', `${OLD_NAME.toUpperCase()}-NOTES-2026-08-30.md`),
   join('docs', `${NEW_NAME.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-NOTES-2026-08-30.md`)],
];
for (const [from, to] of moves) {
  if (!existsSync(join(ROOT, from))) continue;
  if (dry) { console.log(`  would move ${from} -> ${to}`); continue; }
  try { execFileSync('git', ['mv', from, to], { cwd: ROOT }); }
  catch { execFileSync('mv', [from, to], { cwd: ROOT }); }
}

console.log(`${dry ? 'DRY RUN. ' : ''}${OLD_NAME} -> ${NEW_NAME}  (slug ${OLD_SLUG} -> ${NEW_SLUG})`);
console.log(`  logo split: ${mark[0]} + ${mark[1]}`);
console.log(`  ${changed} files rewritten, about ${edits} occurrences`);
console.log(`  ${protectedBlocks} block(s) left saying the old name on purpose, because they are about it`);
console.log(`  docs/archive/${OLD_SLUG}/ left alone on purpose: it is the prototype as it arrived`);
if (!dry) {
  console.log('\nNow, in this order:');
  console.log('  npm run design:build && node design/hub.mjs      regenerate the front door');
  console.log(`  node design/test-all.mjs ${NEW_SLUG}`);
  console.log('  node design/guards.mjs');
  console.log('\nThen delete this script. It only ever had one job.');
  console.log('\nThe paragraph in the notes explaining why the old name went still says');
  console.log('the old name, which is correct, because it is a sentence about that name.');
}
