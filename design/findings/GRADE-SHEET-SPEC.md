# Grade Sheet — build specification

**Status:** ready to implement. `apps/grade-sheet/`. Studio app #24, School category #3.

---

## 0. Read this first — the honest answer

**The pitch:** *A private mark book for the teacher who has 25 classes and 600 children — paste your rosters in ten minutes, mark a class in ten seconds between periods, print what you need, and nothing ever leaves the computer.*

**"Why would she use this when the district already gives her a gradebook?"**

The research found a convincing answer **for one specific shape of teacher and a weak one for everybody else.** Both halves matter and the owner should hear them now, not after the build.

The convincing half:

- **The SIS is a desk application and specials teaching is not a desk job.** Two independent teacher reviews name our exact use case: an Aeries user, *"I use it to take roll outside when I'm teaching P.E... this year the app just says that attendance is locked... they said the app is just bad"* (3 stars, v1.2.33); a TeacherVUE user, *"As a PE teacher who is outside it would be nice to have access to the synergy grade book through the TeacherVUE mobile app"* (1 star, v6.9). The teacher-facing SIS mobile clients sit at 1.6–1.9 stars (TeacherVUE 1.6/8, Aeries Teacher 1.9/42, Skyward Mobile 1.8/3,573; all retrieved 2026-08-16).
- **They lose work.** TeacherVUE, 2 stars, v9.1: *"in the time it took me to score a small handful of assignments the app logged off. However the screen in the grade book didn't change and I only found out after I entered the grades and then tried to save at which point I got a failed notice."* We have no session and no server, so we cannot reproduce that failure. That is a real, structural advantage, not marketing.
- **The market has already answered.** Teachers Pay Teachers today lists 5,200+ results for "gradebook", 1,600+ for "editable gradebook", 200+ for "art gradebook", 100+ for "music gradebook", 43 for "PE gradebook" (retrieved 2026-08-16). Teachers are *paying each other* for gradebook spreadsheets while sitting in front of a district SIS they were required to adopt. Jessie is not an outlier; she is the median of this cohort.
- **The incumbent is not the SIS. It is a spreadsheet**, and the spreadsheet loses on structure, on mobile, and on formula fragility. That is what we are replacing.

The weak half, stated plainly:

- **This is a second place the grades live, and she still has to hand-type the term marks into the SIS.** We do not remove the double entry. We make the working half of it fast and give her a printed final-marks list in the SIS's own sort order so the typing takes five minutes instead of an hour. If the owner wants "eliminates double entry," that requires SIS sync, which requires OAuth, per-district approval and vendor paperwork we cannot service — see §10.
- **For a secondary teacher with five sections and a working SIS on her desk, this app is probably not worth the double entry.** We should not pretend otherwise in the marketing. The app is for the specials teacher, the substitute, the student teacher, the adjunct, the teacher at a school with no SIS, and the teacher in the first six weeks of a new district before her credentials arrive.

**One thing the competition lens got wrong and it must not reach the app.** That lens proposed building the product around FERPA's sole-possession exclusion (34 CFR § 99.3) — "kept in the sole possession of the maker... used only as a personal memory aid." A gradebook fails that test in ordinary use: marks are transcribed into the SIS, printed on report cards, and shown to parents. Writing "your gradebook is a sole-possession record, so FERPA does not apply" would be legally wrong **and** would be us giving a teacher legal advice. **It must never appear in the app, the README, the store listing, or the marketing.**

The argument that actually works is simpler and unassailable: **there is no disclosure, because there is no flow.** § 99.3 defines disclosure as permitting access to or communicating PII *to any party*. Nothing reaches us. PTAC makes the same point from the other side (*Protecting Student Privacy While Using Online Educational Services*, PTAC-FAQ-3, Feb 2014, p.2): where a service receives no PII, *"no PII from the students' education records would be disclosed to (or maintained by) the provider."* We do not qualify for the school-official exception. We do not need it. State facts; let a district's counsel draw the conclusion.

---

## 1. Name

**Grade Sheet** — `apps/grade-sheet/`.

Three jobs at once: it matches the studio's `<thing> Sheet` construction (Sitter Sheet) so it reads as family; "sheet" quietly names the incumbent she is coming from without saying "spreadsheet"; and it does *not* overclaim. "Gradebook" with a capital G is what the district calls the SIS module she is legally required to use, and a free app that appears to compete with the system of record is one a principal might object to. "Grade Sheet" is obviously her own working document.

Title tag: `Grade Sheet — Free Offline Gradebook for Teachers, Nothing Uploaded`.

Runners-up, for the record: **Roll Book** (better warmth, the correct traditional name for the teacher's own book as distinct from the school's register, pairs beautifully with Sub Plans — but reads dated to some US teachers and under-indexes on "gradebook"); **Grade Book** (best pure SEO, highest overclaim risk); **Mark Book** (sidesteps the SIS collision entirely, too Commonwealth for a US elementary teacher). Avoid anything with "Teacher" in it — TeacherKit is delisted from Google Play and gone from the US App Store under its own name, A+ Teacher's Aide has not shipped since 2019, TeacherEase sits at 2.0 stars. Bad neighbourhood, no upside.

---

## 2. Scope

### v1 — the smallest thing that is genuinely useful on day one

Day one is a day in late August. She must be able to get her rosters in, and mark a class the following Monday.

1. **Roster paste with a column picker** (§6.2). Non-negotiable front door.
2. **Classes** with a name, a period, and an optional set of cycle-day labels.
3. **Today screen** — the classes meeting today, in period order, with per-class "N not scored" (§6.1).
4. **Session sweep** — one dated mark for a whole class, fix the exceptions (Loop B, §6.3).
5. **Score run** — keyboard-first column entry down a roster (Loop A, §6.4).
6. **The full verified grading engine** — total points and weighted categories, four score states, extra credit, drop-lowest, redistributed weight with the disclosure sentence, both projections, `roundHalfUp`, editable letter scales (§5).
7. **Show your work** — a disclosure behind every computed number that prints the literal arithmetic.
8. **Five print jobs** (§6.7): blank grid, final-marks list, class grid, progress reports (all students, one job), substitute roster.
9. **Backup as a first-class feature** — File System Access re-save, JSON restore, long-format CSV, last-backup age in the header, wipe detection (§8).
10. **Privacy screen** (Escape blanks every name), display-name mode, "What this app knows" panel.
11. Offline PWA, print stylesheet, undo everywhere, `sws-prefs.js`, `sws-ui.js`.

### Explicitly v2 or later — cut with reasons

| Cut | Why |
|---|---|
| Full rotation calendar (cycle generation, snow-day cascade, no-class days) | That is Specials Planner's job and it already does it well. v1 ships a one-field day cycle she corrects with a tap (§6.1). Duplicating a year-generation engine here doubles the app for a screen she looks at for two seconds. |
| Standards-based grid (students × standards, five rollup rules, standards library) | ~20–25% more code, almost all view code, and it needs a second print layout. v1 answers Jessie's actual need — an E/S/N report-card mark — with a **letter scale she sets herself** plus **mark schemes** on assignments (§4.4, §5.2). No invented conversion table. |
| Late-penalty engine (flat, per-day, waivers, due/submitted dates) | Every penalty rule is district policy we would be guessing at, and it doubles the "show your work" surface. `late` ships as a flag that records the fact and prints. |
| Retake / attempt lists | Entering a new score replaces the old one and undo restores it. Attempt history is v2. |
| Enrolment date windows that auto-excuse | Replaced by "Excuse all ungraded for this student" — one action, same outcome, no date machinery. |
| Seating-chart entry order, cross-class student search, sparklines, "what do I need on the final", per-class colours, relative `+2` edits | All good. All after the two loops are proven. |
| Terms as a first-class dimension | v1 ships **one book, one term**, with "Start a new term" = export, archive to a read-only copy, keep roster and categories, clear scores. That is the whole value of terms at a tenth of the model complexity. |

---

## 3. Files

```
apps/grade-sheet/
  index.html      chrome, all screens, app CSS layer, print CSS
  grade.js        the grading engine — pure, no DOM, unit-testable
  store.js        IndexedDB, autosave, backup, File System Access, wipe detection
  roster.js       clipboard parsing, delimiter detection, column picker
  print.js        the five print jobs
  sw.js  manifest.webmanifest  privacy.html  icons  sws-prefs.js  sws-ui.js
  test/           node tests for grade.js against the table in §5.6
```

Sibling ES modules, no build step, no npm at runtime. `grade.js` is a straight port of the verified reference at `/tmp/claude-1000/-workspaces-SWS-apps/d8791b98-e937-4b47-be53-c522fb8eed80/scratchpad/grade.mjs`; `verify.mjs` and `verify2.mjs` come with it into `test/`.

---

## 4. Data model

### 4.1 Storage

IndexedDB database **`sws-gradesheet`**, version 1. Three object stores:

| Store | Key | Holds |
|---|---|---|
| `meta` | `'book'` | the single book record — settings, day cycle, class index, id counters |
| `classes` | `class.id` | **one record per class**, holding that class's entire payload: roster, categories, assignments and all its scores |
| `files` | `'backupHandle'` | the persisted `FileSystemFileHandle` for one-click re-save |

**Why one record per class and not one record per score.** Jessie is 25 classes × ~24 students × ~40 assignments ≈ 24,000 cells. Per-cell records make the Today screen read the whole book to render. Per-class records let Today render from `meta` alone and load exactly one class on open — which is also the privacy posture (§7: one class at a time, never a whole-school view). A class record is roughly 40–120 KB. The maths lens proposed localStorage; **that is corrected** — 25 classes will not fit in ~5 MB and localStorage is synchronous on the entry path.

localStorage keys, exactly two, neither containing student data:

