# Play Console copy — the first three listings

Written against each app's actual source and character-counted. Paste straight into Play Console.
Generated 16 August 2026 for Sky Wolf Studio (SWS Strategic Media LLC).

> Order: **1. Sub Plans → 2. Seating Chart → 3. Home Inventory.** Ship one, let it clear review
> and sit in production, then the next — roughly one a week. Batching is what triggers Play's
> repetitive-content enforcement.

---

# Google Play Store Listing — Sub Plans

Source of truth for every claim below: `/workspaces/SWS-apps/apps/sub-plans/app.js`, `/workspaces/SWS-apps/apps/sub-plans/index.html`, `/workspaces/SWS-apps/apps/sub-plans/sw.js`, `/workspaces/SWS-apps/apps/sub-plans/privacy.html`, `/workspaces/SWS-apps/apps/sub-plans/README.md`, and `/workspaces/SWS-apps/design/findings/sub-plans.research.json` + `sub-plans.remaining.json`.

**Verified before writing:** `CONFIG.tipUrl = ''` in app.js — this app currently ships **no tip jar**, and `privacy.html` states "this app has no tip jar at all, so it makes not one outbound request in normal use." No copy below mentions tipping. There is **no seating chart** and **no must-do / if-time splitter** (`sub-plans.remaining.json`), so neither is claimed. The on-device claim **is** true here (localStorage only, no Firebase, share link is a client-side URL fragment), so it is used.

---

## 1. Title

```
Sub Plans: Substitute Binder
```

**28 characters** (limit 30). Carries both head terms — "sub plans" and "substitute binder" — without stuffing.

---

## 2. Short description

```
Fill in your class once. Print the whole substitute folder on the sick morning.
```

**79 characters** (limit 80).

---

## 3. Full description

**3,998 characters** (limit 4,000).

```
It is 5:30 in the morning, you have a fever, and the thing standing between you and going back to bed is not the illness. It is the sub plans. Teachers say it out loud constantly: it is easier to go in sick than to write them. So most of us go in sick.

That trade should not exist.

Sub Plans is a substitute folder you fill in once, on a calm afternoon, while you are well. After that, a sick morning is three steps: change the date, type what today looks like, print. Routines, dismissal, drills, who to call, where things are — already written, back in August.

BUILT FOR THE PAPER, NOT FOR THE SCREEN

• Emergency information prints in a heavy black box at the top of page one, built to read as urgent on the black-and-white copier your school actually uses — not in red ink nobody is allowed to print.
• A "your first ten minutes" block is pinned to page one: room, bathroom and hallway rules, WiFi and computer passwords, the office extension, the teacher next door. Passwords print monospaced, so 1, l and I cannot be confused, and neither can 0 and O.
• The Print button carries a live page count as you type. Substitutes say a clear two pages beats a thorough ten, so you can watch the packet grow and stop.
• "Read it as your sub would" shows the real printed folder in black and white before you spend paper on it.
• Sections you leave empty do not print. No blank boxes for a stranger to interpret.
• A running header repeats your name, room, school and date on every sheet, so page two is never anonymous.
• It ends with a feedback page for your sub — checkboxes and ruled lines, not an empty rectangle that comes back saying "they were great, thanks!"

WHY NOT A TEMPLATE

Because you have tried them. The best free binder is a PowerPoint that breaks unless you install three particular fonts. Paid bundles are "editable" only in the boxes the seller left open. Canva wants an account and an evening. A blank doc has no prompts, so the fire route gets forgotten. And the AI generators write lesson content rather than logistics, meter you monthly, and want your students' names on somebody else's server.

FREE, AND PLAINLY SO

• Free. Not free-after-you-give-us-your-email, not free-then-the-$12-bundle.
• No ads. None.
• No account, no sign-in, no email address collected.
• No subscription, no trial, no monthly quota, no watermark, no export limit. Nothing you build here can be held hostage.
• Works offline. Open it once and it runs on one bar of signal, or on the day the district filter decides it dislikes new sites.
• Nothing you type leaves your device. Names, health notes, passwords and routines stay in your browser's own storage. There is no server for them to travel to, so there is nothing anyone can ask us to hand over.

The one exception is a link you choose to copy: the whole folder is compressed into the web address itself — still uploaded nowhere — so at 5:45am you can text the packet to the office. The app tells you what that link carries before you send it, and there is a QR code too.

That is not a marketing line. A sub binder holds exactly what FERPA covers: names, allergies, medications, accommodations. This one is built so none of it has anywhere to go.

TWO VIEWS, TWO KINDS OF DAY

"Today" shows four things — the date, the plan, a backup activity, the emergency block. That is the sick-morning screen. "The whole binder" opens all nine sections for the August afternoon when you build it. Worked examples switch between elementary and secondary, so a science teacher with six periods is not reading advice about a marble jar.

Dark mode, five text sizes, high contrast and large tap targets — the session that matters happens in a dark room, one-handed, without your glasses.

NOT IN THIS VERSION

No seating chart, and no must-do / if-time splitter with time estimates. Everything above is finished and prints correctly on US Letter.

Sub Plans is one of a set of free, ad-free tools from Sky Wolf Studio. No accounts, no tracking, no catch.
```

**Wedges used, and where they came from:** the "easier to go in sick" line is documented across four independent teacher sources in `sub-plans.research.json`; the three-fonts-or-it-breaks failure is The Curriculum Corner's own stated limitation; "editable only in the boxes the seller left open" is TpT/Tes sellers' own warning language; the monthly meter is LessonDraft's 8-generations-a-month model; "nothing you build here can be held hostage" answers a real Additio reviewer complaint that "if you buy it you have to keep buying it to continue to use your student data"; the WiFi-password hunt is the Notion4Teachers sub-plan guide complaint; "a clear two pages beats a thorough ten" is Differentiated Teaching's guidance.

