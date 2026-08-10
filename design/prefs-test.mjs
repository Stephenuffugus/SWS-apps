#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — comfort panel, driven in a real browser

     node design/prefs-test.mjs            all 23 apps
     node design/prefs-test.mjs qr-maker   one app

   This does not check that the CSS "looks right". It drives the panel the way
   a person would — open it, press an option, reload, open a different app —
   and asserts the thing the user actually wanted happened: the text really got
   bigger, the page really went dark, the choice really survived a reload, and
   it really carried across to the next app.

   Every assertion is a measurement (computed styles, element boxes), not a
   check that an attribute was written. An attribute that lands on <html> while
   the stylesheet ignores it is exactly the bug this has to catch.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'apps');

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const slugs = Object.keys(SKINS).filter((s) => !only.length || only.includes(s));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = (slug) => `http://127.0.0.1:${port}/${slug}/`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();

const fails = [];
const notes = [];
const fail = (slug, msg) => fails.push(`${slug}: ${msg}`);

/** Relative luminance, for "did the page actually get darker" questions. */
const lum = (rgb) => {
  const m = String(rgb).match(/\d+(\.\d+)?/g);
  if (!m) return null;
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* Press an option by its visible label inside a named group. Going through the
   real label means this exercises the same path a mouse does, including the
   :has(input:checked) styling contract. */
async function choose(page, legendText, optionLabel) {
  await page.getByRole('button', { name: /display and comfort/i }).click();
  const group = page.locator('#swsPrefs fieldset', { hasText: legendText }).first();
  await group.getByText(optionLabel, { exact: true }).click();
  await page.locator('#swsPrefs .sws-foot .btn.primary').click();
  await page.waitForTimeout(60);
}

const measure = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const h = document.querySelector('h1, .hero h2');

  /* A custom property's computed value is its TOKEN TEXT — getPropertyValue
     hands back "calc(16px * 0.8)" and "max(44px, ...)", never a length. Read
     them off a throwaway element that actually has to lay out, so the numbers
     below are the ones the browser really used. */
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;visibility:hidden;height:var(--s4);width:var(--tap)';
  document.body.appendChild(probe);
  const r = probe.getBoundingClientRect();
  const s4px = r.height;
  const tapPx = r.width;
  probe.remove();

  return {
    rootPx: parseFloat(cs.fontSize),
    canvas: body.backgroundColor,
    bodyPx: parseFloat(body.fontSize),
    letter: body.letterSpacing,
    s4px,
    tapPx,
    theme: document.documentElement.getAttribute('data-theme'),
    displayFont: h ? getComputedStyle(h).fontFamily : '',
    tintShown: getComputedStyle(document.body, '::after').display,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

for (const slug of slugs) {
  if (!existsSync(join(ROOT, slug, 'index.html'))) continue;

  // One context per app = one clean origin. Prefs are per-origin, and a leaked
  // setting from the previous app would make every later assertion a lie.
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 414, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

  try {
    await page.goto(url(slug), { waitUntil: 'load', timeout: 20000 });

    /* 1. The trigger exists, is reachable, and is named. */
    const btn = page.getByRole('button', { name: /display and comfort/i });
    if (await btn.count() === 0) { fail(slug, 'no settings button in the header'); throw new Error('stop'); }

    /* 44, not 32. This control exists for people with access needs; holding it
       to a lower bar than the rest of the system was indefensible, and two
       independent review agents said so. */
    const box = await btn.boundingBox();
    if (!box || box.width < 44 || box.height < 44) {
      fail(slug, `settings button is ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'unmeasurable'}, under the 44px floor`);
    }

    /* It has to sit on the title's line. Landing anywhere inside the header is
       not good enough — appended to the wrong container it ends up stranded on
       its own row under the app name, which looks like a mistake because it is
       one. Vertical overlap with the <h1> is the check. */
    const inRow = await page.evaluate(() => {
      const b = document.getElementById('swsPrefsBtn')?.getBoundingClientRect();
      const h = document.querySelector('header h1, header .logo, header .brandrow')?.getBoundingClientRect();
      if (!b || !h) return null;
      return Math.min(b.bottom, h.bottom) - Math.max(b.top, h.top);
    });
    if (inRow !== null && inRow <= 0) {
      fail(slug, 'settings button is on its own line instead of beside the app title');
    }

    const base = await measure(page);

    /* 2. The panel opens as a modal and takes focus. */
    await btn.click();
    const open = await page.evaluate(() => {
      const d = document.getElementById('swsPrefs');
      return { exists: !!d, open: d?.open, modal: d?.matches(':modal'), focusInside: d?.contains(document.activeElement) };
    });
    if (!open.exists) fail(slug, 'panel never got built');
    if (!open.open) fail(slug, 'panel did not open');
    if (!open.modal) fail(slug, 'panel opened non-modally — Esc and focus trapping are lost');
    if (!open.focusInside) fail(slug, 'focus stayed outside the open dialog');

    /* The footer must be inside the dialog and inside the viewport. The first
       build guessed the scroller's height with a fixed calc(), and as soon as
       the note wrapped to three lines Done and Reset were pushed out of the
       box — the panel opened fine and could not be dismissed by button. */
    const foot = await page.evaluate(() => {
      const d = document.getElementById('swsPrefs').getBoundingClientRect();
      const b = document.querySelector('#swsPrefs .sws-foot .btn.primary')?.getBoundingClientRect();
      const n = document.querySelector('#swsPrefs .sws-note');
      if (!b || !n) return null;
      return {
        below: Math.round(b.bottom - d.bottom),
        offscreen: Math.round(b.bottom - window.innerHeight),
        noteClipped: n.scrollHeight - n.clientHeight,
      };
    });
    if (!foot) fail(slug, 'panel footer is missing');
    else {
      if (foot.below > 1) fail(slug, `Done button sits ${foot.below}px past the dialog's own bottom edge`);
      if (foot.offscreen > 1) fail(slug, `Done button is ${foot.offscreen}px below the viewport`);
      if (foot.noteClipped > 1) fail(slug, `footer note is clipped by ${foot.noteClipped}px`);
    }

    /* Selecting an option must not resize its chip, or the row reflows under
       the finger that just tapped it. */
    const jitter = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#swsPrefs fieldset')][0]
        ?.querySelectorAll('.opt label') ?? [];
      const on = [...labels].find((l) => l.querySelector('input').checked);
      const off = [...labels].find((l) => !l.querySelector('input').checked);
      if (!on || !off) return 0;
      // Same text length would confound this; compare the non-text furniture
      // by measuring the ::before slot, which is the only width selection adds.
      const w = (el) => parseFloat(getComputedStyle(el, '::before').width);
      return Math.abs(w(on) - w(off));
    });
    if (jitter > 0.5) fail(slug, `selected chip reserves ${jitter}px more than an unselected one — the row will shift on tap`);

    /* Esc must close it. Native <dialog> gives this away for free, so a
       failure here means something swallowed the key. */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    if (await page.evaluate(() => document.getElementById('swsPrefs').open)) {
      fail(slug, 'Escape did not close the panel');
    }

    /* 3. Text size does something measurable, and does not break the layout. */
    await choose(page, 'Text size', 'Largest');
    const big = await measure(page);
    if (!(big.rootPx > base.rootPx * 1.35)) {
      fail(slug, `Largest text moved root from ${base.rootPx} to ${big.rootPx}px — expected ~1.5x`);
    }
    if (big.overflow > 2) fail(slug, `page scrolls sideways by ${big.overflow}px at Largest text`);
    if (big.tapPx < 44) fail(slug, `--tap fell to ${big.tapPx}px at Largest text`);
    if (!(big.tapPx > base.tapPx)) fail(slug, `--tap did not grow with the text (${base.tapPx}px to ${big.tapPx}px)`);

    /* 4. It survives a reload — this is the whole point of persisting it. */
    await page.reload({ waitUntil: 'load' });
    const afterReload = await measure(page);
    if (Math.abs(afterReload.rootPx - big.rootPx) > 0.6) {
      fail(slug, `text size did not persist: ${big.rootPx}px before reload, ${afterReload.rootPx}px after`);
    }

    await choose(page, 'Text size', 'Default');

    /* 5. Dark, chosen manually while the OS says light. */
    await choose(page, 'Appearance', 'Dark');
    const dark = await measure(page);
    const lBase = lum(base.canvas);
    const lDark = lum(dark.canvas);
    if (dark.theme !== 'dark') fail(slug, 'Dark did not set data-theme');
    if (lBase !== null && lDark !== null && !(lDark < lBase - 0.25)) {
      fail(slug, `Dark barely changed the page: luminance ${lBase?.toFixed(3)} to ${lDark?.toFixed(3)}`);
    }
    const chrome = await page.evaluate(() => {
      const un = [...document.querySelectorAll('meta[name="theme-color"]')].filter((m) => !m.hasAttribute('media'));
      return { unscoped: un.length, content: un[0]?.content ?? null };
    });
    if (chrome.unscoped !== 1) fail(slug, `expected 1 unscoped theme-color meta in dark, found ${chrome.unscoped}`);

    /* Back to Match device must fully undo it, including the meta surgery. */
    await choose(page, 'Appearance', 'Auto');
    const restored = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      unscoped: [...document.querySelectorAll('meta[name="theme-color"]')].filter((m) => !m.hasAttribute('media')).length,
      suppressed: [...document.querySelectorAll('meta[name="theme-color"][media="not all"]')].length,
    }));
    if (restored.attr !== null) fail(slug, 'Match device left data-theme behind');
    if (restored.unscoped !== 0) fail(slug, 'Match device left an unscoped theme-color meta behind');
    if (restored.suppressed !== 0) fail(slug, 'Match device left the theme-color pair suppressed');

    /* 6. Spacing moves the gaps but never the targets. */
    await choose(page, 'Spacing', 'Compact');
    const compact = await measure(page);
    if (!(compact.s4px < base.s4px)) {
      fail(slug, `Compact did not reduce spacing (--s4 stayed ${base.s4px}px)`);
    }
    if (compact.tapPx < 44) fail(slug, `Compact shrank --tap to ${compact.tapPx}px`);
    await choose(page, 'Spacing', 'Default');

    /* 7. Easier reading actually respaces the text and drops the display face. */
    await choose(page, 'Reading', 'Easier');
    const easy = await measure(page);
    if (!(parseFloat(easy.letter) > 0.3)) {
      fail(slug, `Easier reading gave letter-spacing ${easy.letter}, expected a real increase`);
    }
    if (easy.overflow > 2) fail(slug, `page scrolls sideways by ${easy.overflow}px with Easier reading on`);
    await choose(page, 'Reading', 'Default');

    /* 8. Warm tint paints, and is an overlay rather than a filter — a filter
          would reparent the fixed toast and strand it mid-page. */
    await choose(page, 'Warm tint', 'High');
    const warm = await page.evaluate(() => {
      const a = getComputedStyle(document.body, '::after');
      return {
        display: a.display, blend: a.mixBlendMode, pointer: a.pointerEvents,
        bodyFilter: getComputedStyle(document.body).filter,
        wrapFilter: getComputedStyle(document.querySelector('.wrap') ?? document.body).filter,
      };
    });
    if (warm.display === 'none') fail(slug, 'Warm tint High painted nothing');
    if (warm.blend !== 'multiply') fail(slug, `warm overlay blend is ${warm.blend}, expected multiply`);
    if (warm.pointer !== 'none') fail(slug, 'warm overlay is not click-through — it will eat every tap');
    if (warm.bodyFilter !== 'none' || warm.wrapFilter !== 'none') {
      fail(slug, 'a filter is in play — fixed-position toast/action bar will be reparented');
    }
    await choose(page, 'Warm tint', 'Off');

    /* 9. High contrast, and the frosted bar going solid. */
    await choose(page, 'Contrast', 'High');
    const hc = await page.evaluate(() => {
      const bar = document.querySelector('.actionbar');
      return {
        ink2: getComputedStyle(document.body).getPropertyValue('--ink-2').trim(),
        ink: getComputedStyle(document.body).getPropertyValue('--ink').trim(),
        barBlur: bar ? getComputedStyle(bar).backdropFilter : 'n/a',
      };
    });
    if (hc.ink2 !== hc.ink) fail(slug, `High contrast did not fold --ink-2 into --ink (${hc.ink2} vs ${hc.ink})`);
    if (hc.barBlur !== 'n/a' && hc.barBlur !== 'none') {
      fail(slug, `High contrast left the action bar blurred (${hc.barBlur})`);
    }
    await choose(page, 'Contrast', 'Auto');

    /* 10. Reset returns everything to untouched. */
    await choose(page, 'Text size', 'Larger');
    await page.getByRole('button', { name: /display and comfort/i }).click();
    await page.locator('#swsPrefs .sws-foot .btn.small', { hasText: 'Reset' }).click();
    await page.locator('#swsPrefs .sws-foot .btn.primary').click();
    await page.waitForTimeout(60);
    const reset = await page.evaluate(() => ({
      attrs: [...document.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith('data-')),
      stored: localStorage.getItem('sws.prefs'),
    }));
    if (reset.attrs.length) fail(slug, `Reset left attributes behind: ${reset.attrs.join(', ')}`);
    if (reset.stored !== null) fail(slug, `Reset left localStorage set to ${reset.stored}`);

    for (const e of errors) fail(slug, `console: ${e}`);
  } catch (e) {
    if (String(e).indexOf('stop') === -1) fail(slug, String(e).split('\n')[0]);
  }

  await ctx.close();
  process.stdout.write('.');
}

