# SACCADE — Speed Reader

**Design spec and Claude Code handoff · v0.2 · 2026-10-22**
Working title: **SACCADE** (a saccade is the eye jump that this kind of reader removes). Alternatives if that one doesn't land: Glimpse, Flashread, Pivot.
Studio: Sky Walk Studio / Lucid Winds · SWS Strategic Media LLC
Target: single-file vanilla HTML/CSS/JS PWA, mobile-first, no build step, deployable to Firebase Hosting or GitHub Pages like the rest of the catalog. One optional 15-line edge proxy for Project Gutenberg text (§10).

**What changed in v0.2** (from the first demo review)
- Multi-word flashes never wrap. They always sit on one row; the font is sized once per text so the widest flash fits.
- Landscape layout for phones: stage on the left, controls on the right, Style sheet becomes a side panel.
- Sepia is the default reading surface.
- Library sheet: free public-domain classics from Project Gutenberg (search the whole catalog, plus a curated shelf and built-in excerpts).

---

## 0. How to use this document

- Sections 1–12 are the design. Section 13 is the build plan for Claude Code. Section 14 is the open questions for Stephen.
- **Appendix A is the complete demo source (`index.html`).** It is a working v0.2 that already implements nearly all of v1. Start from it; do not rebuild from scratch.
- Appendix B is the Gutenberg proxy (Cloudflare Worker). Appendix C is a kickoff prompt to paste into Claude Code.

---

## 1. Concept

An RSVP reader (rapid serial visual presentation). You paste text or pick a classic from the library, choose a pace, and the app flashes the words one at a time (or a few at a time) at a fixed point on the screen. Your eyes stop moving; the text comes to you.

One job: turn any text into a paced stream of flashes you can read faster than you can on a page, without losing the thread.

What makes it good rather than a toy:

1. **Pauses that match how reading works.** A beat at every sentence end, a longer one at paragraph breaks, a short one at commas, and a little extra on long words. Raw WPM without pauses is why most RSVP apps feel like being shouted at.
2. **A pivot letter that never moves.** The optimal recognition point (ORP) of each word is colored and held at the exact horizontal center of the stage, with guide marks above and below. The eye has one place to rest.
3. **Controls that never leave the stage.** Everything is one thumb-reach below (or beside) the stage; the stage itself is the play/pause button.
4. **Something to read on day one.** The library puts Austen, Dickens, Melville, Verne and 70,000 other free books one tap away.
5. **Honest numbers.** The app shows the set WPM *and* the effective WPM after pauses, so people know what they actually read at.

---

## 2. Screens and layout

### Portrait (default)

```
┌──────────────────────────────┐
│ Saccade  PRIDE AND PREJUDICE  [Text][Library][Style] │  ← header: current source + three sheet buttons
├──────────────────────────────┤
│              |               │
│                              │
│         re·c·ognition        │  ← STAGE (34% of height, fixed)
│              |               │     pivot letter colored, guide marks
│        tap to start          │     tap anywhere = play / pause
├──────────────────────────────┤
│ ━━━━━━━━●━━━━━━━━━━━━━━━━━━━ │  ← scrubber
│ 38%                 2:14 left │
├──────────────────────────────┤
│   (↺)   (◀◀)   (  ▶  )  (▶▶) │  ← transport: restart, back a sentence, play, forward a sentence
│ ┌──────────────────────────┐ │
│ │ SPEED            300 wpm │ │
│ │ [−] ━━━━●━━━━━━━━━━ [+]  │ │  ← 100–1500, step 10
│ │ WORDS PER FLASH          │ │
│ │ [1] 2  3  4  5           │ │  ← segmented
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ PAUSE AT SENTENCE END +1 beat │
│ │ ━━━━━●━━━━━━━━━━━━━━━━━━ │ │  ← 0–3 beats
│ │ PAUSE AT PARAGRAPH  +1.5 beats │
│ │ ━━━━━━━━●━━━━━━━━━━━━━━━ │ │  ← 0–4 beats
│ │ ☑ Short pause at commas  │ │
│ │ ☑ Linger on long words   │ │
│ └──────────────────────────┘ │
│  1,240 words read · 4:08 · 286 wpm effective │  ← stats
└──────────────────────────────┘
```

### Landscape (phones: `orientation: landscape` and height ≤ 540px)

```
┌───────────────────────────────────────────────────────┐
│ Saccade  MOBY-DICK                  [Text][Library][Style] │
├────────────────────────────┬──────────────────────────┤
│                            │  (↺) (◀◀) ( ▶ ) (▶▶)     │
│       it was the best      │  SPEED           300 wpm │
│                            │  [−] ━━━●━━━━━━━━━━ [+]  │
│  ━━━━━●━━━━━━━━━━━━━━━━━━  │  WORDS PER FLASH [1]2345 │
│  12%            9:40 left  │  PAUSES … (scrolls)      │
└────────────────────────────┴──────────────────────────┘
```

The stage takes 55% of the width and the full height, which is where 3–5 words per flash shine. The Style sheet opens as a right-side panel so the stage stays visible for live preview. Tips line hidden, transport buttons slightly smaller.

### Sheets

- **Text** (full screen): textarea, live counter (`12,345 / 100,000 characters · 2,100 words · ~7:00 at 300 wpm`), Paste · Sample text · Clear, and Done / Read now. Opening it pauses playback; closing it commits the text; changed text resets position to 0.
- **Library** (full screen): search box (Project Gutenberg catalog), results list, three built-in excerpts, and a curated shelf of ~45 classics. Tapping a book loads the whole book and closes the sheet. See §10.
- **Style** (bottom half-sheet in portrait, side panel in landscape): font, size, bold, color presets, three color pickers (background, text, pivot), toggles for pivot highlight, guide marks, wake lock. The stage stays visible so every change previews live.

Desktop: same layout capped at 720px wide and centered. Keyboard works (§7).

---

## 3. Text input

- `<textarea maxlength="100000">`. The browser enforces the cap on paste; the counter shows `n / 100,000 characters`. **The cap is for the paste box only.** The engine has no limit; library books (500k–1.5M characters) load whole.
- Word count and time estimate update on input (debounced ~120 ms). Tokenizing is fast: 375k characters / 60k tokens takes ~60 ms including prefix sums and the widest-frame scan.
- **Paste** button tries `navigator.clipboard.readText()`. On Android Chrome in an installed PWA this works after a permission prompt. If it is refused (desktop Firefox, iOS without user gesture, the artifact sandbox), focus the box and show "Long-press the box and choose Paste." Never fail silently.
- **Sample text** loads the built-in ~300-word onboarding passage (it explains saccades, the pivot letter, and how to use the pauses, and includes abbreviation test cases like "Dr." and "e.g.").
- **Clear** empties the box and focuses it.
- The header eyebrow shows the current source: `Sample text`, `Pasted text`, `Pride and Prejudice · Jane Austen`, or `Moby-Dick · excerpt`.
- Out of scope for v1: fetching arbitrary URLs (CORS), EPUB/PDF import. See §11 for the Android share target, which is the right way to get articles in.

---

## 4. Tokenizer

Pure function, no DOM. Lives in the `Saccade` engine object at the top of the script so it can be unit-tested in Node (the whole engine runs headless; see §13 step 6).

1. Normalize line endings. Split paragraphs on blank lines (`\n[ \t]*\n+`).
2. Split each paragraph on whitespace. Punctuation stays attached to its word ("jump.", "“Really?”").
3. Each token gets flags:
   - `sent` — ends a sentence: ends with `. ! ? …` optionally followed by closing quotes/brackets, **and** is not an abbreviation (`Mr. Dr. St. vs. etc. e.g. i.e. a.m. U.S. …` list), not a single initial (`J.`), not a dotted acronym (`U.S.A.`), not a list number (`1.`).
   - `para` — last word before a paragraph break.
   - `end` — `sent || para || last word`. Frames never cross an `end`.
   - `clause` — ends with `, ; :` or a dash (only when not `sent`).

Verified on a sample: `page. | jump. | care. | "Really?" | asked.` are sentence ends; `e.g. | Dr. | 1. | U.S.` are correctly not.

Known limits (acceptable for v1): a sentence that ends with an abbreviation ("...went to the U.S.") gets no pause; emoji and non-Latin scripts flow through but the ORP uses UTF-16 length (§12 has the fix). Gutenberg texts use hard line breaks inside paragraphs; since words split on any whitespace and paragraphs on blank lines, this is handled.

---

## 5. Timing model (the core)

Everything is in **beats**. One beat = `60000 / WPM` milliseconds (300 wpm → 200 ms).

- A **frame** is up to `wordsPerFlash` tokens starting at the current position, cut short at any token whose `end` flag is set. So "They jump." is its own frame even at 3 words per flash, and the pause lands on the right word.
- **Frame duration** = Σ `beats(token)` × beat, over the tokens in the frame.
- `beats(token)`:
  - `1` base
  - `+ min(0.6, (len − 8) × 0.1)` if `lingerOnLongWords` and `len > 8`
  - `+ sentencePause` if `sent` (slider 0–3, default **1 beat**: the "slight pause at the end of sentences")
  - `+ paragraphPause` (slider 0–4, default 1.5) if `para`, added on top of any sentence pause
  - `+ 0.35` if `clause` and `clausePause` (and not a sentence end)
