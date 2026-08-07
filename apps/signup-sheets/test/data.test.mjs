// Integration test: the REAL data layer against the auth+firestore emulators,
// with firestore.rules enforced. Proves the app's writes and the rules agree.
// Run: npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/data.test.mjs"
import assert from 'node:assert/strict';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import * as D from '../data.js';

const { auth, db } = D.initFirebase({
  apiKey: 'demo', authDomain: 'demo.firebaseapp.com', projectId: 'demo-signup',
});

let passed = 0, failed = 0;
async function T(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 250)); }
}
const rejects = async (p) => {
  try { await p; } catch (e) { return; }
  throw new Error('expected rejection, got success');
};
// one-shot wrapper around a watcher
const once = (attach) => new Promise((res, rej) => {
  const un = attach((v) => { un(); res(v); }, rej);
});
// resolve when a watcher emission satisfies pred (merged multi-query watchers
// emit incrementally, so "first emission" isn't always the settled state)
const waitFor = (attach, pred, ms = 5000) => new Promise((res, rej) => {
  let un = () => {};
  const timer = setTimeout(() => { un(); rej(new Error('timeout waiting for condition')); }, ms);
  un = attach((v) => { if (pred(v)) { clearTimeout(timer); un(); res(v); } },
    (e) => { clearTimeout(timer); rej(e); });
});

const OWNER_EMAIL = 'owner@test.dev', PW = 'test-password-1';
await createUserWithEmailAndPassword(auth, OWNER_EMAIL, PW);
const ownerUid = auth.currentUser.uid;

let boardId, code, slots;

await T('owner creates a board with a share code', async () => {
  const r = await D.createBoard({ title: 'Fall Potluck', description: 'Church hall, 6pm' });
  boardId = r.boardId; code = r.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});

await T('code resolves to the board', async () => {
  assert.equal(await D.resolveCode(code), boardId);
});

await T('owner bulk-adds slots', async () => {
  await D.addSlots(boardId, [
    { label: 'Main dish', capacity: 1, order: 1 },
    { label: 'Side or salad', capacity: 3, order: 2 },
    { label: 'Dessert', capacity: 2, order: 3 },
  ]);
  slots = await once((cb, err) => D.watchSlots(boardId, cb, err));
  assert.equal(slots.length, 3);
  assert.equal(slots[0].label, 'Main dish');
});

await T('myBoards lists the owner\'s board', async () => {
  const boards = await D.myBoards(ownerUid);
  assert.ok(boards.some(b => b.id === boardId));
});

await signOut(auth);

await T('anon participant claims the single-capacity slot (with a note)', async () => {
  await D.ensureSignedIn();
  const r = await D.claimSlot(boardId, slots[0].id, 'Pat', 'nut allergy');
  assert.equal(r, 'ok');
  const claims = await once((cb, err) => D.watchClaims(boardId, slots[0].id, cb, err));
  assert.equal(claims.length, 1);
  assert.equal(claims[0].name, 'Pat');
  assert.equal(claims[0].note, 'nut allergy');
});

await T('the same participant cannot double-claim the slot', async () => {
  await rejects(D.claimSlot(boardId, slots[0].id, 'Pat again'));
});

await T('participant cannot enumerate the boards collection', async () => {
  await rejects(getDocs(collection(db, 'boards')));
});

await signOut(auth);

await T('second participant bounces off the full slot', async () => {
  await D.ensureSignedIn();
  await rejects(D.claimSlot(boardId, slots[0].id, 'Sam'));
});

let samUid;
await T('…but gets a seat on the 3-capacity slot', async () => {
  samUid = auth.currentUser.uid;
  await D.claimSlot(boardId, slots[1].id, 'Sam');
});

await T('participant releases their own claim', async () => {
  await D.releaseClaim(boardId, slots[1].id);
  const claims = await once((cb, err) => D.watchClaims(boardId, slots[1].id, cb, err));
  assert.equal(claims.length, 0);
});

await T('participant posts a note (approval off → visible instantly)', async () => {
  const board = await once((cb, err) => D.watchBoard(boardId, cb, err));
  const status = await D.addEntry(boardId, board, { authorName: 'Sam', body: 'I will also bring lemonade' });
  assert.equal(status, 'ok');
});

await signOut(auth);
await signInWithEmailAndPassword(auth, OWNER_EMAIL, PW);

await T('owner turns on approval mode', async () => {
  const board = await once((cb, err) => D.watchBoard(boardId, cb, err));
  await D.setApproval(boardId, board.settings, true);
});

await signOut(auth);
let pendingAuthor;

await T('participant note now lands as pending', async () => {
  await D.ensureSignedIn();
  pendingAuthor = auth.currentUser.uid;
  const board = await once((cb, err) => D.watchBoard(boardId, cb, err));
  const status = await D.addEntry(boardId, board, { authorName: 'Lee', body: 'Napkins from me' });
  assert.equal(status, 'pending');
});

await T('author sees their own pending note', async () => {
  await waitFor(
    (cb, err) => D.watchEntries(boardId, pendingAuthor, false, cb, err),
    (entries) => entries.some(e => e.body === 'Napkins from me' && e.status === 'pending'));
});

await signOut(auth);

await T('strangers do NOT see the pending note', async () => {
  await D.ensureSignedIn();
  const entries = await waitFor(
    (cb, err) => D.watchEntries(boardId, auth.currentUser.uid, false, cb, err),
    (es) => es.some(e => e.body === 'I will also bring lemonade'));
  assert.ok(!entries.some(e => e.body === 'Napkins from me'), 'pending note hidden');
});

await signOut(auth);
await signInWithEmailAndPassword(auth, OWNER_EMAIL, PW);

await T('owner locks the sheet', async () => {
  const board = await once((cb, err) => D.watchBoard(boardId, cb, err));
  await D.setLocked(boardId, board.settings, true);
});

await signOut(auth);

await T('locked sheet rejects participant claims', async () => {
  await D.ensureSignedIn();
  await rejects(D.claimSlot(boardId, slots[2].id, 'Latecomer'));
});

await signOut(auth);
await signInWithEmailAndPassword(auth, OWNER_EMAIL, PW);

await T('owner rotates the share code — old link dies instantly', async () => {
  const newCode = await D.rotateCode(boardId, code);
  assert.notEqual(newCode, code);
  assert.equal(await D.resolveCode(code), null);
  assert.equal(await D.resolveCode(newCode), boardId);
  code = newCode;
});

await T('owner deletes the board', async () => {
  await D.deleteBoard(boardId, code);
  assert.equal(await D.resolveCode(code), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
