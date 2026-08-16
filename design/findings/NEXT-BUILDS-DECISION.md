# Build Decision — 2026-08-16

32 candidates in. Nine distinct products survived. Three go into the build queue today.

The pile was heavily redundant: three separate write-ups of the passport photo sheet, three of the silent auction kit, two of the family cookbook, and two of the folded-program engine. Deduplicated, the real count was 24 ideas, and most of the org/B2B half died on the tip-jar test.

---

## The three to build next

### 1. Bulletin Maker — start today

**Pitch.** Type this Sunday's order of service, hit print, get a correctly imposed folded bulletin PDF. No account, no design software, and next week you start from last week's.

**Who is asking, and the proof.** The church secretary or the volunteer covering for her, Thursday afternoon. This is the only idea in the pile with a *dated, manufactured* refugee wave behind it. Microsoft's own support page ends Publisher on **Oct 1 2026** (M365) / **Oct 13 2026** (Office 2021 perpetual), and its official migration table reads literally `Programs, Folded Paper Projects → Word`. Named people, dated threads:

- James Burr, Microsoft Q&A: *"Either Microsoft needs to keep Publisher alive, or they need to offer a free alternative to MS Publisher."*
- MGP, same thread: *"Microsoft dropped the ball on this one for sure. No free alternative, no real migration path, just 'good luck.'"*
- A church admin on CRC Network, describing bifold imposition without knowing the word for it: stuck trying to produce *"a 'side fold, half sheet' layout for export into PDF."*
- Benjamin Gresik on the Word workaround: *"Because it's a word processor and not designed for layout, it has all sorts of quirks."*
- r/elca "No more Publisher! Help with what to use for bulletins" (Mar 5 2025); r/Office365 "No more PUBLISHER!!" (Mar 8 2025); r/microsoft "What to use when we lose Publisher?" (Jun 1 2025).
- The United Methodist Church published an *official denominational migration guide*. Denominations do not write migration guides for small problems.

**What the incumbent charges.** Canva Pro $18/mo ($216/yr, up from $12.99 → $15 → $18 across 2025–26); its free tier has no transparent-background export and G2 analysis found 31 reviews citing forced upgrades, one calling it *"a rug pull."* Canva-for-nonprofits is free but requires a 501(c)(3) application plus an account per volunteer. Adobe Express $9.99/mo, InDesign $22.99/mo, Affinity $54.99. Scribus is free and church admins in that CRC thread say they gave up on it.

**Artifact.** A print-ready folded bulletin PDF — half-fold single sheet, plus saddle-stitch 8/12-page — with a plain-language duplex-flip instruction sheet, and the whole template saved on-device for one-tap reuse next Thursday.

**Engine and reuse.** Engine 2. `apps/seating-chart/pdf.js` supplies the multi-page pdf-lib pipeline and the WinAnsi transliteration work (line 14 comment; the escort-card grid and `page.drawLine({ dashArray: [4,4] })` cut lines at lines 188/192). `apps/pdf-tools/vendor-pdf-lib.js` + `core.js` supply the page-reorder plumbing. `apps/home-inventory/pdf.js` supplies the photo-into-page-grid embed. New code is the imposition function and three templates.

**Size.** M.

**Deadline.** Hard. Live and indexing by **early September** to catch the Oct 1 panic, then evergreen and weekly forever. Six weeks.

**Honest risk.** Template design quality *is* the product here and it is the studio's weakest muscle — three genuinely handsome layouts beat thirty mediocre ones, and if ours look like 1998 the geometry advantage is invisible. Duplex-flip variance across home and office printers is a real support burden. And this is desktop-first; the phone is for review, not layout, which strains the "useful on a phone" constraint harder than anything shipped so far.

**Strategic note — this is why it's #1 and not the funeral app.** Bulletin Maker builds the exact bifold/saddle-stitch imposition engine that Funeral Program Maker (backlog #1), Trifold Maker, Family Cookbook and Directory Maker all need. Sequencing it first means the flagship grief app inherits a fold engine already debugged by a church secretary who reprints every Thursday — instead of debuting untested imposition on a family with 48 hours before a service.

**Cheap add-on, same week:** ship **Booklet Printer** (drop in any PDF → reordered folded booklet) as a *feature inside pdf-tools*, not a slot. Every Publisher migration guide is telling this cohort to export everything to PDF before Oct 1; they will be sitting on a folder of documents that used to fold and now don't. It's a pdf-lib reorder with no design taste required, it ranks for the panic search, and it hands the user to Bulletin Maker for next week.

---

### 2. Visual Schedule Cards

