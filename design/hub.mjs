#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — the hub page

   Generates apps/index.html: the front door to every app in the studio.

   The hub wears the SAME premium setup as the business card portfolio and
   the Lucid Winds landing (Stephen, 2026-08-19: "use the same setup as the
   virtual portfolio and the game studio" — the earlier flat-list hub with a
   gold border pass was not it). That means: near-black #0e1113, drifting
   aurora, Bricolage Grotesque display type, glassy 20px-radius cards, and a
   hero of Stephen's real thumbnails drifting in strips — the treatment the
   business card miniaturised and credited to "the apps landing page hero".
   Each card still carries its app's accent as the left spine; the colours
   come from design/out/palette.json so the wall can never drift from the
   pictures, and all art is read from disk, never regenerated.

     node design/hub.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const palette = JSON.parse(readFileSync(join(HERE, 'out', 'palette.json'), 'utf8'));

/* The catalogue. `find` holds the words someone would actually type looking
   for this — the filter matches against it, so "insurance" finds Home
   Inventory and "teacher" finds both school apps.

   A fifth field, 'shared', marks the apps whose whole point is that two
   phones see the same thing — which means the data lives on a server and
   the person who creates the board signs in. Those two facts are true and
   unavoidable, so the hub states them on the card rather than printing a
   blanket on-device promise it cannot keep. See findings/TRUST-COPY-CLOUD-APPS.md;
   the in-app copy was fixed there and this page was the half left behind. */
/* Hush ships from the arcade repo and lives at lucidwinds.com, so the hub
   links out to the app itself instead of hosting a copy. Its colours are
   read from the app's own CSS on lucidwinds.com/hush (--glow and --deep),
   not the studio palette; its thumb is Stephen's art mirrored from
   portal-assets/sws-thumbs/hush.png in the arcade repo. */
const OFFSITE = {
  hush: { href: 'https://lucidwinds.com/hush/', darkAccent: '#F2B872', accent: '#C87F3C' },
};

/* Two apps ship with their own full identities (paper notebook; gym poster)
   rather than a studio skin, so they are not in skins.mjs/palette.json. Their
   card accents are read from their own CSS, the same treatment Hush gets. */
const SELF_STYLED = {
  'cross-off': { darkAccent: '#F9E547', accent: '#B99B00' },
  'overload': { darkAccent: '#5C8AD4', accent: '#3F6DB5' },
  /* Astra Vault is a built Expo web export dropped into apps/astravault/
     (source repo: Stephenuffugus/astravault); colours from its own tokens. */
  'astravault': { darkAccent: '#60A5FA', accent: '#26356E' },
  /* Rock Stops (built as Float) carries its own mineral palette: agate
     amber on serpentine. Still gated for Stephen and Jessie's testing. */
  'rock-stops': { darkAccent: '#C9873B', accent: '#2E5C51' },
};

