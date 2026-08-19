# Trackfit → free app: two commits, parked here because I can't push them

These belong in `github.com/Stephenuffugus/trackfit`. They are parked in this
repo because this codespace's token is scoped to SWS-apps and got a 403 pushing
to trackfit, and the work would otherwise die when the codespace closes.

Nothing here is deployed, Firebase serves `public: "apps"`, and this is under
`design/`.

## Applying them

```sh
git clone https://github.com/Stephenuffugus/trackfit.git && cd trackfit
git checkout -b free-app
git am <this-dir>/*.patch
pnpm install && pnpm verify
```

**Verified**: applied cleanly to a fresh clone from GitHub at `550476c`, which
is what these were authored against.

Pushing the branch deploys nothing, `.github/workflows/deploy.yml` fires on
`push: branches: [main]` only.

## 0001, self-host the fonts

Every cold load sent the user's IP to `fonts.gstatic.com` before anything
rendered, and the app broke in a basement with no signal, which is exactly
where it is meant to be used. Latin subsets, 152 kB for four faces. Also drops
the Workbox `runtimeCaching` rules for the Google hosts, which would have
re-enabled the request the moment a stylesheet referenced them again.

## 0002, make it free

Removes the paid tier (premium.ts, PremiumGate, PremiumModal,
LicenseActivation, PremiumPricingTest, pricing-feedback, the Payhip links,
every `VITE_PREMIUM_*`) and photo identification (identify-piece.ts, the
Supabase edge function, the Cloudflare worker, both proxy env vars), and pulls
the `affiliate_tag` plumbing out of `packages/marketplace` so it can't be
switched on by accident. Everything that was gated is now simply available.

**Verified green before parking**, re-run by me rather than taken on trust:

| | |
|---|---|
| `pnpm -r run typecheck` | pass |
| `pnpm -r test` | 84 passed, 1 skipped |
| `VITE_BASE_PATH=/trackfit/ pnpm build` | 16 precache entries, 1027 KiB |
| `grep -rn "fetch(" apps/web/src packages/*/src` | **no matches** |

That last row is the one that matters: there is no code path left that talks to
a server, which is what makes "nothing leaves your device" literally true for
this app rather than nearly true.

## Not done by these patches

- **25 Founder licence hashes** were issued for Payhip auto-delivery on
  2026-05-29 (`premium.ts:97` before removal). Anyone who paid now gets
  everything free, which is fine, but they may be owed a note. Owner's call.
- **A Cloudflare Worker named `trackfit-vision` holding an `ANTHROPIC_API_KEY`**
  is described in `docs/SETUP-PHOTO-ID.md`. If it was ever deployed it is still
  live and still billable. Not reachable from this machine, **inferred from
  the docs, not verified.** Check `dash.cloudflare.com`.
- The dead `VITE_PREMIUM_*` / `VITE_*_PHOTO_ID` GitHub Actions secrets.
- `MONETIZE_HANDOFF.md` still asserts the app has a freemium gate, and is
  addressed to "another Claude instance helping the owner figure out how to
  make money from this project". Delete it or head it `SUPERSEDED`, or the next
  agent re-litigates a settled decision.
