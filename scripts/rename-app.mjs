#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Rename an app in this fleet.

   Written to retire the working title Inkbones, which collided with a live
   graphic design studio of the same name, and kept general because this fleet
   renames things: Rock Stops was built as Float and Music Studio arrived from
   the arcade under another name. A rename touches the folder, the slug, the
   storage keys, the build tag, the worker cache, the logo, the hub registration,
   the privacy facts and the notes doc, and missing one of those is the kind of
   thing nobody notices until a child's saved work does not load.

     node scripts/rename-app.mjs comic-crew "Panel Book"
     node scripts/rename-app.mjs comic-crew "Panel Book" --mark "PANEL|BOOK"
     node scripts/rename-app.mjs comic-crew "Panel Book" --dry

   The slug is derived from the name: lower case, spaces to hyphens. The mark is
   the logo in the top bar, which is two coloured halves, so give it as
   "FIRST|SECOND" if the split is not obvious. Default splits a single word in
   the middle and a two word name at the space.

   WHAT IT DELIBERATELY DOES NOT TOUCH:
   - anything under docs/archive/, which records things as they actually were.
     Renaming an archive makes the record false.
   - apps/index.html, apps/catalogue.json, apps/sitemap.xml and
     apps/manifest.webmanifest, which are generated. Run the hub afterwards, as
     this script reminds you.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const markArg = (() => { const i = argv.indexOf('--mark'); return i >= 0 ? argv[i + 1] : null; })();
const positional = argv.filter((a) => !a.startsWith('--') && a !== markArg);
const OLD_SLUG = positional[0];
const NEW_NAME = positional[1];

if (!OLD_SLUG || !NEW_NAME) {
  console.error('usage: node scripts/rename-app.mjs <old-slug> "New Name" [--mark "FIRST|SECOND"] [--dry]');
  process.exit(1);
}
/* the display name as it appears in prose, derived from the slug: comic-crew
   becomes Comic Crew, which is how every app in this fleet is written */
const OLD_NAME = OLD_SLUG.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
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

/* find the existing logo split so it can be replaced whatever it currently is */
function oldMarkHtml() {
  const f = join(ROOT, 'apps', OLD_SLUG, 'index.html');
  if (!existsSync(f)) return '\u0000none\u0000';
  const m = /class="mark">([A-Z ]*)<em>([A-Z ]*)<\/em>/.exec(readFileSync(f, 'utf8'));
  return m ? `${m[1]}<em>${m[2]}</em>` : '\u0000none\u0000';
}

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
  ...readdirSync(join(ROOT, 'docs'))
    .filter((f) => f.startsWith(`${OLD_SLUG.toUpperCase()}-NOTES`) ||
                   f.startsWith(`${OLD_NAME.toUpperCase().replace(/ /g, '-')}-NOTES`))
    .map((f) => join(ROOT, 'docs', f)),
].filter((p) => existsSync(p) && TEXT.test(p))
 .filter((p) => !p.includes(join('docs', 'archive')))
 .filter((p) => !GENERATED.has(p.slice(ROOT.length + 1).split('\\').join('/')));

/* The test hook is a JavaScript identifier, so it cannot carry the hyphen a two
   word slug has: window.__comic-crew is a syntax error, not a name. This is the
   one place the slug is code rather than a string, and it has to be substituted
   BEFORE the general slug rule gets to it. */
const JS_ID = NEW_SLUG.replace(/-/g, '');
const OLD_JS_ID = OLD_SLUG.replace(/-/g, '');

/* ── the substitutions, most specific first ───────────────────────────────── */
const rules = [
  [`__${OLD_JS_ID}`, `__${JS_ID}`],
  [`__${OLD_SLUG}`, `__${JS_ID}`],
  /* the split logo, which no plain replace would catch: it is two coloured
     halves with a tag between them */
  [oldMarkHtml(), `${mark[0]}<em>${mark[1]}</em>`],
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
const oldDocPrefix = OLD_NAME.toUpperCase().replace(/ /g, '-');
const newDocPrefix = NEW_NAME.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
const moves = [
  [join('apps', OLD_SLUG), join('apps', NEW_SLUG)],
  ...readdirSync(join(ROOT, 'docs'))
    .filter((f) => f.startsWith(`${oldDocPrefix}-NOTES`))
    .map((f) => [join('docs', f), join('docs', f.replace(oldDocPrefix, newDocPrefix))]),
];
for (const [from, to] of moves) {
  if (!existsSync(join(ROOT, from))) continue;
  if (dry) { console.log(`  would move ${from} -> ${to}`); continue; }
  try { execFileSync('git', ['mv', from, to], { cwd: ROOT }); }
  catch { execFileSync('mv', [from, to], { cwd: ROOT }); }
}

console.log(`${dry ? 'DRY RUN. ' : ''}${OLD_NAME} -> ${NEW_NAME}  (slug ${OLD_SLUG} -> ${NEW_SLUG})`);
console.log(`  logo split: ${mark[0]} + ${mark[1]}`);
console.log(`  test hook:  window.__${JS_ID}`);
console.log(`  ${changed} files rewritten, about ${edits} occurrences`);
console.log(`  ${protectedBlocks} block(s) left saying the old name on purpose, because they are about it`);
console.log('  docs/archive/ left alone on purpose: it records things as they were');
if (!dry) {
  console.log('\nNow, in this order:');
  console.log('  npm run design:build && node design/hub.mjs      regenerate the front door');
  console.log(`  node design/test-all.mjs ${NEW_SLUG}`);
  console.log('  node design/guards.mjs');
  console.log('\nThen read the user facing copy once with your own eyes. A rename');
  console.log('cannot hear grammar: "an Inkbones character" became "an Comic Crew');
  console.log('character" the first time this ran, and only a person caught it.');

  console.log('\nThe paragraph in the notes explaining why the old name went still says');
  console.log('the old name, which is correct, because it is a sentence about that name.');
}
