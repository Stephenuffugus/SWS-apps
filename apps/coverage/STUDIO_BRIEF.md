# Studio brief: Coverage (DSCR deal screener for Ryan)

**To:** Director + devs, Sky Walk Studio / SWS-apps
**From:** the Coverage build
**Status:** Phases 1-5 and 7 built, tested, and ready to wire in. Runs today on sensible defaults.

## What this is and why it matters
Coverage is a phone-first DSCR loan-qualification screener for Ryan, a loan officer at
Diamond Edge Financial who works investor deals almost entirely from his phone. On a
sidewalk, in about thirty seconds, it answers two questions for a property: does this
qualify for a DSCR loan at his threshold, and if not, what down payment would make it. It
also shows the true DSCR (with vacancy, management, and maintenance) next to the lender's
qualifying DSCR, so the gap is visible.

The money thesis: Ryan hunts properties for free to win the loan origination. Coverage turns
that unpaid hunting into a financing-attached advantage, and Deal Drop (below) recycles every
screened deal into a weekly branded digest he sends to his investor list. Every inbound
borrower is a commission. Ryan is user zero and field-tester, not the customer. The long game
is a white-label version, one config per operator.

## Where it is and how to confirm it works
The folder `apps/coverage/` contains everything:
- `index.html`: the entire app. One file, no build step, no dependencies, no network calls.
- `test/harness.mjs`: headless math tests. Run `node test/harness.mjs`; expect `11 passed, 0 failed`.
- `DEAL-SCREENER-PLAN.md`: the authoritative math, config schema, phases, and open questions.
- `README.md`: the short version of this brief, plus wire-in notes.
- `HANDOFF.md`: the original product handoff.

To see it: open `index.html` in any browser. Edit inputs to watch it recalc live. Open
"Operator & thresholds" to set Ryan's real numbers.

## What is built
- **Screener**: live single-screen recalc: qualifying DSCR, payment, cap rate, monthly cash
  flow after debt, and true DSCR. Coverage bar where color means pass/fail only.
- **Reverse solve**: "qualifies at 1.15 with $X down, Y%", plus whether the DSCR threshold or
  the LTV cap is the binding constraint.
- **Saved deals**: IndexedDB store; save the current screen, reload, delete, and compare 2-3
  side by side.
- **Share sheet**: a branded single-deal one-pager rendered to PNG, with a live preview, then
  the phone's native share or a download fallback.
- **Deal Drop**: pick 1-5 saved deals and generate one tall branded digest ("deals that cover
  this week") as a PNG for text/iMessage and a PDF for email. Addresses withheld; NMLS in the
  footer. The PDF is generated from scratch (no library) so it stays inside a strict CSP.

## What is not built
- **ADU / value-add mode**: deferred until Ryan confirms his buyers are ADU-focused. Do not
  build it speculatively; it carries pro-forma-labeling and partial-reassessment rules that
  need his input first.

## How to integrate (two clean options)
1. **Embed as-is.** Drop `index.html` at a route (for example `/coverage`) or in an iframe.
   Zero coupling to the stack. This is the fastest path to a live test.
2. **Lift the engine.** The `<script id="deal-math">` block exports `DealMath` (via
   `module.exports` and `globalThis.DealMath`). It is DOM-free, so you can import the same
   `evaluate()` into React or whatever the site uses and build your own UI on top. The test
   harness guarantees any caller gets the spec's numbers.

## Config, not code (important)
Nothing regulatory is hardcoded. Ryan's DSCR threshold (default 1.15), LTV cap (75%), the
California tax rate (1.20% of price on sale-price reassessment), and the vacancy/management/
maintenance assumptions are all editable inputs in the "Operator & thresholds" panel. White-
labeling to another operator is a new set of config values, not a code change. Treat Ryan as an
instance of the config, never as the defaults.

## Hard guardrails (do not cross, this is legal architecture, not preference)
- **Local only.** No accounts, no server, no network after load. Borrower financials on a server
  create GLBA and CCPA exposure. Do not add auth or a database to this project.
- **No borrower PII.** It models properties, not people. No names, SSNs, or account numbers.
- **NMLS gate.** All share and Deal Drop output stays locked until an NMLS ID is entered. This is
  structural, not a toggle.
- **Disclaimer and NMLS ride on every shared asset.** Already implemented; keep them.
- **Never build:** contract or legal-document generation (unauthorized practice of law),
  auto-dialing or AI voice calling (TCPA statutory damages), or MLS scraping (IDX licensing).
  All property inputs are typed or pasted.
- **Never hardcode** thresholds, tax rates, ADU rules, or transfer-tax triggers as if they were
  law. They are editable inputs with verify-notes.

## What we still need from Ryan (these set inputs, they do not block you)
His real minimum DSCR ratio, LTV caps by program, whether interest-only is available, whether his
buyers are cash-flow or ADU/value-add, 1-4 vs 5+ units, and his investor list size and channel
(text vs email). Until then the defaults above stand, and every one of these is a field, not a
rebuild.

## The one thing that needs a real device
Web Share behaves differently across iOS Safari, Android Chrome, and desktop. The share sheet and
the Deal Drop PNG and PDF should get a real-phone pass to confirm the handoff into Messages and
email feels right. The download fallback covers anywhere native share is unsupported. This is the
main thing your test session is for.

## Suggested first pass (a definition of done for the test)
On a real phone: screen a property, save it, screen and save a second, open Saved and compare the
two, set an NMLS number, share a single one-pager into Messages, then select both and run a Deal
Drop, saving the PNG and the PDF. If that round trip feels good, it is ready for Ryan's hands.
