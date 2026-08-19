#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — preview harness

   Renders the same slab of real components under every skin, so the whole
   portfolio can be judged side by side instead of one app at a time. This is
   how you catch that two apps collide, that a palette goes muddy in the dark,
   or that a texture is louder than it looked in isolation.

     node design/preview.mjs            write design/out/preview.html
     node design/preview.mjs --shots    also screenshot every skin, both modes

   Output lands in design/out/ and is not deployed.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS } from './skins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');

/** A slab of every component in the system, in the shape apps actually use. */
const SLAB = (slug, skin) => `
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
  <header class="app">
    <div class="mark" style="background:var(--accent-deep);border-radius:var(--r-sm)"></div>
    <div>
      <h1>${title(slug)}</h1>
      <span class="tagline">${skin.note.split('—')[1]?.trim() ?? ''}</span>
    </div>
    <span class="spacer"></span>
    <a class="tipbtn" href="#">&#9829; Tip jar</a>
  </header>

  <div class="hero">
    <h2>A headline that carries the app's voice</h2>
    <p>Supporting copy sits at a comfortable measure and a readable size, in the
      secondary ink so it recedes without going grey-on-grey.</p>
  </div>

  <main id="main">
  <section class="card">
    <h2>Section label</h2>
    <p class="sub">The uppercase micro-label above is the studio's section marker — the same in all 23 apps.</p>
    <label class="f"><span>Text field</span>
      <input type="text" placeholder="Placeholder text" value="A filled value">
    </label>
    <div class="frow">
      <label class="f"><span>A select</span>
        <select><option>First option</option><option>Second option</option></select>
      </label>
      <label class="f"><span>Another field</span>
        <input type="text" placeholder="Empty">
      </label>
    </div>
    <label class="f"><span>Notes</span><textarea placeholder="Longer text goes here"></textarea></label>
    <label><input type="checkbox" checked> A checkbox with a real hit area</label>
    <div class="cluster" style="margin-top:var(--s4)">
      <button class="btn primary">Primary action</button>
      <button class="btn">Secondary</button>
      <button class="btn ghost">Ghost</button>
      <button class="btn danger">Delete</button>
      <button class="btn small">Small</button>
    </div>
  </section>

  <section class="card">
    <h2>Segmented control &amp; chips</h2>
    <div class="seg">
      <button class="active">Link</button><button>WiFi</button><button>Phone</button><button>Text</button>
    </div>
    <div class="chips">
      <span class="chip on">Selected</span><span class="chip">Unselected</span>
      <span class="chip">Another</span><span class="chip">One more</span>
    </div>
    <p class="hint">A hint line, in secondary ink at the small size.</p>
    <div class="warn" style="margin-top:var(--s4)">A warning that reads as part of this palette, not bolted on.</div>
  </section>

  <section class="card">
    <h2>Empty state</h2>
    <div class="empty">
      <div class="glyph">&#9634;</div>
      <h3>Nothing here yet</h3>
      <p>The empty state teaches the first action instead of showing an empty box.</p>
      <button class="btn primary">Add the first one</button>
    </div>
  </section>

  <div class="tablewrap" style="margin-bottom:var(--s4)">
    <table>
      <thead><tr><th>Name</th><th>Detail</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>First row</td><td>Some supporting detail</td><td class="tnum">12.00</td></tr>
        <tr><td>Second row</td><td>More detail here</td><td class="tnum">148.50</td></tr>
        <tr><td>Third row</td><td>And another</td><td class="tnum">7.25</td></tr>
      </tbody>
    </table>
  </div>

  <div class="well" style="margin-bottom:var(--s4)">
    <span class="trust">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span><b>Nothing leaves your device.</b> No account, no ads, no subscription.</span>
    </span>
  </div>
  </main>

  <footer class="colophon">
    Runs entirely in your browser.<br>
    A free tool by Sky Wolf Studio &middot; Feedback
  </footer>
</div>
<div id="toast" class="show">Saved to this device</div>
`;

const title = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** A short slab — enough to judge identity, small enough that 23 fit on one sheet. */
const COMPACT = (slug, skin) => `
<div class="wrap">
  <header class="app">
    <div class="mark" style="background:var(--accent-deep);border-radius:var(--r-sm)"></div>
    <h1>${title(slug)}</h1>
    <span class="spacer"></span>
    <a class="tipbtn" href="#">&#9829; Tip jar</a>
  </header>
  <div class="hero" style="padding-top:var(--s2)">
    <h2>The app's own voice</h2>
    <p>Secondary copy at a readable size.</p>
  </div>
  <section class="card">
    <h2>Section label</h2>
    <label class="f"><span>A field</span><input type="text" value="A filled value"></label>
    <div class="seg"><button class="active">One</button><button>Two</button><button>Three</button></div>
    <div class="cluster">
      <button class="btn primary">Primary</button>
      <button class="btn">Secondary</button>
      <span class="chip on">Chip</span>
    </div>
  </section>
</div>`;

