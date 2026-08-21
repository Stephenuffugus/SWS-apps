# Grok QA audit: Grocery List, 2026-08-21

Verbatim conversion of the report Stephen received on 2026-08-21
(source file: Grocery-List-QA-Audit-Report.md), extracted the same day so it is greppable
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

# Grocery List — QA / Security / Debug Audit Report

**App:** Grocery List (Engine 1 skin `grocery`)  
**Package:** grocery-list-qa-package.zip (source as of 2026-08-21)  
**Live:** https://skywolfstudio.com/grocery-list/  
**Auditor:** Independent source + rules + test review  
**Date:** 2026-08-21  

This report follows the requested shape: executive summary with ranked findings table, per-finding locations + reproduction, regression-test list, DEVICE/HUMAN TEST REQUIRED labels, and release acceptance criteria. Findings were verified against the included source, `firestore.rules`, and the two test files. No production credentials or live data were touched.

---

## Executive Summary

The core product model (owner signs in once, share-code link, anonymous link-holders, open done-toggle, lifetime 500-entry counter with owner reset via Clear checked) is implemented consistently between `data.js`, `app.js`, and the shared `firestore.rules`. The rules are the strongest part of the package: they are narrow, batch-coupled, and the included `test/rules.test.mjs` already exercises the main attack surface (done-toggle smuggling, counter drain, claim capacity, pending visibility, code rotation, locked board, etc.).

**Overall posture:** Production-ready for the current design constraints, with a small number of medium/low issues that should be fixed before a Google Play / TWA listing. No critical security hole that lets a stranger rewrite another household’s list or escalate privilege was found in the rules or the client write paths.

**Highest-priority items for the next ship:**
1. Privacy copy accuracy (Play Store / TWA risk).
2. Shared preferences dialog visual glitch (reported on real phone, shared component).
3. A few defensive/edge-case clean-ups in the data layer and SW asset list.

No rewrite is recommended. All fixes stay inside the existing “no framework, small invariants” constraints.

---

## Ranked Findings Table

| ID | Severity | Disposition | Title |
|----|----------|-------------|-------|
| F1 | Medium | Fix before Play listing | Privacy page over-claims “no account / no sign-in / no email” and under-lists localStorage keys |
| F2 | Medium | Fix (shared component) | `sws-prefs.js` dialog “glitches” on setting change; user must close & reopen to feel the applied state |
| F3 | Low | Fix | Service-worker `ASSETS` list references icons that are not present in this package (and may 404 on first install) |
| F4 | Low | Improve | `data.js` `addEntry` silently coerces unknown `type` values; rules allow `announcement` but client never sends it |
| F5 | Low | Note / optional | Share-code brute-force surface exists (6-char alphabet); mitigated by auth requirement + Firebase abuse tools but not App Check |
| F6 | Info | Already handled well | Offline / dead-zone path, done-toggle smuggling, entryCount reset, listener lifecycle, Undo pattern |
| F7 | Info | Validate on device | Manifest `id` is already unique (`/grocery-list/`); parent-portal collision risk is reduced for this skin |
| F8 | Info | Cosmetic | House voice: a few residual em/en-dashes or curly quotes appear in error strings |

---

## Detailed Findings

### F1 — Privacy page over-claims (Medium)

**Location**
- `privacy.html` lines 45–48 (“What we do not do”)
- Also `privacy.html` line 36 (localStorage description)

**Issue**
The bullet list states:
- “No account, no sign-in, no email address collected.”

This is true for **family members / link-holders**, but false for the **owner**. The owner must sign in (Google popup/redirect or email-link). Email-link flow writes `gl-signin-email` to localStorage and sends the address to Firebase Auth. In addition, the shared `sws-prefs.js` writes the origin-wide key `sws.prefs`.

The earlier paragraphs correctly describe the Firestore data flow and the owner/participant distinction, but the absolute bullets contradict them. For a TWA / Play listing the privacy claims will be read against the actual data flows; mismatch is a rejection risk.

**Reproduction**
1. Open `privacy.html`.
2. Compare the “What we do not do” list with the Auth paths in `data.js` (`signInGoogle`, `startEmailLink`, `completeEmailLink`) and the localStorage write in `sws-prefs.js`.

**Recommended fix**
Rewrite the absolute bullets to match reality, e.g.:

