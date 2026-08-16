# Sky Wolf Studios → Google Play: the decision document
**Date: 2026-08-16 · Repo: `/workspaces/SWS-apps` · Origin: `https://sws-apps-9646d.web.app`**

---

## 1. Verdict

Yes, this portfolio can ship on Play, but not today and not as 23 listings — the apps themselves are the finished part and everything still missing is account-level, policy-level and deployment-level. Right now **zero apps are submittable**: `curl` against the live origin returns `[]` for `/.well-known/assetlinks.json` and Google's own statement API returns `{"maxAge":"3600s"}` with no statements array, so Digital Asset Links verification fails for all 23 packages, and `apps/sub-plans/icon-512.png` 404s live even though it exists locally — the fixes are in the working tree, uncommitted and undeployed. The single thing most likely to go wrong is **not** any individual rejection: it is Play's Repetitive Content policy, whose stated violation ("creating multiple apps with highly similar functionality… developers should consider creating a single app that aggregates all the content") describes a 23-small-utility single-developer catalogue almost word for word, and whose escalation path ends at *termination of the developer account*, taking all 23 down at once. The second most likely failure is a schedule failure that is entirely a paperwork problem: if the Play account is personal and created after 2023-11-13, nothing reaches production for at least 14 days of closed testing plus up to 7 days of review, and two of these apps (`pill-schedule`, `caregiver-log`) legally require an **Organization** account, which requires a D-U-N-S number that can take ~30 business days to issue. Start the account/D-U-N-S clock today, deploy the site today, and plan on the first app going live in **mid-to-late September**, not August.

---

## 2. The spam-policy question — read this first

**The honest read: publishing 23 of these as 23 separate listings from one young account will, more likely than not, draw enforcement.** Not a coin flip on each app — a compounding account-level risk. The verbatim policy language is:

> "We don't allow apps that merely provide the same experience as other apps already on Google Play… Creating multiple apps with highly similar functionality, content, and user experience. If these apps are each small in content volume, developers should consider creating a single app that aggregates all the content."
> — https://support.google.com/googleplay/android-developer/answer/9899034

Every aggravating factor is present, and they are visible from outside:

| Signal | Status in this repo |
|---|---|
| One developer, many small utilities | 23 apps in `apps/` |
| One shared origin | all at `sws-apps-9646d.web.app/<slug>/`, one `assetlinks.json` |
| One design system | `design/skins.mjs` + one solved `palette.json` drives all 23 |
| One icon generator | `design/play.mjs` renders all 23 icons from `icon.svg` |
| **One feature-graphic template** | `design/play.mjs:266 featureGraphicHtml()` — comment says outright "the LAYOUT is invariant… identical grid, identical icon size and position, identical type hierarchy, identical studio line". 23 files already rendered. |
| Genuine near-duplicates | `packing-list`, `moving-boxes`, `grocery-list`, `home-inventory`, `sitter-sheet` are all list-with-checkboxes at the mechanical level |
| Origin doesn't visibly belong to the developer | `sws-apps-9646d.web.app` is a Firebase-generated subdomain — bad for the *webview-of-a-website* clause too |

### The strategy

**a) Cap the catalogue at 12 standalone listings in year one. Do not ship 23.**
This is the decision. Take Google's own named remedy seriously: the tail of the portfolio goes into **one aggregate app** rather than eleven listings. `apps/index.html` (20 KB hub page) is already the aggregation vehicle — a single TWA scoped to the origin root, listing name *Sky Wolf Toolkit*, is one extra package that carries the thin apps without any of them being a listing. The apps stay free on the web regardless; the web is the distribution channel that has no policy at all.

**b) Ship at most one app every two weeks, and never two adjacent siblings in a row.** The submission order in §4 already separates `seating-chart` (#2) from `wedding-timeline` (#10) by seven slots for exactly this reason. Keep that discipline even when a seasonal window tempts you.

**c) Treat the first three approvals as the experiment.** If #1–#3 approve cleanly with no policy warnings, continue. If any one draws a repetitive-content or minimum-functionality flag, stop submitting and consolidate — do not appeal your way through five more.

**d) Move to a branded custom domain before app #1.** `skywolfstudios.app` (or similar) costs ~$20/yr and directly answers the "webview of a website without permission from the website owner" question a reviewer asks when a Firebase subdomain shows up. **This must be decided before the first `bubblewrap init`, because the origin is baked into every TWA, every `twa-manifest.json`, and the one `assetlinks.json`.** Changing it after submission means new packages.

**e) Never ship as standalone listings:**

- **`wheel-picker`** — a spinning wheel is the textbook "very little content / limited functionality" case, and `wheelofnames.com` already owns the real use case for free. Aggregate it.
- **`qr-maker`** — highest single-app quality-review risk in the portfolio; hundreds of near-identical generators exist. Aggregate it. (Its static-never-expire angle is real, but it is a paragraph in an aggregate listing, not a listing.)
- **`bracket-maker`, `secret-santa`, `sitter-sheet`, `packing-list`, `moving-boxes`, `wedding-timeline`, `signature-maker`, `image-compressor`** — each is decent; collectively they are the "23 apps from one dev" pattern. Aggregate.
- **`specials-planner`** — least structurally finished (724 JS lines vs 2,537 lines of inline HTML, an `alert()` on the Drive path) and the only app that pulls in the Google API Services User Data Policy. Either strip Drive for v1 or leave it web-only.

**The 12 that stay standalone:** sub-plans, seating-chart, home-inventory, scan-to-pdf, pdf-tools, bill-splitter, pill-schedule, baby-log, grocery-list, signup-sheets, team-parent, caregiver-log — plus *Sky Wolf Toolkit* as the 13th package. Every one of those does something structurally different from its siblings (print artifact, constraint solver, evidence record, camera pipeline, file surgery, arithmetic, medical card, infant log, four shared-link apps that need the cloud work anyway).

---

## 3. The tip jar ruling

**Ruling: the tip jar is permitted as it currently stands. Do not remove it, do not hide it in the TWA build, and do not route it through Play Billing.** This resolves the "unresolved" flag in the seating-chart listing draft below — that flag is now closed.

The governing sentence, verbatim:

> "In cases where 100% of the tip or contribution from a user goes to the creator and the payment does not grant access to any digital content or services (including stickers, badges, special emojis), then it is regarded as a peer-to-peer payment and use of Google Play's billing system is not required."
> — https://support.google.com/googleplay/android-developer/answer/10281818

