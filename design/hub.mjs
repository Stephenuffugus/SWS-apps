#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SKY WOLF STUDIO, the hub page

   Generates apps/index.html (the front door), apps/catalogue.json (the
   catalogue as data, for anything downstream) and apps/manifest.webmanifest.

     node design/hub.mjs

   ── 2026-08-28, THE REDESIGN ───────────────────────────────────────────────
   Stephen scanned his business card at somebody, watched them land on the
   arcade's mirror of this page instead of skywolfstudio.com, and said the
   quiet part: he likes the mirror better. "It's got nice borders and the
   images are larger. It feels a little more comfortable." He was right. The
   old hub was a wall of 17rem cards with 64px thumbnails down the left,
   which is a list wearing a grid's clothes. His art was the smallest thing
   on a page whose whole job is showing his art.

   So the hub now wears the treatment the arcade page wore: the ornate gold
   filigree frame down all four edges flowing with the scroll, his
   thumbnails big and square at the top of every card, category sections
   that open with the question the visitor actually arrived with, film
   strips of his art, and room to breathe between all of it. The studio's
   own machinery survives inside it: the live search over every app, the per
   app install arrows, the per app accent colour, the counted promises.

   The apps landing page at lucidwinds.com/portal/apps.html is now built
   from apps/catalogue.json rather than by scraping this page's HTML, which
   is the bug that kept it two apps behind.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* The studio's own domain. Every absolute URL the page or the catalogue
   states uses it, never the raw Firebase address it also answers on. */
const ORIGIN = 'https://skywolfstudio.com';

const palette = JSON.parse(readFileSync(join(HERE, 'out', 'palette.json'), 'utf8'));

/* Thumbnails are cached for a week (see firebase.json). A version stamp on
   the URL is the only way replaced art reaches a phone that already holds
   the old file, and a hand-typed stamp has already failed once: Stephen's
   wedding rings were restored, the page was hand-edited to ?v=5, this
   generator still said ?v=4, and the next regeneration would have pointed
   every visitor back at the URL holding the wrong picture. The stamp is now
   the file's own content hash. Changed art always gets a fresh URL,
   unchanged art keeps a stable one, and nobody has to remember. */

/* The card art is shown around 196 CSS px wide on a laptop and 173 on a
   phone, which on any retina screen asks for more pixels than a 256 file
   has. marketing/thumb-512.png is cut from his own 1254px stripe original
   (design/hub.mjs never draws art, it only ever downscales his), so the
   redesign shows his pictures sharp instead of upscaled. thumb-256 is the
   fallback for anything with no larger source, which today is Hush. */
const ART = new Map();
const artOf = (slug) => {
  if (!ART.has(slug)) {
    let found = null;
    for (const [name, dim] of [['thumb-512.png', 512], ['thumb-256.png', 256]]) {
      const p = join(HERE, '..', 'apps', slug, 'marketing', name);
      if (!existsSync(p)) continue;
      found = { name, dim, hash: createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 8) };
      break;
    }
    ART.set(slug, found);
  }
  return ART.get(slug);
};
const artUrl = (slug, base = `./${slug}/`) => {
  const a = artOf(slug);
  return a ? `${base}marketing/${a.name}?v=${a.hash}` : `${base}icon.svg`;
};
const artDim = (slug) => (artOf(slug) ? artOf(slug).dim : 64);

/* Apps the studio advertises but does not host. Empty, and that is the point:
   Hush used to live here pointing at lucidwinds.com/hush, but Hush moved home
   on 2026-08-20 and its canonical address is skywolfstudio.com/hush. The
   generator was never told, so a regeneration would have quietly sent every
   visitor back to the stale arcade mirror. Anything added here must be an app
   that genuinely is not in apps/. */
const OFFSITE = {};

/* Apps that ship with their own full identity rather than a studio skin, so
   they are not in skins.mjs/palette.json. Their card accents are read from
   their own CSS. */
const SELF_STYLED = {
  'cross-off': { darkAccent: '#F9E547', accent: '#B99B00' },
  'overload': { darkAccent: '#5C8AD4', accent: '#3F6DB5' },
  /* Astra Vault is a built Expo web export dropped into apps/astravault/
     (source repo: Stephenuffugus/astravault); colours from its own tokens. */
  'astravault': { darkAccent: '#60A5FA', accent: '#26356E' },
  /* Rock Stops (built as Float) carries its own mineral palette: agate
     amber on serpentine. Still gated for Stephen and Jessie's testing. */
  'rock-stops': { darkAccent: '#C9873B', accent: '#2E5C51' },
  /* Fretwork wears its own woodshop gold; Diamond Rules its own grass and
     chalk. Both integrated by hand into apps/index.html first; kept here so
     a hub regeneration can never drop them. */
  'fretwork': { darkAccent: '#c9974c', accent: '#8a5f22' },
  'diamond-rules': { darkAccent: '#3FA35C', accent: '#1C3529' },
  /* Inkbones wears the non photo blue that real comic artists pencil with, on
     bristol board. It is deliberately NOT in skins.mjs: design/apply.mjs
     iterates Object.keys(SKINS) and would strip the app's own --ink token and
     prune its rules on the next build, taking the bristol board look and the
     dark shell with it. Measured 8.02:1 on the hub's dark card and 6.18:1 on
     bristol board. Process magenta was the alternative and misses both ways at
     once, 4.02:1 on the card and 3.91:1 on the board, and lightening it enough
     to pass turns it pink, which stops it being a registration mark. */
  'inkbones': { darkAccent: '#6FB7DC', accent: '#1F5F80' },
  /* Hush came home from the arcade on 2026-08-20 and is a local app now.
     Its colours are its own (--glow and --deep), not a studio skin. */
  'hush': { darkAccent: '#F2B872', accent: '#C87F3C' },
  /* Music Studio came across from the Lucid Winds arcade on 2026-08-29 and
     keeps its own grove palette: sage and gold on near-black, read from its
     own :root. It is the SAME app that still lives at lucidwinds.com, which
     means two copies that will drift; see the notes doc. */
  'music-studio': { darkAccent: '#7ab356', accent: '#4a7c35' },
  /* Beacon is warm on purpose: a page somebody opens when they need a person
     should not look like an alarm panel. Its own signal orange on cream, read
     from its own CSS (#FF7A3D on #FFF4E6, with #D2551D as the deeper stroke). */
  'beacon': { darkAccent: '#FF7A3D', accent: '#C25415' },
  /* Coverage was hand-added to the page and never to this catalogue, so
     every regeneration since would have deleted it. Its own investor blue. */
  'coverage': { darkAccent: '#4c8dff', accent: '#2b62c4' },
  /* Off the Ball arrived with its own chalk-on-a-dark-pitch identity and
     keeps it: the attacking gold over the deep pitch green. */
  'off-the-ball': { darkAccent: '#F4B740', accent: '#0B1B1A' },
};

