# Grok QA audit: Overload, 2026-08-21

Verbatim conversion of the report Stephen received on 2026-08-21
(source file: OVERLOAD-AUDIT-REPORT.md.txt), extracted the same day so it is greppable
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

# OVERLOAD — QA Audit Report
**Sky Wolf Studio · SWS Strategic Media LLC**  
**Auditor:** Grok (xAI)  
**Package date:** 2026-08-21  
**Live:** https://skywolfstudio.com/overload/  
**Tests:** 68/68 passed (`node test/overload.test.mjs`)

---

## Executive summary

OVERLOAD is a clean, single-file, zero-dependency progressive-overload PWA. The prescription engine (judge → schedule → stall/swap → plate math → warm-up ramp → e1RM) is pinned by 68 green assertions and matches the documented rules in HANDOFF.md. Load/save is defensive, the zero-typing post-creation UX holds, privacy claims match behavior, and the manifest now carries a unique `id`.

The only high-severity defect is the service-worker activate handler: it deletes every Cache Storage entry on the shared origin whose name is not exactly `overload-v9`. That is the exact failure class called out in READ_ME_FIRST_FOR_CHATGPT.md and will silently break offline shells of sibling apps. Everything else is medium/low or stylistic (house Undo pattern, silent quota failures, unbounded history).

---

## Ranked findings

| ID  | Severity  | Disposition                          | Summary                                                              |
|-----|-----------|--------------------------------------|----------------------------------------------------------------------|
| F1  | Critical  | Must-fix before fleet deploy / Play | SW activate wipes sibling caches on the shared origin                |
| F2  | Medium    | Should-fix (house pattern)         | Wipe-all uses irreversible confirm; no Undo                          |
| F3  | Low       | Optional / document                  | Mid-session close uses native confirm                                |
| F4  | Low       | Optional                             | `save()` swallows QuotaExceeded / other storage errors silently      |
| F5  | Low       | Optional (future)                    | History arrays grow without bound                                    |
| F6  | Info      | N/A (expected)                       | Package omits binary assets (fonts, icons); live site has them       |
| F7  | Info      | Cosmetic                             | Install-affordance script can throw if `matchMedia` is absent        |

---

## Finding details

### F1 — SW activate deletes sibling caches (Critical)

**Location:** `sw.js` lines 12–16

```js
caches.keys().then(keys => Promise.all(
  keys.filter(k => k !== CACHE).map(k => caches.delete(k))
))
```

Cache Storage is origin-scoped, not service-worker-scoped. Any activate of the Overload worker (first install, or after a CACHE bump) removes every other cache name on `skywolfstudio.com`. Sibling apps that rely on their own cache names lose their offline shells.

This is the precise defect class called out in the package notes. Live `sw.js` is identical to the package.

**Minimal fix** (preserves the rest of the SW):

```js
// Only delete this app's prior caches
keys.filter(k => k.startsWith('overload-') && k !== CACHE)
```

or an explicit allow-list of prior Overload cache names. Do not rewrite the SW or introduce a shared worker.

---

### F2 — Wipe-all has no Undo (Medium)

**Location:** `index.html` ~897–902

Native `confirm` + `localStorage.removeItem` with the message “This cannot be undone.” Contradicts the studio house rule (“destructive actions get Undo, not a confirm”) that is already followed for lift delete and for restore.

**Suggested shape:** soft-clear, then toast with Undo that restores the previous JSON snapshot (exactly as the restore path already does).

---

### F3 — Mid-session close confirm (Low)

**Location:** `index.html` ~709–712

If any sets have been logged, a native confirm appears. This is intentional (no partial sessions) and the only practical way to protect against accidental discard under the current design. Acceptable as a deliberate exception to the pure-Undo rule; document it.

---

### F4 — Silent storage failures (Low)

**Location:** `save()`

```js
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
```

Quota or private-mode failures are swallowed. A toast (“Could not save – storage full”) would make the failure visible without changing the local-first model.

---

### F5 — Unbounded history (Low)

Each finished session appends to `p.history`. Volume glance and e1RM only read recent windows, but the stored object grows forever. Long-term users or heavy testers can eventually hit quota. A future soft cap (keep last N sessions per lift) is enough; not urgent for this release.

---

### F6 / F7 — Informational

