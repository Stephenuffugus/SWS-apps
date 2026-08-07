# Signup Sheets

Engine 1 (shared-link coordination), skin A. Potlucks, volunteer shifts, meal
trains, snack rotations: an organizer makes a sheet, shares a link, and people
claim spots in under 15 seconds. **Participants never create accounts.**
A free tool by SWS Strategic Media LLC.

## Architecture

- Vanilla HTML/CSS/JS PWA, no build step. Firebase (Auth + Firestore) is the
  only backend, loaded as ESM from gstatic via an import map (node tests resolve
  the same imports to the npm package).
- **Owners** sign in with Google or an email link. **Participants** are Firebase
  anonymous-auth users — their anon uid is what lets them edit/release their own
  claim later (the product doc's "claimToken", enforced by rules instead of
  localStorage).
- Share codes (6 chars, no 0/O/1/I/l lookalikes) live in a `codes` collection
  that maps code → boardId and nothing else, so a leaked code exposes only an
  opaque ID. Rotating the code kills the old link instantly.
- **`firestore.rules` is the product.** All participant writes are batch-coupled
  to counters (`getAfter`/`existsAfter`) so the caps are hard: 500 entries per
  board ever, slot capacity on claims, one claim per person per slot,
  increment-only counters (decrement griefing = cap bypass). Board lock freezes
  all participant writes. Approval mode forces `pending` status that only the
  author and owner can read.
- Offline: service worker caches the shell; Firestore's persistent local cache
  serves reads and queues claims until reconnect.

## Files

| File | Role |
|---|---|
| `firestore.rules` | the security model — change with extreme care, run `npm run test:rules` |
| `data.js` | every Firestore/Auth call; writes mirror the rules exactly |
| `helpers.js` | pure logic (code gen, bulk paste, date-range slots, nudge) |
| `app.js` | UI: routing, rendering, owner console |
| `firebase-config.js` | paste the real Firebase web config here |

## Tests

```sh
npm install          # dev deps: firebase, firebase-tools, rules-unit-testing (needs Java for the emulator)
npm test             # helpers (unit) + rules (66-case attack matrix) + data layer (19-step lifecycle)
```

## Develop locally (no Firebase project needed)

```sh
npm run dev          # starts auth+firestore emulators (ports 9099/8081)
python3 -m http.server 8090   # in a second terminal; open http://localhost:8090
```

While `firebase-config.js` has a `demo-` projectId, the app talks to the
emulators automatically.

## Go live

1. Firebase console → create project → enable **Authentication** (Google +
   Email link providers) and **Firestore**.
2. Paste the web-app config into `firebase-config.js`.
3. Deploy the rules: `npx firebase deploy --only firestore:rules --project <project-id>`.
4. Host the static files anywhere; add that domain to Authentication →
   Settings → **Authorized domains** (required for Google sign-in and email links).
5. Bump `VERSION` in `sw.js` on each deploy.

## Deliberately not built

Comments, likes, profiles, notifications, feeds — per the product doc, the
engine stays social-free. Skins B (team parent) and C (caregiver log) reuse
this exact engine and rules with different rendering.
