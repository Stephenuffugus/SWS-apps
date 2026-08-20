# HUSH, the depth campaign

Stephen, 2026-08-19: "I want Hush to be the number one sound machine app."
The family uses sound machines for Penny every night and could not find a
free one worth using. That makes this app's QA lab a real nursery, and the
bar is the premium hardware machines, not other free apps.

## Round 1, SHIPPED on branch `hush-depth` (this commit)

1. **True stereo bed.** The noise buffer is now two channels of INDEPENDENT
   noise, one per ear. This was the single biggest depth gap: mono copied to
   both ears sits flat inside the head; decorrelated stereo reads as air in
   the room. The whole existing filter graph (shelves, comb, characters) is
   multi-channel-safe and inherited it untouched, waves and passing cars now
   move in stereo for free.
2. **Width control** (Spectrum panel, default 70). Equal-power crossfade
   between a forced-mono leg and the wide leg. Zero = the old behaviour,
   for a single speaker across the nursery. Wired through SAVE_RANGES,
   sanitiseSaved, SHARE_KEYS and the slider system. Deliberately NOT in
   SOUND_DEFAULTS: presets never change the user's width, same ruling as S6
   (presets do not touch the volume of a dark room).
3. **Warmth drift.** A 1/300 Hz sine at ±0.45 dB rides the low shelf,
   always on, no control. One cycle every five minutes, below conscious
   perception; the ear never finishes adapting, which is a big part of why
   hardware machines feel "deeper" than static files.
4. **Buffer cache capped at 3 spectra** (stereo doubled the memory).
5. Shell v6, registration ?v=6, and the two selftest mutations that had
   gone stale against "hush-shell-v1" literals are now version-agnostic.

Suites after the round: `hush/tests/hush_tests.mjs` 119 ok, selftest all
mutations caught, `scripts/hush_audit.js` 155 ok.

**NOT PUSHED. main deploys to lucidwinds.com on push. Listen first:**
`cd hush && python3 -m http.server 8000`, A/B the Width slider at 0 vs 70
on headphones, then on a single speaker. Ship only after ears agree.

## Round 1.5, the heartbeat reads (same branch, Stephen's first listen)

Stephen on the live womb preset, 2026-08-19: heartbeat "so subtle I could
hardly hear it", asked for a heartbeat-vs-bed volume split. Shipped: the
heart bus lowpass opened 320 → 620 Hz (the old corner sat ON the knock
band the thump was designed around), the Amount slider relabels to
"Heartbeat" when the pulse is a heartbeat and now drives the bus gain
(1.05 to 2.0) so 100% is genuinely loud, and the per-beat bed duck deepened
.28 → .38 with a slower release, the masking release is what makes a
beat read, more than raw level. The main ring stays the bed's volume, so
the two-slider model he asked for exists: ring = sound, Heartbeat = beat.

He also ruled on the loop: infinite generation is DEPRIORITISED, voicing
quality first. Round 2 below only happens if a loop ever becomes audible
in real use.

## Round 2, the infinite engine (deprioritised, see above)

- **AudioWorklet generation.** Replace the 10-second looping buffer with a
  worklet that synthesises the noise sample-by-sample, forever: no loop
  point, no seam, no pattern memory, less RAM. This is how LectroFan-class
  hardware works and why it never repeats. Keep the buffer path as fallback
  for browsers without worklet. The Paul Kellet pink filter and the brown
  integrator port to the worklet unchanged.
- **Per-ear drift decorrelation:** slightly different drift phase L/R.
- **Texture stereo pass:** rain droplets panned individually (grain spray),
  fan flutter given a slow rotation, surf breaks placed off-centre.
- **Brown sub-body:** a second pole around 40 Hz for headphone/speaker
  listeners; phones cannot say it, speakers can.

## Round 3, the nursery hardware story

- **iOS screen-off (stage 2, from AUDIT-NOTES S10):** the `<audio>` element
  sink experiment needs a physical iPhone. Penny's household devices are the
  test hardware. Until measured, the wake-lock posture stays.
- **Play packaging:** as a TWA on Android, audio already survives screen-off
  (it is Chrome). Hush's Play origin decision: move the app into the
  SWS-apps repo and serve at skywolfstudio.com/hush so it packages with the
  suite (Stephen 2026-08-19: all apps on the new domain). The lucidwinds.com
  copy can redirect or stay as a mirror, decide at packaging time, before
  bubblewrap init, never after.
- **MediaSession metadata** so the lock screen shows "HUSH, Brown noise"
  with a stop button, once the element-sink path exists to hang it on.

## The bar

Number one means: never repeats (worklet), fills the room (stereo bed),
never startles (caps, fades, preset volume ruling), tells the truth about
the science (already does), free with no catch (already is), and survives
the screen going dark on both platforms (Android yes, iOS round 3).

## The tagline (Stephen, 2026-08-19)

**"Pick your sound. Lock your screen. Go to sleep."**, verbatim on the
Play listing (Android, where the middle sentence is true). The web page
runs "Pick your sound. Go to sleep." until iOS stage 2 makes the lock
claim true there too; then the full line goes everywhere.