/* ───────────────────────────────────────────────────────────────────────────
   The catalogue.

   Each category is [title, meta, apps]. `meta` is how the section introduces
   itself: a kicker, the question the visitor arrived with, and a line of
   plain talk. That wording used to live only in the arcade repo's generator,
   which meant a new category here reached that page with no sentence to
   introduce it and hard-failed its build. It lives here now and ships in
   catalogue.json, so the words travel with the apps.

   Each app is [slug, name, line, find, kind]. `find` holds the words someone
   would actually type looking for this: the filter matches against it, so
   "insurance" finds Home Inventory and "teacher" finds both school apps.

   `kind` is 'shared' for the apps whose whole point is that two phones see
   the same thing, which means the data lives on a server and the person who
   creates the board signs in. Those two facts are true and unavoidable, so
   the card states them rather than printing a blanket on-device promise the
   page cannot keep. See findings/TRUST-COPY-CLOUD-APPS.md. 'beta' is an app
   still in testing.
   ─────────────────────────────────────────────────────────────────────────── */
const CATALOGUE = [
  ['Family &amp; Home',
    { id: 'family-home', kick: 'The household', q: 'Keeping the house running?',
      sub: 'The sitter, the baby, the meds, the groceries, the sound that finally gets everyone to sleep, and one big button on an old tablet for whoever cannot carry a phone. The everyday logistics of the people you love.' }, [
    ['sitter-sheet', 'Sitter Sheet', 'Everything the babysitter needs, on one page', 'babysitter nanny childcare emergency contacts allergies'],
    ['baby-log', 'Baby Log', 'Feeds, sleep and nappies with one thumb at 3am', 'newborn infant feeding nursing diaper tracker night'],
    ['hush', 'Hush', 'Pick your sound. Go to sleep', 'white noise sleep sound machine baby nursery newborn night bedtime settle offline honest science'],
    ['pill-schedule', 'Pill Schedule', 'A large-print medication card for the fridge', 'medication meds prescription elderly dosage reminder'],
    ['caregiver-log', 'Caregiver Log', 'A shared notebook for the family caring at home', 'elderly parent hospice shift notes dementia care', 'shared'],
    /* Beacon is the odd one in this fleet and the reason is worth writing down.
       It is deliberate ES5 with no CSS variables, no grid and no flex, because
       it exists for the iPad 2 in a drawer that is stuck on iOS 9.3.5 and that
       no app store will install anything onto any more. apps/beacon/test/es5.mjs
       parses it at ecmaVersion 5 and fails the build if anything newer appears.
       Do NOT apply the studio base CSS to it; that would break the one device
       it was written for.

       In testing because the ES5 contract is proved by a parser and the app is
       proved in Chromium, but nobody has yet opened it on an actual 2012 iPad,
       which is the only claim that really matters. */
    ['beacon', 'Beacon', 'One button on an old tablet that reaches a grown-up', 'kid child tablet ipad old device message parents mum dad emergency help button elderly senior one button simple accessible discord webhook family chat no account', 'beta'],
    ['grocery-list', 'Grocery List', 'One list the whole household can add to', 'shopping supermarket household share', 'shared'],
  ]],
  ['School',
    { id: 'school', kick: 'The school year', q: 'Teaching this year?',
      sub: 'Plan the whole year once, keep grades on your own computer, and have the sub folder ready before you are sick.' }, [
    ['specials-planner', 'Specials Planner', 'Art, music, PE, library. Plan the whole year once', 'teacher lesson plan rotation schedule elementary'],
    ['sub-plans', 'Sub Plans', 'Your substitute folder, ready before you are sick', 'teacher substitute emergency plans binder classroom'],
    ['grade-sheet', 'Grade Sheet', 'Grades for every class you teach, on this device only', 'gradebook grades teacher marks roster rubric report card averages specials elementary substitute homeschool'],
  ]],
  ['Events &amp; Groups',
    { id: 'events-groups', kick: 'The big days', q: 'Planning a big day?',
      sub: 'Weddings, seasons, sign-ups, game nights. One link for everyone instead of a group-chat avalanche.' }, [
    /* "no account, ever" was false for the one person who makes the sheet, they sign in. True for everyone who signs up, which is the many. */
    ['signup-sheets', 'Signup Sheets', 'Claim a spot in seconds, no account needed', 'volunteer potluck conference slots roster shifts', 'shared'],
    ['team-parent', 'Team Parent', 'One link for the whole season', 'youth sports snack schedule roster coach league', 'shared'],
    ['secret-santa', 'Secret Santa', 'Draw names without the group-chat chaos', 'gift exchange christmas holiday office party'],
    ['wedding-timeline', 'Wedding Day Timeline', 'So nobody asks &ldquo;when is hair again?&rdquo;', 'wedding schedule vendors bridal party run of show'],
    ['seating-chart', 'Seating Chart', 'Tables, seats and who must not sit together', 'wedding reception banquet place cards floor plan'],
    ['bracket-maker', 'Bracket Maker', 'Game night, settled properly', 'tournament elimination playoff league office pool'],
    ['wheel-picker', 'Wheel Picker', 'Spin to choose. No ads spinning back', 'random name picker classroom raffle prize chore'],
  ]],
  ['Paper &amp; Files',
    { id: 'paper-files', kick: 'The paperwork', q: 'Drowning in paperwork?',
      sub: 'Scan it, merge it, sign it, shrink it, all on your device. Nothing gets uploaded and nothing holds your file for ransom.' }, [
    ['scan-to-pdf', 'Scan to PDF', 'No watermark, no ransom, no upload', 'scanner document camera receipt paperwork'],
    ['pdf-tools', 'PDF Tools', 'Merge, split and rotate. Nothing gets uploaded', 'combine pages reorder delete extract'],
    ['image-compressor', 'Image Compressor', 'Shrink photos without uploading them', 'resize optimise jpeg png file size email'],
    ['signature-maker', 'Signature Maker', 'Draw it once, use it everywhere', 'sign document esign transparent png contract'],
    ['qr-maker', 'QR Maker', 'Codes that never expire', 'qr code wifi menu flyer link generator'],
  ]],
  ['Moving &amp; Travel',
    { id: 'moving-travel', kick: 'The move', q: 'On the move?',
      sub: 'Which box has the can opener, what goes in the suitcase, and photos of everything before the insurance claim needs them.' }, [
    ['moving-boxes', 'Moving Boxes', 'Which box has the can opener?', 'move house packing labels inventory qr'],
    ['packing-list', 'Packing List', 'Never forget the charger again', 'travel trip suitcase checklist holiday'],
    ['home-inventory', 'Home Inventory', 'Photograph it before you need it', 'insurance claim contents valuables fire flood'],
  ]],
  ['Money',
    { id: 'money', kick: 'Settling up', q: 'Who owes what?',
      sub: 'Split the trip, the dinner, the house bills. Fairly, on your device, no accounts. And a screener that says whether the rental actually pays for itself.' }, [
    ['bill-splitter', 'Bill Splitter', 'Split it, settle up, nothing leaves your device', 'split expenses group trip dinner iou owe'],
    ['coverage', 'Coverage', 'Does the rental qualify? If not, the down payment that would', 'dscr deal screener rental loan qualify investor real estate down payment cash flow cap rate mortgage financing landlord property', 'beta'],
  ]],
  ['Body &amp; Mind',
    { id: 'body-mind', kick: 'Your own corner', q: 'Working on you?',
      sub: 'A to-do list that feels as good as paper to cross off, and a strength app that writes your next workout for you. Small wins, stacked up.' }, [
    ['cross-off', 'Cross Off', 'A paper list you cross off with real highlighters', 'todo to-do checklist tasks chores adhd highlighter timer focus race goblin satisfying'],
    ['overload', 'OVERLOAD', 'It writes your next workout. You just lift', 'gym workout lifting weights strength progressive overload plate math reps sets bodyweight fitness exercise'],
  ]],
  ['Music',
    { id: 'music', kick: 'The woodshed', q: 'Learning the neck?',
      sub: 'Tap drills, scales in positions, chord charts and rhythm, built by somebody who teaches this for a living. And a little studio for when you want to write something rather than practise it.' }, [
    ['fretwork', 'Fretwork', 'Know the neck: tap drills, scales in positions, chord charts and rhythm', 'guitar fretboard notes learn the neck memorize triads inversions seventh chords intervals scales modes pentatonic chord charts rhythm polyrhythm drills practice music theory jazz trainer teacher'],
    /* Came across from the arcade on 2026-08-29, byte for byte the same v2.2
       app, rebranded and given the fleet's seams. It still lives at
       lucidwinds.com/studio.html, so this is deliberately a SECOND copy rather
       than a move, which is how Hush ended up with a stale mirror. Whichever
       one stops being edited is the one that rots. */
    ['music-studio', 'Music Studio', 'Sequence a track in a browser tab, and keep it on your device', 'music studio sequencer daw beat maker drum machine bass melody chords loop bpm metronome song writing make music browser offline no account synth pattern step sequencer'],
  ]],
  ['Drawing',
    { id: 'drawing', kick: 'The kitchen table', q: 'Making something up?',
      sub: 'A character your child draws once and then keeps. There is a faint blue figure under the paper to draw over, and because of that the drawing already knows where its own elbows are, so it can be dressed, moved and put in a comic without ever being redrawn.' }, [
    /* In testing because the rig, the clothes and the page are all proved by
       benchmarks, renders and a browser suite, and none of that is the same
       thing as a seven year old finishing a comic without being told what to
       press. That test has not happened yet, which is the only one that counts.
       Take the 'beta' off after it does. */
    ['inkbones', 'Inkbones', 'Draw a character once, then pose it through a whole comic', 'comic comics maker kids children draw drawing character cartoon strip panels speech bubbles balloons story art print superhero make your own creative offline no account no ads stays the same every panel', 'beta'],
  ]],
  ['Night Sky',
    { id: 'night-sky', kick: 'The night sky', q: 'Looking up tonight?',
      sub: 'A star atlas you collect from: real planet positions, live NASA data, lessons and citizen science. In testing while it grows.' }, [
    ['astravault', 'Astra Vault', 'Scan the cosmos and collect the sky', 'stargazing astronomy stars planets moon meteor telescope constellation collect learn lessons bortle night sky space', 'beta'],
  ]],
  ['Outdoors',
    { id: 'outdoors', kick: 'The field', q: 'Out in the field?',
      sub: 'A rockhounding log for every find: photo, GPS and label, all on your device. In testing while it grows.' }, [
    ['rock-stops', 'Rock Stops', 'Every rock, fossil and sea glass find, logged where you stood', 'rockhounding rocks fossils sea glass minerals geology field log collection specimens beach camera gps', 'beta'],
  ]],
  ['Sports',
    { id: 'sports', kick: 'The pitch and the diamond', q: 'Coaching a team this season?',
      sub: 'The baseball rules little leagues skip, on a diamond kids can tap. And a soccer board where the defence reacts instead of standing still, so you find out whether the play actually works.' }, [
    /* The In testing badge came off on 2026-08-28: Stephen's coach wants to
       share it with a travel coach, and the badge is the same one the
       genuinely passphrase-locked Rock Stops wears, so it read as a door
       that was shut. Diamond Rules is finished enough to hand to a stranger. */
    ['diamond-rules', 'Diamond Rules', 'The rules little leagues skip, on a diamond kids can tap', 'baseball softball little league kids learn the rules force out force play tag up tag ups infield fly pop fly pop up count balls strikes outs tee ball coach pitch 8u youth game quiz diamond field positions who covers'],
    /* Arrived 2026-08-28 as a v0.3 prototype with its own engine harness and
       a handoff that says plainly it is not shippable yet, so it wears the
       In testing badge.

       GATED behind a passphrase since 2026-08-29, which reverses what this
       comment used to say. The old note read "not gated: there is nothing to
       hide, it just is not finished", and the badge was due to come off the
       day the handoff's blocking list closed. That list closed, so six agents
       were sent to drive the thing a coach would actually drive, and the
       answer was that finishing the feature list had not made it usable: the
       board stopped taking any tap the moment a play had been run, the only
       labelled way out threw the play away, tapping a format button killed
       input outright, and nothing a coach saved or shared remembered which
       pitch it was drawn on, so every small sided play reopened wrong. A badge
       is the wrong instrument for that.

       All four were fixed in otb-v10, each with a test that was run against
       the reverted code and had to fail with the reported symptom first. The
       curtain STAYS until Stephen says otherwise: the audit verified 8 of 22
       non-polish findings, so that list was a floor rather than a ceiling, and
       he has no one to test with yet. It lives at the bottom of
       apps/off-the-ball/index.html; take it out, and put this comment back the
       way it was, when he calls it. */
    ['off-the-ball', 'Off the Ball', 'Plan a play against a defence that reacts', 'soccer football play designer tactics board planning runs off the ball movement overlap third man run give and go one two wall pass decoy feint sunday league rec coach team playbook positioning defence reacts simulation', 'beta'],
  ]],
];

