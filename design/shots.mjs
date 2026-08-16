#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — Play Store screenshots

   Screenshots are the listing. Almost nobody reads the description; they swipe
   the images and decide. So these are not raw captures — each one is a
   composed panel: a caption in the app's own display face, over the app's own
   paper, above a real screenshot of the real app with real content in it.

     node design/shots.mjs qr-maker      one app
     node design/shots.mjs               every app that has a scene defined
     node design/shots.mjs --list        which apps still need scenes

   ── The aspect-ratio trap ────────────────────────────────────────────────

   Google Play rejects phone screenshots whose aspect ratio is taller than
   9:16. A modern phone viewport is about 412x915, which is 1:2.22 — well past
   the limit — so the obvious thing (screenshot a phone-sized page and upload
   it) fails validation. Every panel here is composed at exactly 1080x1920,
   which is 9:16 on the nose, and the app capture is placed inside it.

   ── Empty apps do not sell ───────────────────────────────────────────────

   A screenshot of an empty list is worth nothing, so each app needs a SCENE:
   the localStorage state that makes it look like someone has been using it.
   Scenes live in scenes.mjs, one per app, written against that app's real
   storage key and shape. An app with no scene still captures, but it captures
   cold, and --list names it so the gap is visible rather than silent.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { SKINS, VOICES, TEXTURES, TEXTURE_SUPPORT, FONT_FILES } from './skins.mjs';
import { oklch, oklchA, contrast } from './color.mjs';
import { SCENES } from './scenes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const APPS = join(ROOT, 'apps');
const OUT = join(HERE, 'out', 'play');

const palette = JSON.parse(readFileSync(join(HERE, 'out', 'palette.json'), 'utf8'));

const argv = process.argv.slice(2);
const only = argv.filter((a) => !a.startsWith('--'));

if (argv.includes('--list')) {
  const missing = Object.keys(SKINS).filter((s) => !SCENES[s]);
  console.log(missing.length ? `\n${missing.length} app(s) with no scene:\n\n  ${missing.join('\n  ')}\n`
    : '\nevery app has a scene\n');
  process.exit(0);
}

const slugs = Object.keys(SKINS).filter((s) => (!only.length || only.includes(s)) && SCENES[s]);

/* Play's phone screenshot frame. 1080x1920 is exactly 9:16, the tallest ratio
   Play accepts, which gives the most room for a real phone screen. */
