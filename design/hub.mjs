#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — the hub page

   Generates apps/index.html: the front door to every app in the studio.

   The hub deliberately does NOT wear an app skin. The apps are the pictures;
   this is the wall they hang on, so it stays in the studio's own dark palette
   and lets each card carry its app's accent. Seeing 23 accents laid out in a
   grid is the clearest possible statement of "one studio, different products",
   and the colours come from design/out/palette.json so the wall can never
   drift from the pictures.

     node design/hub.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
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
const CATALOGUE = [
  ['Family &amp; Home', [
    ['sitter-sheet', 'Sitter Sheet', 'Everything the babysitter needs, on one page', 'babysitter nanny childcare emergency contacts allergies'],
    ['baby-log', 'Baby Log', 'Feeds, sleep and nappies — one thumb, 3am', 'newborn infant feeding nursing diaper tracker night'],
    ['pill-schedule', 'Pill Schedule', 'A large-print medication card for the fridge', 'medication meds prescription elderly dosage reminder'],
    ['caregiver-log', 'Caregiver Log', 'A shared notebook for the family caring at home', 'elderly parent hospice shift notes dementia care', 'shared'],
    ['grocery-list', 'Grocery List', 'One list the whole household can add to', 'shopping supermarket household share', 'shared'],
  ]],
  ['School', [
    ['specials-planner', 'Specials Planner', 'Art, music, PE, library — plan the year once', 'teacher lesson plan rotation schedule elementary'],
    ['sub-plans', 'Sub Plans', 'Your substitute folder, ready before you are sick', 'teacher substitute emergency plans binder classroom'],
    ['grade-sheet', 'Grade Sheet', 'Grades for every class you teach, on this device only', 'gradebook grades teacher marks roster rubric report card averages specials elementary substitute homeschool'],
  ]],
  ['Events &amp; Groups', [
    /* "no account, ever" was false for the one person who makes the sheet —
       they sign in. True for everyone who signs up, which is the many. */
    ['signup-sheets', 'Signup Sheets', 'Claim a spot in seconds — signing up needs no account', 'volunteer potluck conference slots roster shifts', 'shared'],
    ['team-parent', 'Team Parent', 'One link for the whole season', 'youth sports snack schedule roster coach league', 'shared'],
    ['secret-santa', 'Secret Santa', 'Draw names without the group-chat chaos', 'gift exchange christmas holiday office party'],
    ['wedding-timeline', 'Wedding Day Timeline', 'So nobody asks &ldquo;when is hair again?&rdquo;', 'wedding schedule vendors bridal party run of show'],
    ['seating-chart', 'Seating Chart', 'Tables, seats and who must not sit together', 'wedding reception banquet place cards floor plan'],
    ['bracket-maker', 'Bracket Maker', 'Game night, settled properly', 'tournament elimination playoff league office pool'],
    ['wheel-picker', 'Wheel Picker', 'Spin to choose — no ads spinning back', 'random name picker classroom raffle prize chore'],
  ]],
  ['Paper &amp; Files', [
    ['scan-to-pdf', 'Scan to PDF', 'No watermark, no ransom, no upload', 'scanner document camera receipt paperwork'],
    ['pdf-tools', 'PDF Tools', 'Merge, split, rotate — nothing uploaded', 'combine pages reorder delete extract'],
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
];

const card = ([slug, name, line, find, kind]) => {
  const p = palette[slug];
  /* "shared online" is searchable too — someone deciding whether to trust a
     list with the school run should be able to find the ones that leave the
     device by typing the thing they are worried about. */
  const tag = kind === 'shared'
    ? `<span class="tag">Shared online</span>`
    : '';
  const extra = kind === 'shared' ? ' shared online cloud server link' : '';
  return `      <a class="card" href="./${slug}/" data-find="${name.toLowerCase()} ${line.replace(/&[a-z]+;/g, '').toLowerCase()} ${find}${extra}"
         style="--app:${p.darkAccent};--app-deep:${p.accent}">
        <img class="swatch" src="./${slug}/icon.svg" alt="" width="38" height="38" loading="lazy" decoding="async">
        <span class="meta"><b>${name}</b><span>${line}</span>${tag}</span>
      </a>`;
};

const sections = CATALOGUE.map(([title, apps]) => `
    <section class="group" data-group>
      <h2>${title}</h2>
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

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sky Wolf Studios — ${count} free, ad-free apps</title>
<meta name="description" content="${count} free utility apps from Sky Wolf Studios. No ads, no subscription, no tracking. ${localCount} keep everything on your device; the ${word(sharedCount)} shared ones say so.">
<meta name="theme-color" content="#16171c">
<meta property="og:title" content="Sky Wolf Studios — ${count} free apps">
<meta property="og:description" content="${count} free, ad-free utilities: signup sheets, lesson planner, sub plans, PDF tools and more. ${localCount} keep everything on your device.">
<meta property="og:image" content="https://sws-apps-9646d.web.app/signup-sheets/marketing/stripe-thumbnail.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="./qr-maker/icon.svg" type="image/svg+xml">
<style>
/* Generated by design/hub.mjs — edit the catalogue there, not here. */
@font-face{
  font-family:'Fraunces';font-style:normal;font-weight:500 700;font-display:swap;
  src:url(specials-planner/fonts/fraunces-latin.woff2) format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
:root{
  color-scheme:dark;
  --bg:#16171c; --bg-2:#1c1e24; --surface:#212430; --line:#2e3240; --line-2:#454b5e;
  --ink:#eceef4; --ink-2:#a7adbe; --ink-3:#7f8698;
  --cream:#f2e3c1; --teal:#4fd1e0;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s7:32px; --s8:48px;
  --r:14px;
  --ease:cubic-bezier(.32,.72,0,1);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:1rem/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
  background-image:
    radial-gradient(60rem 32rem at 8% -8%, rgba(79,209,224,.07), transparent 60%),
    radial-gradient(52rem 30rem at 96% 0%, rgba(242,227,193,.05), transparent 55%);
  background-attachment:fixed;
  padding-bottom:calc(var(--s8) + env(safe-area-inset-bottom));
}
.wrap{max-width:74rem; margin-inline:auto; padding-inline:max(var(--s5), env(safe-area-inset-left))}

.skip{position:absolute;left:var(--s4);top:var(--s4);z-index:20;padding:var(--s3) var(--s4);
  background:var(--teal);color:#06222a;border-radius:10px;font-weight:600;text-decoration:none;
  transform:translateY(-200%);transition:transform .2s var(--ease)}
.skip:focus-visible{transform:none}

header{padding:var(--s8) 0 var(--s6); text-align:center}
h1{
  font-family:'Fraunces',Georgia,serif; font-weight:600;
  font-size:clamp(2rem,6vw,3rem); line-height:1.05; letter-spacing:-.02em;
  margin:0 0 var(--s3); color:var(--cream); text-wrap:balance;
}
.promise{
  display:inline-flex; align-items:center; gap:var(--s2); flex-wrap:wrap; justify-content:center;
  margin:0 auto; padding:var(--s3) var(--s5);
  background:var(--surface); border:1px solid var(--line); border-radius:999px;
  color:var(--ink-2); font-size:.9375rem;
}
.promise b{color:var(--ink); font-weight:600}
.promise svg{width:18px;height:18px;color:var(--teal);flex:none}

.searchbar{position:sticky; top:0; z-index:10; padding:var(--s4) 0;
  background:linear-gradient(var(--bg) 72%, transparent); margin-bottom:var(--s3)}
.search{position:relative; max-width:32rem; margin-inline:auto}
.search input{
  width:100%; min-height:48px; padding:0 var(--s5) 0 44px;
  font-size:1rem; font-family:inherit; color:var(--ink);
  background:var(--bg-2); border:1px solid var(--line-2); border-radius:999px;
}
.search input::placeholder{color:var(--ink-3)}
.search svg{position:absolute; left:16px; top:50%; transform:translateY(-50%);
  width:18px; height:18px; color:var(--ink-3); pointer-events:none}
.search input:focus-visible{outline:2px solid var(--teal); outline-offset:2px; border-color:var(--teal)}

.group{margin-bottom:var(--s7)}
.group h2{
  font-size:.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em;
  color:var(--ink-3); margin:0 0 var(--s4);
}
.grid{display:grid; gap:var(--s3); grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))}

a.card{
  position:relative; display:flex; gap:var(--s4); align-items:flex-start;
  padding:var(--s4) var(--s5) var(--s4) var(--s4);
  background:var(--surface); border:1px solid var(--line); border-radius:var(--r);
  text-decoration:none; color:inherit; overflow:hidden;
  transition:border-color .14s var(--ease), transform .14s var(--ease), background .14s var(--ease);
}
/* The app's own accent, as a spine down the left edge. Twenty-three of these
   in a grid is the portfolio's colour system stated in one glance. */
a.card::before{
  content:''; position:absolute; inset:0 auto 0 0; width:3px; background:var(--app);
}
a.card:hover{transform:translateY(-2px); border-color:var(--app); background:#242835}
a.card:focus-visible{outline:2px solid var(--app); outline-offset:2px}
.swatch{
  width:38px; height:38px; flex:none; border-radius:11px; margin-top:2px;
  background:var(--app-deep);
}
.meta{display:block; min-width:0}
.meta b{display:block; font-size:1.0625rem; font-weight:600; letter-spacing:-.01em; margin-bottom:2px}
.meta span{display:block; color:var(--ink-2); font-size:.875rem; line-height:1.4}
/* Two classes deep on purpose: '.meta span' above is (0,1,1) and would
   otherwise win and force this back to a full-width block. */
.meta .tag{
  display:inline-block; margin-top:var(--s2); padding:2px var(--s2);
  background:var(--bg-2); border:1px solid var(--line-2); border-radius:999px;
  color:var(--ink-2); font-size:.6875rem; font-weight:600;
  letter-spacing:.04em; text-transform:uppercase; line-height:1.5;
}

.empty{display:none; text-align:center; color:var(--ink-2); padding:var(--s8) var(--s4)}
.empty.show{display:block}

footer{
  margin-top:var(--s8); padding-top:var(--s6); border-top:1px solid var(--line);
  text-align:center; color:var(--ink-3); font-size:.875rem; line-height:1.6;
}
footer a{color:var(--ink-2)}
footer a:hover{color:var(--teal)}
footer .tip{color:var(--ink-2)}

@media (prefers-reduced-motion:reduce){
  *{transition-duration:.01ms !important}
  a.card:hover{transform:none}
}
</style>
</head>
<body>
<a class="skip" href="#apps">Skip to the apps</a>
<div class="wrap">

  <header>
    <h1>Sky Wolf Studios</h1>
    <p class="promise">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span><b>No ads. No subscription. No tracking.</b> ${Word(localCount)} keep everything on your device &mdash; the ${word(sharedCount)} shared ones are marked.</span>
    </p>
  </header>

  <div class="searchbar">
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label class="sr-only" for="q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search the apps</label>
      <input id="q" type="search" placeholder="Search ${count} apps — try &ldquo;teacher&rdquo; or &ldquo;insurance&rdquo;" autocomplete="off">
    </div>
  </div>

  <main id="apps">
${sections}

    <p class="empty" id="noResults">Nothing matches that. <button type="button" id="clearSearch" style="background:none;border:0;color:var(--teal);font:inherit;cursor:pointer;text-decoration:underline">Show all ${count} apps</button></p>
  </main>

  <footer>
    <p>Every app here is free and always will be. If one saved your day, each has a tip jar. <span class="tip">&#9829;</span></p>
    <p style="margin-top:12px"><a href="https://lucidwinds.com/portal">We make games too &mdash; play free in the Arcade</a></p>
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
</body>
</html>
`;

writeFileSync(join(HERE, '..', 'apps', 'index.html'), html);
console.log(`Wrote apps/index.html — ${count} apps, ${CATALOGUE.length} categories`);
