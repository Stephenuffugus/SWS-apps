# HANDOFF, COVERAGE + DEAL DROP

**Project:** Phone-first DSCR loan qualification screener for investor-focused loan officers, plus a buyer-distribution layer.
**Studio:** SWS Strategic Media LLC / Sky Walk Studio
**User zero:** Ryan, loan officer, Diamond Edge Financial. Real estate license. Investor buyers only, no owner-occupy. Markets: Sherman Oaks, Burbank, Thousand Oaks, LA; some Sacramento. Works almost entirely from his phone. Pays for Salesforce, uses nothing else.
**Session origin:** Strategy developed in Claude chat with Stephen; this handoff moves the build into the Codespace. `DEAL-SCREENER-PLAN.md` should sit next to this file, it is the authoritative math and product spec for the screener. Read it before writing code.

---

## 1. The concept, in order of why it matters

1. Ryan's paid product is the loan. He hunts properties for free to win the origination. The screener converts that unpaid hunting into an advantage: he answers "does this qualify for a DSCR loan and what's the minimum down" in thirty seconds, on a sidewalk, with the financing attached.
2. **Deal Drop** is the money layer, added after the plan doc was written, it is NOT in DEAL-SCREENER-PLAN.md and this section is its spec-of-record for now. Every week Ryan picks his best saved deals and the tool assembles a branded digest, "deals that cover this week", that he sends to his whole investor list at once. Today a found deal gets shown to one buyer and dies. Deal Drop recycles every screened deal into marketing that pulls inbound borrowers, and every borrower is a commission.
3. Studio angle: the sheets are self-advertising. Every investor and competing LO who receives one sees the tool. Long-term play is a white-label, per-operator version (branding, NMLS, thresholds all configuration, never hardcoded to Ryan). Ryan is user zero and field-tester, not the customer.
4. Traction test before any white-label work: 30 days of real Deal Drops, count inbound investor contacts. Real number → product. No number → cheap lesson.

## 2. Current state

- [x] Product/math plan written: `DEAL-SCREENER-PLAN.md` (v1)
- [ ] Fable review of the plan: 8 decision points collected in its §10. **Do not silently resolve these; if building before review, take the plan's stated defaults and log the choice here.**
- [ ] Ryan's answers pending on: cash-flow vs ADU buyers; DSCR programs + minimum ratio; current calculation method; interest-only availability; LTV caps; 1-4 vs 5+ units; investor list size and channel (text vs email)
- [ ] No code exists yet. Phase 1 is the starting line.

## 3. Build order

Phases 1-6 are specified in DEAL-SCREENER-PLAN.md §5. Recap plus the new phase:

1. **Math core + headless harness.** Pure `DealMath.evaluate(inputs)`, zero DOM. Node harness extracts the `deal-math` script block from the HTML by id, evals in a VM, runs the 10 golden scenarios from plan §6. Freeze hand-computed expected values. Phase 1 is done when all pass, including edge cases (i=0, all-cash, cannot-qualify, LTV-vs-DSCR binding, amortization round-trip).
2. **Single screen, live recalc.** Qualifying DSCR + payment pinned in large type. Tabular numerals everywhere (`font-variant-numeric: tabular-nums`). System fonts only.
3. **Reverse solve.** "Qualifies at 1.15 with $187,000 down, 27%." Closed-form inversion per plan §3.6.
4. **Saved deals.** IndexedDB store `deals`. Side-by-side comparison of 2-3.
5. **Share sheet.** Branded single-deal one-pager → canvas → PNG → Web Share API, download fallback. NMLS gate (see §5 below).
6. **ADU mode.** Gated on Ryan confirming his buyers are ADU/value-add. Plan §3.7, mind the two danger rules (pro-forma labeling; partial reassessment).
7. **DEAL DROP (new).** See §4.

Ship 1-3, put it in Ryan's hands, then continue. Do not build 4-7 before he has touched 1-3.

## 4. Deal Drop spec (v1)

