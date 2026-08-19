/* The board driver. design/stress.mjs only ever reaches the home screen, the board lives behind a Firebase sign-in, so the standard battery exercises
   roughly 5% of this app. This swaps data.js for an in-memory stub (which
   mirrors the deployed firestore.rules on the write path, so a test fails if a
   change would be rejected in production) and drives the real board UI.

   Run from the repo root:  for t in apps/caregiver-log/test/t-*.mjs; do node "$t"; done */
import { withApp } from '../../../design/harness.mjs';

const STUB = `
const now = () => new Date();
const ts = (d) => ({ toDate: () => d, toMillis: () => d.getTime() });
const S = {
  board: { id: 'b1', ownerUid: 'owner', skin: 'care', title: 'Mom',
    description: '', shareCode: 'AAAAAA', settings: { approvalRequired: false, locked: false }, entryCount: 0 },
  slots: [], claims: new Map(), entries: [],
  uid: (typeof window !== 'undefined' && window.__UID) || 'owner',
  cbs: { board: [], slots: [], entries: [], claims: [] },
};
window.__S = S;
const emitBoard = () => S.cbs.board.forEach(cb => cb({ ...S.board }));
const emitSlots = () => S.cbs.slots.forEach(cb => cb(S.slots.map(s => ({ ...s }))));
const emitEntries = () => S.cbs.entries.forEach(cb => cb(
  S.entries.slice().sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map(e => ({ ...e }))));
const emitClaims = () => S.cbs.claims.forEach(({ slotId, cb }) => cb((S.claims.get(slotId) || []).map(c => ({ ...c }))));
window.__emit = () => { emitBoard(); emitSlots(); emitEntries(); emitClaims(); };
window.__addRemote = (o) => {
  S.entries.push({ id: 'r' + Math.random().toString(36).slice(2), authorName: o.author || 'Marcus',
    body: o.body, type: o.type || 'note', status: o.status || 'ok', creatorUid: o.uid || 'other',
    createdAt: ts(o.at ? new Date(o.at) : now()) });
  emitEntries();
};

export const SKIN = 'care';
export function initFirebase() { return {}; }
export const currentUser = () => ({ uid: S.uid, isAnonymous: S.uid !== 'owner' });
export const isAnon = (u) => !!u && u.isAnonymous;
export const onAuth = (cb) => { setTimeout(() => cb(currentUser()), 0); return () => {}; };
export const ensureSignedIn = async () => currentUser();
export const signInGoogle = async () => currentUser();
export const completeRedirect = async () => null;
export const startEmailLink = async () => {};
export const completeEmailLink = async () => null;
export const signOutUser = async () => {};
export const createBoard = async () => ({ boardId: 'b1', code: 'AAAAAA' });
export const resolveCode = async (c) => (c === 'AAAAAA' ? 'b1' : null);
export const watchBoard = (id, cb) => { S.cbs.board.push(cb); setTimeout(emitBoard, 0); return () => {}; };
export const watchSlots = (id, cb) => { S.cbs.slots.push(cb); setTimeout(emitSlots, 0); return () => {}; };
export const watchClaims = (id, slotId, cb) => { S.cbs.claims.push({ slotId, cb }); setTimeout(emitClaims, 0); return () => {}; };
export const watchEntries = (id, uid, own, cb) => { S.cbs.entries.push(cb); setTimeout(emitEntries, 0); return () => {}; };
export const myBoards = async () => [];
export const updateBoard = async (id, f) => { Object.assign(S.board, f); emitBoard(); };
export const setLocked = async (id, s, v) => { S.board.settings = { ...s, locked: v }; emitBoard(); };
export const setApproval = async (id, s, v) => { S.board.settings = { ...s, approvalRequired: v }; emitBoard(); };
export const setTheme = async () => {};
export const rotateCode = async () => 'AAAAAA';
export const deleteBoard = async () => {};
export const addSlots = async (id, rows) => {
  rows.forEach((r, i) => S.slots.push({ id: 's' + (S.slots.length + i), label: r.label, capacity: r.capacity || 1, order: r.order, claimedCount: 0 }));
  emitSlots();
};
export const updateSlot = async (id, sid, f) => { const s = S.slots.find(x => x.id === sid); Object.assign(s, f); emitSlots(); };
export const deleteSlot = async (id, sid) => { S.slots = S.slots.filter(x => x.id !== sid); emitSlots(); };
export const claimSlot = async (id, sid, name) => {
  const arr = S.claims.get(sid) || []; arr.push({ uid: S.uid, name }); S.claims.set(sid, arr);
  const s = S.slots.find(x => x.id === sid); s.claimedCount = arr.length; emitSlots(); emitClaims(); return 'ok';
};
export const releaseClaim = async () => {};
export const ownerRemoveClaim = async () => {};
export const renameClaim = async () => {};
export const addEntry = async (id, board, { authorName, body, type }) => {
  if (body.length > 2000) throw new Error('body too long, rules cap is 2000');
  if (authorName.length < 1 || authorName.length > 60) throw new Error('rules reject authorName of ' + authorName.length);
  if (!['note','appointment','medication','question','announcement'].includes(type)) throw new Error('rules reject type ' + type);
  // The deployed rules cap a board at 500 entries ever created, batch-coupled
  // to boards/{id}.entryCount. Without this the stub let a restore write past
  // a wall that production has.
  if ((S.board.entryCount || 0) + 1 > 500) { const e = new Error('permission-denied'); e.code = 'permission-denied'; throw e; }
  S.board.entryCount = (S.board.entryCount || 0) + 1;
  const status = S.uid === S.board.ownerUid ? 'ok' : (S.board.settings.approvalRequired ? 'pending' : 'ok');
  S.entries.push({ id: 'e' + S.entries.length + '-' + Math.random().toString(36).slice(2, 7), authorName, body, type, status, creatorUid: S.uid, createdAt: ts(now()) });
  emitEntries();
  emitBoard();
  return status;
};
export const updateEntry = async (id, eid, fields) => {
  const keys = Object.keys(fields);
  // mirror the deployed rules: nothing outside these three shapes may be written
  const ok = keys.every(k => ['authorName','body','status','done'].includes(k));
  if (!ok) throw new Error('rules would reject fields: ' + keys.join(','));
  const e = S.entries.find(x => x.id === eid); Object.assign(e, fields); emitEntries();
};
export const deleteEntry = async (id, eid) => { S.entries = S.entries.filter(x => x.id !== eid); emitEntries(); };
`;