**Pitch.** Type your kid's routine, use your own phone photos, print a sheet of cut-apart schedule cards plus a first/then board and a choice board — sized for the fridge strip, free, with the child's photos never leaving the phone.

**Who is asking, and the proof.** Parents of autistic and ADHD kids, SPED teachers, ABA techs, SLPs — in the first week of a new routine, when the existing card set no longer matches the actual day. Choiceworks reviews name every gap:

- A practicing SLP, 5★: *"As a speech therapist we constantly spend countless hours generating individualized visual schedules for our patients and families."*
- 4★: *"They also don't include a First, Then board or the ability to create your own type of board like Boardmaker does."*
- 4★: *"1) There is only a white person. 2) There are no girls."*
- 4★: *"I wish we could opt for other skin tones besides yellow."*
- 1★: *"there is a DVD and VHS option but no tablet or iPad icon!"*
- 1★ "Drains Battery": *"if we have Choiceworks open, our device does not go into sleep mode."*

**What the incumbent charges.** Boardmaker $99/yr personal up to $399 one-time Standard. Choiceworks $39.99, screen-only. Everything else is Teachers Pay Teachers, where "editable" is the top *paid* modifier because the free PDFs can't be changed.

**Artifact.** One print run makes the whole kit: cut-apart cards at 1.5"/2"/3" with cut guides and labels, a matching strip header, a first/then board, and a choice board. Laminated, velcroed, kept for months.

**Engine and reuse.** Engine 2. `apps/seating-chart/pdf.js` escort-card grid is a card sheet with the cell size changed. `apps/home-inventory/pdf.js` already embeds photos into a captioned page grid. `apps/image-compressor/app.js` `coverRect()` → `planDims()` → `encode()` (the `ctx.drawImage(bmp, plan.sx, plan.sy, …)` at line 264) does the square-crop-on-intake that keeps 40 photos from blowing up mobile memory. `apps/home-inventory/store.js` is the IndexedDB photo store.

**Size.** M.

**Deadline.** Soft but close: the August–September routine reset and IEP-driven classroom setup is the peak, and it is happening now. Second spike in January. Routines break year-round, so a two-week slip costs volume, not the year.

**Honest risk.** Someone will call this a duplicate of backlogged Chart Maker — it isn't (Chart Maker is a grid of checkboxes you write on; this is cut-apart photo cards you rearrange on velcro), but the overlap has to be argued rather than assumed. Real counter-evidence exists: a 5★ Choiceworks reviewer says flatly *"It's so much simpler to have a digital visual schedule than a paper one."* Part of this audience has moved to screens. And if we ship any stock symbol set it must be openly licensed (ARASAAC/Mulberry) bundled once — never an ongoing licensing relationship.

---

### 3. Passport & ID Photo Sheet

**Pitch.** Crop your own phone photo to the exact 2×2 spec with the head-size guide drawn on screen, then get a 4×6 sheet of six at true 300 dpi — no upload, no watermark, no unlock fee.

**Who is asking, and the proof.** A parent at the kitchen table the night before a passport appointment doing four family photos at once. Three independent research passes converged on this idea, which is itself a signal. The incumbent reviews are the loudest in the entire pile:

- PhotoAiD 1★: *"No mention of in app charges and costs $19.99 to take photo."*
- PhotoAiD 1★ "Fraudulent Charges": *"requested an authorization of 5 cents to process the photo then turned around and tried to charge $50 to that same card."*
- Passport Photo – ID Photo 1★: *"Ridiculous payment steps. $$$ for color photos then more $$$$ for ad removal… Then if I want to combine 4 photos to one page for printing family passport photos it cannot do it."*
- Same app, unprompted, 1★: *"Idk are they farming the passport photos? To make fake passports using your photos…? App kinda gives me weirdness vibes."*
- id1294190634, "Scam" (10/21/2024): *"Lies about ad free when you pay for the 6.99 fee…it immediately showed me an ad."*
- 4★: *"these photos don't print the correct size with any other size paper."*
- Also requested outright on r/SomebodyMakeThis (u/mentat, /r/SomebodyMakeThis/comments/civuo/): *"a site or program that turns a picture into a printable sheet for ID pictures."*

**What the incumbent charges.** Retail 2026: CVS $17.99, Walgreens $16.99, Walmart $7.64 — each for **two** prints. Apps and web tools: free to compose, $2.99–$6.99 to unlock the print-ready sheet, and the paid tier still serves ads. IDPhotoDIY, the best-known free tool, does face detection and background removal *server-side* on a photo destined for a government identity document.

