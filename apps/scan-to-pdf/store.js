/* Scan to PDF, the session store.

   The audit's fatal case: eight pages of a signed lease captured at a leasing
   office counter, an incoming call, the tab evicted, and nothing to come back
   to. So captures are written to this browser's own IndexedDB as Blobs the
   moment they land.

   Blobs, not data URLs: 100 pages is roughly 80 MB and base64 would add a
   third of that again for nothing.

   Order and rotation live in one small localStorage record instead of inside
   the page rows, so reordering 40 pages rewrites 2 KB rather than 40 MB.

   Nothing in this file, or anywhere in this app, opens a network connection. */

const DB_NAME = 'sws-scan-to-pdf';
const STORE = 'pages';
const DB_VERSION = 1;
export const ORDER_KEY = 'sws.scan.order';

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('no-indexeddb');
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
    req.onblocked = () => reject(new Error('idb-blocked'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(STORE, mode); } catch (e) { reject(e); return; }
    let out;
    try { out = fn(t.objectStore(STORE)); } catch (e) { try { t.abort(); } catch (e2) {} reject(e); return; }
    t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error || new Error('idb-error'));
    t.onabort = () => reject(t.error || new Error('idb-abort'));
  }));
}

/* ── order + rotation ─────────────────────────────────────────────────────
   A tab killed mid-write leaves half a JSON value behind. That is ordinary,
   not exotic, so every read of it is defensive and a bad record is simply an
   empty order rather than a boot failure. */
export function readOrder() {
  let raw = null;
  try { raw = localStorage.getItem(ORDER_KEY); } catch (e) { return []; }
  if (!raw) return [];
  let v = null;
  try { v = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => r && typeof r.id === 'string')
    .map((r) => ({ id: r.id, rot: Number(r.rot) || 0, t: Number(r.t) || 0 }));
}

export function writeOrder(pages) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(
      pages.map((p) => ({ id: p.id, rot: p.rot | 0, t: p.t || 0 }))));
    return true;
  } catch (e) { return false; }
}

export function forgetOrder() {
  try { localStorage.removeItem(ORDER_KEY); } catch (e) {}
}

/* ── pages ──────────────────────────────────────────────────────────────── */

export async function putPage(page) {
  await run('readwrite', (s) => s.put({ id: page.id, blob: page.blob, w: page.w, h: page.h, t: page.t }));
}

export async function deletePage(id) {
  await run('readwrite', (s) => s.delete(id));
}

export async function putMany(pages) {
  await run('readwrite', (s) => { pages.forEach((p) => s.put({ id: p.id, blob: p.blob, w: p.w, h: p.h, t: p.t })); });
}

export async function clearPages() {
  await run('readwrite', (s) => s.clear());
  forgetOrder();
}

/** Everything from last time, in the order the user left it. */
export async function loadSession() {
  const rows = await run('readonly', (s) => s.getAll());
  const byId = new Map((rows || []).filter((r) => r && r.blob).map((r) => [r.id, r]));
  const order = readOrder();
  const out = [];
  const seen = new Set();
  for (const o of order) {
    const r = byId.get(o.id);
    if (!r || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: r.id, blob: r.blob, w: r.w, h: r.h, t: r.t || o.t || 0, rot: o.rot | 0 });
  }
  /* Rows the order record forgot about are still the user's pages. Append
     them rather than orphan them. */
  for (const [id, r] of byId) {
    if (seen.has(id)) continue;
    out.push({ id, blob: r.blob, w: r.w, h: r.h, t: r.t || 0, rot: 0 });
  }
  return out;
}

/** True when this browser will actually keep anything for us. */
export async function available() {
  try { await open(); return true; } catch (e) { return false; }
}
