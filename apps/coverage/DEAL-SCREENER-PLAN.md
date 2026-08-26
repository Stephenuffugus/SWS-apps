# DEAL-SCREENER-PLAN.md, Coverage (v1, reconstructed)

> **Provenance note.** The original `DEAL-SCREENER-PLAN.md` was written in a Claude
> chat and never landed in the codespace, it is not in the handoff zip. This file
> reconstructs the build-critical parts from `HANDOFF.md §6` (the authoritative math
> quick-reference) plus standard non-QM DSCR conventions, so the build isn't blocked.
> Where the original may differ, the safe rule from the handoff holds: **nothing
> regulatory is hardcoded; every threshold is an editable input.** If Ryan's original
> plan surfaces, reconcile §3 and §6 against it before trusting these defaults.

Everything here is implemented in `index.html` (`<script id="deal-math">`) and
verified by `test/harness.mjs`. Ten golden scenarios + a round-trip invariant pass.

---

## 1. What it is

A phone-first DSCR loan-qualification screener for an investor-focused loan officer.
On a sidewalk, in ~30 seconds, it answers two questions for a property:

1. **Does this qualify for a DSCR loan at my threshold, at the down payment on the table?**
2. **If not, what down payment *would* make it qualify?** (reverse solve)

It also shows the **True DSCR** (NOI ÷ debt service) next to the lender's
**Qualifying DSCR** (rent ÷ PITIA). The gap between them is the product's thesis:
a deal can "qualify" and still cash-flow thin once vacancy, management, and
maintenance are counted.

The paid product is Ryan's loan. The screener converts his free property-hunting
into a financing-attached advantage. **Deal Drop** (the weekly branded digest of
qualified deals sent to his investor list) is the money-multiplier layer, spec'd
in `HANDOFF.md §4`, built after Phases 1-3 are in his hands.

---

## 2. Math (authoritative)

All figures monthly unless noted. Symbols: `P` loan, `r` monthly rate, `n` months.

### 2.1 Payment
- `PI = P·r / (1 − (1+r)^−n)` : fully-amortizing.
- **Edge i=0:** `PI = P / n` (straight-line; no divide-by-zero).
- `loan = max(price − down, 0)`.

### 2.2 Carrying cost
- `taxes = price × taxRate / 12` (auto) **or** a manual monthly override.
  - **CA default `taxRate = 1.20%`**: Prop 13 reassessment on the **sale price**,
    never the seller's current bill. ADU adds only new construction to the assessment.
- `insurance`: manual entry only (fire-zone reality; no auto-estimate).
- `PITIA = PI + taxes + insurance + HOA`.

### 2.3 Qualifying DSCR (what non-QM lenders underwrite, 1-4 units)
- `qualifyingDSCR = gross monthly rent / PITIA`.
- Excludes vacancy / management / maintenance. This is the lender's number.
- `qualifies = qualifyingDSCR ≥ target`.

### 2.4 True DSCR (reality check, show both)
- `NOI (monthly) = rent − rent·vac − rent·mgmt − rent·maint − taxes − insurance − HOA`.
- `trueDSCR = (NOI × 12) / (PI × 12)`.
- **All-cash edge:** debt service = 0 → coverage is undefined/infinite → report `null`
  ("all cash"), never a divide-by-zero or a fake number.
- Default opex assumptions (editable): vacancy 5%, management 8%, maintenance 5%.
- Two derived investor metrics, also verified by the harness:
  - `capRate = (NOI × 12) / price`: unlevered yield.
  - `cashFlowMonthly = NOI(monthly) − PI`: actual monthly cash flow after debt service
    (can be negative even when a deal "qualifies"; that is the thesis made concrete).

### 2.5 Reverse solve, minimum down to hit `target`
1. `PI_max = rent/target − taxes − insurance − HOA`.
2. If `PI_max ≤ 0` → **cannot qualify at any down** (fixed carry already exceeds
   `rent/target`; even all-cash fails on rent alone). Set `cannot = true`.