**Artifact.** A 4×6 JPEG at exactly 1800×1200 px holding six spec-compliant 2×2 photos with cut marks, plus a Letter PDF alternate, 35×45mm and 50×50mm visa presets, and a single 600×600 file for online applications. Prints for ~$0.40 at any kiosk.

**Engine and reuse.** Engine 4. This is the cheapest build in the pile because ~90% is written: `apps/image-compressor/app.js` already does exact-source-rect cropping with quality control and a Safari fallback (`coverRect()` → `planDims()` at line 237 → `encode()` at line 256, `drawImage` at line 264). `apps/scan-to-pdf/pdf.js` already lays images onto a fixed-size sheet. `apps/seating-chart/pdf.js` grid with cell size fixed at 2in and cut marks instead of dashes is the 6-up imposition. Genuinely new code: the crop overlay drawing the State Department head-height band (head 1"–1⅜", eyes 1⅛"–1⅜" from the bottom).

**Size.** S — three days.

**Deadline.** None. Evergreen, application peak Jan–June. Shipping now indexes toward the winter wave. **This is the queue-jumper: any week Bulletin Maker is blocked on template design, build this instead.**

**Honest risk.** We cannot do background removal or an AI compliance verdict without a server or a bundled model — the two things the paid tools advertise. A rejected passport before a trip is a bad memory attached to our name, so the page must be loudly a *layout and measurement* tool and honest that lighting and background are the user's job. Printer/lab "fit to page" silently rescales, so the sheet needs a printed ruler calibration strip.

---

## The rest, ranked

