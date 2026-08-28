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
- ~~Stripe payment link~~ WIRED same night (diamond-v3): tip jar live in the settings footer.
- League answers for future tiers: does the league steal? no-leadoff rule? That gates roadmap items 4 and 5.

## Next build candidates (handoff roadmap)

At-bat mode (one continuous half-inning: count into play into where's-the-play, outs carry over) is the big one. Then difficulty tiers, badges per rule chip, install prompt affordance (`swsInstall`) so the hub card gets the install button.

## v4, Stephen's first-run notes, same night

His four notes, all shipped as diamond-v4:

1. **Home plate was under the question bubble.** The camera now measures the top bar and the live bubble (ResizeObserver, since the bubble grows with its words) and fits the safe box into the uncovered strip; the field still paints edge to edge. Safe box retuned (CY 310, SAFE_H 440) so the diamond got bigger, not smaller. Smoke test asserts home plate clears the bubble in all four modes, and the worst case (infield fly, three long choices) clears by 41px at phone size.
2. **Wrong answers now mean try again**, not move on. A miss flashes red, breaks the streak, shows "Not quite! Try again," and never reveals the answer; wrong choice buttons disable for honest elimination. The verdict card with the why only comes when they find it.
3. **Coach says tips + the okay tier.** Scenarios carry an optional `tip` (amber line on the verdict): lead-runner-when-you-can, sure-out-when-you-can't, one run is okay. And a force out at a non-lead bag is now a real out: with 2 outs EVERY forced bag is fully correct (any force ends the inning); with fewer it lands in the `okay` map and gets a "That works!" verdict teaching the lead runner. Whys compacted hard for short attention spans; the extra nugget moved into the tip.
4. **Infield fly 8U note**: the tip on that card says most 8U leagues skip the rule.

Next: parents test via Stephen's text-out; their notes drive the next round.

## v5, same night

Stephen: runners should look like players, not gold dots. `runnerSprite()` now draws a little ink player mid stride in a gold batting helmet (dome + brim) standing on their bag; still decorative (pointer-events none), still var() driven so it recolors with the theme tokens.

## v6, Stephen's second run, same night

1. **Hold the ball moved onto the field.** It is now a fifth chalk base (rotated square, HOLD IT! label, pulses and flashes with the real four) floating over the field above the bubble; the answers area under a ground ball question is now empty, so the field is the whole answer surface. Hint reads "Tap a base, or hold the ball!"
2. **The power play** (his coaching note): runners on 2nd and 3rd, fewer than 2 outs, ground ball. Correct = HOLD, chip "Power play": let the batter take first, now the bases are loaded and every base is a force, even home. Throwing to first still grades "That works!" with the secret explained. With 2 outs it stays take-the-out. Guarded by the smoke suite.
3. **Tap affordance**: sonar ping rings radiate from every tappable base and fielder while they pulse.
4. **Runner detail**: white jersey with ink outline, gold belt, outlined helmet with brim and ear flap, gentle staggered bob.
5. **Juice**: ball does a little thump when it lands, clouds drift, streak star pops when it grows. All animation honors prefers-reduced-motion.

## v7, Stephen's pre-shutdown round, same night

1. **Labeled modes**: every bottom tab wears a name (Music, Batting, Grounders, Fly balls, Positions, Mix, Feedback), and switching pops a big mode title over the field for a second. Narrow-phone media query keeps the 7-item row inside 360px.
2. **Mix tab** (his "combination of them"): one tab that shuffles grounders, fly balls and positioning questions; fielders stay tappable there.
3. **Field truth**: CF moved inside the fence (was in the sky at y=122, fence curve is y=133; now y=160), and 1B/3B moved OFF their baselines to where corner infielders actually stand (282,360 / 118,360). Smoke test now measures the DOM against the baseline equations.
4. **Feedback on the front door**: a 💬 tab at the end of the row opens the feedback box straight from the main screen (settings link still works).
5. **Ballpark organ**: Take Me Out to the Ball Game (1908, public domain), the full chorus sequenced as [semitone, beats] pairs through one WebAudio triangle voice, looping while the 🎵 tab is armed. No audio files, app stays one file. Off by default; a tap is the gesture autoplay policy wants anyway.

## v8, the go-ahead round, same night

Stephen approved the competitor-research picks; tiers wait for his league answers this weekend.

1. **Play 10**: a scored round in any scenario mode (button in the bubble; hidden during a round and in Batting). First tap right (or okay tier) = a point; misses still teach but score nothing. Progress rides the streak pill and the verdict card; after ten plays a score card shows N / 10 with a star row (missed ones dimmed) and a title: 10 PERFECT GAME, 8+ ALL-STAR, 6+ GREAT GAME, 3+ GOOD HUSTLE, else KEEP SWINGING. Play again or free play. Mode switch cancels a round.
2. **Pick your position**: a Your Position grid in settings (Every spot + all 9), persisted in `diamond1.myPos`. Positioning drills weight scenarios featuring your spot at triple (every POS_BANK entry now carries `who`; a new Charge the Bunt drill gives 3B its own), and grounders come to your position half the time if you play infield.
3. Smoke suite: a full scored round with one planned miss must land at exactly 9 / 10 ALL-STAR, picker offers 10 choices, SS bias measured over 100 draws, choice survives reload.

Still open for the weekend: difficulty tiers (needs Stephen's league answers: steals? no leadoff? dropped third strike?), plus the parent-notes round.

## v9, install button + league levels, same night

1. **Add to home screen**: fleet `swsInstall` affordance adapted to the app: a real button in the settings card (Chrome fires the native prompt; iPhone gets Share sheet directions; hidden once installed), a top banner greeting when arriving via `?sws-install=1`, and the hub card gained the ⤓ install button.
2. **League levels** (Stephen's answers arrived mid-build): the Game seg became Game & level: Softball 8U (coach pitch, 4 strikes, no steals or leadoffs, no dropped third strike), Softball 10U (kid pitch, 3 strikes, steals and leadoffs ON, dropped third strike live), Baseball. Old saved `sport:"softball"` migrates to softball8.
3. **Runner IQ bank** (RUN_BANK, 10U only via `cfg().steals`): leave-on-release leadoffs, steal on a passed ball, dropped third strike with the first-base-open nuance. Served through the Mix tab; 8U players can never meet them. 10U strikeouts in Batting also teach the dropped-third RUN line.
4. Smoke: level gates checked deterministically (3 makers at 8U/baseball, 4 at 10U), 10U strikeout message, runner IQ appears within 40 mix plays at 10U, migration asserted, install button + hub banner asserted.

The tiers item from the roadmap is now SHIPPED as real league levels instead of invented difficulty names.

## v10, the song gets fixed for real, picker comes out

Stephen: the song was wrong and the position picker was not earning its place.

1. **The melody is now transcribed, not recalled.** Pitches taken syllable by syllable from letternoteplayer.com's letter notation in C (all three sheet images read directly), rhythm checked against an engraved edition (music-for-music-teachers.com), assembled into the standard 32 bar 3/4 chorus. What the guessed version got wrong: the Cracker Jack line is A G# A E F G A F D (chromatic G#, falling tail), "root root root" repeats the opening octave leap C C' A (not three repeated notes), and "one two three" sits entirely on high C with an F# passing tone under "at the old". The smoke test now pins 96 beats, the octave leap, the G#, the F#, the high C plateau and the held final C, so the tune cannot drift again.
2. **Position picker removed** (his call: no visible difference, not needed now). myPos state, persistence, weighting and the settings row are gone; the `who` tags stay on POS_BANK entries as inert documentation so the feature can return cheaply if wanted. The 3B bunt drill stays, it is good content regardless.

Lesson written in ink: transcribe, never recall, anything a human will hold up against a known original (music, lyrics, quotes, rules).

## v11, the rhythm was the real bug

Stephen "cleared the browser five times" and still heard "only quarter notes": he WAS on the new build; v10's pitches were right but its rhythm was a flat march (one syllable per beat). The actual song lilts. v11's note values are read bar by bar from the ORIGINAL 1908 engraving (Teller, Sons & Dorner plates, Levy Sheet Music Collection scan, levysheetmusic.mse.jhu.edu 027.125a): every phrase opens long short ("Taaake me", "I don't", "root root", "they don't", "Craaack er"), walks in quarters, and parks on full bar holds (ball, game, home, old); "Let me" and "For it's" are quick pickup eighths. Smoke now pins the opening half note lilt too. Lesson appended to [[transcribe-never-recall]]: rhythm IS part of the transcription; letter notation sites drop it, engravings carry it.

## v12, install button inside the installed studio

Stephen could not find the install button: he browses Diamond Rules from inside the INSTALLED studio hub, which runs standalone, and the v9 affordance hid itself in any standalone window. Now standalone keeps the button ("Give this game its own icon") and explains the one path that works: open skywolfstudio.com/diamond-rules in the real browser (Safari share sheet / Chrome menu), because phones only add icons from a browser. Regular browser behavior unchanged (native prompt on Chrome, directions on iPhone, settings card + hub banner).

## v13, install on the front door, tip jar grows up

Stephen: the install button should be large and on the main screen; the tip jar can stay in settings but bigger; the footer text was too small. Shipped: a bold "Add to home screen" pill on the main screen right under the top bar (inside .topstack so the camera accounts for it; hides after a real install via appinstalled + localStorage flag, same standalone relabel as settings), the tip jar as a full-width red heart button in settings (replaces the tiny inline link), and the footer bumped from 13 to 15px.

---

# Day two, same date: v14 to v22

Everything below came from Stephen watching a kid play, or from his coach,
who started sending notes within an hour of getting the link. Read the league
config in `SPORTS` first: it is the spine of the whole app now.

## The league config is the spine

`SPORTS` in index.html carries one object per level and every rule difference
hangs off it. Adding a level, or correcting one, is a data edit.

| flag | 8U | 10U | Baseball | who said so |
|---|---|---|---|---|
| `strikesForOut` | 4 | 3 | 3 | Stephen, his league |
| `steals` (and leadoffs, dropped third) | no | yes | no | Stephen, v9 |
| `infieldFly` | no | no | yes | Stephen: "there's no infield fly rule in 8U cuz the girls can hardly catch", and later "I don't think 10u does either but I'm not sure" |
| `circle` (look back rule) | yes | yes | **no** | his coach; fast pitch only, baseball has no equivalent |
| `bunts` | no | yes | yes | Stephen: "kids in 8u don't bunt" |

**Still unconfirmed:** whether 10U plays the infield fly. Off there on
Stephen's read, and neither of us found a source that settles youth rec 10U.
One word in `SPORTS` when a coach who is actually at 10U says so. Do not
change it on a hunch in either direction.

## v14, the infield fly leaves 8U
It was sitting ungated in FLY_BANK while strikes, steals, leadoffs and the
dropped third strike were all gated, so every 8U girl was one random draw
from it. Its own tip even apologised ("most 8U leagues skip this rule"). A
scenario can now declare `needs:"<flag>"` and the picker only draws what the
league plays.

## v15, two bugs Stephen caught by watching
**All TEN multiple choice questions had the correct answer in slot one**, so a
kid could score 100 percent tapping the top button without reading. The
render shuffles now (authoring still puts the right answer first, because it
reads well in source; the child must never see that order).
**Repeats came fast** because every bank avoided only the previous question: a
seven question bank served five unique in seven pulls. Each bank is a bag
now, dealt shuffled, refilled only when empty.
The In testing badge came off the hub card the same round: his coach wanted
to share it with a travel coach neighbour, and that badge is the one the
genuinely passphrase locked Rock Stops wears.

## v16, the coach's first two notes
The **pitcher's circle is a tappable target** (look back rule, transcribed
from the USA Softball 2023 Rule Book, Rule 8 Section 7T, not recalled).
**Feedback carries the play**: room, league, chip, the question as asked, the
right answer, whether they answered and whether they missed first.
One bug worth remembering: the circle took no taps at all, because its ring
and its ping are both `fill:none`, and **an SVG shape with no fill receives no
pointer events**. The fielders carry a transparent disc for exactly this.

## v17, plain words, and the second baseman
The copy was measured before it was touched: vocabulary was already fine
(Flesch-Kincaid 1.3), the problem was VOLUME at a mean 58 words per question.
Rewritten to a mean of 33.9, worst 45. **Any new scenario should hold to about
35 words** across prompt, choice labels, why and tip.
His coach on the cover-first play: "pitcher or second base could run to cover
first and he's not wrong". The second baseman is accepted with her own
coaching line rather than a buzzer.
A bulk copy edit wrote one scenario's words into another's object because a
POS_BANK entry began `,{` instead of `{`. The suite now refuses two scenarios
sharing a prompt, and any question whose correct key is not among its choices.

## v18 to v22, EVERYBODY MOVES
The coach's big ask, and the first room that is not a quiz. Tap a bag for a
runner, tap anywhere, all nine walk to where they belong. Gold = handle the
BALL, green = cover a BASE, blue = BACK-UP a throw, which is Baseball
Positive's own three job sentence painted rather than written.

**`MV_TABLE` is data and it is sourced. Read `docs/DIAMOND-RULES-MOVE-SOURCES.md`
before touching a row.** Two researchers built the nine player matrix
independently, a third pass cross checked it, ten disagreements were resolved
in writing rather than averaged, and anything neither could source was cut.

Verified by sweep, not sampling: 112,288 tap-and-base-state cases. Always
nine jobs, exactly one on the ball, no bag covered twice, nobody off frame,
and **the base the app names as the best play always has somebody standing on
it**. The best play uses the SAME `forces()` the Grounders room uses, so the
two rooms cannot disagree about the same picture, and the suite compares them
directly.

Gotchas from these five versions, all found by driving it rather than reading:
- The bases paint above the fielders everywhere else, so girls standing on
  bags were invisible. In Move only, the fielders layer moves on top.
- Then a covering fielder's transparent 24 unit hit circle swallowed the bag
  beneath her, so after one play you could not add a runner to second. The
  bags have their own tap layer above everything (`#baseHit`).
- Toggling a runner started a 2700ms walk and every tap during it was
  dropped. The runner switches are always live and cancel the walk in flight.
- The tab row holds EIGHT items with zero overflow down to 320px, measured
  and pinned. `html` is `overflow:hidden`, so a ninth room would silently
  clip the Feedback tab rather than scroll.
- `.btn.tip` sets `display:flex`, which beats the browser's `[hidden]` rule.
  v22 added `[hidden]{display:none !important}`. Do not copy that button
  pattern anywhere without it.

Walk speed is 2700ms after Stephen watched it ("pretty good, wouldn't hurt to
be a little slower"). Zoom is deliberately not implemented: the lesson is the
whole field, and any zoom that magnifies a detail must crop players out of
frame. `user-scalable=no` was removed instead, so the phone can pinch.

## Open, waiting on the coach
1. Does 10U actually play the infield fly?
2. Is the look back circle taught the same way at 10U as 8U? On at both now.
3. Should the second baseman covering first be fully correct rather than the
   "that works too" answer she is?
4. Any assignment in the Move room that does not match how he coaches it.
   That is the highest value note he can send, and feedback from that room
   arrives with the zone, the runners and all nine assignments attached.