- The displayed WPM is the raw rate; pauses lower the effective rate by roughly 15–25% on ordinary prose. The stats line shows **effective wpm** (words read ÷ wall-clock minutes) so the number is honest.
- **Remaining time** is O(1): keep a prefix-sum array `cum[i]` of beats over the tokens; remaining ms = `(cum[n] − cum[pos]) × beat`. Rebuild `cum` whenever a pause setting changes (one pass). Changing WPM alone does not require a rebuild.
- **Scheduler**: a `setTimeout` chain (`tick → render → setTimeout(tick, duration)`), not `setInterval`. Each frame's duration is computed fresh from the current settings, so speed changes take effect on the very next flash. Pause on `visibilitychange` (screen off, app switch). Request a screen wake lock while playing; release on pause; tolerate refusal.
- The sentence-ending word is the one that lingers (the pause is appended to its frame), which is what the eye expects.

---

## 6. The stage

- Fixed height in portrait (`clamp(180px, 34vh, 320px)`) so nothing below it ever jumps; full column height in landscape.
- **ORP pivot** by word length: `1→0, 2–5→1, 6–9→2, 10–13→3, 14+→4` (zero-based index of the highlighted letter).
- Layout trick that keeps the pivot dead center regardless of word shape: the word is a 3-column grid `minmax(0,1fr) auto minmax(0,1fr)` with the pre-pivot text right-aligned, the pivot in the middle column, and the post-pivot text left-aligned. Guide marks (2 px ticks at 14% from top and bottom) sit at 50%.
- **Multi-word flashes are always one row.** No wrapping, ever. Size is decided once per text (and again when words-per-flash, font, size or the stage width change): find the frame with the most characters (`widestFrame`), measure it in an offscreen span at the chosen font and size, and scale the font so it fits `stageWidth − 28`. Every multi-word frame then uses that one size, so the text doesn't jitter between flashes. Floor at 20% of the chosen size. Practical consequence: 4–5 words per flash want landscape or a tablet; at 48px on a 380px-wide phone, a 40-character frame lands around 20px.
- Per-frame **fit** is still there as a safety net: single-word mode shrinks a frame if `2 × max(preWidth, postWidth) + pivotWidth > stageWidth − 28` (URLs, 30-letter words); multi-word mode shrinks if the measured row still overflows (unusual glyph widths).
- Multi-word frames drop the pivot and guides and center the chunk.
- The hint line under the word reads `Tap to start` / `Paused · tap to resume` / `Finished · 1,240 words · 4:08 · 286 wpm · tap to read again`. Hidden while playing.
- Tapping the stage toggles play. It has `role="button"` and `tabindex="0"`; the word itself is `aria-hidden` (a live region flashing 5 words a second would be hostile to screen readers).

---

## 7. Controls

- **Transport**: Restart · Back one sentence · Play/Pause (68 px, accent color) · Forward one sentence.
  - Back: jump to the start of the current sentence; if already at its start, to the start of the previous one.
  - Forward: jump past the next `end` token.
  - Restart: position 0, session stats cleared.
