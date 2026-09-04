// Attack-matrix tests for the brackets block in firestore.rules, run via:
//   npx firebase emulators:exec --only firestore --project demo-signup "node test/bracket-rules.test.mjs"
// The live-bracket doc is world-readable to anyone holding its id, owner-only
// writable, and its owner may be anonymous. This suite tries to break exactly
// those three promises the way a hostile link-holder would.
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

const anonA = env.authenticatedContext('anonA', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const anonB = env.authenticatedContext('anonB', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const google = env.authenticatedContext('goog1', { firebase: { sign_in_provider: 'google.com' } }).firestore();
const nobody = env.unauthenticatedContext().firestore();

let passed = 0, failed = 0;
async function T(name, promise) {
  try { await promise; passed++; }
  catch (e) { failed++; console.error('FAIL:', name, '\n  ', String(e).slice(0, 300)); }
}

const bracketDoc = (over = {}) => ({
  ownerUid: 'anonA', data: 'eyJuIjpbIkEiLCJCIl19', createdAt: ST(), updatedAt: ST(), ...over,
});

// Seed one owned doc, rules bypassed, and assert the premise it exists.
await env.withSecurityRulesDisabled(async (ctx) => {
  await ctx.firestore().doc('brackets/L1').set({
    ownerUid: 'anonA', data: 'seed', createdAt: new Date(), updatedAt: new Date(),
  });
});
await T('premise: the seeded doc is there',
  assertSucceeds(anonA.doc('brackets/L1').get().then((s) => {
    if (!s.exists) throw new Error('seed doc missing');
  })));

/* ---- create ---- */
await T('an anonymous user creates their own live bracket',
  assertSucceeds(anonA.doc('brackets/C1').set(bracketDoc())));
await T('a Google user can too',
  assertSucceeds(google.doc('brackets/C2').set(bracketDoc({ ownerUid: 'goog1' }))));
await T('unauthenticated cannot create',
  assertFails(nobody.doc('brackets/C3').set(bracketDoc({ ownerUid: 'x' }))));
await T('cannot create a doc owned by someone else',
  assertFails(anonB.doc('brackets/C4').set(bracketDoc({ ownerUid: 'anonA' }))));
await T('cannot smuggle extra fields',
  assertFails(anonA.doc('brackets/C5').set(bracketDoc({ admin: true }))));
await T('data must be a string',
  assertFails(anonA.doc('brackets/C6').set(bracketDoc({ data: { deep: 'object' } }))));
await T('data must not be empty',
  assertFails(anonA.doc('brackets/C7').set(bracketDoc({ data: '' }))));
await T('data is capped at 8000 characters',
  assertFails(anonA.doc('brackets/C8').set(bracketDoc({ data: 'x'.repeat(8001) }))));
await T('createdAt must be the server clock',
  assertFails(anonA.doc('brackets/C9').set(bracketDoc({ createdAt: new Date(2000, 0, 1) }))));
await T('updatedAt must be the server clock',
  assertFails(anonA.doc('brackets/CA').set(bracketDoc({ updatedAt: new Date(2000, 0, 1) }))));

/* ---- read ---- */
await T('any signed-in link-holder reads the doc',
  assertSucceeds(anonB.doc('brackets/L1').get()));
await T('unauthenticated cannot read',
  assertFails(nobody.doc('brackets/L1').get()));
await T('nobody can enumerate brackets, not even their owner',
  assertFails(anonA.collection('brackets').get()));
await T('a where() on ownerUid does not open listing either',
  assertFails(anonA.collection('brackets').where('ownerUid', '==', 'anonA').get()));

/* ---- update ---- */
await T('the owner pushes a new payload',
  assertSucceeds(anonA.doc('brackets/L1').update({ data: 'bmV3', updatedAt: ST() })));
await T('a viewer cannot write results onto the board',
  assertFails(anonB.doc('brackets/L1').update({ data: 'ZXZpbA', updatedAt: ST() })));
await T('the owner cannot hand the doc to another uid',
  assertFails(anonA.doc('brackets/L1').update({ ownerUid: 'anonB', data: 'bmV3', updatedAt: ST() })));
await T('an update without touching the clock is refused',
  assertFails(anonA.doc('brackets/L1').update({ data: 'bmV3' })));
await T('an update faking the clock is refused',
  assertFails(anonA.doc('brackets/L1').update({ data: 'bmV3', updatedAt: new Date(2000, 0, 1) })));
await T('an oversized payload cannot be pushed later either',
  assertFails(anonA.doc('brackets/L1').update({ data: 'x'.repeat(8001), updatedAt: ST() })));

/* ---- delete ---- */
await T('a viewer cannot delete the live bracket',
  assertFails(anonB.doc('brackets/L1').delete()));
await T('unauthenticated cannot delete it',
  assertFails(nobody.doc('brackets/L1').delete()));
await T('the owner stops sharing',
  assertSucceeds(anonA.doc('brackets/L1').delete()));

/* ---- the neighbours ---- */
await T('an anonymous bracket owner still cannot create an Engine-1 board',
  assertFails(anonA.doc('boards/BX').set({
    ownerUid: 'anonA', skin: 'signup', title: 'X', description: '',
    shareCode: 'QQQQQQ', createdAt: ST(),
    settings: { approvalRequired: false, locked: false }, entryCount: 0,
  })));

await env.cleanup();
console.log(`\nbracket rules: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
