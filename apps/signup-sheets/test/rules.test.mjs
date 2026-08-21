// Attack-matrix tests for firestore.rules, run via:
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
  // anonA owns an entry and a claim on the LOCKED board B3, so the lock tests
  // exercise the delete/release paths rather than failing for lack of a target.
  await db.doc('boards/B3/entries/locked1').set({
    authorName: 'Pat', body: 'written before the lock', type: 'note', status: 'ok',
    creatorUid: 'anonA', createdAt: new Date(),
  });
  await db.doc('boards/B3/slots/S1/claims/anonA').set({ name: 'Pat', createdAt: new Date() });
  await db.doc('boards/B3/slots/S1').set(
    { label: 'Locked slot', capacity: 5, order: 1, claimedCount: 1 });
  // What a deleted list leaves behind: children with no parent. GONE never had
  // a board document, which is exactly the state the owner's delete leaves.
  await db.doc('boards/GONE/entries/ghost1').set({
    authorName: 'Pat', body: 'milk', type: 'note', status: 'ok',
    creatorUid: 'anonA', createdAt: new Date(),
  });
  await db.doc('boards/GONE/slots/S1').set(
    { label: 'orphan', capacity: 2, order: 1, claimedCount: 0 });
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
await T('claim with a short note allowed', assertSucceeds((() => {
  const b = anonC.batch();
  b.set(anonC.doc('boards/B1/slots/S2/claims/anonC'), { name: 'Cai', note: 'gluten-free', createdAt: ST() });
  b.update(anonC.doc('boards/B1/slots/S2'), { claimedCount: 1 });
  return b.commit();
})()));
await T('claim with a 121-char note rejected', assertFails((() => {
  const b = anonB.batch();
  b.set(anonB.doc('boards/B1/slots/S2/claims/anonB'), { name: 'Sam', note: 'x'.repeat(121), createdAt: ST() });
  b.update(anonB.doc('boards/B1/slots/S2'), { claimedCount: 2 });
  return b.commit();
})()));
await T('claim with unknown extra field rejected', assertFails((() => {
  const b = anonB.batch();
  b.set(anonB.doc('boards/B1/slots/S2/claims/anonB'), { name: 'Sam', spy: 'x', createdAt: ST() });
  b.update(anonB.doc('boards/B1/slots/S2'), { claimedCount: 2 });
  return b.commit();
})()));
await T('owner sets a valid theme', assertSucceeds(owner.doc('boards/B1').update({ settings: { approvalRequired: false, locked: false, theme: 'plum' } })));
await T('unknown theme rejected', assertFails(owner.doc('boards/B1').update({ settings: { approvalRequired: false, locked: false, theme: 'neon' } })));
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
/* The board update has to name the entry it counted; see the counter-pump
   tests further down for why neither half is trusted alone. */
const entry = (db, uid, board = 'B1', count = 1, over = {}, id) => {
  const eid = id || uid + '-e' + count;
  const b = db.batch();
  b.set(db.doc(`boards/${board}/entries/` + eid), entryDoc(uid, over));
  b.update(db.doc('boards/' + board), { entryCount: count, lastEntryId: eid });
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
  b.update(owner.doc('boards/B4'), { entryCount: 2, lastEntryId: 'own1' });
  return b.commit();
})()));
await T('author edits own entry body', assertSucceeds(anonA.doc('boards/B1/entries/e1').update({ body: 'Rolls AND butter' })));
await T('another participant cannot edit it', assertFails(anonB.doc('boards/B1/entries/e1').update({ body: 'no rolls' })));
await T('author cannot flip their own status', assertFails(anonA.doc('boards/B4/entries/p2').update({ status: 'ok' })));
await T('owner approves a pending entry', assertSucceeds(owner.doc('boards/B4/entries/p2').update({ status: 'ok' })));
await T('author deletes own entry', assertSucceeds(anonA.doc('boards/B1/entries/e1').delete()));
await T('participant cannot delete another\'s entry', assertFails(anonB.doc('boards/B4/entries/own1').delete()));
await T('owner deletes any entry', assertSucceeds(owner.doc('boards/B4/entries/own1').delete()));

/* ---------- grocery skin: shared done-toggle ---------- */
await T('grocery board creates', assertSucceeds((() => {
  const b = owner.batch();
  b.set(owner.doc('boards/G1'), boardDoc({ skin: 'grocery', shareCode: 'GRCLST' }));
  b.set(owner.doc('codes/GRCLST'), { boardId: 'G1' });
  return b.commit();
})()));
await T('item created with done:false', assertSucceeds((() => {
  const b = anonA.batch();
  b.set(anonA.doc('boards/G1/entries/milk'), entryDoc('anonA', { body: 'Milk', done: false }));
  b.update(anonA.doc('boards/G1'), { entryCount: 1, lastEntryId: 'milk' });
  return b.commit();
})()));
await T('ANYONE with the link can check off an item they did not add',
  assertSucceeds(anonB.doc('boards/G1/entries/milk').update({ done: true })));
