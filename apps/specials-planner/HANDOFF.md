# HANDOFF.md — Palette (specials lesson planner)

> **Integrated 2026-08-08** into the SWS-apps studio at `apps/specials-planner/` (Firebase Hosting, not lucidwinds GitHub Pages as written below). T1 done: hub card added, studio footer + og tags wired, icons designed, tests moved to `test/`. T4 (Drive CLIENT_ID) and T5 (TIP_URL) still await Stephen's credentials — both features auto-hide until then.
> **Renamed 2026-08-08**: the product is now **Specials Planner** (Stephen's call — the name has to say what it is). "Palette" below is the same app. Internal identifiers kept for backup compatibility: localStorage key `palette2`, backup marker `app:'palette'`.
> **School-safety round 2026-08-08**: WCAG 2.1 AA pass (contrast-corrected chips/primary buttons/links, aria names on grid boxes, modal focus trap + Escape, labeled setup fields, tab keyboard nav; second review round added a dedicated #live region instead of a live main view, refocus() after every re-render, a Ctrl+Enter keyboard path to the copy bar, and focus-return after saving a special day — suite is now 52 assertions), `privacy.html` added (linked from both footnotes, in the SW shell), CSP + security headers scoped to this app in root `firebase.json`. If you wire Drive later, smoke-test against the CSP — allowed origins are accounts.google.com, www.googleapis.com, oauth2.googleapis.com.

> **Design-review round 2026-08-09 (READ THIS FIRST — the storage format changed):** lessons are no longer keyed to the calendar date. They are keyed to **cycle position** — `cells["c<n>|<period>"]`, where `n` is the nth teaching day of the year — so cancelling a day now slides the lessons forward with the rotation letters instead of leaving every plan attached to the wrong letter for the rest of the year. No-class days keep their own boxes under `cells["d<ISO>|<period>"]`. `migrate()` rewrites old date-keyed backups on import, and `cellText()` still falls back to a date key so nothing a migration cannot place is ever lost. Same round: dark mode fixed (the grid was `#fff` under near-white ink), every grid size moved onto `--t-*` tokens so the comfort panel reaches it, `contenteditable="plaintext-only"` so typed line breaks survive, the copy bar became an in-flow toolbar with real scope and `SWS.undo`, a verified save with a `pagehide` flush and a loud failure warning, a stacked day-card layout under 52rem, a sticky Day column above it, one-week-on-one-page print, and a `.trust` stamp. Suite is now **79 assertions**.

**To the Claude Code instance picking this up:** the app is **built, tested, and working**. Your job is verification, wiring two credentials, and deployment into the Lucid Winds apps collection — **not a rebuild**. If you find yourself restructuring `index.html`, stop and re-read this file.

## What this is

A lesson planner for specials teachers (art, music, PE, library). They plan one lesson and deliver it to many classes on a rotation — generic planners don't fit that. Palette generates every week of the school year from a one-time setup (year dates, teaching days, periods, lunch position, A/B/C rotation letters), then gives the teacher a grid of editable boxes matching the spreadsheet workflow she already had. Primary user: Jessie (Stephen's partner, art teacher). Public release intended — the app must stay safe and boring for a total stranger on first load.

## Repo contents

| file | what |
|---|---|
| `index.html` | the entire app — inline CSS + JS, no build step, no framework |
| `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` | PWA shell |
| `test/specials-planner.test.mjs` | jsdom regression harness — **79 assertions, currently green** |
| `package.json` | dev-only: jsdom + `npm test` |
| `README.md` | player-facing + deploy steps |

## Run / test

```bash
python3 -m http.server 8000       # service worker needs http/localhost, not file://
npm install && npm test           # runs palette.test.mjs against index.html
```

**Run `npm test` after ANY change. All 79 must be green before you commit.** The harness boots the real app in jsdom and covers: welcome flow, year generation, rotation math, special-day letter skipping, cell/notes persistence, the copy bar, backup round-trip with old/partial files, CSV shape and quoting, XSS inertness, setup reflow, and reset.

## Architecture — do not break

- **Storage:** `store` shim (localStorage with in-memory fallback). Key `palette2`. Never touch localStorage directly; never clear it except inside `resetAll()`.
- **State `S`** (`null` on first run → welcome screen):
  ```
  S = {
    config: { yearStart, yearEnd, workDays:[0-6], periods:1-10, lunchAfter:0-periods,
              letters:["A","B","C"], teacher:"", driveFileId:"" },
    cells:  { "c<cyclePosition>|<period>": "<text>",   // a normal teaching day
              "d<YYYY-MM-DD>|<period>": "<text>" },   // a no-class day's own boxes
    notes:  { "YYYY-MM-DD": "<text>" },               // notes stay on the DATE
    special:{ "YYYY-MM-DD": "<banner label>" }   // no-class day; skips rotation letter
  }
  ```
- **Schema changes must be additive.** `migrate()` fills missing keys with defaults and clamps ranges — old backups must always import. There's a test for this.
- **Rotation rule (the heart of the app):** letters cycle continuously over school days across the whole year; a `special` day does not consume a letter, so the cycle stays true after breaks. Implemented in `computeYear()`. Tests pin this behavior.
- **Cycle-position storage (the other half of that rule):** a lesson belongs to a position in the cycle, not to a date. `computeYear()` stamps each teaching day with `idx`, `cellKey()` turns that into `c<idx>|<period>`, and the calendar is a rendered projection. This is what makes the snow-day bump free: remove a day from the sequence and every later day inherits the plan that used to sit one place ahead. Do not "simplify" this back to a date key — that bug shipped once and it silently desynchronised a whole year.
- **User text is inert.** Cell/notes content is written via `.textContent`, never innerHTML. Labels interpolated into HTML go through `esc()`. Tests pin this too.
- **Key functions:** `buildYear` / `markStale` / `buildYearIfStale`, `render` → `renderWelcome | renderWeek | renderSetup`, `onBoxInput` + `queueSave` (400 ms debounce), `plainPaste`, copy bar (`onBoxFocus / doCopy`), `openSpecial / setSpecial`, `exportBackup / applyImportedText`, `exportCSV / csvField`, `mountDrive / withDriveToken / driveSave / driveLoad`.
- **Config seams**, top of the `<script>`: `CLIENT_ID` (Google OAuth) and `TIP_URL` (Stripe Payment Link). Both empty = feature hidden. This is the only wiring the code needs.

## Hard constraints

1. Vanilla only. Single-file app logic. No bundler, no framework, no dependencies at runtime.
2. Free core stays 100 % free — **paywall nothing, no ads, ever** in this pass. Tip jar gates nothing.
3. No account requirement. Drive is optional convenience, never a login wall.
4. No personal data of Jessie's ships in the file. The sample is generic; keep it that way.
5. Don't reintroduce a "lesson library." Jessie explicitly rejected it — boxes in a grid is the product.

## Your tasks, in order

### T1 — Deploy to the apps collection
- New repo (or folder in the portal repo, matching how the other lucidwinds.com apps are hosted), push all files, GitHub Pages from `main` root.
- Add Palette to the lucidwinds.com portal index alongside the other 75+ titles.
- **Done when:** live URL loads, welcome screen shows, `npm test` green on the deployed commit.

### T2 — PWA verification on real hardware
- Install to home screen on an Android phone and (if available) iOS. Open offline after first load — app and saved plans must work.
- If you change any shell file, bump `CACHE` in `sw.js`.
- **Done when:** installs, launches standalone, fully usable offline, data intact.

### T3 — Print pass on real hardware
- Print preview a full week at `periods` = 6, 7, 8. Must be one readable landscape page per week; `thead` repeats if it spills; no clipped boxes. Print CSS exists (`@media print`) — verify, adjust the `.box` print font-size only if a config overflows.
- **Done when:** Jessie can hand a printed week to a sub.

### T4 — Google Drive (needs Stephen)
- Stephen supplies a **Google OAuth Web Client ID** (Google Cloud Console → OAuth consent screen → Web client, authorized JavaScript origin = the deployed URL, scope `drive.file` — non-sensitive, no restricted-scope review).
- Paste it into `CLIENT_ID`. The save/load code is complete: GIS token flow, multipart create/update, `files.list` fallback discovery, 401 re-auth handling. Test the round trip: Save to Drive → Erase → Load from Drive.
- **Done when:** round trip works on the deployed origin. If Stephen doesn't have the Client ID yet, ship T1–T3 without it — the feature stays hidden.

### T5 — Tip jar (needs Stephen)
- Stephen supplies a **Stripe Payment Link** URL (he has Stripe under SWS LLC). Paste into `TIP_URL`. It renders one quiet link in the Setup footer, framed "free forever — tips optional." Gate nothing.

## Smoke test before calling it shipped

- [ ] Fresh load (cleared storage) → welcome → Start fresh → Setup → Apply → year generates, rotation correct, lunch in the right column
- [ ] "See a sample first" loads a generic populated week, not Jessie's data
- [ ] Type in boxes; paste from Word/Sheets arrives as plain text; refresh → data persists
- [ ] Copy bar: "Fill whole day" and "Fill all X-days" fill correctly; hidden on notes boxes
- [ ] ⚙ on a day → mark Teacher work day → letter disappears and the rest of the week's letters shift correctly
- [ ] Download backup → Erase → Restore round-trips; old partial backups import
- [ ] CSV opens clean in Google Sheets
- [ ] Print = one landscape page per week
- [ ] PWA installs; reopens offline; `npm test` green
- [ ] Drive round trip (if CLIENT_ID set)

## Out of scope (later / possible Pro tier — architect nothing that blocks these)

Per-day lunch overrides · A–F or block rotations · duplicate-year roll-forward · real-time Google **Sheets** sync (vs Drive JSON) · multi-school profiles · branded PDF export. Monetization stance on record: free core forever, one-time Pro unlock someday, never a subscription, never remove a free feature.
