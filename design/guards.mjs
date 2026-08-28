#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, guards

   Every check in this file exists because the same class of bug shipped, more
   than once, past a green test suite. Tests proved the code was written. They
   proved nothing about whether a person could see it or press it.

     node design/guards.mjs            local build
     node design/guards.mjs --live     also diff the deployed site against it

   Each guard names the failure it was born from, so nobody later deletes one
   for being noisy without knowing what it is holding back.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { withApp } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const ORIGIN = 'https://skywolfstudio.com';
const LIVE = process.argv.includes('--live');

const slugs = readdirSync(APPS)
  .filter((d) => existsSync(join(APPS, d, 'index.html')))
  .sort();

const fails = [];
const fail = (slug, guard, msg) => fails.push({ slug, guard, msg });
let checked = 0;

/* ── 1. app CSS must live below the sentinel ────────────────────────────────
   design/apply.mjs replaces everything between the sentinels on every run. CSS
   written above the END sentinel is deleted by the next build, silently, and
   only visible as "the app looks wrong in a way the source says it should not".
   The planner lost its entire colour system this way and nobody noticed for
   days, because the source still contained the rules right up until a build
   ran. Static check, no browser needed. */
function guardCssPlacement() {
  const END = '/* ▲▲▲ END SWS STUDIO BASE ▲▲▲ */';
  for (const slug of slugs) {
    const html = readFileSync(join(APPS, slug, 'index.html'), 'utf8');
    const end = html.indexOf(END);
    if (end === -1) continue;                       // never had the base applied
    const base = html.slice(0, end);
    /* The base is generated and its own rules are known. Anything that looks
       app-specific up there was hand-added and is living on borrowed time. */
    const sus = [...base.matchAll(/^\.([a-z][\w-]*)\s*\{/gm)]
      .map((m) => m[1])
      .filter((c) => !BASE_CLASSES.has(c));
    if (sus.length) {
      fail(slug, 'css-placement',
        `${sus.length} app rule(s) above the END sentinel, the next design:apply will delete them: .${[...new Set(sus)].slice(0, 6).join(', .')}`);
    }
    checked++;
  }
}
/* Classes the generated base legitimately defines. Derived from the base of an
   app that has never been hand-edited, so this cannot drift as tokens are added. */
const BASE_CLASSES = (() => {
  const END = '/* ▲▲▲ END SWS STUDIO BASE ▲▲▲ */';
  /* The reference has to be an app that actually CARRIES the generated base.
     This used to take the first app with an index.html, which is astravault,
     and astravault is build output from another repo with no base block at all.
     So the reference set came back empty and every one of the twenty four apps
     was reported as having twenty eight stray rules. Twenty four false alarms
     is how a guard gets ignored, and then deleted, and then the real one slips
     through. Take the biggest base block found instead, which is the fullest
     one and cannot be an app that never had it applied. */
  let best = '';
  for (const s of slugs) {
    const p = join(APPS, s, 'index.html');
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    const end = html.indexOf(END);
    if (end === -1) continue;
    const base = html.slice(0, end);
    if (base.length > best.length) best = base;
  }
  return new Set([...best.matchAll(/^\.([a-z][\w-]*)\s*\{/gm)].map((m) => m[1]));
})();

/* ── 2. no interactive control may be invisible or stacked ──────────────────
   Born from the planner: thirty merge arrows and forty-eight paint handles all
   rendered at ONE coordinate on a narrow screen, because a media query removed
   the containing block they positioned against. Every one of them was in the
   DOM, had a handler, and passed every test, and a teacher saw a pile of
   arrows that did nothing. Checked at phone width, because that is the width
   nobody was looking at. */
async function guardControls(slug) {
  await withApp(slug, async ({ page }) => {
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      /* Reachable means: has a box, is on screen, and is not inside a dialog
         that is shut. A skip link parked at y=-81 until focused is not stacked
         with anything, and a button inside a closed <dialog> is not clickable
         by a person, judging either produces noise that gets the guard
         deleted, which is worse than not having it. */
      const vis = (e) => {
        const b = e.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return false;
        if (b.bottom < 0 || b.right < 0) return false;
        const dlg = e.closest('dialog');
        if (dlg && !dlg.open) return false;
        return true;
      };
      const key = (e) => { const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)}`; };
      const ctrls = [...document.querySelectorAll('button, [role="button"], a[href], input, select, textarea')]
        .filter(vis)
        .filter((e) => !e.disabled);
      const spots = new Map();
      for (const c of ctrls) {
        const k = key(c);
        if (!spots.has(k)) spots.set(k, []);
        spots.get(k).push(c.getAttribute('aria-label') || c.textContent.trim().slice(0, 24) || c.tagName);
      }
      const stacked = [...spots.entries()].filter(([, v]) => v.length > 1);
      /* A control smaller than 24px square is a control nobody can hit on a
         phone. WCAG 2.5.8 wants 24; the studio's own rule is 44 for anything
         primary, but 24 is the line worth failing a build over. */
      /* WCAG 2.5.8 exempts a link sitting inside a sentence, a footer that
         reads "A free tool by Sky Wolf Studio · Privacy" is prose, not a
         tap target, and padding it to 24px would wreck the line. */
      const inlineLink = (e) => e.tagName === 'A'
        && getComputedStyle(e).display.startsWith('inline')
        && e.parentElement && e.parentElement.textContent.trim().length > e.textContent.trim().length + 3;
      /* Measure what a finger can actually hit, not the widget. A 20px
         checkbox with a label beside it is a target the width of the label,
         because clicking the label toggles it, and a 1x1 input behind a
         styled label is that pattern taken to its conclusion. Measuring the
         input alone reports five false failures and teaches everyone to
         ignore the guard. */
      const target = (e) => {
        let r = e.getBoundingClientRect();
        const lab = e.labels && e.labels[0] ? e.labels[0] : e.closest('label');
        if (lab) {
          const l = lab.getBoundingClientRect();
          if (l.width > 0 && l.height > 0) {
            r = { width: Math.max(r.width, l.width), height: Math.max(r.height, l.height) };
          }
        }
        return r;
      };
      const tiny = ctrls
        .filter((e) => !inlineLink(e))
        .filter((e) => { const b = target(e); return b.width < 24 || b.height < 24; })
        .map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 24) || e.tagName);
      return { total: ctrls.length, stacked: stacked.map(([k, v]) => `${v.length}@${k}: ${v.slice(0, 3).join(' / ')}`), tiny: [...new Set(tiny)] };
    });
    if (r.stacked.length) fail(slug, 'stacked-controls', `${r.stacked.length} position(s) hold more than one control, only the top one is clickable: ${r.stacked.slice(0, 2).join(' | ')}`);
    if (r.tiny.length) fail(slug, 'tiny-controls', `${r.tiny.length} control(s) under 24px: ${r.tiny.slice(0, 4).join(', ')}`);
    checked++;
  }, { width: 414, height: 900 });
}

/* ── 3. no handler may throw ────────────────────────────────────────────────
   Born from `toast is not a function`. The merge arrow called a global that
   did not exist, so it threw and did nothing, on the two commonest clicks in
   the feature. A console error during ordinary use is a shipped defect, so
   this clicks everything reachable and fails on the first uncaught error. */
async function guardHandlers(slug) {
  await withApp(slug, async ({ page, errors }) => {
    await page.waitForTimeout(300);
    const n = await page.evaluate(() => document.querySelectorAll('button:not([disabled])').length);
    for (let i = 0; i < Math.min(n, 40); i++) {
      await page.evaluate((idx) => {
        const b = [...document.querySelectorAll('button:not([disabled])')][idx];
        if (!b) return;
        const dlg = b.closest('dialog');
        if (dlg && !dlg.open) return;          // not reachable by a person
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const t = (b.textContent || '').toLowerCase();
        /* Skip the genuinely destructive and the navigational, this guard is
           about handlers that explode, not about driving the whole app. */
        if (/delete|clear|reset|remove everything|start over|print/.test(t)) return;
        b.click();
      }, i).catch(() => {});
      await page.waitForTimeout(35);
    }
    const missing = errors.filter((e) => /requestfailed/i.test(e));
    const real = errors.filter((e) => !/favicon|manifest|ServiceWorker|requestfailed/i.test(e));
    if (real.length) fail(slug, 'throwing-handler', `${real.length} uncaught error(s): ${real[0].slice(0, 120)}`);
    if (missing.length) fail(slug, 'missing-asset', `${missing.length} request(s) failed, the page references a file that is not there: ${missing[0].split('/').pop().slice(0, 60)}`);
    checked++;
  }, { width: 414, height: 900 });
}

/* ── 4. what is deployed must be what is built ──────────────────────────────
   Born from claiming "deployed, go look" while verifying with curl, which
   bypasses both the CDN cache and the service worker. The only honest check is
   a real browser against the real URL with no cache, compared to the file on
   disk. */
async function guardLive(slug) {
  const { chromium } = await import('playwright-core');
  const b = await chromium.launch();
  try {
    const page = await (await b.newContext()).newPage();
    await page.goto(`${ORIGIN}/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const liveLen = (await page.content()).length;
    const localLen = readFileSync(join(APPS, slug, 'index.html'), 'utf8').length;
    /* Rendered DOM is never byte-identical to source; a large divergence is
       what a stale deploy looks like. */
    const drift = Math.abs(liveLen - localLen) / Math.max(localLen, 1);
    if (drift > 0.4) fail(slug, 'stale-deploy', `live document is ${Math.round(drift * 100)}% different from the local build, deploy may be stale`);
    const cc = await page.evaluate(async () => {
      const r = await fetch(location.href, { cache: 'no-store' });
      return r.headers.get('cache-control');
    });
    if (cc && /max-age=[1-9]/.test(cc) && !/no-cache/.test(cc)) {
      fail(slug, 'cached-document', `document served with "${cc}", a deploy will not be visible until it expires`);
    }
    checked++;
  } catch (e) {
    fail(slug, 'live-unreachable', String(e).split('\n')[0].slice(0, 100));
  } finally { await b.close(); }
}

/* ── 5. a worker may only ever delete its OWN caches ────────────────────────
   caches.keys() is ORIGIN-wide. This origin hosts every app in the studio, so
   an activate handler that deletes "every key that is not mine" wipes the
   offline shell of all thirty siblings the first time anyone opens that one
   app. It is not theoretical: it shipped on lucidwinds.com and black screened
   the fleet, Hush carries the scar in its own worker comments, and on
   2026-08-21 an audit found three apps here doing it again (cross-off,
   overload, specials-planner) while every other app used a prefix filter.

   Greps are not enough. A worker can spell the filter a dozen ways, so this
   RUNS the real worker in a sandbox against a fake fleet of sibling caches and
   asserts it only ever deletes its own. A guard that tests behaviour survives
   a rewrite of the code it guards. */
async function guardWorkerCacheScope(slug) {
  const swPath = join(APPS, slug, 'sw.js');
  if (!existsSync(swPath)) return;
  const src = readFileSync(swPath, 'utf8');

  /* A fleet's worth of neighbours, plus one stale cache belonging to this app
     so we can prove the worker still does its real job. */
  const own = [...src.matchAll(/["'`]([a-z0-9][\w-]*?-v?\d+)["'`]/gi)].map((m) => m[1]);
  const mine = own[0] || `${slug}-v0`;
  const myPrefix = mine.replace(/v?\d+$/, '');
  const stale = `${myPrefix}0-stale`;
  /* Neighbours must be names this app could never legitimately own, or the
     guard reports its own fixture. Anything sharing this app's prefix is its
     property to delete, so it is filtered out before the run. */
  const neighbours = ['hush-shell-v12', 'grocery-v7', 'seating-v3', 'sws-portal-v4',
    'workbox-precache', 'zz-foreign-sentinel-v1']
    .filter((k) => !k.startsWith(myPrefix));
  const fleet = [...neighbours, stale, mine];

  const deleted = [];
  const listeners = {};
  const box = {
    console: { log() {}, warn() {}, error() {} },
    caches: {
      keys: () => Promise.resolve(fleet.slice()),
      delete: (k) => { deleted.push(k); return Promise.resolve(true); },
      open: () => Promise.resolve({ put: () => Promise.resolve(), addAll: () => Promise.resolve(), add: () => Promise.resolve(), match: () => Promise.resolve(undefined) }),
      match: () => Promise.resolve(undefined),
    },
    fetch: () => Promise.resolve({ ok: true, status: 200, clone: () => ({}) }),
    Response: class { constructor(b, i) { this.body = b; Object.assign(this, i); } },
    URL, setTimeout, clearTimeout, Promise,
  };
  box.self = {
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    location: { origin: ORIGIN },
    registration: { scope: `${ORIGIN}/${slug}/` },
  };
  box.addEventListener = box.self.addEventListener;
  box.location = box.self.location;
  box.skipWaiting = box.self.skipWaiting;

  try {
    vm.createContext(box);
    vm.runInContext(src, box);
  } catch (e) {
    fail(slug, 'worker-parse', `sw.js did not run in a sandbox: ${String(e.message).slice(0, 90)}`);
    return;
  }
  if (typeof listeners.activate !== 'function') { checked++; return; }

  let waited = null;
  try { listeners.activate({ waitUntil: (p) => { waited = p; } }); } catch { /* handled below */ }
  try { await Promise.resolve(waited); } catch { /* a rejected activate is its own problem */ }

  const strangers = deleted.filter((k) => neighbours.includes(k));
  if (strangers.length) {
    fail(slug, 'worker-cache-scope',
      `activate deletes ${strangers.length} sibling cache(s) on the shared origin: ${strangers.join(', ')}. Filter on this app's own prefix.`);
  }
  checked++;
}

/* ── run ────────────────────────────────────────────────────────────────── */
console.log(`\nguards, ${slugs.length} apps${LIVE ? ' + live' : ''}\n`);
guardCssPlacement();
for (const slug of slugs) {
  try {
    await guardControls(slug);
    await guardHandlers(slug);
    await guardWorkerCacheScope(slug);
    if (LIVE) await guardLive(slug);
  } catch (e) {
    fail(slug, 'guard-crashed', String(e).split('\n')[0].slice(0, 120));
  }
}

if (!fails.length) {
  console.log(`  ${checked} checks, nothing to report.\n`);
  process.exit(0);
}
const byGuard = {};
for (const f of fails) (byGuard[f.guard] ||= []).push(f);
for (const [guard, list] of Object.entries(byGuard)) {
  console.log(`  ${guard}  (${list.length})`);
  for (const f of list) console.log(`    ${f.slug.padEnd(18)} ${f.msg}`);
  console.log('');
}
console.log(`  ${fails.length} problem(s) across ${checked} checks.\n`);
process.exit(1);