/* ── counted, never typed ──────────────────────────────────────────────────
   The moment someone adds a shared app and hand-edits "nineteen" the page
   starts lying again, which is exactly how it got into this state the first
   time. Every number below is derived. */
const count = CATALOGUE.reduce((n, [, , a]) => n + a.length, 0);
const sharedCount = CATALOGUE.reduce((n, [, , a]) => n + a.filter((x) => x[4] === 'shared').length, 0);
const localCount = count - sharedCount;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] || String(n);

/* ── the ornament ──────────────────────────────────────────────────────────
   Thin-lined gold, eclectic on purpose (Stephen: "a little more eclectic and
   unique"): one long strip mixing motifs so it reads collected rather than
   tiled. Stem, leaf, lozenge, starburst, fern curl, crescent, dot run,
   diamond chain, mirrored stem. Vertical for the side rails, horizontal for
   the top and bottom bands, a lozenge for the corners. The same drawing the
   arcade's apps page wears: this is the border Stephen pointed at. */
const VINE = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='340' viewBox='0 0 26 340' fill='none' stroke='#e4bd5f' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'>` +
  `<path d='M13 0 C 5 24, 21 46, 13 70'/>` +
  `<path d='M12 38 C 7 36, 4 31, 4 25 C 10 27, 12 32, 12 38 Z'/>` +
  `<path d='M13 70 L17 76 L13 82 L9 76 Z'/><circle cx='13' cy='76' r='1.1'/>` +
  `<path d='M13 82 C 16 90, 10 94, 13 100'/>` +
  `<path d='M13 102 V106 M13 112 V116 M6 109 H10 M16 109 H20 M8.5 104.5 L11 107 M15 111 L17.5 113.5 M17.5 104.5 L15 107 M11 111 L8.5 113.5'/><circle cx='13' cy='109' r='1.3'/>` +
  `<path d='M13 118 C 17 126, 9 132, 13 140'/>` +
  `<path d='M13 140 C 6 154, 20 168, 13 182'/>` +
  `<path d='M15 158 C 20 156, 23 151, 21 147 C 19 145, 16 148, 18 152'/>` +
  `<path d='M8 190 Q13 197 18 190'/><path d='M10 192.5 Q13 196.5 16 192.5'/>` +
  `<circle cx='13' cy='204' r='1.5'/><circle cx='13' cy='210' r='1.1'/><circle cx='13' cy='215' r='0.8'/>` +
  `<path d='M13 222 L16.5 227.5 L13 233 L9.5 227.5 Z'/><path d='M13 233 L15.5 237.5 L13 242 L10.5 237.5 Z'/>` +
  `<path d='M13 248 C 21 270, 5 296, 13 318'/>` +
  `<path d='M14 276 C 19 274, 22 269, 22 263 C 16 265, 14 270, 14 276 Z'/>` +
  `<circle cx='13' cy='300' r='1.4'/>` +
  `<path d='M13 318 C 11 326, 15 333, 13 340'/>` +
  `</svg>`);
