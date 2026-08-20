#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, the privacy page, one per app

   Google Play will not accept a listing without a reachable privacy policy
   URL, and the Data Safety form has to match what the page says. Twenty of
   the twenty-three apps had no page at all.

   Writing 23 of these by hand guarantees they drift apart, and a privacy
   policy that contradicts a sibling app is worse than none, it is the exact
   thing that makes a reviewer look harder. So the page is generated: the
   structure and the promises are invariant, and the app-specific facts come
   from privacy-facts.json, which is derived by reading each app's actual code
   rather than assuming the brand promise holds.

     node design/privacy.mjs          write every page
     node design/privacy.mjs --check  report which apps lack facts
     node design/privacy.mjs qr-maker limit to one app

   The page is skinned from palette.json, so an app's privacy page looks like
   that app rather than like a legal document someone bolted on. That is not
   decoration: the page has to be believable, and a page that looks nothing
   like the app it belongs to reads as boilerplate.

   THE RULE THIS FILE ENFORCES: an app whose facts say data leaves the device
   never gets the on-device paragraph. There is one template with two honest
   branches, and no way to accidentally give a Firebase-backed app the
   nothing-leaves-your-device text.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS, VOICES } from './skins.mjs';
import { oklch, contrast } from './color.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const FACTS = join(HERE, 'privacy-facts.json');

const palette = JSON.parse(readFileSync(join(HERE, 'out', 'palette.json'), 'utf8'));
const facts = existsSync(FACTS) ? JSON.parse(readFileSync(FACTS, 'utf8')) : {};

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const only = argv.filter((a) => !a.startsWith('--'));
const slugs = Object.keys(SKINS).filter((s) => !only.length || only.includes(s));

const CONTACT = 'stephenfurpahs@gmail.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Ink solved against the app's own canvas rather than picked, the same way the
   design system solves every other text colour. A privacy page that fails
   contrast is a bad look on a page whose entire job is being trustworthy. */
function solveInk(slug, target) {
  const skin = SKINS[slug];
  const bg = palette[slug].canvas;
  let L = 0.45;
  let c = oklch(L, skin.chroma * 0.5, skin.hue);
  while (L > 0.12 && contrast(c, bg) < target) { L -= 0.02; c = oklch(L, skin.chroma * 0.5, skin.hue); }
  return c;
}
function solveInkDark(slug, target) {
  const skin = SKINS[slug];
  const bg = palette[slug].darkCanvas;
  let L = 0.72;
  let c = oklch(L, skin.chroma * 0.4, skin.hue);
  while (L < 0.98 && contrast(c, bg) < target) { L += 0.02; c = oklch(L, skin.chroma * 0.4, skin.hue); }
  return c;
}

