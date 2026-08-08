# App ideas backlog — brainstormed overnight, August 8, 2026

The clearest opportunity is a cluster we could call **the hardest week**: funeral programs, fridge emergency sheets, the family binder, and the after-loss checklist — categories where every incumbent ambushes people at their worst moment, and where "nothing leaves your device" carries the most weight it ever will. The most *urgent* opportunity is seasonal: sub plans, chore charts, and football squares all have hard deadlines in the next four weeks, and each one missed costs a full year. A third cluster extends Engine 1 to organizers collecting kindness instead of signups — group gifts and meal trains — where our refusal to touch the money *is* the product. A fourth, smaller wing (mileage logs, invoices) has the most literal tip math in the suite but pulls the identity slightly toward work tools, so it should stay a wing, not a direction. Nearly everything here reuses the two engines, so the top of this list is mostly S and M builds — the constraint is the calendar, not the code.

---

## The top 12

Ordered by rank, with ties broken so related apps sit together.

### 1. Funeral Program Maker

**Pitch.** Fill in a name, a photo, and the order of service; get a fold-ready memorial program PDF. No watermark, no account, nothing uploaded.

**Who's searching.** A grieving family member with 48 hours before the service, handed "the program" by the family. They type *funeral program template free*, *order of service template*, *memorial program printable*.

**Why we win.** Every top result ambushes grief: Canva wants an account and salts "free" templates with Pro elements, Template.net funnels into a subscription, Etsy sells Word files you still have to fight. Nobody solves the actual technical pain — bifold page imposition, the reason folded booklets print in scrambled order from Word. We output a print-ready folded booklet in the browser. Nobody should have to make an account to bury their mother.

**Build.** Engine 2, size M. Reuses the Wedding Timeline / Seating Chart PDF pipeline; the real work is 3–4 tasteful templates and the imposition math.