3. Else invert amortization: `P_dscr = PI_max·(1 − (1+r)^−n)/r`  (i=0 → `PI_max·n`).
4. `maxLoan = min(P_dscr, ltv × min(price, appraisal))`.
5. `bind = "LTV"` if the LTV cap is the smaller constraint, else `"DSCR"`.
6. `minDown = price − maxLoan`, `minDownPct = minDown / price`.

The **binding constraint** is surfaced in the UI because it changes Ryan's pitch:
DSCR-bound → "put more down"; LTV-bound → "this program caps you at 75%."

### 2.6 Invariant
Feed `minDown` back in as the down payment → `qualifyingDSCR == target` exactly.
Tested (`7b` in the harness).

---

## 3. Config schema (Ryan is an instance, never the defaults)

One object, one place. White-label = new instance of this, nothing else.

| key | meaning | Ryan v1 |
|---|---|---|
| `operatorName` | display + digest byline | Ryan, Diamond Edge Financial |
| `nmls` | NMLS ID, **share/digest locked until set** | (Ryan to enter) |
| `phone` | "text me for the address" hook | (Ryan to enter) |
| `target` | qualifying DSCR threshold | 1.15 *(confirm with Ryan)* |
| `ltv` | max loan-to-value | 0.75 *(confirm)* |
| `taxRate` | annual property-tax fraction of price | 0.0120 (CA) |
| `vac` / `mgmt` / `maint` | True-DSCR opex assumptions | 0.05 / 0.08 / 0.05 |
| `colors` | brand accents for digest | studio default |

No regulatory value is hardcoded in the math core, all arrive as inputs. Verified by
the harness passing thresholds per-scenario rather than reading constants.

---

## 4. Build order (matches HANDOFF §3)

- [x] **Phase 1: Math core + headless harness.** `DealMath.evaluate()`, zero DOM.
      10 golden scenarios + round-trip frozen from an independent oracle. **DONE, green.**
- [x] **Phase 2: Single screen, live recalc.** Qualifying DSCR + payment pinned in
      large type; tabular numerals; system fonts; coverage-bar signature element. **DONE.**
- [x] **Phase 3: Reverse solve** surfaced with binding-constraint reason. **DONE.**
- [x] **Phase 4: Saved deals.** IndexedDB store `deals`; save current screen, list,
      tap-to-load, delete, and side-by-side compare of 2-3. **DONE.**
- [x] **Phase 5: Share sheet.** Branded single-deal one-pager → canvas → PNG → Web
      Share API with download fallback; live preview before sending. **NMLS gate is
      structural**, share is locked and routes to the NMLS field until one is entered.
      Address withheld by default ("address on request"). Full disclaimer on the asset. **DONE.**
- [ ] **Phase 6: ADU mode.** Gated on Ryan confirming ADU/value-add buyers. Mind the
      two danger rules: pro-forma labeling; partial reassessment (new construction only).
- [x] **Phase 7: Deal Drop.** Multi-select 1-5 saved deals → one tall digest image
      (canvas → PNG, MMS/iMessage) **plus a PDF for email** (dependency-free single-image
      PDF, DCTDecode/JPEG; validated with a real PDF parser). NMLS-gated like the share
      sheet. Address withheld by default; per-card "Address on request." Full disclaimer
      footer. **Distribution is manual in v1**, Ryan sends it himself; the tool stores and
      sends nothing (no investor list on device, no server). **DONE.**

**v1 Deal Drop deviations (logged):** (a) the NMLS financing line appears once in the
digest header rather than repeated on every card, cleaner, still compliant (NMLS shown +
gate + disclaimer). (b) Optional per-deal **photo** is deferred to 7.1 (needs image capture
+ storage; the digest reads well without it). (c) The email PDF is a single full-page image
of the digest, not reflowable text, correct for a branded one-pager.