/* ── Cross-app: one origin, one setting ───────────────────────────────────
   The claim in the panel's own footer is "used across every Sky Wolf Studios
   app". This is that claim, tested: set it in the first app, then open two
   others in the same context and require it to already be in force before any
   interaction at all. */
if (slugs.length > 2) {
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 414, height: 900 } });
  const page = await ctx.newPage();
  const [a, b, c] = slugs;

  await page.goto(url(a), { waitUntil: 'load' });
  await choose(page, 'Text size', 'Largest');
  await choose(page, 'Appearance', 'Dark');
  const setIn = await measure(page);

  for (const other of [b, c]) {
    await page.goto(url(other), { waitUntil: 'load' });
    const got = await measure(page);
    if (Math.abs(got.rootPx - setIn.rootPx) > 0.6) {
      fail(other, `text size set in ${a} did not carry over (${setIn.rootPx}px vs ${got.rootPx}px)`);
    }
    if (got.theme !== 'dark') fail(other, `dark set in ${a} did not carry over`);
  }
  notes.push(`cross-app: set in ${a}, verified in ${b} and ${c}`);
  await ctx.close();
}

/* ── Anti-flash ───────────────────────────────────────────────────────────
   The reason the script is blocking and in <head>. If the attribute is not on
   <html> by the time the first stylesheet is parsed, a dark-mode user gets a
   white flash on every single navigation. Asserted by pausing the document at
   the earliest observable moment and reading the attribute there. */
{
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 414, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url(slugs[0]), { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('sws.prefs', JSON.stringify({ theme: 'dark' })));

  const early = [];
  await page.exposeFunction('__report', (v) => early.push(v));
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        // eslint-disable-next-line no-undef
        __report(document.documentElement.getAttribute('data-theme'));
      }
    }, { once: true });
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(200);
  if (early[0] !== 'dark') {
    fail(slugs[0], `theme was "${early[0]}" when the document became interactive — expected "dark" (flash of light)`);
  } else {
    notes.push('anti-flash: theme applied before the document became interactive');
  }
  await ctx.close();
}

await browser.close();
server.close();

console.log(`\n\nComfort panel: ${slugs.length} apps driven in a real browser.`);
for (const n of notes) console.log(`  ${n}`);

if (fails.length) {
  console.log(`\n${fails.length} FAILURE(S):`);
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log('  all checks pass');