const CATALOGUE = [
  ['Family &amp; Home', [
    ['sitter-sheet', 'Sitter Sheet', 'Everything the babysitter needs, on one page', 'babysitter nanny childcare emergency contacts allergies'],
    ['baby-log', 'Baby Log', 'Feeds, sleep and nappies with one thumb at 3am', 'newborn infant feeding nursing diaper tracker night'],
    ['hush', 'Hush', 'A sleep sound machine, honest about the science', 'white noise sleep sound machine baby nursery newborn night bedtime settle offline'],
    ['pill-schedule', 'Pill Schedule', 'A large-print medication card for the fridge', 'medication meds prescription elderly dosage reminder'],
    ['caregiver-log', 'Caregiver Log', 'A shared notebook for the family caring at home', 'elderly parent hospice shift notes dementia care', 'shared'],
    ['grocery-list', 'Grocery List', 'One list the whole household can add to', 'shopping supermarket household share', 'shared'],
  ]],
  ['School', [
    ['specials-planner', 'Specials Planner', 'Art, music, PE, library. Plan the whole year once', 'teacher lesson plan rotation schedule elementary'],
    ['sub-plans', 'Sub Plans', 'Your substitute folder, ready before you are sick', 'teacher substitute emergency plans binder classroom'],
    ['grade-sheet', 'Grade Sheet', 'Grades for every class you teach, on this device only', 'gradebook grades teacher marks roster rubric report card averages specials elementary substitute homeschool'],
  ]],
  ['Events &amp; Groups', [
    /* "no account, ever" was false for the one person who makes the sheet —
       they sign in. True for everyone who signs up, which is the many. */
    ['signup-sheets', 'Signup Sheets', 'Claim a spot in seconds, no account needed', 'volunteer potluck conference slots roster shifts', 'shared'],
    ['team-parent', 'Team Parent', 'One link for the whole season', 'youth sports snack schedule roster coach league', 'shared'],
    ['secret-santa', 'Secret Santa', 'Draw names without the group-chat chaos', 'gift exchange christmas holiday office party'],
    ['wedding-timeline', 'Wedding Day Timeline', 'So nobody asks &ldquo;when is hair again?&rdquo;', 'wedding schedule vendors bridal party run of show'],
    ['seating-chart', 'Seating Chart', 'Tables, seats and who must not sit together', 'wedding reception banquet place cards floor plan'],
    ['bracket-maker', 'Bracket Maker', 'Game night, settled properly', 'tournament elimination playoff league office pool'],
    ['wheel-picker', 'Wheel Picker', 'Spin to choose. No ads spinning back', 'random name picker classroom raffle prize chore'],
  ]],
  ['Paper &amp; Files', [
    ['scan-to-pdf', 'Scan to PDF', 'No watermark, no ransom, no upload', 'scanner document camera receipt paperwork'],
    ['pdf-tools', 'PDF Tools', 'Merge, split and rotate. Nothing gets uploaded', 'combine pages reorder delete extract'],
    ['image-compressor', 'Image Compressor', 'Shrink photos without uploading them', 'resize optimise jpeg png file size email'],
    ['signature-maker', 'Signature Maker', 'Draw it once, use it everywhere', 'sign document esign transparent png contract'],
    ['qr-maker', 'QR Maker', 'Codes that never expire', 'qr code wifi menu flyer link generator'],
  ]],
  ['Moving &amp; Travel', [
    ['moving-boxes', 'Moving Boxes', 'Which box has the can opener?', 'move house packing labels inventory qr'],
    ['packing-list', 'Packing List', 'Never forget the charger again', 'travel trip suitcase checklist holiday'],
    ['home-inventory', 'Home Inventory', 'Photograph it before you need it', 'insurance claim contents valuables fire flood'],
  ]],
  ['Money', [
    ['bill-splitter', 'Bill Splitter', 'Split it, settle up, nothing leaves your device', 'split expenses group trip dinner iou owe'],
  ]],
  ['Body &amp; Mind', [
    ['cross-off', 'Cross Off', 'A paper list you cross off with real highlighters', 'todo to-do checklist tasks chores adhd highlighter timer focus race goblin satisfying'],
    ['overload', 'OVERLOAD', 'It writes your next workout. You just lift', 'gym workout lifting weights strength progressive overload plate math reps sets bodyweight fitness exercise'],
  ]],
  ['Night Sky', [
    ['astravault', 'Astra Vault', 'Scan the cosmos and collect the sky', 'stargazing astronomy stars planets moon meteor telescope constellation collect learn lessons bortle night sky space', 'beta'],
  ]],
  ['Outdoors', [
    ['rock-stops', 'Rock Stops', 'Every rock, fossil and sea glass find, logged where you stood', 'rockhounding rocks fossils sea glass minerals geology field log collection specimens beach camera gps', 'beta'],
  ]],
];

