# Grocery List

One live list for the whole household. The owner signs in once and shares a
link; everyone else — partner, kids, roommates — opens it with no account and
sees every change in real time. Add from the couch, check off at the store;
the done-checkbox is deliberately open to every link-holder (rules-enforced:
the toggle can't smuggle any other change). "Clear checked" also resets the
board's entry counter so a long-lived list never hits the engine's 500-ever
cap. Engine 1 skin (`grocery`) on the shared Firebase project; requires rules
v3+ (adds the skin + the open done toggle). A free tool by Sky Wolf Studio.

Integration-tested end to end against the emulators
(`../signup-sheets/test/grocery.test.mjs`). `CONFIG.tipUrl` in `app.js`.
