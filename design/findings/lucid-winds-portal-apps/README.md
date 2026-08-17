# Parked: the 24 SWS practical apps on the Arcade portal

Stephen has asked at least twice for the SWS apps to appear in the Lucid Winds
Arcade (`Stephenuffugus/lucid-winds`). The portal's Free Apps shelf existed and
an Apps tab jumped to it, but the 24 SWS utilities themselves were never added.

The patch here fixes that: a **Practical Apps** block inside the `#free-apps`
section of `portal/index.html` — 24 cards generated from the live SWS hub page
(names, taglines, and Stephen's own `thumb-256.png` art, hotlinked from
`https://sws-apps-9646d.web.app`), each opening on its own origin in a new tab
(the Pom Pond rule), plus a final card linking the full hub.

It could not be pushed from the SWS-apps codespace: the container token is
scoped to SWS-apps and 403s on lucid-winds — the same trap as
`design/findings/trackfit-free/`. Proven by `git am` onto a pristine clone of
lucid-winds `main` (applies cleanly, tree identical to the tested version).

## To ship it

From any checkout of `Stephenuffugus/lucid-winds` with push access:

```
git am 0001-Portal-the-24-SWS-practical-apps-actually-on-the-she.patch
git push origin main        # Hostinger auto-deploys lucidwinds.com
```

Then verify: https://lucidwinds.com/portal/ → Apps tab → the Practical Apps
grid shows 24 thumbnail cards. Delete this folder once it is live.
