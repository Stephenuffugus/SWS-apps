# OVERLOAD

A progressive-overload strength tracker built around one inversion of the
category: the engine writes the next workout, so logging collapses to one tap
per set. Prescribes weight × rep range × sets on a 3-day clock, judges every
session (ADD WEIGHT / ADD REPS / CONSOLIDATE / DELOAD −10%), offers a swap
after three stalled sessions, does plate math for barbell lifts, and tracks
the bodyweight trend with cut-aware guidance.

- Single-file vanilla PWA, no build step, no runtime dependencies.
- Everything persists to localStorage (`overload.v2`) on the device;
  JSON backup and restore in the Trend view.
- Fonts ship with the app; fully usable offline after first load.

## Run / test

```bash
python3 -m http.server 8000    # service worker needs http/localhost
node test/overload.test.mjs    # jsdom regression harness
```

See `HANDOFF.md` for the engine rules and the zero-typing UX invariant.
