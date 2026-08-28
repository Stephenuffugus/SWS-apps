# Diamond Rules, integration night, 2026-08-28

Stephen dropped `Diamond rules-20260828T011748Z-1-001.zip` (prototype v2 + HANDOFF-16.md, authored in a claude.ai session) and asked for a working prototype in the studio tonight. Motivation: the girls on his 8U softball team still don't know where the force out happens or the pop fly rules, so the app teaches them by playing.

## What shipped (diamond-v1, apps/diamond-rules/)

Prototype v2 integrated whole (field, camera, rules engine, count/play/fly modes untouched in spirit), plus:

1. **Take the Field mode** (4th tab, the cap): roadmap item 1 from the handoff. Answer type is the fielders themselves; nine scenarios teach the 8U fundamentals that are safe in every coaching system: pitcher covers first when 1B fields, partners cover second (ball right side = SS takes the bag, left side = 2B), right fielder backs up every infield throw to first, pitcher backs up home on outfield throws, catcher guards the plate, outfielders back each other up, everybody has a job on every play. Wrong tap lights the right fielder green.
2. **Smart ball**: "Hold the ball" is now sometimes the correct answer (handoff known-gap 1). SMART_BANK mixes ~1 in 5 into The Play: dead-ball situations where throwing it around gives away bases.
3. **Softball is the default sport** (it is his team), persisted with sound + best streak in localStorage key `diamond1`.
4. **PWA**: manifest.webmanifest, sw.js (fleet pattern: page network-first, assets cache-first, CACHE `diamond-v1` pinned to the build tag by the smoke test), icons 192/512/maskable + apple-touch, fonts self-hosted (Anton + Nunito variable, latin woff2) so offline is total and no request leaves the origin except the feedback send.
5. **Fleet seams**: settings card carries the footer (Sky Wolf Studio link, Feedback, tip slot, build tag). `TIP_URL` empty = hidden, awaiting Stephen's Stripe link. `FEEDBACK_WEBHOOK` wired to the same Discord webhook as Fretwork; reports arrive prefixed **Diamond Rules feedback**.
6. **Copy sweep**: zero em/en dashes anywhere (the v2 prototype was full of them); the smoke test asserts this against the live DOM and all three scenario banks.
7. **Ground generator**: runner pool weighted toward the teachable states ([1], [1,2], loaded), and no scenario repeats back to back in any mode.
8. **Hub**: new Sports section with the card ("In testing" tag), counts bumped to 31, sitemap entry added. Also added Fretwork AND Diamond Rules to design/hub.mjs CATALOGUE + SELF_STYLED so a hub regeneration can never drop the hand-integrated cards (Fretwork was exposed to that before tonight).

## Bug found and fixed during integration

The v2 prototype set `transform-box:fill-box; transform-origin:center` on `.base rect` while the rect also carried the SVG attribute `transform="rotate(45 x y)"`. With transform-box in play, the attribute rotate resolves against the fill box instead of the viewBox, so every base square rendered far off its spot whenever the pulse animation was NOT running (count mode, choice scenarios, the new pos mode). Fixed by moving the rotation to a wrapper `<g>`; the pulse scale and the rotation no longer share an element. Lesson: screenshots caught it; the DOM dump (`getBoundingClientRect` widths of 300 to 439px on 36-unit squares) diagnosed it.

## Testing

- `apps/diamond-rules/test/smoke.browser.mjs` (design/harness.mjs, phone width): force-table oracle over all 8 runner sets, 300 generated ground balls checked for lead-force + 2-out alternative, softball 4-strike count driven through the UI including foul-can't-be-last-strike, one correct and one wrong answer in each scenario mode, sport switch survives reload, feedback box opens, no console errors, no dashes, sw CACHE = build tag. All green.
- Playwright screenshots verified by eye: count, play, verdict (smart ball + confetti), take-the-field, settings.

## Awaiting Stephen

- ~~Thumbnail art~~ LANDED same night: diamondrules.png (1254x1254, filed at repo root, original is sacred) cut into stripe-thumbnail, og-image, thumb-256 (hub at ?v=2) and the full icon set; diamond-v2.
- Stripe payment link for `TIP_URL` (bump sw CACHE when wiring).
- League answers for future tiers: does the league steal? no-leadoff rule? That gates roadmap items 4 and 5.

## Next build candidates (handoff roadmap)

At-bat mode (one continuous half-inning: count into play into where's-the-play, outs carry over) is the big one. Then difficulty tiers, badges per rule chip, install prompt affordance (`swsInstall`) so the hub card gets the install button.