**Phases 1-5 and 7 are built and in the studio for fine-tuning.** Only Phase 6 (ADU mode)
remains, and it waits on Ryan confirming ADU/value-add buyers.

---

## 5. Guardrails (from HANDOFF §5, read before every session)

- **Local only. No accounts, no server, no network after load.** Borrower financials on
  a server = GLBA + CCPA exposure. Architecture decision, not preference. No Firebase auth/Firestore.
- **No borrower PII.** Model properties, not people. Address is optional and marked so.
- **NMLS gate** on all share/digest output: structural, not voluntary.
- **Disclaimer block on every shared asset** + NMLS + brokerage ID (see index.html footer).
- **Never build:** contract/legal-doc generation (UPL: explicitly ruled out),
  auto-dialing / AI voice (TCPA), MLS scraping (IDX agreements). All inputs typed or pasted.
- **Never hardcode** regulatory thresholds, ADU rules, transfer-tax triggers, or tax
  rates as law. Defaults are editable inputs with verify-notes.

---

## 6. Golden scenarios (frozen, see test/harness.mjs)

| # | scenario | qualDSCR | trueDSCR | minDown | bind |
|---|---|--:|--:|--:|:--|
| 1 | baseline qualifies | 1.13 | 0.91 | $189,229 (31.5%) | DSCR |
| 2 | zero interest (i=0) | 2.22 | 2.33 | $100,000 (25%) | LTV |
| 3 | all cash (PI=0) | 5.65 |, n/a | $92,444 (26.4%) | DSCR |
| 4 | cannot qualify (piMax≤0) | 0.16 | −0.10 |, cannot, |, |
| 5 | LTV binds | 2.14 | 1.93 | $75,000 (25%) | LTV |
| 6 | DSCR binds | 0.73 | 0.51 | $488,819 (61.1%) | DSCR |
| 7 | reverse round-trip | 0.85 | 0.64 | $171,161 (31.1%) | DSCR |
| 8 | condo w/ HOA | 1.05 | 0.79 | $157,037 (34.9%) | DSCR |
| 9 | tax override | 1.15 | 0.93 | $125,232 (25.1%) | DSCR |
| 10 | 15-year term | 1.09 | 0.87 | $130,327 (27.2%) | DSCR |

`node test/harness.mjs` → **11 passed, 0 failed**.

---

## 7. Open decisions, Ryan's answers pending (HANDOFF §2)

These are **config values, not code blockers**, the engine is built configurable, so
each answer just sets an input. Log the answer here when it lands; don't re-architect.

1. Cash-flow vs ADU/value-add buyers? → gates Phase 6.
2. DSCR programs + **minimum qualifying ratio**? → sets `target` (default 1.15 used).
3. Current calculation method he uses today? → sanity-check our qualifying-DSCR definition.
4. Interest-only availability? → if yes, add an IO payment mode (PI = loan·r; no amortization).
5. **LTV caps** by program? → sets `ltv` (default 0.75 used).
6. 1-4 units vs 5+? → 5+ shifts to commercial DSCR conventions (out of v1 scope; flag if needed).
7. Investor list size + channel (text vs email)? → sizes Deal Drop (image vs PDF priority).

**Defaults taken (logged per HANDOFF §2 instruction):** target 1.15, LTV 0.75,
CA taxRate 1.20%, opex 5/8/5. All editable in the UI's "Operator & thresholds" panel.

---

## 8. Design direction (HANDOFF §7)

Single-file vanilla HTML/CSS/JS, no build step; deploys to Firebase Hosting or GitHub
Pages as-is. Mobile-first, one-handed, outdoor-legible. Coverage-bar is the signature
element; **color means threshold state only** (green covers / red short), the rest of
the UI stays monochrome. System fonts. `font-variant-numeric: tabular-nums` everywhere.
Do **not** wire this into sunbeams or the studio friend graph, separate professional identity.