- **Scrubber**: `range 0–1000` mapped to token index; works while playing (the loop re-syncs).
- **Speed**: slider 100–1500 step 10, with −/+ buttons (±10). Readout `300 wpm`.
- **Words per flash**: segmented 1–5.
- **Pauses**: sentence (0–3 beats, step .25), paragraph (0–4, step .5), comma toggle, long-word toggle.
- **Keyboard** (desktop): Space/Enter play-pause, ←/→ sentence, ↑/↓ ±10 wpm, Esc closes sheets. Ignored while typing or when a button has focus (so Space doesn't double-fire).
- All tap targets ≥ 42 px. Digits use `tabular-nums` so readouts don't jitter.

---

## 8. Appearance

- **Reading font** (select): Literata (a serif designed for screen reading), Atkinson Hyperlegible (a sans designed for low vision), System sans, Georgia, Monospace. The first two load from Google Fonts with `display=swap` and real fallback stacks; for an offline-first PWA either cache them in the service worker or drop the `<link>` and keep the system options. The UI chrome uses Atkinson Hyperlegible too.
- **Size**: 24–96 px slider. **Bold** toggle.
- **Colors**: presets **Sepia (default)**, Paper, Night, Slate, Contrast (yellow on black), Auto (follows the OS light/dark theme); plus three native color pickers for background, text, and pivot. Picking a color switches the preset to "custom"; picking a preset clears the custom colors. Each preset carries a pivot color tuned to its background.
- Chrome colors are CSS tokens with light and dark values (`prefers-color-scheme`, plus `data-theme` override hooks). The stage's colors are separate tokens (`--stage-bg`, `--stage-fg`, `--pivot`) so the reading surface can differ from the app around it.
- `prefers-reduced-motion` respected (there is almost no motion anyway).

---

## 9. Persistence

| key | contents |
|---|---|
| `saccade.v2` | settings JSON (wpm, wpf, pauses, font, size, bold, preset, custom colors, orp, guides, wake) |
| `saccade.v2.text` | the current text, whole (a paste ≤ 100k chars, or a full book) |
| `saccade.v2.src` | source label shown in the header |
| `saccade.v2.book` | `{id, t, a}` when the text came from the library, else `null` |
| `saccade.v2.pos` | token index to resume at (saved on pause, on jump, and every 16 frames while playing) |

Every read/write is wrapped in `try/catch`; the app runs fine with storage blocked. Settings are clamped on load so a bad value can't break the UI.

**Large books**: localStorage holds ~5 MB per origin; a 1.2M-character novel is 2.4 MB as UTF-16, so one book fits, two may not. If `setItem` throws, the app drops the stored text but keeps the book reference, and on next launch re-fetches the book (`if(bookRef && text === SAMPLE) loadBook(bookRef)`). v1.1 moves books to IndexedDB (§12).

The key prefix changed from `v1` to `v2` so the sepia default and the new fields apply cleanly for anyone who tried the first demo.

---

## 10. Library — Project Gutenberg

Project Gutenberg hosts ~75,000 public-domain books. Two services, two different CORS realities:

| need | service | from a browser page |
|---|---|---|
| search / metadata | **Gutendex** `https://gutendex.com/books?search=…` (JSON, open source, no key) | works directly (CORS enabled) |
| book text | **gutenberg.org** `https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt` | **blocked** — gutenberg.org sends no `Access-Control-Allow-Origin`, so `fetch()` from another origin fails |

So the text fetch needs a proxy. Design:

- `fetchText(url)` tries the direct URL first (harmless, and future-proof if they ever add CORS), then `PROXY + encodeURIComponent(url)`. `PROXY` is a constant at the top of the script, empty in the demo.
- The proxy is a **Cloudflare Worker** (free tier: 100k requests/day, plenty). It only forwards URLs matching the gutenberg.org text patterns, adds `Access-Control-Allow-Origin: *`, and caches each book at the edge for 30 days so gutenberg.org sees one fetch per book, not one per reader. Code in Appendix B. Firebase Cloud Functions would also work but need the Blaze plan; the Worker is simpler and free.
- **Strip the license**: everything up to and including the line `*** START OF THE PROJECT GUTENBERG EBOOK … ***` and everything from `*** END OF THE PROJECT GUTENBERG EBOOK` onward. `Saccade.stripGutenberg()` does this; tested.
- **Search**: `?search=<q>&languages=en&mime_type=text/plain`, show the first 20 results as rows (title, author, download count). Tapping a row loads it. Gutendex returns `formats` with a `text/plain` URL; the app uses the canonical `cache/epub/{id}/pg{id}.txt` pattern instead, which exists for every modern text and is what the proxy allows.
- **Shelf**: ~45 curated classics hard-coded as `[id, title, author, year]` so the first screen is useful without typing. IDs are the well-known Gutenberg numbers (1342 Pride and Prejudice, 98 A Tale of Two Cities, 2701 Moby-Dick, 84 Frankenstein, 11 Alice, 1661 Sherlock Holmes, 345 Dracula, 64317 Gatsby, …). Build step: verify each ID once against `gutendex.com/books/{id}` and fix any that drifted.
- **Demo excerpts**: three short public-domain openings (Austen, Dickens, Melville) are embedded so the library can be tried where the network is blocked (the artifact preview). Keep them in production as "try it" samples; they double as good tokenizer tests (Mr./Mrs., a 120-word single sentence, em-dashes).
- **Etiquette**: one fetch per user tap, cached at the edge and on the device. That is well within Gutenberg's terms, which are aimed at bulk crawling. Credit "Project Gutenberg" in the Library header (done) and in the about/credits line.
- **Resume**: book + position persist, so closing mid-chapter and reopening picks up where you were.

---

## 11. PWA checklist (production, not in the demo)

The artifact sandbox blocks service workers and outbound fetches, so the demo omits these. Add in the Codespace:

- `manifest.json`: name "Saccade", short_name "Saccade", `display: standalone`, `start_url: ./`, `theme_color`/`background_color` matching the light tokens, icons 192 and 512 (maskable), orientation `any` (landscape is a feature now).
- `<link rel="manifest">`, `<meta name="theme-color">` ×2 with `media` for light/dark (already in `index.html`), `apple-mobile-web-app-capable`, apple-touch-icon.
- `sw.js`: cache-first for `index.html`, the manifest, icons, and (optionally) the two font CSS/woff2 files. Do not cache gutenberg/proxy responses in the SW; the app stores the text itself. Bump a `CACHE` version string on each deploy.
- **Share target** (the killer convenience on Android): add `share_target` to the manifest (`method: GET`, params `text` and `url`), and on load read `location.search` for `text=` and drop it into the Text sheet. Then any article can be sent to Saccade from the share menu. iOS ignores share targets; Paste covers it.
- Viewport meta with `viewport-fit=cover`; safe-area insets are already handled in the CSS.

---

## 12. Accessibility, edge cases, scope

**Accessibility**: labels on every control; `aria-label` on icon buttons; visible `:focus-visible` rings; stage is a button; word is `aria-hidden`.

**Edge cases handled**: empty text (stage says "Add text to begin"; Play opens the Text sheet); long tokens shrunk to fit; "3.14" and "1." are not sentence ends; whitespace-only paste → 0 tokens; saved position past the end → clamped; screen off → auto-pause; storage full → book re-fetched next launch; search/fetch failure → plain message, excerpts still work.

**Known gap for v1**: `orp()` and `slice()` use UTF-16 units, so a word starting with an emoji could split the surrogate pair. Fix: `Array.from(word)` for length and slicing in `render()`.

**v1 (ship to the studio)**
- Everything in the demo (Appendix A)
- Deploy the Gutenberg proxy (Appendix B) and set `PROXY`
- PWA shell: manifest, service worker, icons (§11)
- Share target (§11)
- Grapheme-safe ORP
- "Reset settings" button in the Style sheet
- Verify shelf IDs

**v1.1**
- Library of your own: last ~20 texts and every opened book in IndexedDB with per-item position and % read; chapter list for Gutenberg books (split on `CHAPTER` / roman-numeral headings)
- Trainer mode: optional +10 wpm every minute, or a 20-second warm-up ramp from 80% to 100%
- Focus mode: fullscreen stage only, controls on tap
- Reading history: sessions, words, effective wpm over time (a small chart)
- Import `.txt` / `.md` via file input; `.epub` later (needs a zip reader, a dependency)
- Gutendex browse by subject ("Science fiction", "Children's literature") as shelf tabs

**Not planned**: accounts, sync, AI summaries, fetching arbitrary URLs from the client.

---

## 13. Build plan for Claude Code

1. Create `index.html` from Appendix A. Confirm it runs as-is in the Codespace preview (it is a complete page; the library search already works there because Gutendex allows CORS; book text will fail until step 2).
2. Deploy the Worker in Appendix B (`npx wrangler deploy`), then set `PROXY` in `index.html` to `https://<name>.<account>.workers.dev/?url=`. Tap a shelf book; it should load in 1–3 s.
3. Add `manifest.json`, `sw.js`, `icons/` (192, 512, maskable), and the `<head>` additions from §11. Register the SW at the bottom of the script.
4. Implement share-target intake (`?text=` / `?url=` → Text sheet, pre-filled, sheet open).
5. Grapheme-safe `render()`; "Reset settings" button (clears `saccade.v2`, reloads defaults).
6. Engine test: run the `Saccade` object headless in Node (slice the `<script>` out of the file, `vm.runInContext` with a stub `document`) and assert the tokenizer cases in §4, the Gutenberg stripper, and `widestFrame`. This is how the demo was checked.
7. Manual checklist: 100k-char paste (counter, no lag); a full novel from the shelf (load time, resume after reload); wpf 1–5 at 24 and 96 px in portrait and landscape (never wraps); scrub while playing; back/forward sentence at start/end; screen-off auto-pause; wake lock on a real phone; light/dark chrome; every color preset.
8. Rewrite `HANDOFF.md` with what changed and what is next.

Code conventions: keep the pure engine (`Saccade` object) separate from the DOM code; no frameworks; no build step; one HTML file plus the PWA assets plus the Worker.

---

## 14. Open questions for Stephen

1. **Name.** SACCADE, or one of the alternatives?
2. **Proxy hosting.** Cloudflare Worker (free, ~2 minutes to deploy, needs a Cloudflare account) vs a Firebase Function (needs Blaze plan). Spec assumes the Worker.
3. **Whole book vs chapters.** v1 loads whole books and keeps one in storage. Fine to ship that way and add the IndexedDB library + chapter picker in v1.1?
4. **Defaults.** 300 wpm, 1 word per flash, 1-beat sentence pause, 1.5-beat paragraph pause, Sepia. Feel right after the second demo?
5. **Pivot in multi-word mode.** Currently chunks of 2+ words drop the pivot and center the group. Keep, or highlight the ORP of the first word?
6. **Speed ceiling.** 1500 wpm. Enough?
7. **Trainer mode** (auto +10 wpm per minute) — v1 or v1.1?
8. **Fonts.** Keep the two Google fonts (cache them in the SW) or go system-only for a zero-dependency file?
9. **Studio placement.** Free utility in the Lucid Winds catalog, or paired with the kids' educational line?

---

## Appendix A — demo source (`index.html`)

Complete, standalone, no build step. This is the published demo plus a normal HTML skeleton and the PWA-oriented `<head>` metas. Save as `index.html`.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#edf0f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1015" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="Saccade: an RSVP speed reader. Paste anything or pick a free classic from Project Gutenberg, set your pace, and let the words come to you.">
<title>Saccade Reader</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Literata:opsz,wght@7..72,400;7..72,600&display=swap">
<style>
/* Layout: one-screen reader. Portrait: stage up top, scrolling control deck below, full-screen sheets for Text and Library,
   half-height sheet for Style so the stage stays visible as a live preview. Landscape phones: stage left, deck right, Style as a side panel. */
:root{
  --bg:#edf0f5; --surface:#ffffff; --surface-2:#e3e7ee; --fg:#151a25; --muted:#5b6475; --line:#cdd3de;
  --accent:#2457c9; --accent-fg:#ffffff; --pivot:#d4213b;
  --stage-bg:#fbfaf7; --stage-fg:#15171c;
  --font-ui:"Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --font-read:"Literata",Georgia,"Times New Roman",serif;
  --radius:12px;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){ --bg:#0e1015; --surface:#171a21; --surface-2:#232734; --fg:#e6e9f0; --muted:#98a1b3; --line:#2e3443; --accent:#7ea4ff; --accent-fg:#0a1020; --pivot:#ff5c70; --stage-bg:#0a0b0f; --stage-fg:#ebe7de; color-scheme:dark }
}
:root[data-theme="dark"]{ --bg:#0e1015; --surface:#171a21; --surface-2:#232734; --fg:#e6e9f0; --muted:#98a1b3; --line:#2e3443; --accent:#7ea4ff; --accent-fg:#0a1020; --pivot:#ff5c70; --stage-bg:#0a0b0f; --stage-fg:#ebe7de; color-scheme:dark }

html,body{height:100%}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-ui);font-size:15px;line-height:1.4;-webkit-text-size-adjust:100%;
  padding-block:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;border:0;background:none;padding:0;-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}

