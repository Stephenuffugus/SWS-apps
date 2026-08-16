# SWS-apps

The app portfolio of **Sky Wolf Studios** (SWS Strategic Media LLC).
Games live in the **SWS Arcade**; these are the apps. Free, ad-free utilities
with a tip jar — the brand promise across every app here:

> Nothing leaves your device. No account. No ads. No subscription.

## Design

All 23 apps share one design system: identical geometry, spacing, components,
focus behaviour and print rules — and a palette, display face and background
texture that are different for every app. One studio, twenty-three products.

- [`design/DESIGN-SYSTEM.md`](design/DESIGN-SYSTEM.md) — the system: tokens,
  component contract, the five identity axes, and the rules for an app layer
- [`design/STATUS.md`](design/STATUS.md) — what the overhaul changed, what is
  still outstanding
- [`design/findings/`](design/findings/) — per-app competitor research, real
  user complaints, and the UI audit that drove the work

Colours are specified in OKLCH and compiled to hex, with every text,
control-boundary, focus and semantic colour solved against a WCAG target rather
than chosen by eye. `npm run design:check` fails the build if any palette
would ship unreadable.

```bash
npm run design:apply     # rebuild tokens, splice the base into all 23 apps
npm run design:check     # contrast audit (non-zero exit on failure)
npm run design:preview   # screenshot all 23 skins, light and dark
npm test                 # every app's test suite
```

## Google Play

Every app ships as a Trusted Web Activity. Everything Play needs that a machine
can derive is derived, from the same source of truth the design system uses —
`skins.mjs` for identity, `palette.json` for the solved colours, each app's own
`icon.svg`. Nothing about a listing is assembled by hand twice.

```bash
npm run play             # icons, manifests, twa-manifests, assetlinks, feature graphics
npm run play:check       # non-zero exit on any remaining Play gap
npm run play:privacy     # regenerate 23 privacy pages + the in-app link Play requires
npm run play:shots <app> # Play screenshots, composed at 1080x1920 (exactly 9:16)
node design/shots.mjs --list   # which apps still need a screenshot scene
```

- [`design/play.mjs`](design/play.mjs) — the packaging layer. Read its header for
  the two things that are load-bearing and easy to get wrong: a maskable icon is
  not the same drawing as the app icon, and Digital Asset Links only works if
  the file is actually served.
- [`design/privacy.mjs`](design/privacy.mjs) — one template, two honest branches,
  driven by [`design/privacy-facts.json`](design/privacy-facts.json). An app whose
  facts say data leaves the device can never inherit the on-device paragraph.
- [`design/scenes.mjs`](design/scenes.mjs) — one screenshot scene per app. A
  screenshot of an empty list is worth nothing, so each scene drives the real UI
  into a used state before the capture.

**Two things gate the launch, and neither is code.** Register the Play account as
an *organisation* under SWS Strategic Media LLC — verification takes 2–4 weeks and
it removes the 12-testers/14-days gate from all 23 apps. And read Play's
repetitive-content policy before submitting the second app: 23 small single-purpose
utilities from one developer is the fact pattern it describes, so ship one at a
time, roughly one a week, leading with the apps that genuinely differ.

## Product docs

- [`00-portfolio-brief.md`](00-portfolio-brief.md) — the nine products, four engines, sequencing, open brand decisions
- [`01-shared-link-coordination.md`](01-shared-link-coordination.md) — Engine 1: signup sheets, team parent, caregiver log
- [`02-local-data-to-pdf.md`](02-local-data-to-pdf.md) — Engine 2: seating chart, home inventory, print-and-play
- [`04-bill-splitter.md`](04-bill-splitter.md) — standalone bill splitter
- [`05-marketing-kit.md`](05-marketing-kit.md) — positioning, per-app search terms + blurbs, seasonal calendar, launch checklist
- [`06-app-ideas.md`](06-app-ideas.md) — ranked idea backlog (top 12, next build group, bench, rejects) from the overnight brainstorm
- Engine 3 (multiplayer games) lives with the game designer in the Lucid Winds repo.

## Apps

| App | Status | Where |
|---|---|---|
| Bill splitter | ✅ built — tests passing | [`apps/bill-splitter/`](apps/bill-splitter/) |
| Signup sheets (Engine 1A) | ✅ live on Firebase — tip jar wired | [`apps/signup-sheets/`](apps/signup-sheets/) |
| Team parent (Engine 1B) | 🔨 built — tip jar wired, needs testing | [`apps/team-parent/`](apps/team-parent/) |
| Caregiver log (Engine 1C) | 🔨 built — tip jar wired, needs testing | [`apps/caregiver-log/`](apps/caregiver-log/) |
| Seating chart (Engine 2A) | 🔨 built — tip jar wired, needs testing | [`apps/seating-chart/`](apps/seating-chart/) |
| Home inventory (Engine 2B) | 🔨 built — tip jar wired, needs testing | [`apps/home-inventory/`](apps/home-inventory/) |
| Grocery list (Engine 1D) | 🔨 built — rules live, tip jar wired, needs testing | [`apps/grocery-list/`](apps/grocery-list/) |
| QR maker | 🔨 built — tip jar wired | [`apps/qr-maker/`](apps/qr-maker/) |
| Signature maker | 🔨 built — tip jar wired | [`apps/signature-maker/`](apps/signature-maker/) |
| Wheel picker | 🔨 built — tip jar wired | [`apps/wheel-picker/`](apps/wheel-picker/) |
| Sitter sheet | 🔨 built — tip jar wired | [`apps/sitter-sheet/`](apps/sitter-sheet/) |
| Pill schedule | 🔨 built — tip jar wired | [`apps/pill-schedule/`](apps/pill-schedule/) |
| Packing list | 🔨 built — tip jar wired | [`apps/packing-list/`](apps/packing-list/) |
| Wedding timeline | 🔨 built — tip jar wired | [`apps/wedding-timeline/`](apps/wedding-timeline/) |
| Bracket maker | 🔨 built — tip jar wired | [`apps/bracket-maker/`](apps/bracket-maker/) |
| Secret Santa | 🔨 built — tip jar wired | [`apps/secret-santa/`](apps/secret-santa/) |
| Scan to PDF | 🔨 built — tip jar wired | [`apps/scan-to-pdf/`](apps/scan-to-pdf/) |
| PDF tools | 🔨 built — tip jar wired | [`apps/pdf-tools/`](apps/pdf-tools/) |
| Image compressor | 🔨 built — tip jar wired | [`apps/image-compressor/`](apps/image-compressor/) |
| Baby log | 🔨 built — tip jar wired | [`apps/baby-log/`](apps/baby-log/) |
| Moving boxes | 🔨 built — tip jar wired | [`apps/moving-boxes/`](apps/moving-boxes/) |
| Specials Planner | 🔨 built — 52 tests passing, thumbnail filed, tip jar wired, WCAG AA pass | [`apps/specials-planner/`](apps/specials-planner/) |
| Sub Plans | 🔨 built — 23 tests passing, tip jar + thumbnail pending | [`apps/sub-plans/`](apps/sub-plans/) |
| Print-and-play (Engine 2C) | gated behind the manual one-game experiment | — |

## Workflow rule

One deployed, **used-by-a-real-person** product before starting the next skin of
an engine. Finishing the first skin of each engine is what makes the second and
third cheap.