const CFG = `export const firebaseConfig = { projectId: 'demo-x', apiKey: 'x', authDomain: 'x', appId: 'x' };`;

export async function board(fn, opts = {}) {
  const uid = opts.uid || 'owner';
  return withApp('caregiver-log', async (ctx) => {
    await ctx.page.addInitScript((u) => { window.__UID = u; }, uid);
    await ctx.page.route('**/caregiver-log/data.js', (r) =>
      r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
    await ctx.page.route('**/caregiver-log/firebase-config.js', (r) =>
      r.fulfill({ status: 200, contentType: 'text/javascript', body: CFG }));
    await ctx.page.route('**/caregiver-log/sw.js', (r) =>
      r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await ctx.page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    // The harness's own first load runs the REAL app, which registers the real
    // service worker; it then serves data.js from cache and page.route never
    // sees the request. Kill it, and keep killing it until nothing controls
    // the page, otherwise this run is a coin toss.
    const killSW = () => ctx.page.evaluate(async () => {
      if (navigator.serviceWorker) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      }
      return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    }).catch(() => false);

    let booted = false;
    for (let i = 0; i < 5 && !booted; i++) {
      await killSW();
      await ctx.page.goto('about:blank');
      await ctx.page.goto(ctx.url + '#/b/AAAAAA', { waitUntil: 'load' });
      const controlled = await ctx.page.evaluate(
        () => !!(navigator.serviceWorker && navigator.serviceWorker.controller)).catch(() => false);
      if (controlled) continue;
      try { await ctx.page.waitForSelector('.boardtitle', { timeout: 6000 }); booted = true; }
      catch (e) { if (i === 4) { console.log('BOOT FAILED'); throw e; } }
    }
    ctx.errors.length = 0;   // the harness's own first load ran the real data.js
    return fn(ctx);
  }, opts);
}