#app{height:100%;display:flex;flex-direction:column;gap:10px;max-width:720px;margin:0 auto;min-height:0}
.bar{display:flex;align-items:center;justify-content:space-between;padding-block:12px 2px;gap:10px;min-width:0}
.brand{font-weight:700;font-size:18px;display:flex;align-items:baseline;gap:8px;min-width:0}
.eyebrow{font-size:11px;font-weight:400;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.bar-actions{display:flex;gap:6px;flex:none}
.chip{padding:8px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-weight:700;font-size:14px;min-height:38px}
.chip.primary{background:var(--accent);color:var(--accent-fg);border-color:transparent}
.chip:active{filter:brightness(.95)}

/* Stage */
.stage-col{display:contents}
.stage{position:relative;flex:none;height:clamp(180px,34vh,320px);border-radius:var(--radius);background:var(--stage-bg);color:var(--stage-fg);
  display:flex;align-items:center;justify-content:center;overflow:hidden;user-select:none;-webkit-user-select:none;border:1px solid var(--line);cursor:pointer}
.guide{position:absolute;left:50%;width:2px;height:14px;background:currentColor;opacity:.35;transform:translateX(-50%)}
.guide-top{top:14%}.guide-bot{bottom:14%}
.stage.noguides .guide,.stage.multi .guide{display:none}
.word{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);white-space:nowrap;font-family:var(--font-read);font-size:48px;line-height:1.1;font-variant-numeric:tabular-nums}
.word.bold{font-weight:700}
.word .pre{text-align:right}
.word .post{text-align:left}
.word .pivot{color:var(--pivot)}
.word.multi{display:block;text-align:center;white-space:nowrap;padding-inline:14px}   /* multi-word flashes stay on one row; the font scales to fit */
.word.multi .post{display:inline-block}
#meas{position:absolute;left:-99999px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;font-family:var(--font-read);line-height:1.1}
.stage-hint{position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:11px;letter-spacing:.07em;text-transform:uppercase;opacity:.6;font-family:var(--font-ui);padding-inline:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stage.live .stage-hint{display:none}

/* Progress */
.progress{display:flex;flex-direction:column;gap:2px;flex:none}
input[type=range]{width:100%;accent-color:var(--accent);margin:0;min-height:28px}
.meta{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}

/* Control deck */
.deck{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding-bottom:16px;overscroll-behavior:contain}
.transport{display:flex;justify-content:center;align-items:center;gap:14px;padding-block:4px}
.tbtn{width:48px;height:48px;border-radius:50%;background:var(--surface);border:1px solid var(--line);display:grid;place-items:center;font-size:22px;line-height:1}
.tbtn.play{width:68px;height:68px;background:var(--accent);color:var(--accent-fg);border-color:transparent}
.tbtn:active{filter:brightness(.92)}
.group{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px}
.label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
output{font-variant-numeric:tabular-nums;font-weight:700}
.stepper{display:flex;align-items:center;gap:10px}
.stepper input{flex:1;min-width:0}
.sbtn{width:42px;height:42px;flex:none;border-radius:10px;background:var(--surface-2);font-size:22px;font-weight:700;line-height:1}
.seg{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;background:var(--surface-2);padding:4px;border-radius:10px}
.seg button{height:36px;border-radius:7px;font-weight:700}
.seg button.on{background:var(--accent);color:var(--accent-fg)}
.check{display:flex;align-items:center;gap:10px;min-height:32px;cursor:pointer}
.check input{width:20px;height:20px;accent-color:var(--accent);margin:0;flex:none}
.stats{font-size:13px;color:var(--muted);text-align:center;font-variant-numeric:tabular-nums}
.tips{font-size:12px;color:var(--muted);text-align:center}

/* Sheets */
.sheet{position:fixed;inset:0;z-index:20;background:var(--bg);display:flex;flex-direction:column;gap:10px;
  padding-top:calc(env(safe-area-inset-top,0px) + 12px);padding-bottom:calc(env(safe-area-inset-bottom,0px) + 12px);
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.sheet.half{top:auto;height:min(62%,560px);max-width:720px;width:100%;margin-inline:auto;border-radius:16px 16px 0 0;background:var(--surface);border-top:1px solid var(--line);
  box-shadow:0 -12px 40px rgba(0,0,0,.22);padding-top:12px}
.sheet-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex:none;min-width:0}
.sheet h2{margin:0;font-size:17px;display:flex;align-items:baseline;gap:8px;min-width:0}
.sheet .body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.sheet.half .group{background:var(--bg)}
textarea{flex:1;min-height:140px;width:100%;resize:none;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:12px;line-height:1.5;font-size:15px}
.counter{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;flex:none}
#note,#libMsg{color:var(--accent)}
.btnrow{display:flex;gap:8px;flex-wrap:wrap;flex:none}
.btn{padding:10px 16px;border-radius:10px;background:var(--surface-2);font-weight:700;min-height:42px}
.swatches{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.swatch{height:44px;border-radius:10px;border:1px solid var(--line);font-weight:700;font-size:13px}
.swatch.on{outline:2px solid var(--accent);outline-offset:2px}
.colors{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.color{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
input[type=color]{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;padding:2px;background:var(--surface)}
select{width:100%;height:42px;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:0 10px}

/* Library */
.search{display:flex;gap:8px;flex:none}
.search input{flex:1;min-width:0;height:42px;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:0 12px}
.list{display:flex;flex-direction:column;gap:6px}
.book{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;width:100%;padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}
.book:active{filter:brightness(.95)}
.book .bt{font-weight:700}
.book .ba{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}

/* Landscape phones: stage left, deck right. */
@media (orientation:landscape) and (max-height:540px){
  #app{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"bar bar" "stage deck";column-gap:14px;row-gap:6px;max-width:none}
  .bar{grid-area:bar;padding-block:6px 0}
  .stage-col{grid-area:stage;display:flex;flex-direction:column;gap:6px;min-height:0}
  .stage{height:auto;flex:1;min-height:120px}
  .deck{grid-area:deck;padding-bottom:8px;gap:8px}
  .transport{gap:10px;padding-block:0}
  .tbtn{width:42px;height:42px}
  .tbtn.play{width:56px;height:56px}
  .tips{display:none}
  .sheet.half{top:0;left:auto;right:0;width:min(58%,440px);height:auto;max-width:none;margin:0;border-radius:16px 0 0 16px;border-top:0;border-left:1px solid var(--line);
    padding-top:calc(env(safe-area-inset-top,0px) + 12px);padding-right:max(16px,env(safe-area-inset-right,0px))}
}
</style>

<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
<div id="app">
  <header class="bar">
    <div class="brand">Saccade <span class="eyebrow" id="source">rsvp reader</span></div>
    <div class="bar-actions">
      <button class="chip" id="btnText">Text</button>
      <button class="chip" id="btnLib">Library</button>
      <button class="chip" id="btnStyle">Style</button>
    </div>
  </header>

  <div class="stage-col">
    <div class="stage" id="stage" tabindex="0" role="button" aria-label="Reading stage. Tap to play or pause.">
      <div class="guide guide-top"></div>
      <div class="word" id="word" aria-hidden="true"><span class="pre"></span><span class="pivot"></span><span class="post"></span></div>
      <div class="guide guide-bot"></div>
      <div class="stage-hint" id="hint">Tap to start</div>
      <span id="meas" aria-hidden="true"></span>
    </div>
    <div class="progress">
      <input type="range" id="scrub" min="0" max="1000" value="0" aria-label="Reading position">
      <div class="meta"><span id="pct">0%</span><span id="left"></span></div>
    </div>
  </div>

  <div class="deck">
    <div class="transport">
      <button class="tbtn" id="btnRestart" title="Restart" aria-label="Restart">&#8634;</button>
      <button class="tbtn" id="btnPrev" title="Back one sentence" aria-label="Back one sentence">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M11 6 4 12l7 6zM20 6l-7 6 7 6z" fill="currentColor"/></svg>
      </button>
      <button class="tbtn play" id="btnPlay" aria-label="Play">
        <svg id="icoPlay" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M8 4.5v15l13-7.5z" fill="currentColor"/></svg>
        <svg id="icoPause" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" hidden><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor"/></svg>
      </button>
      <button class="tbtn" id="btnNext" title="Forward one sentence" aria-label="Forward one sentence">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 6l7 6-7 6zM4 6l7 6-7 6z" fill="currentColor"/></svg>
      </button>
    </div>

    <div class="group">
      <div class="row"><span class="label">Speed</span><output id="wpmOut" for="wpm">300 wpm</output></div>
      <div class="stepper">
        <button class="sbtn" id="wpmDown" aria-label="Slower">&minus;</button>
        <input type="range" id="wpm" min="100" max="1500" step="10" value="300" aria-label="Words per minute">
        <button class="sbtn" id="wpmUp" aria-label="Faster">+</button>
      </div>
      <div class="row"><span class="label">Words per flash</span></div>
      <div class="seg" id="wpf" role="group" aria-label="Words per flash">
        <button data-v="1" class="on">1</button><button data-v="2">2</button><button data-v="3">3</button><button data-v="4">4</button><button data-v="5">5</button>
      </div>
    </div>

    <div class="group">
      <div class="row"><span class="label">Pause at sentence end</span><output id="sentOut" for="sentPause"></output></div>
      <input type="range" id="sentPause" min="0" max="3" step="0.25" aria-label="Extra pause at the end of a sentence, in beats">
      <div class="row"><span class="label">Pause at paragraph break</span><output id="paraOut" for="paraPause"></output></div>
      <input type="range" id="paraPause" min="0" max="4" step="0.5" aria-label="Extra pause at a paragraph break, in beats">
      <label class="check"><input type="checkbox" id="clausePause"> Short pause at commas and semicolons</label>
      <label class="check"><input type="checkbox" id="longWords"> Linger on long words</label>
    </div>

    <div class="stats" id="stats"></div>
    <div class="tips">Space plays and pauses. Arrows step a sentence or change speed. Library has free classics from Project Gutenberg.</div>
  </div>

  <div id="sheetText" class="sheet" hidden role="dialog" aria-label="Text">
    <div class="sheet-head">
      <h2>Text</h2>
      <div class="btnrow"><button class="chip" id="closeText">Done</button><button class="chip primary" id="readNow">Read now</button></div>
    </div>
    <textarea id="src" maxlength="100000" spellcheck="false" placeholder="Paste anything up to 100,000 characters: an article, a chapter, your notes."></textarea>
    <div class="counter"><span id="counter"></span><span id="note"></span></div>
    <div class="btnrow"><button class="btn" id="btnPaste">Paste</button><button class="btn" id="btnSample">Sample text</button><button class="btn" id="btnClear">Clear</button></div>
  </div>

  <div id="sheetLib" class="sheet" hidden role="dialog" aria-label="Library">
    <div class="sheet-head"><h2>Library <span class="eyebrow">project gutenberg</span></h2><button class="chip" id="closeLib">Done</button></div>
    <form class="search" id="libSearch">
      <input type="search" id="libQ" placeholder="Search 75,000 free books by title or author" aria-label="Search Project Gutenberg" autocomplete="off">
      <button class="chip primary" type="submit">Search</button>
    </form>
    <div class="counter"><span id="libMsg"></span></div>
    <div class="body">
      <div id="libResults" class="list" hidden></div>
      <div class="label">Try here (short excerpts built into the demo)</div>
      <div class="list" id="libDemo"></div>
      <div class="label">Shelf (full books, loads in the installed app)</div>
      <div class="list" id="libShelf"></div>
    </div>
  </div>

  <div id="sheetStyle" class="sheet half" hidden role="dialog" aria-label="Style">
    <div class="sheet-head"><h2>Style</h2><button class="chip" id="closeStyle">Done</button></div>
    <div class="body">
      <div class="group">
        <div class="row"><span class="label">Reading font</span></div>
        <select id="font" aria-label="Reading font">
          <option value="literata">Literata (serif, made for screens)</option>
          <option value="atkinson">Atkinson Hyperlegible (sans)</option>
          <option value="system">System sans</option>
          <option value="georgia">Georgia</option>
          <option value="mono">Monospace</option>
        </select>
        <div class="row"><span class="label">Size</span><output id="sizeOut" for="size">48 px</output></div>
        <input type="range" id="size" min="24" max="96" step="2" aria-label="Font size">
        <label class="check"><input type="checkbox" id="bold"> Bold</label>
      </div>
      <div class="group">
        <div class="row"><span class="label">Colors</span></div>
        <div class="swatches" id="presets">
          <button class="swatch" data-p="sepia" style="background:#f3e9d2;color:#3a2e1c">Sepia</button>
          <button class="swatch" data-p="paper" style="background:#fbfaf7;color:#15171c">Paper</button>
          <button class="swatch" data-p="night" style="background:#0a0b0f;color:#ebe7de">Night</button>
          <button class="swatch" data-p="slate" style="background:#1c2230;color:#dde5f2">Slate</button>
          <button class="swatch" data-p="contrast" style="background:#000;color:#ffe95c">Contrast</button>
          <button class="swatch" data-p="auto" style="background:var(--stage-bg);color:var(--stage-fg)">Auto</button>
        </div>
        <div class="colors">
          <label class="color">Background<input type="color" id="cBg"></label>
          <label class="color">Text<input type="color" id="cFg"></label>
          <label class="color">Pivot letter<input type="color" id="cPivot"></label>
        </div>
      </div>
      <div class="group">
        <label class="check"><input type="checkbox" id="orp"> Highlight the pivot letter (single-word flashes)</label>
        <label class="check"><input type="checkbox" id="guides"> Show guide marks</label>
        <label class="check"><input type="checkbox" id="wake"> Keep the screen awake while reading</label>
      </div>
    </div>
  </div>
</div>

<script>
/* ============================================================
   ENGINE — pure functions, no DOM. Everything timing-related lives here.
   ============================================================ */
const Saccade = (function(){
  const PASTE_MAX = 100000;   // cap for the paste box only; the engine itself handles whole books
  const ABBR = new Set(('mr. mrs. ms. dr. prof. sr. jr. st. mt. ft. vs. etc. e.g. i.e. cf. no. inc. ltd. co. corp. dept. est. approx. ' +
    'jan. feb. mar. apr. jun. jul. aug. sep. sept. oct. nov. dec. mon. tue. wed. thu. fri. sat. sun. a.m. p.m. u.s. u.k.').split(/\s+/));

  /* Does this word close a sentence? Punctuation-aware, with an abbreviation list so "Dr." and "e.g." do not stop the flow. */
  function isSentenceEnd(w){
    if(!/[.!?…]["'”’)\]]*$/.test(w)) return false;
    const core = w.replace(/^["'“”‘’(\[]+/, '').replace(/["'“”‘’()\[\]]+$/, '').toLowerCase();
    if(ABBR.has(core)) return false;
    if(/^[a-z]\.$/.test(core)) return false;          // initials: "J."
    if(/^(?:[a-z]\.){2,}$/.test(core)) return false;  // acronyms: "u.s.a."
    if(/^\d+\.$/.test(core)) return false;            // list numbers: "1."
    return true;
  }

  /* Split text into word tokens. Paragraphs are blank-line separated.
     token: { w, sent (sentence end), para (last word before a paragraph break), end (sent || para || last), clause (comma-ish) } */
  function tokenize(src){
    const out = [];
    const paras = String(src || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
    for(let p = 0; p < paras.length; p++){
      const ws = paras[p].split(/\s+/).filter(Boolean);
      for(let i = 0; i < ws.length; i++){
        const w = ws[i], last = i === ws.length - 1, sent = isSentenceEnd(w);
        out.push({ w, sent, para: last && p < paras.length - 1, end: sent || last,
                   clause: !sent && /[,;:—–]["'”’)\]]*$/.test(w) });
      }
    }
    return out;
  }

  /* Optimal recognition point: the letter the eye should rest on, by word length. */
  function orp(len){ return len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4; }

  /* How many "beats" (one beat = 60000 / wpm ms) a token stays on screen, given settings S. */
  function beats(t, S){
    let b = 1;
    if(S.longWords && t.w.length > 8) b += Math.min(.6, (t.w.length - 8) * .1);
    if(t.para) b += S.paraPause + (t.sent ? S.sentPause : 0);
    else if(t.sent) b += S.sentPause;
    else if(t.clause && S.clausePause) b += .35;
    return b;
  }

  /* Prefix sums of beats, so remaining time and frame duration are O(1). */
  function buildCum(tokens, S){
    const cum = new Float64Array(tokens.length + 1);
    for(let i = 0; i < tokens.length; i++) cum[i + 1] = cum[i] + beats(tokens[i], S);
    return cum;
  }

  /* A frame is up to `wpf` tokens starting at i, never crossing a sentence or paragraph end. */
  function frameAt(tokens, i, wpf){
    const n = Math.min(wpf, tokens.length - i); let e = i;
    for(let k = 0; k < n; k++){ e++; if(tokens[e - 1].end) break; }
    return { start: i, end: e };
  }

  /* The start index of the frame with the most characters (used to size multi-word flashes once, so they never wrap). */
  function widestFrame(tokens, wpf){
    let best = -1, bi = 0, i = 0;
    while(i < tokens.length){
      const f = frameAt(tokens, i, wpf); let c = 0;
      for(let k = f.start; k < f.end; k++) c += tokens[k].w.length + 1;
      if(c > best){ best = c; bi = i; }
      i = f.end;
    }
    return bi;
  }

  function sentenceStart(tokens, i){ let j = Math.min(i, tokens.length); while(j > 0 && !tokens[j - 1].end) j--; return j; }
  function sentenceEnd(tokens, i){ let j = i; while(j < tokens.length && !tokens[j].end) j++; return Math.min(tokens.length, j + 1); }

  /* Trim the Project Gutenberg license header and footer from a plain-text ebook. */
  function stripGutenberg(t){
    t = String(t || '');
    const startRe = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*/i;
    const endRe = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;
    const s = t.search(startRe); if(s >= 0){ const nl = t.indexOf('\n', s); t = nl >= 0 ? t.slice(nl + 1) : ''; }
    const e = t.search(endRe); if(e >= 0) t = t.slice(0, e);
    return t.replace(/\r\n?/g, '\n').trim();
  }

  return { PASTE_MAX, ABBR, isSentenceEnd, tokenize, orp, beats, buildCum, frameAt, widestFrame, sentenceStart, sentenceEnd, stripGutenberg };
})();

/* ============================================================
   APP — DOM wiring, playback loop, persistence, library.
   ============================================================ */
(function(){
'use strict';
const E = Saccade;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const KEY = 'saccade.v2';
const DEF = { wpm:300, wpf:1, sentPause:1, paraPause:1.5, clausePause:true, longWords:true,
              font:'literata', size:48, bold:false, preset:'sepia', stageBg:'', stageFg:'', pivot:'', orp:true, guides:true, wake:true };
const FONTS = {
  literata:'"Literata",Georgia,"Times New Roman",serif',
  atkinson:'"Atkinson Hyperlegible",system-ui,sans-serif',
  system:'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  georgia:'Georgia,"Times New Roman",serif',
  mono:'ui-monospace,Menlo,Consolas,"Courier New",monospace'
};
const PRESETS = { auto:null, sepia:['#f3e9d2','#3a2e1c','#b4321f'], paper:['#fbfaf7','#15171c','#d4213b'], night:['#0a0b0f','#ebe7de','#ff5c70'],
                  slate:['#1c2230','#dde5f2','#ff7a8a'], contrast:['#000000','#ffe95c','#ff8a1f'] };

/* Project Gutenberg. Search goes through Gutendex (CORS-enabled). Book text comes from gutenberg.org, which does not send CORS
   headers, so the installed app routes it through a tiny proxy (see HANDOFF.md). Leave PROXY empty to try direct only. */
const GUTENDEX = 'https://gutendex.com/books';
const PROXY = '';   // e.g. 'https://saccade-proxy.<you>.workers.dev/?url='
const bookUrl = id => 'https://www.gutenberg.org/cache/epub/' + id + '/pg' + id + '.txt';
const SHELF = [
  [1342,'Pride and Prejudice','Jane Austen',1813],[98,'A Tale of Two Cities','Charles Dickens',1859],[2701,'Moby-Dick','Herman Melville',1851],
  [84,'Frankenstein','Mary Shelley',1818],[11,"Alice's Adventures in Wonderland",'Lewis Carroll',1865],[1661,'The Adventures of Sherlock Holmes','Arthur Conan Doyle',1892],
  [345,'Dracula','Bram Stoker',1897],[64317,'The Great Gatsby','F. Scott Fitzgerald',1925],[174,'The Picture of Dorian Gray','Oscar Wilde',1890],
  [1260,'Jane Eyre','Charlotte Brontë',1847],[768,'Wuthering Heights','Emily Brontë',1847],[215,'The Call of the Wild','Jack London',1903],
  [120,'Treasure Island','Robert Louis Stevenson',1883],[43,'The Strange Case of Dr. Jekyll and Mr. Hyde','Robert Louis Stevenson',1886],[74,'The Adventures of Tom Sawyer','Mark Twain',1876],
  [76,'Adventures of Huckleberry Finn','Mark Twain',1884],[35,'The Time Machine','H. G. Wells',1895],[36,'The War of the Worlds','H. G. Wells',1898],
  [514,'Little Women','Louisa May Alcott',1868],[46,'A Christmas Carol','Charles Dickens',1843],[844,'The Importance of Being Earnest','Oscar Wilde',1895],
  [2591,"Grimms' Fairy Tales",'Jacob and Wilhelm Grimm',1812],[16,'Peter Pan','J. M. Barrie',1911],[55,'The Wonderful Wizard of Oz','L. Frank Baum',1900],
  [236,'The Jungle Book','Rudyard Kipling',1894],[113,'The Secret Garden','Frances Hodgson Burnett',1911],[45,'Anne of Green Gables','L. M. Montgomery',1908],
  [103,'Around the World in Eighty Days','Jules Verne',1872],[164,'Twenty Thousand Leagues Under the Sea','Jules Verne',1870],[1257,'The Three Musketeers','Alexandre Dumas',1844],
  [1184,'The Count of Monte Cristo','Alexandre Dumas',1844],[135,'Les Misérables','Victor Hugo',1862],[996,'Don Quixote','Miguel de Cervantes',1605],
  [2554,'Crime and Punishment','Fyodor Dostoevsky',1866],[1399,'Anna Karenina','Leo Tolstoy',1878],[5200,'The Metamorphosis','Franz Kafka',1915],
  [219,'Heart of Darkness','Joseph Conrad',1899],[158,'Emma','Jane Austen',1815],[105,'Persuasion','Jane Austen',1817],
  [1727,'The Odyssey','Homer (Butler translation)',-700],[2680,'Meditations','Marcus Aurelius',180],[132,'The Art of War','Sun Tzu',-500],
  [205,'Walden','Henry David Thoreau',1854],[1232,'The Prince','Niccolò Machiavelli',1532],[1497,'The Republic','Plato',-375]
];
/* Short public-domain openings so the library can be tried where the network is blocked (like this preview). */
const DEMO = [
  { id:1342, t:'Pride and Prejudice', a:'Jane Austen', y:1813, text:
`It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”

Mr. Bennet replied that he had not.

“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”

Mr. Bennet made no answer.

“Do you not want to know who has taken it?” cried his wife impatiently.

“You want to tell me, and I have no objection to hearing it.”

This was invitation enough.` },
  { id:98, t:'A Tale of Two Cities', a:'Charles Dickens', y:1859, text:
`It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way—in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.` },
  { id:2701, t:'Moby-Dick', a:'Herman Melville', y:1851, text:
`Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off—then, I account it high time to get to sea as soon as I can. This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship. There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.` }
];
const SAMPLE = `Your eyes do not glide across a page. They jump. Each jump is called a saccade, and between jumps the eye stops for a fraction of a second to take in a few letters. Ordinary reading is mostly stopping and jumping, and a surprising share of the time goes to the jumps themselves, to overshooting, and to drifting back over something you already saw.

This reader removes the jumps. Instead of moving your eyes to the words, it moves the words to your eyes, one flash at a time, with the colored letter held at the same spot on the screen. That letter marks the optimal recognition point, slightly left of a word's center, where it is identified fastest. Keep your gaze on it and let the text come to you.

Start around 300 words per minute. That is close to a comfortable pace for most adults, so nothing should feel rushed yet. When it feels easy, press the plus button. Most people are surprised to find 450 still comfortable, and 600 within reach for familiar material. Dense writing, e.g. a contract from Dr. Harper's office, deserves a slower setting and a longer pause at the end of each sentence.

A few tips. Pauses at sentence ends matter more than raw speed; they give your mind a beat to assemble meaning. Flashing two or three words at once suits fast readers and short words. If you lose the thread, tap the stage to pause, then step back a sentence. Nothing is lost. The text is waiting for you.`;

/* ---------- state ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let S = Object.assign({}, DEF);
try{ const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if(s && typeof s === 'object') S = Object.assign({}, DEF, s); }catch(e){}
S.wpm = clamp(+S.wpm || 300, 100, 1500); S.wpf = clamp(Math.round(+S.wpf) || 1, 1, 5); S.size = clamp(+S.size || 48, 24, 96);
if(!FONTS[S.font]) S.font = 'literata';
if(!(S.preset in PRESETS) && S.preset !== 'custom') S.preset = 'sepia';
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

let text = '', source = '', savedPos = 0, bookRef = null;
try{
  text = localStorage.getItem(KEY + '.text') || ''; source = localStorage.getItem(KEY + '.src') || '';
  savedPos = parseInt(localStorage.getItem(KEY + '.pos') || '0', 10) || 0;
  bookRef = JSON.parse(localStorage.getItem(KEY + '.book') || 'null');
}catch(e){}
if(!text){ text = SAMPLE; source = 'Sample text'; savedPos = 0; }

let tokens = [], cum = new Float64Array(1), multiScale = 1;
let pos = 0, shown = 0, playing = false, timer = 0, frames = 0, saveT = 0;
let startPos = 0, runStart = 0, elapsed = 0, sessionWords = 0, wakeLock = null;

/* ---------- elements ---------- */
const stage = $('#stage'), wordEl = $('#word'), preEl = $('.pre', wordEl), pivEl = $('.pivot', wordEl), postEl = $('.post', wordEl), meas = $('#meas');
const hint = $('#hint'), scrub = $('#scrub'), pct = $('#pct'), left = $('#left'), stats = $('#stats'), sourceEl = $('#source');
const btnPlay = $('#btnPlay'), icoPlay = $('#icoPlay'), icoPause = $('#icoPause');
const sheetText = $('#sheetText'), sheetStyle = $('#sheetStyle'), sheetLib = $('#sheetLib');
const ta = $('#src'), counter = $('#counter'), note = $('#note');
const libQ = $('#libQ'), libMsg = $('#libMsg'), libResults = $('#libResults'), libDemo = $('#libDemo'), libShelf = $('#libShelf');
const ui = { wpm:$('#wpm'), wpmOut:$('#wpmOut'), sent:$('#sentPause'), sentOut:$('#sentOut'), para:$('#paraPause'), paraOut:$('#paraOut'),
             clause:$('#clausePause'), long:$('#longWords'), font:$('#font'), size:$('#size'), sizeOut:$('#sizeOut'), bold:$('#bold'),
             orp:$('#orp'), guides:$('#guides'), wake:$('#wake'), cBg:$('#cBg'), cFg:$('#cFg'), cPivot:$('#cPivot') };

/* ---------- timing helpers ---------- */
const base = () => 60000 / S.wpm;                       // ms per beat
const msBetween = (a, b) => (cum[b] - cum[a]) * base();  // ms to read tokens a..b-1 at current settings
function fmt(ms){ const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); }
function rebuildCum(){ cum = E.buildCum(tokens, S); }

/* ---------- rendering ---------- */
function render(f){
  const ws = []; for(let i = f.start; i < f.end; i++) ws.push(tokens[i].w);
  const single = ws.length === 1 && S.orp;
  wordEl.classList.toggle('multi', !single); stage.classList.toggle('multi', !single);
  if(single){
    const w = ws[0], p = E.orp(w.length);
    preEl.textContent = w.slice(0, p); pivEl.textContent = w.charAt(p); postEl.textContent = w.slice(p + 1);
  } else { preEl.textContent = ''; pivEl.textContent = ''; postEl.textContent = ws.join(' '); }
  fit(single);
}
/* Multi-word flashes use one constant size per text, chosen so the widest frame fits on a single row. Measured once per
   text / words-per-flash / font / size change. Per-frame fit() below is only a safety net for odd glyph widths. */
function computeMultiScale(){
  multiScale = 1;
  if(S.wpf < 2 || !tokens.length) return;
  const f = E.frameAt(tokens, E.widestFrame(tokens, S.wpf), S.wpf);
  const ws = []; for(let k = f.start; k < f.end; k++) ws.push(tokens[k].w);
  meas.style.fontFamily = FONTS[S.font]; meas.style.fontWeight = S.bold ? '700' : '400'; meas.style.fontSize = S.size + 'px';
  meas.textContent = ws.join(' ');
  const max = stage.clientWidth - 28, w = meas.offsetWidth;
  if(max > 0 && w > max) multiScale = Math.max(.2, max / w);
}
/* Shrink the frame when it still would not fit the stage (URLs, very long words, big sizes). */
function fit(single){
  const sz = S.size * (single ? 1 : multiScale);
  wordEl.style.fontSize = sz + 'px';
  const max = stage.clientWidth - 28;
  if(max <= 0) return;
  const need = single ? 2 * Math.max(preEl.scrollWidth, postEl.scrollWidth) + pivEl.scrollWidth : postEl.scrollWidth;
  if(need > max) wordEl.style.fontSize = (sz * max / need) + 'px';
}
function showCurrent(){ if(shown < tokens.length) render(E.frameAt(tokens, shown, S.wpf)); }
function relayout(){ computeMultiScale(); showCurrent(); }

function updateProgress(){
  const n = tokens.length, p = n ? shown / n : 0;
  scrub.value = Math.round(p * 1000);
  pct.textContent = Math.round(p * 100) + '%';
  left.textContent = !n ? 'no text' : shown >= n ? 'finished' : fmt(msBetween(shown, n)) + ' left';
}
function effective(ms, words){ return ms > 2000 ? Math.round(words / (ms / 60000)) : 0; }
function updateStats(){
  const ms = elapsed + (playing ? performance.now() - runStart : 0);
  const words = sessionWords + (playing ? pos - startPos : 0);
  if(!words){ stats.textContent = tokens.length ? tokens.length.toLocaleString() + ' words loaded · ~' + fmt(msBetween(0, tokens.length)) + ' at ' + S.wpm + ' wpm' : 'No text loaded'; return; }
  const eff = effective(ms, words);
  stats.textContent = words.toLocaleString() + ' words read · ' + fmt(ms) + (eff ? ' · ' + eff + ' wpm effective' : '');
}

/* ---------- playback ---------- */
function setPlayIcon(){ icoPlay.hidden = playing; icoPause.hidden = !playing; btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
function play(){
  if(!tokens.length){ openSheet('text'); return; }
  if(pos >= tokens.length){ pos = 0; shown = 0; }
  playing = true; startPos = pos; runStart = performance.now();
  stage.classList.add('live'); setPlayIcon(); wake(true); tick();
}
function tick(){
  if(!playing) return;
  if(pos >= tokens.length){ finish(); return; }
  const f = E.frameAt(tokens, pos, S.wpf);
  shown = f.start; render(f);
  const d = msBetween(f.start, f.end); pos = f.end;
  updateProgress(); updateStats();
  if(++frames % 16 === 0) savePos();
  timer = setTimeout(tick, d);
}
function pause(){
  if(!playing) return;
  playing = false; clearTimeout(timer);
  elapsed += performance.now() - runStart; sessionWords += pos - startPos;
  stage.classList.remove('live'); setPlayIcon();
  hint.textContent = pos >= tokens.length ? 'Finished · tap to read again' : 'Paused · tap to resume';
  wake(false); savePos(); updateStats();
}
function finish(){
  pause(); shown = tokens.length; updateProgress();
  const eff = effective(elapsed, sessionWords);
  hint.textContent = 'Finished · ' + sessionWords.toLocaleString() + ' words · ' + fmt(elapsed) + (eff ? ' · ' + eff + ' wpm' : '') + ' · tap to read again';
}
function toggle(){ playing ? pause() : play(); }
function jump(i){
  i = clamp(i, 0, tokens.length);
  if(playing){ clearTimeout(timer); sessionWords += pos - startPos; startPos = i; }
  pos = i; shown = i;
  showCurrent(); updateProgress(); savePos();
  if(playing) tick();
  else hint.textContent = i >= tokens.length ? 'Finished · tap to read again' : i === 0 ? 'Tap to start' : 'Paused · tap to resume';
}
function restart(){ jump(0); elapsed = 0; sessionWords = 0; runStart = performance.now(); updateStats(); }
function prevSentence(){ let j = E.sentenceStart(tokens, shown); if(j >= shown && j > 0) j = E.sentenceStart(tokens, j - 1); jump(j); }
function nextSentence(){ jump(E.sentenceEnd(tokens, shown)); }
function savePos(){ clearTimeout(saveT); saveT = setTimeout(() => { try{ localStorage.setItem(KEY + '.pos', String(shown)); }catch(e){} }, 400); }

/* Screen wake lock: keep the phone awake while flashing. Tolerate refusal everywhere. */
async function wake(on){
  try{
    if(on && S.wake && 'wakeLock' in navigator && !wakeLock){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if(!on && wakeLock){ const l = wakeLock; wakeLock = null; await l.release(); }
  }catch(e){ wakeLock = null; }
}

/* ---------- text ---------- */
function setText(t, label, book){
  if(playing) pause();
  text = t; source = label || ''; bookRef = book || null;
  try{
    localStorage.setItem(KEY + '.src', source);
    localStorage.setItem(KEY + '.book', JSON.stringify(bookRef));
    localStorage.setItem(KEY + '.text', text);
  }catch(e){ try{ localStorage.removeItem(KEY + '.text'); }catch(e2){} }   // too big for storage: keep the book ref so it can be re-fetched
  loadText(0);
}
function loadText(startAt){
  tokens = E.tokenize(text); rebuildCum();
  elapsed = 0; sessionWords = 0; frames = 0;
  pos = shown = clamp(startAt || 0, 0, tokens.length);
  sourceEl.textContent = source || 'rsvp reader';
  computeMultiScale();
  if(tokens.length && shown < tokens.length) showCurrent();
  else { preEl.textContent = ''; pivEl.textContent = ''; postEl.textContent = ''; }
  hint.textContent = !tokens.length ? 'Add text to begin' : shown >= tokens.length ? 'Finished · tap to read again' : shown ? 'Paused · tap to resume' : 'Tap to start';
  updateProgress(); updateStats();
}
function updateCounter(){
  const v = ta.value, t = v.trim(), words = t ? t.split(/\s+/).length : 0;
  counter.textContent = v.length.toLocaleString() + ' / 100,000 characters · ' + words.toLocaleString() + ' words · ~' + fmt(words * base()) + ' at ' + S.wpm + ' wpm';
}
let counterT = 0;
function commitText(){
  const v = ta.value.slice(0, E.PASTE_MAX);
  if(v === text) return;
  setText(v, v === SAMPLE ? 'Sample text' : 'Pasted text');
}
function flash(msg){ note.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(() => { note.textContent = ''; }, 4000); }

/* ---------- library (Project Gutenberg) ---------- */
function bookRow(b, extra){
  const el = document.createElement('button'); el.className = 'book'; el.type = 'button';
  el.innerHTML = '<span class="bt"></span><span class="ba"></span>';
  el.firstChild.textContent = b.t;
  el.lastChild.textContent = [b.a, b.y ? (b.y < 0 ? 'c. ' + (-b.y) + ' BC' : b.y) : '', extra || ('#' + b.id)].filter(Boolean).join(' · ');
  return el;
}
function setLibMsg(m){ libMsg.textContent = m || ''; }
async function fetchText(url){
  try{ const r = await fetch(url); if(r.ok) return await r.text(); }catch(e){}
  if(PROXY){ const r = await fetch(PROXY + encodeURIComponent(url)); if(r.ok) return await r.text(); }
  throw new Error('unreachable');
}
async function loadBook(b){
  setLibMsg('Loading ' + b.t + '…');
  try{
    const t = E.stripGutenberg(await fetchText(bookUrl(b.id)));
    if(t.length < 500) throw new Error('empty');
    setText(t, b.t + ' · ' + b.a, { id: b.id, t: b.t, a: b.a });
    setLibMsg(''); closeSheets();
  }catch(e){
    setLibMsg('Can’t reach gutenberg.org from this preview. In the installed app this loads the whole book; the demo excerpts above work here.');
  }
}
async function searchBooks(q){
  q = q.trim(); if(!q) return;
  setLibMsg('Searching…'); libResults.hidden = true; libResults.innerHTML = '';
  try{
    const r = await fetch(GUTENDEX + '?search=' + encodeURIComponent(q) + '&languages=en&mime_type=text%2Fplain');
    if(!r.ok) throw new Error(r.status);
    const data = await r.json(), list = (data.results || []).slice(0, 20);
    if(!list.length){ setLibMsg('No matches for “' + q + '”.'); return; }
    list.forEach(x => {
      const b = { id: x.id, t: x.title, a: (x.authors && x.authors[0] && x.authors[0].name) || 'Unknown', y: 0 };
      const row = bookRow(b, (x.download_count || 0).toLocaleString() + ' downloads');
      row.addEventListener('click', () => loadBook(b)); libResults.appendChild(row);
    });
    libResults.hidden = false; setLibMsg((data.count || list.length).toLocaleString() + ' results');
  }catch(e){ setLibMsg('Search isn’t reachable from this preview. In the installed app it searches the whole catalog.'); }
}
DEMO.forEach(b => { const row = bookRow(b, 'opening excerpt'); row.addEventListener('click', () => { setText(b.text, b.t + ' · excerpt'); closeSheets(); }); libDemo.appendChild(row); });
SHELF.forEach(([id, t, a, y]) => { const b = { id, t, a, y }; const row = bookRow(b); row.addEventListener('click', () => loadBook(b)); libShelf.appendChild(row); });

/* ---------- sheets ---------- */
function openSheet(which){
  sheetText.hidden = which !== 'text'; sheetStyle.hidden = which !== 'style'; sheetLib.hidden = which !== 'lib';
  if(which === 'text'){ if(playing) pause(); ta.value = text.length <= E.PASTE_MAX ? text : ''; updateCounter(); }
  if(which === 'lib' && playing) pause();
}
function closeSheets(){ const wasText = !sheetText.hidden; sheetText.hidden = true; sheetStyle.hidden = true; sheetLib.hidden = true; if(wasText) commitText(); }

/* ---------- settings → UI ---------- */
function pauseLabel(v){ v = +v; return v === 0 ? 'none' : '+' + (Math.round(v * 100) / 100) + (v === 1 ? ' beat' : ' beats'); }
function hex(v){ v = (v || '').trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : /^#[0-9a-f]{3}$/i.test(v) ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : '#888888'; }
function applyStageColors(){
  const p = PRESETS[S.preset] || null;
  const bg = S.stageBg || (p ? p[0] : ''), fg = S.stageFg || (p ? p[1] : ''), pv = S.pivot || (p ? p[2] : '');
  stage.style.setProperty('--stage-bg', bg); stage.style.setProperty('--stage-fg', fg); stage.style.setProperty('--pivot', pv);
  $$('#presets button').forEach(b => b.classList.toggle('on', b.dataset.p === S.preset));
  const cs = getComputedStyle(stage);
  ui.cBg.value = hex(bg || cs.getPropertyValue('--stage-bg'));
  ui.cFg.value = hex(fg || cs.getPropertyValue('--stage-fg'));
  ui.cPivot.value = hex(pv || cs.getPropertyValue('--pivot'));
}
function applySettings(){
  ui.wpm.value = S.wpm; ui.wpmOut.textContent = S.wpm + ' wpm';
  $$('#wpf button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.wpf));
  ui.sent.value = S.sentPause; ui.sentOut.textContent = pauseLabel(S.sentPause);
  ui.para.value = S.paraPause; ui.paraOut.textContent = pauseLabel(S.paraPause);
  ui.clause.checked = S.clausePause; ui.long.checked = S.longWords;
  ui.font.value = S.font; ui.size.value = S.size; ui.sizeOut.textContent = S.size + ' px'; ui.bold.checked = S.bold;
  ui.orp.checked = S.orp; ui.guides.checked = S.guides; ui.wake.checked = S.wake;
  wordEl.style.fontFamily = FONTS[S.font];
  wordEl.classList.toggle('bold', S.bold);
  stage.classList.toggle('noguides', !S.guides);
  applyStageColors();
  rebuildCum(); updateProgress(); updateStats(); relayout();
}
function set(k, v, opts){ S[k] = v; save(); if(opts && opts.cum) rebuildCum(); applySettings(); }

/* ---------- events ---------- */
stage.addEventListener('click', toggle);
btnPlay.addEventListener('click', toggle);
$('#btnRestart').addEventListener('click', restart);
$('#btnPrev').addEventListener('click', prevSentence);
$('#btnNext').addEventListener('click', nextSentence);
scrub.addEventListener('input', () => jump(Math.round(scrub.value / 1000 * tokens.length)));

ui.wpm.addEventListener('input', () => { S.wpm = +ui.wpm.value; ui.wpmOut.textContent = S.wpm + ' wpm'; updateProgress(); updateStats(); save(); });
$('#wpmDown').addEventListener('click', () => set('wpm', clamp(S.wpm - 10, 100, 1500)));
$('#wpmUp').addEventListener('click', () => set('wpm', clamp(S.wpm + 10, 100, 1500)));
$$('#wpf button').forEach(b => b.addEventListener('click', () => set('wpf', +b.dataset.v)));
ui.sent.addEventListener('input', () => set('sentPause', +ui.sent.value, {cum:true}));
ui.para.addEventListener('input', () => set('paraPause', +ui.para.value, {cum:true}));
ui.clause.addEventListener('change', () => set('clausePause', ui.clause.checked, {cum:true}));
ui.long.addEventListener('change', () => set('longWords', ui.long.checked, {cum:true}));

ui.font.addEventListener('change', () => set('font', ui.font.value));
ui.size.addEventListener('input', () => set('size', +ui.size.value));
ui.bold.addEventListener('change', () => set('bold', ui.bold.checked));
ui.orp.addEventListener('change', () => set('orp', ui.orp.checked));
ui.guides.addEventListener('change', () => set('guides', ui.guides.checked));
ui.wake.addEventListener('change', () => { set('wake', ui.wake.checked); if(playing) wake(S.wake); });
$$('#presets button').forEach(b => b.addEventListener('click', () => { S.preset = b.dataset.p; S.stageBg = S.stageFg = S.pivot = ''; save(); applySettings(); }));
ui.cBg.addEventListener('input', () => { S.preset = 'custom'; S.stageBg = ui.cBg.value; save(); applyStageColors(); });
ui.cFg.addEventListener('input', () => { S.preset = 'custom'; S.stageFg = ui.cFg.value; save(); applyStageColors(); });
ui.cPivot.addEventListener('input', () => { S.preset = 'custom'; S.pivot = ui.cPivot.value; save(); applyStageColors(); });

$('#btnText').addEventListener('click', () => openSheet('text'));
$('#btnLib').addEventListener('click', () => openSheet('lib'));
$('#btnStyle').addEventListener('click', () => openSheet(sheetStyle.hidden ? 'style' : null));
$('#closeText').addEventListener('click', closeSheets);
$('#closeLib').addEventListener('click', closeSheets);
$('#closeStyle').addEventListener('click', closeSheets);
$('#readNow').addEventListener('click', () => { closeSheets(); if(tokens.length) play(); });
$('#btnSample').addEventListener('click', () => { ta.value = SAMPLE; updateCounter(); });
$('#btnClear').addEventListener('click', () => { ta.value = ''; updateCounter(); ta.focus(); });
$('#btnPaste').addEventListener('click', async () => {
  try{
    const t = await navigator.clipboard.readText();
    if(t){ ta.value = ((ta.value ? ta.value.replace(/\s+$/, '') + '\n\n' : '') + t).slice(0, E.PASTE_MAX); updateCounter(); return; }
  }catch(e){}
  ta.focus(); flash('Clipboard is blocked here. Long-press the box and choose Paste.');
});
ta.addEventListener('input', () => { clearTimeout(counterT); counterT = setTimeout(updateCounter, 120); });
$('#libSearch').addEventListener('submit', e => { e.preventDefault(); searchBooks(libQ.value); });

document.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  if(/^(TEXTAREA|INPUT|SELECT|BUTTON)$/.test(tag)){ if(e.key === 'Escape'){ closeSheets(); } return; }
  if(e.key === 'Escape'){ closeSheets(); return; }
  if(!sheetText.hidden || !sheetLib.hidden) return;
  if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); toggle(); }
  else if(e.key === 'ArrowLeft'){ e.preventDefault(); prevSentence(); }
  else if(e.key === 'ArrowRight'){ e.preventDefault(); nextSentence(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); set('wpm', clamp(S.wpm + 10, 100, 1500)); }
  else if(e.key === 'ArrowDown'){ e.preventDefault(); set('wpm', clamp(S.wpm - 10, 100, 1500)); }
});
document.addEventListener('visibilitychange', () => { if(document.hidden && playing) pause(); });
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(relayout, 120); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

/* ---------- boot ---------- */
applySettings();
loadText(savedPos);
if(bookRef && text === SAMPLE) loadBook(bookRef);   // text was too large to store last time: fetch the book again
})();
</script>
</body>
</html>
```

---

## Appendix B — Gutenberg text proxy (Cloudflare Worker)

`wrangler.toml`: `name = "saccade-proxy"`, `main = "src/index.js"`, `compatibility_date = "2026-01-01"`. Deploy with `npx wrangler deploy`.

```js
// src/index.js — forwards only Project Gutenberg plain-text files, adds CORS, caches 30 days at the edge.
const ALLOW = /^https:\/\/www\.gutenberg\.org\/(cache\/epub\/\d+\/pg\d+\.txt|files\/\d+\/\d+(-0)?\.txt|ebooks\/\d+\.txt\.utf-8)$/;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url).searchParams.get('url') || '';
    if (!ALLOW.test(url)) return new Response('forbidden', { status: 403, headers: CORS });
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Saccade reader (single-book fetch, edge-cached)' },
      cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 * 30 }
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=2592000' }
    });
  }
};
```

Then in `index.html`: `const PROXY = 'https://saccade-proxy.<account>.workers.dev/?url=';`

---

## Appendix C — Claude Code kickoff prompt

> Read `HANDOFF.md` in full. It is a design spec with the complete demo source in Appendix A and a proxy in Appendix B. Create `index.html` from Appendix A exactly, then do the build plan in §13 in order: deploy the Worker and set `PROXY`, PWA shell (manifest, sw.js, icons), share-target intake, grapheme-safe ORP, reset-settings button, headless engine test, manual checklist. Keep the `Saccade` engine object pure and separate from DOM code. No frameworks, no build step. When done, rewrite `HANDOFF.md` with what changed, what you tested, and what is next.
