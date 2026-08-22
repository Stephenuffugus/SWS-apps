# The class sweep, 2026-08-21 night

Six bug classes were found and fixed in one or two apps during the day. A class
found once is rarely alone, so six agents then hunted each class across the
whole fleet, and anything exploitable was handed to a second agent paid to
refute it. Sixteen agents, 1.67 million tokens, 858 tool calls.

Two CRITICALs came back and BOTH ARE FIXED AND LIVE:

* **Specials Planner** had a real, executed, persistent injection. A legend
  colour restored from a backup file went straight into a style attribute in
  the week grid, and a hex carrying a quote closes that attribute and adds its
  own markup. Reproduced end to end through the real interface under the
  shipped policy: it renamed the page and read sibling apps' data. Worse than
  it first looked, because on a fresh device the restore does not even ask
  first, and the payload is written back to storage so it re-fires forever.
* **Overload** still had one field: the history exercise name, which was added
  that same morning by the fix for the FIRST injection and given a sixty
  character cap rather than a sanitiser. An img tag with an onerror is
  twenty eight characters.

Three injection holes in one day, two of them introduced by fixes. The lesson
is not that the code is careless: it is that adding a field to a sanitiser is
exactly where attention lapses, and only a fresh adversarial pass catches it.

## Everything else the sweep found, still open

None of these lose data silently the way the two criticals could. The dominant
shape by far is an app that says "Saved" without knowing the write landed.