const BAND = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='18' viewBox='0 0 340 18' fill='none' stroke='#e4bd5f' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'>` +
  `<path d='M0 9 C 24 3, 46 15, 70 9'/>` +
  `<path d='M38 8 C 36 3, 31 1, 25 1 C 27 6, 32 8, 38 8 Z'/>` +
  `<path d='M70 9 L76 5 L82 9 L76 13 Z'/><circle cx='76' cy='9' r='1.1'/>` +
  `<path d='M82 9 C 90 12, 94 6, 100 9'/>` +
  `<path d='M102 9 H106 M112 9 H116 M109 2 V6 M109 12 V16 M104.5 4.5 L107 7 M111 11 L113.5 13.5 M104.5 13.5 L107 11 M111 7 L113.5 4.5'/><circle cx='109' cy='9' r='1.3'/>` +
  `<path d='M118 9 C 126 5, 132 13, 140 9'/>` +
  `<path d='M140 9 C 154 2, 168 16, 182 9'/>` +
  `<path d='M158 7 C 156 2, 151 -1, 147 1 C 145 3, 148 6, 152 4'/>` +
  `<path d='M190 6 Q197 13 204 6'/><path d='M192.5 8.5 Q197 12.5 201.5 8.5'/>` +
  `<circle cx='214' cy='9' r='1.5'/><circle cx='220' cy='9' r='1.1'/><circle cx='225' cy='9' r='0.8'/>` +
  `<path d='M232 9 L237.5 5.5 L243 9 L237.5 12.5 Z'/><path d='M243 9 L247.5 6.5 L252 9 L247.5 11.5 Z'/>` +
  `<path d='M258 9 C 280 1, 296 17, 318 9'/>` +
  `<path d='M286 10 C 284 15, 279 17, 273 17 C 275 12, 280 10, 286 10 Z'/>` +
  `<path d='M318 9 C 326 7, 333 11, 340 9'/>` +
  `</svg>`);
const CORNER = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none' stroke='#e4bd5f' stroke-width='1' stroke-linejoin='round'><path d='M7 1 L13 7 L7 13 L1 7 Z'/><circle cx='7' cy='7' r='1.4'/></svg>`);

const FLOURISH = `<div class="flourish" aria-hidden="true"><svg width="120" height="16" viewBox="0 0 120 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="M60 2 L67 8 L60 14 L53 8 Z"/><path d="M47 8 C 40 3, 32 3, 26 8 C 32 13, 40 13, 47 8 Z"/><path d="M73 8 C 80 3, 88 3, 94 8 C 88 13, 80 13, 73 8 Z"/><circle cx="60" cy="8" r="1.6"/><path d="M0 8 H 20"/><path d="M100 8 H 120"/></svg></div>`;

/* ── the card ──────────────────────────────────────────────────────────────
   His art at the top, full width of the card, square. The name and the line
   under it. The app's own accent lights the border on hover and rings the
   focus outline, which is where the old left-edge spine went: a wall of
   coloured 3px hairlines was the studio's colour system whispered, and this
   states it at full card width the moment you reach for one.

   The install arrow has to sit OUTSIDE the link (an anchor cannot contain an
   anchor), so the card is a wrapper carrying the search index and the accent,
   with the link and the arrow as siblings inside it. */
/* The app's accent, at 34 percent, for the keyline that sits on the art at
   rest. The hover border alone put the whole colour system behind a hover,
   which on half the traffic does not exist. */
const ring = (hex, a = 0.34) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* Thirty two slugs are covered by twenty four palette entries and eight
   hand-filed ones. The thirty third is a trap, and an undefined lookup here
   throws a TypeError three lines later with nothing useful in it. */
const accentOf = (slug) => {
  const p = palette[slug] || OFFSITE[slug] || SELF_STYLED[slug];
  if (!p) {
    console.error(`no accent filed for ${slug}. Add it to design/out/palette.json, or to SELF_STYLED in this file if the app carries its own identity. Refusing to write.`);
    process.exit(1);
  }
  return p;
};

