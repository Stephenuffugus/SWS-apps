// Firestore/Auth data layer. Every write here mirrors firestore.rules exactly, // the counter-coupled batches are not optional; the rules reject anything else.
// Imported via an import map: the browser resolves 'firebase/*' to gstatic ESM
// builds; node tests resolve it to the npm package against the emulator.
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInAnonymously,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, connectFirestoreEmulator,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  onSnapshot, query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { genCode } from './helpers.js';

export const SKIN = 'care';
const CARE_TYPES = ['note', 'appointment', 'medication', 'question'];

let app, auth, db;

export function initFirebase(config, { emulatorHost } = {}) {
  app = initializeApp(config);
  auth = getAuth(app);
  const canPersist = typeof indexedDB !== 'undefined';
  try {
    db = initializeFirestore(app, canPersist ? { localCache: persistentLocalCache() } : {});
  } catch (e) {
    db = initializeFirestore(app, {}); // private mode / multi-tab fallback
  }
  if (config.projectId && config.projectId.startsWith('demo-')) {
    const host = emulatorHost || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8081);
  }
  return { app, auth, db };
}

export const currentUser = () => auth.currentUser;
export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const isAnon = (u) => !!u && u.isAnonymous;

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function signInGoogle() {
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    return cred.user;
  } catch (e) {
    const code = (e && e.code) || '';
    // Popup blocked or closed (embedded browsers, strict blockers):
    // fall back to a full-page redirect, the page comes back signed in.
    if (code.includes('popup') || code.includes('cancelled')) {
      await signInWithRedirect(auth, new GoogleAuthProvider());
      return null; // navigating away
    }
    throw e;
  }
}

export const completeRedirect = () => getRedirectResult(auth);

const EMAIL_KEY = 'cl-signin-email'; // per-app: shared origin must not collide
export async function startEmailLink(email, url) {
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try { localStorage.setItem(EMAIL_KEY, email); } catch (e) {}
}
export async function completeEmailLink(promptFn) {
  if (!isSignInWithEmailLink(auth, location.href)) return null;
  let email = null;
  try { email = localStorage.getItem(EMAIL_KEY); } catch (e) {}
  if (!email) email = await promptFn();
  if (!email) return null;
  const cred = await signInWithEmailLink(auth, email, location.href);
  try { localStorage.removeItem(EMAIL_KEY); } catch (e) {}
  return cred.user;
}
export const signOutUser = () => signOut(auth);

/* ---------- boards ---------- */

export async function createBoard({ title, description = '' }) {
  const uid = auth.currentUser.uid;
  // collision-check the share code; retry with a fresh one if taken
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const codeRef = doc(db, 'codes', code);
    const taken = await getDoc(codeRef);
    if (taken.exists()) continue;
    const boardRef = doc(collection(db, 'boards'));
    const batch = writeBatch(db);
    batch.set(boardRef, {
      ownerUid: uid,
      skin: SKIN,
      title: title.slice(0, 100),
      description: description.slice(0, 1000),
      shareCode: code,
      createdAt: serverTimestamp(),
      settings: { approvalRequired: false, locked: false },
      entryCount: 0,
    });
    batch.set(codeRef, { boardId: boardRef.id });
    await batch.commit();
    return { boardId: boardRef.id, code };
  }
  throw new Error('could-not-allocate-code');
}

export async function resolveCode(code) {
  const snap = await getDoc(doc(db, 'codes', code));
  return snap.exists() ? snap.data().boardId : null;
}

export const watchBoard = (boardId, cb, err) =>
  onSnapshot(doc(db, 'boards', boardId),
    (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), err);

export const watchSlots = (boardId, cb, err) =>
  onSnapshot(query(collection(db, 'boards', boardId, 'slots'), orderBy('order')),
    (qs) => cb(qs.docs.map(d => ({ id: d.id, ...d.data() }))), err);

export const watchClaims = (boardId, slotId, cb, err) =>
  onSnapshot(collection(db, 'boards', boardId, 'slots', slotId, 'claims'),
    (qs) => cb(qs.docs.map(d => ({ uid: d.id, ...d.data() }))), err);

/* Participants may only list approved entries plus their own; owners list all.
   (The rules enforce this per-document, so the queries must match.) */