/* ── Per-skin standalone page (what the screenshots use) ────────────────── */
function page(slug, skin, body){
  const css = readFileSync(join(OUT, `${slug}.css`), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title(slug)} — SWS studio preview</title>
<style>${css}</style>
</head><body>${body}</body></html>`;
}

/* ── Contact sheet — every skin in one scrollable page ──────────────────── */
function contactSheet(){
  const frames = Object.keys(SKINS).map((slug) =>
    `<figure><figcaption>${title(slug)} <span>${SKINS[slug].voice} · ${SKINS[slug].texture} · h${SKINS[slug].hue} c${SKINS[slug].chroma} · ${SKINS[slug].paper}</span></figcaption>
     <iframe src="./compact-${slug}.html" title="${title(slug)}"></iframe></figure>`
  ).join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SWS Studio — all 23 skins</title>
<style>
  body{margin:0;background:#14151a;color:#e8e8ea;font:15px/1.5 ui-sans-serif,system-ui,sans-serif;padding:24px}
  h1{font-size:22px;margin:0 0 4px}
  .lede{color:#9a9aa4;margin:0 0 24px;max-width:60ch}
  .sheet{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(380px,1fr))}
  figure{margin:0}
  figcaption{font-size:13px;font-weight:600;padding:0 0 8px;display:flex;justify-content:space-between;gap:12px;align-items:baseline}
  figcaption span{color:#8b8b95;font-weight:400;font-size:11.5px}
  iframe{width:100%;height:470px;border:1px solid #2a2b33;border-radius:10px;background:#fff;display:block}
</style></head><body>
<h1>SWS Studio — 23 skins, one skeleton</h1>
<p class="lede">Same components, same geometry, same spacing. Only hue, chroma, paper warmth, display face and texture change.</p>
<div class="sheet">${frames}</div>
</body></html>`;
}

/* ── Run ────────────────────────────────────────────────────────────────── */
mkdirSync(OUT, { recursive: true });

for (const [slug, skin] of Object.entries(SKINS)){
  writeFileSync(join(OUT, `preview-${slug}.html`), page(slug, skin, SLAB(slug, skin)));
  writeFileSync(join(OUT, `compact-${slug}.html`), page(slug, skin, COMPACT(slug, skin)));
}
writeFileSync(join(OUT, 'preview.html'), contactSheet());
console.log(`Wrote design/out/preview.html + ${Object.keys(SKINS).length * 2} skin pages`);

if (process.argv.includes('--shots')){
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch();
  mkdirSync(join(OUT, 'shots'), { recursive: true });

  for (const mode of ['light', 'dark']){
    const ctx = await browser.newContext({
      colorScheme: mode,
      viewport: { width: 430, height: 1400 },
      deviceScaleFactor: 2,
    });
    for (const slug of Object.keys(SKINS)){
      const p = await ctx.newPage();
      await p.goto(`file://${join(OUT, `preview-${slug}.html`)}`);
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: join(OUT, 'shots', `${slug}-${mode}.png`), fullPage: true });
      await p.close();
    }

    // the contact sheet: all 23 in one image, which is the only way to judge
    // whether the portfolio reads as a family or as a pile
    await ctx.close();
    console.log(`  shot ${mode}`);
  }
  /* The contact sheet is composed from the PNGs just captured rather than from
     23 live iframes — same picture, a fraction of the work. */
  for (const mode of ['light', 'dark']){
    const cells = Object.entries(SKINS).map(([slug, k]) =>
      `<figure><figcaption>${title(slug)}<span>${k.voice} · ${k.texture} · h${k.hue} c${k.chroma} · ${k.paper}</span></figcaption>
       <img src="./${slug}-${mode}.png" alt=""></figure>`).join('\n');
    writeFileSync(join(OUT, 'shots', `sheet-${mode}.html`), `<!doctype html><meta charset="utf-8">
<title>SWS Studio — 23 skins (${mode})</title><style>
body{margin:0;background:#14151a;color:#e8e8ea;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;padding:20px}
h1{font-size:20px;margin:0 0 16px}
.sheet{display:grid;gap:16px;grid-template-columns:repeat(6,1fr)}
figure{margin:0}
figcaption{font-size:12px;font-weight:600;padding-bottom:6px;display:flex;flex-direction:column}
figcaption span{color:#8b8b95;font-weight:400;font-size:10px}
img{width:100%;border:1px solid #2a2b33;border-radius:8px;display:block}
</style><h1>SWS Studio — 23 skins, one skeleton (${mode})</h1><div class="sheet">${cells}</div>`);

    const p = await browser.newPage({ viewport: { width: 2200, height: 1200 } });
    await p.goto(`file://${join(OUT, 'shots', `sheet-${mode}.html`)}`);
    await p.waitForTimeout(500);
    await p.screenshot({ path: join(OUT, 'shots', `_contact-sheet-${mode}.png`), fullPage: true });
    await p.close();
  }

  await browser.close();
  console.log(`Screenshots → design/out/shots/`);
}
