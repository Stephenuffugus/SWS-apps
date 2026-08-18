# Cross Off

A paper to-do list you cross off with real highlighters. Priorities that
auto-group (NOW / TODAY / SOON), beat-the-clock countdowns with personal
records, a focus screen, a multi-page notebook, and the morning page-flip:
yesterday's marked-up page goes to a flip-back pile with its ink intact,
unfinished tasks carry forward with nothing said about it, and daily chores
rewrite themselves onto the fresh page.

Made for the way an ADHD brain actually works: no overdue labels, no dying
streaks, no guilt copy, zero onboarding. The celebration fires on wins and
never nags.

- Single-file vanilla PWA, no build step, no runtime dependencies.
- Everything persists to localStorage (`crossoff.v1`) on the device.
- Fonts ship with the app; fully usable offline after first load.

## Run / test

```bash
python3 -m http.server 8000    # service worker needs http/localhost
node test/cross-off.test.mjs   # jsdom regression harness
```

See `HANDOFF.md` for the architecture and the three gesture/render
invariants that must never regress.