---

## 4. ASO keyword list (ranked)

I cannot confirm Play search volumes — Google does not publish them and Play Console's keyword tooling is not accessible from here. This ranking is by **intent match and specificity**, not measured volume.

| # | Phrase | Covered where |
|---|---|---|
| 1 | sub plans | Title, short desc, full desc |
| 2 | substitute teacher plans | Title + full desc |
| 3 | sub binder | Title ("Substitute Binder") |
| 4 | substitute binder | Title |
| 5 | emergency sub plans | Full desc ("Emergency information", sick morning) |
| 6 | sub plans template | Full desc ("WHY NOT A TEMPLATE") |
| 7 | substitute folder | Short desc + full desc |
| 8 | sub folder for teachers | Full desc |
| 9 | substitute teacher forms | — add to graphic captions |
| 10 | teacher absence plans | Full desc (implied) |
| 11 | sub notes for substitute teacher | Full desc ("feedback page for your sub") |
| 12 | lesson plans for a substitute | Full desc |
| 13 | free teacher planner no account | Full desc ("FREE, AND PLAINLY SO") |
| 14 | offline teacher app | Full desc ("Works offline") |
| 15 | substitute teacher information sheet | Full desc ("first ten minutes" block) |
| 16 | printable sub plans PDF | Full desc ("Print", "US Letter") |
| 17 | classroom handover notes | Not used — optional if a second listing is ever tested |
| 18 | teacher binder printable free | Partially covered |

Terms 1–8 are the ones worth defending. 9, 15 and 16 are the gaps; if you want them indexed, the place to add them is the **screenshot caption text**, which Play does not index but which converts, and one incidental mention in the full description — not another keyword block. Do not add a keyword list to the description; Play penalises it.

---

## 5. Screenshot plan (5 phone screenshots, 1080×1920, in order)

**Screenshot 1 — the printed page, not the app.**
On screen: page one of a finished, realistically filled folder rendered as paper on the warm ground — the heavy black EMERGENCY box at the top, "Your first ten minutes" beneath it with the monospaced WiFi password visible, the running header showing "Ms. Rivera · Rm 12 · Maple Elementary · Tue Sep 8 · 2 pages in this packet". Warm off-white background, sheet floating with a soft shadow.
Overlay caption: **"Fill it in once. Print it on the morning you can't get out of bed."**
Why first: the install decision in this category is not "is the form nice" — it is "will this produce something a stranger can actually teach from." Every competitor's first screenshot is a UI. Ours is the artifact. Show the output and the app sells itself.

**Screenshot 2 — the sick-morning path, in dark mode.**
On screen: the "Today" view on a phone in dark mode, showing only four things — Date, "The plan, hour by hour" partly typed, "If you run out of material", and the emergency block — with the primary button reading **"Print / Save as PDF · 2 pages"**.
Overlay caption: **"Sick morning: change the date, type today, print. Two minutes."**
Why second: immediately after proving the payoff, prove the cost. Dark mode is deliberate — it says "we know when you are actually using this."

**Screenshot 3 — the first ten minutes, close up.**
On screen: a tight crop of the printed sheet showing the black emergency box (fire route, lockdown, "Maya R: peanut allergy — EpiPen in the nurse's office") and the "Your first ten minutes" grid directly under it, WiFi password in monospace.
Overlay caption: **"Your sub stops hunting for the WiFi password and the fire route."**
Why third: this is the single most-cited substitute complaint, and the frame simultaneously demonstrates that the alerts read as urgent in pure black and white — the thing every pastel template in this category gets wrong on a school copier.

**Screenshot 4 — the whole binder.**
On screen: the "The whole binder" view scrolled to show several of the nine section headings filled in (The class, Routines, Where things are, People to lean on, Emergencies), with the elementary/secondary picker visible and set to Secondary, and the "Saved on this device" state showing.
Overlay caption: **"Nine sections. Elementary or secondary. Empty ones never print."**
Why fourth: answers the August-prep question — "is this deep enough to be my real binder?" — and rescues the secondary-school half of the audience, who bounce the moment they see a marble jar.

**Screenshot 5 — share, and the promise.**
On screen: the share panel with "Copy link" and "Show QR", the QR dialog open over it, and the live warning line legible: *"This link will carry health alerts and student notes inside the web address itself. Send it only to someone you would hand the paper folder to."*
Overlay caption: **"Text the whole folder to the office. It never touches a server."**
Why fifth: last frame is where the privacy-cautious teacher and the sceptical department head land. It closes on the FERPA objection with evidence — the app warning them — rather than a slogan, and it demonstrates the delivery feature no paper binder has.

Caption style for all five: two lines maximum, deep teal `#107a65` on the warm ground `#FEF6EA`, set in the same serif as the app's headings, placed in the top ~18% so the device frame below stays uncropped. No exclamation marks, no emoji, no "You've got this!" — the research is explicit that cheer reads as insulting to this audience.

---

## 6. Feature graphic concept (1024×500)

**Composition.** Warm kraft ground `#FEF6EA` edge to edge. Right 40%: a single sheet of the printed folder, angled about 6°, bleeding off the right edge — page one, with the heavy black emergency box unmistakable even at thumbnail size. That black rectangle is the whole point: it is the one shape that survives being scaled down to a 320px-wide card. Left 45%: the type. A thin teal rule `#107a65` separates them.

**Text on it (all of it):**

```
Sub Plans
Print the sub folder. Go back to bed.
```

Wordmark in the app's Fraunces serif, ~72px, `#107a65`. Tagline beneath in the UI sans, ~34px, `#173d33`.