| # | Name | One-line pitch | Engine | Size | Evidence | When to build |
|---|---|---|---|---|---|---|
| 4 | **Silent Auction Kit** | One item list → 60 matching numbered bid sheets, table cards, catalog, checkout slips | 2 | M | Strong (prices verified: ClickBid $795–$2,295/yr, Auctria free tier hard-caps at $10k raised, SchoolAuction $79/event) | Now-ish — needs to be live mid-Sept for fall galas, or wait and index by January for the Feb–May spring run |
| 5 | **Trifold Maker** | Six panels in, a brochure where the fold-in panel is narrower and the back side is in the right order | 2 | M | Strong (same Publisher EOL wave; Microsoft's table literally says `Brochures → Word or PowerPoint`) | Immediately after Bulletin Maker — same audience, same acquisition event, shares nothing but goodwill |
| 6 | **Fair Shares** (estate division board) | Siblings photograph the house, mark what they want, app settles uncontested items and takes turns on the rest | 1 | M | Moderate (FairSplit $350/$600/$995 verified; but no chorus of complaints, and the search intent is informational) | With the hardest-week cluster, *after* Funeral Program Maker — it lands by cross-link, not by search |
| 7 | **Homeschool Transcript Maker** | Four years of courses in, weighted GPA computed, registrar-credible transcript out | 2 | M | Moderate (HSLDA $19.95/yr + $9.95/child, Transcript Tracker $4.99/mo — a subscription for a one-time document) | Now if a slot opens; the Sep–Dec application peak is live. Smallest audience on the list, sharpest absurdity |
| 8 | **Calendar Maker** | Enter your family's birthdays once; print any month or year with them already on it, forever | 2 | S | Moderate-weak (Microsoft's table: `Calendars → Word or PowerPoint`; but the blank-calendar SERP is saturated and unverified) | Ship by late October for the Nov–Jan window. Only viable if the pages target "calendar with *my* dates," never "printable calendar 2027" |
| 9 | **Directory Maker** | Roster in, alphabetised page-numbered church/PTA directory booklet out | 2 | M/L | Moderate (Instant Church Directory $120–180/yr verified; but organisers don't search, they get told) | Next September — this year's window closes before we could ship it well. Cheap once the imposition engine exists |
| — | **Booklet Printer** | Any PDF → correctly reordered folded booklet | 4 | S | Strong, but it's a **feature not an app** | Ship inside `pdf-tools` alongside Bulletin Maker as its acquisition landing page |
| — | **Family Cookbook / Recipe Box** | Family recipes → 4×6 card sheet and a fold-ready bound-able cookbook PDF | 2 | L | Moderate (Family Cookbook Project $29.95/yr, Heritage $29.95/yr and you can't leave with the file) | Bench until the imposition engine ships, then reassess for a *September* build to catch Christmas lead time. It is only cheap as the second app out of that code |
| — | **Big Poster** (multi-sheet banner) | Tile an image or headline across a dozen letter sheets with overlap and trim marks | 4 | S | **Unverified** — author admits they did not check whether a free no-upload tiler already ranks | 20-minute SERP check first. If BlockPosters/Rasterbator-class tools are genuinely free and don't upload, it's dead |
| — | **Contraction Timer** | One button, frequency and duration, nothing else on screen ever | new | S | Strong hostility evidence, zero artifact | Bench. Genuinely the most *deserved* win in the pile morally, and cheap — but no kept artifact, zero retention by design, no SEO lane, and medical adjacency caps the feature set. Build it as a filler between groups and cross-link it to Baby Log |
| — | **Fair Play** (youth sub planner) | Equal-minutes substitution plan printed so the assistant can hold the paper | new | M | Strong demand, weak wedge | Bench until next spring. Season is live now but we can't ship in time, the incumbent is free at entry and genuinely loved, and a live game clock in a PWA is the exact failure mode that killed White Noise |
| — | **Clue Hunt** (QR scavenger hunt) | Clues live inside the QR codes, so the hunt runs with no signal | 2 | S | Thin | Bench with Allergy Cards as a between-groups filler. `moving-boxes/helpers.js:208 encodeBoxForLabel()` makes it nearly free |
| — | **Golf Outing Day-Of Kit** | Pairings, cart signs, sponsor signs, scorecards from one entry | 2 | M | Moderate | Bench to March. May–Sept season; Aug 16 is too late for 2026 |

---

## Killed, and why

**Duplicates — merged into one product (9 killed)**
- *Passport & ID Photo Sheet* ×2 → merged into the single Passport Photo Sheet above.
- *Silent Auction Kit* ×2 / *Silent Auction Paper Kit* → merged; three write-ups of one product.
- *Recipe Box* → merged into Family Cookbook Maker.
- *Program Booklet Maker* → merged into Bulletin Maker; it is presets on the same engine, not a slot.

**Duplicates against what already exists (4 killed)**
- **House Guide** — this is a *preset inside the shipped Sitter Sheet*, not an app. It also puts guide content in Firestore, which is the diluted version of the brand promise, and a $99/yr incumbent is cheap enough that a real host will just pay.
- **Invite Link** — same relationship to the shipped Signup Sheets that Meal Train already has. Test it as a preset first, per the backlog's own precedent. Design quality is load-bearing here in a way it isn't for our print tools, and losing an aesthetics contest to Evite's free templates is a bad first impression.
- **Job Photo Report** — this is backlogged Move-In Report with a different cover page. Building both is building one app twice. Ship it as Move-In Report's second mode.
- **Booklet Printer** — not killed, demoted: it's a `pdf-tools` feature, and it is a landing page rather than a destination.

**Breaks a hard constraint, or sits too close to one (3 killed)**
- **Giving Statements** — the required IRS acknowledgment boilerplate is a tax document, which is the "no legal forms" line; compounded by a three-week-a-year usable window and CSV column-mapping as the actual engineering, which is where a non-technical treasurer bounces anyway.
- **Garden Plan & Planting Calendar** — the plant table (spacing, depth, indoor-start offsets, days to maturity) plus frost-date lookup is exactly the ongoing-data-maintenance relationship the studio refuses. Also an L build, the weakest evidence in the pile, and the Jan–April window means it would sit finished for four months.
- **Banquet Event Order** — not a constraint break, but the honest reason caterers buy Caterease is proposals, invoicing and deposits. We have permanently forfeited the thing they're actually buying, so the BEO alone moves nobody.

**Evidence too weak to survive (4 killed)**
- **Door List** — one r/nonprofit post plus an inference from what the paid platforms charge for. The author says it themselves: below the bar, needs a cheap test rather than a build. Plus a kiosk holding an event's only sign-in list is one cache-clear from disaster.
- **Receipt Binder** — the author flags the leap from "Microsoft Lens died" to "expense report app" as their own inference, not something anyone was found asking for. The Lens window also closed in March 2026, so there is no deadline advantage left, only an orphaned habit.
- **Daily Jobsite Report** — the app stores are full of cheap and free daily-log apps, so "free" is not the wedge; what companies actually pay for is the GC-side portal and roll-up, which we can't and shouldn't build.
- **Lost Pet Poster** — the author's own risk section is the kill: Canva, Adobe Express, PosterMyWall, WordLayouts and printablesigns.net all already offer free lost-pet templates *with tear-off tabs*, and they already rank. The QR payload is clever but not worth a slot on its own.

**Killed on the business shape, not the pain (2 killed, plus a general note)**
- **Fair Play** and **Golf Outing** are benched rather than killed, but both share the pile's dominant failure mode: pain is real, distribution is word-of-mouth-only, and the incumbent's free tier is already adequate.
- General: of the ~12 B2B/organizer candidates in the pile (caterer, contractor, jobsite, receipts, auction, golf, BEO), only one survived into the top 6. See below.

---

## The pattern

**1. Every surviving idea's moat is arithmetic or geometry that somebody is charging rent on.** Bifold imposition. 300-dpi tile placement on a 4×6. Numbering that has to agree across 60 bid sheets, 60 table cards and a catalog. A weighted GPA. Panel widths where the fold-in panel is 1/16" narrower. Not one of them is a design contest, a data moat, or a network effect. In every case the paywall sits on a step whose marginal cost to the vendor is *zero* — which is precisely why a studio with no server can give it away without a business-model problem. That is the actual selection rule, and it's sharper than "Engine 2": **find the free-to-compute step somebody charges $2.99 for, and check that the charge exists only because they own the SERP.** The three ideas that died fastest (Lost Pet Poster, Big Poster, Calendar Maker's blank layer) died because the computed step was already free somewhere.

**2. The strongest signal in this pile was not a category. It was a date.** Publisher's Oct 1 2026 end-of-life produced named victims, dated forum threads, an official denominational migration guide, and a migration table that points at tools which demonstrably can't do the job. Nothing else in 32 candidates came close to that quality of evidence, and it wasn't found by brainstorming categories — it was found by noticing a platform death. Microsoft Lens already died in March 2026 with ~92 million users and we missed the window entirely. **The next ten apps should be sourced from a standing watch on what free or bundled tool is being retired, enshittified, or repriced in the next six months.** Displaced users are the best-qualified audience there is: they already do the work, they already print, they already refused to subscribe once, and they arrive on a searchable date. That is a better idea generator than category brainstorming, and it's the one input this research pass proved.

**3. Keep-ness, not gratitude, predicted the tip.** Every idea killed for a weak tip moment was killed because the output is *consumed*: a door sign-in list, a scavenger hunt, an RSVP headcount, a lost-pet flyer that succeeds and comes down. Everything that survived emits paper someone laminates, files, mails, or hands to a stranger — a bulletin, a card set on velcro, a passport photo, a bid sheet, a transcript, a directory. Emotional intensity is a bad proxy (Contraction Timer is the most deserved win in the pile and has the weakest tip). Ask instead: *is this still on the fridge in six weeks?*

**4. This pile inverted a build-order assumption in the existing backlog.** Funeral Program Maker sits at #1 there and needs imposition. Bulletin Maker needs the *same* imposition, plus it has a dated acquisition event, weekly retention instead of once-in-a-lifetime, and — critically — a low-stakes failure mode. A church secretary who gets a scrambled fold on Thursday reprints it. A family with 48 hours before a service does not. **Never debut a shared engine on the app where failure is most expensive.** Sequenced correctly, one M build unlocks four backlog items (Funeral Program, Trifold, Directory, Cookbook) and a pdf-tools feature. That multiplier — not the demand score — is why Bulletin Maker outranks everything.

**5. Batch-from-a-list is now the studio's second reusable primitive, and it is under-exploited.** Silent Auction (item list → 60 matched artifacts), Directory Maker (roster → booklet), backlogged Certificate Maker (roster → certificates), Calendar Maker (date list → 12 months), Raffle Tickets, Visual Schedule Cards (routine → card sheet). It is the same shape every time: one structured list in, N consistently-numbered pieces of paper out, with cross-artifact consistency as the thing that's genuinely hard by hand. Free templates structurally cannot do this — a template is singular by definition — which is why the free tier of every one of these categories is a blank PDF. Build the batch renderer once, deliberately, and six backlog items get cheap the way imposition just did.

**6. The organizer/B2B wing should stay closed except where the organizer is a volunteer.** Twelve candidates targeted caterers, contractors, solo trades, treasurers, and auction platforms. One survived. The reason isn't that the pain is fake — a solo painter really is paying $756/yr to CompanyCam — it's that the tip jar doesn't function on people who expect tools to cost money, and the thing they actually buy in every case is *money handling*, which the studio has permanently forfeited by design. The exception that proves it: church secretaries and PTA auction chairs are households wearing a hat. They have no budget, no procurement, no expectation of paying, and they share tools in denominational and PTA Facebook groups with unusual velocity. **The line isn't consumer-vs-business, it's salaried-vs-volunteer.**

**Start today: Bulletin Maker.** Six weeks to Oct 1, and it is the engine everything else is waiting on.