const card = ([slug, name, line, find, kind]) => {
  const p = palette[slug] || OFFSITE[slug] || SELF_STYLED[slug];
  const href = OFFSITE[slug] ? OFFSITE[slug].href : `./${slug}/`;
  /* "shared online" is searchable too — someone deciding whether to trust a
     list with the school run should be able to find the ones that leave the
     device by typing the thing they are worried about. */
  const tag = kind === 'shared'
    ? `<span class="tag">Shared online</span>`
    : kind === 'beta'
      ? `<span class="tag">In testing</span>`
      : '';
  const extra = kind === 'shared'
    ? ' shared online cloud server link'
    : kind === 'beta'
      ? ' beta in development testing'
      : '';
  /* Stephen's thumbnail art, when it exists on disk — falling back to the
     icon only until an app's art is filed. The art was silently dropped for
     icon.svg once (see git 36c52a6) and he rightly noticed; disk is the
     authority here so a regenerate can never lose it again. */
  /* ?v=2: the first thumb-256 generation was generic icons that were never
     cut from his stripe art (found 2026-08-17); images are cached for a week
     by firebase.json, so replacing the content requires a new URL. */
  /* v3: sub-plans' thumb content changed under the same URL when Stephen's
     real art replaced the folder placeholder (2026-08-17). */
  const art = existsSync(join(HERE, '..', 'apps', slug, 'marketing', 'thumb-256.png'))
    ? `./${slug}/marketing/thumb-256.png?v=4`
    : `./${slug}/icon.svg`;
  /* Per-card install: a page can only prompt for ITS OWN app, so the ⤓ opens
     the app with ?sws-install=1 and the app's studio-wide install affordance
     greets them as a banner instead of hiding in the footer. Only offered
     where that affordance actually exists in the app's HTML. */
  const installable = !OFFSITE[slug]
    && existsSync(join(HERE, '..', 'apps', slug, 'index.html'))
    && readFileSync(join(HERE, '..', 'apps', slug, 'index.html'), 'utf8').includes('swsInstall');
  const get = installable
    ? `
        <a class="getbtn" href="./${slug}/?sws-install=1" aria-label="Install ${name.replace(/"/g, '&quot;')}" title="Install this app">&#10515;</a>`
    : '';
  return `      <div class="card reveal" data-find="${name.toLowerCase()} ${line.replace(/&[a-z]+;/g, '').toLowerCase()} ${find}${extra}"
         style="--app:${p.darkAccent};--app-deep:${p.accent}">
        <a class="applink" href="${href}">
          <img class="swatch" src="${art}" alt="" width="64" height="64" loading="lazy" decoding="async">
          <span class="meta"><b>${name}</b><span>${line}</span>${tag}</span>
        </a>${get}
      </div>`;
};

const sections = CATALOGUE.map(([title, apps]) => `
    <section class="group" data-group>
      <div class="section-head reveal"><h2>${title}</h2></div>
      <div class="grid">
${apps.map(card).join('\n')}
      </div>
    </section>`).join('\n');

const count = CATALOGUE.reduce((n, [, a]) => n + a.length, 0);

/* Counted, never typed. The moment someone adds a shared app and hand-edits
   "nineteen" the page starts lying again, which is exactly how it got into
   this state the first time. */
const sharedCount = CATALOGUE.reduce((n, [, a]) => n + a.filter(x => x[4] === 'shared').length, 0);
const localCount = count - sharedCount;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] || String(n);
const Word = (n) => { const w = word(n); return w[0].toUpperCase() + w.slice(1); };

/* The hero strips: every app whose real thumbnail art exists on disk, split
   over two rows drifting opposite ways, each row doubled for the seamless
   -50% loop. Decorative (aria-hidden); the cards below carry the links. */
const thumbed = CATALOGUE.flatMap(([, apps]) => apps.map(a => a[0]))
  .filter(slug => existsSync(join(HERE, '..', 'apps', slug, 'marketing', 'thumb-256.png')));
const half = Math.ceil(thumbed.length / 2);
const stripImgs = slugs => slugs.map(s =>
  `<img src="./${s}/marketing/thumb-256.png?v=4" alt="" width="84" height="84" loading="lazy" decoding="async">`).join('');
