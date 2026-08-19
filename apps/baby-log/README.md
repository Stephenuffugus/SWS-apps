# Baby Log

Feeds (left/right/bottle), sleep sessions, diapers, logged with giant
one-thumb buttons because it's 3am and the other hand is holding a baby.
The status card answers the two questions parents actually ask ("how long
since the last feed?" "which side?"), today's summary copies as text for
shift handoff or the pediatrician, and sleep math handles sessions that
cross midnight (unit-tested). Data lives in IndexedDB on the phone, deliberately: baby-tracker apps are notorious data harvesters, and an
infant's schedule is nobody's business. Export/import for backups.
A free tool by Sky Wolf Studio.

`CONFIG.tipUrl` in `app.js` for the tip jar. Test: `node test/model.test.mjs`.
