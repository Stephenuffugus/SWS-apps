# Coverage, DSCR deal screener (for the studio lead)

Phone-first DSCR loan-qualification screener for Ryan (loan officer, Diamond Edge
Financial). Answers "does this property qualify, and what down payment would make it"
in ~30 seconds on a phone. Single file, no build step.

## Run / test it right now
```bash
node test/harness.mjs        # 11 passed, 0 failed, the math is verified
open index.html           # or just drag it into a browser
```
`index.html` is fully self-contained (inline CSS/JS, no dependencies, no network
calls). It works from `file://`, GitHub Pages, or Firebase Hosting as-is.

## What's built (Phases 1-5, ready for fine-tuning)
- **Phase 1**: math core (`<script id="deal-math">`), pure and DOM-free, verified by
  the headless harness against 10 golden scenarios + a round-trip invariant.
- **Phase 2**: single live-recalc screen: qualifying DSCR + payment pinned big,
  tabular figures, coverage bar (green = covers, red = short). Now also shows cap rate
  and monthly cash flow after debt.
- **Phase 3**: reverse solve: "qualifies at 1.15 with $X down, Y%", plus which
  constraint binds (DSCR vs the LTV cap).
- **Phase 4**: saved deals: bottom "Save deal" writes to IndexedDB; "Saved" opens the
  list (tap to load, delete, or check 2-3 to compare side-by-side). Local only, no server.
- **Phase 5**: share sheet: "Share" renders a branded one-pager (canvas → PNG) with a
  live preview, then Web Share API or a download fallback. **Locked until an NMLS # is
  entered**, tapping Share with no NMLS routes the user to the field. Address is withheld
  ("address on request") so every lead is a text back to the operator.

- **Phase 7**: Deal Drop: in *Saved*, check 1-5 deals → **Deal Drop** builds one tall
  branded digest ("deals that cover this week"). Save it as a **PNG** for text/iMessage or a
  **PDF** for email (the PDF is generated from scratch, no library). NMLS-gated; addresses
  withheld. Distribution is manual, Ryan sends it himself; the tool stores/sends nothing.

Not built yet: ADU mode (Phase 6, waits on Ryan). See `DEAL-SCREENER-PLAN.md §4`.

## Try the full flow
Screen a property → **Save deal** → screen another → **Save deal** → **Saved** → check
both → **Compare**. Set an NMLS # in *Operator & thresholds*, then **Share** for a single
one-pager, or check up to 5 and hit **Deal Drop** for the weekly digest (PNG + PDF).
Everything persists locally (IndexedDB + localStorage); nothing leaves the device.

## Wiring it into the website, two clean options
1. **Embed as-is:** drop `index.html` at a route (e.g. `/coverage`) or in an
   `<iframe>`. Zero coupling to your stack.
2. **Lift the engine:** the `<script id="deal-math">` block exports `DealMath`
   (`module.exports` + `globalThis.DealMath`). It's DOM-free, so you can import the
   same function into React/Next/whatever and build your own UI on top. The harness
   proves whatever calls it gets the spec's numbers.

## Config, not code (important)
Nothing regulatory is hardcoded. Ryan's threshold (1.15), LTV cap (75%), CA tax rate
(1.20%), and opex assumptions are **editable inputs** in the on-screen "Operator &
thresholds" panel. White-labeling to another loan officer = new config values, no code
change. Ryan is an instance of the config, never the defaults. See `DEAL-SCREENER-PLAN.md §3`.

## Two things still needed from Ryan (they set inputs, they don't block you)
- His actual DSCR **minimum ratio** and **LTV caps** by program (defaults 1.15 / 75% used).
- Whether his buyers are cash-flow or ADU/value-add (gates Phase 6).

Full open-question list + the defaults taken: `DEAL-SCREENER-PLAN.md §7`.

## Hard guardrails (do not cross, legal architecture, not preference)
- Local only. No accounts, no server, no borrower PII. (GLBA/CCPA.)
- Share/digest output stays **locked until an NMLS ID is entered**.
- Never add: contract/legal-doc generation (UPL), auto-dial/AI voice (TCPA), MLS scraping (IDX).

Details: `DEAL-SCREENER-PLAN.md §5` and `HANDOFF.md §5`.