await T('done toggle cannot smuggle other field changes', assertFails(
  anonB.doc('boards/G1/entries/milk').update({ done: false, body: 'vandalized' })));
await T('done must be a boolean', assertFails(
  anonB.doc('boards/G1/entries/milk').update({ done: 'yes' })));
await T('unknown skin still rejected', assertFails(
  owner.doc('boards/G2').set(boardDoc({ skin: 'todo', shareCode: 'TDLIST' }))));

/* ---------- the counter pump (external audit, 2026-08-21, GL-SEC-01) ----------
   The claims counter proved its claim doc genuinely appears in the same batch;
   the entry counter only checked that the number went up by one. So a hostile
   link-holder could raise entryCount forever without ever adding an item, and
   once it passed 500 every honest add failed: the list bricked by a stranger
   with the link. These assert the coupling from both ends. */
await T('bare counter pump with no entry is refused',
  assertFails(anonB.doc('boards/G1').update({ entryCount: 2 })));
await T('counter pump naming an entry that is not created is refused',
  assertFails(anonB.doc('boards/G1').update({ entryCount: 2, lastEntryId: 'ghost' })));
await T('counter pump naming an entry that already exists is refused',
  assertFails(anonB.doc('boards/G1').update({ entryCount: 2, lastEntryId: 'milk' })));
await T('an honest add still works, entry and counter together', assertSucceeds((() => {
  const b = anonB.batch();
  b.set(anonB.doc('boards/G1/entries/bread'), entryDoc('anonB', { body: 'Bread', done: false }));
  b.update(anonB.doc('boards/G1'), { entryCount: 2, lastEntryId: 'bread' });
  return b.commit();
})()));
await T('an entry whose board update names a different entry is refused', assertFails((() => {
  const b = anonB.batch();
  b.set(anonB.doc('boards/G1/entries/eggs'), entryDoc('anonB', { body: 'Eggs' }));
  b.update(anonB.doc('boards/G1'), { entryCount: 3, lastEntryId: 'bread' });
  return b.commit();
})()));
await T('the 500 cap holds on the board update too', assertFails((() => {
  const b = anonA.batch();
  b.set(anonA.doc('boards/B5/entries/over'), entryDoc('anonA'));
  b.update(anonA.doc('boards/B5'), { entryCount: 501, lastEntryId: 'over' });
  return b.commit();
})()));

/* ---------- the done toggle is a GROCERY affordance (GL-SEC-04) ----------
   The rule was written for "whoever is at the store ticks things off" but it
   never checked the skin, so a stranger holding any board id could flip done
   on a signup sheet or a caregiver log, where no such shared checkbox exists. */
await T('stranger cannot flip done on a non-grocery board',
  assertFails(anonB.doc('boards/B4/entries/pending1').update({ done: true })));
/* Written as the full, otherwise-legal batch on purpose. A bare .set() would be
   refused for want of counter coupling and the assertion would pass without ever
   testing the skin, which is a test passing for the wrong reason. */
await T('done cannot be smuggled onto a non-grocery entry at create time', assertFails((() => {
  const b = anonC.batch();
  b.set(anonC.doc('boards/B1/entries/sneaky'), entryDoc('anonC', { done: true }));
  b.update(anonC.doc('boards/B1'), { entryCount: 2, lastEntryId: 'sneaky' });
  return b.commit();
})()));
await T('the same entry without done is accepted on a non-grocery board', assertSucceeds((() => {
  const b = anonC.batch();
  b.set(anonC.doc('boards/B1/entries/honest'), entryDoc('anonC'));
  b.update(anonC.doc('boards/B1'), { entryCount: 2, lastEntryId: 'honest' });
  return b.commit();
})()));

/* ---------- locking really does freeze participants (GL-RULE-01) ----------
   The file header promises locking freezes ALL participant writes. Delete and
   release were the two paths that never checked. */
await T('participant cannot delete their own entry on a locked board',
  assertFails(anonA.doc('boards/B3/entries/locked1').delete()));
await T('participant cannot release their claim on a locked board', assertFails((() => {
  const b = anonA.batch();
  b.delete(anonA.doc('boards/B3/slots/S1/claims/anonA'));
  b.update(anonA.doc('boards/B3/slots/S1'), { claimedCount: 0 });
  return b.commit();
})()));

/* ---------- deleting a list really removes it (GL-SEC-03) ----------
   Firestore delete is not recursive, so entries outlived their board. The read
   rules never checked the parent existed, which left a household's list
   readable by anyone still holding the board id after the owner deleted it. */
await T('an orphaned entry is unreadable once its board is gone',
  assertFails(anonA.doc('boards/GONE/entries/ghost1').get()));
await T('an orphaned slot is unreadable once its board is gone',
  assertFails(anonA.doc('boards/GONE/slots/S1').get()));

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
