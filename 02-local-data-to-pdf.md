# Engine 2, Local Data → Print-Ready PDF

**Three products, one output pipeline.** Arrange data locally, emit a PDF that looks like someone competent made it. Nothing is ever uploaded.

| Skin | Working name | Why it wins |
|---|---|---|
| A | Seating chart | incumbents paywall the export, the one moment that matters |
| B | Home inventory | competitors want to sell cloud storage, so they can't be local-first |
| C | Print-and-play generator | 67 dormant designs → a traffic engine |

Build order: **A → B → C.** See the C section for why C is gated behind a manual experiment.

---

## Shared foundation

- Single-file vanilla HTML/CSS/JS PWA. No build step. No server, no account, no upload.
- **Storage:** IndexedDB (not localStorage, photos will blow the quota). One store per project, project list in a lightweight index.
- **PDF:** `pdf-lib` bundled locally, not CDN-loaded, so the app works fully offline.
- **Import:** paste-a-column and CSV upload everywhere a list exists. Nobody retypes 140 names.
- **Backup:** export/import a single `.json` project file. Local-only means the user owns the backup problem, so make it one tap.
- The "nothing leaves your device" promise is the headline, not a footnote. Say it on the landing screen.

### PDF quality bar
This is the entire product. If the PDF looks amateur, the app is worthless regardless of how good the editor is.
- Embed fonts. Never rely on system fonts.
- Explicit page size and margins, US Letter and A4 both.
- Vector text and shapes, rasterize only actual photographs.
- Print a physical copy before calling any layout done.

---

## Skin A, Seating chart (build first)

**Users:** wedding couples (peak), plus banquets, conferences, classrooms year-round.

### The insight that makes this good
Every existing tool treats seating as a **layout** task. It's actually a **constraint** problem that gets re-solved a dozen times as RSVPs trickle in and people drop out four days before.

So: let the user declare rules, and when the guest list changes, show what broke.

- Rule types: *keep together*, *keep apart*, *near the front / away from the speakers*, *must be at table N*, *kids table*, *accessible seating*.
- On any guest change, re-validate and surface violations as a fixable list, never silently leave a hole.
- Auto-arrange is a *suggestion* button, not the primary mode. People want control here; they just want the machine to catch mistakes.

### Data model
```
Project → Guests[] (name, party/group, meal, tags, rsvp status, notes)
        → Tables[] (label, shape: round|rect|head, seats, x, y, rotation)
        → Rules[]
        → Assignments: guestId → tableId
```

### Editor
Drag guests onto tables. Drag tables around a floor plan canvas. Mobile-first, but this is the one app where a desktop layout genuinely matters, build the touch version first and let it scale up.

Nice-to-have: import a venue floor plan image as a background layer to place tables against.

### Three outputs, not one
1. **Entrance display**, big, pretty, by table.
2. **Escort cards**, alphabetical by last name, cut-line grid, one card per guest.
3. **Caterer's sheet**, table by table, meal counts, allergies, dietary flags, plus a summary total. *Nobody does this well.* Venues ask for it a week out and couples build it by hand in a panic. This is the feature that gets you recommended by planners rather than just couples.

### Monetization
Free, unlimited, no watermark. Ask for a tip **after the export succeeds**, never before, never mid-flow. Weddings are the best possible tipping context: high emotional stakes, a budget where $10 is a rounding error, and a moment of genuine relief when it finally prints. Expect low single-digit conversion anyway; treat tips as upside, not the plan.

### Timing
Proposals cluster around the holidays → planning starts in January → weddings run May-October → seating locks 2 to 6 weeks before the date. Shipping in the next couple months catches the fall tail and is fully ready for the January wave.

---

## Skin B, Home inventory

**Trigger:** "I wish I'd photographed everything before the fire." Recurring in every disaster thread.

- Room-by-room capture. Photo, name, serial, purchase date, estimated value, receipt photo.
- Fast-capture mode: point, shoot, name, next. Detail can be filled in later.
- Compress images on capture (canvas resize), a 40-room house will otherwise eat gigabytes of IndexedDB.
- **Export is the product:** a paginated PDF with a cover summary (total items, total value, date generated), then a page per room with photo grid and a value table.
- Prompt the user, clearly and repeatedly, to email the export to themselves or save it off-device. A local-only inventory that burns up with the house is a cruel joke.
- Optional: a second export sorted by value descending, which is what adjusters actually want.

---

## Skin C, Print-and-play generator

**Do not build the generator yet.** Stephen's instinct that this is hard to do well is correct, but the hard part isn't the software.

Two real obstacles:
1. 67 games need 67 sets of art direction. The generator can't invent that.
2. The print-and-play community is exacting about bleed, cut lines, and **duplex registration**, misaligned card backs is the number one complaint in that scene.

### The experiment that gates the build
Hand-tune **one** game into a genuinely beautiful print-ready PDF. Post it free to r/printandplay and r/boardgames. Watch what happens.

If it lands, the generator is justified, and the manual pass will have taught you the layout constraints you'd otherwise guess at.

### Design choice that dodges the hardest problem
Single-sided or fold-over card layouts eliminate duplex registration entirely. Fold-over means the back prints adjacent to the front and the player folds and glues. Slightly less premium, dramatically fewer support complaints.

### If it graduates to a real tool
- Input: a JSON or CSV deck definition + a template.
- Output: US Letter and A4, 3mm bleed, crop marks, optional cut-line-only mode for guillotine users.
- Standard poker card size (63×88mm) and mini (44×67mm).
- Per-card back or shared back.
- A "proof sheet" mode: one page, all cards small, for checking content before burning ink.
