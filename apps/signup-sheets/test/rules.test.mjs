// Attack-matrix tests for firestore.rules — run via:
//   npx firebase emulators:exec --only firestore --project demo-signup "node test/rules.test.mjs"
// Every failure mode of this product category is a rules failure, so this suite
// tries to break the rules the way a hostile link-holder would.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const ST = () => firebase.firestore.FieldValue.serverTimestamp();

const env = await initializeTestEnvironment({
  projectId: 'demo-signup',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

const owner = env.authenticatedContext('owner1', { firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner2 = env.authenticatedContext('owner2', { firebase: { sign_in_provider: 'google.com' } }).firestore();
const anonA = env.authenticatedContext('anonA', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const anonB = env.authenticatedContext('anonB', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const anonC = env.authenticatedContext('anonC', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const nobody = env.unauthenticatedContext().firestore();

let passed = 0, failed = 0;
async function T(name, promise) {
  try { await promise; passed++; }
  catch (e) { failed++; console.error('FAIL:', name, '\n  ', String(e).slice(0, 300)); }
}

const boardDoc = (over = {}) => ({
  ownerUid: 'owner1', skin: 'signup', title: 'Fall Potluck', description: '',
  shareCode: 'ABCDEF', createdAt: ST(),
  settings: { approvalRequired: false, locked: false }, entryCount: 0, ...over,
});
const entryDoc = (uid, over = {}) => ({
  authorName: 'Pat', body: 'I will bring the rolls', type: 'note',
  status: 'ok', creatorUid: uid, createdAt: ST(), ...over,
});

// Seed (rules bypassed): B1 open board w/ slot S1 cap 2; B4 approval-required;
// B3 locked; B5 at the 500-entry cap.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const mk = (id, over) => db.doc('boards/' + id).set({
    ownerUid: 'owner1', skin: 'signup', title: 'Board ' + id, description: '',
    shareCode: id.padEnd(6, 'X').slice(0, 6).toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, 'Z'),
    createdAt: new Date(), settings: { approvalRequired: false, locked: false },
    entryCount: 0, ...over,
  });
  await mk('B1', { shareCode: 'ABCDEF' });
  await db.doc('codes/ABCDEF').set({ boardId: 'B1' });
  await db.doc('boards/B1/slots/S1').set({ label: 'Bring a dish', capacity: 2, order: 1, claimedCount: 0 });
  await mk('B4', { settings: { approvalRequired: true, locked: false } });
  await mk('B3', { settings: { approvalRequired: false, locked: true } });
  await db.doc('boards/B3/slots/S1').set({ label: 'Locked slot', capacity: 5, order: 1, claimedCount: 0 });
  await mk('B5', { entryCount: 500 });
  // a pending entry by anonA on B4, for read-visibility tests
  await db.doc('boards/B4/entries/pending1').set({
    authorName: 'Pat', body: 'pending body', type: 'note', status: 'pending',
    creatorUid: 'anonA', createdAt: new Date(),
  });
});

/* ---------- reads ---------- */
await T('boards collection cannot be enumerated', assertFails(anonA.collection('boards').get()));
await T('owner lists only their own boards', assertSucceeds(owner.collection('boards').where('ownerUid', '==', 'owner1').get()));
await T('cannot query another owner\'s boards', assertFails(owner2.collection('boards').where('ownerUid', '==', 'owner1').get()));
await T('unauthed cannot read a board', assertFails(nobody.doc('boards/B1').get()));
await T('anon (link-holder) can read a board', assertSucceeds(anonA.doc('boards/B1').get()));
await T('anon can resolve a share code', assertSucceeds(anonA.doc('codes/ABCDEF').get()));
await T('codes can never be listed/enumerated', assertFails(anonA.collection('codes').get()));
await T('unauthed cannot resolve a code', assertFails(nobody.doc('codes/ABCDEF').get()));

/* ---------- board create ---------- */
await T('anonymous user cannot create a board', assertFails(anonA.doc('boards/X1').set(boardDoc({ ownerUid: 'anonA' }))));
await T('owner creates board+code in one batch', assertSucceeds((() => {
  const b = owner.batch();
  b.set(owner.doc('boards/B2'), boardDoc({ shareCode: 'QRSTUV' }));
  b.set(owner.doc('codes/QRSTUV'), { boardId: 'B2' });
  return b.commit();
})()));
await T('board with unknown skin rejected', assertFails(owner.doc('boards/X2').set(boardDoc({ skin: 'blog' }))));
await T('board with 101-char title rejected', assertFails(owner.doc('boards/X3').set(boardDoc({ title: 'x'.repeat(101) }))));
await T('board with malformed share code rejected', assertFails(owner.doc('boards/X4').set(boardDoc({ shareCode: 'AB01!f' }))));
await T('cannot create board owned by someone else', assertFails(owner2.doc('boards/X5').set(boardDoc({ ownerUid: 'owner1' }))));
await T('non-owner cannot mint a code for another\'s board', assertFails(owner2.doc('codes/ZZTOPZ').set({ boardId: 'B1' })));
await T('code with extra payload rejected', assertFails((() => {
  const b = owner.batch();
  b.set(owner.doc('boards/B9'), boardDoc({ shareCode: 'MNPQRS' }));
  b.set(owner.doc('codes/MNPQRS'), { boardId: 'B9', spy: 'data' });
  return b.commit();
})()));

/* ---------- board update ---------- */
await T('owner edits title', assertSucceeds(owner.doc('boards/B1').update({ title: 'Fall Potluck 2026' })));
await T('owner cannot transfer ownerUid', assertFails(owner.doc('boards/B1').update({ ownerUid: 'owner2' })));
await T('participant cannot edit title', assertFails(anonA.doc('boards/B1').update({ title: 'pwned' })));
await T('participant cannot unlock/relock settings', assertFails(anonA.doc('boards/B1').update({ 'settings.locked': true })));
await T('participant cannot decrement entryCount (cap bypass)', assertFails(anonA.doc('boards/B5').update({ entryCount: 499 })));
await T('stranger owner cannot edit another\'s board', assertFails(owner2.doc('boards/B1').update({ title: 'mine now' })));

/* ---------- slots ---------- */
await T('owner adds a slot', assertSucceeds(owner.doc('boards/B1/slots/S2').set({ label: 'Setup crew', capacity: 3, order: 2, claimedCount: 0 })));
await T('slot with capacity 0 rejected', assertFails(owner.doc('boards/B1/slots/S3').set({ label: 'x', capacity: 0, order: 3, claimedCount: 0 })));
await T('slot with capacity 5000 rejected', assertFails(owner.doc('boards/B1/slots/S3').set({ label: 'x', capacity: 5000, order: 3, claimedCount: 0 })));
await T('participant cannot create slots', assertFails(anonA.doc('boards/B1/slots/S9').set({ label: 'spam', capacity: 999, order: 9, claimedCount: 0 })));
await T('participant cannot change slot capacity', assertFails(anonA.doc('boards/B1/slots/S1').update({ capacity: 999 })));
await T('participant cannot delete a slot', assertFails(anonA.doc('boards/B1/slots/S1').delete()));

/* ---------- claims ---------- */
const claim = (db, uid, slot = 'boards/B1/slots/S1', count = 1) => {
  const b = db.batch();
  b.set(db.doc(slot + '/claims/' + uid), { name: 'Pat', createdAt: ST() });
  b.update(db.doc(slot), { claimedCount: count });
  return b.commit();
};
await T('anonA claims a slot (batched with counter)', assertSucceeds(claim(anonA, 'anonA', 'boards/B1/slots/S1', 1)));
await T('claim without counter increment rejected', assertFails(anonB.doc('boards/B1/slots/S1/claims/anonB').set({ name: 'Sam', createdAt: ST() })));
await T('claim doc id must be your own uid', assertFails((() => {
  const b = anonB.batch();
  b.set(anonB.doc('boards/B1/slots/S1/claims/victim'), { name: 'Sam', createdAt: ST() });
  b.update(anonB.doc('boards/B1/slots/S1'), { claimedCount: 2 });
  return b.commit();
})()));
await T('anonB takes the second seat', assertSucceeds(claim(anonB, 'anonB', 'boards/B1/slots/S1', 2)));
await T('claim beyond capacity rejected', assertFails(claim(anonC, 'anonC', 'boards/B1/slots/S1', 3)));
await T('counter pump without new claim doc rejected', assertFails(anonA.doc('boards/B1/slots/S1').update({ claimedCount: 2 })));
await T('participant cannot delete someone else\'s claim', assertFails((() => {
  const b = anonB.batch();
  b.delete(anonB.doc('boards/B1/slots/S1/claims/anonA'));
  b.update(anonB.doc('boards/B1/slots/S1'), { claimedCount: 1 });
  return b.commit();
})()));
await T('counter drain without owning a claim rejected', assertFails(anonC.doc('boards/B1/slots/S1').update({ claimedCount: 1 })));
await T('anonA fixes the name on their own claim', assertSucceeds(anonA.doc('boards/B1/slots/S1/claims/anonA').update({ name: 'Patricia' })));
await T('anonB cannot rename anonA\'s claim', assertFails(anonB.doc('boards/B1/slots/S1/claims/anonA').update({ name: 'goblin' })));
await T('anonA releases their own claim', assertSucceeds((() => {
  const b = anonA.batch();
  b.delete(anonA.doc('boards/B1/slots/S1/claims/anonA'));
  b.update(anonA.doc('boards/B1/slots/S1'), { claimedCount: 1 });
  return b.commit();
})()));
await T('owner removes any claim directly', assertSucceeds(owner.doc('boards/B1/slots/S1/claims/anonB').delete()));
await T('locked board: claims rejected', assertFails(claim(anonA, 'anonA', 'boards/B3/slots/S1', 1)));

/* ---------- entries ---------- */
const entry = (db, uid, board = 'B1', count = 1, over = {}, id) => {
  const b = db.batch();
  b.set(db.doc(`boards/${board}/entries/` + (id || uid + '-e' + count)), entryDoc(uid, over));
  b.update(db.doc('boards/' + board), { entryCount: count });
  return b.commit();
};
await T('participant posts an entry (batched with counter)', assertSucceeds(entry(anonA, 'anonA', 'B1', 1, {}, 'e1')));
await T('entry without counter increment rejected', assertFails(anonB.doc('boards/B1/entries/free').set(entryDoc('anonB'))));
await T('2001-char body rejected', assertFails(entry(anonB, 'anonB', 'B1', 2, { body: 'x'.repeat(2001) })));
await T('spoofed creatorUid rejected', assertFails(entry(anonB, 'anonB', 'B1', 2, { creatorUid: 'anonA' })));
await T('unknown entry type rejected', assertFails(entry(anonB, 'anonB', 'B1', 2, { type: 'advert' })));
await T('participant cannot self-approve on approval board', assertFails(entry(anonA, 'anonA', 'B4', 1, { status: 'ok' })));
await T('participant entry lands as pending on approval board', assertSucceeds(entry(anonA, 'anonA', 'B4', 1, { status: 'pending' }, 'p2')));
await T('entry cap of 500 holds', assertFails(entry(anonA, 'anonA', 'B5', 501)));
await T('locked board: entries rejected', assertFails(entry(anonA, 'anonA', 'B3', 1)));
await T('owner posts pre-approved even on approval board', assertSucceeds((() => {
  const b = owner.batch();
  b.set(owner.doc('boards/B4/entries/own1'), entryDoc('owner1', { status: 'ok' }));
  b.update(owner.doc('boards/B4'), { entryCount: 2 });
  return b.commit();
})()));
await T('author edits own entry body', assertSucceeds(anonA.doc('boards/B1/entries/e1').update({ body: 'Rolls AND butter' })));
await T('another participant cannot edit it', assertFails(anonB.doc('boards/B1/entries/e1').update({ body: 'no rolls' })));
await T('author cannot flip their own status', assertFails(anonA.doc('boards/B4/entries/p2').update({ status: 'ok' })));
await T('owner approves a pending entry', assertSucceeds(owner.doc('boards/B4/entries/p2').update({ status: 'ok' })));
await T('author deletes own entry', assertSucceeds(anonA.doc('boards/B1/entries/e1').delete()));
await T('participant cannot delete another\'s entry', assertFails(anonB.doc('boards/B4/entries/own1').delete()));
await T('owner deletes any entry', assertSucceeds(owner.doc('boards/B4/entries/own1').delete()));

/* ---------- pending-entry visibility ---------- */
await T('stranger cannot read someone\'s pending entry', assertFails(anonB.doc('boards/B4/entries/pending1').get()));
await T('author reads their own pending entry', assertSucceeds(anonA.doc('boards/B4/entries/pending1').get()));
await T('owner reads pending entries', assertSucceeds(owner.doc('boards/B4/entries/pending1').get()));

/* ---------- code rotation ---------- */
await T('owner rotates the share code', assertSucceeds((() => {
  const b = owner.batch();
  b.delete(owner.doc('codes/ABCDEF'));
  b.set(owner.doc('codes/NEWCDE'), { boardId: 'B1' });
  b.update(owner.doc('boards/B1'), { shareCode: 'NEWCDE' });
  return b.commit();
})()));
await T('participant cannot delete a share code', assertFails(anonA.doc('codes/NEWCDE').delete()));
await T('stranger owner cannot rotate another\'s code', assertFails(owner2.doc('codes/NEWCDE').delete()));

/* ---------- board delete ---------- */
await T('participant cannot delete the board', assertFails(anonA.doc('boards/B1').delete()));
await T('owner deletes their board', assertSucceeds(owner.doc('boards/B2').delete()));

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