**Timing.** Evergreen, zero seasonality — ships any month and starts compounding immediately. Anchors the hardest-week group (see #2–4).

**Tip logic.** The strongest tip moment in the whole portfolio: we rescued someone during the worst week of their life and asked for nothing.

**Caution.** Home-printer duplex-flip variance is a real support trap. Ship a plain printing-instructions page and hold v1 to a single-sheet bifold.

### 2. Emergency Sheet (the fridge file)

**Pitch.** Enter meds, conditions, allergies, and contacts once; print the fridge sheet EMTs are trained to look for, a matching wallet card, and a med list. Reprint in two minutes when a prescription changes.

**Who's searching.** Adult children setting up an aging parent's kitchen; people with chronic conditions; solo agers. They type *file of life printable*, *emergency medical information form printable free*, *vial of life form*.

**Why we win.** The File of Life is a physical product you order; hospitals hand out static PDFs you re-pen from scratch at every med change — and med changes are constant in exactly this population. The two free card makers that exist save nothing, so every update means retyping everything. We keep per-person profiles on-device and regenerate the whole kit in one tap. Same household as Pill Schedule.

**Build.** Engine 2, size S — one form, three coordinated print layouts. Among the smallest builds on this list.

**Timing.** Evergreen; January "get mom organized" bump and hurricane-season preparedness pushes.

**Tip logic.** "The paramedics had her med list before I got there" is the most literal saved-your-day in the portfolio, and the person making it is an adult child in a moment of gratitude.

**Caution.** The wallet card alone is contested by free one-shot generators. The saved profile and the coordinated three-piece kit are the product — build that, not just a card.

### 3. Family File (in-case-of-emergency binder)

**Pitch.** A guided workbook of everything your family would need if something happened to you — where the will is, which accounts exist, key contacts, pet and bill instructions — printed into a binder that lives in your house, not in a startup's cloud.

**Who's searching.** People 45–70 finally getting organized, adults after a health scare, new parents. They type *emergency binder template free*, *in case of death organizer*, *nokbox alternative*.

**Why we win.** Everplans is $99.99/yr in the cloud; the Nokbox is a $250 box of paper you can't update; blogs email-gate their printables. This is the one data category people viscerally refuse to put in anyone's database, which means the honest version of this product can only be local-first. It's the app the entire brand promise was built for. Design rule that removes the risk: store locations and instructions ("safe deposit box at Chase, key in desk"), never passwords or account numbers, and generate no legal documents.

**Build.** Engine 2, size M/L — pure forms-to-PDF, but a lot of them.

**Timing.** Evergreen; National Preparedness Month (September) and the January resolution wave are the natural pushes.

**Tip logic.** Highest on the list. A $20 tip against a $250 Nokbox, at the moment you've just done right by your kids, is easy.

**Caution.** The biggest content grind proposed — dozens of guided sections is weeks of form work for one person. Ship 4–5 sections with a completeness checklist and grow it.

### 4. After-Loss Checklist (executor task board)

**Pitch.** A shared checklist for the weeks after a death — death certificates, Social Security, accounts, subscriptions — pre-seeded with the standard tasks, shared with siblings by one link.

**Who's searching.** The organized sibling who becomes de-facto executor: *what to do when someone dies checklist*, *executor checklist printable*.

**Why we win.** Everything that ranks is a static hospice PDF or a funeral-home lead magnet. The actual job is coordination — three siblings in three states dividing forty fiddly tasks — which is exactly the Engine 1 primitive. Task tracking only, zero legal advice.

**Build.** Engine 1, size S — a pre-seeded skin of Signup Sheets. The smallest Engine 1 build on the list.

**Timing.** Ships cheapest as a fast-follow to Funeral Program Maker, with the two cross-linking each other.

**Tip logic.** Strong for the organizer, and every sibling who opens the link sees the studio.

**Caution.** Nobody types "shared executor checklist" — this app lands via cross-links from the funeral app, not search. Don't expect it to rank on its own.

### 5. Football Squares

**Pitch.** A 10×10 squares grid that lives in a link: friends tap a square and type their name, numbers randomize when the board fills, the app highlights each quarter's winner.

**Who's searching.** The office-pool and party organizer: *super bowl squares generator*, *football squares online free* — an explosive late-January spike with real weekly demand all NFL season.

**Why we win.** The field is paid or ad-trapped: $5 fees past four players, one-time payments, premium upsells, organizer accounts. Ours: no account for anyone, no player cap, printable grid for the wall — and the claim-a-square link advertises us to all 100 participants. We never touch money. Grid only.

**Build.** Engine 1, size M — heavy Signup Sheets reuse; claim-a-cell is the same Firestore transaction on a grid.

**Timing.** NFL season starts next month. Ship and index by September to catch the whole runway through the big game.

**Tip logic.** The organizer runs the party moment of the year and the app auto-picks winners so nobody argues — the same psychology that already earned Bracket Maker its slot.

**Caution.** Money-pool adjacency. Stay grid-only forever; the moment we touch a dollar we inherit everything we're avoiding.

### 6. Sub Plans

**Pitch.** Fill in your class routine once and print a clean, calm substitute folder at 5:30am when you're sick — schedule, procedures, helpers, where everything is, today's plan.

**Who's searching.** A teacher waking up sick, or building the required sub binder in August: *emergency sub plans template free*, *sub binder template free*.

**Why we win.** There is no tool — only TpT downloads that need PowerPoint to edit and blog freebies gated behind email signups. Nobody offers a builder that remembers your info and reprints in two minutes. And the privacy line is load-bearing here: sub plans contain rosters, kids' allergy notes, and building security procedures. All of it stays in localStorage; we collect no student data.

**Build.** Engine 2, size M — Sitter Sheet's fill-and-print pattern with more sections; the work is the multi-page print layout.

**Timing.** Sub binders are due week one of school — shipping *now* hits it. Second spike in Jan–Feb flu season.

**Tip logic.** Highest in the teacher batch: Sitter Sheet's emotion with more desperation. Teachers share tools with their whole building, and it deepens the beachhead Specials Planner just opened.

**Caution.** A moderate-volume niche whose big days are Aug–Sep and flu season; the long variable-length print CSS is the only real engineering.

### 7. Chart Maker (chore, behavior, reading log, sticker charts)

**Pitch.** Build any grid-with-checkboxes chart exactly how you want it, print the fridge page, reprint or reset it every week.

**Who's searching.** Parents and teachers at back-to-school and New Year; roommates at move-in: *free printable chore chart maker*, *behavior chart editable*, *reading log printable*.

**Why we win.** Current answers are ad-wrapped Pinterest printables, Canva accounts, or kid-fintech apps that put debit cards on children. One app covers four heavy search phrases, and "nothing about your kids leaves the device" writes itself. Saved charts with weekly reprints beat the two small no-signup makers that exist; a shared-link tap-to-check version with roommate rotation is a natural v2 nobody offers without accounts.

**Build.** Engine 2, size S/M — one grid builder, four preset skins, print stylesheet.

**Timing.** Double spike: Aug–Sep (now) and January.

**Tip logic.** Moderate per use — it wins on sheer volume of searchers, and the weekly-reprint habit builds the relationship tips come from.

**Caution.** "Any grid you want" invites config creep. Cap the knobs — rows, days, one icon set — or the builder eats the build.

### 8. Chip In (group gifts & fundraiser thermometer)

**Pitch.** Collecting for a teacher gift or the fall fundraiser? One link where everyone pledges and marks themselves paid via your Venmo, with a live goal thermometer and a printable hallway poster. No platform holding the money, no fees, no accounts.

**Who's searching.** The organizer chasing twelve people for $10 each; PTA treasurers mid-fundraiser: *collect money for group gift*, *paypal money pool alternative*, *fundraising thermometer editable*.

**Why we win.** Every incumbent is a payment platform that holds the funds and takes a cut; thermometer generators are ad-stuffed images. Nobody serves "Venmo already exists — I just need the list." We never touch money: zero fees for them, zero liability for us.

**Build.** Engine 1, size S — one of the smallest Engine 1 skins yet.

**Timing.** School fundraisers ramp Sep–Oct; December gifts and May–June teacher gifts follow.

**Tip logic.** The most concrete ask in the suite: the incumbents would have taken 3–5% of the pot, the tipper literally has Venmo open, and they're already in a giving mindset.

**Caution.** Some of that search traffic wants actual money collection; a tracker that pointedly doesn't move money will bounce part of it. The long-tail "track who paid" searcher is ours.

### 9. Meal Train

**Pitch.** Organize meals for a friend after a baby, surgery, or loss: one link, people claim dates, allergies and drop-off instructions pinned to every page. No ads, no donation layer skimming the kindness.

**Who's searching.** Church groups, neighbors, coworkers: *meal train website free*, *meal train alternative no ads*, *organize meals for a friend after surgery*.

**Why we win.** MealTrain.com runs ads on the support page, takes 7.9% of donations, and paywalls basics — genuinely gross on a page about someone's chemo. Honest caveat: several free-positioned challengers already market our pitch, though each runs a donation layer or ads. Our edge is being the only one with literally no money layer and no accounts for anyone.

**Build.** Engine 1, size S — and the judges' recommendation is smarter: ship it first as a "meal train" *preset inside Signup Sheets* to test demand at near-zero cost before committing to a standalone.

**Timing.** Evergreen — births, surgeries, and funerals don't have a season.

**Tip logic.** Emotionally strong but capped by free competitors; the preset-first test de-risks exactly that.

**Caution.** The crowded challenger field is real. Test cheap, promote the preset, and only break it out if it pulls.

### 10. Mileage Log (tax mileage tracker)

**Pitch.** An IRS-ready mileage log that does the math — log a drive in ten seconds, watch the deduction grow at the current IRS rate, print a clean year-end log. No GPS tracking your every move.

**Who's searching.** Gig drivers, realtors, mobile hairdressers, the self-employed: *free mileage log app no subscription*, *mileage tracker without GPS*, *IRS mileage log template*.

**Why we win.** MileIQ caps free at 40 drives a month, Everlance at 30 trips, and all of them demand accounts plus continuous location tracking — Stride is "free" because it sells you as an insurance lead. Every free template is a static PDF that leaves you doing arithmetic by hand. Nobody offers the middle thing: a private log that computes the deduction. "A mileage app that cannot track you" is the brand promise in one line.

**Build.** Local-first PWA + Engine 2 export, size S/M. The IRS rate is one constant updated annually.

**Timing.** Jan–April tax season (slots into the existing January push); December "reconstruct my year" scramble; steady gig traffic year-round.

**Tip logic.** The app shows a literal dollar figure. Tipping $5 against "this log is worth $2,914 in deductions" feels obvious.

**Caution.** Gig-work tooling opens a solo-business wing that mildly dilutes the household identity. Fine as a wing; watch that it stays one.

### 11. Invoice Maker (invoices, estimates, receipts)

**Pitch.** Type your line items, get a clean professional invoice PDF — and because it remembers your business, clients, and invoice numbers on your device, the second invoice takes 30 seconds.

**Who's searching.** Lawn care guys, cleaners, tutors, handymen who just finished a job and need to bill tonight: *free invoice generator no sign up*, *invoice maker no watermark*.

**Why we win.** The top results are SaaS lead-gen funnels that pass your client data through their servers and gate the download behind signup, and the one genuinely free giant is visibly rotting under pop-up ads by its own reviews. Nobody chains estimate → invoice → receipt. No ads ever, client book in localStorage with export, is exactly what its refugees are typing.

**Build.** Engine 2, size M — one form, three output modes, line-item math, a few clean templates.

**Timing.** Evergreen; small January and April bumps.

**Tip logic.** The best line in the suite: "This invoice got you paid — the tip jar works the same way." A tradesperson who just collected $800 tips $5 without thinking.

**Caution.** Police scope creep on the client rolodex, and note this is the second brick in the solo-business wing — pace it accordingly.

### 12. Move-In Report (deposit protector)

**Pitch.** Walk the empty apartment with your phone, photograph every scuff room by room, and email the landlord a dated condition-report PDF before you unpack a single box.

**Who's searching.** A renter on key-pickup day, or fighting for the deposit at move-out: *move in checklist for renters printable*, *how to document apartment condition for security deposit*.

**Why we win.** Everything that ranks is landlord software wearing a renter costume — account-gated property-management SaaS. The renter, who outnumbers the landlord fifty to one and has the actual money at stake, has no browser tool where the photos stay on-device and out comes a timestamped, professional PDF. Photos of your home interior are exactly what shouldn't go to a startup's cloud.

**Build.** Engine 2, size M — camera capture and photos-into-PDF are already solved in Home Inventory and Scan-to-PDF; the new work is the room-by-room flow and a landlord-credible layout.

**Timing.** Peaks May–September plus August/September college leases — slots straight into the existing Moving Boxes / Packing List summer push.

**Tip logic.** Delayed in the best way: the tip moment is the day the deposit comes back, and "this got my deposit back" is a perfect Reddit testimonial.

**Caution.** Compress photos on intake (Image Compressor already knows how) or 80 room photos will blow up mobile memory — and accept that the tip arrives months after the save.

---

## Recommended next group

**The school-year kickoff group: Sub Plans → Football Squares → Chart Maker → Chip In.**

The hardest-week cluster is the bigger long-term opportunity, but it's evergreen — it compounds whenever it ships. These four are use-it-or-lose-it: sub binders are due the first week of school, NFL kickoff is early September, back-to-school routines get set in the next six weeks, and fall fundraisers ramp in late September. Miss the window and every one of them waits a year.

The group is coherent three ways. **Season:** everything lands August through October. **Audience:** it's one demographic — the school-year household and its organizers — which is exactly who the August Team Parent / Signup Sheets marketing push is already talking to, so every community post feeds two apps. **Code:** two Engine 2 print apps (Sub Plans, Chart Maker) and two Engine 1 skins (Football Squares, Chip In), each pair sharing a pipeline.

**Build order:**

1. **Sub Plans** — the tightest deadline (binders due week one) and it compounds the teacher beachhead Specials Planner just opened. Start today.
2. **Football Squares** — must be live and indexing by September to catch the full Sept–Feb runway. Heavy Signup Sheets reuse makes it fast.
3. **Chart Maker** — the routine-setting spike runs through September; S/M with capped scope.
4. **Chip In** — smallest build, timed to fall fundraiser season.

One cheap add while we're in Engine 1 code: the **Meal Train preset inside Signup Sheets** is a near-zero-cost demand test that can ride along with this group.

Honest note on search lead time: SEO takes 2–4 months to compound, so this fall these apps live on community seeding (r/Teachers and building-level word of mouth for Sub Plans, office and party organizers for Squares) while the pages index toward flu season, the playoffs, and next August.

**After this group:** the hardest-week cluster — Funeral Program Maker, then Emergency Sheet and After-Loss Checklist as fast follows, with Family File growing section by section behind them. That lands Family File right on Preparedness Month and the January resolution wave.

---

## Bench

Worth keeping, roughly in order of next decision date:

- **Holiday Dinner Timeline** — the only real tool in an ad-choked category, but it must be live by September to matter this year; decide when the kickoff group wraps.
- **Holiday Card List & Address Labels** — proven demand (people buy $8 paper trackers), needs to index by early October; Avery 5160 print alignment is a known grind.
- **Contest Judge** — QR voting for costume/chili/sweater contests; community seeding would start Sept–Oct; fun Engine 1 build with a great reveal moment.
- **Christmas Gift Tracker** — weekend build with built-in annual retention; natural sibling to the Secret Santa push if there's room this fall.
- **Yard Sale Kit** — genuinely empty lane (the state of the art is stickers on a paper tally sheet); an S build for next April's season.
- **Audio Trimmer** — strong fit for the proven privacy-utility wing; cap input length in v1 to dodge the decode-memory ceiling.
- **Pet Records** — solid evergreen family-care extension; the kennel-counter save is real; mid-size grind, no hard parts.
- **Vitals Log** — weekend build pairing with Pill Schedule for January; keep it table-only and advice-free.
- **Custody Calendar Maker** — real demand and a sharp privacy pitch; January divorce-season timing, and the heavier emotional register deserves a deliberate yes.
- **Tax Prep Checklist** — small artifact, but the portfolio's best traffic router into the PDF suite for January.
- **Certificate Maker (batch from roster)** — the batch-from-roster lane is open, but the moat is template design time; build by March for awards season.
- **Carpool Schedule** — right audience and a visceral "nobody GPS-tracks your kid" line, but the SEO gap proved narrower than pitched; possible Engine 1 follow-up next summer.
- **Allergy Cards** — a weekend build that strengthens the family-care suite more than it earns tips; a nice gap-filler between groups.
- **Raffle Tickets** — an S build on existing label plumbing for the organizer crowd; contested but cheap; fall-festival timing.
- **Punch Card Maker** — days of work, sympathetic micro-business audience; a gap-filler.
- **Price Sheet & Tags** — narrow craft-fair niche; only if the small-business wing earns more room.

---

## Ideas we considered and rejected

- **White Noise** — the premise failed on inspection: the browser lane already has genuinely free, no-ads generators (myNoise and others), and iOS suspends PWA audio on lock screen, which breaks "runs all night" — exactly the platform hell we avoid.
- **Resume Maker** — the most SEO-fortified SERP on the list; genuinely free open-source builders already fail to rank there, the structured editor is the heaviest UI proposed, and the audience is broke by definition.
- **Time Finder (availability polls)** — When2meet is already free and no-account, so the moat is UX only; huge footer reach but near-zero tip psychology. Revisit only as a deliberate funnel play.
- **Field Day Planner** — the pain is real and the gratitude would be big, but the search trail is a trickle confined to a few thousand PE teachers a year, and the rotation constraints creep toward a scheduling solver. Revisit only if the teacher wing gets seriously big.
- **Anything that moves money** — payment handling inside Chip In or Football Squares was considered and firmly cut: never touching funds is the entire advantage (no fees, no liability, no gambling adjacency). Grid and list only, forever.
- **Translated allergy chef cards** — Equal Eats' 50-language moat stays theirs; machine-translating allergens is a safety risk we should not own.
- **Standalone Meal Train, built first** — rejected in favor of the preset-inside-Signup-Sheets test; the free-positioned challenger field is too crowded to bet a full build on before demand is proven.
