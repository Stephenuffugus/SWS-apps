# Standalone — Bill Splitter

The smallest thing in the batch. **No backend at all.** Genuinely a weekend.

## Why it exists
Splitwise has been steadily paywalling and adding ads, and the annoyance is loud. The free alternatives all want an account for every participant, which is absurd for something you use once at a restaurant table.

## The critical constraint: never touch money
The app does **arithmetic** and then hands off to a payment app via deep link. It never holds, transfers, or escrows funds.

This is not a minor detail — it's the entire reason this is a weekend project instead of a licensed business. Money transmitter registration, PCI scope, and KYC obligations all attach to *custody*. No custody, none of it applies.

**Never** add: in-app payment, a wallet, holding a balance, or "we'll collect and distribute." The moment any of those appear, this becomes a regulated financial product.

Handoff targets: Venmo, Cash App, PayPal.me, and a plain "copy the amount" fallback. Deep link schemes change, so isolate them in one small module and degrade to copy-to-clipboard if a link fails.

## Architecture
- Single-file vanilla HTML/CSS/JS PWA. No build step, no server, no account, no analytics.
- **All state lives in the URL** (compressed JSON in the hash fragment). Sharing the trip *is* sharing the link. A hash fragment is never transmitted to a server, which is both a privacy win and the reason no backend is needed.
- Watch URL length. Compress before base64. If a large trip exceeds practical URL limits, fall back to an exported `.json` file or a QR code.
- IndexedDB caches recent trips locally so you can reopen your own without the link.

## Features
**Dinner mode** — the fast path, optimized for standing at a table:
- Add people (names persist from last time).
- Enter total, tax, tip. Tip as % or flat.
- Even split, or per-item assignment for the one person who only had a salad.
- Big readable per-person number. One tap to the payment app.

**Trip mode** — multi-day, many expenses:
- Log expenses as they happen: who paid, who owes, split evenly or by shares.
- **Settle-up minimization** — the real value. Instead of eleven crisscrossing payments, compute the minimum set of transfers that settles all debts. This is the feature people actually praise in Splitwise, and it's a straightforward greedy algorithm over net balances.
- Multi-currency with a manually entered rate (no API, no key, works offline).

## Sharing
- QR code of the trip link, for the table.
- Plain-text summary to copy into a group chat, since half of any group won't open a link.

## Do not build
Accounts, friend graphs, notifications, reminders to pay, a social feed, expense history sync. Every one of those is why the incumbents got bad.

## Monetization
Free. Tip jar at most. This is a portfolio-credibility and traffic product, not a revenue product — it makes the case for the "nothing leaves your device" utility brand and costs nearly nothing to run.