- Family members never create an account and never sign in.
- Only the person who starts the list signs in (Google or email link). Email is used solely for that sign-in and is not stored after the link is consumed.
- Display preferences are stored in one origin-wide localStorage key (`sws.prefs`) so the same comfort settings apply across the studio apps.
- No advertising, analytics, or third-party trackers.

Also list `sws.prefs` alongside `gl-signin-email`.

**Disposition:** Fix before any store listing.

---

### F2 — Shared preferences dialog glitch (Medium, shared component)

**Location**
- `sws-prefs.js` (entire dialog + `change` handlers, ~lines 266–272, 332–337, 393–397)
- Reported on this app on a real phone, 2026-08-21

**Issue**
User changes a setting (theme, text size, density, etc.). The page behind the dialog updates correctly (attributes written to `<html>`, `localStorage` updated, chrome meta painted), but the open dialog itself “glitches out”. User must press Done / close and reopen the panel to feel that the new state is applied.

**Root-cause analysis (source)**
On radio `change`:
```js
state[g.key] = o.v;
apply();          // mutates document.documentElement attributes
write();
paintChrome();    // may add/remove <meta name="theme-color">
```
`syncInputs()` is **not** called after a live change (only on open and on storage/reset). Because the clicked radio is already checked by the browser this is normally fine, but:

- Changing `data-text`, `data-density`, or `data-theme` immediately recomputes CSS variables that also style the open `<dialog>`.
- On mobile this produces a visible layout jump / reflow of the dialog contents (sample text, fieldset spacing, button sizes).
- `paintChrome()` can insert or remove a meta element while the dialog is open, which some browsers treat as a style recalculation that feels like a glitch.
- The dialog is built once and never re-rendered, so the visual jump is the only feedback the user receives inside the panel.

**Reproduction (DEVICE TEST REQUIRED)**
1. Open Grocery List on a real phone.
2. Open Display & comfort.
3. Switch Text size or Spacing or Theme.
4. Observe whether the dialog itself jumps, blanks momentarily, or leaves the radio group looking inconsistent until closed and reopened.

**Recommended fix (keep the shared file, small change)**
- After `apply()` / `paintChrome()`, call `syncInputs()` so any visual desync is corrected.
- Optionally wrap the apply sequence in `requestAnimationFrame` (or a 0-ms timeout) so the dialog does not reflow in the same turn as the attribute change.
- Consider applying density/text-size changes only on dialog close if the live preview of the sample text is not worth the jump; the page behind can still update live.

Because the component is shared by 7+ apps, fix once in the source of truth and re-apply.

**Disposition:** Fix in the shared component; re-test on device.

---

### F3 — Service-worker asset list vs package contents (Low)

**Location**
- `sw.js` lines 3–8 (`ASSETS` array)

**Issue**
```js
const ASSETS = [..., './icon.svg', './apple-touch-icon.png', ...];
```
This package does not contain those binary icons (they live on the live origin). On a fresh install the `caches.open(...).addAll(ASSETS)` will reject if any URL 404s, leaving the SW install failed or partially cached.

**Reproduction**
Serve the extracted package from a local static server and register the SW; watch the install event fail on missing icons.

**Recommended fix**
- Either include the icons in the deploy package, or make the install tolerant:
  ```js
  caches.open(VERSION).then(c =>
    Promise.allSettled(ASSETS.map(u => c.add(u).catch(() => {})))
  )
  ```
- Or keep the strict list and guarantee the icons are always present on the host that serves `sw.js`.

**Disposition:** Low priority for production (live site has the icons), but clean it up for local QA / offline packaging.

---

### F4 — Entry type coercion vs rules (Low)

**Location**
- `data.js` line 18 (`CARE_TYPES`) and line 274
- `firestore.rules` line 263 (allowed types include `'announcement'`)

**Issue**
Client always forces `type` to one of `['note','appointment','medication','question']`. Rules also accept `'announcement'`. No security impact, but the two sides are slightly out of sync. Future skins that want announcements would be blocked by the client.

**Recommended fix**
Either add `'announcement'` to the client allow-list or remove it from the rules if it is never used. Prefer keeping the rules as the source of truth and making the client pass the value through after a simple membership check.

**Disposition:** Optional cleanup.

---

### F5 — Share-code enumeration surface (Low / Info)

