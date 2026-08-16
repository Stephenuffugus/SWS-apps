# Trackfit self-hosted fonts — parked here so the codespace can close

This is work done in a checkout of `github.com/Stephenuffugus/trackfit` that
was never committed there. It is parked in this repo only to survive the
codespace shutting down. **It belongs in the Trackfit repo, not this one.**

Nothing here is deployed — Firebase serves `public: "apps"`, and this is under
`design/`.

## What it fixes

Trackfit loads Fraunces, IBM Plex Mono and IBM Plex Sans **from Google Fonts on
every cold load**. That sends the user's IP, User-Agent and Referer to
`fonts.gstatic.com` before anything renders, and it breaks the app anywhere
without signal — a basement or a club layout, which is where it is meant to be
used. None of the 23 apps here do this; the studio self-hosts.

## What's in the patch

- `apps/web/index.html` — the Google Fonts `<link>` block replaced with
  `@font-face` rules pointing at `./fonts/`
- `apps/web/vite.config.ts` — the now-dead `runtimeCaching` rules for
  `fonts.googleapis.com` / `fonts.gstatic.com` removed (they would silently
  re-enable the request the moment a stylesheet referenced them again), and
  `woff2` added to `globPatterns` so the faces precache

## Applying it

```sh
git clone https://github.com/Stephenuffugus/trackfit && cd trackfit
mkdir -p apps/web/public/fonts
cp <this-dir>/fonts/*.woff2 apps/web/public/fonts/
git apply <this-dir>/self-host-fonts.patch
pnpm install && pnpm build
```

## Verified

Latin subsets only, 152 kB across four files. Fraunces is the same face the
studio already self-hosts in `design/fonts/`. IBM Plex Sans was deduped to one
variable file.

Built and loaded in a real browser with request interception: **zero external
requests**, no console errors, blueprint aesthetic renders correctly.