- Binary assets (fonts/, icons) are intentionally absent from the audit package. Live site serves them; SW install succeeds there.
- The install-affordance script does an unguarded `matchMedia(...)`. `sws-ui.js` already guards with `window.matchMedia &&`. Add the same one-line guard to prevent ReferenceError on ancient browsers and in the jsdom harness.

---

## Engine & data-path verification (all green)

Verified against source and the included test suite:

- Verdict table, increments (2.5 isolation / 5 upper / 10 lower), deload floor at increment, plate math (greedy, empty-bar case), 3-day calendar scheduling, stall → swap at 85 % after three non-progress sessions, warm-up ramp rules (bar vs non-bar, honest-line minimum), Epley e1RM, weekly volume (last 7 days only).
- Backup shape `{app:'overload', version:2, data}`, restore + Undo, corrupt-storage fallback to clean defaults, unknown muscle-group drop, number clamping, `repMin === repMax` wording, 1-set sessions skip rest, session-weight isolation (`W.w` vs `p.w`).
- Load path is deliberately coercive; junk or stale-schema saves degrade to defaults, never to broken state.
- No network calls for user data; privacy.html claims are accurate.
- Manifest `id: "/overload/"` and `scope: "./"` address the portal-identity collision noted in the package.
- House voice (no em/en dashes) and fixed verdict vocabulary (ADD WEIGHT / ADD REPS / CONSOLIDATE / DELOAD −10%) are respected.
- Zero-typing invariant after initial lift creation holds; all post-creation controls are steppers or one-tap chips.

---

## Regression-test list

Existing 68 assertions already cover the core engine and major UX paths. Add:

1. SW activate only removes caches matching the Overload prefix (unit-testable with a fake CacheStorage).
2. Wipe → Undo restores the exact prior snapshot.
3. `save()` under forced QuotaExceeded surfaces a toast (or at least does not throw).
4. History length soft-cap (once implemented).
5. Guarded `matchMedia` in the install affordance.

Run command (unchanged):

```bash
node test/overload.test.mjs
```

---

## DEVICE / HUMAN TEST REQUIRED

These cannot be fully verified from source alone:

- Rest-timer beep + vibration on a real phone (silent-failure paths, iOS AudioContext resume, mute toggle).
- Full offline session after first load (including font rendering and plate-math text).
- Install as TWA / Add-to-Home-Screen on Android and iOS; verify unique identity vs portal.
- Cross-app cache isolation: install Overload, then open a sibling app offline and confirm its shell still loads.
- Large history (50+ sessions) restore and performance of the settings sparkline.
- DST / midnight boundary: finish a session a few minutes before a DST transition and confirm the due date is exactly three calendar days later.
- Actual gym flow: create → one-tap sets → verdict card survives `renderDue` → swap offer after three stalls.

---

## Release acceptance criteria

1. F1 fixed and verified: Overload activate never deletes a non-`overload-*` cache.
2. All 68 existing tests still green; new SW-isolation and wipe-Undo tests green.
3. Wipe (and preferably the restore confirm) follow the Undo-toast pattern.
4. Privacy page, offline behavior, and “no data leaves the device” claims remain true.
5. Manifest `id` stays unique; no regression to portal identity.
6. No new runtime dependencies, no build step, no analytics, no account surface.

---

## Hard constraints (do not violate)

- Zero runtime dependencies, no build step, no framework, no analytics, no backend.
- Local-first is the product identity. Do not propose accounts or cloud.
- House interaction pattern: destructive actions get Undo, not a confirm.
- House voice: no em or en dashes in any copy.
- Verdict vocabulary is fixed: ADD WEIGHT / ADD REPS / CONSOLIDATE / DELOAD −10%.
- UX invariant: after initial lift creation, the user never types anything in the core loop.

---

## Package contents audited

| File                    | Role                                      |
|-------------------------|-------------------------------------------|
| index.html              | Entire app (CSS + JS inline)              |
| sw.js                   | Service worker                            |
| manifest.webmanifest    | PWA manifest (unique id present)          |
| privacy.html            | Privacy & accessibility                   |
| sws-ui.js               | Shared studio toast / Undo component      |
| test/overload.test.mjs  | 68 assertions, all green                  |
| README.md / HANDOFF.md  | Product intent and architecture           |

---

**Bottom line:** The prescription engine is solid and ready. The only blocker for fleet safety and Play packaging is the cache-wipe behavior in `sw.js` (F1). Fix that, apply the house-pattern cleanups for wipe, and the app is good to ship.
