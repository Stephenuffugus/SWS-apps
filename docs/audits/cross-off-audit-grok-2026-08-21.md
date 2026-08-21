# Grok QA audit: Cross Off, 2026-08-21

Verbatim conversion of the report Stephen received on 2026-08-21
(source file: Cross-Off-QA-Audit-Report.md.txt), extracted the same day so it is greppable
and can never be trapped in a chat window.

The auditor was given a code-level source package, not the public page. The
orientation it was handed is preserved beside this file at
docs/audits/package-readme-*-2026-08-21.md; read that before judging any
finding here.

BODY IS VERBATIM EXTERNAL TEXT. It is a third-party record, so it is left
exactly as written, including any em or en dashes. Treat it like a vendor
file: the house no-dashes rule still governs everything WE write, and no
phrasing should be copied out of here into our own copy without rewriting.

Every finding below is a LEAD, not a truth, until verified against source.
Verification status is tracked in docs/audits/VERDICTS-2026-08-21.md.

---

# Cross Off QA Audit Report

**For:** Sky Wolf Studio coder / release owner  
**Package audited:** `cross-off-qa-package.zip` (source as shipped)  
**Live:** https://skywolfstudio.com/cross-off/  
**Auditor date:** 2026-08-21  
**Studio:** Sky Wolf Studio · SWS Strategic Media LLC  

---

## Executive summary

Cross Off is a tight, well-intentioned single-file PWA. The ADHD design rulings (no guilt, automatic morning flip + Undo, celebration-only feedback) are consistently implemented in code. The three hard-won gesture/render invariants from `HANDOFF.md` are present and commented. XSS is handled correctly via `textContent`. Privacy claims match behavior (no user data leaves the device). The included regression suite reports **83 passed, 0 failed**.

The highest risks for a live user-test audience are **data-loss / trust** vectors, not polish:

1. Service worker activate deletes **all other caches on the shared origin** (fleet-wide offline breakage).
2. No multi-tab / `storage` synchronization — morning flip can run twice across tabs.
3. Silent localStorage failure + no export/backup path.

Everything else is secondary. Fixes should stay small (invariants, lifecycle, validation) — no rewrites, no libraries.

---

## Ranked findings

| ID   | Severity            | Disposition     | One-line |
|------|---------------------|-----------------|----------|
| CO-1 | **High**            | Fix before next deploy | SW `activate` deletes every cache that is not exactly `cross-off-v10` |
| CO-2 | **High**            | Fix soon        | No multi-tab sync; morningFlip can double-fire |
| CO-3 | **Medium**          | Fix soon        | Silent storage failure; no export/backup |
| CO-8 | **Medium**          | Fix soon        | morningFlip can run while user is mid-edit / in focus |
| CO-4 | **Low**             | Nice-to-have    | Undo after morningFlip does not fully restore `lastFlip` / consistency |
| CO-5 | **Low**             | Nice-to-have    | Test harness emits noisy uncaught errors even when green |
| CO-9 | **Low**             | Monitor         | Unbounded stroke point arrays + 120 past days can pressure quota |
| CO-7 | **Info / Device**   | Device test     | DST / manual clock-skew around day boundary |
| CO-6 | **Info (positive)** | Keep            | Manifest already carries unique `"id": "/cross-off/"` |

---

## Per-finding detail

### CO-1 — Service worker wipes sibling caches (High)

**Location:** `sw.js` lines 11–15

```js
caches.keys().then(keys =>
  Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
)
```

**Why it matters:** App is served from a shared origin with ~30 sibling apps. Any Cross Off update/install will delete every other app’s offline cache on that origin. Users of those apps lose offline start until they re-visit each one.

**Repro:** Install any sibling, then deploy/activate Cross Off SW → inspect `caches.keys()` in DevTools.

**Fix direction (small):** Only delete keys that start with a Cross Off prefix, e.g.

```js
keys.filter(k => k.startsWith('cross-off-') && k !== CACHE)
```

---

### CO-2 — Multi-tab / living-session morningFlip race (High)

**Locations:**

- `morningFlip` / `flipPage` (~836–882)
- Boot path (~1768)
- `checkNewDay` + `visibilitychange` / `pageshow` / 60 s interval (~1772–1786)

**Why it matters:** Two tabs left open across midnight (or one foreground + one background) can both decide “new day” and call `morningFlip`. Result: duplicate past entries, chores rewritten twice, or a second silent flip after the first Undo toast has already appeared. Data integrity > UX for this audience.

**Repro sketch:**

1. Open app in two tabs.
2. Mark tasks done.
3. Advance system clock past midnight (or wait).
4. Focus each tab → both may flip.

There is no `window.addEventListener('storage', …)` and no leader-election / version stamp on the flip.

**Fix direction:**

- On `storage` event for `crossoff.v1`, re-`load()` and re-render (or at least abort a pending flip if `lastFlip` / `doneDate` already moved).
- Guard `morningFlip` with “if `state.lastFlip === todayStr()` return false”.

---

### CO-3 — Silent storage failure + no escape hatch (Medium)

**Location:** `save()` (~677–690)

```js
}catch(e){/* no storage available: session runs in-memory */}
```

**Why it matters:** QuotaExceededError, private browsing, or Safari storage eviction leaves the user working against an in-memory copy that vanishes on reload. No toast, no “your work is safe” signal, no export. One silent loss of a page ends usage for the target user.

**Also missing:** any backup/restore or “Download my notebook” path (called out in the audit brief).

