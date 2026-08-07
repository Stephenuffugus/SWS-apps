# Engine 1 — Shared-Link Coordination

**Three products, one engine.** Build the engine once, ship three skins.

| Skin | Working name | Replaces |
|---|---|---|
| A | Signup sheets | SignUpGenius |
| B | Team parent | TeamSnap free tier |
| C | Caregiver log | a chaotic sibling group text |

Build order: **A → B → C.** A is the thinnest possible version of the primitive. Do not start B or C until A is deployed and a real person has used it.

---

## The primitive

One **owner** creates a board. Everyone else arrives by link, claims or adds something, and leaves. **Participants never create accounts.** That single constraint is the whole product — every incumbent fails here, and it's why people hate them.

```
Board (owner-created)
 ├─ share code (6 chars, URL-safe, human-readable)
 ├─ metadata (title, description, dates)
 ├─ Slots[]        ← the thing people claim
 └─ Entries[]      ← the thing people add
```

Every skin is a different rendering of Slots and Entries. That's it.

- **A:** Slots = time/item rows. Entry = "I'll bring the rolls."
- **B:** Slots = games/practices/carpools. Entries = RSVPs, announcements.
- **C:** Slots = mostly unused. Entries = timestamped notes, meds, appointments.

---

## Architecture

Single-file vanilla HTML/CSS/JS PWA per skin. No build step. Firebase (Auth + Firestore) as the only backend.

- **Owner:** Firebase Auth (Google + email link). One account, many boards.
- **Participant:** anonymous. Identity is a display name they type plus a `claimToken` in localStorage so they can edit or release their own claim later. Losing the token is survivable — they just can't self-edit, and the owner can fix it.
- **Share code:** avoid ambiguous glyphs. Use `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I/l). Collision-check on create.

### Firestore shape

```
boards/{boardId}
  ownerUid, skin, title, shareCode, createdAt, settings{}
  slots/{slotId}      → label, capacity, claimed[], order
  entries/{entryId}   → authorName, body, createdAt, claimToken(hash)
codes/{shareCode} → { boardId }   // lookup only, no payload
```

### Security rules — this is the hard part, do it first

Anonymous writes are the entire attack surface. Rules must enforce:

1. Read of `boards/{id}` requires either owner UID or possession of the board ID (which only comes from resolving a share code). Share code lookup is a separate tiny collection so a leaked code exposes nothing but an ID.
2. Participants may create an entry and may update **only** documents whose `claimToken` hash matches what they present. They may never modify `slots` capacity, board settings, or other people's entries.
3. Hard caps in rules, not just UI: max entries per board, max body length, max slots. Prevents a bored teenager filling a soccer roster with 10,000 rows.
4. Owner can delete anything on their board. Nobody else can delete anything.

Write the rules file before the UI. Test it with the emulator. Every failure mode of this product category is a rules failure.

### Abuse handling

Public write links get abused. Minimum viable defenses:
- Owner toggle: "require my approval for new entries."
- Owner can lock a board (read-only) in one tap.
- Rotate share code — invalidates the old link instantly.
- Rate limit per claimToken client-side, plus the rules caps above.

---

## Skin A — Signup sheets (build first)

**Use cases:** potluck dishes, classroom volunteer shifts, meal trains, snack rotation, secret santa, conference room slots.

Owner flow: title → add slots (label + capacity, bulk-paste supported) → get link → share.
Participant flow: open link → see grid → tap an open slot → type name → done. Under 15 seconds, no account, no ad.

Must-haves:
- Bulk slot creation by pasting lines of text.
- Date/time slots generated from a range ("every Tuesday 3–5pm, Sept–Nov").
- Owner sees fill status at a glance; one-tap nudge copies a message with the unfilled slots listed.
- Works offline for reading; queues a claim if offline and syncs on reconnect.
- Print view. Church and school organizers print these.

Deliberately excluded: comments, likes, profiles, notifications, anything social.

## Skin B — Team parent

Adds to the engine: a schedule view (list of dated slots), a roster (contact list, owner-managed), and a broadcast field ("practice cancelled") pinned to the top of the board.

Distribution note: one coach adopting drags in ~15 families. Optimize the first-share moment — the link should preview well in iMessage and Facebook (OG tags with team name and next event).

## Skin C — Caregiver log

Adds: reverse-chronological timeline, entry types (appointment / medication change / note / question), and a "who's covering" slot row for the week.

This one holds health information about a third party. Design accordingly:
- No PII beyond a first name the family chooses.
- Owner-invite only — no open link sharing. Code must be given deliberately, one sibling at a time.
- Prominent, plain-language line: this is a shared family notebook, not a medical record, and it isn't HIPAA-covered.
- Export to PDF so a family can hand a printed timeline to a doctor.

Emotionally heavy context. Tone should be calm and plain. No gamification, no color-pop, no confetti.

---

## Open questions for Stephen

- Do all three ship under one brand with different names, or three separate domains?
- Does the owner account carry across all three (one login, boards of any skin) — probably yes, and that argues for one app with a skin picker rather than three deploys.
- Monetization: free forever, tip jar, or a paid tier at high slot counts?
