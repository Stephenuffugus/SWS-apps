# Portfolio Brief, Nine Products, Four Engines

For the business/brand conversation, not for a build agent.

## What was actually selected

| # | Product | Engine |
|---|---|---|
| 12 | Signup sheets | 1, shared-link coordination |
| 9 | Team parent | 1 |
| 14 | Caregiver log | 1 |
| 15 | Seating chart | 2, local data → PDF |
| 8 | Home inventory | 2 |
| 10 | Print-and-play generator | 2 (gated, see doc) |
| 17 | Co-op daily puzzle | 3, multiplayer games |
| 3 | Room-code party game | 3 |
| 4 | Bill splitter | standalone |

Nine folders is misleading. It's **four codebases**, and two of them share the same PDF pipeline. The real work is closer to three engines plus a weekend project.

## The brand question, decide before naming any repos

A caregiver log and a home inventory have nothing to do with a game studio. Two of these nine belong to Lucid Winds. The other seven are something else.

**Lucid Winds (games):** co-op daily puzzle, room-code party game. Sunbeams, playful, existing portal, existing audience.

**A utility brand (everything else):** quiet, trustworthy, adult, boring in the way people want their insurance paperwork to be boring. The through-line is real and unusually marketable:

> Nothing leaves your device. No account. No ads. No subscription.

That promise is one you can actually keep, because your cost structure supports it and the incumbents' does not. Splitwise can't be free, it has a company to feed. The photo apps can't help you delete, because they sell storage. Every budgeting app charges $100/yr because bank aggregation costs real money per user per month. You have no such gravity pulling on you. That's the moat, and it's a positioning statement, not a feature list.

Running both under one name muddies each. A grieving family looking for a caregiver log should not land on a page with a cartoon raccoon on it.

## Suggested sequencing

1. **Bill splitter**, weekend. Proves the utility brand exists, costs nothing to run, generates traffic.
2. **Signup sheets**, validates the coordination primitive with the loudest incumbent hatred.
3. **Seating chart**, the biggest single opportunity here, and calendar-sensitive. Weddings lock seating May-October; the January planning wave is the target.
4. Then: home inventory, team parent, caregiver log as skins/reuse.
5. Games in parallel when the utility stack is stable, different headspace, different brand, no dependency.
6. Print-and-play only after the manual one-game experiment lands.

## Open decisions for the manager conversation

- One utility brand or separate domains per app?
- Does one owner account span all coordination skins (argues for one deploy with a skin picker, not three)?
- Tips only, or a paid tier somewhere? Seating chart and home inventory are the two with genuine willingness-to-pay.
- Does the room-code party game absorb HUNCH's drawing mechanic instead of being a separate title? Significant scope reduction if yes.
- Caregiver log holds health info about a third party. Worth a deliberate decision on scope and disclaimers before building, not after.

## A note on workflow

The thing that keeps this from becoming nine half-finished folders is the same thing that's worked so far: **one deployed, used-by-a-real-person product before starting the next.** Not one finished, one *used*. The engines are designed so that finishing the first skin makes the second and third dramatically cheaper, which only pays off if the first one actually ships.

The creative chaos is genuinely an asset. The structure that makes it compound rather than scatter is just: finish the first of each engine.