**Fix direction:**

- Catch `QuotaExceededError` specifically and surface a calm toast (“Storage is full — export a backup?”).
- Add a minimal JSON export / import (clipboard or file) under the page sheet or colophon. Keep it optional and quiet.

---

### CO-8 — morningFlip while mid-edit (Medium)

**Locations:** same as CO-2 + sheet / focus open state.

**Why it matters:** Flip runs on visibility / interval / boot with no check for open sheet, focus mode, or focused input. User can be mid-sentence in the edit sheet when the page underneath is replaced; Undo toast appears over the sheet.

**Fix direction:** Defer flip while `document.body.classList.contains('sheet-open')` or focus screen is shown; run it on next close / visibility.

---

### CO-4 — Incomplete Undo after morningFlip (Low)

**Location:** Undo handler inside `morningFlip` (~879–882)

Restores `past` + `tasks` but does not touch `state.lastFlip` or re-sync `doneToday`. Mostly cosmetic; next day still works.

---

### CO-5 — Noisy test harness (Low)

`node test/cross-off.test.mjs` (after providing `jsdom`) ends with **83 passed, 0 failed**, but prints many:

- `HTMLCanvasElement.prototype.getContext` not implemented
- `matchMedia is not defined` (install affordance script)

**Fix:** In the test’s `beforeParse`, stub:

```js
win.HTMLCanvasElement.prototype.getContext = () => null;
win.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){} });
```

---

### CO-9 — Storage growth from strokes (Low)

`MAX_PAST_DAYS = 120` is good. Stroke point arrays are unbounded. A heavy highlighter user + many past days can still approach quota.

**Monitor / later:** Cap points per stroke or downsample on save.

---

### CO-7 — Day-boundary edge cases (Device test required)

`todayStr()` is local-date only. Manual clock set-back, DST spring-forward/fall-back, or timezone change while the app is alive can produce an extra or skipped flip. The rollover watcher is the right idea; these edges need a real phone.

**DEVICE/HUMAN TEST REQUIRED** (from HANDOFF checklist + brief):

- App left open across midnight
- Device asleep at midnight, then unlocked
- Timezone / DST change
- Multiple tabs
- Flip while mid-edit / focus open
- Timer running → kill app → reopen (still counting, no buzz if already past)
- Flip-back pile keeps ink; chore returns undone
- VoiceOver / TalkBack over rows
- Offline start after first visit

---

### CO-6 — Positive: manifest id

```json
"id": "/cross-off/",
"scope": "./"
```

Correctly addresses the known fleet “portal identity” issue for this app. Keep it.

---

## What the tests already cover (and passed)

- Fresh boot + seeded pages
- Add / priority prefixes / multi-line paste
- Complete / un-cross / chore rewrite / records
- morningFlip + carry-forward + Undo
- Persistence round-trip + daily `doneToday` reset
- Hand-me-one
- XSS via hostile task text (uses `textContent`)
- 83 assertions green

Stroke *rendering* and real gesture direction-lock are correctly left to the phone checklist.

---

## Regression-test list to add after fixes

1. SW activate only deletes `cross-off-*` keys (unit or manual cache inspection).
2. Two JSDOM windows sharing a mock `localStorage` both call `checkNewDay` → only one flip occurs.
3. `save()` under forced `QuotaExceededError` surfaces a toast (or at least does not stay silent).
4. `morningFlip` while a sheet is open is deferred.
5. Export → clear storage → import restores pages, past, records, strokes.

---

## Release acceptance criteria

Ship the next build only when:

- [ ] CO-1 fixed (sibling caches survive).
- [ ] CO-2 fixed or mitigated (no double flip across tabs / living sessions).
- [ ] CO-3 at least partially addressed (user-visible storage failure + optional export).
- [ ] Existing 83 tests still green.
- [ ] Phone checklist in `HANDOFF.md` re-run on a real device (especially midnight + kill-while-timer).
- [ ] Privacy page claims still match behavior.
- [ ] No new runtime dependencies, no build step introduced.

---

## What is already solid (do not “improve” away)

- Zero-deps single-file design
- Automatic morning flip + Undo (the v1 “flip when ready” bar was correctly abandoned)
- Gesture invariants (resize ignore height-only, `touch-action: pan-y` + direction lock, 350 ms ghost-click guard)
- `textContent` for all user-visible task/page text
- Timer deadline is wall-clock and arrives already-buzzed if it expired while closed
- Calm overtime, no guilt copy
- Service worker is network-first for navigations (avoids “nothing changed” after deploy)

---

## Hard constraints (from package brief — respect in all fixes)

- Zero runtime dependencies, no build step, no framework, no analytics, no backend.
- Fixes should be small invariants, validation, and lifecycle corrections — never a rewrite or a library.
- ADHD design rulings are settled product decisions: automatic behavior plus Undo beats offering choices; no guilt mechanics; destructive actions get Undo, not a confirm.
- House voice: no em or en dashes in any copy you suggest.

---

## Priority order for the next commits

1. **CO-1** — SW cache prefix guard (fleet safety)
2. **CO-2** — `storage` event + `lastFlip` guard around morningFlip
3. **CO-3** — QuotaExceeded toast + minimal export/import
4. **CO-8** — Defer flip while sheet/focus open
5. Everything else in severity order

Hand this report to the coder with the original package. The highest-leverage next commits are the SW cache prefix guard and a `storage` / `lastFlip` guard around `morningFlip`.