function page(slug) {
  const f = facts[slug];
  if (!f) return null;

  const skin = SKINS[slug];
  const pal = palette[slug];
  const voice = VOICES[skin.voice];
  const mf = JSON.parse(readFileSync(join(APPS, slug, 'manifest.webmanifest'), 'utf8'));
  const name = mf.name.split(/[—-]/)[0].trim();

  const ink = solveInk(slug, 11);
  const muted = solveInk(slug, 4.6);
  const inkD = solveInkDark(slug, 11);
  const mutedD = solveInkDark(slug, 4.6);
  const line = oklch(0.88, skin.chroma * 0.4, skin.hue);
  const lineD = oklch(0.30, skin.chroma * 0.4, skin.hue);

  const leaves = f.leavesDevice && !/^(no|none|nothing)\b/i.test(String(f.leavesDevice).trim());

  /* ── the one section that must never be wrong ─────────────────────────── */
  const whereItGoes = leaves
    ? `<h2>Where your data goes</h2>
  <p>${esc(f.storesWhat)} is kept ${esc(f.storageMechanism)}.</p>
  <p><strong>Some of it does leave this device, and we would rather say so plainly than bury it.</strong> ${esc(f.leavesDevice)}</p>
  <p>That is the trade this app makes: sharing with other people needs a copy somewhere both of you can reach. Everything else about the promise still holds, no advertising, no analytics, no profile built about you, and nothing sold to anyone.</p>`
    : `<h2>Where your data goes</h2>
  <p>Nowhere. ${esc(f.storesWhat)} is kept ${esc(f.storageMechanism)}.</p>
  <p>There is no upload, no server-side processing, no account, and no copy held anywhere we can reach. We could not hand your data to anyone if we were asked for it, because we do not have it.</p>`;

  /* Most verifyTips already send the reader to DevTools. Appending the generic
     version on top of one produces the same instruction twice in a row, which
     on a page whose whole job is credibility reads as boilerplate. */
  const saysDevtools = /devtools|developer tools|network tab|network panel/i.test(f.verifyTip ?? '');
  const verify = f.verifyTip
    ? `<h2>How to check that for yourself</h2>
  <p>${esc(f.verifyTip)}</p>` + (saysDevtools ? '' : `
  <p>If you would rather look directly: open your browser's developer tools, go to the Network tab, and use the app. ${leaves ? 'You will see requests only when you deliberately share or open a shared link.' : 'You will see no requests while you work.'}</p>`)
    : '';

  const third = (f.thirdParties || []).length
    ? `<h2>Who else is involved</h2>
  <ul>${(f.thirdParties || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';

  const perms = (f.permissions || []).filter((p) => p && !/^none$/i.test(p));
  const permission = perms.length
    ? `<h2>Permissions</h2>
  <p>The app asks for ${perms.map(esc).join(', ')}, and only at the moment you use the feature that needs it. Your browser asks you, not us, and you can refuse, the rest of the app keeps working.</p>`
    : `<h2>Permissions</h2>
  <p>None. The app asks for no camera, no microphone, no location, no contacts and no notifications.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${pal.accentDeep}">
<meta name="description" content="Privacy and accessibility for ${esc(name)}, ${esc(f.oneLine)}">
<title>Privacy &amp; Accessibility: ${esc(name)}</title>
<link rel="icon" href="icon.svg" type="image/svg+xml">
<style>
  :root{--bg:${pal.canvas};--ink:${ink};--muted:${muted};--line:${line};--accent:${pal.accentDeep}}
  @media (prefers-color-scheme: dark){
    :root{--bg:${pal.darkCanvas};--ink:${inkD};--muted:${mutedD};--line:${lineD};--accent:${pal.darkAccent}}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:0 16px 56px}
  main{max-width:640px;margin:0 auto}
  h1{font-family:${voice.display};font-weight:${voice.weight};letter-spacing:${voice.tracking};font-size:26px;margin:36px 0 4px}
  h2{font-size:18px;margin:28px 0 6px}
  p{margin:8px 0}
  ul{margin:8px 0;padding-left:22px}
  a{color:var(--accent)}
  .lede{color:var(--muted)}
  .back{display:inline-block;margin-top:28px;font-weight:600;min-height:44px;line-height:44px}
  hr{border:none;border-top:1px solid var(--line);margin:30px 0}
  footer{margin-top:36px;font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<main>
  <a class="back" href="./">&larr; Back to ${esc(name)}</a>
  <h1>Privacy &amp; Accessibility</h1>
  <p class="lede">${esc(name)} is ${esc(f.oneLine)} It is free, carries no ads, and is made by Sky Wolf Studio.</p>

  ${whereItGoes}

  ${verify}

  <h2>What we do not do</h2>
  <ul>
    <li>No account, no sign-in, no email address collected.</li>
    <li>No ads, no analytics, no advertising trackers, no cookies, no fingerprinting.</li>
    <li>No selling, sharing or brokering of anything you type here. There is no data to sell.</li>
    <li>No paywall, no trial, no subscription, no watermark, no export limit.</li>
  </ul>

  ${permission}

  ${third}

  <h2>Tips</h2>
  <p>The tip jar links out to a checkout page hosted by the payment provider on their own site. We never see or store card details. Tipping changes nothing in the app, every feature is free either way.</p>

  <h2>Hosting</h2>
  <p>The app's files are served by Google's Firebase Hosting, which, like any web host, keeps standard, short-lived server logs such as IP addresses, for security and operations. That log records that a browser fetched a page. ${leaves ? 'It is separate from the shared data described above.' : 'It cannot record anything you type, because what you type is never sent to the host.'}</p>

  <h2>Children</h2>
  <p>This app is made for adults. It is not directed at children, and it collects no personal information from anyone, of any age.</p>

  <h2>Accessibility</h2>
  <p>We aim for <strong>WCAG 2.1 AA</strong>: labelled fields, keyboard-operable controls that keep their focus when the page redraws, visible focus rings, 44px touch targets that grow with the text-size setting, screen-reader announcements for changes, and colour contrast checked by build-time solver in both light and dark mode. The display panel in the header sets text size, spacing, contrast, reading style and motion, and those settings follow you across all of our apps.</p>
  <p>If anything gets in your way, email us and we will fix it: <a href="mailto:${CONTACT}?subject=Accessibility%3A%20${encodeURIComponent(name)}">${CONTACT}</a>.</p>

  <h2>Changes</h2>
  <p>If this policy ever changes in a way that affects what happens to your data, the change will appear here and the date below will move.</p>

  <hr>
  <footer>
    <p>Sky Wolf Studio · SWS Strategic Media LLC · <a href="mailto:${CONTACT}">${CONTACT}</a></p>
    <p>Last updated ${new Date().toISOString().slice(0, 10)}.</p>
  </footer>
</main>
</body>
</html>
`;
}

/* Play requires the privacy policy to be reachable from inside the app itself,
   not only from the Console listing field, and in a TWA "inside the app" is
   this page. The colophon already carries the studio link and Feedback, so the
   policy goes in the same row, in the same voice, rather than becoming a new
   piece of chrome. Idempotent: an app that already links it is left alone. */
function linkFromColophon(slug) {
  const p = join(APPS, slug, 'index.html');
  if (!existsSync(p)) return 'no index.html';
  let html = readFileSync(p, 'utf8');
  if (/href="\.?\/?privacy\.html"/.test(html)) return 'already linked';

  /* Anchor on the Feedback mailto and insert ahead of it, copying whatever
     inline style its siblings use so the link cannot end up the one
     differently-coloured word in the footer.

     Two constraints learned the hard way. The colophon is not always literal
     markup, bill-splitter builds it in JS as a single-quoted string inside
     applyConfig(), so the match cannot require a <footer> tag around it, and
     the inserted text must contain NO NEWLINE, or it terminates that string
     literal and takes the whole app's script down with it. Keep this on one
     line however tempting it is to wrap. */
  const re = /(<a\s+href="mailto:[^"]*"([^>]*)>Feedback<\/a>)/;
  const m = html.match(re);
  if (!m) return 'no Feedback link found to anchor on';

  const style = /style="[^"]*"/.exec(m[2] || '')?.[0];
  const link = `<a href="privacy.html"${style ? ' ' + style : ''}>Privacy</a> &middot; `;
  html = html.replace(re, `${link}$1`);
  writeFileSync(p, html);
  return 'linked';
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const missing = slugs.filter((s) => !facts[s]);

if (check) {
  if (!existsSync(FACTS)) { console.log('no design/privacy-facts.json yet'); process.exit(1); }
  if (missing.length) {
    console.log(`\n${missing.length} app(s) have no facts:\n`);
    for (const m of missing) console.log('  ' + m);
    process.exit(1);
  }
  console.log(`\nfacts present for all ${slugs.length} app(s)\n`);
  process.exit(0);
}

let n = 0;
const links = {};
for (const slug of slugs) {
  const html = page(slug);
  if (!html) continue;
  writeFileSync(join(APPS, slug, 'privacy.html'), html);
  links[slug] = linkFromColophon(slug);
  n++;
}

console.log(`${n} privacy page(s) written`);
const tally = {};
for (const v of Object.values(links)) tally[v] = (tally[v] ?? 0) + 1;
for (const [k, v] of Object.entries(tally)) console.log(`  in-app link: ${v} ${k}`);
for (const [s, v] of Object.entries(links)) {
  if (v !== 'linked' && v !== 'already linked') console.log(`  !! ${s}: ${v}`);
}
if (missing.length) {
  console.log(`${missing.length} skipped for want of facts: ${missing.join(', ')}`);
}