- `sws.gradesheet.seen` — an ISO date, written on first real save. One of the two independent markers used for wipe detection (§8.5).
- `sws.prefs` — the shared studio comfort settings, as in all 24 apps.

### 4.2 `meta` — the book record

```js
{
  v: 1,
  createdAt: '2026-08-20T14:02:11.114Z',
  updatedAt: '2026-09-16T15:41:02.660Z',

  teacherName: '',                 // optional, prints in the footer. Never required.
  schoolYear: '2026–27',           // free text, prints
  termName: 'Quarter 1',           // free text, prints

  nameDisplay: 'firstLast1',       // 'full' | 'firstLast1' | 'initials'   DEFAULT firstLast1
  privacyScreen: false,            // current state of the blanking toggle
  startHidden: false,
  idleMaskMinutes: 5,              // 0 = off

  dayLabels: ['Mon','Tue','Wed','Thu','Fri'],   // or ['A','B','C','D','E','F']
  dayCursor: 0,                    // index into dayLabels
  dayCursorDate: '2026-09-16',     // the date dayCursor was true for

  lastOpened: { classId: 'cls_7', assignmentId: 'asg_113', at: '...' },

  backup: {
    lastExportAt: '2026-09-14T22:10:44.000Z',
    lastExportKind: 'file',        // 'file' | 'download'
    changesSinceExport: 42,
    handleName: 'grade-sheet-backup.json'   // shown, so she knows which file
  },

  classIndex: [                    // everything Today needs, without loading a class
    { id:'cls_7', name:'2 Kowalski', period:3, days:['A','C'],
      students:24, notScored:3, updatedAt:'...' }
  ],

  counters: { cls: 12, stu: 613, asg: 214 }
}
```

Ids are readable and stable: `cls_7`, `stu_412`, `asg_113`. Readable ids are worth a little length because they appear in the export a human has to make sense of.

### 4.3 A `classes` record

```js
{
  id: 'cls_7',
  name: '2 Kowalski',              // "Grade — homeroom teacher" is the default prompt shape
  period: 3,
  days: ['A','C'],                 // subset of meta.dayLabels; [] = no schedule, always shown
  archived: false,

  model: 'total-points',           // 'total-points' | 'weighted-categories'  DEFAULT total-points
  dp: 1,                           // 0 | 1 | 2 — display decimals
  capAt100: false,
  dropLowest: 0,                   // total-points model only
  scale: [ {label:'A',min:90}, {label:'B',min:80}, {label:'C',min:70},
           {label:'D',min:60}, {label:'F',min:0} ],

  categories: [
    { id:'cat_1', name:'Participation', weight:100, dropLowest:0 }
  ],

  students: [
    { id:'stu_412', first:'Jacob', last:'Moreno', tag:'', sid:'', note:'', active:true }
  ],

  assignments: [
    { id:'asg_113', categoryId:'cat_1', name:'Participation — 16 Sep', date:'2026-09-16',
      pointsPossible: 4,
      scheme: 'levels4',           // see 4.4
      extraCredit:false, ecScope:'category', neverDrop:false, includeInGrade:true,
      sweep:true }                 // created by the session sweep; one per class per date
  ],

  scores: {
    'asg_113': {
      'stu_412': { state:'graded', points:4 },
      'stu_419': { state:'missing', absent:true, note:'nurse' },
      'stu_420': { state:'excused' }
    }
  }
}
```

`scores` is **assignment-major** because the dominant entry act is a column down a roster (Loop A) and the sweep writes a whole column at once.

### 4.4 The score record — states and flags

**Four arithmetic states, an explicit enum, never inferred from a value:**

| `state` | meaning | numerator | denominator |
|---|---|---|---|
| `ungraded` | not marked yet. **This is the default; an absent record is identical to it.** | excluded in "so far", 0 in the projection | excluded in "so far", counted in the projection |
| `graded` | `points` is meaningful, including a real typed `0` | `points` | counted |
| `missing` | not turned in | 0 | counted |
| `excused` | does not apply to this child | excluded | **excluded** |

**Two flags, orthogonal to state, with no arithmetic effect whatsoever:**

- `absent: true` — *she wasn't here.* Attaches to any state. This is the normal reason a specials cell is empty: weekly contact means one 40-minute lesson is ~3% of a term's contact time, so absence is the common case, not the exception. One tap converts `absent + ungraded` → `excused`.
- `late: true` — records the fact, prints on the progress report, changes no number.

