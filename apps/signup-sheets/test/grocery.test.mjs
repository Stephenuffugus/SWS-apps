// Integration test for the grocery skin: drives ../../grocery-list/data.js
// against the emulators. Run from apps/signup-sheets:
//   npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/grocery.test.mjs"
import assert from 'node:assert/strict';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import * as G from '../../grocery-list/data.js';

const { auth, db } = G.initFirebase({
  apiKey: 'demo', authDomain: 'demo.firebaseapp.com', projectId: 'demo-signup',
});

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok:', name); }
  catch (e) { failed++; console.error('  FAIL:', name, '\n   ', String(e).slice(0, 250)); }
}
const waitFor = (attach, pred, ms = 5000) => new Promise((res, rej) => {
  let un = () => {};
  const timer = setTimeout(() => { un(); rej(new Error('timeout')); }, ms);
  un = attach((v) => { if (pred(v)) { clearTimeout(timer); un(); res(v); } },
    (e) => { clearTimeout(timer); rej(e); });
});
const once = (attach) => new Promise((res, rej) => {
  const un = attach((v) => { un(); res(v); }, rej);
});

await createUserWithEmailAndPassword(auth, 'household@test.dev', 'test-password-1');
let boardId, code, board, milkId;

await t('owner creates the household list (skin=grocery)', async () => {
  const r = await G.createBoard({ title: 'Groceries' });
  boardId = r.boardId; code = r.code;
  board = await once((cb, err) => G.watchBoard(boardId, cb, err));
  assert.equal(board.skin, 'grocery');
});

await t('owner adds items with done:false', async () => {
  await G.addEntry(boardId, board, { authorName: 'someone', body: 'Milk', type: 'note' });
  await G.addEntry(boardId, board, { authorName: 'someone', body: 'The good coffee', type: 'note' });
  const entries = await waitFor(
    (cb, err) => G.watchEntries(boardId, auth.currentUser.uid, true, cb, err),
    (es) => es.length === 2);
  assert.ok(entries.every(e => e.done === false));
  milkId = entries.find(e => e.body === 'Milk').id;
});

await signOut(auth);

await t('partner (anon, via link) checks off an item they did not add', async () => {
  await G.ensureSignedIn();
  await G.toggleDone(boardId, milkId, true);
  const entries = await waitFor(
    (cb, err) => G.watchEntries(boardId, auth.currentUser.uid, false, cb, err),
    (es) => es.some(e => e.id === milkId && e.done === true));
  assert.ok(entries.length >= 2);
});

await t('partner adds an item too', async () => {
  board = await once((cb, err) => G.watchBoard(boardId, cb, err));
  await G.addEntry(boardId, board, { authorName: 'someone', body: 'Tortillas', type: 'note' });
});

await signOut(auth);
await t('owner clears checked items and the counter resets to live count', async () => {
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(auth, 'household@test.dev', 'test-password-1');
  const entries = await waitFor(
    (cb, err) => G.watchEntries(boardId, auth.currentUser.uid, true, cb, err),
    (es) => es.length === 3);
  const n = await G.clearChecked(boardId, entries);
  assert.equal(n, 1);
  const after = await waitFor(
    (cb, err) => G.watchEntries(boardId, auth.currentUser.uid, true, cb, err),
    (es) => es.length === 2);
  assert.ok(!after.some(e => e.body === 'Milk'));
  board = await once((cb, err) => G.watchBoard(boardId, cb, err));
  assert.equal(board.entryCount, 2, 'counter reset so the list never hits the 500-ever cap');
});

/* The clear used to be one batch: one delete per ticked item plus the counter
   correction. A Firestore batch holds 500 writes and the product holds 500
   items, so a household that ticked off a full list produced 501 and the whole
   thing failed. The feature that rescues a long-lived list broke exactly when
   the list was longest, which is the only time anyone needs it. */
await t('a completely full list can still be cleared', async () => {
  const { collection, getDocs } = await import('firebase/firestore');
  const big = await G.createBoard({ title: 'A very long week' });
  let bigBoard = await once((cb, err) => G.watchBoard(big.boardId, cb, err));
  /* Seeded through the real addEntry, because the rules quite rightly refuse a
     client that tries to write entries any other way. 500 is not an arbitrary
     number: it is the product cap, and the cap is exactly where the old single
     batch tipped over its own 500-write ceiling.

     HONEST LIMIT OF THIS TEST: the Firestore emulator does not enforce the
     500-write batch ceiling, so this test passes against the old single-batch
     code too. It was run both ways to check. What it does prove is that the
     chunked path clears a full list completely and leaves the counter right.
     The ceiling itself is guaranteed by construction and asserted below, and
     only a real project can prove the rest. */
  const made = [];
  for (let i = 0; i < 500; i++) {
    const id = await G.addEntry(big.boardId, bigBoard, { authorName: 'someone', body: 'item ' + i, type: 'note', done: true });
    made.push(id);
  }
  const listed = await getDocs(collection(db, 'boards', big.boardId, 'entries'));
  assert.equal(listed.size, 500, 'the list really is full');
  const all = listed.docs.map(d => ({ id: d.id, done: true }));
  const cleared = await G.clearChecked(big.boardId, all);
  assert.equal(cleared, 500, 'every ticked item went, not just the first 499');
  const left = await getDocs(collection(db, 'boards', big.boardId, 'entries'));
  assert.equal(left.size, 0, 'nothing was stranded behind the batch limit');
  const after = await once((cb, err) => G.watchBoard(big.boardId, cb, err));
  assert.equal(after.entryCount, 0, 'and the counter came back to the live count');
});

await t('no delete batch can reach the Firestore write ceiling', async () => {
  // The emulator will not catch this for us, so read the guarantee off the
  // source: the chunk has to be strictly under 500, and the counter correction
  // must be its own write rather than a 501st passenger.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../grocery-list/data.js', import.meta.url), 'utf8');
  const m = /const CHUNK = (\d+);/.exec(src);
  assert.ok(m, 'clearChecked still deletes in chunks');
  assert.ok(Number(m[1]) < 500, 'and the chunk is under the 500-write batch ceiling');
  const body = src.slice(src.indexOf('export async function clearChecked'));
  const upto = body.slice(0, body.indexOf('return gone.length'));
  assert.ok(!/batch\.update\(/.test(upto),
    'the counter correction is its own write, not a passenger that makes a full batch 501');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