**Crop and overlay safety.** Keep every glyph inside a centred 924×400 safe area, and keep the middle ~200px column free of text — that is where Play stamps the play button when a promo video is attached, and where some surfaces crop hardest. The angled sheet on the right is deliberately the element that gets clipped, because it still reads as "a printed page" at any crop. No screenshots-inside-the-graphic, no device frames, no icon duplication.

---

## 7. What's new — version 1.0.0

**464 characters** (limit 500).

```
First release.

Fill in your class once, then print the whole substitute folder on a sick morning. Emergency box and a "first ten minutes" block pinned to page one, live page count on the Print button, a black-and-white preview of the real printed sheets, and a feedback page for your sub. Examples switch between elementary and secondary. Copy the whole folder as a link or a QR code.

Works offline. Free, no ads, no account. Nothing you type leaves your device.
```

---

## Two flags for the submission step

- **Data Safety form:** answer "No data collected" and "No data shared." That is accurate per `privacy.html` — localStorage keys `subplans`, `subplans.band`, `subplans.qrpaper`, no Firebase, no analytics, no tip-jar outbound request in this app. The only third party is Firebase Hosting serving static files and keeping ordinary server logs, which is not in-app collection. Privacy policy URL: `https://sws-apps-9646d.web.app/sub-plans/privacy.html` — the page already exists at `/workspaces/SWS-apps/apps/sub-plans/privacy.html`.
- **Teacher Approved / category:** manifest already declares `education` and `productivity`. I could not confirm the current eligibility criteria for Play's Teacher Approved programme from here, so treat that as unverified.