const strips = `<div class="hero-strips" aria-hidden="true">
      <div class="apps-strip"><div class="apps-track">${stripImgs(thumbed.slice(0, half))}${stripImgs(thumbed.slice(0, half))}</div></div>
      <div class="apps-strip rev"><div class="apps-track">${stripImgs(thumbed.slice(half))}${stripImgs(thumbed.slice(half))}</div></div>
    </div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sky Wolf Studios: ${count} free, ad-free apps</title>
<meta name="description" content="${count} free utility apps from Sky Wolf Studios. No ads, no subscription, no tracking. ${localCount} keep everything on your device; the ${word(sharedCount)} shared ones say so.">
<meta name="theme-color" content="#0e1113">
<meta property="og:title" content="Sky Wolf Studios: ${count} free apps">
<meta property="og:description" content="${count} free, ad-free utilities: signup sheets, lesson planner, sub plans, PDF tools and more. ${localCount} keep everything on your device.">
<meta property="og:image" content="https://skywolfstudio.com/signup-sheets/marketing/stripe-thumbnail.png">
<meta property="og:url" content="https://skywolfstudio.com/">
<meta name="twitter:card" content="summary">
<link rel="icon" href="./qr-maker/icon.svg" type="image/svg+xml">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,500;12..96,700;12..96,800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<script>document.documentElement.classList.add('js');</script>
<style>
/* Generated by design/hub.mjs — edit the catalogue there, not here.
   Design language shared with the business card portfolio and the arcade:
   near-black, drifting aurora, Bricolage Grotesque, glassy cards. */
:root{
  color-scheme:dark;
  --bg:#0e1113; --surface:#161b1e; --ink:#eef0ea; --sub:#b8bfb6; --line:#262d30;
  --emerald:#46b98c; --emerald-deep:#1f6f54; --steel:#7fa3c9; --gold:#d9a441;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s7:32px; --s8:48px;
  --ease:cubic-bezier(.2,.7,.2,1);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%; scroll-behavior:smooth}
html,body{overflow-x:hidden}
body{
  margin:0; color:var(--ink);
  background:
    radial-gradient(900px 500px at 15% -5%, rgba(70,185,140,.10), transparent 60%),
    radial-gradient(800px 500px at 110% 30%, rgba(127,163,201,.09), transparent 60%),
    radial-gradient(700px 600px at 50% 110%, rgba(217,164,65,.06), transparent 60%),
    var(--bg);
  font-family:"Bricolage Grotesque",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  line-height:1.6; -webkit-font-smoothing:antialiased;
  padding-bottom:calc(var(--s8) + env(safe-area-inset-bottom));
}
.wrap{max-width:74rem; margin-inline:auto; padding-inline:max(var(--s5), env(safe-area-inset-left))}

/* ---------- drifting aurora ---------- */
.aurora{position:fixed; inset:0; z-index:-1; overflow:hidden; pointer-events:none}
.aurora span{position:absolute; border-radius:50%; filter:blur(100px)}
.aurora .a1{width:620px;height:620px;background:rgba(70,185,140,.14);top:-180px;left:-160px;animation:drift1 24s ease-in-out infinite}
.aurora .a2{width:520px;height:520px;background:rgba(127,163,201,.12);bottom:-160px;right:-140px;animation:drift2 28s ease-in-out infinite}
.aurora .a3{width:440px;height:440px;background:rgba(217,164,65,.09);top:44%;left:60%;animation:drift3 32s ease-in-out infinite}
@keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,50px) scale(1.12)}}
@keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-60px,-40px) scale(1.15)}}
@keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-50px,40px) scale(.9)}}

.skip{position:absolute;left:var(--s4);top:var(--s4);z-index:20;padding:var(--s3) var(--s4);
  background:var(--emerald);color:#06231a;border-radius:10px;font-weight:600;text-decoration:none;
  transform:translateY(-200%);transition:transform .2s var(--ease)}
.skip:focus-visible{transform:none}

/* ---------- hero ---------- */
header{padding:var(--s8) 0 var(--s5); text-align:center}
h1{
  font-weight:800; font-size:clamp(2.6rem,7vw,3.6rem);
  letter-spacing:-1.4px; line-height:.98; margin:0;
}
h1 .dot{color:var(--gold)}
.promise{
  display:inline-flex; align-items:center; gap:var(--s2); flex-wrap:wrap; justify-content:center;
  margin:var(--s4) auto 0; padding:var(--s3) var(--s5);
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); border-radius:999px;
  box-shadow:0 6px 20px rgba(0,0,0,.25);
  color:var(--sub); font-size:.9375rem;
}
.promise b{color:var(--ink); font-weight:600}
.promise svg{width:18px;height:18px;color:var(--emerald);flex:none}

/* Stephen's thumbnails on the move: the apps landing page hero itself,
   the treatment the business card borrowed in miniature */
.hero-strips{margin:var(--s6) auto 0; max-width:62rem}
.apps-strip{overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}
.apps-strip + .apps-strip{margin-top:12px}
.apps-track{display:flex; gap:12px; width:max-content; animation:apps-drift 55s linear infinite}
.apps-strip.rev .apps-track{animation-name:apps-drift-rev; animation-duration:70s}
.apps-track img{width:84px;height:84px;border-radius:18px;flex:none;display:block;
  border:1px solid rgba(255,255,255,.10); box-shadow:0 10px 26px rgba(0,0,0,.45)}
@keyframes apps-drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes apps-drift-rev{from{transform:translateX(-50%)}to{transform:translateX(0)}}

/* ---------- search ---------- */
.searchbar{position:sticky; top:0; z-index:10; padding:var(--s4) 0;
  background:linear-gradient(var(--bg) 72%, transparent); margin-bottom:var(--s3)}
.search{position:relative; max-width:32rem; margin-inline:auto}
.search input{
  width:100%; min-height:48px; padding:0 var(--s5) 0 44px;
  font-size:1rem; font-family:inherit; color:var(--ink);
  background:var(--surface); border:1px solid var(--line); border-radius:999px;
  box-shadow:0 6px 20px rgba(0,0,0,.25);
}
.search input::placeholder{color:var(--sub)}
.search svg{position:absolute; left:16px; top:50%; transform:translateY(-50%);
  width:18px; height:18px; color:var(--sub); pointer-events:none}
.search input:focus-visible{outline:2px solid var(--emerald); outline-offset:2px; border-color:var(--emerald)}

/* ---------- sections ---------- */
.group{margin-bottom:var(--s6)}
.section-head{display:flex; align-items:center; gap:12px; margin:38px 0 16px}
.section-head h2{
  font-size:20px; font-weight:700; letter-spacing:-.3px;
  color:var(--ink); white-space:nowrap; margin:0;
}
.section-head::after{
  content:""; flex:1; height:2px; border-radius:1px;
  background:linear-gradient(90deg, var(--emerald), var(--gold), var(--steel), transparent);
  opacity:.45;
}
.js .section-head::after{transform:scaleX(.15); transform-origin:left; transition:transform .9s var(--ease)}
.js .section-head.in::after{transform:scaleX(1)}
.grid{display:grid; gap:var(--s3); grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))}

/* ---------- cards ---------- */
.card{
  position:relative; display:flex;
  background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0)), var(--surface);
  border:1px solid rgba(255,255,255,.06); border-radius:20px;
  box-shadow:0 14px 44px rgba(0,0,0,.35);
  overflow:hidden;
  transition:border-color .14s var(--ease), transform .14s var(--ease), background .14s var(--ease);
}
/* The app's own accent, as a spine down the left edge. Twenty-nine of these
   in a grid is the portfolio's colour system stated in one glance. */
.card::before{
  content:''; position:absolute; inset:0 auto 0 0; width:3px; background:var(--app);
}
.card:hover{transform:translateY(-2px); border-color:var(--emerald); background:rgba(255,255,255,.05)}
.applink{
  display:flex; gap:var(--s4); align-items:flex-start; flex:1; min-width:0;
  padding:var(--s4) 52px var(--s4) var(--s4);
  text-decoration:none; color:inherit;
}
.applink:focus-visible{outline:2px solid var(--app); outline-offset:-2px; border-radius:20px}
.getbtn{
  position:absolute; top:10px; right:10px; width:36px; height:36px;
  display:flex; align-items:center; justify-content:center;
  border-radius:50%; border:1px solid rgba(255,255,255,.12);
  color:var(--sub); background:rgba(255,255,255,.03);
  text-decoration:none; font-size:16px; line-height:1;
  transition:color .12s ease, border-color .12s ease, background .12s ease;
}
.getbtn:hover{color:#fff; border-color:var(--emerald); background:var(--emerald-deep)}
.getbtn:focus-visible{outline:2px solid var(--emerald); outline-offset:2px}
.swatch{
  width:64px; height:64px; flex:none; border-radius:16px; margin-top:2px;
  background:var(--app-deep);
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 8px 22px rgba(0,0,0,.4);
  transition:transform .6s var(--ease);
}
.card:hover .swatch{transform:scale(1.06)}
.meta{display:block; min-width:0}
.meta b{display:block; font-size:1.0625rem; font-weight:700; letter-spacing:-.01em; margin-bottom:2px}
.meta span{display:block; color:var(--sub); font-size:.875rem; line-height:1.4}
/* Two classes deep on purpose: '.meta span' above is (0,1,1) and would
   otherwise win and force this back to a full-width block. */
.meta .tag{
  display:inline-block; margin-top:var(--s2); padding:2px var(--s2);
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:999px;
  color:var(--sub); font-family:"Space Mono",monospace; font-size:.6875rem; font-weight:700;
  letter-spacing:.04em; text-transform:uppercase; line-height:1.5;
}

/* ---------- scroll reveal ---------- */
.js .reveal{opacity:0; transform:translateY(26px);
  transition:opacity .7s var(--ease), transform .85s var(--ease); will-change:opacity,transform}
.js .reveal.in{opacity:1; transform:none}

.empty{display:none; text-align:center; color:var(--sub); padding:var(--s8) var(--s4)}
.empty.show{display:block}

/* ---------- footer ---------- */
footer{
  margin-top:var(--s8); padding-top:var(--s6); border-top:1px solid var(--line);
  text-align:center; color:var(--sub); font-size:.875rem; line-height:1.6;
}
footer a{color:var(--ink)}
footer a:hover{color:var(--emerald)}
footer .tip{color:var(--gold)}
.btn{
  display:inline-flex; align-items:center; gap:8px; padding:12px 22px;
  border-radius:999px; font-size:15px; font-weight:600; letter-spacing:.2px;
  text-decoration:none; cursor:pointer; font-family:inherit;
  border:1px solid rgba(255,255,255,.09); color:var(--ink); background:rgba(255,255,255,.04);
  box-shadow:0 6px 20px rgba(0,0,0,.25);
  transition:transform .12s ease, border-color .12s ease, background .12s ease;
}
.btn:hover{transform:translateY(-1px); border-color:var(--emerald); background:rgba(255,255,255,.07); color:var(--ink)}
.btn.primary{
  position:relative; overflow:hidden;
  background:linear-gradient(135deg, var(--emerald), var(--emerald-deep));
  color:#fff; border-color:transparent;
  box-shadow:0 8px 26px rgba(70,185,140,.28);
}
.btn.primary:hover{color:#fff}
.btn.primary::after{
  content:""; position:absolute; top:0; left:-130%; width:55%; height:100%;
  background:linear-gradient(100deg, transparent, rgba(255,255,255,.30), transparent);
  transform:skewX(-20deg); transition:left .7s ease; pointer-events:none;
}
.btn.primary:hover::after{left:150%}
.cta{margin:var(--s5) 0 0}

@media (prefers-reduced-motion:reduce){
  *{transition-duration:.01ms !important}
  .aurora span,.apps-track{animation:none !important}
  .card:hover,.btn:hover{transform:none}
  .js .reveal{opacity:1 !important; transform:none !important}
  .js .section-head::after{transform:none !important}
}
</style>
</head>
<body>
<div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
<a class="skip" href="#apps">Skip to the apps</a>
<div class="wrap">

  <header>
    <h1>Sky Wolf Studios<span class="dot">.</span></h1>
    <p class="promise">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span><b>No ads. No subscription. No tracking.</b> ${Word(localCount)} keep everything on your device. The ${word(sharedCount)} shared ones are marked.</span>
    </p>
    <p class="cta"><button class="btn primary" id="installStudio" hidden>&#10515; Save the studio to your home screen</button></p>
    ${strips}
  </header>

  <div class="searchbar">
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label class="sr-only" for="q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search the apps</label>
      <input id="q" type="search" placeholder="Search ${count} apps. Try &ldquo;teacher&rdquo; or &ldquo;insurance&rdquo;" autocomplete="off">
    </div>
  </div>

  <main id="apps">
${sections}

    <p class="empty" id="noResults">Nothing matches that. <button type="button" id="clearSearch" style="background:none;border:0;color:var(--teal);font:inherit;cursor:pointer;text-decoration:underline">Show all ${count} apps</button></p>
  </main>

  <footer>
    <p>Every app here is free and always will be. If one saved your day, each has a tip jar. <span class="tip">&#9829;</span></p>
    <p style="margin-top:16px"><a class="btn" href="https://lucidwinds.com/portal">&#127918; We make games too. Play free in the Arcade</a></p>
    <p style="margin-top:12px"><a href="mailto:stephenfurpahs@gmail.com?subject=Sky%20Wolf%20Studios%20Apps%20feedback">Send feedback</a></p>
    <p style="margin-top:20px">Sky Wolf Studios &middot; SWS Strategic Media LLC</p>
  </footer>
</div>

<script>
/* Live filter. Twenty-three cards is past the point where scanning is pleasant,
   and the whole brief for these apps is "easy to find, easy to use". */
(function(){
  var q = document.getElementById('q');
  var cards = [].slice.call(document.querySelectorAll('.card'));
  var groups = [].slice.call(document.querySelectorAll('[data-group]'));
  var none = document.getElementById('noResults');

  function apply(){
    var term = q.value.trim().toLowerCase();
    var hits = 0;
    cards.forEach(function(c){
      var show = !term || c.dataset.find.indexOf(term) !== -1;
      c.style.display = show ? '' : 'none';
      if (show) hits++;
    });
    // hide a category heading once everything under it is filtered out
    groups.forEach(function(g){
      var any = [].slice.call(g.querySelectorAll('.card')).some(function(c){ return c.style.display !== 'none'; });
      g.style.display = any ? '' : 'none';
    });
    none.classList.toggle('show', hits === 0);
  }

  q.addEventListener('input', apply);
  q.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ q.value = ''; apply(); } });
  document.getElementById('clearSearch').addEventListener('click', function(){ q.value = ''; apply(); q.focus(); });

  // "/" focuses search, the convention everywhere else on the web
  document.addEventListener('keydown', function(e){
    if (e.key === '/' && document.activeElement !== q){ e.preventDefault(); q.focus(); }
  });
})();
</script>
<script>
/* Scroll reveal, same feel as the portfolio. The .js gate on <html> means a
   browser with no JS (or no IntersectionObserver) shows everything plainly. */
(function(){
  var els = [].slice.call(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)){ els.forEach(function(el){ el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: .08 });
  els.forEach(function(el){ io.observe(el); });
})();
</script>
<script>
/* The studio install button, up top where Stephen wants it. Always visible
   when the page is not already installed: Chrome hands over the real prompt,
   iOS gets Share-sheet directions, everything else gets its menu path. */
(function(){
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  var evt = null;
  var b = document.getElementById('installStudio');
  b.hidden = false;
  addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); evt = e; });
  b.addEventListener('click', function(){
    if (evt){ evt.prompt(); return; }
    if (/iPhone|iPad/.test(navigator.userAgent)){
      alert('To install: tap the Share button, then "Add to Home Screen".'); return;
    }
    alert('To install: open your browser menu and choose "Install app" or "Add to Home Screen".');
  });
})();
</script>
</body>
</html>
`;

writeFileSync(join(HERE, '..', 'apps', 'index.html'), html);
console.log(`Wrote apps/index.html — ${count} apps, ${CATALOGUE.length} categories`);