- Ryan multi-selects saved deals (cap at 5) → tool renders one tall digest image (canvas → PNG) sized for MMS/iMessage, plus a PDF variant for email. No server, no send infrastructure, **distribution is manual in v1.** He texts/emails it himself from his own contacts or Salesforce. This is deliberate: storing his investor contact list is a privacy/scope expansion we don't take until the concept proves out.
- Each deal card: optional photo, neighborhood (not full address), headline metrics, qualifying DSCR vs his threshold, minimum down at target ratio, est. monthly cash flow, cap rate, and a financing line: "Financing available, Ryan [last name], NMLS #___, Diamond Edge Financial."
- **Address withheld by default.** "Text me for the address" is the interest-capture hook AND keeps Ryan in the loop on every deal. Make withholding the default, not an option he has to remember.
- Digest footer carries the full disclaimer block (§5).
- Config object (operator name, NMLS, brokerage, colors, threshold, phone) lives in one place from day one. Ryan is an instance of the config, never the default values.

## 5. Guardrails, read before every session

- **Local only. No accounts, no server, no network calls after load.** Borrower financials on a server = GLBA + CCPA exposure. This is a legal architecture decision, not a preference. Do not add Firebase auth/Firestore to this project.
- **No borrower PII.** In-app notice: no names, SSNs, account numbers. The tool models properties, not people. Deal records: address optional and marked as such.
- **NMLS gate:** share/digest functions stay locked until an NMLS ID is entered. Compliance is structural, not voluntary.
- **Disclaimer block on every shared asset:** "Estimates only. Not a commitment to lend. Rates and terms subject to change, credit approval, and underwriting. Figures based on user-entered assumptions." Plus NMLS + brokerage identification.
- **Never build:** contract/legal-document generation (UPL exposure: Stephen has explicitly ruled this out), auto-dialing or AI voice calling (TCPA, per-call statutory damages), MLS scraping (MetroList/CRMLS require broker-authorized IDX agreements, all inputs are typed or pasted).
- **Never hardcode** regulatory thresholds, ADU rules, transfer-tax triggers, or tax rates as law. Defaults are editable inputs with verify-notes.
- Ryan is responsible for his own regulatory compliance as the licensed originator; the shared assets should go through Diamond Edge's marketing/compliance review before first client use. One-page plain-English agreement between Stephen and Ryan still to be drafted (IP: Stephen owns; Ryan gets free perpetual license; no warranty; feedback usable).

## 6. Math quick reference (authoritative version: plan §3)

- Qualifying DSCR = gross monthly rent / PITIA (PI + taxes + ins + HOA). What non-QM lenders underwrite on 1-4 units. No vacancy/mgmt/maintenance in it.
- True DSCR = annual NOI / annual debt service. Show BOTH: the gap between them is the product's thesis.
- CA: taxes default to purchase price × 1.20% (Prop 13 reassessment on sale: never the seller's bill). Insurance: manual entry only, fire-zone note. ADU adds: only the new construction is added to the assessment.
- Reverse solve: PI_max = rent/target − T − I − HOA; invert amortization; Max_Loan = min(P_max, LTV cap × lesser(price, appraisal)).
- Edge cases are enumerated in plan §3.1 and tested in §6.

## 7. Studio conventions that apply here

- Single-file vanilla HTML/CSS/JS, no build step, deploys to Firebase Hosting or GitHub Pages as-is.
- Headless simulation harness before UI (Node, extract-and-eval pattern above).
- Mobile-first, one-handed, outdoor-legible. Design direction in plan §8: coverage-bar signature element, color means threshold state only, system fonts, tabular figures.
- **Do not** wire this into sunbeams or the studio friend graph: professional tool, separate identity from the game catalog.
- Update this HANDOFF.md at the end of every session: state checkboxes, decisions taken, next action.

## 8. Next action

Phase 1. Create `index.html` skeleton with the `deal-math` block, write `test/harness.mjs`, hand-compute and freeze the 10 golden scenarios, make them pass. Nothing else until green.