**Location**
- `firestore.rules` `/codes/{code}` — `allow get: if authed();`
- `helpers.js` `CODE_CHARS` (32 symbols, 6 characters ≈ 1.07e9 possibilities)

**Issue**
Any authenticated user (including a freshly created anonymous user) can attempt to resolve arbitrary codes. Firebase rate limits and App Check (if later enabled) are the practical mitigations. A pure rules-level rate limit is not possible.

**Recommended posture**
- Document that App Check is the intended next hardening step if abuse appears.
- Rotation already exists and works (owner-only, tested).
- No change required for the current threat model.

**Disposition:** Accept / monitor.

---

### F6 — Things that are already solid (Info)

Verified against source + tests:

- **Done-toggle smuggling** is blocked by rules (`affectedKeys().hasOnly(['done'])` + boolean check). Covered by `test/rules.test.mjs`.
- **entryCount** is “entries ever created”; participants can only +1; owner can reset via `clearChecked` (absolute set) or per-delete decrement. Tests cover the happy path.
- **Offline / supermarket dead-zone** path: `commit()` races a timer, `looksOffline()`, network-first document + cache-first assets, persistent local cache, late-failure restores typed text. Good.
- **Listener hygiene**: `live.stop()` tears down all unsubs; entries watcher is keyed and replaced cleanly.
- **Undo pattern**: destructive actions use `SWS.undo` / snapshot restore instead of confirm dialogs (house rule).
- **SW scope**: only `grocery-*` caches are cleaned; Firestore/Auth traffic is never cached (non-GET or non-cacheable origin).
- **Auth failure surface**: popup → redirect fallback, explicit toasts with error codes, email-link prompt.

No confirmed bugs in these areas from static review.

---

### F7 — Manifest identity (Info)

`manifest.webmanifest` already carries:
```json
"id": "/grocery-list/",
"scope": "./"
```
This reduces the parent-portal collision risk noted in the packaging notes. The planned “unique id per app” direction is already applied here. DEVICE TEST still recommended after install from the live origin.

---

### F8 — House voice (Info)

A few residual curly quotes / em-dashes appear in user-facing strings (e.g. error messages in `app.js`). House rule is “no em or en dashes”. Purely cosmetic; clean when touching those strings.

---

## Regression-Test List (must stay green)

1. **Rules suite** (from package root after adjusting paths if needed):
   ```
   npx firebase emulators:exec --only firestore --project demo-signup "node test/rules.test.mjs"
   ```
   Especially the grocery block: done-toggle by non-author, smuggling rejection, counter +1 only, locked board, code rotation, pending visibility.

2. **Grocery integration** (originally written to run from the sibling signup-sheets tree):
   ```
   npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/grocery.test.mjs"
   ```
   Owner create → add items → partner toggle → partner add → owner clearChecked + counter reset.

3. **Manual / DEVICE tests**
   - Two phones, same share link: add on one, appear on the other; toggle on either; Clear checked only by owner.
   - Airplane mode → add / toggle → back online → sync.
   - Rotate link → old link 404s, new link works.
   - Delete list → board + code gone.
   - Display & comfort panel: change every group, confirm page + dialog stay consistent, close/reopen.
   - Install as PWA / TWA candidate: unique identity, offline shell, no sibling-cache pollution.

---

## Release Acceptance Criteria

Ship when:

- [ ] F1 privacy copy matches actual Auth + localStorage behaviour.
- [ ] F2 prefs dialog no longer requires close/reopen to feel correct (device-verified).
- [ ] F3 SW install succeeds against the deployed asset set.
- [ ] `test/rules.test.mjs` and the grocery integration test are green against the emulators.
- [ ] DEVICE tests above pass on at least one Android + one iOS device.
- [ ] No new writes that the rules do not already allow (classic client/rules gap).
- [ ] Privacy.html and in-app trust notes remain consistent with each other and with the data layer.

---

## Notes for the Developer

- The security model is deliberately “possession of the 6-char code + anonymous auth = full participant power limited to the four allowed operations”. Do not tighten the open done-toggle; the product depends on it.
- Prefer small, rules-mirrored changes in `data.js` over UI work-arounds.
- The shared `sws-prefs.js` / `sws-ui.js` files are fleet-wide; fix them at the source of truth and re-apply.
- This package is the real source (including rules). Future audits can treat the same files as authoritative.

End of report.