const W = 1080, H = 1920;
const CAP_H = 300;            // caption band
const PHONE_W = 412;          // CSS px of the captured app viewport
const PHONE_H = 812;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve() {
  return new Promise((res) => {
    const srv = createServer((req, r) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(APPS, p);
      if (!f.startsWith(APPS) || !existsSync(f)) { r.writeHead(404); return r.end('no'); }
      const ext = p.slice(p.lastIndexOf('.'));
      r.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      r.end(readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

function fontFace(voice) {
  const key = VOICES[voice]?.font;
  if (!key) return '';
  const file = FONT_FILES[key]?.file;
  if (!file || !existsSync(join(HERE, 'fonts', file))) return '';
  const b64 = readFileSync(join(HERE, 'fonts', file)).toString('base64');
  return `@font-face{font-family:"${FONT_FILES[key].family}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${FONT_FILES[key].weights};font-display:block}`;
}

/* Same solver the rest of the studio uses — the caption has to clear 4.6:1 on
   the app's own paper, whatever hue that paper happens to be. */
function ink(slug, target, dark = false) {
  const skin = SKINS[slug];
  const bg = dark ? palette[slug].darkCanvas : palette[slug].canvas;
  let L = dark ? 0.75 : 0.40, step = dark ? 0.02 : -0.02;
  let c = oklch(L, skin.chroma * 0.55, skin.hue);
  for (let i = 0; i < 40 && contrast(c, bg) < target; i++) {
    L += step; c = oklch(L, skin.chroma * 0.55, skin.hue);
  }
  return c;
}

function panelHtml(slug, caption, sub, shotDataUri) {
  const skin = SKINS[slug];
  const pal = palette[slug];
  const voice = VOICES[skin.voice];
  const kind = skin.texture ?? 'none';
  const image = TEXTURES[kind]({
    dark: false,
    a: kind === 'band' || kind === 'rule' ? pal.accentDeep : oklchA(0.60, skin.chroma, skin.hue, 0.07),
    b: oklchA(0.60, skin.chroma * 0.8, skin.support ?? (skin.hue + 150) % 360, 0.06),
    rule: oklchA(0.42, skin.chroma * 0.5, skin.hue, 0.055),
  });
  const support = (TEXTURE_SUPPORT[kind] ?? '')
    .replace('background-size:26px 26px', 'background-size:44px 44px')
    .replace('background-size:100% 4px', 'background-size:100% 14px')
    .replace('background-size:100% 2px', 'background-size:100% 10px');

  return `<!doctype html><meta charset=utf-8><style>
${fontFace(skin.voice)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background-color:${pal.canvas};background-image:${image};${support}
  display:flex;flex-direction:column;align-items:center;
  font-family:${VOICES.plain.display};-webkit-font-smoothing:antialiased}
.cap{height:${CAP_H}px;display:flex;flex-direction:column;justify-content:center;
  padding:0 76px;text-align:center;width:100%}
h2{font-family:${voice.display};font-weight:${voice.weight};letter-spacing:${voice.tracking};
  font-size:70px;line-height:1.06;color:${pal.accentDeep}}
p{margin-top:20px;font-size:34px;line-height:1.3;font-weight:450;color:${ink(slug, 4.6)}}
.shot{width:${PHONE_W * 2.1}px;border-radius:44px;overflow:hidden;
  box-shadow:0 30px 70px ${oklchA(0.30, skin.chroma * 0.6, skin.hue, 0.28)},
             0 4px 12px ${oklchA(0.30, skin.chroma * 0.6, skin.hue, 0.16)};
  border:2px solid ${oklchA(0.50, skin.chroma * 0.5, skin.hue, 0.18)}}
.shot img{display:block;width:100%}
</style>
<div class="cap"><h2>${caption}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
<div class="shot"><img src="${shotDataUri}"></div>`;
}

/* ── run ─────────────────────────────────────────────────────────────────── */

if (!slugs.length) {
  console.log('nothing to do — no scene defined for the requested app(s). Try --list');
  process.exit(0);
}

const { srv, port } = await serve();
const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
let made = 0;

for (const slug of slugs) {
  const scene = SCENES[slug];
  const dir = join(OUT, slug, 'screenshots');
  mkdirSync(dir, { recursive: true });

  /* Panels are named <index>-<slug>.png, so renaming or removing a panel would
     leave the old file sitting in the directory looking exactly as current as
     the new one — and for a directory whose whole purpose is "upload these to
     Play", a stale panel is worse than a missing one.

     But do NOT clear the directory up front. A run killed part-way through —
     a timeout, a Ctrl-C — would then leave the app with fewer screenshots than
     it started with, which is how qr-maker lost three good panels. Render
     first, remember what was written, and sweep the leftovers only once the
     app has completed. An interrupted run now costs nothing. */
  const written = new Set();

  for (const [i, panel] of scene.panels.entries()) {
    /* The caption band is a fixed height, so a caption long enough to wrap to
       three lines pushes the sub-line into the phone frame and gets clipped.
       Cheaper to say so here than to notice it in a contact sheet later. */
    if (panel.caption.length > 34) {
      console.log(`  !  ${slug}/${panel.slug}: caption is ${panel.caption.length} chars — may wrap into the frame`);
    }

    const page = await browser.newPage({
      viewport: { width: PHONE_W, height: PHONE_H },
      deviceScaleFactor: 2,
      colorScheme: panel.dark ? 'dark' : 'light',
    });

    /* Seed before the app's scripts run, so it boots straight into a used
       state rather than rendering empty and being patched afterwards. */
    await page.addInitScript(([store, prefs]) => {
      for (const [k, v] of Object.entries(store)) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(prefs ?? {})) localStorage.setItem(k, v);
    }, [scene.store ?? {}, scene.prefs ?? {}]);

    await page.goto(`http://127.0.0.1:${port}/${slug}/${panel.hash ?? ''}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (panel.act) await panel.act(page);

    /* Seeding a scene usually trips an undo toast, and a half-faded toast
       across the bottom of a store screenshot reads as a notification the app
       is nagging with. Let it retire on its own rather than deleting it —
       waiting proves the toast really does go away, which deleting would hide.

       The toast holds its dismiss clock while the pointer is inside it, which
       is deliberate and correct: an undo that vanishes under your finger is
       worse than no undo. But the automation's cursor is left wherever it last
       clicked, which is often exactly there, so the clock never starts and the
       wait below times out. Park the pointer in the corner first. */
    await page.mouse.move(4, 4);
    await page.waitForFunction(() => {
      const t = document.getElementById('toast');
      /* Test the painted state, not offsetParent — the toast is position:fixed
         and offsetParent is null for fixed elements whether it is on screen or
         not, so that check reads "gone" the entire time it is visible. */
      return !t || getComputedStyle(t).opacity === '0' || !t.classList.contains('show');
    }, null, { timeout: 12000 }).catch(() => {});

    await page.waitForTimeout(panel.settle ?? 450);

    const raw = await page.screenshot({ type: 'png' });
    await page.close();

    const composed = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await composed.setContent(
      panelHtml(slug, panel.caption, panel.sub, `data:image/png;base64,${raw.toString('base64')}`),
      { waitUntil: 'load' });
    await composed.evaluate(() => document.fonts.ready);
    const name = `${String(i + 1).padStart(2, '0')}-${panel.slug ?? 'panel'}.png`;
    await composed.screenshot({ path: join(dir, name) });
    await composed.close();
    written.add(name);
    made++;
  }

  /* Every panel for this app rendered, so anything else in the directory is a
     leftover from a scene that has since been renamed or removed. */
  const stale = readdirSync(dir).filter((f) => f.endsWith('.png') && !written.has(f));
  for (const f of stale) rmSync(join(dir, f));

  console.log(`  ${slug.padEnd(18)} ${scene.panels.length} panel(s)`
    + (stale.length ? `  (swept ${stale.length} stale)` : ''));
}

await browser.close();
srv.close();
console.log(`\n${made} screenshot(s) → design/out/play/<slug>/screenshots/  (1080x1920, exactly 9:16)`);