| Severity | App | Where | What |
|---|---|---|---|
| HIGH | grade-sheet | app.js:87 | `async function saveClass(c) { ... await S.putClass(c); await saveBook(); }` , no try/catch anywhere on the score-entry path. Every mark goes through  |
| HIGH | hush | index.html:731 | `set: (k, v) => { try { localStorage.setItem("hush." + k, JSON.stringify(v)); } catch { mem[k] = v; } }` paired with `get: k => { try { return JSON.pa |
| HIGH | moving-boxes | app.js:486 | save() at line 79 does warn: `catch (e) { if (Date.now() - saveWarned > 60000) { saveWarned = Date.now(); toast('⚠ Couldn’t save, storage may be full. |
| HIGH | rock-stops | sw.js:50 | The navigate branch writes EVERY in-scope navigation response to the fixed shell key, with no res.ok check and no check that the URL is actually the a |
| HIGH | seating-chart | app.js:771 | The guest-remove handler snapshots far more than the guest: `const before = { guests: project.guests.slice(), assignments: { ...project.assignments }, |
| MEDIUM | all apps (shared sws-ui.js) | sws-ui.js:161 | `SWS.undo` sets `pendingUndo = onUndo;` and only clears it on a timer: `setTimeout(clear, (opts.ms  |
| MEDIUM | astravault | ent | Every persisted store has the same shape: state is committed to zustand first, then the AsyncStorage write is awaited with no error handling. useColle |
| MEDIUM | cross-off, overload, specials-planner, grade-sheet | sw.js:44 | The NON-navigation branch falls back to the app's HTML when a subresource fetch fails. cross-off/sw.js:44 `}).catch(() => caches.match('index.html'))) |
| MEDIUM | grocery-list, team-parent, signup-sheets, caregiver-log | sw.js:10 | Install is all-or-nothing over a precache list that includes three cross-origin URLs: `caches.open(VERSION).then((c) => c.addAll(ASSETS))` where ASSET |
| MEDIUM | pdf-tools | app.js:67 | `const snapshot = () => ({ docs: docs.slice(), order: order.map(o => ({ ...o })), issues: issues.slice(), name: $('outName').value });` with `restore` |
| MEDIUM | qr-maker | app.js:81 | `try { d = JSON.parse(raw); } catch (e) { return; }   // corrupt → start clean` in `readStore()`. The app carries on with empty `saved` and empty `fie |
| MEDIUM | rock-stops | index.html:408 | `async put(store, obj) { ... if (useMem) { memDB.data[store].set(obj.id, structuredClone(obj)); return obj; } ... }` with `useMem` set at line 401 by  |
| MEDIUM | scan-to-pdf | app.js:311 | `del(id)` takes `const snapshot = pages.slice();` , the whole page array in its current order , and the undo at 323 does `pages = snapshot; persistRes |
| MEDIUM | sub-plans | app.js:153 | `try { data = JSON.parse(localStorage.getItem(KEY))  |
| LOW | all 26 apps using the shared template (baby-log, bill-splitter, bracket-maker, caregiver-log, cross-off, grade-sheet, grocery-list, home-inventory, image-compressor, moving-boxes, overload, packing-list, pdf-tools, pill-schedule, qr-maker, scan-to-pdf, seating-chart, secret-santa, signature-maker, signup-sheets, sitter-sheet, specials-planner, sub-plans, team-parent, wedding-timeline, wheel-picker) | sw.js:25 | The navigate branch stores the response with no status check at all: `fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).th |
| LOW | baby-log | app.js:927 | The backup-restore path takes `const snapshot = { name: data.name, events: data.events.concat(quarantined) };` and its 10-second Undo at 935 calls `in |
| LOW | cross-off, overload, specials-planner | sw.js:42 | The subresource branch is cache-first and caches whatever comes back, with no status check: `caches.match(e.request).then(hit => hit  |
| LOW | grocery-list | app.js:315 | `live.unsubs.push(D.watchBoard(boardId, (b) => { live.board = b; drawBoard(); }, ...))` inside `renderBoard(code)`, guarded by `if (live.code !== code |
| LOW | packing-list | app.js:191 | save() at line 115 is correct and latches a warning: `if (!saveBroken) { saveBroken = true; toast('This browser refused to save (out of room, or priva |
| LOW | signature-maker | app.js:878 | `guard($('clearBtn'), () => { const snap = snapshot(); wipe(null); undoToast('Cleared the pad, and the tab draft with it.', () => restore(snap)); })`. |
| LOW | signup-sheets | app.js:241 | `live.unsubs.push(D.watchSlots(boardId, (slots) => { live.slots = slots; syncClaimWatchers(); drawBoard(); }, ...))` , and `watchBoard` on 236 , insid |
| LOW | team-parent | app.js:211 | `live.unsubs.push(D.watchSlots(boardId, (slots) => { live.slots = slots; syncClaimWatchers(); drawBoard(); }, ...))` , and `watchBoard` on 209 , insid |
| HARMLESS | 22 template apps plus rock-stops | sw.js:35 | respondWith can settle with undefined. In the shared template the subresource branch ends `.catch(() => cached); return cached  |
| HARMLESS | astravault | sw.js:40 | `caches.open(CACHE).then((c) => c.put(SHELL, copy));` inside the navigate branch, where `SHELL = '/astravault/'` (line 9). Like rock-stops, every navi |
| HARMLESS | bill-splitter | index.html:3845 | `try { const lastId = await DB.get('misc', 'lastId'); if (lastId) { const row = await DB.get('trips', lastId); if (row) loaded = sanitizeState(row); } |
| HARMLESS | image-compressor | app.js:860 | `try { saved = JSON.parse(localStorage.getItem(PREF_KEY)  |
| HARMLESS | sws-backup.js (shared runtime) | index.html (script tag present i | A correction to the premise, not a defect. The brief says sws-backup.js was added to sixteen more apps and 'every one of those apps can now IMPORT a f |

## The shape to fix first

The silent-save cluster is one job, not eight. Cross Off and Overload already
have the pattern: save returns a result, a first failure raises a notice that
stays up until a save works, and nothing ever announces success it cannot
prove. Port that to Pill Schedule, Sitter Sheet, Grade Sheet, Wedding Timeline,
Moving Boxes, Secret Santa, Bracket Maker, Sub Plans, QR Maker, Rock Stops and
Astravault, in roughly that order.

Two of those hold things that matter more than the rest: a Sitter Sheet carries
a child's allergies, medication doses, where the EpiPen is and the address for
a 911 call; a Pill Schedule carries doses and times for somebody's parent. Both
currently say the work is saved without knowing that it is.

Rock Stops also has one of its own worth doing early: every user who taps
"Privacy and accessibility" once while online loses the offline app, because
the worker caches the wrong key. That was reproduced in a headless browser.

## How this was run, so it can be run again

One agent per bug class, each sweeping every app, each required to quote the
real line and to say plainly which apps are CLEAN. Then a skeptic per
exploitable finding, told to attack it and allowed to return HARMLESS. The
prompts are in the workflow script under the session's workflows directory.
Worth repeating after any change that touches a shared component, because that
is how one app's fix becomes twenty four apps' bug.
