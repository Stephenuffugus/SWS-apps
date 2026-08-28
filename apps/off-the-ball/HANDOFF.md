<!-- Kept in the app folder on integration, 2026-08-28, the way Specials
     Planner keeps its own. This is the author's handoff, and it is the
     roadmap: section 9 is the blocking list.

     EVERYTHING BELOW THE DIVIDER IS VERBATIM and is deliberately exempt from
     the studio dash sweep. It is a received document, not studio copy, and
     rewriting somebody else's handoff would damage the record. The app's own
     user facing copy WAS swept on integration; only this transcript is left
     as it arrived. -->

# Integration note, 2026-08-28

Integrated into the studio as app 33, `apps/off-the-ball/`, live at
skywolfstudio.com/off-the-ball. **Blocking item 1, the PWA shell, is done.**

What changed on the way in, and nothing else was touched:

- `off-the-ball.html` became `index.html`; the harness moved to
  `test/engine-test.mjs` and now reads `../index.html`. **The RENDER split it
  depends on is intact and every seam below was added at the very end of the
  script, far under the banner.** Section 2 still applies exactly.
- PWA shell: `manifest.webmanifest`, `sw.js` (page network first so a fix
  never strands on a stale phone, cache sweep scoped to the `otb-` prefix so
  it cannot delete another studio app's offline cache), and an icon set cut
  from `icon.svg`.
- Studio seams in the footer: Feedback, an install button, a build tag, and a
  `TIP_URL` seam that is **empty** and therefore hidden. Fill it with the
  Stripe link to turn the tip jar on.
- `user-scalable=no` removed from the viewport. It blocks pinch zoom, which
  is a WCAG failure, and this board is dense enough that somebody will want
  to zoom a corner of the pitch.
- Accessibility: the three `<select>`s had no accessible name, so a screen
  reader announced three unnamed comboboxes. They are labelled now. Axe is
  clean at wcag2a, wcag2aa, wcag21a and wcag21aa.

**The icon is a placeholder I drew**, not Stephen's art: a chalk box, a dotted
run, the ball still back there. `marketing/thumb-256.png` is cut from the same
mark. Both should be replaced the day his artwork is filed, the way Coverage
was. Generators never touch his art.

On the hub it wears the **In testing** badge, because section 9 of the handoff
below says plainly that it is not shippable yet. It is NOT passphrase gated:
there is nothing to hide, it simply is not finished.

---

# Off the Ball — HANDOFF

**Status:** working prototype, v0.3. Engine is sound and tested. Not shippable yet — see *Blocking work* below.

**What it is:** a soccer play-planning board for teams and individual players. You place players, give them named runs and moves, and run the play against a defence that reacts rather than follows a script. The board then tells you what each defender did and whether the play actually worked.

**What it is not:** a game. There is no score, no opponent AI to beat, no progression. Every output is diagnostic — the "verdict" is an analysis line, not a win condition. Keep it that way; the moment it starts rewarding the user it stops being a planning tool.

**Audience, in order:** adult rec and Sunday league players planning with teammates → youth coaches → individual players learning movement. The baseball app (Diamond Rules) was kid-first; this one is not.

---

## 1. Files

```
off-the-ball.html    the entire app. single file, vanilla, no build step.
engine-test.mjs      headless regression harness. requires node 18+.
HANDOFF.md           this file.
```

`off-the-ball.html` is ~1300 lines and self-contained apart from two Google Fonts (Space Grotesk, IBM Plex Mono) loaded by `<link>`. Everything degrades to system fonts if those fail.

Deploy target is Firebase Hosting / GitHub Pages like the rest of the catalog. It is already mobile-first, `viewport-fit=cover`, safe-area padded, `touch-action:none` on the canvas, and respects `prefers-reduced-motion`.

**Not yet a PWA.** No manifest, no service worker, no icons. That is item 1 in *Blocking work*.

---

## 2. Run the tests before you touch anything

```bash
node engine-test.mjs           # all checks, exits non-zero on failure
node engine-test.mjs --sweep   # preset x opposition-tier matrix
node engine-test.mjs --scout overlap   # one preset vs all 8 archetypes
```

This harness found every engine bug so far — six of them — none of which were visible from watching the animation. **Run it before and after every change to the simulation.** Wire it into CI.

How it works: it slices the `<script>` block out of the HTML and takes everything **above** the line

```js
/* ================================================================ RENDER
```

That split is load-bearing. Everything above the banner is pure logic with zero DOM access; everything below touches `document`, `canvas`, or `localStorage`. **If you put a DOM call above the banner, the harness dies and you lose your only regression net.** If you refactor into modules, preserve the same separation.

---

## 3. Coordinate system

Metres, attacking up the screen.

- `x`: `0..68`, touchline to touchline. Goal centre at `x = 34`.
- `y`: `-10..52.5`. Goal line at `y = 52.5`. Halfway line at `y = 0`.
- Higher `y` = closer to the goal being attacked. So a defender "stepping up" means **decreasing** `y`. This trips people up constantly.
- Penalty area `x 13.84..54.16, y 36..52.5`. Six-yard box `x 24.84..43.16, y 47..52.5`.

Screen mapping is `sx/sy` (field → px) and `fx/fy` (px → field), with a single uniform `SC` scale and centring offsets `OX/OY`. Do not reintroduce separate x/y scales; an earlier version had that and the aspect broke on tablets.

---

## 4. The engine

The whole thing rests on three rules. Everything else — interceptions, offside, feints working, decoys working — is emergent from them. Resist adding special cases.

### Rule 1 — perception lag

`S.history` is a ring buffer of world snapshots. Each defender reads the snapshot at `S.t - P.tau`, where `P` is **his own** profile. That single mechanic is why fakes, decoys and quick one-twos work. Nothing else was needed.

### Rule 2 — commitment

When a defender's desired direction opposes his current velocity (`dot < -0.05` while moving), he takes a `turnLock` timer during which acceleration is multiplied by `turnCut`. A defender who bites cannot instantly un-bite.

### Rule 3 — ball attraction

`pull = P.ballPull * prox²` where `prox` falls off with distance from his own station over `P.zoneR`. His target is `lerp(assignment, perceivedBall, pull)`. This is the rec-league flaw the app exists to teach people to punish.

A back line also refuses to abandon its depth: `target.y = max(target.y, anchor.y - P.stepUp)`.

### Feints

A feint is **a lie injected into the perception pipeline**, not a special effect. `snapshot()` stores the raw fake direction; each defender applies it as `ball + dir * 3.0 * P.feint` when he reads the snapshot. Consequence: a slow, gullible defender buys it harder and longer than a quick reader, with no branching anywhere. Do not "improve" this by scoring feints directly.

### Conditional passing (newest, v0.3)

A pass no longer fires at a fixed clock time. It has an earliest time `t`, and the passer holds the ball up to `PASS_WINDOW` (1.6s) waiting for:

- the receiver to be onside, and
- lane clearance above `laneNeeded(distance) = 0.85 + 0.042 * distance`

If the window expires the pass is marked `skipped` and the verdict is `NO PASS ON — <reason>`. This is what lets the board answer "does this work against a side that sits deep?" with *the ball never gets played*, which is the honest answer.

### Interception

Gated behind the intercepting defender's **own** `tau`: `aloft > P.tau * 0.6`, plus ball travelled > 2.5m, plus within 0.9m. Before this gate existed, any defender standing near a lane ate the ball and five of six presets ended identically.

---

## 5. Data model

```js
play = {
  key, name, note, callName,
  attackers: [{ id, label, x, y, hasBall, moves:[moveId], custom, path:[{x,y}] }],
  defenders: [{ id, label, x, y, mode:'man'|'zone', mark, anchor:{x,y}, prof }],
  passes:    [{ from, to, t }]
}
```

`prof` (per defender, this is the v0.3 headline feature):

```js
{ arch, tier, tau, topSpeed, accel, turnCut, turnLock,
  ballPull, zoneR, feint, stepUp, markGap }
```

Built by `makeProfile(tier, archetype)` = tier baseline + archetype modifier, clamped to `PROF_LIMITS`. The tier dropdown sets all defenders at once; the scouting card overrides individuals.

`compile()` turns `moves` into concrete `{ paths, fakes, delays, passes }`. A hand-drawn `path` always overrides assigned moves. Combinations (`oneTwo`, `upBackThrough`, `dummy`) inject extra passes and pick partners via `partners()`, which **excludes pinned players and prefers teammates ahead of the ball** — an earlier version picked the nearest teammate and kept choosing a player who had been told to stand still.

---

## 6. Content

**24 named moves** in `MOVES`, three kinds: `run` (12), `onball` (9), `combo` (3). Every entry carries `name`, `aka` (regional alternatives — kids and adults call these different things), `teach`, `signal`, `diff` 1–3, and either a `build(ctx)` or a `combo` key.

`signal` is the product. It is what a teammate reads when they see the move, and it feeds the call sheet, the share text and the downloadable play card. When you add a move, the signal is not optional decoration — the test harness fails the build if any move is missing copy.

**8 scouting archetypes** in `ARCHETYPES`: Plays it straight, Dives in, Ball-watcher, Sits deep, Quick, Does not turn, Reads it early, Tight man-marker.

**6 presets** in `PRESETS`. These are tuned geometry — the harness sweep is the contract. If you move a player in a preset, re-run `--sweep` and make sure it still discriminates across tiers.

---

## 7. Tuning constants

Anything here is a dial, not architecture. Change these to taste; the shape of the model should not need to change.

| Constant | Value | What it controls |
|---|---|---|
| `ATTACKER_SPEED` | 5.6 m/s | how fast a drawn run is covered |
| `PASS_SPEED` | 14.0 m/s | ground pass |
| `PASS_WINDOW` | 1.6 s | how long a passer waits for a lane |
| `laneNeeded(d)` | `0.85 + 0.042d` | daylight required, scaled by pass length |
| `SIM_MAX` | 12 s | hard stop |
| `SKILLS[tier].tau` | 0.85 / 0.55 / 0.32 | perception lag by level |
| `SKILLS[tier].ballPull` | 0.88 / 0.52 / 0.22 | ball-watching by level |
| `SKILLS[tier].stepUp` | 16 / 8 / 5 | how far the line abandons its depth |
| `PROF_LIMITS` | — | slider bounds on the scouting card |

The two most sensitive: `ballPull` (drives everything about decoys) and `laneNeeded` (a flat threshold was tried and was wrong — a 5m wall pass squeezes past a marker every weekend, a 25m ball does not).

---

## 8. Known issues — read this before promising anything

**1. Attackers do not react. This is the big one.**
Runs are fixed polylines. Once drawn, the runner executes it regardless of what the defence does — he will run into a covered space and keep going. Conditional passing (v0.3) papers over the worst of it by withholding the ball, but the runner still makes a run that no human would make. Until this is fixed the board cannot say "check back instead" or model a genuine two-option play.

The fix, roughly: give each run one or two decision points where the attacker evaluates whether the target space is occupied and can switch to a fallback path (usually "come short"). Keep it to a small number of discrete options; a full attacking AI is not wanted and would make the tool unpredictable to plan with.

**2. No goalkeeper.** The offside line uses a nominal keeper pinned at `y = 48`. Any preset near the byline is approximate. A real keeper also unblocks shot modelling.

**3. No shot model.** The verdict stops at "space created". `CLEAR CHANCE` is a proximity heuristic (in the box, nearest defender > 4m), not an xG.

**4. Small-sided formats are not supported.** Fixed 4v4 on a full pitch. This is the single loudest complaint in reviews of every competing app — 5-a-side, 7v7 and 9v9 coaches cannot use tools that assume eleven. Pitch dimensions, player counts and offside rules all need to become configurable. High commercial priority.

**5. Ledger noise.** The cut-reaction detector can log the same cut twice when two defenders converge. Cosmetic but it clutters the panel.

**6. `localStorage` is best-effort.** `STORE` falls back to in-memory and tells the user. Some embedded viewers block it outright. Share links are the durable path.

**7. Verdicts are not monotonic across tiers and that is sometimes correct.** A U10 defender stands on top of his man; a competitive one holds a proper distance. So "space at reception" can be *larger* against a better defence. Do not "fix" this by forcing monotonicity — it is real. But the copy could explain it better.

---

## 9. Blocking work before app store

In order.

1. **PWA shell.** Manifest, icons, service worker, offline. It is a single file; this is quick and it is the difference between a link and an app.
2. **Small-sided formats.** Configurable pitch size and player counts. 5v5 / 7v7 / 9v9 / 11v11. Biggest addressable gap versus every competitor.
3. **Playbook durability.** Right now it is `localStorage` plus share links. Needs export/import of the whole playbook as a file at minimum, so a team does not lose everything on a browser clear.
4. **Attacker reactivity** (issue 1). This is the thing that makes the tool trustworthy rather than illustrative.
5. **Goalkeeper + shot model.**
6. **Onboarding.** Right now the app assumes you already know what a third-man run is. The `teach` copy exists but nothing surfaces it on first open.

---

## 10. Competitive findings — what to gut

Research on the existing category (The Hoops Geek, CoachCanvas, FirstDown PlayBook, Flag Football Playmaker X, various soccer tactics boards) produced a consistent list of complaints. These are already avoided; keep them avoided.

- **Sharing behind a paywall.** Ours is a URL hash. No account, no login, no server. Do not add one.
- **Paywalled basics:** PDF export, more than five plays, one animation per day, audio narration. Do not gate any of these.
- **Youth roster sizes unsupported** — see issue 4.
- **Numbers only, no position labels.** Defenders are renameable; attackers are not yet. Make attackers renameable too.
- **No sorting once you have 30 plays.** The playbook is a flat list. It will need folders or tags.

The category-wide gap we are actually filling: **every existing tool is a drawing app where the defence is decoration.** Nothing simulates reaction. Nothing is aimed at the player as author rather than the coach as broadcaster. That is the whole differentiator — protect it.

---

## 11. Decisions already made, don't re-litigate

- Soccer first, then basketball, then football. The reaction engine is sport-agnostic; the geometry and move library are not.
- Single file, vanilla, no build step, no framework. Consistent with the rest of the catalog.
- Feints are perception lies, not scored effects (§4).
- The DOM/engine split at the RENDER banner is an invariant (§2).
- Verdicts are diagnostic, never a score.
