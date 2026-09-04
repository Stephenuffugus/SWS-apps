// Bracket Maker live links. This module is the ONE place the app talks to a
// server, and it is loaded lazily: until someone taps "Go live" or opens a
// live link, nothing here runs and nothing off this origin is fetched, so the
// on-device promise stays true for everyone who never uses the feature.
//
// One Firestore doc per live bracket, in `brackets/{id}`. The payload is the
// same encoded string a snapshot link carries, so the hardened URL decoder in
// helpers.js is the schema and the rules only have to bound the size. Owners
// are ANONYMOUS auth users: a bracket is a party fixture, not an account, and
// asking for a Google sign-in to run a cornhole night would kill the feature.
// The cost, accepted on purpose: clearing browser data orphans the live doc
// and the app has to offer "start a new live link" instead of recovery.
import { firebaseConfig } from './firebase-config.js';

const VER = '12.17.1';
const BASE = 'https://www.gstatic.com/firebasejs/' + VER + '/';

let api = null;

export async function init() {
  if (api) return api;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js'),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  /* No persistent Firestore cache on purpose: grocery-list shares this origin
     and its cache, two tabs fighting over one IndexedDB is a known failure,
     and a live bracket is small enough to fetch fresh every time. */
  const db = fsMod.getFirestore(app);

  api = {
    async ensureSignedIn() {
      if (auth.currentUser) return auth.currentUser;
      const cred = await authMod.signInAnonymously(auth);
      return cred.user;
    },
    uid() { return auth.currentUser ? auth.currentUser.uid : null; },
    async createLive(data) {
      const ref = fsMod.doc(fsMod.collection(db, 'brackets'));
      await fsMod.setDoc(ref, {
        ownerUid: auth.currentUser.uid,
        data,
        createdAt: fsMod.serverTimestamp(),
        updatedAt: fsMod.serverTimestamp(),
      });
      return ref.id;
    },
    pushLive(id, data) {
      return fsMod.updateDoc(fsMod.doc(db, 'brackets', id), {
        data,
        updatedAt: fsMod.serverTimestamp(),
      });
    },
    /* cb receives the doc data, or null when the owner has deleted it. */
    watchLive(id, cb, err) {
      return fsMod.onSnapshot(fsMod.doc(db, 'brackets', id),
        (s) => cb(s.exists() ? s.data() : null), err);
    },
    deleteLive(id) {
      return fsMod.deleteDoc(fsMod.doc(db, 'brackets', id));
    },
    isPermissionDenied(e) {
      return String((e && e.code) || '').includes('permission-denied');
    },
    isNotFound(e) {
      return String((e && e.code) || '').includes('not-found');
    },
  };
  return api;
}
