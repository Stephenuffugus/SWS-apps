# Packing List

Smart packing checklists: start from trip presets (essentials, beach, camping,
business, with-kids, international, winter), add your own items, rename or
remove any of them, and check things off as they hit the bag.

**Many trips, not one.** Trips are kept under `packing-list.trips` and switched
from a picker; "Duplicate, unpacked" copies a trip's items with the ticks
cleared, which is how you start next month's trip from last month's. The old
single-list key `packing-list` is migrated on first load and then kept in sync
with the active trip, so a browser still serving the previous `app.js` from its
service-worker cache does not open to an empty list.

Everything is local. A list travels inside the URL fragment of a shareable link
or a QR code (checks reset for the recipient); a fragment is never sent to a
server. Arriving with a shared link offers four choices — open as a new trip,
merge, replace, or keep mine — and every one of them, plus every delete and
"Uncheck all", is undoable from the toast.

Limits are named where they bite: item names cap at 60 characters, a share link
carries 300 items, and a QR that will not fit says so and points at Copy link
instead of failing.

`CONFIG.tipUrl` in `app.js` for the tip jar.

Verify: `node test/helpers.test.mjs`, `node design/stress.mjs packing-list`,
`node design/a11y.mjs packing-list`.
