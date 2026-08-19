#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — guards

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
import { withApp } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS = join(HERE, '..', 'apps');
const ORIGIN = 'https://sws-apps-9646d.web.app';
const LIVE = process.argv.includes('--live');

const slugs = readdirSync(APPS)
  .filter((d) => existsSync(join(APPS, d, 'index.html')))
  .sort();

const fails = [];
const fail = (slug, guard, msg) => fails.push({ slug, guard, msg });
let checked = 0;

/* ── 1. app CSS must live below the sentinel ────────────────────────────────
   design/apply.mjs replaces everything between the sentinels on every run. CSS
   written above the END sentinel is deleted by the next build — silently, and
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
        `${sus.length} app rule(s) above the END sentinel — the next design:apply will delete them: .${[...new Set(sus)].slice(0, 6).join(', .')}`);
    }
    checked++;
  }
}
/* Classes the generated base legitimately defines. Derived from the base of an
   app that has never been hand-edited, so this cannot drift as tokens are added. */
const BASE_CLASSES = (() => {
  const ref = slugs.find((s) => existsSync(join(APPS, s, 'index.html')));
  const html = readFileSync(join(APPS, ref, 'index.html'), 'utf8');
  const end = html.indexOf('/* ▲▲▲ END SWS STUDIO BASE ▲▲▲ */');
  const base = end === -1 ? '' : html.slice(0, end);
  return new Set([...base.matchAll(/^\.([a-z][\w-]*)\s*\{/gm)].map((m) => m[1]));
})();

/* ── 2. no interactive control may be invisible or stacked ──────────────────
   Born from the planner: thirty merge arrows and forty-eight paint handles all
   rendered at ONE coordinate on a narrow screen, because a media query removed
   the containing block they positioned against. Every one of them was in the
   DOM, had a handler, and passed every test — and a teacher saw a pile of
   arrows that did nothing. Checked at phone width, because that is the width
   nobody was looking at. */
async function guardControls(slug) {
  await withApp(slug, async ({ page }) => {
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      /* Reachable means: has a box, is on screen, and is not inside a dialog
         that is shut. A skip link parked at y=-81 until focused is not stacked
         with anything, and a button inside a closed <dialog> is not clickable
         by a person — judging either produces noise that gets the guard
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
      /* WCAG 2.5.8 exempts a link sitting inside a sentence — a footer that
         reads "A free tool by Sky Wolf Studio · Privacy" is prose, not a
         tap target, and padding it to 24px would wreck the line. */
      const inlineLink = (e) => e.tagName === 'A'
        && getComputedStyle(e).display.startsWith('inline')
        && e.parentElement && e.parentElement.textContent.trim().length > e.textContent.trim().length + 3;
      /* Measure what a finger can actually hit, not the widget. A 20px
         checkbox with a label beside it is a target the width of the label,
         because clicking the label toggles it — and a 1x1 input behind a
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
    if (r.stacked.length) fail(slug, 'stacked-controls', `${r.stacked.length} position(s) hold more than one control — only the top one is clickable: ${r.stacked.slice(0, 2).join(' | ')}`);
    if (r.tiny.length) fail(slug, 'tiny-controls', `${r.tiny.length} control(s) under 24px: ${r.tiny.slice(0, 4).join(', ')}`);
    checked++;
  }, { width: 414, height: 900 });
}

/* ── 3. no handler may throw ────────────────────────────────────────────────
   Born from `toast is not a function`. The merge arrow called a global that
   did not exist, so it threw and did nothing — on the two commonest clicks in
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
        /* Skip the genuinely destructive and the navigational — this guard is
           about handlers that explode, not about driving the whole app. */
        if (/delete|clear|reset|remove everything|start over|print/.test(t)) return;
        b.click();
      }, i).catch(() => {});
      await page.waitForTimeout(35);
    }
    const missing = errors.filter((e) => /requestfailed/i.test(e));
    const real = errors.filter((e) => !/favicon|manifest|ServiceWorker|requestfailed/i.test(e));
    if (real.length) fail(slug, 'throwing-handler', `${real.length} uncaught error(s): ${real[0].slice(0, 120)}`);
    if (missing.length) fail(slug, 'missing-asset', `${missing.length} request(s) failed — the page references a file that is not there: ${missing[0].split('/').pop().slice(0, 60)}`);
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
    if (drift > 0.4) fail(slug, 'stale-deploy', `live document is ${Math.round(drift * 100)}% different from the local build — deploy may be stale`);
    const cc = await page.evaluate(async () => {
      const r = await fetch(location.href, { cache: 'no-store' });
      return r.headers.get('cache-control');
    });
    if (cc && /max-age=[1-9]/.test(cc) && !/no-cache/.test(cc)) {
      fail(slug, 'cached-document', `document served with "${cc}" — a deploy will not be visible until it expires`);
    }
    checked++;
  } catch (e) {
    fail(slug, 'live-unreachable', String(e).split('\n')[0].slice(0, 100));
  } finally { await b.close(); }
}

/* ── run ────────────────────────────────────────────────────────────────── */
console.log(`\nguards — ${slugs.length} apps${LIVE ? ' + live' : ''}\n`);
guardCssPlacement();
for (const slug of slugs) {
  try {
    await guardControls(slug);
    await guardHandlers(slug);
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
