// Integration test for the caregiver-log skin: drives ../../caregiver-log/data.js
// (SKIN='care', typed timeline entries, coverage-day claims) against the emulators.
// Run from apps/signup-sheets:
//   npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/care.test.mjs"
import assert from 'node:assert/strict';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import * as C from '../../caregiver-log/data.js';

const { auth } = C.initFirebase({
  apiKey: 'demo', authDomain: 'demo.firebaseapp.com', projectId: 'demo-signup',
});

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 250)); }
}
const once = (attach) => new Promise((res, rej) => {
  const un = attach((v) => { un(); res(v); }, rej);
});
const waitFor = (attach, pred, ms = 5000) => new Promise((res, rej) => {
  let un = () => {};
  const timer = setTimeout(() => { un(); rej(new Error('timeout')); }, ms);
  un = attach((v) => { if (pred(v)) { clearTimeout(timer); un(); res(v); } },
    (e) => { clearTimeout(timer); rej(e); });
});

await createUserWithEmailAndPassword(auth, 'daughter@test.dev', 'test-password-1');

let boardId, code, slots;

await t('daughter starts a care log (skin=care)', async () => {
  const r = await C.createBoard({ title: 'Mom', description: 'Dr. Reyes 555-0111' });
  boardId = r.boardId; code = r.code;
  const board = await once((cb, err) => C.watchBoard(boardId, cb, err));
  assert.equal(board.skin, 'care');
});

await t('typed entries land with their types', async () => {
  const board = await once((cb, err) => C.watchBoard(boardId, cb, err));
  await C.addEntry(boardId, board, { authorName: 'Dana', body: 'Cardiology Tuesday 10am', type: 'appointment' });
  await C.addEntry(boardId, board, { authorName: 'Dana', body: 'Started 5mg lisinopril', type: 'medication' });
  await C.addEntry(boardId, board, { authorName: 'Dana', body: 'announcement should coerce', type: 'announcement' });
  const entries = await waitFor(
    (cb, err) => C.watchEntries(boardId, auth.currentUser.uid, true, cb, err),
    (es) => es.length >= 3);
  assert.ok(entries.some(e => e.type === 'appointment'));
  assert.ok(entries.some(e => e.type === 'medication'));
  assert.ok(!entries.some(e => e.type === 'announcement'), 'non-care type coerced to note');
});

await t('coverage week added', async () => {
  await C.addSlots(boardId, [
    { label: 'Monday, Aug 10', capacity: 1, order: 1 },
    { label: 'Tuesday, Aug 11', capacity: 1, order: 2 },
  ]);
  slots = await once((cb, err) => C.watchSlots(boardId, cb, err));
  assert.equal(slots.length, 2);
});

await signOut(auth);

await t('sibling (anon, via invite) claims a day and writes a note', async () => {
  await C.ensureSignedIn();
  const r = await C.claimSlot(boardId, slots[0].id, 'Sam', 'mornings only');
  assert.equal(r, 'ok');
  const board = await once((cb, err) => C.watchBoard(boardId, cb, err));
  const status = await C.addEntry(boardId, board, { authorName: 'Sam', body: 'She ate a full lunch today', type: 'note' });
  assert.equal(status, 'ok');
});

await t('the day shows as covered', async () => {
  const claims = await once((cb, err) => C.watchClaims(boardId, slots[0].id, cb, err));
  assert.equal(claims.length, 1);
  assert.equal(claims[0].note, 'mornings only');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
