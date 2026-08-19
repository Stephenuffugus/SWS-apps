#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, the standard stress battery

     node design/stress.mjs                 every app
     node design/stress.mjs qr-maker        one app
     node design/stress.mjs --json          machine-readable

   Runs the same hostile battery against every app, so results are comparable
   and nobody has to reinvent the rig. It is deliberately app-agnostic: it
   discovers the controls on the page and abuses them. App-specific scenarios
   belong on top of this, not instead of it.

   What it does NOT do is judge. It reports what happened; deciding whether a
   3-second render or a 40px button is acceptable for that app is a person's
   job.

   Exit code is non-zero if any HARD failure is found, a console error, a
   crash, NaN reaching the screen, or sideways scroll.
   ═══════════════════════════════════════════════════════════════════════════ */

import { withApp } from './harness.mjs';
import { SKINS } from './skins.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'apps');

const asJson = process.argv.includes('--json');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const slugs = Object.keys(SKINS).filter((s) => !only.length || only.includes(s));

/* Text that has broken a real form somewhere. Each is here for a reason:
   injection, layout blowout, bidi, combining marks, a word with no break
   opportunity, and the empty-looking-but-not-empty case. */
const HOSTILE = [
  '<script>alert(1)</script>',
  '<img src=x onerror="document.title=1">',
  'A'.repeat(500),
  'x '.repeat(1000),
  '👶🏽‍🍼👨‍👩‍👧‍👦🇺🇸✅🔥',
  'مرحبا بالعالم שלום עולם',
  'é́́́́́́́́́',
  '   ',
  '\n\n\n',
  '"; DROP TABLE x; --',
  '=1+1',            // spreadsheet formula injection, for the CSV exporters
  '../../etc/passwd',
];

const NUMBERS = ['0', '-1', '-999999', '1e9', '0.0001', 'abc', '', '1/2', 'Infinity', '99999999999999999999'];

/** Values that should never be rendered to a user. */
const POISON = /\b(NaN|undefined|null|Infinity|\[object Object\])\b/;

const report = [];

function record(slug, name, o) {
  report.push({ slug, name, ...o });
}