**`note`** — free text on any cell. Prints on the progress report **even when the cell has no score** (this is a named defect in a competitor: *"The notes that are written for students on assignments or exams do not show up when I run reports unless the assignment has a grade"* — AceticAcid, A+ Teacher's Aide, 22 Apr 2020).

**Correction to the workflow lens.** It proposed a book-level setting "missing counts as zero, or is excluded." **Cut.** "Missing, excluded from the average" is arithmetically identical to `excused`, which already exists and is better named. One state, one meaning: **missing always counts as zero, and the cell says so** (`aria-label="missing, counts as zero"`). This removes a setting, a branch, and a whole class of "why is this number different" support questions we cannot answer.

**Cell rendering** — the arithmetic depends on these being distinguishable, and a `missing` and a graded `0` produce the same number, so the visual difference is the only thing carrying the meaning. **Never colour alone** — GradeBook Pro's 2025 redesign removed colour from its attendance grid and four teachers wrote reviews within eight weeks saying they could no longer use it (*"why did you remove the colors"* — DGGideon, 13 Aug 2025; *"nearly impossible to see. Time to look for something new"* — UsagiPJ, 30 Sep 2025).

| state | glyph | fill | edge | accessible name |
|---|---|---|---|---|
| `ungraded` | empty | — | faint dotted underline | "not graded yet" |
| `graded` | the number | — | — | "18 out of 20" |
| graded `0` | `0`, full `--ink` | — | — | "zero" |
| `missing` | `M` | `--neg-soft` | 3px `--neg` left bar | "missing, counts as zero" |
| `excused` | `Ex` in `--ink-2` | `--surface-2` | — | "excused, not counted" |
| `absent` flag | small `·` before the glyph | — | — | "…, absent" |
| `late` flag | superscript `L` | — | — | "…, late" |

### 4.5 Mark schemes

An assignment's `scheme` decides **only how the cell is rendered and what the entry pad offers.** It never changes the arithmetic — a level *is* points.

| `scheme` | pad | `pointsPossible` |
|---|---|---|
| `points` | numeric keypad | anything ≥ 0 (default) |
| `levels4` | 4 / 3 / 2 / 1 | 4 |
| `levels3` | ✓+ / ✓ / ✓− | 3 |
| `esn` | E / S / N | 3 |
| `pf` | P / F | 1 |

This is how Jessie gets the report-card mark her form actually wants without us inventing a district conversion table. She sets the **class letter scale** to `E 90 | S 70 | N 50 | U 0` and marks a 4-point rubric; the engine computes a percentage and the scale she chose turns it into an E. The mapping is hers, visible, and printed on every report. The maths lens was right that we must not invent a level→percentage table; it was wrong that this forces a whole second scoring mode into v1.

### 4.6 Settings that exist, and the ones that do not

Exist: `nameDisplay`, `privacyScreen`, `startHidden`, `idleMaskMinutes`, per class `model`, `dp`, `capAt100`, `dropLowest`, `scale`, `categories[].weight`, `categories[].dropLowest`.

Do not exist, deliberately: a missing-work policy toggle (§4.4), a PIN, a theme (that is `sws-prefs.js`), a "minimum grade floor", a rounding-mode choice (half-up, always), any AI setting.

### 4.7 The export file

**One action, two files. Both are the teacher's, not ours.**

**A. `grade-sheet-backup-2026-09-16.json`** — full fidelity, re-importable, and deliberately readable. Studio envelope, so it sits in the same family as every other app's backup:

```json
{
  "sws": 1,
  "app": "grade-sheet",
  "name": "Grade Sheet",
  "version": 1,
  "exportedAt": "2026-09-16T15:41:02.660Z",
  "readme": [
    "This is your gradebook. It is a plain text file — you can open it in Notepad.",
    "To put it back: open Grade Sheet, choose Restore from a file, and pick this file.",
    "If Grade Sheet no longer exists, everything you need is still readable below,",
    "and the CSV file saved alongside this one opens in Excel or Google Sheets.",
    "Grades are not stored in this file. Only the marks you typed are — every",
    "percentage is worked out fresh from them, so nothing here can go stale."
  ],
  "book": { "...meta, minus classIndex and lastOpened..." },
  "classes": [
    {
      "id": "cls_7", "name": "2 Kowalski", "period": 3, "days": ["A","C"],
      "model": "total-points", "dp": 1, "capAt100": false, "dropLowest": 0,
      "scale": [{"label":"A","min":90}, "..."],
      "categories": [{"id":"cat_1","name":"Participation","weight":100,"dropLowest":0}],
      "students": [{"id":"stu_412","first":"Jacob","last":"Moreno","tag":"M.","sid":"","note":"","active":true}],
      "assignments": [{"id":"asg_113","name":"Participation — 16 Sep","date":"2026-09-16",
                       "categoryId":"cat_1","pointsPossible":4,"scheme":"levels4",
                       "extraCredit":false,"neverDrop":false,"includeInGrade":true}],
      "scores": [
        {"assignment":"asg_113","assignmentName":"Participation — 16 Sep",
         "student":"stu_412","studentName":"Jacob Moreno",
         "state":"graded","points":4}
      ]
    }
  ]
}
```

Two deliberate redundancies: `scores` is a flat array with `assignmentName` and `studentName` repeated on every row, so a human reading the file in Notepad can follow it, and so a partially corrupted file is still partly salvageable by eye. Costs ~30% file size on a file that is under 2 MB. Worth it. **No computed percentage, letter, subtotal or drop decision appears anywhere in the file** — storing derived values means a scale edit leaves a stale number somewhere.

**B. `grade-sheet-marks-2026-09-16.csv`** — long format, one row per cell, opens anywhere, outlives us:

```
Class,Period,Student,Student ID,Assignment,Date,Category,Points possible,Score,State,Absent,Late,Note
2 Kowalski,3,"Moreno, Jacob",,Participation — 16 Sep,2026-09-16,Participation,4,4,graded,,,
2 Kowalski,3,"Nguyen, Ada",,Participation — 16 Sep,2026-09-16,Participation,4,,missing,yes,,nurse
```

**Filenames never contain a student name.** They appear in Downloads, in print queues, in email previews and on projected file pickers.

**Import** replaces wholesale, and always previews first: *"This file was saved on 14 September 2026 and holds 25 classes, 612 students and 214 assignments. Restoring replaces everything currently on this device."* Rejects a file whose `app` is not `grade-sheet`. Undo is not available across a restore, so this is one of the legitimate confirms.

---

## 5. The grading algorithm

The maths lens is **sound and verified** (`optimalKeep` vs brute force 4,000/4,000 exact; monotonicity 15,604/15,604; zero letter/display contradictions across 7,300 sampled percentages × 3 precisions). It is carried through verbatim below, with the corrections named in §5.5.

### 5.1 The engine

**Units.** On read, convert every points value to integer **centipoints** (`round(x*100)`). All sums are integer. Only the final divisions produce floats. (`2.25 + 1.75 + 4.5` over `2.5 + 2.5 + 5` gives exactly 85 via centipoints; naive float addition of `0.1 + 0.2` gives `0.30000000000000004`.)

**Rounding primitive.**
```js
function roundHalfUp(x, dp) {
  if (x === null || !isFinite(x)) return x;
  const s = x < 0 ? -1 : 1, v = Math.abs(x);
  if (v < 1e-9) return 0;                          // guard: toString() must not go exponential
  const shifted = Number(v.toString() + 'e' + dp); // decimal shift via the string, NOT v * 10**dp
  return s * Number(Math.round(shifted).toString() + 'e-' + dp);
}
```
`Math.round(1.005*100)/100` is `1` (wrong); this gives `1.01`. `Math.round(8.575*100)/100` is `8.57` (wrong); this gives `8.58`.

**Participation.**
```js
function participation(state, includeUngraded) {   // -> {m} | null
  if (state === 'excused')  return null;                        // out of BOTH sums
  if (state === 'ungraded') return includeUngraded ? {m:0} : null;
  if (state === 'missing')  return {m:0};                       // denominator still counts
  return {m: enteredPoints};                                    // 'graded'
}
```

**Extra credit.** `isExtraCredit(a) = a.extraCredit === true || !(a.pointsPossible > 0)`. Numerator only. **Never eligible for dropping.**

**Category aggregate.**
```js
function categoryAggregate(items, rules, includeUngraded) {
  const live = items.map(it => { const p = participation(it.state, includeUngraded);
                                 return p && {...it, m: p.m}; }).filter(Boolean);
  const ec        = live.filter(isExtraCredit);
  const scored    = live.filter(it => !isExtraCredit(it));
  const neverDrop = scored.filter(it => it.neverDrop);
  const droppable = scored.filter(it => !it.neverDrop);
  let kept = droppable, dropped = [];
  if (rules.dropLowest > 0 && droppable.length > 0) {
    const keep = Math.max(1, droppable.length - rules.dropLowest);  // NEVER empties a category
    ({kept, dropped} = optimalKeep(droppable, keep, neverDrop));
  }
  const counted  = kept.concat(neverDrop);
  const earned   = sum(counted, 'm') + sum(ec, 'm');
  const possible = sum(counted, 'pointsPossible');
  const pct      = possible > 0 ? (earned / possible) * 100 : null;  // null, never 0, never Infinity
  return {earned, possible, pct, dropped, counted, extraCreditPoints: sum(ec,'m')};
}
```

**`optimalKeep` — Dinkelbach parametric search.** Maximise `(Σm over S + fixM) / (Σn over S + fixN)` subject to `|S| = keep`. Exact, `O(k log k)` per iteration, under 6 iterations in practice.
```js
function optimalKeep(droppable, keep, neverDrop) {
  if (keep >= droppable.length) return {kept: droppable, dropped: []};
  const fixM = sum(neverDrop,'m'), fixN = sum(neverDrop,'pointsPossible');
  const ratio = S => { const d = sum(S,'pointsPossible') + fixN;
                       return d ? (sum(S,'m') + fixM) / d : 0; };
  const pick = q => rank(droppable, it => it.m - q*it.pointsPossible, 'desc').slice(0, keep);
  //  tie-breaks, display only (tied items have identical m and n):
  //   1. higher m/n first
  //   2. higher stateRank first  (graded=2, ungraded=1, missing=0) — so a `missing` is marked
  //      dropped before a projected ungraded zero, keeping the dropped CELL identical in the
  //      "so far" and "projected" views
  //   3. higher seq first — drop the earliest tied item, stable as new work arrives
  let S = topBy(droppable, it => it.m / it.pointsPossible, keep), q = ratio(S);
  for (let i = 0; i < 64; i++) {
    const S2 = pick(q), q2 = ratio(S2);
    if (q2 <= q + 1e-12) { S = S2; break; }
    S = S2; q = q2;
  }
  return {kept: S, dropped: droppable.filter(it => !S.includes(it))};
}
```

**Total-points model.** `grade = categoryAggregate(all rows, {dropLowest: cls.dropLowest}, includeUngraded); raw = grade.pct`.

**Weighted-categories model.**
```js
function classGrade(cls, rows, includeUngraded) {
  const courseEC = rows.filter(r => r.extraCredit && r.ecScope === 'course');
  const per = cls.categories.map(c =>
        categoryAggregate(rowsIn(c).filter(r => !courseEC.includes(r)),
                          {dropLowest: c.dropLowest}, includeUngraded));
  const active = per.filter(p => p.pct !== null && p.cat.weight > 0);
  const W = sum(active, 'cat.weight');                  // "weight counted so far"
  let raw = W === 0 ? null : sum(active, p => p.pct * p.cat.weight) / W;
  const ecPts = sum(participating(courseEC), 'm');      // already in percentage points
  if (raw !== null) raw += ecPts;
  effectiveWeight(c) = active(c) ? (c.weight / W) * 100 : 0;
}
```
Dividing by `W` **always** is a no-op when weights sum to 100 and nothing is empty; it scales *up* when a category is empty (matching Canvas) and scales *down* when the teacher's weights sum to more than 100 (Canvas does not — its `CourseGradeCalculator.ts` reads `else if (fullWeight < 100)`, so weights of 45/40/20 with 80/90/100 gives Canvas 92.0% and gives us 87.6%).

**Finish.**
```js
function finish(cls, raw) {
  if (raw === null) return {raw:null, display:null, letter:null};   // UI shows "—"
  const r = cls.capAt100 ? Math.min(100, raw) : raw;
  const display = roundHalfUp(r, cls.dp);
  return {raw: r, display, letter: letterFor(display, cls.scale)};  // letter from the DISPLAYED number
}
function letterFor(display, scale) {                 // scale sorted by min DESC, bottom min === 0
  if (display === null) return null;
  for (const b of scale) if (display >= b.min) return b.label;
  return scale[scale.length - 1].label;              // defensive
}
```

**Two projections, always both computed.**
```js
gradeSoFar = classGrade(cls, rows, /*includeUngraded*/ false);   // DEFAULT, the headline
projected  = classGrade(cls, rows, /*includeUngraded*/ true);    // "if nothing else is turned in"
```
**Never** show `projected` as the headline. In week 2 with one quiz entered it reads 3%.

### 5.2 Letter scales

Default on a new class: traditional 10-point, no plus/minus — `A 90 | B 80 | C 70 | D 60 | F 0`.

One tap each: **plus/minus** (`A+ 97, A 93, A- 90, B+ 87, B 83, B- 80, C+ 77, C 73, C- 70, D+ 67, D 63, D- 60, F 0`); **rounded-up 10-point** (`A 89.5 | B 79.5 | C 69.5 | D 59.5 | F 0` — this is how a teacher who says "I round up" should express it; it is a *cutoff* change, not a rounding change, and expressing it as a cutoff is exact); **E/S/N/U** (`E 90 | S 70 | N 50 | U 0`); **4/3/2/1** (`4 90 | 3 80 | 2 70 | 1 0`); **Pass/Fail** (`P 60 | F 0`); **None** (percentage only).

A scale is an ordered list of `{label, min}` sorted by `min` DESC. Bands are half-open `[min, nextMin)`; the top band is `[min, ∞)` so 103% lands in the top band.

Editing: one screen, one row per band, label + cutoff + add above/below + delete + reset, with a **live preview strip** showing what 59, 69.4, 69.5, 79.5, 89.5, 89.9 and 100 map to under the current edits.

Validation, all blocking, offending row highlighted:
1. At least one band. 2. Every `min` in `[0,100]`. 3. Mins strictly decreasing. 4. **The bottom band's min must be exactly 0.** 5. Labels unique and non-empty. 6. **A cutoff may not carry more decimal places than the class's `dp`.** Rule 6 eliminates the entire epsilon-comparison bug class: `display` is a decimal round to `dp` places and the cutoff is a decimal literal with ≤ `dp` places, so both are the nearest double to the same decimal and `display >= cutoff` is exact. If she types 89.5 while `dp` is 0, offer **"show one decimal place"** as the one-tap fix.

### 5.3 The UI contract for redistributed weight — non-optional

a. The headline is labelled **"Grade so far"**, never "Grade", whenever `W < 100`.
b. Directly under it, always rendered and always printed: *"Counting Classwork (40%) and Participation (20%). Tests (40%) has no graded work yet, so it is not counted. Right now Classwork is 67% of this grade and Participation is 33%."*
c. Inactive categories render `—` in the percent column and `40% → not counted yet` in the weight column. **The word "0" must not appear for an empty category anywhere.**
d. Every category row shows both nominal and effective weight while `W < 100`.
e. Every student row carries a **"How is this calculated?"** disclosure printing the literal arithmetic: every counted assignment, every excused exclusion, every dropped item, the category subtotals, the weights used, the division by `W`, the raw value, and the rounding step.
f. Weight validation is a hard gate: a weighted class cannot be saved until weights sum to 100.00, with a one-tap "make these add to 100" that rescales proportionally.
g. A category with weight 0 can never affect the grade — warn at save, not silently.
h. Changing the model or the scale mid-term shows a preview: *"This changes 14 of 96 letter grades. Here they are."*

Also always shown on the student row: **"Grade so far 88.2% B+ · 1.8 points from an A−"**, and, on the detail: **"If nothing else is turned in: 71.4% C−."**

### 5.4 Rounding, in one sentence

Carry full precision through every sum and division, round exactly once at the end with half-up to the class's `dp`, and derive the letter from that rounded displayed number and nothing else.

The setting, in her words, with the consequence in the same place:

> **Show grades as:**  ( ) 90   ( • ) 89.7   ( ) 89.72
> This also decides borderline letters. At whole numbers, 89.5 shows as 90 and earns an A. At one decimal it stays 89.5 and earns a B.
> *If you round up to the next letter, change the cutoff instead — set A to 89.5. That is exact, and it is what you will tell a parent.*

| raw | dp=0 | dp=1 | dp=2 |
|---|---|---|---|
| 89.44 | 89 B | 89.4 B | 89.44 B |
| 89.50 | **90 A** | 89.5 B | 89.50 B |
| 89.95 | 90 A | **90.0 A** | 89.95 B |

### 5.5 What I corrected

1. **Storage: localStorage → IndexedDB, one record per class.** The maths lens sized for 6 classes; the app is sized for 25.
2. **Added `absent` and `late` as non-arithmetic flags.** The maths model had neither; the workflow lens required both. They are flags, not states, so the four-state arithmetic is untouched.
3. **Removed the "missing counts as zero / is excluded" setting.** Missing always counts as zero (§4.4).
4. **Restated the second projection's label.** The workflow lens wrote *"If all missing work stays missing 71%"* — under this engine, missing already counts as zero, so the second number is the **ungraded** projection. Correct label: *"If nothing else is turned in."*
5. **Standards-based scoring deferred**, replaced by mark schemes + teacher-set letter scales (§4.5, §2).
6. **`Assignment.standardIds` cut from v1** (no arithmetic effect, no UI to use it).
7. **Navigation always commits.** The workflow lens said arrows "move without committing an edit"; a half-typed value silently discarded is worse than a committed one that undo can reverse. Any navigation key commits what is in the field.

Everything else — every formula, every guard, every tie-break — is verbatim.

### 5.6 Test table

`test/grade.test.mjs` must assert all of these. This is a gate on merge.

**Rounding and letters**
1. `roundHalfUp(1.005,2) === 1.01` (`Math.round(1.005*100)/100` returns 1)
2. `roundHalfUp(8.575,2) === 8.58` (`Math.round(8.575*100)/100` returns 8.57)
3. `roundHalfUp(89.5,0) === 90` and `roundHalfUp(89.5,1) === 89.5`
4. `roundHalfUp(89.45,1) === 89.5` and `roundHalfUp(89.44,1) === 89.4`
5. `roundHalfUp(0,1) === 0` and `roundHalfUp(null,1) === null`
6. a value below `1e-9` returns 0 and never produces exponential notation
7. `letterFor(90,tenPoint)==='A'`, `letterFor(89.9,tenPoint)==='B'`
8. `letterFor(105,tenPoint)==='A'` — the top band is unbounded above
9. `letterFor(0,tenPoint)==='F'`, `letterFor(59.9,tenPoint)==='F'`, `letterFor(null,any)===null`
10. the letter for every raw value in 0..100 is a pure function of its display value at dp 0, 1 and 2 — **zero contradictions**

**Scale validation**
11. rejects a cutoff with more decimals than dp: `({A:89.5}, dp 0)` errors
12. accepts `({A:89.5, F:0}, dp 1)`
13. rejects a bottom band whose min is not 0
14. rejects non-strictly-decreasing cutoffs
15. rejects duplicate labels
16. the built-in 10-point, plus/minus and E/S/N scales all validate at dp 1

**States**
17. total points: `18/20` graded + `10` missing + `25` excused + `15` ungraded + `5/5` graded = `23/35` = 65.714…% → **65.7 D**
18. the same roster projected = `23/50` = **46.0% F**
19. excused removes points possible from the denominator: 92/100 with a 100-pt assignment excused = **92%**
20. missing keeps points possible: the same, marked missing = **46%**
21. ungraded is excluded from "so far": the same, ungraded = **92%**
22. a graded 0 and a missing produce identical `earned`, `possible`, `pct`
23. a graded 0 and a missing are distinguishable in the rendered cell **and in the accessible name**
24. an absent `Score` record behaves exactly as `state:'ungraded'`
25. `absent:true` and `late:true` change no computed value in any scenario
26. total points with nothing graded returns `{raw:null, display:null, letter:null}`
27. total points where every assignment is excused returns `raw:null`, **not 0**
28. `points: 12` on a 10-point assignment is accepted: `12/10 + 8/10 = 20/20 = 100%`
29. a negative points entry is rejected

**Weighted**
30. Tests 40 empty, Classwork 16/20, Participation 5/5 → W 60, raw 86.666…%, display **86.7 B**
31. **assert the engine does NOT return 52.0** (the empty-category-as-zero answer)
32. an empty category reports `pct: null`, never 0
33. effectiveWeight: Classwork 66.666…%, Participation 33.333…%; an inactive category is 0
34. the inactive list names `'Tests'` so the UI can print it
35. Tests 85/100 w50, Homework all excused w30, Participation 9/10 w20 → W 70, raw 86.428571…%, **86.4 B**
36. a category whose every assignment is excused is inactive, identical to one with no assignments
37. with all categories inactive, `raw` is null and `W` is 0
38. weights 45/40/20 with 80/90/100 gives 87.619…% (normalised), **not Canvas's 92.0**
39. weights summing to exactly 100, all active, are unchanged by normalisation
40. a category with weight 0 is excluded even when it has graded work
41. saving a weighted class whose weights do not sum to 100.00 is blocked
42. a single 3/4 in Classwork (w40) of a 40/40/20 class gives raw **75.0% C** with W 40
43. a single 0/4 gives raw **0.0% F** — a single zero is not "no data"
44. projected: a category holding only ungraded work becomes active at 0% (Classwork 9/10 + ungraded 100-pt test = 90.0 so far, **45.0 projected**)
45. projected: a category with no assignments at all stays inactive even in the projected view

**Drop-lowest**
46. Beth (80/100, 20/100, 1/20), drop 1: drops the **20/100** → `81/120 = 67.5%`
47. **assert the engine returns 67.5, not 50** (the lowest-percentage answer)
48. Beth with no drop rule = 45.909…%
49. Carl (100/100, 42/91, 14/55, 3/38), drop 1: drops 3/38 → 63.414…%
50. Carl, drop 2: drops 42/91 **and** 14/55 → 74.637…%, **not the greedy 74.345…%**
51. `optimalKeep` equals brute-force optimum on 4,000 randomised categories (2–8 items, all drop counts)
52. enabling drop-lowest **never lowers** a category percentage — 15,604 randomised assertions
53. dropping the smallest raw score can lower a grade (5/5 + 50/100: 52.380…% → 50%) — **assert the engine never does this**
54. two quizzes 6/10 and 9/10 with dropLowest 2 keeps one: 9/10 = 90%, `dropped === ['q1']`
55. one quiz with dropLowest 2 drops nothing, returns 6/10 = 60%
56. a category with zero items and a drop rule returns `pct: null`, not NaN
57. `neverDrop` protects an item: 9/10, 4/10, final 50/100 neverDrop, drop 1 → drops the 4/10, `59/110 = 53.636…%`
58. without `neverDrop` the same inputs drop the 50/100 final → `13/20 = 65%`
59. across states: 8/10, 9/10, missing, ungraded, drop 1 → so far `17/20 = 85%`, the **missing** is dropped
60. the same inputs projected → `17/30 = 56.666…%`, and **the same cell** is marked dropped in both views
61. when two items tie exactly, the dropped item is deterministic across runs and re-renders
62. extra credit is never eligible for dropping

**Extra credit**
63. total points, 5-pt EC: `50/50 + 48/50 + 5 = 103/100` = **103.0% A**
64. the same class with `capAt100` displays **100**
65. weighted: 3 EC points inside Classwork (20/20, w50) with Tests 95/100 (w50) → Classwork 115%, raw **105.0%**
66. course-scoped EC of 2 points on the same class gives **99.5%, not 105%** — different units
67. an assignment with `pointsPossible: 0` is treated as extra credit implicitly
68. EC alone with nothing else graded returns `raw:null` with `earned:3, possible:0` — not 0%, not Infinity, not NaN
69. a category containing only EC is inactive and its weight redistributes (Tests 88/100 w60 + EC category w40 = **88.0%**) — **and the warning fires**

**Precision**
70. fractional points sum exactly via centipoints: `2.25/2.5 + 1.75/2.5 + 4.5/5 = 8.5/10 = 85.0%`
71. thirty `1/3` scores = `30/90 = 33.333…%` → 33.3, no float drift
72. the mean of assignment percentages is not used: `50/100 + 5/5` returns **52.380…%, not 75%**
73. no intermediate rounding: double-rounding 89.4449 through 3→2→1 decimals yields 89.5 while the correct single round yields 89.4 — **assert 89.4**

**App layer**
74. no computed percentage, letter, subtotal or drop decision is ever persisted to storage or written into the export
75. every calculation call returns **both** "grade so far" and "projected"
76. the printed report includes the model, the scale cutoffs, `dp`, the counted weight `W`, and the named uncounted categories
77. the explain panel for one student reproduces the returned `raw` value exactly from the lines it prints
78. an export → wipe → import round-trip reproduces byte-identical class records
79. a `sws`/`app` mismatch on import is rejected with a named error, not a silent partial load

---

## 6. Screen by screen

### 6.0 Cold open

Header: mark, `Grade Sheet`, tagline, then — right-aligned, out of the thumb zone — **the backup age chip** (`Backed up 3 days ago`), the **privacy-screen button** (eye icon, `aria-label="Hide all names"`), the display-settings sliders, and an `i` opening "What this app knows". **No tip pill.** (§7, §10.)

Below the header, permanently, at `--t-sm`, never dismissible:

> This browser has promised to keep your gradebook. *(or)* **This browser has not promised to keep your gradebook — export a backup file every week.**

First run: an empty state, not a modal.

> **Nothing in here yet.**
> Start with one class. You will paste your roster — about 20 seconds a class once the list is on screen.
> **[ Add a class ]**  [ Restore from a backup file ]
>
> Before you type real student names into this — or into anything else — check your school's policy on classroom software.

### 6.1 Today (the home screen)

The specials teacher navigates by *when*, not by *what*. A dropdown of 25 entries reading "Grade 3, Grade 3, Grade 3" is unusable at 10:40 with four minutes between groups.

```
Thursday 17 September                         Backed up 3 days ago
[ Mon ][ Tue ][ Wed ][ Thu ][ Fri ]        ← her own day labels; today highlighted

  Period 1   K Alvarez        24 students · all scored
  Period 2   1 Brennan        22 students · 2 not scored
  Period 3   2 Kowalski       24 students · 3 not scored      ← tap
  Period 5   4 Diaz           26 students · all scored

  All classes (25) →     Print →
```

**The day cycle, minimally.** `meta.dayLabels` defaults to `['Mon','Tue','Wed','Thu','Fri']`; a rotation teacher replaces it with `['A','B','C','D','E','F']`. On open, the cursor advances from `dayCursorDate` by the number of **weekdays** elapsed, mod the label count. Wrong after a snow day? She taps the right label; that rewrites `dayCursor` and `dayCursorDate` and it is right again for the rest of the year. One field, one tap, no calendar engine. A class with `days: []` always shows.

`notScored` is **per class**, computed from `classIndex` — "N ungraded" as one global number is meaningless at 3,000 cells.

Tapping a class opens the class screen. If `meta.lastOpened` is under 12 hours old, cold open goes **straight into that score run** and this screen is skipped — the common path has no picking.

### 6.2 Roster import — the front door

This is where every competitor loses the user, before they ever reach a gradebook. Three teachers, three different apps, three abandonments, all at this wall:

- *"I have waisted an entire day trying to import student names and info from a csv file... rearranged the fields on my csv files anyway I could think of, and it still does not load... right now I am going back to a spread sheet."* — smcneil7, A+ Teacher's Aide, 26 Sep 2018
- *"The only way to import student information is to use the apparently super fussy template... Great app if one could use it."* — BethX555, 5 Feb 2017
- *"I'm so frustrated that it won't import my xls. files for my class lists. I don't have the time to enter almost 700 student's information into this app... I feel like I have wasted my hard earned money."* — Papaboohboohbabypoohpooh, iDoceo, 20 Sep 2024

**Paste is primary. File is secondary. Template is never.** On a locked-down school machine she may have no SIS export role, no permission to save a student file to disk, and no ability to install anything — but she can almost always *see* a roster on a screen. Select, Ctrl+C, Ctrl+V. No file, no export permission, and no file of children's names left in Downloads afterwards.

**Screen one — one textarea, nothing else on it.**

> **Paste anything with names in it.**
> Select your class list — in your SIS, in a Google Sheet, in an email — copy it, and paste it here. It does not have to be tidy.
> *(a large textarea, autofocused)*
> Or drop a .csv or .txt file here · Or type them one at a time

**The parser, in order:**

1. **Read `text/html` off the paste event, not just `text/plain`.** Selecting a roster table in an SIS web page and hitting Ctrl+C puts a real HTML table on the clipboard. Parse `<tr>`/`<td>` with `DOMParser` → clean rows and cells with zero guessing. **This is the single highest-value path on a locked-down machine and almost nobody implements it.** Sanitise: read `textContent` only, never insert the HTML into the document.
2. Plain text: split on `\n`, drop blank lines, then detect the delimiter **per line** — tab (what Excel, Sheets and an SIS table actually yield), comma, semicolon, pipe, or 2+ spaces. Take the modal delimiter across lines.
3. Strip leading row numbers (`1.`, `1)`, `1 -`), bullets (`•`, `-`, `*`), and trailing counts.
4. Detect and drop a header row (first row contains `name` / `student` / `id`, case-insensitive).

**Screen two — the column picker.** This inverts the failure mode: the source never has to match a template; she points at the columns instead. About 40 lines of code and it is the whole ballgame.

```
34 students found · 1 header row ignored · 2 already in this class

  [ Last name ▾ ] [ First name ▾ ] [ Ignore ▾ ] [ Student ID ▾ ]
    Moreno         Jacob            2           4412
    Nguyen         Ada              2           4418
    ...first five rows...

  ( ) Names are "Jacob Moreno"   (•) Names are "Moreno, Jacob"
      preview: Jacob Moreno · Ada Nguyen · Malik Osei

  [ Add 34 students ]        every row editable inline before you press this
```

Dropdown options: Last name / First name / Full name / Student ID / Ignore. Pre-guessed from content (a column that is all-numeric → Student ID; a column containing commas → Full name). **Fully overridable.** Never commit a paste blind.

5. **Deduplicate within the paste.** Two students sharing a name **block the commit** until a disambiguator is supplied (`tag` — middle initial, or free text). There are always two Jacob M.s, and scores entered on the wrong one are invisible until a report card goes home. The tag shows permanently in the entry list, not only in the roster editor.
6. **Student ID is offered, never pushed:** *"You can enter IDs instead of names and keep the key on paper."* A specials teacher who knows 500 children by face cannot work from IDs; a data-cautious teacher should be able to.

**Time budget stated on the screen, because a finite number is what stops her giving up:** *"About 20 seconds a class once the list is on screen. Twenty-five classes is under ten minutes, once, in August."*

**Secondary paths, all routed through the same column picker so there is one mental model:** drop a `.csv`/`.txt` (accepted, never required, never templated); type-in mode (one input, name, Enter, repeat — genuinely fastest for a six-student intervention group); **copy a roster from another class in this book** (two taps); **add one student mid-year** via a persistent single-line input at the bottom of the roster — the office sends one new child, not a file.

**Display mode is chosen here, not buried in settings:** Full name / **First + last initial (default)** / Initials only. The default state of the app is already the one that is safe to project.

### 6.3 Loop B — the session sweep (specials-dominant)

A class of 24 second-graders has just filed out; the next arrives in four minutes. This happens ~25 times a week for Jessie. It is not "entering an assignment"; it is recording one mark for one 40-minute session — and **nobody builds for it.**

Tap `2 Kowalski` on Today → **Mark today's session**:

```
2 Kowalski · Thursday 17 September                         [ Esc ]

  Participation — 17 Sep                     out of 4   [ change ]

  [ Everyone got 4 ]   [ Everyone got 3 ]   [ Start blank ]

  ── after the tap ────────────────────────────────────────────
  Jacob M.    [4] 3 2 1  · M Ex A
  Ada N.      [4] 3 2 1  · M Ex A
  Malik O.     4 [3] 2 1 · M Ex A        ← tapped down
  ...
  24 marked · avg 3.8 · 1 absent
```

- The sweep creates **one dated assignment per class per day**, named from a per-class template (default `"{Category} — {D MMM}"`, editable), in the class's default category. Reopening the sweep the same day **reopens the same assignment** — it can never produce 36 junk assignments.
- Six taps, under ten seconds: open, "Everyone got 4", three taps down, one to Absent.
- No Save button. No confirm. Everything goes through toast undo with Ctrl+Z.

### 6.4 Loop A — the score run, keystroke by keystroke

She has 24 papers already marked in pen. From cold open:

**1.** App opens on Today. If a class + assignment was touched in the last ~12 hours, it opens straight into that run and step 2 is skipped.
**2.** Otherwise: `Tab` lands on the first class card, `Enter` opens it. `n` = new assignment. Type the name, `Tab`, type points possible, `Enter` — the assignment is created **and focus is already in student 1's score box.** Two fields, no dialog to dismiss.
**3.** The run:

```
2 Kowalski · Unit 2 project · out of 20              [ Esc to leave ]
18 of 24 entered · avg 84% · 2 missing · 1 excused    ← fixed, never moves

        Jacob Moreno              [ 18 ]     ← focus, held at a fixed y position
        Ada Nguyen                [    ]
        Malik Osei                [ Ex ]
```

| key | effect |
|---|---|
| `0`–`9`, `.` | types into the field |
| `Enter` | commit, advance one row |
| `Enter` on an empty field | advance, cell stays `ungraded`. **Explicitly not zero.** |
| `.` then `Enter`, or `Ctrl+Enter` | full marks, commit, advance — the workhorse |
| `m` | Missing, commit, advance |
| `x` | Excused, commit, advance |
| `a` | toggle the **absent** flag on this cell — does not advance |
| `l` | toggle the **late** flag on this cell — does not advance |
| `Shift+Enter` | commit, back one row |
| `↑` / `↓` | commit what is typed, then move |
| `Backspace` in an empty field | jump back one row **and clear that cell** — the single most common repair, realising you were one row off |
| **`Ctrl+.`** | **fill every still-empty cell in this run with full marks** |
| `Ctrl+Z` | undo the last committed cell; **deliberately ignored while the field holds uncommitted text**, so the browser's own undo still works |
| `Esc` | leave the run. Nothing to save. |

- The score field is `type="text" inputmode="decimal"`, not `type="number"`, so letter keys can be bound. An unbound letter is ignored with a brief shake and no state change.
- **The focused row stays at the same vertical position on screen** as the list advances, so her eye never tracks.
- **There is no Save button, because every Enter already wrote.** `SWS.saved()` fires the quiet flag.
- **`Ctrl+.` is the accelerator that matters most.** For a participation sweep it turns 24 keystrokes into about 4 — fill all, arrow to the three exceptions, retype. ~8 seconds for a class of 24. This one shortcut is the difference between the app being usable across 25 classes a week and not.
- Budget: ~1.1–1.3 s per student once the stack is marked. 24 students ≈ 30 s; a 32-student secondary section ≈ 40 s.

**Touch equivalent** (an iPad on a knee, a laptop on a knee at 4pm): the same list with a numeric keypad **docked at the bottom that never moves or resizes** — the studio's thumb-zone invariant — carrying 0–9, a decimal, a next arrow, and M / Ex / A keys.

**Order is a feature.** The on-screen entry order and the printed blank grid are the same order, always. The dominant real workflow is "mark on paper, then transcribe," and if the paper and the screen disagree by one row the whole run is wrong and she will not notice until a parent emails.

**Entry validation:** points ≥ 0 required (a negative is rejected — a late penalty is not a score); `points > pointsPossible` accepted silently (built-in extra credit); `points > 2 × pointsPossible` prompts *"Did you mean 9?"* but does not block; more than 2 decimals is rounded to 2 on blur, visibly.

### 6.5 The class screen

Tabs (`aria-pressed` toggle-button group, no `role="tablist"`): **Grid · Students · Assignments · Setup**.

**Grid** — students down, assignments across, current grade in a **frozen last column**. *A gradebook that cannot show a running grade is one a teacher will re-check in Excel.* (iDoceo, 1 star, ia_teacher, 23 Sep 2022: *"$15 for a grade book that doesn't even have a current grade column... it doesn't even have the most basic function of all grade books."*) Tapping any percentage opens **How is this calculated?** (§5.3e). Tapping an assignment header opens its score run.

**Students** — one row per child: name, grade so far, letter, distance to the next letter, missing count. Detail: every assignment with score, state, flags and note; the category breakdown with nominal and effective weights; what was dropped (struck through — *a silent drop is a number she cannot defend*); what was excused; both projections; a free-text memory note (`"red glasses, sits by the door"`); **Excuse all ungraded for this student**; **Archive** (never delete — removed from the entry list and the class average, still in reports, still in exports, restorable via toast undo).

**Assignments** — list with date, category, points, EC/neverDrop flags, `N not scored`. **Add to several classes at once** and **grade-level grouping**, so "the Grade 4 rhythm assessment" is created once — without this she configures 25 times and quits during setup week. (lauraharrisonmusic, iDoceo, 20 Jan 2025: *"I can use my template across other classes (so I don't have to start over for every class)."*)

Editing `pointsPossible` after grading shows a one-line dismissible notice — *"12 scores were entered while this was out of 20"* — with a choice to rescale those scores proportionally or leave them. **Never rescale silently in either direction.**

**Setup** — name, period, days, model cards, `dp`, `capAt100`, drop-lowest, categories with weights, letter scale editor, session-sweep template. Deleting a class **archives** it and is one of the legitimate confirms.

The model is chosen with two plain-language cards, no jargon, on class creation:

> **Total points** *(preselected)* — every point counts the same. A 100-point test moves the grade ten times as much as a 10-point warm-up.
> **Weighted categories** — you decide the shares. Tests are 40% of the grade however many points they are worth.

Total points is the default because it has no empty-category failure mode at all, and because a specials teacher grading participation and one project per unit does not need weights. Changing it later is non-destructive and goes through the change preview (§5.3h).

### 6.6 Privacy screen

`Escape` (when not in a run) and the header eye button instantly blank **every name and every score** to `▒▒▒▒`, preserving scroll position and focus. Also engages on `visibilitychange`, and after `idleMaskMinutes` of no input (default 5, masking only — never logging out, never discarding state). `startHidden` is a preference. We do **not** claim it detects presentation mode, because it cannot.

### 6.7 Print

One picker, a live preview driven by **the same CSS as `@media print`** so the two can never disagree (sub-plans' precedent), and **the page count on the Print button** — knowing it is 3 pages and not 30 before sending it to the department printer is a real kindness at 25 classes.

Before printing: *"This will print 24 student names on 3 pages."* Plus a name-display choice for the printout itself, because sheets get left on copiers.

| Job | What it is |
|---|---|
| **Blank grid** | roster down the side, N empty columns across, date line, assignment name line — **in exactly the on-screen entry order**. For grading on a clipboard. |
| **Final-marks list** | every student, one percentage and one letter, dense, one class per page, **in the same sort order as the SIS screen she is hand-typing into**. For a specials teacher with 500 students this is several hours saved per reporting period, and nobody builds it. |
| **Class grid** | landscape, one page: vertical abbreviated assignment headers, full student names, header row repeated on every page. The wall-chart paper backup. |
| **Progress reports** | **all students in one job**, one page each, page-broken: every assignment with score, points, state, flags and note; the category breakdown with weights; the current grade and letter; what was dropped; what was excused; a comment and signature line. This is the single most-requested missing print feature in the entire review corpus. (Cordesika, A+ Teacher's Aide, 18 Oct 2016: *"I am not allowed to email students so I need to print something. Therefore, I must click on each student, email myself their report, and open and print my email - very time consuming."* John Wells 2, GradeBook Pro, 4 Nov 2017: *"If I could print all the student grade reports at once the app would be perfect."*) |
| **Substitute roster** | names and a checkbox column, large type, **explicitly no grades on it** — a sub is not entitled to them. Directly requested twice: Mrs G3, GradeBook Pro, 2 Feb 2018; Dlushnl, Additio, 6 Sep 2016. |

**Provenance in the footer of every printout**, one line of markup, and the thing that stops a wrong grade surviving a conversation:

> 2 Kowalski · Quarter 1 · as of 17 Sep 2026 · Total points · A 90 / B 80 / C 70 / D 60 / F 0 · shown to 1 decimal · lowest 1 quiz dropped · missing work counts as zero
> **Confidential — student records.** This is the teacher's working sheet. The school's student information system is the official record.

Monochrome-safe: colour is never the only carrier of meaning. Test at US Letter; a full class must fit one page.

---

## 7. Trust copy and privacy facts — the exact words

### 7.1 The `.trust` stamp (in-app, on the About card)

> **Your students' names and grades never leave this device.** There is no account, no server and no company holding your gradebook. We never see a single student name.

### 7.2 The permanent header line (state-dependent, never dismissible)

> This browser has promised to keep your gradebook. Export a backup file every week anyway.

or

> **This browser has not promised to keep your gradebook — export a backup file every week.**

### 7.3 "What this app knows" panel — printable, and the screen she shows her principal

> **What Grade Sheet holds, and where**
> Everything you type — class names, student names, assignments and marks — is stored by this browser, on this computer, in a database called `sws-gradesheet`. Nowhere else.
>
> **What leaves this device:** nothing. There is no network code in this app. No upload, no analytics, no fonts fetched from anywhere, no update check. The only copy that exists elsewhere is the backup file you save yourself.
>
> **How to check that, in thirty seconds:** turn off the Wi-Fi, reload the page, and keep working. Everything still works, because the whole app is cached on your device. An app that runs with the network off is an app that cannot be sending your grades anywhere. To look directly: open DevTools → Application → IndexedDB → `sws-gradesheet`, or press Ctrl+U and search the source for the word `fetch`. There is not one.
>
> **What this app is not:** it is your working gradebook. Your school's student information system is still the official record, and if our number and theirs disagree, theirs wins.
>
> **What it does not do:** it does not lock your grades behind a password. Anyone who can use this computer while you are signed in can read them. Lock your computer — that is the control your school already relies on.
>
> **Before you type real student names into this, or into anything else, check your school's policy on classroom software.**
>
> [ Export a backup ]   [ Export CSV ]   [ Delete everything on this device ]

### 7.4 Other approved strings, verbatim

- "No ads. No subscription. No tracking. Nothing to opt out of."
- "Because nothing is ever sent to us, there is nothing for us to lose, sell, or be asked to hand over."
- "Turn off the Wi-Fi and keep working."
- "There is no vendor agreement to sign, because we never receive your students' data."
- "Your grades live in this browser, and a school computer can be set to erase that when you sign out. Export a backup file every week."
- "Last backup: 11 days ago. Save one now."
- "You never have to type a full name. First name and last initial works everywhere in this app."
- "Press Escape to hide every name on screen."
- "The printed sheet keeps working even if this website disappears."
- "Delete everything on this device, permanently, in one tap. We could not recover it for you even if you asked, because we never had it."
- "Unlimited classes, unlimited students. There is no paid tier, because there is nothing for us to charge for — the data is on your computer and we are not paying to store it."

### 7.5 Strings that must never appear — enforce in review

**Compliance claims:** "FERPA compliant / certified / meets FERPA requirements"; "COPPA compliant / certified"; "SOPIPA compliant"; "Ed Law 2-d compliant"; "Approved for use in New York schools"; "Compliant with all 50 states' student privacy laws." FERPA binds schools, not products; there is no certification; "COPPA certified" has a specific meaning under the FTC's approved safe harbor programs, which we do not hold; we examined three state regimes, not fifty.

**Legal advice:** "These are sole possession records, so FERPA does not apply" (see §0 — legally wrong for a gradebook); "You do not need parental consent to keep this data"; "Your district does not need to approve this"; "No vendor agreement is needed" (true about us, false as a statement about her obligations — PTAC p.8 explicitly tells districts *"It is particularly important that teachers and staff not bypass internal controls in the acquisition process when deciding to use free online educational services"*).

**Security overclaims:** "Your grades are secure"; "Encrypted"; "Private" unqualified; "Nobody can ever see this"; "Anonymous" or "anonymised" (initials + a class + a school are linkable, and § 99.3 counts information "linked or linkable to a specific student" as PII — say *"harder to read over your shoulder"*); "Works offline forever"; "Stored permanently."

**The single most dangerous sentence we could print:** *"Your data is safe here"* / *"Never lose your grades again."* On a managed Chromebook the opposite is the live risk.

**Comparative and positioning claims:** "This is legally safer than Google Sheets / your SIS / PowerSchool"; "Replaces your gradebook"; "Replaces your SIS"; "Trusted by teachers"; "Used in schools nationwide"; "Contact us and we can recover it."

**And the design rule under all of it:** every string in this app must survive being read aloud by an angry parent in a conference room. Apply it to error messages and empty states too.

### 7.6 `design/privacy-facts.json` entry

```json
"grade-sheet": {
  "slug": "grade-sheet",
  "oneLine": "a private gradebook a teacher keeps on her own computer — rosters, marks, averages and printouts.",
  "storesWhat": "Your class names and periods, every student name (or initials, or ID) you paste or type, every assignment and its points, every mark, missing/excused flag, absence flag and note you record, and your grading settings",
  "storageMechanism": "in this browser's own IndexedDB database `sws-gradesheet` — object store `classes` holding one record per class with that class's whole roster, assignments and marks; `meta` holding a single `book` record with your settings and a class index; and `files` holding the handle to the backup file you chose, so it can be re-saved in one click. The only localStorage key it writes is `sws.gradesheet.seen`, which holds a date and is used to notice that this browser has erased your data.",
  "leavesDevice": "Nothing. There is no network code of any kind in the app — no fetch, no upload, no analytics endpoint, no update check, no font fetched from anywhere. There is no tip jar on any screen. The only copies that ever exist elsewhere are the backup file and CSV you save yourself, and anything you print.",
  "thirdParties": [
    "Firebase Hosting (Google) serves the app's static files and keeps ordinary short-lived web-server logs such as IP addresses. It cannot record anything you enter, because nothing you enter is ever sent to it."
  ],
  "permissions": [
    "write-only clipboard access when you tap a Copy button — most browsers show no prompt for this, and the app has no ability to read your clipboard",
    "if you use one-click backup, the browser asks once for permission to write to the single file you pick. The app can write to that one file and nothing else, and it never reads anywhere on your disk you did not point it at."
  ],
  "verifyTip": "Turn off Wi-Fi, reload the page and keep marking — entry, averages, printing and export all still work, because the whole app is cached on your device by its service worker. An app that runs with the network off is an app that cannot be sending your students' grades anywhere. To look directly, open DevTools → Application → IndexedDB → sws-gradesheet and read every record the app holds; or press Ctrl+U and search the source for the word fetch. There is not one."
}
```

---

## 8. Data-loss protection — a first-class feature

A teacher who loses a term of grades has a career-affecting problem and no way out of it: *"If I were to lose this data my job could be in jeopardy. NOT HAVING A BACKUP IS A NECESSARY SERVICE."* (Composer76, GradeBook Pro, 14 Dec 2017.) **On a managed Chromebook this is not a tail risk — it is a normal Tuesday if the district ticked one box.**

The threat, precisely. The Google Admin console device setting *Erase all local user data* wipes the entire Chrome profile; Google's documentation: *"The profile is marked for deletion only after the user signs out or manually closes every window associated with the profile. The profile is deleted the next time Chrome starts."* On ChromeOS that mode also caps profile storage at half the device's RAM — the profile is RAM-backed. **localStorage, IndexedDB, Cache Storage, the service worker registration and the Downloads folder all live in that profile and all vanish together**, with no error, no prompt, and an app that reopens looking like a fresh install. The same outcome arrives by a second route if the admin sets browsing data to clear on exit, or the teacher ticks *"Delete data sites have saved to your device when you close all windows."* And **Chrome Sync will not save her** — it carries bookmarks, settings, history and passwords, not site storage. Two Chromebooks means two gradebooks that diverge in silence.

### 8.1 `design/backup.js` is not sufficient here, and needs one change

It reads **localStorage only** (`backup.collect` calls `getItem` over a key list). Grade Sheet lives in IndexedDB. **Add an async `collect`/`restore` hook to `backup.js`** so an app can supply its own data instead of being assumed to live in localStorage. That change benefits Home Inventory, Baby Log and Bill Splitter too.

Beyond that it is **entirely pull-based** (two buttons, no cadence, no memory, nothing recorded about whether a backup ever happened), and — the sharp one — `backup.download` creates a blob and clicks an anchor, so the file lands in **Downloads, which is inside the profile that gets wiped.** A backup that dies with the data it is backing up is not a backup.

### 8.2 Autosave

Every change writes to IndexedDB, debounced ~250 ms. **Never a Save button.** If a write throws — quota, policy, private window — **say so immediately, in words, and stop pretending.** Specials Planner sets this precedent: it falls back to memory and tells the user plainly.

### 8.3 Persistent storage

Call `navigator.storage.persist()` on the **first real write**, not on load (reuse `askPersistOnce` from `apps/home-inventory/app.js`). Surface the answer from `persisted()` in the app's own words, permanently, in the header (§7.2). Watch `navigator.storage.estimate()` and warn early — **an eviction takes the whole origin, and therefore every other Sky Wolf app's data on that browser with it.**

### 8.4 The File System Access API — the lever

`showSaveFilePicker` and persistable `FileSystemFileHandle` are supported on Chrome, ChromeOS and Edge, and unsupported on Safari and Firefox. **Jessie's device is the one where it works, and no other app in this portfolio uses it yet.**

Ask **once** for a backup file location, and coach the choice explicitly:

> **Pick where your backup file lives.** Choose Google Drive or a USB stick — somewhere outside this browser. A file in Downloads is inside the profile a school computer may erase when you sign out.

Persist the handle in `files`. Then re-save to that same file on every cadence trigger with **one click and no dialog**. Fall back to the anchor download on Safari and Firefox. Honest flag in the copy: the handle itself dies with an ephemeral profile — but **the file it points at does not**, which is the entire point, and re-granting is one picker interaction.

### 8.5 Cadence, and detecting the wipe

- **The last-backup age is on screen at all times**, in the header, out of the thumb zone: `Backed up 3 days ago`. After seven days it changes to a warning treatment **and stays changed**. Never a modal.
- **Prompt at moments that already feel like finishing**, not on a timer: after a full class's marks are entered, on the first launch of a new week, and when starting a new term.
- After N unexported changes, a **persistent non-modal bar**: *"You have 42 marks that are not in a backup file yet."* Increment `changesSinceExport` on every write; reset on export.
- **Detect the wipe and explain it.** If IndexedDB is empty **but** either `sws.gradesheet.seen` exists or the service worker cache exists, **do not render a clean empty state.** Render:

> **Your gradebook is not here.**
> This browser has been cleared since you last used Grade Sheet. School computers are often set to erase everything a website has saved when you sign out, and that erases the app's data along with it. Nothing was sent anywhere and nothing can be recovered from us, because we never had it.
>
> **[ Restore from a backup file ]**
>
> Once you are back in, set up one-click backup to a file in Google Drive or on a USB stick — that file survives a wipe.

An empty gradebook that looks like a normal first run is how a teacher finds out too late.

### 8.6 Two exports, always

The `.json` restore file **and** the human-readable CSV plus the printable sheets. A teacher who has lost a term needs something a human and a district SIS can read, not only something our app can reload. Pill Schedule's promise — *the printed card keeps working even if the site disappears* — is the studio precedent, and here it is the ethical floor. Every dead app in this category took someone's grades with it: Engrade (~4.5 million users, bought for ~$50m in Jan 2014, switched off 30 June 2019), TeacherKit (404 on Google Play, gone from the US App Store under its own name, no shutdown notice), A+ Teacher's Aide (last updated 2019), GradeBook Pro (Dropbox backup broke in 2017 and the support site went dark).

---

## 9. The studio skin

For `design/skins.mjs`, School category, third row:

```js
'grade-sheet': {
  hue: 226, chroma: 0.08, paper: 'warm', voice: 'editorial', texture: 'grid',
  r: 10, wrap: '72rem', support: 86,
  note: 'deep blue-black ink on cream ledger paper — quiet enough to project, adult enough for a principal',
},
```

| axis | value | why |
|---|---|---|
| **hue 226** | deep ink blue | Maximally far from both School siblings: 188° from specials-planner's terracotta 38, 52° from sub-plans' pine 174 — the two apps a teacher sees beside it on the hub. Blue-black ink on cream ledger paper is literally the artifact. Nearest neighbours anywhere in the portfolio are bill-splitter (218, **cool**, technical, no texture) and pill-schedule (234, **cool**, plain, no texture, scale 1.14); warm paper + editorial + grid separates it from both on three axes. |
| **chroma 0.08** | muted | Below sub-plans (0.095) and well below specials-planner (0.13), giving a third distinct point on the category's chroma axis. It is also load-bearing: this app is projected in front of children and opened in front of principals, and a saturated app holding other people's children's marks reads wrong. Blue also reads more saturated than it measures, so 0.08 lands where 0.09 would in another hue. |
| **paper warm** | cream | All three School apps are warm — that is the category's signature, and it is right: this is stationery, not glass. Separation is carried by hue, texture, radius and wrap instead. |
| **voice editorial** (Fraunces) | | Both siblings are editorial and the register is the same one: a record kept by hand, not a tool that processes files. Fraunces on cream is also what stops the app reading as enterprise software, which is exactly what she is escaping. |
| **texture grid** | faint graph paper | The vocabulary's own note says `grid` is *"for tools that produce a diagram or a record."* A gradebook is ruled paper. It is also the only School app with a texture that reads as a surface — specials-planner is `wash`, sub-plans is `rule` — so the three are instantly separable at hub-card size. |
| **r 10** | crisper corners | A ledger has square corners. Also gives the category three distinct radii (14 / 12 / 10) so the cards differ in silhouette as well as colour. |
| **wrap 72rem** | widest in School | This app renders a grid that can be 30 columns wide. specials-planner is 66rem, sub-plans 48rem. |
| **support 86** | honey | The texture's second colour field. The default would be `(226+150)%360 = 16` — **a red**, which must never appear as ambient decoration on a screen full of children's marks. Honey is warm, non-semantic, and nods at the terracotta sibling. `--neg` is still solved independently and is what carries the Missing marker. |

**Hub card** (`design/hub.mjs`, School category, after `sub-plans`):

```js
['grade-sheet', 'Grade Sheet', 'Grades for every class you teach, on this device only',
 'gradebook grades teacher marks roster rubric report card averages specials elementary substitute homeschool'],
```

No `shared` tag — nothing about this app touches a server.

---

## 10. What we are deliberately not building

**A parent or student portal, or any share-a-grade link.** The moment a parent can see a grade, we are a party in the disclosure path, we need the § 99.31(a)(1)(i)(B) school-official exception, and that exception is established in practice through a signed contract with every district that touches us (PTAC, Feb 2014, p.4). A free, account-free app cannot carry that. Refusing to build the portal is what keeps the app free.

**Messaging parents or students, or emailing grades from the app.** Same problem, plus it needs a server, plus most districts must retain teacher-parent communications as public records — and it is frequently against school policy anyway (*"I am not allowed to email students so I need to print something"* — Cordesika, 18 Oct 2016). Paper is the sanctioned channel. We built the print job instead.

**Accounts, login, cloud sync.** An account means a server holding other people's children's names — exactly what was exfiltrated from PowerSchool (discovered 28 Dec 2024, a second extortion attempt in May 2025, and by PowerSchool's own account a ransom paid to keep names, dates of birth and Social Security Numbers from being published). It also reintroduces the #1 complaint in every teacher-facing SIS app we sampled: lockout with no recourse — *"My login suddenly stopped working... They have an automated message that says I have to contact my district. Since I'm using my personal phone, my district won't help me. One day Aeries worked, next day it didn't and nobody can help."* No account means no lockout, no breach surface, and no term-boundary credential expiry. Teachers will ask for sync loudly (*"No syncing between mobile devices, however -- even in the paid version -- is a MAJOR weakness"* — CRP729). The honest answer is the backup file she moves herself, plus a plain explanation of why.

**Third-party backup integrations — Dropbox, Google Drive API, iCloud.** This is the exact mechanism that destroyed the best-loved gradebook on iOS: the Dropbox API changed, the developer did not ship, and every teacher's only backup route died at once (*"the developer refused to update it to conform to new dropbox standards, so now you cannot back up your grades in any meaningful way"* — John Wells 2, 4 Nov 2017). An integration is a dependency that rots on someone else's schedule. **A downloaded file cannot rot.** Note the distinction: the File System Access API is a browser API writing to a folder she picked — if that folder happens to be her synced Drive folder, that is her doing, not our integration.

**Automatic SIS / LMS sync.** OAuth, per-district approval, a network dependency that breaks the offline promise, vendor paperwork we cannot service, and the feature most likely to break silently and corrupt the record of truth. **Import yes, sync no.** Getting marks back out is CSV and print, which she pastes into the SIS in the five minutes she was going to spend anyway.

**AI anything** — grade suggestions, comment generation, rubric writing, "insights", at-risk prediction. It needs the network, so it breaks the offline promise. It means sending children's names or work to a third party, which reverses the core claim. Many districts prohibit it, so it makes the app un-approvable by the IT person looking over Jessie's shoulder. Any machine-generated inference about a child becomes part of a record the school must be able to disclose and defend, and we cannot defend it. **And it is the thing that already went badly for her.** Additio charges €29.99/yr for exactly this; declining to compete there is a positioning win.

**Student photographs on the roster.** Every competitor offers it and teachers genuinely love it for learning 600 names. Refuse anyway: it converts a text database into a collection of images of other people's children on a personal device, multiplies the harm of a lost laptop by an order of magnitude, and is the one feature that would make the app impossible for a principal to defend. The substitute is the free-text memory note (`"red glasses, sits by the door"`). This will cost us some users and it is the right trade.

**Official attendance.** Attendance drives state funding and truancy proceedings; it must live in the SIS and nowhere else. Offering something that looks official invites a teacher to trust it and then be wrong in a legal proceeding. The `absent` flag is a private reason attached to a cell, and the wording never implies it satisfies the district. Separately: silent attendance-save failure is the most common single complaint against every SIS teacher app we sampled, and we should not enter that comparison at all.

**Behaviour points, conduct scoring, leaderboards, projected scoreboards.** Discipline records are education records with due process attached; a running points tally is a documented equity problem and a public shaming mechanism when displayed. The session sweep records a mark; it never broadcasts one.

**Any class, student, term or history limit.** Teacher Aide Pro is free for 1 class and caps at 20 even when paid; Socrative's free tier is 1 room, 50 students and 30 days of history. Those caps are precisely what exclude Jessie's cohort — a reviewer, verbatim: *"I serve 24 classes in elementary schools and that might grow in the coming years. This means I would needs to pay for two of your programs."* Unlimited is the feature, and it costs us nothing because we are not paying to store it.

**Subscriptions, paid tiers, feature gates.** Beyond the studio's standing position, the review evidence here is specifically about hostage data: *"So if you buy it you have to keep buying it to continue to use your student data"* (Toctreb, Additio, 27 Jan 2020). And the rug-pull is recent: *"I loved this app and have used it for four years. Opened it to take attendance in my first class today to be told that I was not able to unless I subscribed."*

**A required CSV template.** Named explicitly because it is the single documented cause of one-star reviews and abandonment across three different apps. We accept a CSV — through the same column picker as a paste, never with a required shape. **If the app ever says "your file must have these headers," we have shipped the bug.**

**A PIN lock, or any claim of encryption.** On a browser-stored database a PIN is theatre — anyone with the unlocked session can read IndexedDB through DevTools. A forgotten PIN is a support request we cannot answer. Real at-rest encryption from a passphrase would work, but then a forgotten passphrase destroys the term permanently, which is a worse failure than the one being prevented. Say the true thing instead (§7.3).

**A consent checkbox — "I confirm I am authorised to store student data."** It protects no child and reads as us shifting liability onto a teacher. Replaced by the one-time plain explainer covering the two things she actually needs: check your district's policy, and export every week.

**Any computation the teacher cannot see.** No auto-zeroing of blanks, no hidden intermediate rounding, no minimum-grade floor, no dropped score you cannot spot, no penalty applied without showing the raw number beside it. This is the difference between a tool she trusts and one she re-checks in Excel — at which point she may as well have stayed in Excel.

**Confirm dialogs on the entry path.** Score entry, status changes and assignment edits go through toast undo with Ctrl+Z. The legitimate confirms are exactly three: delete a class, start a new term, restore from a file — all large, hard to reconstruct, and even the first two archive rather than erase.

**Any outbound network request whatsoever, including update checks and fonts from a CDN.** The claim must be checkable, not merely stated. **And no tip jar on any screen.** Sub Plans already ships with none and its privacy record states it makes not one outbound request in normal use. A "buy me a coffee" pill sitting next to a child's failing mark, on a projector, in a staff meeting, is an objection we have no answer to.

**A prompt to name the teacher, the school, or the district.** `teacherName` is optional and exists only to print in a footer. We do not want the school's name on the device, and we certainly do not want it in a filename.

---

## 11. Open questions — the owner's call

1. **Talk to Jessie before the build?** Three specific things would de-risk it more than any amount of further research: her actual grade categories, the exact mark scheme her report card wants (E/S/N? 1–4? a percentage?), and **one real roster copied out of her SIS**, so the paste parser is tested against the thing it has to survive rather than against a synthetic fixture. Roster import is the #1 documented cause of abandonment in this category and we are guessing at her clipboard.

2. **Hosting and domain.** Grade Sheet under the existing `sws-apps` Firebase site puts it on the same domain as apps that carry a Stripe tip link. A district IT person categorising the domain sees the whole portfolio, not just this app. Worth a separate hostname, or not?

3. **Any tip presence at all.** I have ruled it off every screen. The remaining question is whether the About/privacy page carries a link at all, or whether Grade Sheet goes to zero like Sub Plans. I recommend zero — it makes "no outbound request in normal use" simply true with no asterisk — but it is a revenue call, not a design one.

4. **Does the standards-based grid ever get built?** It is the one deferral that genuinely excludes a segment: districts on standards-based report cards need a students × standards matrix, not a students × assignments one. It is ~20–25% more code, almost all view and print. v2 or never?

5. **Ship date versus scope.** It is 16 August 2026 and the US school year is starting now. An app that lands in October has missed the setup week that is its entire on-ramp — a teacher who has already built her spreadsheet will not rebuild in November. If the calendar is tight, the honest cut order is: progress reports → class grid → weighted categories → drop-lowest, leaving paste, the two loops, the engine, backup, and the final-marks list. That is still a genuinely useful app on the first day of use.