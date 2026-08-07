// Integration test for the grocery skin: drives ../../grocery-list/data.js
// against the emulators. Run from apps/signup-sheets:
//   npx firebase emulators:exec --only firestore,auth --project demo-signup "node test/grocery.test.mjs"
import assert from 'node:assert/strict';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import * as G from '../../grocery-list/data.js';

const { auth } = G.initFirebase({
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