The current implementation qualifies. Verified in the repo: the tip link is an inert anchor with no side effects (`apps/baby-log/app.js:956-960` sets `t.href = CONFIG.tipUrl; t.classList.remove('hidden')` and nothing else); there is no `tipped` / `supporter` / `pro` flag anywhere; 23 distinct Stripe Payment Links, one per app; `apps/sub-plans/app.js` has `tipUrl: ''` — app #1 ships with no outbound payment link at all.

### What must change

1. **Purge the word "donate" / "donation" from every surface.** The Payments-policy carve-out for donations is limited to **tax-exempt** donations, and SWS Strategic Media LLC is not a 501(c)(3). The tips clause is the one you qualify under, and it only works if you call it a tip. Audit and fix: all 23 Stripe Payment Link **product names**, the Stripe **checkout page heading**, the emailed **receipt line item**, the Stripe **statement descriptor**, all 23 `privacy.html` pages, and every Play listing. In-app copy is already correct — "♥ Tip jar", "Found this useful? Leave a tip" — leave it exactly as it is.
2. **Never write "support development so we can build X."** That reframes the tip as consideration for future digital goods and voids the exemption.
3. **Freeze decoupling as a tested invariant.** Add one assertion to the shared smoke suite (pattern exists at `apps/bill-splitter/test/smoke.mjs:47`) that no feature branch reads any tip/supporter/pro state. Because the tip jar is identical in all 23 apps, one coupled feature in one app is a portfolio-wide Section 4 anti-steering exposure.
4. **Do not mention the tip jar in listing copy** beyond the one factual sentence already in the seating-chart draft. It buys nothing and gives a reviewer a thread to pull.

---

## 4. Submission order

Ranks 1–23 as researched, with the §2 overlay applied in the last column.

| # | App | Demand | Readiness | Season | Ship as |
|---|---|---|---|---|---|
| 1 | **sub-plans** | medium | ready | Peak now (Aug binder + Oct–Feb flu) | **Standalone** |
| 2 | **seating-chart** | medium | small gap | Hard: live by mid-Sept or defer to April | **Standalone** |
| 3 | **home-inventory** | high | small gap | Hurricane/wildfire Aug–Oct, Jan renewals | **Standalone** |
| 4 | **scan-to-pdf** | high | small gap | None | **Standalone** |
| 5 | **pdf-tools** | high | ready | None | **Standalone** |
| 6 | secret-santa | high | small gap | Hard: live by 1 Nov or defer to 2027 | Aggregate (Toolkit) |
| 7 | **bill-splitter** | high | small gap | Mild Nov–Jan, March | **Standalone** |
| 8 | packing-list | medium | small gap | Live by early Nov | Aggregate |
| 9 | wheel-picker | high | small gap | Sept / Jan school | **Never standalone** |
| 10 | wedding-timeline | medium | small gap | Live by early Dec (engagement season) | Aggregate |
| 11 | qr-maker | high | small gap | None | **Never standalone** |
| 12 | moving-boxes | medium | small gap | Live by Jan–Feb for May–Aug season | Aggregate |
| 13 | image-compressor | high | small gap | None | Aggregate (needs target-size mode either way) |
| 14 | signature-maker | medium | small gap | None | Aggregate |
| 15 | sitter-sheet | low | small gap | Mild summer / Dec | Aggregate |
| 16 | bracket-maker | medium | small gap | Live by Feb for March Madness | Aggregate |
| 17 | **pill-schedule** | high | big gap | None | **Standalone — requires Org account** |
| 18 | specials-planner | low | big gap | Window already passed for 2026 | Web-only, or strip Drive |
| 19 | **baby-log** | high | big gap | None | **Standalone** |
| 20 | **grocery-list** | high | big gap | None | **Standalone — cloud prerequisites** |
| 21 | **signup-sheets** | medium | big gap | Aug–Sep, Dec | **Standalone** |
| 22 | **team-parent** | medium | big gap | Aug–Sep sports season | **Standalone** |
| 23 | **caregiver-log** | medium | big gap | None | **Standalone — Org account + heaviest load** |