export function watchEntries(boardId, uid, isOwner, cb, err) {
  const col = collection(db, 'boards', boardId, 'entries');
  if (isOwner) {
    return onSnapshot(query(col, orderBy('createdAt', 'desc')),
      (qs) => cb(qs.docs.map(d => ({ id: d.id, ...d.data() }))), err);
  }
  const seen = new Map();
  const emit = () => cb([...seen.values()].sort((a, b) =>
    (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  const apply = (qs) => {
    for (const ch of qs.docChanges()) {
      if (ch.type === 'removed') seen.delete(ch.doc.id);
      else seen.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
    }
    emit();
  };
  const u1 = onSnapshot(query(col, where('status', '==', 'ok')), apply, err);
  const u2 = uid ? onSnapshot(query(col, where('creatorUid', '==', uid)), apply, err) : () => {};
  return () => { u1(); u2(); };
}

export async function myBoards(uid) {
  const qs = await getDocs(query(collection(db, 'boards'), where('ownerUid', '==', uid)));
  return qs.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export const updateBoard = (boardId, fields) =>
  updateDoc(doc(db, 'boards', boardId), fields);

export const setLocked = (boardId, settings, locked) =>
  updateDoc(doc(db, 'boards', boardId), { settings: { ...settings, locked } });

export const setApproval = (boardId, settings, approvalRequired) =>
  updateDoc(doc(db, 'boards', boardId), { settings: { ...settings, approvalRequired } });

export const setTheme = (boardId, settings, theme) =>
  updateDoc(doc(db, 'boards', boardId), { settings: { ...settings, theme } });

export async function rotateCode(boardId, oldCode) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const codeRef = doc(db, 'codes', code);
    if ((await getDoc(codeRef)).exists()) continue;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'codes', oldCode));
    batch.set(codeRef, { boardId });
    batch.update(doc(db, 'boards', boardId), { shareCode: code });
    await batch.commit();
    return code;
  }
  throw new Error('could-not-allocate-code');
}

export async function deleteBoard(boardId, code) {
  // v1: deletes the board + code docs; orphaned subcollection docs become
  // unreachable (board read is the gate). A cleanup Function can reap them later.
  const batch = writeBatch(db);
  batch.delete(doc(db, 'codes', code));
  batch.delete(doc(db, 'boards', boardId));
  await batch.commit();
}

/* ---------- slots ---------- */

export async function addSlots(boardId, rows) {
  // chunk under the 500-op batch limit
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    rows.slice(i, i + 400).forEach((row, j) => {
      batch.set(doc(collection(db, 'boards', boardId, 'slots')), {
        label: row.label.slice(0, 120),
        capacity: Math.min(Math.max(row.capacity || 1, 1), 999),
        order: (row.order !== undefined ? row.order : Date.now() + i + j),
        claimedCount: 0,
      });
    });
    await batch.commit();
  }
}

export const updateSlot = (boardId, slotId, fields) =>
  updateDoc(doc(db, 'boards', boardId, 'slots', slotId), fields);

export const deleteSlot = (boardId, slotId) =>
  deleteDoc(doc(db, 'boards', boardId, 'slots', slotId));

/* Claim = claims/{myUid} + counter, one batch. Rules verify the coupling,
   capacity, and that this uid didn't already hold a claim on the slot.
   Returns 'note-dropped' if the claim landed but the note was rejected
   (published rules older than the note feature). */
export async function claimSlot(boardId, slotId, name, note) {
  const uid = (await ensureSignedIn()).uid;
  const commit = (withNote) => {
    const data = { name: name.slice(0, 60), createdAt: serverTimestamp() };
    if (withNote) data.note = note.trim().slice(0, 120);
    const batch = writeBatch(db);
    batch.set(doc(db, 'boards', boardId, 'slots', slotId, 'claims', uid), data);
    batch.update(doc(db, 'boards', boardId, 'slots', slotId), { claimedCount: increment(1) });
    return batch.commit();
  };
  const hasNote = !!(note && note.trim());
  if (!hasNote) { await commit(false); return 'ok'; }
  try { await commit(true); return 'ok'; }
  catch (e) {
    if (!String((e && e.code) || '').includes('permission-denied')) throw e;
    await commit(false); // if this also fails (slot full/locked), it throws to the caller
    return 'note-dropped';
  }
}

export async function releaseClaim(boardId, slotId) {
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'boards', boardId, 'slots', slotId, 'claims', uid));
  batch.update(doc(db, 'boards', boardId, 'slots', slotId), { claimedCount: increment(-1) });
  await batch.commit();
}

export async function ownerRemoveClaim(boardId, slotId, claimUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'boards', boardId, 'slots', slotId, 'claims', claimUid));
  batch.update(doc(db, 'boards', boardId, 'slots', slotId), { claimedCount: increment(-1) });
  await batch.commit();
}

export const renameClaim = (boardId, slotId, name) =>
  updateDoc(doc(db, 'boards', boardId, 'slots', slotId, 'claims', auth.currentUser.uid),
    { name: name.slice(0, 60) });

/* ---------- entries ---------- */

export async function addEntry(boardId, board, { authorName, body, type }) {
  const uid = (await ensureSignedIn()).uid;
  const owner = board.ownerUid === uid;
  const status = owner ? 'ok' : (board.settings.approvalRequired ? 'pending' : 'ok');
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'boards', boardId, 'entries')), {
    authorName: authorName.slice(0, 60),
    body: body.slice(0, 2000),
    type: CARE_TYPES.includes(type) ? type : 'note',
    status,
    creatorUid: uid,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'boards', boardId), { entryCount: increment(1) });
  await batch.commit();
  return status;
}

export const updateEntry = (boardId, entryId, fields) =>
  updateDoc(doc(db, 'boards', boardId, 'entries', entryId), fields);

export const deleteEntry = (boardId, entryId) =>
  deleteDoc(doc(db, 'boards', boardId, 'entries', entryId));