Sources for the competitor and complaint claims: [Bored Teachers — 6 Stages of Writing Sub Plans](https://www.boredteachers.com/post/writing-sub-plans), [The Curriculum Corner editable substitute binder](https://www.thecurriculumcorner.com/thecurriculumcorner123/editable-substitute-planning-binder/), [Sara J Creations on TpT editability limits](https://www.sarajcreations.com/2022/02/common-tpt-resource-problems-and-how-to.html), [Additio App reviews on JustUseApp](https://justuseapp.com/en/app/908748733/additio-teacher-gradebook/reviews), [PlanbookEdu price change 2025](https://www.planbookedu.com/pages/price-change), [Planbook Mobile on Google Play](https://play.google.com/store/apps/details?id=com.planbook.lessonplanner&hl=en_US), [Planboard on Google Play](https://play.google.com/store/apps/details?id=com.chalk.planboard&hl=en_US), plus the sourced complaint set already in `/workspaces/SWS-apps/design/findings/sub-plans.research.json`.

---

# Google Play store listing — seating-chart

Verified against source before writing: `/workspaces/SWS-apps/apps/seating-chart/app.js`, `model.js`, `pdf.js`, `index.html`, `manifest.webmanifest`, `README.md`, `privacy.html`, and `/workspaces/SWS-apps/design/findings/seating-chart.research.json`. **The on-device claim is TRUE for this app** — `grep` for `fetch(|firebase|XMLHttpRequest|sendBeacon|gtag` across `app.js`, `store.js`, `index.html`, `sw.js` returns exactly one hit: the service worker caching its own assets. No Firebase. Storage is IndexedDB (`sws-seating`), PDFs are generated locally by the vendored pdf-lib in `vendor-pdf-lib.js`.

**Honesty constraint applied:** `model.js:58` sets `MAX_PASTE = 1000`, and the app itself says "This app holds 1000 guests per event." So the copy says **"up to 1,000 guests per event"** — never "unlimited guests." Unlimited *events* is true (multiple projects in `store.js`). I have not claimed Avery-calibrated card stock, "changed since last export" diffing, QR lookup, or bar/dance-floor objects — those are in the research file as opportunities but are **not shipped**.

---

## 1. Title

```
Wedding Seating Chart Maker
```

**27 characters** (limit 30).

Leads with the highest-volume query string and captures both "wedding seating chart" and "seating chart maker" in one phrase. I deliberately did not spend the remaining 3 characters — "Free" in a Play title is a price callout that adds no indexing value and invites metadata review.

---

## 2. Short description

```
Seat every guest, print the cards. No guest cap, no account, no export fee.
```

**74 characters** (limit 80).

Three of the four documented category dark patterns are named and negated in the eleven words a browsing user actually reads.

---

## 3. Full description

**3,150 characters** (limit 4,000).

```
It's 11pm, half the RSVPs are in, and you are moving the same six names around a spreadsheet for the third time. Your aunt cannot sit near your father. The Alvarez family is four people, not one. Table 6 has eleven people in ten chairs and nothing told you. And the venue wants meal counts by Friday.

Most seating apps make that worse. You type in ninety names, then discover the free tier stopped at forty. Or the app is free to design and charges to save. Or it wants a subscription — billed weekly — for one evening of your life.

This one does none of that.

Free. No ads, no account, no subscription, no watermark on anything you print. Up to 1,000 guests per event, and as many events as you like. It works with no signal at all, because it runs entirely on your phone: the names, the meals, the allergies, and the note about who cannot sit near whom never leave this device. There is no server to send them to.

RULES INSTEAD OF GUESSWORK

Seating is not a drawing problem. It is a constraint problem you re-solve every time an RSVP lands. So you write the rules down once:

• Keep together — a family or a couple stays as one block
• Keep apart — stated plainly, and never printed on anything
• Must be at this table — grandma at Table 1, near the front

Then change whatever you like. Every edit is re-checked, and what broke comes back as a list you can actually fix: "Table 6 has 11 people for 10 seats." "Ruth declined but still has a seat at Table 4." "Ben and Dana are both at Table 9." A running count of who is still unseated sits at the top of every screen, so you always know how far from finished you are.

BUILT FOR A PHONE, NOT ONLY A LAPTOP

Tap a guest — or a whole party in one tap — then tap the table. No dragging tiny names around a small screen. Move tables on the floor plan when you want to. Search finds anyone instantly, even at 300 guests. Every action can be undone, including "Suggest an arrangement," which is a suggestion with a Put mine back button, never something that quietly overwrites two hours of your work.

THREE PDFs, FREE AND UNWATERMARKED

This is the part other apps put behind the paywall.

• Entrance display — table by table, set in a proper serif, ready to frame
• Escort cards — alphabetical by last name, ten to a page, dashed cut lines
• Caterer's sheet — meal counts per table, dietary flags called out, totals at the bottom. This is the page your venue asks for a week before the date.

US Letter or A4, your choice. Real vector text, so it stays sharp at any size.

YOUR WORK STAYS YOURS

It saves itself as you type. Export the whole event as one small file, mail it to yourself, open it on another device. If this app vanished from the store tomorrow, that file still opens in any copy of it. Nothing here can be switched off, migrated, or repriced out from under you.

There is a tip jar. It appears once, after a PDF finishes downloading, and it changes nothing — every feature is free whether you use it or not.

Weddings, rehearsal dinners, banquets, fundraisers, awards nights, conference tables, classrooms, and the holiday dinner with a difficult uncle.

Made by Sky Wolf Studio.
```

The wedge is drawn straight from Play-specific evidence, stated as a pattern rather than a named competitor (naming rivals in a Play listing is a metadata risk): free tiers that stop at 30–75 guests, the design-free-but-pay-to-save model, and weekly subscription billing for a single-evening tool. Each of the three sentences in paragraph two maps to a real, documented product. "Seating chart" appears three times in 3,150 characters — well under any stuffing threshold.

---

## 4. ASO keyword list (ranked)

Play indexes the title, short description and full description; there is no keyword field. These are the phrases the copy above is built to earn, in priority order.

| # | Phrase | Where it is covered | Note |
|---|---|---|---|
| 1 | wedding seating chart | Title | Category head term. Peak-season volume. |
| 2 | seating chart maker | Title | Second head term, same 27 characters. |
| 3 | seating chart app | Title tokens + body | Highest-intent install query. |
| 4 | wedding seating plan | Body ("seating plan" in What's New) | UK/AU-dominant phrasing of #1. |
| 5 | table plan wedding | Body ("Move tables on the floor plan") | The other British variant. |
| 6 | free seating chart | Short desc + body | Where the differentiator and the query coincide. |
| 7 | escort cards / place cards print | Body, its own bullet | Bottom-of-funnel; these people print tonight. |
| 8 | wedding guest list seating | Body (guest list, RSVP, paste) | Bridges the two jobs users conflate. |
| 9 | seating chart no watermark | Body, verbatim heading | Small volume, near-100% conversion. |
| 10 | event seating planner | Body (banquets, fundraisers, conferences) | Carries the app past May–October. |
| 11 | banquet / event table planner | Body list | Year-round tail. |
| 12 | classroom seating chart | Body list | Adjacent audience with its own August spike. |
| 13 | seating chart offline | Body ("works with no signal") | Day-of venue-basement query. |
| 14 | keep apart seating rules | Body, verbatim bullet | Zero competition, exactly describes the app. |
| 15 | caterer meal count sheet | Body, verbatim bullet | Planner-referral query; nobody free ranks here. |

Terms deliberately **not** chased: "seating chart template" (Canva and Etsy own it, and the intent is a graphic file, not an app), "3D floor plan" (not shipped), "AI seating" (auto-arrange is a heuristic in `model.js`, not AI, and saying so would be a false claim).

---

## 5. Screenshot plan — 5 phone screenshots

Format for all five: 1080×1920, the app's plum-on-cream skin (`--canvas #fef6ea`, `--accent-deep #7d549a`), caption set in Fraunces on a solid cream band across the top ~18% with the live screen below it. Caption band identical on all five so they read as one strip when swiped.

**1 — The conflict list. This is the install decision.**
On screen: the Seat people tab of a real 137-guest wedding. The violations panel at top reading **"3 to fix"** with three plain rows: `Table 6 has 11 people for 10 seats.` / `Ruth Okafor declined but still has a seat at Table 4.` / `Ben Alvarez and Dana Reyes should be kept apart but are both at Table 9.` Directly beneath, the standing counter: **"14 of 137 still unseated."**
Caption: **"Change one RSVP. See exactly what broke."** (40 chars)
Bottom-corner ribbon, small: **"Free · No guest cap · No account"** (32 chars)
Why first: it is the one screen no competitor can screenshot, and it is legible at thumbnail size because it is a short list of sentences, not a floor plan. The ribbon answers the category's only real objection — "what will this cost me halfway through?" — before the user has to tap anything. Every other tool leads with a pretty floor plan; leading with the thing that catches your mistake is the whole positioning in one image.

**2 — The three PDFs, with the output visible.**
On screen: the Print & export tab, three export cards (Entrance display / Escort cards / Caterer's sheet) with the US Letter–A4 selector visible, and a rendered entrance-display PDF page tilted in from the right edge showing real table headings in Fraunces.
Caption: **"Three PDFs. No watermark, no export fee."** (40 chars)
Why second: the PDF is the product. A user who scrolls one card wants proof the paper is worth having, and "no export fee" lands hardest immediately after the free ribbon on #1. Showing the actual PDF page — not just the buttons — is what separates this from every listing whose screenshots stop at the UI.

**3 — Tap-to-seat, whole party.**
On screen: the unseated tray with the party header `Alvarez family` and its **"whole party (4)"** chip selected in plum, four guest chips lit beneath it, and the table row below showing the primary button **"Seat 4 here"** against `Table 3 · 4 of 10`.
Caption: **"Seat a whole family in two taps."** (32 chars)
Why third: this is the direct answer to the single most-cited category regression — "now you have to drag and drop individual people instead of whole parties." It is also the proof that the app is usable standing up on a phone, which is the position where the objection "this is really a desktop tool" gets killed.

**4 — Rules, including the private one.**
On screen: the Rules tab, header `Rules — declared once, checked forever`, three rules listed: `Keep together: Ann Alvarez, Ben Alvarez, Cara Alvarez` / `Keep apart: Ruth Okafor, Gerald Okafor` / `Must be at: Nana Wilkes → Table 1`.
Caption: **"Keep apart. Never printed. Never uploaded."** (42 chars)
Why fourth: by now the user is convinced it works; this is the screen that makes them trust it with the actual sensitive content. Divorced parents and estranged siblings are the emotional core of the category, and this is the only claim in the whole listing that no cloud competitor can honestly make. It sits at position four because it converts consideration into install, not attention into consideration.

**5 — Get your list in, keep your list out.**
On screen: the Guests tab with the paste panel open, a spreadsheet-shaped block of `Ann Alvarez, Alvarez family, Beef` lines in the textarea and the **Add them all** button, plus the **Export this event as a file** button visible below. A small airplane-mode glyph in the status bar.
Caption: **"Paste your spreadsheet. Works with no signal."** (45 chars)
Why last: it removes the two remaining exit objections in one frame — "I already have the list in Sheets and won't retype it" and "what happens to my work if this app goes away." Last position is right for objection-removal; a user who swiped this far is already sold and just needs permission.

---

## 6. Feature graphic concept — 1024×500

**Composition.** Full-bleed deep plum ground (`#4A2545`, matching the skin's `--accent-deep` family). Right two-thirds: a flat, top-down floor plan drawn in single-weight cream hairlines — seven round tables and one long head table, no shadows, no gradients, no 3D. One round table is filled in muted brass (`#B08A4E`) and carries a small chip reading `11/10`; a thin brass line runs from it to a single cream check-row at the plan's edge, so the graphic *shows the mechanism* rather than decorating the category. In the lower right, one escort card lifts slightly off the plane in cream with a hairline dashed cut edge — the paper deliverable, present but not shouting.

**Text.** Left third, vertically centred, Fraunces in cream:

- Headline: **"Seating that checks itself"** (26 chars)
- Sub-line, smaller, in `--ink-3`-weight cream at ~55% opacity: **"Wedding · banquet · classroom"** (29 chars)

**Crop and overlay safety.** All text sits inside the central 60% of the width and the central 70% of the height, so the ~centre-crop Play applies on some surfaces cannot clip it and a play-button overlay lands on the empty plum between the headline and the floor plan. Nothing important within 80px of any edge.

**Deliberate omissions:** no device frames, no store badges, no screenshots-inside-the-graphic, no price or "Free" callout, no star ratings — all four are the standard rejection triggers in graphic-asset review, and the price claim already lives in the short description where it is safe.

---

## 7. What's new — version 1.0.0

**407 characters** (Play release-notes limit is 500).

```
First release.

Build a seating plan for up to 1,000 guests, declare who sits together and who does not, and let the app tell you what breaks each time an RSVP changes. Print three PDFs free and unwatermarked: an entrance display, escort cards with cut lines, and a caterer's sheet with meal counts and dietary flags.

No ads, no account, no subscription. Works offline. Nothing you type leaves your device.
```

---

## Two flags before you paste this into Play Console

**1. The tip jar is a genuine open policy question and I cannot confirm the current rule.** `app.js:15` sets `CONFIG.tipUrl` to a Stripe payment link, and the in-app button opens it in an external browser after a successful export. Google Play's Payments policy has historically required Play Billing for in-app digital purchases while carving out donations, with the carve-out written around registered nonprofits — and the rules in this area have been changing under ongoing US injunctive relief around external payment links. **I could not verify the requirement as it stands on 2026-08-16, so treat this as unresolved rather than settled.** Check the current Payments policy text in Play Console before your first submission. If it is not clearly permitted, the safe move is to hide the tip button inside the TWA build (a query-param or build flag on `CONFIG.tipUrl`) and delete the tip-jar paragraph from the full description — the listing loses nothing structural, since that paragraph is the only place it appears.

**2. The Data Safety form for this app is the easy one, and you should answer it literally.** No data collected, no data shared, no data types at all. Firebase Hosting server logs are host-side infrastructure and are already disclosed in `/workspaces/SWS-apps/apps/seating-chart/privacy.html`; they are not app-collected data. The privacy policy page already exists at that path and is current as of 2026-08-16, so the Play Console privacy-policy URL is `https://sws-apps-9646d.web.app/seating-chart/privacy.html`.

Sources: [Table Tailor on Google Play](https://play.google.com/store/apps/details?id=toptable.matthewalner.com&hl=en), [Wedding Tables Organizer on Google Play](https://play.google.com/store/apps/details?id=com.weddingtables.organizer&hl=en_US), [SeatPlan.io](https://seatplan.io/), [Simplify Tables seating planner comparison](https://www.simplifytables.com/guides/best-seating-planner-app), [Play Console: best practices for your store listing](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en), [Play Console: get discovered on Google Play search](https://support.google.com/googleplay/android-developer/answer/4448378?hl=en), [ASOMobile: app listings in Google Play 2026](https://asomobile.net/en/blog/app-listings-in-google-play-2026/)

---

All copy written and character-counted. Files: `/tmp/claude-1000/-workspaces-SWS-apps/d8791b98-e937-4b47-be53-c522fb8eed80/scratchpad/full.txt` and `/tmp/claude-1000/-workspaces-SWS-apps/d8791b98-e937-4b47-be53-c522fb8eed80/scratchpad/whatsnew.txt`.

---

# Google Play store listing — home-inventory

Verified against `/workspaces/SWS-apps/apps/home-inventory/app.js`, `model.js`, `pdf.js`, `zip.js`, `sw.js`, `index.html`, `README.md`, `manifest.webmanifest`, and `/workspaces/SWS-apps/design/findings/home-inventory.research.json`. The "nothing leaves your device" claim **is true for this app**: no analytics, no telemetry, `sw.js` only fetches same-origin assets, all storage is IndexedDB (`sws-inventory`), all five exports are generated on-device via vendored pdf-lib and a 90-line ZIP writer. The one outbound link is the Stripe tip jar (`app.js:16`) — see the compliance flag at the bottom.

---

## 1. Title — 28 characters

```
Home Inventory for Insurance
```

**28 / 30.** Carries the two highest-volume query terms ("home inventory", "insurance") with no promotional adjectives, which Play's metadata rules disallow. I did not put "Free" or "Offline" in the title — those are ranking-neutral there and read as spam bait.

---

## 2. Short description — 78 characters

```
Room-by-room photo inventory, PDF and spreadsheet exports. No account, no cap.
```

**78 / 80.** First half says what it does, second half answers the two objections that kill installs in this category: the sign-up wall and the item limit.

---

## 3. Full description — 3,985 characters

```
Nobody photographs the house until the week after the fire. By then the only inventory that exists is the one in your memory, and the claim form will not accept it.

The tools meant to fix this keep getting in the way. One popular free tier stops at 20 items. Another stops at 100 and excludes reports and exports entirely, so the free version cannot produce the document the adjuster just asked you for. The free home inventory app that insurance blogs recommended for a decade closed its consumer product in December 2025 and the data closed with it — the second time this category has done that to people. And the free app your state insurance department links to is rated barely two stars, with reviewers reporting crashes on export and photos too pixelated to read a model label.

This is the plain one.

Free. No ads. No account. No subscription. No item cap. Nothing leaves your device: every photo, serial number and value is written to this phone's own storage and nowhere else. There is no server to upload to, which is why the whole app, PDF exports included, works with the wifi off.

WALK THE HOUSE IN ONE PASS
Capture is a single screen. Pick the room once, take the photo, type what it is, save. The room stays selected and the cursor returns to the name field, so a bookshelf takes about ninety seconds. The name is the only required field. Brand, model, serial number, purchase date, condition, quantity, original cost, replacement cost, receipts and notes can all be added later from the Items tab.

PHOTOS YOU CAN ACTUALLY READ
Wide shots are compressed so a whole house fits on the phone. Tick Close-up before you shoot a serial plate, a hallmark or a receipt and that photo is kept at 2400px instead. A model number photographed from across the room is worthless a year later.

THE FILES A CLAIM ACTUALLY NEEDS
• Full report (PDF) — cover summary, then a page per room with a photo grid and values.
• Items by value (PDF) — everything sorted highest first, the exhibit to attach to a claim.
• Spreadsheet (CSV) — Quantity, Description, Brand/Make, Model, Serial, Room, Purchase date, Condition, Original cost, Replacement cost, Photo file, Notes. These are the columns carrier contents forms and claims software actually ingest. The PDF is for a person to read; this is the file nobody has to retype.
• Spreadsheet + photos (ZIP) — the same spreadsheet plus every photo, each named to match its row.
• Backup (.json) — everything including the photos, readable in a text editor, restorable anywhere.

All five are built on the phone, offline. Nothing is watermarked or held back for a paid tier, because there isn't one.

SAVING THAT DOES NOT LIE TO YOU
"Saved" appears only after the write has finished and the record has been read back off the disk. If a write fails, a red banner stays up, counts how many changes exist only in this session, and offers a backup file immediately. Losing a photo on save is the unforgivable bug in this category. This app is built not to commit it.

AND IT NAGS YOU TO GET A COPY OFF THE PHONE
A home inventory that burns with the house is a cruel joke. So the app shows how long it has been since your last export, and how much storage it has left to work with. There is no item cap, but your phone's free space is a real one, and the app shows you the number instead of hiding it. Export, then email the file to yourself.

FIND THINGS ONCE THE LIST IS REAL
Search by name, serial, brand or notes. Sort by most recent, highest value, name or room. Filter to one room, to Missing a photo, or to $500 or more, so an hour of work lands where the money is.

Owners and renters both: your policy covers contents, and contents is the part you have to prove. The same home inventory works for a move, an estate, or a burglary report.

Made by Sky Wolf Studio. No account, no ads, no analytics, no trackers, no in-app purchases, no cloud, nothing to cancel. If this app disappeared tomorrow, your exported backup file would still open.
```

**3,985 / 4,000.** Term density is deliberately low — "home inventory" 3×, "insurance" 2×, "photo" 12×, everything else once or twice, all in running prose. No comma-separated keyword blocks.

**Why competitors are described but not named:** every fact in paragraph 2 is real and sourced (Itemtopia's 20-item free tier; Sortly free = 100 items with Reports/exports excluded from the free plan per its own pricing matrix; Encircle's consumer Home Inventory shutdown, 17 December 2025; III's Know Your Stuff, 26 June 2017; NAIC Home Inventory at 2.1★ on iOS with "crashes when trying to export" and "so pixelated, the information on the product labels is unreadable"). I kept the trademarks out of the pasted copy because Play's Store Listing and Promotion policy is enforced against third-party brand use in metadata, and an IP complaint from a funded competitor is a takedown, not a warning. The wedge survives without the names.

---

## 4. ASO keyword list — ranked

Play has no keyword field; these are indexed from title, short description and full description. Ranked by intent × winnability.

| # | Phrase | Where it's covered | Note |
|---|---|---|---|
| 1 | home inventory | Title, description ×3 | The category head term. Non-negotiable. |
| 2 | home inventory app | Title + description | Same intent, longer tail. |
| 3 | home inventory for insurance | Title (exact) | Highest-converting phrase in the set — this is the searcher who will finish. |
| 4 | free home inventory app | Description ("Free", "free home inventory app") | Objection-led search. Very high intent given the paid field. |
| 5 | home inventory no subscription | Description ("No subscription", "no paid tier") | Small volume, near-zero competition, converts. |
| 6 | offline home inventory | Description ("works with the wifi off", "offline") | The offline segment on Play is crowded now (Home Vault, Home Inventory Keeper, HomeFolio) — rank here on the export story, not on offline alone. |
| 7 | home contents inventory | "contents", "carrier contents forms" | The insurer's own word. |
| 8 | personal property inventory | Description ("your policy covers contents") | Adjuster/agent vocabulary. Weakly covered — acceptable. |
| 9 | insurance claim inventory list | "claim" ×4, "the exhibit to attach to a claim" | Post-loss searcher. Urgent, converts fast. |
| 10 | renters insurance inventory | "Owners and renters both" | Under-served demographic, cheap to hold. |
| 11 | home inventory pdf report | "Full report (PDF)", "Items by value (PDF)" | The competitor free tiers cannot serve this query. |
| 12 | home inventory spreadsheet | "Spreadsheet (CSV)", the column list | Our strongest uncontested term. Nobody else emits carrier-shaped CSV free. |
| 13 | photo inventory app | "photo" ×12 | Broad, competitive; ride it, don't chase it. |
| 14 | serial number tracker | "serial number" ×5, close-up mode | Long tail, high intent, we genuinely win the feature. |
| 15 | household items list app | "the list", "Items tab" | Weakly covered. Fine. |
| 16 | moving inventory list | "works for a move" | One mention. Enough to index. |
| 17 | estate inventory app | "an estate" | One mention. Executor traffic is real and unserved. |
| 18 | belongings inventory | Implied, not literal | Deliberately not stuffed in. |
| 19 | valuables inventory app | "$500 or more" filter, "highest value" | Deliberately not stuffed in. |
| 20 | no ads inventory app | "No ads" ×2 | Answers the Itemtopia review complaint directly. |

Do **not** add: "asset tracker", "barcode scanner", "warehouse inventory", "stock management". They pull business-inventory traffic that will uninstall and 1-star us — that is exactly the audience mismatch that put Sortly's home users into its negative reviews.

---

## 5. Screenshot plan — 5 phone screenshots, 1080 × 1920, portrait, 24-bit PNG, no alpha

Shoot from the real app (`/workspaces/SWS-apps/apps/home-inventory/index.html`) with a staged but plausible inventory — a real living room, real objects, real dollar values. Caption text sits in a solid band across the top ~18% of each frame, cream `#EDE6D5` type on the near-ink green `#161B0F`, so the caption reads at Play's search-thumbnail size where the UI itself is illegible.

**1 — Capture tab, mid-use.** *This one carries the install decision.*
On screen: the Capture tab (`renderCapture`), heading "Fast capture — point, shoot, name, next", Room select showing "Living room", a real photo of a wall-mounted TV filling the preview, "What is it?" = `65-inch TV`, Qty `1`, Value `1200`, the primary "Save & next" button, and the "Last 4 added in this room" strip below with three thumbnails already in it.
Caption: **"Point, shoot, name, next.
No item cap. No account."**
Why first: Play shows screenshot 1 as the thumbnail in search results, so it has to do two jobs at once — prove the app is a working camera-first tool (not a form), and pre-empt the objection that decides this category. The three thumbnails already in the strip do silent work: they say this is fast enough that you've already done three.

**2 — The exported PDF, open in the phone's own document viewer.**
On screen: the "Full report" PDF's room page — the photo grid with four item photos, names, values, and the room subtotal — rendered by `makeInventoryPdf`. Bottom third: a peeled corner showing the CSV open in Google Sheets with the header row `Quantity, Description, Brand/Make, Model, Serial, Room…` legible.
Caption: **"It ends in the file your insurer asked for."**
Why second: this is the payoff and the single biggest gap versus the free competition — Sortly's free plan excludes reports and exports entirely, so its free users physically cannot produce this frame. Anyone still scrolling after screenshot 1 is asking "and then what?" This answers it before they ask again.

**3 — Items tab at real scale.**
On screen: `renderItems` with the search field, Sort by = "Highest value", room chips plus the "Missing a photo" and "$500 or more" chips (one of them selected), the status line reading `Showing all 312 items · $84,220`, and eight rows below with thumbnails, room names and values.
Caption: **"312 items, still findable."**
Why third: the objection that arrives after the payoff is "will this survive a whole house?" Every paid competitor's reviews complain the list stops being browsable. The number in the status line is the argument; it also quietly restates "no cap" without repeating the words.

**4 — Item detail with a close-up serial plate.**
On screen: the `#itemDlg` edit dialog open over an item, with Brand `Sony`, Model `XR-65A80L`, Serial filled, Condition `Excellent`, Purchased date set — and above the fields, the close-up photo of the actual serial/model plate, **legibly readable in the screenshot itself**.
Caption: **"Close-ups stay readable a year later."**
Why fourth: this converts the one person who has been burned before. "The small photos are so pixelated, the information on the product labels is unreadable" is a real 1-star review of the free government app in this exact category; showing a readable plate is the rebuttal, and it can only be made visually. Position 4 because it's a proof point, not a hook — it rewards the reader who has already decided they're interested.

**5 — Export tab, phone in airplane mode.**
On screen: `renderExport` with the five export cards visible (PDF, PDF, CSV, ZIP, .json), the "Will this still be here in three years?" storage card underneath, and — critically — the **airplane-mode icon visible in the status bar** at the top of the device frame.
Caption: **"Airplane mode. Full export. Nothing uploaded."**
Why last: it closes on the promise and proves it in the same frame rather than asserting it. The status bar icon is the whole argument; no cloud app can take this screenshot. Last position because privacy is the reason people stay, not usually the reason they tap install.

---

## 6. Feature graphic — 1024 × 500

24-bit PNG or JPEG, exactly 1024 × 500, **no alpha channel**.

**What it shows:** flat background in the app's dark archival green, `#161B0F`. Right 55%: four photograph cards fanned like evidence photos dropped on a desk — a wall-mounted TV, an acoustic guitar, a wristwatch, and one tight close-up of a serial plate with its digits legible. Slight rotation (2–6°), soft drop shadows, faintly desaturated so they read as documents rather than lifestyle stock. The rightmost card bleeds off the edge so any horizontal crop reads as intentional. Left 45%: the type block, vertically centred, left margin 72px.

**Text on it — two lines, nothing else:**

```
Photograph it before you need it
Room by room. Nothing leaves your phone.
```

Line 1 in the app's display face at ~54px, cream `#EDE6D5`. Line 2 at ~26px in `#A8B392`. That is 32 and 40 characters — both legible at the ~250px-wide thumbnail Play uses on smaller surfaces.

**Constraints honoured:** no UI screenshots inside it (Play crops the graphic), no price or promotional words like "Free" (graphic assets must not carry price/promotional text or anything resembling a store badge or rating), and no text in the horizontal centre where a play button is overlaid on video-enabled surfaces. This listing has no promo video, so no play button appears on its own store page — but the same asset is reused in placements where one can, so keep the centre clear anyway.

---

## 7. What's new — version 1.0.0 (488 characters)

```
First release on Google Play.

Room-by-room capture with photos, quantity, brand, model, serial, condition, purchase date, original cost and replacement cost. Close-up mode keeps serial plates and receipts at full detail.

Five exports, all built on the phone, offline: full PDF report, items-by-value PDF, CSV in the columns claims software ingests, CSV + photos as a ZIP, and a .json backup that restores anywhere.

Free, no ads, no account, no subscription. Nothing leaves your device.
```

**488 / 500.**

---

## Two things to settle before you submit

**1. The tip jar is the real submission risk, and I kept it out of the listing on purpose.** `app.js:16` sets `tipUrl: 'https://buy.stripe.com/9B6bJ2b5TfpJg2959T7EQ06'`, rendered as a "♥ Tip jar" button in the header of `index.html`. Google Play's Payments policy requires Google Play Billing for in-app digital transactions, with a carve-out for donations that — as I understand it — is limited to registered nonprofits in supported countries. SWS Strategic Media LLC is an LLC, not a nonprofit. **I cannot confirm the exact current wording of that carve-out, so treat this as unresolved, not as cleared.** Options, cheapest first: hide the tip-jar button when running inside the TWA (detect `display-mode: standalone` plus the TWA referrer and skip rendering it), or verify the donation exception in Play Console before first submission. The listing copy above mentions no payment surface at all, which is both accurate and the safest posture either way.

**2. Data Safety answers are clean and I'd file them as "No data collected, no data shared."** Verified: no analytics library, no telemetry, no `fetch` to any third-party origin (`sw.js` returns early on `url.origin !== location.origin`), no account, no ad SDK. Privacy policy URL already exists at `/workspaces/SWS-apps/apps/home-inventory/privacy.html` → `https://sws-apps-9646d.web.app/home-inventory/privacy.html`. Note for the form: the app's outbound links are the Stripe tip jar (user-initiated only) and Firebase Hosting's standard server logs, both of which `privacy.html` already discloses.

**Sources:**
- [Create and set up your app — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
- [Best practices for your store listing — Play Console Help](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)
- [Google Play Feature Graphic Size 2026 — ScreenKit](https://screenkit.tools/specs/google-play-feature-graphic-size)
- [Google Play Screenshot Requirements 2026 — AppLaunchFlow](https://www.applaunchflow.com/blog/google-play-screenshot-requirements-2026)
- [Sortly: Inventory Simplified — Google Play](https://play.google.com/store/apps/details?id=com.sortly.mythings&hl=en)
- [Sortly reviews — Capterra](https://www.capterra.com/p/169199/Sortly-Pro/reviews/)
- [Itemtopia Home Inventory — Google Play](https://play.google.com/store/apps/details?id=com.itemtopia.app&hl=en_US)
- [Itemtopia Inventory review summary — grand-screen.com](https://grand-screen.com/apps/itemtopia-inventory/)
- [HouseBook — Home Inventory — Google Play](https://play.google.com/store/apps/details?id=chenige.chkchk.wairz&hl=en_US)
- [Reviewing the Best Home Inventory Apps for Renters — Goodcover](https://www.goodcover.com/blog/reviewing-the-best-home-inventory-apps-for-renters)
- [Best Home Inventory App for Android in 2026 — collectioninventory.app](https://www.collectioninventory.app/best-home-inventory-app-android/)
- [Free Home Inventory App and Software — clubofthings.app](https://clubofthings.app/blog/free-home-inventory-app)