*Plus one extra package: **Sky Wolf Toolkit** (aggregate of #6, 8–16), submitted after app #5 approves. Scope it at the origin root so `apps/index.html` is the launcher.*

### The first three, defended

**#1 sub-plans — the safest possible first submission, and its window is open right now.**
Zero runtime permissions. Zero network calls at runtime — QR is vendored at `apps/sub-plans/vendor-qrcode.js`, no CDN, no Firebase. `CONFIG.tipUrl` is empty at `apps/sub-plans/app.js:8`, so listing #1 has not even an outbound payment link to explain. It already ships `apps/sub-plans/privacy.html`, and it is the only app with a hardened per-path CSP already in `firebase.json` (`default-src 'self'`, no `unsafe-inline` scripts). Its Data Safety form is the shortest one Google accepts. And it answers the repetitive-content question on first sight: nine sections, a Today/whole-binder split, a live page count on the Print button, a black-and-white print preview, a deflate-raw compressed share link and QR. Seasonally it is at peak — US teachers build the sub binder in August, many districts require an emergency folder on file at the start of the year, and the acute need runs Oct–Feb. **It also already has generated screenshots** (`design/out/play/sub-plans/screenshots/`, five files, 1080×1920).

**#2 seating-chart — the most time-boxed high-substance app you own.**
October is the #1 US wedding month; fall is roughly 35% of US weddings; seating is finalised three to six weeks out. So the window is now through early October, then dead until May. It is the second-largest app by measured substance (38.7 KB `app.js` plus `model.js`, a local pdf.js emitter and vendored pdf-lib; 500 guests × 50 tables × 40 rules with three distinct PDFs generated in-page), needs no permission and makes no network call — `grep` for `fetch(|firebase|XMLHttpRequest|sendBeacon|gtag` across its `app.js`, `store.js`, `index.html`, `sw.js` returns exactly one hit, the service worker caching its own assets. Its Data Safety answers are identical to #1. And it puts the account into a third store category, which is the cheapest available evidence against a clone-farm read. **Gap: it has no scene in `design/scenes.mjs`, so it has no screenshots.** That is the one thing standing between it and submission. **If it slips past 1 October, drop it to ~rank 14 and target April.**

**#3 home-inventory — the substance flagship.**
This is the app you point at if a reviewer ever doubts one. Photos compressed at capture into IndexedDB, `navigator.storage.persist()` requested on first save, remaining quota shown, search and filters over items, a full PDF report, an items-by-value PDF, a CSV whose columns match what a carrier's contents form ingests (with `= + - @` cells prefixed against formula injection), a CSV+photos ZIP, and a restorable `.json` backup. Verified shipped in `model.js`: `quantity`, `brand`, `model`, `condition`, `replacementCents` are all real fields, and `app.js:745` is a real search input. It goes third, not first, because it adds the first file/camera permission and therefore the first non-trivial Data Safety answer — photos processed on device, never collected — and that question is better asked once two clean approvals are on the account. **Screenshots already generated** (`design/out/play/home-inventory/screenshots/`, five files).

---

## 5. Blocking checklist before app #1

Ordered by longest lead time first. Items 1 and 2 start today; nothing downstream matters if they are wrong.

| # | Item | Effort | Notes |
|---|---|---|---|
| **1** | **Decide account type, and register/convert to Organization under SWS Strategic Media LLC.** Apply for the free D-U-N-S number for the LLC immediately; make the legal name and address in the Google Payments profile match the Dun & Bradstreet record character-for-character. | **30 min to apply, up to ~30 business days to issue** | Non-negotiable for `pill-schedule` and `caregiver-log`: Google requires health apps to "register as an Organization" developer account, and both carry `"playCategory": "MEDICAL"` in `design/out/play/*/twa-manifest.json`. Organization accounts are *widely reported* to be exempt from the 12-tester/14-day rule — **I could not verify that exemption on a Google-owned page; confirm it in Play Console before betting the schedule on it.** |
| **2** | **Decide the origin: keep `sws-apps-9646d.web.app` or move to a branded domain.** | 1–2 h if moving | Baked into every TWA. Decide before any `bubblewrap init`. A branded domain directly mitigates the webview-of-a-website clause (§2d). |
| **3** | **Commit and deploy the working tree.** 40+ modified files, all 23 `privacy.html` pages, all `icon-192/512/maskable-512.png`, upgraded manifests. Then `firebase deploy --only hosting`. | **20 min** | `firebase.json` already carries `"appAssociation": "NONE"` (line 4) — the fix is in the repo but **not live**. Currently live: `assetlinks.json` → `[]` (2 bytes); `sub-plans/icon-512.png` → 404; `home-inventory/privacy.html`, `qr-maker/privacy.html`, `pill-schedule/privacy.html` → 404. |
| **4** | **Prove the prerequisites — do not assume them.** `curl -sSI https://<origin>/.well-known/assetlinks.json` (expect `200`, `application/json`, no redirect); `curl` each icon; then the statement API. | 10 min | `curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://sws-apps-9646d.web.app&relation=delegate_permission/common.handle_all_urls"` — today it returns `{"maxAge": "3600s"}` with **no statements array**. That is proof of failure. Allow up to 1 hour for Google's cache after fixing. |
| **5** | **Install the Android toolchain. JDK 17 specifically.** This machine has **OpenJDK 25.0.2**, no Android SDK, no Bubblewrap. Then `npm i -g @bubblewrap/cli@1.25.0` (pin the version) and `bubblewrap doctor`. | **1–2 h** | JDK 17 is a hard pin, not a floor — JDK 21/25 is the single most common `bubblewrap build` failure. Pin the CLI: 1.25.0 hardcodes `compileSdkVersion 36` / `targetSdkVersion 36` (`template_project/app/build.gradle:54,59`), which satisfies the **31 Aug 2026 API-36 gate**. 1.24.1 and earlier do not. Your `twa-manifest.json` files carry only `minSdkVersion: 21` and no targetSdk — correct, because target level comes from the CLI. |
| **6** | **Build, sign and upload the first AAB to a closed testing track.** `bubblewrap init --manifest .../sub-plans/manifest.webmanifest` then `build`. | 1 h | Nothing before this can produce the fingerprint you need next. |
| **7** | **Resolve the fingerprint chicken-and-egg.** After upload: Play Console → Release → Setup → App integrity → App signing key certificate → SHA-256. Paste it over all 23 `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` placeholders in `apps/.well-known/assetlinks.json` (also list the local upload/keystore fingerprint for debugging: `keytool -printcert -jarfile app-release-signed.apk \| grep SHA256`). Redeploy. Re-run the statement API. | **30 min + 1 h cache** | `node design/play.mjs --check` reports exactly this as the one remaining gap: *"23 assetlinks statement(s) still hold a placeholder fingerprint."* Play App Signing re-signs with a key different from your upload key — this is THE classic TWA failure. |
| **8** | **Verify no address bar on a Play-installed build**, on a real device, from the closed track. | 30 min | Verification fails **soft**: the app installs, runs, and just shows a URL bar — which is precisely the appearance that gets flagged as "a webview of a website." Never submit for review before the statement API returns your statement. |
| **9** | **Cold-launch test with no network**, airplane mode, fresh install. | 20 min | "Apps that install, but don't load" is a Broken Functionality violation. A reviewer on a throttled device who gets a blank screen because the service worker never primed has literally observed it. |
| **10** | **Write `design/scenes.mjs` entry for seating-chart** and run `node design/shots.mjs seating-chart`. | **2–3 h** | Only 4 of 23 apps have scenes: `home-inventory`, `sub-plans`, `packing-list`, `qr-maker`. #2 has none. This is code, not drawing. |
| **11** | **Hand-differentiate the feature graphic for apps #1–#3** (see §7 concepts and §8 specs). | **3–4 h, or hire it** | The 23 generated graphics are one invariant layout — the exact repetitive signal a human reviewer sees. |
| **12** | **Health disclaimers** — `pill-schedule` and `caregiver-log`, in-app + description. | 1 h | `grep -rl "medical device" apps/*/index.html apps/*/app.js` returns **nothing** across the portfolio. Blocks #17 and #23, not #1. |
| **13** | **Cloud-app prerequisites** — account deletion flow (in-app + `/delete-account/` page + Cloud Function for recursive deletes), UGC reporting + terms interstitial, App Check. | **3–5 days of engineering** | Verified absent: no `deleteUser` import anywhere, no report/block UI (`grep` finds only `reportValidity` and `savedFlag()`), no `apps/delete-account/`, no terms page. Blocks #20–#23 only. Build it once at #20. |

**Do not confuse item 5 with a 16 KB page-size problem.** A Bubblewrap TWA ships no native `.so` files — it is a thin Java wrapper over `androidx.browser` — so it complies with the 16 KB requirement automatically. Ignore it when the pre-launch report mentions page sizes.

---

## 6. Data Safety + declarations — copy-paste answers

### Every app, all 23, without exception

- **Health apps declaration** (App content page): required for *all* apps, including apps with no health features. 20 apps → **"This app does not provide health features."** `pill-schedule`, `caregiver-log` → **Medical › Medication and Treatment Management.** `baby-log` → **Health and Fitness › Sleep Management + Nutrition and Weight Management** (NOT a Medical subcategory — that would drag it into medical-device rules).
- **Target audience:** **"Ages 18 and over" as the SOLE age group.** Do not select 13–15 or 16–17; Google states those brackets "may be considered to include children in some locales," which pulls Families policy in through the side door — and the four Firebase apps *cannot* satisfy Families requirements, because anonymous Firebase UIDs are exactly the persistent identifier it prohibits. Answer **NO** to Designed for Families and **NO** to Teacher Approved. Leave **Restrict Minor Access UNCHECKED**.
- **Ads:** "No, my app does not contain ads."
- **Privacy policy URL:** `https://<origin>/<slug>/privacy.html` — one per app, all 23 generated by `design/privacy.mjs` from `design/privacy-facts.json`, and all 23 `index.html` files already carry an in-app `href="privacy.html"` link (the separately-required in-app link, verified: 23/23).
- **Account deletion:** "No" for the 18 offline apps and `specials-planner`. "Yes" + web URL for the four Firebase apps **only after the flow actually ships** — answering Yes without shipping is itself the violation.

### Group A — 18 offline-first apps
*baby-log, bill-splitter, bracket-maker, home-inventory, image-compressor, moving-boxes, packing-list, pdf-tools, pill-schedule, qr-maker, scan-to-pdf, seating-chart, secret-santa, signature-maker, sitter-sheet, sub-plans, wedding-timeline, wheel-picker*

> **Does your app collect or share any of the required user data types?** → **No**
> **Is all of the user data collected by your app encrypted in transit?** → n/a
> **Do you provide a way for users to request that their data be deleted?** → n/a

This is legitimate and it is your strongest listing differentiator. Google's own wording: *"User data accessed by your app that is only processed locally on the user's device and not sent off device does not need to be disclosed."* Camera/photo access in `home-inventory`, `scan-to-pdf`, `image-compressor`, `pdf-tools` and `signature-maker` is **access, not collection** — nothing is transmitted. Firebase Hosting's ordinary server logs are host-side infrastructure, not in-app collection, and are already disclosed on each privacy page.

### Group B — the four Firebase apps
*grocery-list, caregiver-log, signup-sheets, team-parent*

Declare honestly. A mismatch between the Data Safety declaration and observed network behaviour is a well-known takedown trigger, and Google tests it.

| Data type | Collected | Shared | Optional? | Purpose | Applies to |
|---|---|---|---|---|---|
| Personal info › **User IDs** | Yes | No | Required | App functionality, Account management | all four (anonymous Firebase UIDs are pseudonymous data and **must** be disclosed) |
| Personal info › **Email address** | Yes | No | Optional | Account management | all four (`sendSignInLinkToEmail`, Google sign-in) |
| Personal info › **Name** | Yes | No | Optional | App functionality | all four (author/display names) |
| Messages › **Other in-app messages** | Yes | No | Required | App functionality | all four (entries, notes, items) |
| Photos/Videos | No | — | — | — | none |
| **Health and fitness › Health info** | **Yes** | No | Required | App functionality | **`caregiver-log` only** — medication names, doses and administration times are written to Firestore (`app.js:1022-1023`, `firestore.rules:257`) |

Plus: **data encrypted in transit → Yes**; **users can request deletion → Yes** + `https://<origin>/delete-account/` (build the page first).

### Group C — specials-planner
Google OAuth token client with `drive.file` scope, wired inline at `apps/specials-planner/index.html:2467-2504`. Declare **Files and docs → collected, not shared, optional, App functionality**, and complete the Google API Services User Data Policy / OAuth consent screen. Google sign-in for access to the user's *own* Drive is not "creating an app account" and should not trigger the account-deletion requirement — **unless** that flow ever provisions server-side state keyed to the user. Simplest resolution: strip Drive for v1.

---

## 7. The three listings — paste-ready

---

## LISTING 1 — Sub Plans

**Verified before writing:** `CONFIG.tipUrl = ''` in `apps/sub-plans/app.js` — this app ships **no tip jar**, and `privacy.html` states "this app has no tip jar at all, so it makes not one outbound request in normal use." No copy below mentions tipping. There is **no seating chart** and **no must-do / if-time splitter** (`design/findings/sub-plans.remaining.json`), so neither is claimed. The on-device claim **is** true here (localStorage only, no Firebase, share link is a client-side URL fragment).

### Title — 28 characters
```
Sub Plans: Substitute Binder
```

### Short description — 79 characters
```
Fill in your class once. Print the whole substitute folder on the sick morning.
```

### Full description — 3,998 characters
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

Sub Plans is one of a set of free, ad-free tools from Sky Wolf Studios. No accounts, no tracking, no catch.
```

### Keywords (ranked by intent match — Play publishes no volumes, and Play Console keyword tooling was not reachable from here)

| # | Phrase | Covered where |
|---|---|---|
| 1 | sub plans | Title, short desc, full desc |
| 2 | substitute teacher plans | Title + full desc |
| 3 | sub binder | Title |
| 4 | substitute binder | Title |
| 5 | emergency sub plans | Full desc |
| 6 | sub plans template | Full desc ("WHY NOT A TEMPLATE") |
| 7 | substitute folder | Short desc + full desc |
| 8 | sub folder for teachers | Full desc |
| 9 | substitute teacher forms | Gap — add to screenshot captions |
| 10 | teacher absence plans | Full desc (implied) |
| 11 | sub notes for substitute teacher | Full desc (feedback page) |
| 12 | lesson plans for a substitute | Full desc |
| 13 | free teacher planner no account | Full desc |
| 14 | offline teacher app | Full desc |
| 15 | substitute teacher information sheet | Full desc (first-ten-minutes block) |
| 16 | printable sub plans PDF | Full desc (Print, US Letter) |

Terms 1–8 are the ones worth defending. **Do not add a keyword block to the description — Play penalises repetitive or unrelated keywords.**

### Screenshot plan — 5 phone shots, 1080×1920
1. **The printed page, not the app.** Page one of a filled folder rendered as paper on the warm ground: heavy black EMERGENCY box, "Your first ten minutes" beneath with monospaced WiFi password, running header "Ms. Rivera · Rm 12 · Maple Elementary · Tue Sep 8 · 2 pages in this packet." Caption: **"Fill it in once. Print it on the morning you can't get out of bed."** — every competitor leads with a UI; leading with the artifact is the whole positioning.
2. **The sick-morning path, dark mode.** The "Today" view: date, "The plan, hour by hour" partly typed, "If you run out of material", emergency block, primary button reading **"Print / Save as PDF · 2 pages"**. Caption: **"Sick morning: change the date, type today, print. Two minutes."**
3. **The first ten minutes, close up.** Tight crop of the printed sheet — fire route, lockdown, "Maya R: peanut allergy — EpiPen in the nurse's office" — and the first-ten-minutes grid, WiFi password monospaced. Caption: **"Your sub stops hunting for the WiFi password and the fire route."** Also proves the alerts read as urgent in pure B/W on a school copier.
4. **The whole binder.** Several of the nine sections filled, elementary/secondary picker set to Secondary, "Saved on this device" visible. Caption: **"Nine sections. Elementary or secondary. Empty ones never print."**
5. **Share, and the promise.** Share panel with Copy link and Show QR, QR dialog open, warning line legible: *"This link will carry health alerts and student notes inside the web address itself. Send it only to someone you would hand the paper folder to."* Caption: **"Text the whole folder to the office. It never touches a server."**

Caption style: two lines max, deep teal `#107a65` on warm ground `#FEF6EA`, app's serif, top ~18%. No exclamation marks, no emoji, no "You've got this!" — the research is explicit that cheer reads as insulting to this audience.

### Feature graphic — 1024×500
Warm kraft ground `#FEF6EA` edge to edge. **Right 40%:** a single sheet of the printed folder, angled ~6°, bleeding off the right edge — page one, heavy black emergency box unmistakable at thumbnail size. That black rectangle is the point: it is the one shape that survives being scaled to a 320 px card. **Left 45%:** the type, separated by a thin teal rule `#107a65`.

```
Sub Plans
Print the sub folder. Go back to bed.
```
Wordmark in Fraunces ~72 px `#107a65`; tagline in the UI sans ~34 px `#173d33`. Keep every glyph inside a centred 924×400 safe area and the middle ~200 px column free of text (Play stamps a play button there when a promo video is attached). The angled sheet is deliberately the element that clips.

### What's new — 464 characters
```
First release.

Fill in your class once, then print the whole substitute folder on a sick morning. Emergency box and a "first ten minutes" block pinned to page one, live page count on the Print button, a black-and-white preview of the real printed sheets, and a feedback page for your sub. Examples switch between elementary and secondary. Copy the whole folder as a link or a QR code.

Works offline. Free, no ads, no account. Nothing you type leaves your device.
```

**Data Safety:** No data collected, no data shared. Accurate per `privacy.html` — localStorage keys `subplans`, `subplans.band`, `subplans.qrpaper`, no Firebase, no analytics, no outbound request. Privacy URL: `https://<origin>/sub-plans/privacy.html`. Manifest declares `education` + `productivity`. **I could not confirm current Teacher Approved eligibility criteria — treat as unverified, and answer NO to it anyway (§6).**

---

## LISTING 2 — Wedding Seating Chart Maker

**Verified before writing:** on-device claim is **true** — `grep` for `fetch(|firebase|XMLHttpRequest|sendBeacon|gtag` across `app.js`, `store.js`, `index.html`, `sw.js` returns exactly one hit (the service worker caching its own assets). Storage is IndexedDB `sws-seating`; PDFs are generated locally by vendored pdf-lib. **Honesty constraint:** `model.js:58` sets `MAX_PASTE = 1000` and the app says "This app holds 1000 guests per event," so the copy says *up to 1,000 guests per event*, never "unlimited guests." Unlimited *events* is true. Not claimed: Avery-calibrated card stock, changed-since-last-export diffing, QR lookup, bar/dance-floor objects — those are opportunities in the research file, not shipped.

### Title — 27 characters
```
Wedding Seating Chart Maker
```

### Short description — 74 characters
```
Seat every guest, print the cards. No guest cap, no account, no export fee.
```

### Full description — 3,150 characters
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

Made by Sky Wolf Studios.
```

Competitors are described as a pattern, never named — naming rivals in a Play listing is a metadata risk. "Seating chart" appears three times in 3,150 characters, well under any stuffing threshold.

### Keywords (ranked)

| # | Phrase | Covered where |
|---|---|---|
| 1 | wedding seating chart | Title |
| 2 | seating chart maker | Title |
| 3 | seating chart app | Title tokens + body |
| 4 | wedding seating plan | Body / What's new |
| 5 | table plan wedding | Body ("floor plan") |
| 6 | free seating chart | Short desc + body |
| 7 | escort cards / place cards print | Body bullet |
| 8 | wedding guest list seating | Body |
| 9 | seating chart no watermark | Body heading, verbatim |
| 10 | event seating planner | Body (banquets, fundraisers, conferences) |
| 11 | banquet / event table planner | Body list |
| 12 | classroom seating chart | Body list |
| 13 | seating chart offline | Body ("works with no signal") |
| 14 | keep apart seating rules | Body bullet, verbatim |
| 15 | caterer meal count sheet | Body bullet, verbatim |

Deliberately not chased: "seating chart template" (Canva/Etsy own it; intent is a graphic file), "3D floor plan" (not shipped), "AI seating" (auto-arrange is a heuristic in `model.js`, not AI — saying otherwise would be a false claim).

### Screenshot plan — 5 phone shots, 1080×1920
All in the app's plum-on-cream skin (`--canvas #fef6ea`, `--accent-deep #7d549a`), Fraunces caption on a solid cream band across the top ~18%, identical band on all five so they read as one strip when swiped.

1. **The conflict list — this is the install decision.** Seat-people tab of a real 137-guest wedding, violations panel reading **"3 to fix"**: `Table 6 has 11 people for 10 seats.` / `Ruth Okafor declined but still has a seat at Table 4.` / `Ben Alvarez and Dana Reyes should be kept apart but are both at Table 9.` Beneath: **"14 of 137 still unseated."** Caption: **"Change one RSVP. See exactly what broke."** Corner ribbon: **"Free · No guest cap · No account"**. It is the one screen no competitor can screenshot, and it is legible at thumbnail size because it is short sentences, not a floor plan.
2. **The three PDFs, with the output visible.** Print & export tab, three export cards, US Letter–A4 selector, a rendered entrance-display page tilted in from the right showing real table headings in Fraunces. Caption: **"Three PDFs. No watermark, no export fee."**
3. **Tap-to-seat, whole party.** Unseated tray, party header `Alvarez family` with the **"whole party (4)"** chip selected, four guest chips lit, primary button **"Seat 4 here"** against `Table 3 · 4 of 10`. Caption: **"Seat a whole family in two taps."** Direct answer to the category's most-cited regression — per-guest dragging instead of whole parties.
4. **Rules, including the private one.** Rules tab, `Keep together: Ann Alvarez, Ben Alvarez, Cara Alvarez` / `Keep apart: Ruth Okafor, Gerald Okafor` / `Must be at: Nana Wilkes → Table 1`. Caption: **"Keep apart. Never printed. Never uploaded."** The only claim in the listing no cloud competitor can honestly make.
5. **Get your list in, keep your list out.** Guests tab, paste panel open with `Ann Alvarez, Alvarez family, Beef` lines and the **Add them all** button, **Export this event as a file** below, airplane-mode glyph in the status bar. Caption: **"Paste your spreadsheet. Works with no signal."**

### Feature graphic — 1024×500
Full-bleed deep plum ground (`#4A2545`). **Right two-thirds:** a flat top-down floor plan in single-weight cream hairlines — seven round tables and one long head table, no shadows, no gradients, no 3D. One round table filled muted brass (`#B08A4E`) carrying a chip reading `11/10`, with a thin brass line running to a single cream check-row at the plan's edge — the graphic *shows the mechanism*. Lower right: one escort card lifted slightly off the plane in cream with a hairline dashed cut edge. **Left third,** vertically centred, Fraunces in cream:

- Headline: **"Seating that checks itself"**
- Sub-line, ~55% opacity cream: **"Wedding · banquet · classroom"**

All text inside the central 60% width / 70% height; nothing important within 80 px of any edge. No device frames, no store badges, no screenshots-inside-the-graphic, no price or "Free" callout, no star ratings.

### What's new — 407 characters
```
First release.

Build a seating plan for up to 1,000 guests, declare who sits together and who does not, and let the app tell you what breaks each time an RSVP changes. Print three PDFs free and unwatermarked: an entrance display, escort cards with cut lines, and a caterer's sheet with meal counts and dietary flags.

No ads, no account, no subscription. Works offline. Nothing you type leaves your device.
```

**Data Safety:** No data collected, no data shared, no data types. Privacy URL `https://<origin>/seating-chart/privacy.html` (page exists). **The tip-jar question raised in the original draft of this listing is now closed — see §3. Keep the tip paragraph; keep the button. Do not use the word "donation" anywhere.**

---

## LISTING 3 — Home Inventory for Insurance

**Verified before writing:** no network code — nothing is uploaded. Storage is IndexedDB `sws-inventory`. Shipped fields confirmed in `apps/home-inventory/model.js`: `brand`, `model`, `condition`, `quantity`, `serial`, `purchaseDate`, `valueCents`, `replacementCents`, `photo`, `receipt`. Search is real (`app.js:745`), filters are real (`app.js:719-723`: room, no-photo, ≥$500). `navigator.storage.persist()` at `app.js:205-207`. CSV column order read from `model.js:227-236`. **Not claimed:** multiple photos per item (one photo + one receipt), barcode scanning, cloud sync, room prompt-lists — none are shipped. The Encircle sunset date is **MEDIUM confidence** in `design/findings/home-inventory.research.json` (the primary help page returned 403); the III/Know Your Stuff date is solid. **Confirm the Encircle date before publishing, or cut that clause.**

### Title — 28 characters
```
Home Inventory for Insurance
```

### Short description — 76 characters
```
Photograph every room. Print the report your insurer asks for. Free, no cap.
```

### Full description — 3,659 characters
```
Two dates worth writing down. 26 June 2017: the Insurance Information Institute switched off Know Your Stuff, the home inventory app every article recommended. 17 December 2025: Encircle ended its free Home Inventory product, and users were told to export their data before losing access to it.

That is the real risk in this category. Not that you never make the inventory — that you make it, and then the company that holds it changes its mind.

Home Inventory is a room-by-room record of what you own, kept on your phone, exported to files you keep. There is no account, so there is nothing to lose access to. There is no server, so nobody can switch it off. If this app disappeared tomorrow, your backup file would still open in any copy of it, and your PDF and spreadsheet would still be sitting in your own Downloads folder.

CAPTURE, WITHOUT THE CEREMONY

Point, name, next. The room stays selected and the cursor returns to the name field after every save, so a bedroom takes a few minutes rather than an evening. Name is the only field you have to fill in. Brand, model, serial number, condition, quantity, purchase date, original cost and replacement cost can all wait until you are sitting down.

Photos are compressed as you shoot, and the app tells you so before you start: ordinary shots are resized so a whole house does not fill your phone, and a Close-up switch keeps the detail high for serial plates, hallmarks and receipts, where the small print is the entire point. Every item takes a photo and a separate receipt photo.

WHAT COMES OUT OF IT

This is the part other apps put behind the subscription.

• Full report (PDF) — a cover summary, then a page per room with photos and values. The document you hand to an adjuster.
• Items by value (PDF) — highest value first, the exhibit that answers "what was actually in there."
• Spreadsheet (CSV) — Quantity, Description, Brand, Model, Serial, Room, Purchase date, Condition, Original cost, Replacement cost, Photo file, Notes. Those are the columns a carrier's own contents form asks for.
• Spreadsheet and photos (ZIP) — the same rows, plus every photograph, named to match the Photo file column.
• Backup file (.json) — everything, photos included, restorable on any device. The format is boring on purpose.

No watermark, no export limit, no item cap, no upgrade screen. There is no payment surface anywhere in this app.

BUILT LIKE A RECORD, NOT A NOTE APP

Nothing says Saved until the write has finished and been read back. A failed write raises a banner that stays up and counts what is at risk. On your first save the app asks the browser to make its storage persistent, and it shows you how much room is left. Search finds any item instantly; filters pull up one room, everything still missing a photo, or everything above $500. Importing a backup never silently overwrites — a clash offers Keep both or Replace.

Names that a PDF font cannot draw are reported to you before you export, not silently mangled. Spreadsheet cells beginning with = + - or @ are escaped, so opening your CSV cannot run anything.

WHERE YOUR PHOTOGRAPHS GO

Nowhere. The app contains no network code at all. A photo is read from your file picker, resized inside the page and written straight to storage on your device. Nothing is uploaded, which also means there is no cloud backup: exporting is genuinely your job, and the app will keep saying so.

THE HONEST LIMITS

One photo plus one receipt per item, not an album per item. No barcode scanning. No cloud sync between your phone and your laptop — you move a backup file yourself.

Made by Sky Wolf Studios. Free, no ads, no account, no subscription.
```

### Keywords (ranked)

| # | Phrase | Covered where |
|---|---|---|
| 1 | home inventory | Title, body |
| 2 | home inventory for insurance | Title, verbatim |
| 3 | home inventory app free | Short desc + body ("Free, no cap") |
| 4 | insurance claim inventory | Body ("hand to an adjuster") |
| 5 | contents inventory list | Body (CSV columns) |
| 6 | personal property inventory | Body |
| 7 | household inventory spreadsheet | Body ("Spreadsheet (CSV)") |
| 8 | home inventory PDF report | Body bullet |
| 9 | renters insurance inventory | Gap — add to screenshot caption |
| 10 | photograph belongings insurance | Body ("Photograph every room") |
| 11 | home inventory no subscription | Body ("no upgrade screen") |
| 12 | offline home inventory | Body ("no network code at all") |
| 13 | serial number tracker | Body (fields list) |
| 14 | replacement cost inventory | Body (fields + CSV) |
| 15 | fire flood documentation | Gap — one clause in screenshot 5 caption |

Deliberately not chased: "asset management", "inventory management" (B2B intent, wrong audience, and Sortly owns it), "AI home scan" (not shipped).

### Screenshot plan — 5 phone shots, 1080×1920
*Already generated at `design/out/play/home-inventory/screenshots/` as `01-capture`, `02-items`, `03-rooms`, `04-export`, `05-private` — verified 1080×1920, PNG colour type 2 (no alpha). Re-shoot with these captions and populated state before upload; empty screens read as low-effort to a reviewer assessing minimum functionality.*

1. **Capture, mid-flow.** The add-item screen in a real living room: room chip set to *Living room*, name field holding "Sony 65in TV", the photo already taken and the Close-up switch visible. Caption: **"Point, name, next. A bedroom takes minutes."**
2. **The item list, populated and filtered.** 60+ items, search box with a query typed, the room chips row visible, the *Missing a photo* filter selected, and the running line **"Showing 9 of 63 items · $4,180 (a filter or search is hiding 54)"**. Caption: **"Search 600 items. Find the nine with no photo."**
3. **A close-up that reads.** Split frame: an ordinary wide shot on the left, a Close-up capture of a serial plate on the right with the numbers legible. Caption: **"Close-up keeps the serial plate readable."** This is the direct answer to the free government app's own 1-star review — "the information on the product labels is unreadable."
4. **The exports.** The export panel with all five outputs listed, and a rendered PDF report page tilted in from the right showing a room page with its photo grid and values. Caption: **"A PDF for the adjuster. A CSV for the claim form."**
5. **The promise, with the storage line.** The privacy/trust panel showing persistent storage granted and remaining quota, plus the export nag. Caption: **"No account. No upload. Nothing to switch off."** Corner ribbon: **"Fire, flood, theft — the record is already yours"**.

Caption style matches the app's near-neutral archival skin: the caption band is the only tinted surface, because the content is colour photographs of the user's possessions and a strongly tinted surround shifts every thumbnail through simultaneous contrast — which matters when the record exists to establish that the sofa was oatmeal and not grey.

### Feature graphic — 1024×500
Near-neutral archival board ground (the de-honeyed canvas, not the honeyed cream). **Right half:** a flat overhead of three things on a desk — a printed PDF report page showing a room grid, a phone lying beside it displaying one item card, and a receipt. Photographic or high-fidelity flat vector, no drop shadows, no 3D device mockups, no happy-house illustration, no shield-and-padlock. The artifact is the hero; the app's own chrome is not. **Left half,** Fraunces in near-ink green:

- Headline: **"Proof, before you need it"**
- Sub-line: **"Room by room · PDF and spreadsheet · Nothing uploaded"**

One reserved amber accent (~OKLCH L 0.66 / C 0.14 / H 72) used exactly once — a small "3 items undocumented" chip on the phone screen. Two colours total: ink for identity, amber for one piece of state. Text inside the central 60%/70%; nothing important within 80 px of any edge; middle ~200 px column clear of text.

### What's new — 437 characters
```
First release.

Record what you own room by room, with photos, serial numbers, condition, quantity and both original and replacement cost. Export a full PDF report, an items-by-value PDF, a CSV with the columns a carrier's contents form asks for, a ZIP of the spreadsheet plus every photo, and a complete backup file.

Free, no item cap, no watermark, no account, no subscription. Works offline. Your photographs never leave your device.
```

**Data Safety:** No data collected, no data shared. Photo/file access is access, not collection — nothing is transmitted. Privacy URL `https://<origin>/home-inventory/privacy.html`. Categories: `utilities`, `lifestyle` per the manifest.

---

## 8. What the owner must hand-make

### A script already does this — just run it and deploy

| Asset | Command / path | State |
|---|---|---|
| 192 / 512 / maskable-512 app icons, 23 apps | `node design/play.mjs --icons` → `apps/<slug>/icon-*.png` | **Done locally, NOT deployed** (live 404s) |
| Play Console listing icon, 512×512 opaque | `design/out/play/<slug>/play-icon-512.png` | **All 23 done.** Verified 512×512, PNG colour type 2 (no alpha). *Note: `design/play.mjs:155` says Play rejects a listing icon with transparency — that comment is over-cautious. The spec is 32-bit PNG **with** alpha, max 1024 KB. Opaque is safe and looks better; keep it.* |
| Upgraded `manifest.webmanifest`, 23 apps | `node design/play.mjs` | Done locally, **not deployed** |
| `twa-manifest.json`, 23 apps | `design/out/play/<slug>/twa-manifest.json` | Done. `minSdkVersion: 21`, no targetSdk — correct; Bubblewrap 1.25.0 injects target 36 |
| `assetlinks.json`, 23 statements, one origin | `apps/.well-known/assetlinks.json` | Structure done; **all 23 fingerprints are the literal string `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`** |
| Feature graphics, 1024×500 | `design/out/play/<slug>/feature-graphic-1024x500.png` | **All 23 rendered.** Verified 1024×500, no alpha, compliant |
| Privacy pages, all 23 | `node design/privacy.mjs` → `apps/<slug>/privacy.html` | **All 23 written locally**, honest two-branch template driven by `design/privacy-facts.json`. Only `sub-plans`, `pdf-tools`, `specials-planner` are live; the other 20 return 404 until you deploy |
| In-app privacy link | already in all 23 `index.html` | 23/23 verified |
| Screenshots, 1080×1920 | `node design/shots.mjs <slug>` | **Only 4 apps have scenes** in `design/scenes.mjs`: home-inventory, sub-plans, packing-list, qr-maker |
| Readiness gate | `node design/play.mjs --check` | Currently reports 1 gap (the placeholder fingerprints) |

### You must author this — code, but nobody has written it

1. **`design/scenes.mjs` entry for seating-chart** — ~60 lines describing 5 panels and the app state each needs. **2–3 h.** Blocks app #2 entirely. Then repeat per app as you go, ~1–2 h each.
2. **Health disclaimer edits.** Widen `apps/pill-schedule/index.html:1611` to: *"A memory aid, not medical advice. This app is not a medical device and does not diagnose, treat, cure, or prevent any medical condition — confirm doses and times with the pharmacist or prescriber."* Add the same phrase to `caregiver-log`'s log header **and inside the dose dialog** (`apps/caregiver-log/index.html:1886-1889`) — that dialog is the highest-risk surface in the portfolio because it is the one place the app appears to give clinical direction. **1 h.**
3. **The cloud four, before #20 ships.** Account-deletion flow in `data.js` + a callable Cloud Function for recursive subcollection deletes + a public `apps/delete-account/` page; a one-time terms interstitial before a participant's first post; a Report control on every entry row and claim chip writing to a top-level `reports` collection; owner-side Block appending to `boards/{id}/blocked` with a rules clause. Enable Firebase App Check (Play Integrity for the TWA, reCAPTCHA Enterprise for the browser) and raise new share codes from 6 to 8 characters. **3–5 days.** Do not add 1:1 messaging — in-app blocking only becomes mandatory if you do.
4. **Listing copy for apps #4 onward.** ~2–3 h each. Do not reuse a skeleton with the noun swapped — that is the exact templated pattern that compounds the repetitive-content exposure.

### You must draw this — a human, or a paid designer

**Only one category of asset genuinely requires hand art, and it is the one that decides the repetitive-content read.**

**Bespoke feature graphics for apps #1, #2 and #3** (concepts specified in §7 above). The generated set is one invariant layout across 23 files — `design/play.mjs:266` states it outright: *"the LAYOUT is invariant — identical grid, identical icon size and position, identical type hierarchy, identical studio line."* That is exactly the machine-generated signal a human reviewer sees when three listings from one developer arrive in six weeks. Replace them for the leads; keep the generated ones for the aggregate app and any later listing.

**Exact specs — these are the requirements, verified:**

| Asset | Spec |
|---|---|
| Feature graphic | **1024×500 px**, JPEG or **24-bit PNG, NO alpha**. Required on every listing — you cannot publish without one. Google publishes no max file size. No price/promo text, no store badges, no star ratings, no device frames. Keep all text in the central 60% width / 70% height; leave the middle ~200 px column clear. |
| Listing icon | **512×512 px, 32-bit PNG with alpha allowed, max 1024 KB.** Do not pre-bake rounded corners or a drop shadow — Google applies its own. |
| Phone screenshots | **Min 2, max 8**, JPEG or 24-bit PNG, **no alpha**, min dimension 320 px, max 3840 px, **aspect ratio capped at 2:1**. 1080×2400 is 2.22:1 and **will be rejected**. Use **1080×1920 (1.78:1)** — which is exactly what `design/shots.mjs` composes. Ship **4–8 showing populated state**, not 2 and not empty screens. |
| Tablet screenshots | **Optional.** The official page says you "can add a minimum of 4" — permissive "can", not "must". **I could not find the 2026 "tablet screenshots are now mandatory" claim on any Google-owned page; treat blog assertions of it as unconfirmed.** There is a large-screen ranking/eligibility effect, not a publish blocker. Ship phone-only first. Note the asymmetry: phone minimum 2, tablet minimum **4 if you supply any at all**. |
| Maskable web icon | Critical content inside a circle of radius **40% of the icon width** (= central 80% diameter). `design/play.mjs` uses `MASKABLE_SCALE = 0.72`, which puts every glyph inside it. The scaled tile's own corners reach ~0.51 of the width from centre and fall outside the safe circle — **harmless only because the backdrop is painted the identical `accentDeep` colour. Re-check if the tile colour ever diverges from the backdrop.** |
| Android adaptive icon | 108 dp canvas, 72 dp visible, **66 dp guaranteed-never-clipped**. Design to 66 dp; logo at least 48 dp. This is a *different* geometry from the web maskable rule (66/108 = 61% vs 80%), so an icon that passes maskable.app can still get shaved by an aggressive OEM mask. Bubblewrap derives it from `maskableIconUrl`, so the 512 maskable PNG is what drives it. |
| Store text | Title ≤30, short description ≤80, full description ≤4,000, release notes ≤500 per language. No emojis, no emoticons, no repeated special characters, no ALL CAPS outside a brand name, no "#1"/"Best of Play", no price or promo text in graphics. |

**One art-direction rule that overrides aesthetics, for `secret-santa`, `baby-log`, `sitter-sheet` and `team-parent`:** Google will override an "Ages 18 and over" declaration if the listing "contains marketing elements that suggest otherwise (such as youthful animation or young characters)." Build every graphic around the **adult operator** — an adult hand, a printed sheet, a phone in a kitchen. No cartoon mascots, no crayon lettering, no 🎄🎁🎅 in the icon or the feature graphic (keep them inside the app, where they already are). Open every short description with the adult noun: *"For the parent who…"*, *"For the coach who…"*, *"For the teacher who…"*