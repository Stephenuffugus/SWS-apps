// Integration test for the team-parent skin: drives ../../team-parent/data.js
// (SKIN='team', announcement entries, RSVP-capacity slots) against the emulators.
// Run from apps/signup-sheets:
//   npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/team.test.mjs"
// team-parent resolves the firebase npm package through a node_modules symlink
// to ../signup-sheets/node_modules (recreate with `ln -s ../signup-sheets/node_modules ../team-parent/node_modules`).
import assert from 'node:assert/strict';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import * as T from '../../team-parent/data.js';

const { auth } = T.initFirebase({
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

await createUserWithEmailAndPassword(auth, 'coach@test.dev', 'test-password-1');
const coachUid = auth.currentUser.uid;

let boardId, code, slots;

await t('coach creates a team board (skin=team)', async () => {
  const r = await T.createBoard({ title: 'Roadrunners U10', description: 'Fall season' });
  boardId = r.boardId; code = r.code;
  const board = await once((cb, err) => T.watchBoard(boardId, cb, err));
  assert.equal(board.skin, 'team');
});

await t('coach posts an announcement entry', async () => {
  const board = await once((cb, err) => T.watchBoard(boardId, cb, err));
  const status = await T.addEntry(boardId, board, {
    authorName: 'Roadrunners organizer', body: 'Practice moved to 6pm', type: 'announcement',
  });
  assert.equal(status, 'ok');
});

await t('coach adds an RSVP event (cap 999) and a duty slot', async () => {
  await T.addSlots(boardId, [
    { label: 'Game vs Hawks · Sat Sep 12', capacity: 999, order: 1 },
    { label: 'Snack duty · Sat Sep 12', capacity: 2, order: 2 },
  ]);
  slots = await once((cb, err) => T.watchSlots(boardId, cb, err));
  assert.equal(slots.length, 2);
  assert.equal(slots[0].capacity, 999);
});

await signOut(auth);

await t('family RSVPs to the game with a note', async () => {
  await T.ensureSignedIn();
  const r = await T.claimSlot(boardId, slots[0].id, 'The Lees', 'can drive 3');
  assert.equal(r, 'ok');
  const claims = await once((cb, err) => T.watchClaims(boardId, slots[0].id, cb, err));
  assert.equal(claims.length, 1);
  assert.equal(claims[0].note, 'can drive 3');
});

await t('family sees the announcement (typed correctly)', async () => {
  const entries = await waitFor(
    (cb, err) => T.watchEntries(boardId, auth.currentUser.uid, false, cb, err),
    (es) => es.some(e => e.type === 'announcement'));
  const a = entries.find(e => e.type === 'announcement');
  assert.equal(a.body, 'Practice moved to 6pm');
});

await t('family claims the duty slot too', async () => {
  const r = await T.claimSlot(boardId, slots[1].id, 'The Lees');
  assert.equal(r, 'ok');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
