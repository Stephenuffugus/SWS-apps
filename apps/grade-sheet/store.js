/* ═══════════════════════════════════════════════════════════════════════════
   GRADE SHEET — where it lives

   IndexedDB, one record per class. The obvious alternative — one record per
   score — is wrong at this app's real size: 25 classes × 24 children × 40
   assignments is 24,000 cells, and per-cell records mean the Today screen
   reads the whole book to draw itself. One record per class lets Today render
   from `meta` alone and open exactly one class, which is also the privacy
   posture: one class on screen at a time, never a whole-school view.

   localStorage is not used for any of it. 25 classes will not fit in ~5 MB,
   and its synchronous API sits on the score-entry path, which is the one thing
   in this app that must never stutter.

   Two localStorage keys exist, and neither holds a child's name:
     sws.gradesheet.seen   an ISO date, written on first real save
     sws.prefs             the shared studio comfort settings

   The first is load-bearing. Browser storage on a managed school Chromebook
   can be cleared by policy or on sign-out, and a teacher losing a term of
   marks is a career-affecting event. Two independent markers — this key and
   the IndexedDB record — let the app notice that one survived and the other
   did not, which is the only warning we can give her.

   NOTHING DERIVED IS EVER STORED. No percentage, no letter, no subtotal, no
   drop decision. All of it is recomputed from the marks, every time, because a
   stored number goes stale the moment she edits a cutoff and a stale grade is
   the exact failure this app exists to avoid.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DB_NAME = 'sws-gradesheet';
export const DB_VERSION = 1;
export const SEEN_KEY = 'sws.gradesheet.seen';

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('classes')) db.createObjectStore('classes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

const tx = async (store, mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    /* Unwrap by TYPE, not by truthiness. A `get` that finds nothing has
       `result === undefined`, and testing for that returned the IDBRequest
       itself — so a first run got an object instead of "no book yet" and every
       read off it was undefined. */
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

export const getMeta = () => tx('meta', 'readonly', (s) => s.get('book'));
export const putMeta = (book) => tx('meta', 'readwrite', (s) => s.put(book, 'book'));
export const getClass = (id) => tx('classes', 'readonly', (s) => s.get(id));
export const putClass = (c) => tx('classes', 'readwrite', (s) => s.put(c));
export const delClass = (id) => tx('classes', 'readwrite', (s) => s.delete(id));
export const allClasses = () => tx('classes', 'readonly', (s) => s.getAll());