async function runApp(slug) {
  if (!existsSync(join(ROOT, slug, 'index.html'))) return;

  await withApp(slug, async ({ page, errors, overflow, offenders, smallTargets, axe, storage }) => {
    /* ── 1. Layout under every comfort setting ─────────────────────────── */
    const LAYOUTS = [
      { name: '320px', width: 320, prefs: null },
      { name: '414px', width: 414, prefs: null },
      { name: '414px + largest text', width: 414, prefs: { text: 'xxl' } },
      { name: '414px + roomy', width: 414, prefs: { density: 'roomy' } },
      { name: '1280px', width: 1280, prefs: null },
    ];

    for (const l of LAYOUTS) {
      await page.setViewportSize({ width: l.width, height: 900 });
      await page.evaluate((p) => {
        if (p) localStorage.setItem('sws.prefs', JSON.stringify(p));
        else localStorage.removeItem('sws.prefs');
      }, l.prefs);
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const px = await overflow();
      record(slug, `layout ${l.name}`, {
        overflow: px,
        hard: px > 2,
        detail: px > 2 ? JSON.stringify((await offenders()).slice(0, 4)) : '',
      });
    }

    await page.setViewportSize({ width: 414, height: 900 });
    await page.evaluate(() => localStorage.removeItem('sws.prefs'));
    await page.reload({ waitUntil: 'load' });

    /* ── 2. Touch targets ──────────────────────────────────────────────── */
    const small = await smallTargets();
    // The header chrome is deliberately a 36px pill; WCAG 2.2 asks 24.
    const realSmall = small.filter((t) => !/swsPrefsBtn|tipLink/.test(t.sel) && t.h < 32);
    record(slug, 'touch targets under 32px', {
      count: realSmall.length,
      hard: false,
      detail: JSON.stringify(realSmall.slice(0, 6)),
    });

    /* ── 3. Hostile text into every text field ─────────────────────────── */
    const textFields = await page.$$('input[type=text],input[type=search],input[type=url],input[type=email],input:not([type]),textarea');
    let filled = 0;
    for (const f of textFields) {
      for (const s of HOSTILE) {
        try {
          await f.fill(s, { timeout: 1500 });
          await f.dispatchEvent('input');
          await f.dispatchEvent('change');
          filled++;
        } catch { /* not fillable in this state, fine */ }
      }
    }
    await page.waitForTimeout(250);

    const afterText = await page.evaluate((poisonSrc) => {
      const poison = new RegExp(poisonSrc);
      return {
        injectedScripts: document.querySelectorAll('script:not([src])').length,
        injectedImgs: [...document.querySelectorAll('img')].filter((i) => i.getAttribute('src') === 'x').length,
        titleHijacked: document.title === '1',
        poisonOnScreen: poison.test(document.body.innerText || ''),
        sample: (document.body.innerText || '').match(poison)?.[0] ?? null,
      };
    }, POISON.source);

    record(slug, 'hostile text', {
      fieldsFilled: filled,
      hard: afterText.injectedImgs > 0 || afterText.titleHijacked,
      detail: JSON.stringify(afterText),
    });

    /* ── 4. Numeric edges ──────────────────────────────────────────────── */
    const numFields = await page.$$('input[type=number]');
    for (const f of numFields) {
      for (const n of NUMBERS) {
        try {
          await f.fill(n, { timeout: 1500 });
          await f.dispatchEvent('input');
          await f.dispatchEvent('change');
        } catch { /* rejected by the control, fine */ }
      }
    }
    await page.waitForTimeout(250);
    const poisonAfterNums = await page.evaluate((src) => {
      const re = new RegExp(src);
      const t = document.body.innerText || '';
      return { hit: re.test(t), sample: t.match(re)?.[0] ?? null };
    }, POISON.source);
    record(slug, 'numeric edges', {
      fields: numFields.length,
      hard: poisonAfterNums.hit,
      detail: poisonAfterNums.hit ? `renders "${poisonAfterNums.sample}"` : 'clean',
    });

    /* ── 5. Rapid interaction / double submit ──────────────────────────── */
    await page.reload({ waitUntil: 'load' });
    const primary = await page.$('.btn.primary:not([disabled]), button.primary:not([disabled])');
    let rapid = 'no primary button found';
    if (primary) {
      const before = await page.evaluate(() => document.body.innerText.length);
      const t0 = Date.now();
      for (let i = 0; i < 30; i++) {
        try { await primary.click({ timeout: 800, force: true }); } catch { break; }
      }
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => document.body.innerText.length);
      rapid = `30 clicks in ${Date.now() - t0}ms, content ${before}→${after} chars`;
    }
    record(slug, 'rapid clicking the primary action', {
      hard: errors.length > 0,
      detail: rapid,
    });

    /* ── 6. Bulk data ──────────────────────────────────────────────────── */
    /* Generic: hammer the first text input + primary button 200 times, which
       is how most of these apps add a row. Apps that do not work that way
       simply report a small number here, which is itself informative. */
    await page.reload({ waitUntil: 'load' });
    const bulk = await page.evaluate(async () => {
      const input = document.querySelector('input[type=text]:not([disabled]), input:not([type]):not([disabled])');
      const btn = document.querySelector('.btn.primary:not([disabled]), form button:not([disabled])');
      if (!input || !btn) return { ran: false };
      const t0 = performance.now();
      for (let i = 0; i < 200; i++) {
        input.value = `Stress item ${i}, a realistically long entry name`;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        btn.click();
      }
      const add = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        ran: true,
        addMs: Math.round(add),
        nodes: document.querySelectorAll('li,tr').length,
        textLen: document.body.innerText.length,
      };
    });
    const store = await storage();
    record(slug, 'bulk: 200 rapid adds', {
      hard: false,
      detail: `${JSON.stringify(bulk)} storage=${store.bytes}B`,
    });

    if (bulk.ran && bulk.nodes > 20) {
      const px = await overflow();
      record(slug, 'layout with 200 items', { overflow: px, hard: px > 2, detail: '' });
      const scrollMs = await page.evaluate(async () => {
        const t0 = performance.now();
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => requestAnimationFrame(r));
        window.scrollTo(0, 0);
        await new Promise((r) => requestAnimationFrame(r));
        return Math.round(performance.now() - t0);
      });
      record(slug, 'scroll with 200 items', { hard: false, detail: `${scrollMs}ms for two jumps` });
    }

    /* ── 7. Reload persistence ─────────────────────────────────────────── */
    const beforeReload = await page.evaluate(() => document.body.innerText.length);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const afterReload = await page.evaluate(() => document.body.innerText.length);
    record(slug, 'survives reload', {
      hard: false,
      detail: `content ${beforeReload}→${afterReload} chars (${afterReload > beforeReload * 0.6 ? 'persisted' : 'LOST'})`,
    });

    /* ── 8. Corrupt storage ────────────────────────────────────────────── */
    /* A half-written localStorage value is not exotic, it is what a tab
       killed mid-write leaves behind. The app must still boot. */
    const keys = Object.keys((await storage()).keys).filter((k) => k !== 'sws.prefs');
    let corrupt = 'no app storage key to corrupt';
    if (keys.length) {
      await page.evaluate((ks) => ks.forEach((k) => localStorage.setItem(k, '{"broken":')), keys);
      const before = errors.length;
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(500);
      const booted = await page.evaluate(() => document.body.innerText.trim().length > 50);
      corrupt = `keys=${keys.join(',')} booted=${booted} newErrors=${errors.length - before}`;
      record(slug, 'boots with corrupt storage', {
        hard: !booted,
        detail: corrupt,
      });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
    } else {
      record(slug, 'boots with corrupt storage', { hard: false, detail: corrupt });
    }

    /* ── 9. Keyboard reachability ──────────────────────────────────────── */
    const kb = await page.evaluate(() => {
      const focusable = [...document.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
        });
      const unreachable = focusable.filter((el) => el.tabIndex < 0);
      /* `el.value` is NOT a name source. Counting it meant a field the battery
         had just typed into looked labelled, so this check silently passed on
         any app whose inputs were filled earlier in the run. */
      const nameOf = (el) => (
        el.getAttribute('aria-label') ||
        (el.getAttribute('aria-labelledby') || '')
          .split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ') ||
        [...(el.labels || [])].map((l) => l.textContent).join(' ') ||
        el.getAttribute('title') ||
        (el.tagName === 'BUTTON' || el.tagName === 'A' ? el.textContent : '') ||
        ''
      ).trim();

      const unnamed = focusable.filter((el) => !nameOf(el));

      /* A placeholder is not a label. It disappears the moment someone types,
         which is exactly when they most need to know what the field was, and it leaves anyone who paused mid-form with a row of empty boxes. */
      const placeholderOnly = focusable.filter((el) => !nameOf(el) && el.getAttribute('placeholder'));

      return {
        focusable: focusable.length,
        unreachable: unreachable.length,
        unnamed: unnamed.map((e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '')).slice(0, 8),
        placeholderOnly: placeholderOnly.map((e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '')).slice(0, 8),
      };
    });
    record(slug, 'keyboard reachability', {
      hard: kb.unnamed.length > 0,
      detail: JSON.stringify(kb),
    });

    /* ── 10. axe AFTER interacting ─────────────────────────────────────── */
    /* Most of these apps render their real UI from JS, so a load-time scan
       sees an empty shell. This is the scan that counts. */
    const v = await axe();
    record(slug, 'axe after interaction', {
      count: v.length,
      hard: v.some((x) => x.impact === 'critical' || x.impact === 'serious'),
      detail: v.map((x) => `${x.impact}:${x.id}(${x.nodes})`).join(' ') || 'clean',
    });

    /* ── 11. Print ─────────────────────────────────────────────────────── */
    await page.emulateMedia({ media: 'print' });
    const print = await page.evaluate(() => {
      const tinted = [...document.querySelectorAll('body *')].filter((el) => {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;
        const m = bg.match(/\d+/g);
        if (!m) return false;
        // A dark fill on paper means the label on it disappears when the
        // browser prints with background graphics off, which is the default.
        return (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3 < 140;
      });
      return {
        widthPx: document.documentElement.scrollWidth,
        darkFills: tinted.length,
        sample: tinted.slice(0, 3).map((e) => e.tagName.toLowerCase() +
          (typeof e.className === 'string' && e.className ? `.${e.className.trim().split(/\s+/)[0]}` : '')),
      };
    });
    record(slug, 'print', { hard: false, detail: JSON.stringify(print) });
    await page.emulateMedia({ media: 'screen' });

    /* ── 12. Everything the console said, across the whole run ─────────── */
    record(slug, 'console over the whole run', {
      count: errors.length,
      hard: errors.length > 0,
      detail: errors.slice(0, 8).join(' | '),
    });
  }, { width: 414, height: 900 });
}

for (const slug of slugs) {
  try {
    await runApp(slug);
  } catch (e) {
    record(slug, 'RUN FAILED', { hard: true, detail: String(e).split('\n')[0] });
  }
  if (!asJson) process.stdout.write('.');
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const hard = report.filter((r) => r.hard);
const byApp = new Map();
for (const r of report) {
  if (!byApp.has(r.slug)) byApp.set(r.slug, []);
  byApp.get(r.slug).push(r);
}

console.log(`\n\nStress battery, ${slugs.length} app(s)\n`);
for (const [slug, rows] of byApp) {
  const bad = rows.filter((r) => r.hard);
  console.log(`\n${slug}  ${bad.length ? `${bad.length} HARD` : 'clean'}`);
  for (const r of rows) {
    const flag = r.hard ? '!!' : '  ';
    console.log(`  ${flag} ${r.name.padEnd(34)} ${String(r.detail ?? '').slice(0, 150)}`);
  }
}

console.log(`\n${hard.length} hard failure(s) across ${slugs.length} app(s)`);
process.exit(hard.length ? 1 : 0);
