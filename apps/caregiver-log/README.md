# Caregiver Log

Engine 1 (shared-link coordination), skin C. A calm, private, shared family
notebook for caring for someone — the timeline every sibling can see, the
coverage schedule nobody has to renegotiate in a group text. A free tool by
Sky Wolf Studio.

**Handle with care:** this app holds health-adjacent information about a third
party. Design rules from the product doc, enforced here:

- No PII beyond a first name the family chooses.
- Invite-deliberately sharing — the UI frames the link as an invitation given
  one person at a time, with one-tap rotation if a link gets loose.
- A plain-language disclaimer on every log and every printout: this is a
  shared family notebook, not a medical record, not HIPAA-covered.
- Calm visual tone: slate palette, no confetti, no gamification, no color-pop.

## How it maps onto the engine

Same Firebase project and `firestore.rules` (boards carry `skin: 'care'`):

- **Entries = the timeline**, typed `note` / `appointment` / `medication` /
  `question`, shown newest-first grouped by day. A print-only chronological
  version renders for doctor visits (browser print → Save as PDF).
- **Slots = coverage days** ("Add the next 7 days" generates a week),
  **claims = who's there**, with the optional note ("mornings only").

## Engine code sharing

`data.js` / `helpers.js` are engine copies (SKIN + entry-type whitelist differ).
Engine tests live in `../signup-sheets/test/`, including `care.test.mjs` which
drives this app's data layer against the emulator.

## Config

- `firebase-config.js` — same project as the other Engine 1 apps.
- `CONFIG.tipUrl` in `app.js` — Stripe tip link (hidden until set).