const card = ([slug, name, line, find, kind], i) => {
  const p = accentOf(slug);
  const href = OFFSITE[slug] ? OFFSITE[slug].href : `./${slug}/`;
  const tag = kind === 'shared'
    ? `\n            <span class="tag">Shared online</span>`
    : kind === 'beta'
      ? `\n            <span class="tag">In testing</span>`
      : '';
  /* "shared online" is searchable too: someone deciding whether to trust a
     list with the school run should be able to find the ones that leave the
     device by typing the thing they are worried about. */
  const extra = kind === 'shared'
    ? ' shared online cloud server link'
    : kind === 'beta'
      ? ' beta in development testing'
      : '';
  /* Per-card install: a page can only prompt for ITS OWN app, so the arrow
     opens the app with ?sws-install=1 and the app's studio-wide install
     affordance greets them as a banner instead of hiding in the footer. Only
     offered where that affordance actually exists in the app's HTML. */
  const installable = !OFFSITE[slug]
    && existsSync(join(HERE, '..', 'apps', slug, 'index.html'))
    && readFileSync(join(HERE, '..', 'apps', slug, 'index.html'), 'utf8').includes('swsInstall');
  const get = installable
    ? `\n          <a class="getbtn" href="./${slug}/?sws-install=1" aria-label="Install ${name.replace(/"/g, '&quot;')}" title="Install this app">&#10515;</a>`
    : '';
  /* The index goes into a double-quoted attribute. No tagline carries a
     quote today; the next one that does would silently disable search for
     its card. */
  const find_ = `${name.toLowerCase()} ${line.replace(/&[a-z]+;/g, '').toLowerCase()} ${find}${extra}`.replace(/"/g, '&quot;');
  /* An unstyled SVG inside object-fit:cover at card width is a stretched
     smear, so the icon fallback gets told it is a fallback. */
  const fallback = artOf(slug) ? '' : ' class="fallback"';
  return `        <div class="app" data-find="${find_}"
          style="--i:${i};--app:${p.darkAccent};--app-deep:${p.accent};--app-ring:${ring(p.darkAccent)}">
          <a class="applink" href="${href}">
            <img${fallback} src="${artUrl(slug)}" alt="" width="${artDim(slug)}" height="${artDim(slug)}" loading="lazy" decoding="async">
            <b>${name}</b>
            <small>${line}</small>${tag}
          </a>${get}
        </div>`;
};

const section = ([title, meta, apps], idx) => `
    <section class="need reveal" data-group${idx === 0 ? ' id="needs"' : ''}>
${idx === 0 ? '' : '      ' + FLOURISH + '\n'}      <span class="kick">${String(idx + 1).padStart(2, '0')} &middot; ${meta.kick}</span>
      <h2>${meta.q}</h2>
      <p class="sub">${meta.sub}</p>
      <div class="grid">
${apps.map(card).join('\n')}
      </div>
    </section>`;

const sections = CATALOGUE.map(section).join('\n');

/* ── the hero strips ───────────────────────────────────────────────────────
   Every app whose real thumbnail art exists on disk, split over two rows
   drifting opposite ways, each row doubled for the seamless -50% loop.
   Decorative (aria-hidden); the cards below carry the links. */
const thumbed = CATALOGUE.flatMap(([, , apps]) => apps.map((a) => a[0])).filter(artOf);
const halfway = Math.ceil(thumbed.length / 2);
const stripImgs = (slugs, eager) => slugs.map((s, i) =>
  `<img src="${artUrl(s)}" alt="" width="${artDim(s)}" height="${artDim(s)}"${
    eager && i < 4 ? (i === 0 ? ' fetchpriority="high"' : '') : ' loading="lazy"'} decoding="async">`).join('');
/* Each track is printed twice for the seamless -50% loop. Only the first
   copy's opening images are on screen at load, so only those are eager. */
const strip = (slugs, cls) =>
  `    <div class="strip${cls}" aria-hidden="true"><div class="track">${stripImgs(slugs, true)}${stripImgs(slugs, false)}</div></div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="canonical" href="${ORIGIN}/">
<title>Sky Wolf Studio: ${count} free, ad-free apps</title>
<meta name="description" content="${count} free apps for real life from Sky Wolf Studio. No ads, no subscription, no tracking. ${localCount} keep everything on your device; the ${word(sharedCount)} shared ones say so.">
<meta name="theme-color" content="#080c09">
<meta property="og:title" content="Sky Wolf Studio: ${count} free apps">
<meta property="og:description" content="${count} free, ad-free apps: signup sheets, lesson planner, sub plans, PDF tools and more. ${localCount} keep everything on your device.">
<meta property="og:image" content="${ORIGIN}/signup-sheets/marketing/stripe-thumbnail.png">
<meta property="og:url" content="${ORIGIN}/">
<meta name="twitter:card" content="summary">
<link rel="icon" href="./brand/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="./brand/apple-touch-icon.png">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<script>document.documentElement.classList.add('js');
/* Thumbs are cached for a week. One bad response, a transfer dropped on weak
   signal or a request landing mid-deploy, and that blank result can sit in a
   phone's cache for days looking like the art was lost. If a thumb fails to
   load, retry it exactly once with a fresh URL that no cache has seen. */
document.addEventListener('error', function(e){
  var img = e.target;
  if (!img || img.tagName !== 'IMG' || img.dataset.retried) return;
  img.dataset.retried = '1';
  img.src = img.src + (img.src.indexOf('?') > -1 ? '&' : '?') + 'r=' + Date.now();
}, true);</script>
<style>
/* Generated by design/hub.mjs, edit the catalogue there, not here.
   Night-forest ground, gold filigree, his art large. The treatment the
   arcade's apps page wears, because Stephen looked at both and picked it. */
:root{
  color-scheme:dark;
  --bg:#080c09; --panel:#121a13; --panel2:#1a251b;
  --ink:#f1e9d8; --cream:#f1e9d8; --muted:#98a28e;
  --line:#2a3722; --gold:#e4bd5f; --gold-deep:#c19a41; --leaf:#82ddcd;
  --disp:'Fredoka',ui-rounded,'Segoe UI',system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
/* The overflow lives on html, never on body: overflow-x on body computes
   overflow-y:auto, which can make the body the scroll box and silently kill
   position:sticky on iOS Safari, taking the search bar with it. The doubled
   declaration is deliberate. Safari 15 and older take hidden, everything
   newer takes clip, and clip is what lets the 100vw hero bloom bleed
   without a horizontal scrollbar.
   scroll-padding-top keeps the skip link and Find your app from landing
   with the section kicker hidden behind the sticky bar. Keep it in step
   with the searchbar padding below. */
html{scroll-behavior:smooth;overflow-x:hidden;overflow-x:clip;
  scroll-padding-top:100px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.5 'Nunito',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  -webkit-font-smoothing:antialiased;
  padding-bottom:calc(48px + env(safe-area-inset-bottom))}
.wrap{max-width:1060px;margin:0 auto;padding:0 16px;position:relative;z-index:1}

.skip{position:absolute;left:16px;top:16px;z-index:20;padding:12px 16px;
  background:var(--gold);color:#12160f;border-radius:10px;font-weight:800;text-decoration:none;
  transform:translateY(-250%);transition:transform .2s cubic-bezier(.2,.7,.2,1)}
.skip:focus-visible{transform:none}

/* ── the ornate frame: eclectic gold filigree on all four edges, flowing
      with the scroll. One fixed inset:0 container with four absolute bars.
      This sizes to the real viewport (Pixel 9 included), where separate
      right-anchored fixed divs proved unreliable. ── */
.frame{position:fixed;inset:0;pointer-events:none;z-index:0}
/* Only the top band and its two corners ride above the sticky search bar.
   The rails and the bottom band stay under the content, the way they do on
   the page Stephen picked, so a card at the foot of the viewport still
   passes over the bottom band instead of being crossed by it. The rails
   never need raising: they sit outside the wrap's content box at every
   width the desktop frame applies to. */
.frame.top{z-index:7}
.fr{position:absolute;opacity:.34}
.fr.l,.fr.r{top:20px;bottom:20px;width:26px;background:url("${VINE}") repeat-y center 0/26px auto}
.fr.l{left:10px}
.fr.r{right:10px;transform:scaleX(-1)}
.fr.t,.fr.b{left:20px;right:20px;height:18px;background:url("${BAND}") repeat-x 0 center/auto 18px}
.fr.t{top:6px}
.fr.b{bottom:6px;transform:scaleY(-1)}
.fr.c{width:14px;height:14px;background:url("${CORNER}") no-repeat center/contain}
.fr.c.tl{top:8px;left:8px}.fr.c.tr{top:8px;right:8px}
.fr.c.bl{bottom:8px;left:8px}.fr.c.br{bottom:8px;right:8px}
/* Slimmer on the phone, but every edge still framed. */
@media (max-width:1180px){
  html{scroll-padding-top:88px}
  .searchbar{padding:22px 0 10px}
  .fr{opacity:.26}
  .fr.l,.fr.r{width:13px;background-size:13px auto;top:16px;bottom:16px}
  .fr.l{left:max(2px,env(safe-area-inset-left))}
  .fr.r{right:max(2px,env(safe-area-inset-right))}
  .fr.t,.fr.b{height:12px;background-size:auto 12px;left:16px;right:16px}
  .fr.t{top:max(3px,env(safe-area-inset-top))}
  .fr.b{bottom:max(3px,env(safe-area-inset-bottom))}
  .fr.c{width:11px;height:11px}
  .fr.c.tl,.fr.c.tr{top:4px}.fr.c.bl,.fr.c.br{bottom:4px}
  .fr.c.tl,.fr.c.bl{left:3px}.fr.c.tr,.fr.c.br{right:3px}
}

/* ── section flourishes: the same line, horizontal ── */
.flourish{display:flex;justify-content:center;color:var(--gold);opacity:.5;margin:0 0 40px}
/* Search for "wedding" and section one disappears, leaving whichever
   section survives first opening with a divider under the search bar
   dividing nothing. */
.need.lead .flourish{display:none}

/* ── hero ── */
.hero{text-align:center;padding:44px 0 8px;position:relative}
.hero::before{content:"";position:absolute;left:50%;top:-30%;width:100vw;height:150%;
  transform:translateX(-50%);pointer-events:none;
  background:radial-gradient(46% 55% at 50% 32%,rgba(228,189,95,.12),transparent 70%)}
.badge{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border:1px solid var(--line);
  border-radius:999px;color:var(--leaf);font-weight:800;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase}
h1{font-family:var(--disp);font-weight:600;color:var(--cream);
  font-size:clamp(2.5rem,8vw,4.4rem);line-height:1.0;margin:18px auto 14px;max-width:14ch}
h1 em{font-style:normal;color:var(--gold)}
.lede{color:var(--muted);font-size:clamp(1.02rem,2.6vw,1.22rem);max-width:46ch;margin:0 auto 24px}
.lede b{color:var(--cream)}
.cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:34px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 30px;
  border-radius:999px;font-weight:800;font-size:1.02rem;text-decoration:none;font-family:var(--disp);
  cursor:pointer;border:1px solid transparent}
.btn.gold{background:linear-gradient(180deg,var(--gold),var(--gold-deep));color:#12160f;
  box-shadow:0 6px 24px rgba(228,189,95,.25)}
.btn.gold:hover{filter:brightness(1.07)}
.btn.ghost{border-color:var(--line);color:var(--cream);background:none}
.btn.ghost:hover{border-color:var(--gold);color:var(--gold)}
.btn:focus-visible{outline:2px solid var(--gold);outline-offset:3px}

/* ── the film strips: his art, front and centre, drifting ── */
.strips{margin:0 0 10px;display:grid;gap:12px}
.strip{overflow:hidden;position:relative;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.strip .track{display:flex;gap:12px;width:max-content;animation:drift 60s linear infinite}
.strip.rev .track{animation-name:drift-rev;animation-duration:75s}
.strip img{width:132px;height:132px;border-radius:22px;flex:none;display:block}
@keyframes drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes drift-rev{from{transform:translateX(-50%)}to{transform:translateX(0)}}
/* One strip on a phone, not two: hero plus two strips plus four trust tiles
   plus the search bar pushes the first card a long way down, and reaching a
   card in one screen is the one thing the old hub did better. */
@media (max-width:600px){
  .strip img{width:88px;height:88px;border-radius:15px}
  .strips .strip:nth-child(2){display:none}
}

/* ── trust strip ── */
.trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:26px 0 8px}
.trust div{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px 16px;text-align:center}
.trust b{display:block;color:var(--gold);font-family:var(--disp);font-weight:600;font-size:1.05rem}
.trust small{color:var(--muted)}

/* ── search. Thirty-odd apps is past the point where scanning is pleasant,
      and the whole brief for these apps is "easy to find, easy to use". ── */
.searchbar{position:sticky;top:0;z-index:6;padding:30px 0 12px;margin-top:10px;
  background:linear-gradient(var(--bg) 72%,rgba(8,12,9,0))}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.search{position:relative;max-width:32rem;margin-inline:auto}
.search input{width:100%;min-height:52px;padding:0 20px 0 46px;
  font:600 1rem 'Nunito',system-ui,sans-serif;color:var(--ink);
  background:var(--panel);border:1px solid var(--line);border-radius:999px;
  box-shadow:0 8px 24px rgba(0,0,0,.45)}
.search input::placeholder{color:var(--muted);font-weight:400}
.search svg{position:absolute;left:17px;top:50%;transform:translateY(-50%);
  width:18px;height:18px;color:var(--muted);pointer-events:none}
.search input:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-color:var(--gold)}

/* ── category sections ── */
.need{margin-top:34px}
.kick{display:block;color:var(--gold);font-weight:800;font-size:.75rem;
  letter-spacing:.16em;text-transform:uppercase;margin-bottom:7px}
h2{font-family:var(--disp);font-weight:600;color:var(--cream);font-size:clamp(1.6rem,4.5vw,2.2rem);
  line-height:1.05;margin:0 0 6px}
.need .sub{color:var(--muted);font-size:1.02rem;max-width:56ch;margin:0 0 16px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(178px,1fr))}

/* ── the card: his art large, the app's own colour on the edge when you
      reach for it ── */
.app{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:18px;
  transition:border-color .18s,transform .18s,background .18s}
.app:hover{border-color:var(--app,var(--gold));background:var(--panel2);transform:translateY(-3px)}
.applink{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit;padding:12px;border-radius:18px}
.applink:focus-visible{outline:2px solid var(--app,var(--gold));outline-offset:-3px}
/* --app-deep holds the tile before the picture lands; the --app-ring
   keyline is where the old left-edge spine went, and it is on at rest so
   the app's colour exists on a phone, which has no hover to reveal it. */
.app img{width:100%;height:auto;aspect-ratio:1;border-radius:12px;object-fit:cover;display:block;
  background:var(--app-deep,var(--panel2));
  border:1px solid var(--app-ring,rgba(241,233,216,.10))}
.app img.fallback{object-fit:contain;padding:18%}
.app b{font-size:1.05rem;line-height:1.25;color:var(--cream)}
.app small{color:var(--muted);font-size:.85rem;line-height:1.4}
.app .tag{align-self:flex-start;margin-top:2px;padding:2px 9px;border:1px solid var(--line);
  border-radius:999px;color:var(--leaf);font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.getbtn{position:absolute;top:20px;right:20px;width:36px;height:36px;z-index:2;
  display:flex;align-items:center;justify-content:center;border-radius:50%;
  border:1px solid rgba(241,233,216,.22);color:var(--cream);background:rgba(8,12,9,.62);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  text-decoration:none;font-size:16px;line-height:1;
  transition:color .14s,border-color .14s,background .14s}
.getbtn:hover{color:#12160f;border-color:var(--gold);background:var(--gold)}
.getbtn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
/* Stephen: cards "could probably be two wide" on a phone. His art carries
   the card, so two-up stays readable down to small screens. */
@media (max-width:640px){
  .grid{grid-template-columns:repeat(2,1fr)}
  .app b{font-size:.95rem;hyphens:auto;overflow-wrap:anywhere}
  .app small{font-size:.8rem}
  /* a 36px disc covers a quarter of a 150px tile */
  .getbtn{top:16px;right:16px;width:32px;height:32px;font-size:14px}
}

.empty{display:none;text-align:center;color:var(--muted);padding:48px 16px}
.empty.show{display:block}
.empty button{background:none;border:0;color:var(--gold);font:inherit;cursor:pointer;text-decoration:underline}

/* ── closer, with thin ornate corner ticks ── */
.closer{margin-top:56px;text-align:center;background:var(--panel);border:1px solid rgba(228,189,95,.45);
  border-radius:24px;padding:38px 22px;position:relative}
.closer::before,.closer::after{content:"";position:absolute;width:26px;height:26px;
  border:1px solid rgba(228,189,95,.7);pointer-events:none}
.closer::before{top:9px;left:9px;border-right:none;border-bottom:none;border-top-left-radius:14px}
.closer::after{bottom:9px;right:9px;border-left:none;border-top:none;border-bottom-right-radius:14px}
.closer h2{margin-bottom:8px}
.closer p{color:var(--muted);max-width:48ch;margin:0 auto 20px}
.closer .tip{color:var(--gold)}
footer{margin-top:40px;padding-top:22px;border-top:1px solid var(--line);
  color:var(--muted);font-size:.9rem;text-align:center;line-height:1.7}
footer a{color:var(--leaf)}
footer a:hover{color:var(--gold)}

/* ── cascade. Gated on .js so a browser with no JavaScript shows the whole
      page plainly instead of a column of invisible sections. ── */
.js .reveal{opacity:0;transform:translateY(28px);
  transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.js .reveal.in{opacity:1;transform:none}
.js .reveal .app{opacity:0;transform:translateY(16px)}
.js .reveal.in .app{opacity:1;transform:none;
  transition:opacity .55s cubic-bezier(.2,.7,.2,1) calc(var(--i,0)*70ms),transform .55s cubic-bezier(.2,.7,.2,1) calc(var(--i,0)*70ms),border-color .18s,background .18s}
.js .reveal.in .app:hover{transform:translateY(-3px)}

@media (prefers-reduced-motion:reduce){
  *{transition-duration:.01ms !important}
  .strip .track{animation:none !important}
  .app:hover{transform:none}
  .js .reveal,.js .reveal .app{opacity:1 !important;transform:none !important}
}
</style>
</head>
<body>
<div class="frame" aria-hidden="true">
  <i class="fr b"></i><i class="fr l"></i><i class="fr r"></i>
  <i class="fr c bl"></i><i class="fr c br"></i>
</div>
<div class="frame top" aria-hidden="true">
  <i class="fr t"></i><i class="fr c tl"></i><i class="fr c tr"></i>
</div>
<a class="skip" href="#apps">Skip to the apps</a>
<div class="wrap">

  <div class="hero">
    <span class="badge">Sky Wolf Studio &middot; free apps</span>
    <h1>What are you <em>planning?</em></h1>
    <p class="lede">A wedding. A season. A school year. A move. A night you actually sleep.
      We build free apps for real life. <b>${count} so far</b>, every one free forever.
      <b>No ads. No subscriptions. No tracking.</b></p>
    <div class="cta-row">
      <a class="btn gold" href="#needs">Find your app</a>
      <button class="btn ghost" id="installStudio" type="button" hidden>&#10515; Save the studio to your home screen</button>
    </div>
  </div>

  <div class="strips">
${strip(thumbed.slice(0, halfway), '')}
${strip(thumbed.slice(halfway), ' rev')}
  </div>

  <div class="trust">
    <div><b>Free forever</b><small>tip jar if you love one</small></div>
    <div><b>No ads, ever</b><small>nothing spinning back at you</small></div>
    <div><b>Nothing tracked</b><small>no accounts to try anything</small></div>
    <div><b>${localCount} of ${count} offline</b><small>the ${word(sharedCount)} shared ones say so</small></div>
  </div>

  <div class="searchbar">
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label class="sr-only" for="q">Search the apps</label>
      <input id="q" type="search" placeholder="Search ${count} apps. Try &ldquo;teacher&rdquo; or &ldquo;insurance&rdquo;" autocomplete="off">
    </div>
  </div>

  <main id="apps">
${sections}

    <p class="empty" id="noResults">Nothing matches that. <button type="button" id="clearSearch">Show all ${count} apps</button></p>
  </main>

  <div class="closer reveal">
    <h2>It&rsquo;s all free. Seriously.</h2>
    <p>One small studio, ${count} apps, zero ads. If one of them saves your week, the tip jar inside it is the whole business model. <span class="tip">&#9829;</span></p>
    <div class="cta-row" style="margin:0">
      <a class="btn gold" href="https://lucidwinds.com/portal/">&#127918; We make games too. Play free in the Arcade</a>
      <a class="btn ghost" href="mailto:stephenfurpahs@gmail.com?subject=Sky%20Wolf%20Studio%20Apps%20feedback">Send feedback</a>
    </div>
  </div>

  <footer>
    <p>Sky Wolf Studio &middot; SWS Strategic Media LLC</p>
    <p><a href="https://lucidwinds.com/portal/">The Arcade</a> &middot; <a href="mailto:stephenfurpahs@gmail.com?subject=Sky%20Wolf%20Studio%20Apps%20feedback">Send feedback</a></p>
  </footer>
</div>

<script>
/* Live filter over every card's search index. */
(function(){
  var q = document.getElementById('q');
  var cards = [].slice.call(document.querySelectorAll('.app'));
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
    /* hide a whole section, its question and its flourish, once everything
       under it is filtered out */
    groups.forEach(function(g){
      var any = [].slice.call(g.querySelectorAll('.app')).some(function(c){ return c.style.display !== 'none'; });
      g.style.display = any ? '' : 'none';
      g.classList.remove('lead');
      /* a section further down the page can still be waiting at opacity 0
         when a search brings it up into view, so a search reveals it */
      if (any) g.classList.add('in');
    });
    /* whichever section survives first opens the results, so it is the one
       that must not carry a divider. With no search term this resolves to
       section one, which has no flourish, and nothing changes. */
    var first = groups.filter(function(g){ return g.style.display !== 'none'; })[0];
    if (first) first.classList.add('lead');
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
/* Scroll reveal. The .js gate on <html> means a browser with no JS (or no
   IntersectionObserver) shows everything plainly. Belt and braces after
   that: anything already on screen is revealed at 900ms and the whole page
   at 4s, so a stalled observer can never leave the apps blank. */
(function(){
  var els = [].slice.call(document.querySelectorAll('.reveal'));
  function showAll(){ els.forEach(function(el){ el.classList.add('in'); }); }
  if (!('IntersectionObserver' in window)){ showAll(); return; }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin:'0px 0px -6% 0px', threshold:.05 });
  els.forEach(function(el){ io.observe(el); });
  setTimeout(function(){
    els.forEach(function(el){ if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); });
  }, 900);
  setTimeout(showAll, 4000);
})();
</script>
<script>
/* The whole frame flows with the scroll: the side rails drift up, the top
   band slides one way and the bottom band the other. */
(function(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var sides = document.querySelectorAll('.fr.l,.fr.r');
  var top = document.querySelector('.fr.t'), bot = document.querySelector('.fr.b');
  if (!sides.length) return;
  var ticking = false;
  addEventListener('scroll', function(){
    if (ticking) return; ticking = true;
    requestAnimationFrame(function(){
      var d = Math.round(-scrollY * 0.25);
      for (var i = 0; i < sides.length; i++) sides[i].style.backgroundPositionY = d + 'px';
      if (top) top.style.backgroundPositionX = d + 'px';
      if (bot) bot.style.backgroundPositionX = (-d) + 'px';
      ticking = false;
    });
  }, { passive:true });
})();
</script>
<script>
/* The studio install button. Visible whenever the page is not already
   installed: Chrome hands over the real prompt, iOS gets Share-sheet
   directions, everything else gets its menu path. */
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

/* The page and the catalogue must agree, always. A card hand-added to the
   generated HTML is how this page came to render 32 apps while announcing
   31 in six places, and how Coverage came to exist on a shelf its own
   generator had never heard of. Count what was actually rendered and refuse
   to write a page that does not match the catalogue it came from. */
const rendered = (html.match(/<div class="app" data-find=/g) || []).length;
if (rendered !== count) {
  console.error(`the page renders ${rendered} cards but the catalogue holds ${count}. Refusing to write.`);
  process.exit(1);
}

/* And every address the page states must resolve to something on disk. A
   card pointing at a folder that is not there, or an <img> pointing at a
   picture that is not there, is the exact shape of every art incident this
   repo has had. Off-site links are checked by the audits, not here. */
const broken = [];
for (const m of html.matchAll(/(?:href|src)="\.\/([^"?#]+)(?:\?[^"]*)?"/g)) {
  const rel = m[1].replace(/\/$/, '');
  if (!existsSync(join(HERE, '..', 'apps', rel))) broken.push(m[0]);
}
if (broken.length) {
  console.error('the page points at files that are not on disk:\n  ' + [...new Set(broken)].join('\n  '));
  process.exit(1);
}

writeFileSync(join(HERE, '..', 'apps', 'index.html'), html);

/* ═══════════════════════════════════════════════════════════════════════════
   apps/catalogue.json, the studio's catalogue as DATA.

   The arcade repo builds lucidwinds.com/portal/apps.html from this list. It
   used to do that by scraping this page's HTML with two regexes. The markup
   here changed, both regexes fell to zero matches, and that page sat two
   apps behind because its generator hard-failed every time it ran. A page
   one repo away must never depend on this page's CSS class names, so the
   catalogue is published as a contract instead: markup moves freely on
   either side, only these field names are promised.

   Plain text, not markup: consumers escape for their own output.
   ═══════════════════════════════════════════════════════════════════════════ */
const plain = (s) => s
  .replace(/&amp;/g, '&').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
  .replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’')
  .replace(/&middot;/g, '·').replace(/&hellip;/g, '…');

const betaCount = CATALOGUE.reduce((n, [, , a]) => n + a.filter((x) => x[4] === 'beta').length, 0);
const catalogueJson = {
  /* Bump this only for a breaking change to the field names below. A
     consumer refuses a version it was not written for, which turns a
     silent misread into a loud stop. */
  contract: 1,
  origin: ORIGIN,
  generator: 'design/hub.mjs',
  count, sharedCount, betaCount, localCount,
  categories: CATALOGUE.map(([title, meta, apps]) => ({
    /* The id is the join key, never the title: retitling a section should
       not break a build one repo away. */
    id: meta.id,
    title: plain(title),
    kick: plain(meta.kick),
    question: plain(meta.q),
    sub: plain(meta.sub),
    slugs: apps.map((a) => a[0]),
  })),
  apps: Object.fromEntries(CATALOGUE.flatMap(([title, , apps]) => apps.map(([slug, name, line, find, kind]) => {
    const p = accentOf(slug);
    return [slug, {
      slug,
      name: plain(name),
      line: plain(line),
      category: plain(title),
      categoryId: CATALOGUE.find(([t]) => t === title)[1].id,
      tag: kind === 'shared' ? 'shared' : kind === 'beta' ? 'beta' : null,
      href: OFFSITE[slug] ? OFFSITE[slug].href : `${ORIGIN}/${slug}/`,
      offsite: !!OFFSITE[slug],
      art: artUrl(slug, `${ORIGIN}/${slug}/`),
      /* The art's own content hash. A mirror in another repo can compare
         its copy against this and stop rather than serve last month's
         picture. null means no thumbnail is filed and the icon stands in. */
      artHash: artOf(slug) ? artOf(slug).hash : null,
      artPixels: artOf(slug) ? artOf(slug).dim : null,
      accent: p.darkAccent,
      accentDeep: p.accent,
      find: plain(find),
    }];
  }))),
};
/* The contract promises plain text. plain() knows a fixed set of entities,
   so anything the copy grows that it does not know has to stop the build
   rather than travel to another repo as literal "&hellip;". */
const leftovers = [];
(function walk(v, path){
  if (typeof v === 'string') { if (/&[a-z]+;/i.test(v)) leftovers.push(`${path}: ${v}`); return; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
})(catalogueJson, 'catalogue');
if (leftovers.length) {
  console.error('HTML entities survived into the catalogue contract:\n  ' + leftovers.join('\n  ')
    + '\nAdd them to plain(), or take them out of the copy.');
  process.exit(1);
}

writeFileSync(join(HERE, '..', 'apps', 'catalogue.json'), JSON.stringify(catalogueJson, null, 2) + '\n');

/* The manifest states the app count and the page's ground colour, and it
   drifted for the same reason everything else drifted: nobody regenerates a
   file that nothing generates. It is generated now. */
const manifest = {
  name: 'Sky Wolf Studio',
  short_name: 'Sky Wolf',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#080c09',
  theme_color: '#080c09',
  description: `${count} free, ad-free apps from Sky Wolf Studio. No accounts, no tracking, and a tip jar if one saved your day.`,
  icons: [
    { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(HERE, '..', 'apps', 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

/* The sitemap was the last list kept by hand, which is why it still
   advertised Coverage to Google on a day the generator would have deleted
   its card. Same array, same origin, one source of truth. */
const sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${ORIGIN}/</loc></url>`,
  ...CATALOGUE.flatMap(([, , apps]) => apps
    .filter(([slug]) => !OFFSITE[slug])
    .map(([slug]) => slug))
    .sort()
    .map((slug) => `  <url><loc>${ORIGIN}/${slug}/</loc></url>`),
  '</urlset>', ''].join('\n');
writeFileSync(join(HERE, '..', 'apps', 'sitemap.xml'), sitemap);

console.log(`Wrote apps/index.html, ${count} apps in ${CATALOGUE.length} categories, ${localCount} on-device and ${sharedCount} shared`);
console.log('Wrote apps/sitemap.xml');
console.log('Wrote apps/catalogue.json, the contract the arcade page builds from');
console.log('Wrote apps/manifest.webmanifest');