export async function wipe() {
  const db = await open();
  await new Promise((res, rej) => {
    const t = db.transaction(['meta', 'classes', 'files'], 'readwrite');
    t.objectStore('meta').clear();
    t.objectStore('classes').clear();
    t.objectStore('files').clear();
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
  try { localStorage.removeItem(SEEN_KEY); } catch { /* private mode */ }
}

/* ── the empty book ─────────────────────────────────────────────────────── */
export const newBook = (now) => ({
  v: 1,
  createdAt: now, updatedAt: now,
  teacherName: '', schoolYear: '', termName: '',
  nameDisplay: 'firstLast1',      // the projectable form is the DEFAULT
  privacyScreen: false, startHidden: false,
  dayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  classIndex: [],                 // {id,name,period,days} — enough to draw Today
  lastBackupAt: null,
  ids: { cls: 0, stu: 0, asg: 0, cat: 0 },
});

export const newClass = (id, name) => ({
  id, name, period: null, days: [], archived: false,
  model: 'total-points', dp: 1, capAt100: false, dropLowest: 0,
  scale: [{ label: 'A', min: 90 }, { label: 'B', min: 80 }, { label: 'C', min: 70 },
    { label: 'D', min: 60 }, { label: 'F', min: 0 }],
  categories: [], students: [], assignments: [], scores: {},
});

/* ── has this browser thrown the book away? ─────────────────────────────────
   Two markers, checked against each other. If the localStorage date survives
   but the database is empty, the browser cleared site data — which on a
   managed machine is a policy, not an accident, and she needs to be told in
   those words rather than shown a cheerful empty state. */
export async function checkForWipe() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { /* private mode */ }
  const book = await getMeta();
  if (seen && !book) return { wiped: true, seen };
  return { wiped: false, seen };
}

export function markSeen(now) {
  try { localStorage.setItem(SEEN_KEY, now); } catch { /* private mode */ }
}

/* ── persistent storage ─────────────────────────────────────────────────────
   Asking is free and sometimes granted. The answer decides which of the two
   header sentences she gets, and neither of them says "your data is safe" —
   on a school machine that is the one sentence guaranteed to be untrue. */
export async function askPersist() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

/* ── the export ─────────────────────────────────────────────────────────────
   Deliberately readable. The redundant assignmentName/studentName on every
   score row costs about 30% of a file that is under 2 MB, and buys two things
   worth far more: a human can follow it in Notepad, and a partially corrupted
   file is still partly salvageable by eye.

   The readme is aimed at a version of this teacher who no longer has the app —
   because the whole promise of a local file is that it outlives us. */
export function serialize(book, classes, now) {
  return {
    sws: 1,
    app: 'grade-sheet',
    name: 'Grade Sheet',
    version: 1,
    exportedAt: now,
    readme: [
      'This is your gradebook. It is a plain text file — you can open it in Notepad.',
      'To put it back: open Grade Sheet, choose Restore from a file, and pick this file.',
      'If Grade Sheet no longer exists, everything you need is still readable below,',
      'and the CSV file saved alongside this one opens in Excel or Google Sheets.',
      'Grades are not stored in this file. Only the marks you typed are — every',
      'percentage is worked out fresh from them, so nothing here can go stale.',
    ],
    book: (({ classIndex, ...rest }) => rest)(book),
    classes: classes.map((c) => ({
      ...c,
      scores: Object.entries(c.scores || {}).flatMap(([aid, byStu]) => {
        const a = c.assignments.find((x) => x.id === aid);
        return Object.entries(byStu).map(([sid, rec]) => {
          const s = c.students.find((x) => x.id === sid);
          return {
            assignment: aid,
            assignmentName: a ? a.name : '(deleted)',
            student: sid,
            studentName: s ? [s.first, s.last].filter(Boolean).join(' ') : '(deleted)',
            ...rec,
          };
        });
      }),
    })),
  };
}

export function deserialize(data) {
  if (!data || typeof data !== 'object') throw new Error('That file is not readable.');
  if (data.app !== 'grade-sheet') {
    throw new Error(`That file is a backup of ${data.name || data.app || 'another app'}, not Grade Sheet.`);
  }
  /* Right shape, wrong contents. A truncated or hand-edited file can carry the
     app name and nothing else, and restoring it would replace a working book
     with a broken one — the single most expensive failure this app has. Refuse
     it while she still has her data. */
  if (!data.book || typeof data.book !== 'object' || !Array.isArray(data.classes)) {
    throw new Error('That file says it is a Grade Sheet backup, but it is missing its contents — it may have been cut short while saving. Nothing has been changed.');
  }
  const classes = (data.classes || []).map((c) => {
    const scores = {};
    for (const row of c.scores || []) {
      const { assignment, student, assignmentName, studentName, ...rec } = row;
      if (!scores[assignment]) scores[assignment] = {};
      scores[assignment][student] = rec;
    }
    return { ...c, scores };
  });
  const book = { ...data.book, classIndex: classes.map((c) => ({ id: c.id, name: c.name, period: c.period, days: c.days })) };
  return { book, classes };
}

/* Long format, one row per cell. Opens anywhere, outlives us, and is the thing
   she can actually hand to the next teacher. */
export function toCSV(classes) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = ['Class,Period,Student,Student ID,Assignment,Date,Category,Points possible,Score,State,Absent,Late,Note'];
  for (const c of classes) {
    const cat = (id) => (c.categories.find((x) => x.id === id) || {}).name || '';
    for (const a of c.assignments) {
      for (const s of c.students) {
        const rec = ((c.scores || {})[a.id] || {})[s.id] || { state: 'ungraded' };
        out.push([
          c.name, c.period, `${s.last}, ${s.first}`.replace(/^, |, $/, ''), s.sid,
          a.name, a.date, cat(a.categoryId), a.pointsPossible,
          rec.state === 'graded' ? rec.points : '', rec.state || 'ungraded',
          rec.absent ? 'yes' : '', rec.late ? 'yes' : '', rec.note || '',
        ].map(q).join(','));
      }
    }
  }
  return out.join('\n');
}

/* Filenames never carry a student name. They show up in Downloads, in print
   queues, in email previews, and on a file picker projected to a smartboard. */
export const backupName = (iso, ext) => `grade-sheet-${ext === 'csv' ? 'marks' : 'backup'}-${iso.slice(0, 10)}.${ext}`;
