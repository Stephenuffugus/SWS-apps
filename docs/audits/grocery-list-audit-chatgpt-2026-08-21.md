# ChatGPT QA audit: Grocery List, 2026-08-21

Verbatim conversion of the report Stephen received on 2026-08-21
(source file: Grocery_List_Deep_QA_Audit_2026-08-21.docx), extracted the same day so it is greppable
and can never be trapped in a chat window.

The auditor was given a code-level source package, not the public page. The
orientation it was handed is preserved beside this file at
docs/audits/package-readme-*-2026-08-21.md; read that before judging any
finding here.

BODY IS VERBATIM EXTERNAL TEXT. It is a third-party record, so it is left
exactly as written, including any em or en dashes. Treat it like a vendor
file: the house no-dashes rule still governs everything WE write, and no
phrasing should be copied out of here into our own copy without rewriting.

Every finding below is a LEAD, not a truth, until verified against source.
Verification status is tracked in docs/audits/VERDICTS-2026-08-21.md.

---


GROCERY LIST
Deep QA, Security, UX, and Release Audit
Sky Wolf Studio / Engine 1 skin: grocery
Audit date: August 21, 2026
Live target stated in handoff: skywolfstudio.com/grocery-list/
Bottom line
Do not ship the current Firestore rules unchanged. The audit found one critical rules bypass that lets any authenticated link-holder pump the board counter without creating entries, plus multiple high-severity access-control and deletion/revocation defects. The application shell is thoughtful and several earlier fixes are solid, but the server-side invariants are not yet strong enough for a public shared-data app.
Audit standard. Findings marked CONFIRMED are proven directly from the supplied source. DEVICE/HUMAN TEST REQUIRED is used where the package cannot prove behavior. No issue is called confirmed solely from speculation.


1. Scope and verification performed
Reviewed the complete supplied app shell: index.html, app.js, data.js, helpers.js, sws-prefs.js, sws-ui.js, service worker, manifest, privacy page, Firebase config, Firestore rules, and both supplied test files.
Reviewed Firestore rules first, with special attention to anonymous writes, counter coupling, share-code revocation, cross-skin interference, locked-board behavior, orphaned subcollections, and hostile custom clients.
Ran Node syntax checks on app.js, data.js, helpers.js, sw.js, sws-prefs.js, and sws-ui.js. All six passed.
Attempted to execute both supplied tests. They could not start in the isolated package because firebase and @firebase/rules-unit-testing are not included, and the grocery integration test imports ../../grocery-list/data.js outside this package.
Static reference check found icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, and apple-touch-icon.png referenced by the app/manifest/service worker but absent from this QA package. This blocks a complete local PWA install/offline verification from the handoff alone.
Attempted a local browser interaction run for the shared settings component. The execution environment blocked browser navigation to local URLs, so the reported settings glitch remains DEVICE/HUMAN TEST REQUIRED rather than being guessed at.
Important test caveat. The existing rules suite is useful, but some test names assume that an arbitrary authenticated anonymous context is a "link-holder." The current rules do not actually prove that the anonymous UID ever possessed the current share code. That assumption is the root of the revocation weakness described below.
2. Ranked findings
ID / severity
Finding
Disposition
Ship impact
GL-SEC-01
CRITICAL
Participant can pump entryCount without creating an entry
CONFIRMED - RELEASE BLOCKER
Block release
GL-SEC-02
HIGH
Rotating the share link does not revoke existing boardId access
CONFIRMED
Block release
GL-SEC-03
HIGH
Deleting a board leaves readable orphaned subcollection data
CONFIRMED
Block release
GL-SEC-04
HIGH
Shared done toggle is not restricted to grocery skin
CONFIRMED
Block release
GL-APP-01
HIGH
Grocery UI accepts and operates on non-grocery Engine 1 boards
CONFIRMED
Block release
GL-DATA-01
HIGH
Clear Checked can exceed the Firestore 500-write batch limit
CONFIRMED
Block release
GL-PRIV-01
HIGH
Privacy policy and in-app privacy copy contradict actual flows
CONFIRMED
Block release
GL-CODE-01
HIGH
Share code is a 30-bit Math.random credential with no real rate limit
CONFIRMED DESIGN RISK
Fix before store packaging
GL-RULE-01
MEDIUM
Locked boards still allow participant deletes/releases
CONFIRMED
Schedule before broad rollout
GL-DATA-02
MEDIUM
Clear Checked can undercount during concurrent additions
CONFIRMED RACE
Schedule before broad rollout
GL-LIVE-01
MEDIUM
Remote board deletion leaves stale board UI/listeners
CONFIRMED
Schedule before broad rollout
GL-AUTH-01
MEDIUM
Signing out while on a board does not re-establish anonymous auth
CONFIRMED
Schedule before broad rollout
GL-AUTH-02
MEDIUM
Anonymous participant sign-in does not upgrade the anonymous UID
CONFIRMED DESIGN GAP
Schedule before broad rollout
GL-UNDO-01
MEDIUM
Owner Undo recreates rows under owner UID, changing ownership
CONFIRMED
Schedule before broad rollout
GL-DUPE-01
MEDIUM
Two-device duplicate prevention is not server-enforced
CONFIRMED
Schedule before broad rollout
GL-AUTH-03
LOW
Closing/cancelling Google popup can trigger full-page redirect
CONFIRMED
Schedule before broad rollout
GL-TEST-01
MEDIUM
QA package is not self-contained enough to rerun promised tests
CONFIRMED
Fix before store packaging
GL-PREF-01
TBD
Shared Display & comfort dialog glitches on real phone
DEVICE/HUMAN TEST REQUIRED
Schedule before broad rollout
3. Detailed findings
GL-SEC-01  |  CRITICAL  |  Participant can pump entryCount without creating an entry
Disposition: CONFIRMED - RELEASE BLOCKER
Source: firestore.rules lines 130-139; entry create coupling at lines 252-277; test/rules.test.mjs lines 96-103 and 168-183.
Why it matters: The participant board-update branch allows any authenticated user on an unlocked board to increase entryCount by exactly 1. It does not require a child entry to appear in the same batch and it does not enforce entryCount <= 500. The entry rule checks that a counter increment accompanies an entry create, but the counter rule does not check the reverse. A hostile link-holder can therefore increment the counter repeatedly without adding anything. Once the counter is above 500, all legitimate entry creates fail. On an empty board there is no normal Clear checked path to reset it, so the list can be effectively bricked from the public client model.
Reproduction / proof: Authenticate anonymously, learn a boardId, then repeatedly issue update(boards/{boardId}, {entryCount: increment(1)}) while the board is unlocked. Each single +1 satisfies the participant board rule. No entry document is required. The current test suite checks that decrementing is rejected, but it does not test bare increments.
Recommended fix: Make counter coupling bidirectional. The board-update rule must be able to identify the new entry path and prove that exactly one previously nonexistent entry created by request.auth.uid appears in the same atomic request. A practical small-schema approach is to add a lastEntryId/nonce field to the board update, require entryCount +1 and <=500, and use exists()/existsAfter() against entries/{lastEntryId}. The entry-create rule should reciprocally require boardAfter.lastEntryId == entryId. Do not rely on comments or the child rule alone.
Regression tests: Add: bare participant +1 fails; +1 to 501 fails; legitimate entry + coupled board update succeeds; forged lastEntryId fails; reusing an existing entry ID fails; two legitimate concurrent adds remain valid.
GL-SEC-02  |  HIGH  |  Share-link rotation does not revoke existing access
Disposition: CONFIRMED
Source: firestore.rules lines 105-108 (board get is auth-only), 241-305 (entry reads/writes), and 225-234 (rotation test); data.js lines 171-183; app.js lines 265-285 and 716-720.
Why it matters: The share code is used only to resolve an opaque boardId. After that, the rules treat possession of the boardId plus any Firebase auth session as sufficient access. There is no rule proving that the current user possessed the current share code. Rotating deletes the old code document and changes board.shareCode, but a client that already learned boardId can continue reading and writing through the board path. The UI promise that the old link "stops working for everyone" is therefore only true for a fresh client that tries to resolve the old code again.
Reproduction / proof: Open a board as anonymous user A and retain boardId. Owner rotates ABCDEF to NEWCDE. Without resolving NEWCDE, user A directly gets boards/{boardId}, watches approved entries, toggles done, or adds an entry. Current rules still authorize those operations while the board is unlocked.
Recommended fix: Introduce a per-board access grant keyed by auth.uid. A participant should obtain/update that grant only by presenting a current code whose codes/{code}.boardId matches the board and whose value equals board.shareCode. Every participant board/subcollection read and write should require a grant matching the board current share code or access generation. Rotation then invalidates old grants immediately. Owners bypass the grant. Also add a UI defense: if a loaded board shareCode differs from the route code, stop participant listeners and show that the link was rotated.
Regression tests: Add: anonymous user with no grant cannot read a known boardId; current-code grant succeeds; old grant fails after rotation; fresh current-code grant succeeds; owner remains unaffected.
GL-SEC-03  |  HIGH  |  Board deletion leaves data behind and parts remain readable
Disposition: CONFIRMED
Source: data.js lines 186-193; firestore.rules lines 145-146 (slots), 200-203 (claims), 241-250 (entries), and 141 (board delete).
Why it matters: Firestore document deletion is not recursive. deleteBoard removes only the code document and board document. Entries, slots, and claims remain as orphaned subcollection documents. The data layer comment says those documents become unreachable because the board read is the gate, but the rules do not implement that gate for many reads: slots and claims are readable by any authenticated user, and approved entries are readable without verifying that the parent board still exists. A former participant who retained boardId can therefore read orphaned data after the owner deletes the list.
Reproduction / proof: Create an approved entry under B2 and/or a slot. Record B2. Delete boards/B2 as owner. As an authenticated anonymous user, directly read boards/B2/entries/{id} where status == ok or list slots under boards/B2/slots. The parent board no longer exists, but the nested read rule can still succeed.
Recommended fix: First, make all nested access depend on a current board access predicate that explicitly requires the parent board to exist. Second, implement actual owner cleanup of known Engine 1 subcollections in bounded chunks before deleting the parent board/code. Keep the parent until cleanup succeeds so a partial cleanup never opens data. For a browser-only Firebase design, enumerate the known collections (entries, slots, claims) and delete in chunks under the write limit. Only then remove code and board.
Regression tests: Add: after deletion, orphan entry/slot/claim reads fail even if documents remain; full delete removes all known subcollection docs; interrupted cleanup leaves the parent intact and can retry.
GL-SEC-04  |  HIGH  |  Shared done toggle leaks across all Engine 1 skins
Disposition: CONFIRMED
Source: firestore.rules lines 252-255 and 279-305; test/rules.test.mjs lines 198-218.
Why it matters: The rules comment says the open done checkbox is a grocery-list feature, but the permission branch only checks authed(), boardUnlocked(), a diff containing only done, and a boolean value. It never checks board.skin == grocery. The create rule also allows an optional done field on every skin. Any authenticated person who knows a boardId can therefore add or flip done on signup, team, or caregiver entries even though those products do not define this shared grocery behavior.
Reproduction / proof: Use an existing signup board entry and update only {done:true} as a different anonymous user. The current rule shape permits it. The test suite proves the positive grocery case but lacks the required negative test against non-grocery skins.
Recommended fix: Require board(boardId).skin == "grocery" in the open done-update branch. Restrict the done field at create time to grocery boards unless another skin explicitly defines it. Add inverse rules tests for signup, team, and care.
Regression tests: Add: grocery stranger toggle succeeds; signup/team/care stranger toggle fails; adding done on non-grocery create fails; done plus body remains rejected on grocery.
GL-APP-01  |  HIGH  |  Grocery app opens non-grocery board codes
Disposition: CONFIRMED
Source: app.js lines 265-285, 558-648; data.js lines 17 and 113-120.
Why it matters: The data layer exports SKIN = grocery for creation, but renderBoard never checks the loaded board skin. A valid code from signup, team, or caregiver can resolve to a boardId and Grocery List will render that board as groceries. Because the shared entry schema overlaps, the Grocery UI can then create note entries and expose checkbox behavior against a sibling product. Combined with GL-SEC-04, this creates an accidental cross-app corruption path without any custom attacker client.
Reproduction / proof: Paste a share code from another Engine 1 skin into #/b/{code} on Grocery List. resolveCode succeeds and watchBoard supplies the foreign board. drawBoard proceeds because it checks only that the route is a board and live.board is non-null.
Recommended fix: On the first board snapshot, require b.skin === D.SKIN before starting the entries watcher or drawing controls. For mismatches, stop listeners and show a safe message such as "This code belongs to a different Sky Wolf Studio tool." If the app family has stable routes, optionally link to the correct skin.
Regression tests: Add a UI/integration test for a non-grocery code: no Grocery controls render and no entry write is attempted.
GL-DATA-01  |  HIGH  |  Clear Checked can exceed Firestore batch limit at the exact product cap
Disposition: CONFIRMED
Source: data.js lines 292-300; product cap in firestore.rules lines 275-277.
Why it matters: The list permits 500 entries. clearChecked places one delete operation in a WriteBatch for every checked entry, then adds one board update. If all 500 entries are checked, that is 501 write operations. Firestore WriteBatch is capped at 500 writes. This is a deterministic edge case at the exact maximum list size, so the recovery feature intended to rescue long-lived lists can fail when it is needed most.
Reproduction / proof: Populate a board with 500 entries, mark all done, then owner taps Clear checked. The client constructs 500 deletes plus one board update in a single batch.
Recommended fix: Chunk deletion below the batch ceiling, for example 400-450 deletes per batch, then perform a final board-count correction after deletion completes. Because that correction is concurrency-sensitive, pair this fix with GL-DATA-02 rather than simply splitting the current algorithm.
Regression tests: Add: clear 499 checked succeeds; clear 500 checked succeeds; partial failure is retryable and does not silently lose counter correctness.
GL-PRIV-01  |  HIGH  |  Privacy policy and trust copy contradict actual implementation
Disposition: CONFIRMED - STORE/POLICY RISK
Source: privacy.html: Where your data goes, What we do not do, Children, and Accessibility sections; app.js lines 52-71; data.js lines 43-80; sws-prefs.js lines 27 and 138-146.
Why it matters: Several statements are materially inaccurate. The policy says "No account, no sign-in, no email address collected" even though the list creator must sign in with Google or an email link. It says the owner is "signed in, anonymously by default," but anonymous users are explicitly prevented from owning boards. It says the only localStorage key written is gl-signin-email, while the shared settings component also writes sws.prefs. It says the app collects no personal information from anyone, yet an owner email can be used for sign-in, Firebase UIDs are generated, author names can be user-entered in the engine, and hosting/auth infrastructure can process IP/device data. In-app boardTrust says only item names leave the phone, but done state, board metadata, creator UID, and settings also sync.
Reproduction / proof: Compare privacy.html claims with startCreate/createBoard, Firebase Auth calls, Firestore document shapes, and sws-prefs storage. The contradictions are present in source without needing network traffic.
Recommended fix: Rewrite the policy around the real distinction: family members do not need to create a named account, but the app uses anonymous Firebase Authentication and assigns a random UID; the list creator must sign in; shared list content and state are stored in Firestore and cached in IndexedDB; display preferences use sws.prefs; email-link sign-in temporarily stores gl-signin-email. Avoid claiming that no personal information is collected. State that link rotation/deletion cannot claw back copies already cached or copied by another person. Update the in-app trust sentence so it names all categories that sync, not only item text.
Regression tests: Human review the final policy against Google Play Data safety answers before TWA publication.
GL-CODE-01  |  HIGH  |  Share code is a low-entropy credential generated with Math.random
Disposition: CONFIRMED DESIGN RISK
Source: helpers.js lines 3-10; firestore.rules lines 72-99; app.js lines 191-205.
Why it matters: The access credential is six characters drawn from a 32-character alphabet: 32^6 = 1,073,741,824 possibilities, exactly 30 bits. Code lookup is an authenticated direct document get, and anonymous Firebase auth is intentionally available. The generator uses Math.random, which is not a cryptographic random source. With many active boards, an attacker is searching for any valid code, not one specific household code, which reduces the expected work. Rules cannot impose a practical per-IP guess rate limit.
Reproduction / proof: No exploit requires enumeration queries. A client can sign in anonymously and issue direct get requests for candidate codes. A successful result reveals boardId. The security model currently treats that boardId as durable access afterward.
Recommended fix: Use crypto.getRandomValues for code generation. Increase credential entropy materially, preferably at least 8 characters from the same 32-symbol alphabet (40 bits) or more. If six-character manual entry is a hard UX requirement, it needs a separate abuse-control design; Firestore rules alone cannot turn 30 bits into a strong bearer credential. Add App Check as abuse friction if compatible, but do not treat it as the sole secrecy control.
Regression tests: Add deterministic tests for code length/alphabet plus a statistical smoke test that generation uses crypto, not Math.random. Add collision retry coverage.
GL-RULE-01  |  MEDIUM  |  Locked boards do not freeze all participant writes
Disposition: CONFIRMED
Source: firestore.rules lines 227-235 for claim delete; lines 307-315 for entry delete; stated security model at top of firestore.rules.
Why it matters: The rules header promises that locking a board freezes all participant writes. Create and edit paths generally check boardUnlocked, but participant releaseClaim and participant delete-own-entry do not. A link-holder can still remove their own claim or entry after the owner locks the board.
Reproduction / proof: Create an entry or claim as anonymous user A, lock the board as owner, then delete that entry or release that claim as A. Current delete branches do not require boardUnlocked.
Recommended fix: Add boardUnlocked(boardId) to participant delete/release branches if the stated invariant is truly "all participant writes freeze." Keep owner cleanup paths available.
Regression tests: Add locked-board tests for participant entry delete, claim release, done toggle, entry edit, new entry, and new claim.
GL-DATA-02  |  MEDIUM  |  Clear Checked can undercount during concurrent additions
Disposition: CONFIRMED RACE
Source: app.js lines 451-468; data.js lines 294-300.
Why it matters: clearChecked computes keep.length from a client snapshot and writes that absolute number to board.entryCount. If another device adds an item after the snapshot but before the clear batch commits, the final count depends on write order and can be lower than the number of live entries. Repeated undercounts weaken the 500-entry cap and make the warning inaccurate.
Reproduction / proof: Example: client sees 10 entries with 2 done. Another device adds one, raising server count to 11. Owner clear batch then deletes the original 2 and writes entryCount = 8. Nine entries now exist but the counter says 8.
Recommended fix: Do not derive a global counter from a stale client list. Use a transaction or a revision-aware reset protocol that reads current state needed for the count, or change the quota model so owner cleanup does not write an absolute client-derived count. If chunking GL-DATA-01, perform the final correction only after reconciling current server state.
Regression tests: Add a two-client emulator test that interleaves addEntry and clearChecked in both commit orders and asserts counter == actual live entries afterward.
GL-LIVE-01  |  MEDIUM  |  Remote deletion leaves stale board UI and orphan listeners
Disposition: CONFIRMED
Source: app.js lines 281-285 and drawBoard guard at 558-560; data.js lines 118-120.
Why it matters: watchBoard maps a deleted document to null, assigns live.board = null, and calls drawBoard. drawBoard immediately returns when live.board is falsy, so it never clears the old UI or shows a deletion state. The existing entries watcher is not stopped. Because GL-SEC-03 currently permits some orphan entry reads, a participant can continue seeing the list after the owner deletes it, then receive confusing write errors.
Reproduction / proof: Open the same board on two clients. Owner deletes the list. Participant receives a board snapshot with no document. The current callback does not call live.stop or replace the view.
Recommended fix: Handle a null board snapshot explicitly: stop all board/entry listeners, clear live state, and render a "This list was deleted or is no longer available" view. After access-grant fixes, the nested listener should also lose permission, but the UI still needs an intentional state transition.
Regression tests: Add a two-client integration test for owner delete while participant is viewing; participant UI state becomes deleted and no listener remains active.
GL-AUTH-01  |  MEDIUM  |  Sign out on a board does not establish a replacement anonymous session
Disposition: CONFIRMED
Source: app.js lines 775-780 and 817-829; renderBoard lines 265-285.
Why it matters: When the signed-in owner clicks Sign out while still on a board route, onAuth receives null and calls render(). renderBoard sees that live.code already equals the route code, so it skips ensureSignedIn and keeps the existing listener set. Those listeners now operate with no auth and can fail permission checks. The app does not automatically become the anonymous link-holder it claims family members can be.
Reproduction / proof: Owner opens their list and clicks Sign out without leaving the board. Observe user=null and renderBoard taking the live.code === code branch, which does not call ensureSignedIn.
Recommended fix: Choose an explicit product behavior. Simplest: signing out always sends the user home and calls live.stop. If staying on the shared board is desired, stop listeners, sign out, establish a fresh anonymous user, then reopen the route from the share code.
Regression tests: Add a sign-out-on-board integration test and assert no permission-error loop/stale UI.
GL-AUTH-02  |  MEDIUM  |  Anonymous participant sign-in does not upgrade the anonymous UID
Disposition: CONFIRMED DESIGN GAP
Source: data.js lines 43-65 and 67-80; Firestore creatorUid ownership rules lines 279-294 and 307-315.
Why it matters: Participants create entries under an anonymous Firebase UID. If that same person later signs in with Google or an email link to create their own list, the code uses signInWithPopup/signInWithRedirect/signInWithEmailLink instead of linking the permanent credential to the current anonymous user. That changes auth identity and can strand their earlier entries under the old anonymous creatorUid, so they lose author edit/delete rights on those rows.
Reproduction / proof: As anonymous user A, add an item. Then use the app sign-in flow. After the auth identity changes, the row still has creatorUid A while request.auth.uid is the permanent account UID.
Recommended fix: When currentUser.isAnonymous, use Firebase account-linking flow (for example linkWithPopup/linkWithRedirect or the corresponding credential-link flow) so the UID is preserved. Handle merge conflicts where the Google/email credential already belongs to an existing account with a deliberate migration decision.
Regression tests: Add: anonymous UID before upgrade equals UID after successful link; existing-account merge conflict has a tested path; previously created rows remain editable/deletable.
GL-UNDO-01  |  MEDIUM  |  Owner Undo changes item ownership
Disposition: CONFIRMED
Source: app.js lines 428-468; data.js lines 266-282; firestore.rules lines 256 and 307-315.
Why it matters: Undo after owner delete or Clear checked recreates a new entry through addEntry. That function always writes creatorUid = current auth UID. If the original row was created by another household member, Undo silently transfers the row to the owner. The original participant can no longer remove/edit what had been their own row. The source comment says the row is restored wholesale, but creatorUid, document ID, createdAt, and status are not restored.
Reproduction / proof: Participant A adds an item. Owner removes it, then taps Undo. The new row has owner UID as creatorUid. Participant A no longer satisfies the author rule.
Recommended fix: Either define Undo as a true restore with a rules-supported owner restore path that preserves original creatorUid and safe fields, or use a reversible soft-delete/tombstone model for the undo window. If ownership does not matter for Grocery UI edits, still preserve it because the rules and cross-engine semantics depend on creatorUid.
Regression tests: Add owner-delete-undo and clear-undo tests that assert creatorUid and participant permissions remain unchanged.
GL-DUPE-01  |  MEDIUM  |  Two-device duplicate prevention is only local
Disposition: CONFIRMED
Source: app.js lines 93-99 and 327-390.
Why it matters: The comments state that two devices racing the same word cannot create twins, but duplicate detection reads only live.entries in each client plus an in-memory inFlight set. Two devices can both observe "Milk" as absent and each create a random-ID entry before either snapshot includes the other write. Firestore has no uniqueness rule on normalized item name.
Reproduction / proof: Two clients on the same board both submit "Milk" at nearly the same time before receiving the other local write. Both writes use independent auto IDs and both satisfy current rules.
Recommended fix: If duplicates must be impossible, enforce a server-visible uniqueness key. A low-complexity option is a deterministic document ID derived from the normalized item name for new Grocery entries, with rules that prevent a second creator from overwriting the first. Existing random-ID entries need a compatibility path. If duplicate prevention is only best-effort UX, change the comment/product claim instead.
Regression tests: Add an emulator test with two auth contexts performing concurrent same-name creates; expected result must be exactly one live logical item.
GL-AUTH-03  |  LOW  |  Cancelling Google popup can trigger redirect anyway
Disposition: CONFIRMED
Source: data.js lines 49-62.
Why it matters: The catch branch falls back to redirect when the error code contains "popup" or "cancelled." That includes a user deliberately closing the popup or a cancelled popup request. Instead of respecting the cancel, the app can immediately send the user through a full-page Google redirect.
Reproduction / proof: Open Google sign-in and close the popup. Error codes such as auth/popup-closed-by-user contain "popup" and match the redirect fallback condition.
Recommended fix: Redirect only for errors that truly mean the popup flow cannot operate, such as popup blocked or unsupported environment. Treat explicit user cancellation as cancellation and leave the dialog intact.
Regression tests: Add unit coverage for popup-blocked vs popup-closed-by-user vs cancelled-popup-request.
GL-TEST-01  |  MEDIUM  |  The handoff package cannot rerun its promised tests as delivered
Disposition: CONFIRMED - AUDIT INFRASTRUCTURE
Source: test/rules.test.mjs imports @firebase/rules-unit-testing; test/grocery.test.mjs imports firebase and ../../grocery-list/data.js; no package.json/node_modules/firebase.json are included.
Why it matters: The read-me describes a self-contained QA package and explicitly asks the auditor to run the tests. In this package, both test commands fail before any assertion because dependencies are absent. The grocery integration import also points outside the extracted package. That means the "green at packaging time" claim cannot be independently reproduced from this artifact.
Reproduction / proof: Running node test/rules.test.mjs fails with ERR_MODULE_NOT_FOUND for @firebase/rules-unit-testing. Running node test/grocery.test.mjs fails with ERR_MODULE_NOT_FOUND for firebase before reaching its outside-package import.
Recommended fix: Package the minimal test harness: package.json plus lockfile, firebase.json if emulators:exec depends on it, and make integration imports relative to the package (for example ../data.js) or reproduce the expected folder structure inside the zip. Keep the zip isolated from unrelated apps.
Regression tests: CI should unzip the QA artifact into a clean directory and run exactly the documented commands. That clean-room run must pass before the package is handed off.
GL-PREF-01  |  TBD  |  Display & comfort dialog glitches after changing a setting
Disposition: DEVICE/HUMAN TEST REQUIRED
Source: sws-prefs.js lines 247-337; index.html comfort CSS around lines 1026-1216.
Why it matters: The real-phone report is credible, but source inspection does not reveal a single proven stale-state bug. The radio change handler updates state, applies the root attribute, persists it, and the native radio should update checked state without needing syncInputs. Text size and density changes do resize the settings dialog itself because the panel inherits the same root scale/density variables, which can cause a large live reflow on a phone, but that is a hypothesis until reproduced.
Reproduction / proof: On the affected phone, record a screen capture and remote-debug one setting change. Log: change event fired, state value, root data-* attribute, localStorage sws.prefs, selected input.checked, computed style of the selected label, dialog scrollTop, and dialog bounding box before/after. Repeat for text size, density, theme, warmth, contrast, reading, and motion.
Recommended fix: Do not patch blindly. If the problem is self-resizing/reflow, keep the dialog shell at a stable control scale and let only the sample preview the chosen text/density. If state changes but the selected pill does not repaint, test the :has(input:checked) path on the affected browser and provide a class/data-selected fallback. If the change event does not fire, inspect label/input hit testing. Because this component is shared fleet-wide, fix it in the shared source and re-apply it rather than editing the Grocery copy.
Regression tests: Add a component test that changes every option while the dialog stays open and asserts root attribute, stored value, radio checked state, visible selected styling, focus retention, and stable dialog position.
4. Additional correctness and lifecycle issues
Owner multi-tab stale share code: if one owner tab rotates the code, another already-open owner tab receives the updated board document but live.code remains the old route code. That stale tab can display/copy a dead link and may fail delete/rotate operations that try to delete the already-removed code document. Normalize live.code from board.shareCode for the owner, or deliberately reroute when the board code changes.
Route race: renderBoard(code) is async and has no request-generation guard. A slow resolution for code A can finish after the user navigates to code B and overwrite live state. drawBoard checks only that the current route is some board, not that route().code equals live.code. Add a monotonically increasing navigation token or verify the route code before attaching listeners/drawing.
Direct checkbox/duplicate toggle writes do not use the app commit() timeout wrapper. Offline Firestore writes can remain pending until reconnect, so those code paths do not get the same queued-state UX as add/delete/rename/clear. The local cache still applies the change, but user feedback is inconsistent.
Rules allow a board owner to mint additional codes pointing to their own board without requiring code == board.shareCode. The UI does not do this, but it weakens the one-current-code invariant. Tighten codes/{code} create so it matches the board current/post-write shareCode.
Delete list and Rotate link still use confirm() even though the handoff states the house pattern is destructive action plus Undo, not confirm. Decide whether these are explicit exceptions. If not, implement recoverable semantics rather than keeping confirmations as a quiet exception.
5. Things that are already strong
Done-toggle smuggling is narrowly shaped: the update branch allows only the done field and requires a boolean. The test suite explicitly covers attempts to change done plus body.
User-entered list/item text is rendered with textContent/createTextNode in the main app paths reviewed. I did not find an obvious stored-XSS path in Grocery List.
Board collection enumeration is denied to ordinary participants; owner list queries are self-scoped by ownerUid.
Claim counter coupling is substantially stronger than entry counter coupling because the slot rule verifies that the caller claim document genuinely appears/disappears in the same batch. Use that pattern as the conceptual model for fixing GL-SEC-01.
Service worker registration is relative (sw.js), so its default scope is /grocery-list/. Cache names use a grocery-specific prefix. The fetch handler caches same-origin assets and gstatic Firebase modules but does not intercept Firestore/Auth API origins. This is the right direction for avoiding sibling-cache and server-data caching problems.
The child manifest now has id = /grocery-list/ and scope = ./, which is the correct direction for fixing the portal/child install identity collision described in the handoff.
Auth failures are surfaced to users with visible toasts rather than being silently swallowed, including Google and email-link flows.
The UI has several thoughtful accessibility details: named remove buttons, real radio groups/fieldsets, focus restoration across live redraws, an aria-live list status, and a labelled QR canvas plus selectable URL.
6. Required regression matrix
Area
Required automated test
Expected result
Counter invariant
Bare anonymous entryCount +1; >500 pump; forged coupled ID
All rejected
Legitimate add
Entry create + verifiable board counter coupling
Succeeds <=500
Skin isolation
Non-grocery stranger done toggle and done-on-create
Rejected
Revocation
Old participant grant after code rotation
Read and write rejected
Deletion
Known boardId and orphan doc paths after delete
All server reads rejected
Lock
Delete own entry / release own claim after lock
Rejected
Clear 500
500 checked rows
Completes without batch-limit failure
Concurrency
Participant add races owner clear
Counter equals actual live rows
Wrong skin UI
Grocery receives signup/team/care code
Safe mismatch screen, no writes
Remote delete UI
Owner deletes while participant watches
Participant transitions to deleted state
Auth sign-out
Owner signs out while board open
No unauthenticated stale listener state
Anon upgrade
Participant upgrades to permanent auth
UID/ownership preserved or migrated
Undo ownership
Owner delete/clear then Undo participant row
creatorUid semantics preserved
Duplicate race
Two devices add same normalized name concurrently
Exactly one logical item if uniqueness is promised
Settings dialog
Change each comfort setting without closing
Visible selected state and stable panel
PWA install
Fresh install and offline reload on Android/iOS
Correct child identity, icons, offline shell
7. DEVICE / HUMAN TEST REQUIRED
Reproduce the reported shared settings-dialog glitch on the affected real phone with remote debugging. Do not mark fixed from desktop-only tests.
Two physical devices: open one link, rotate on owner device, verify the participant loses live server access after the new access-grant model. Also verify what cached offline content remains visible and make copy honest about that limitation.
Two physical devices: owner deletes the board while participant is online, offline, and reconnecting. Verify a clear deleted/revoked state and no orphan server access.
Google sign-in on the production custom domain, including popup blocked, popup cancelled, redirect return, unauthorized-domain error, and email-link flow.
PWA install on Android and iOS. Confirm manifest child identity, icon rendering including maskable icon, standalone launch URL, service-worker update behavior, and offline reopen.
TWA store-readiness check outside this package: Digital Asset Links / assetlinks.json, final package name/signing fingerprint, Play Data safety answers, privacy URL availability, screenshots, orientation, and install identity.
Network inspection on production: verify no analytics/advertising calls, Firestore/Auth destinations match policy, and service worker never serves Firestore/Auth traffic from Cache Storage.
8. Recommended patch order
1. Emergency rules hotfix: Close the bare entryCount pump, restrict done to grocery, and enforce lock on participant deletes/releases. Add inverse attack tests before deploying.
2. Replace boardId-as-access with revocable participant grants: Bind each anonymous UID to the current share code/access generation. Make every nested participant read/write depend on that grant. This is the core fix for rotation and orphan-read problems.
3. Enforce skin in the client: Reject foreign Engine 1 board codes before starting Grocery listeners or rendering controls. Handle shareCode changes differently for owner vs participant.
4. Fix deletion lifecycle: Delete known child data in chunks, then code + board. Handle remote null board snapshots as a first-class UI state.
5. Repair counter cleanup: Make Clear checked safe at 500 and concurrency-safe. Add emulator race tests.
6. Fix auth identity transitions: Stop/restart auth cleanly on sign-out and link anonymous users to permanent credentials when upgrading.
7. Make Undo semantically true: Preserve creator ownership and other permission-relevant fields, or use soft delete during undo window.
8. Strengthen share-code entropy: Use Web Crypto and longer codes. Add abuse friction where practical.
9. Correct privacy/store copy: Update privacy.html and boardTrust only after the final access/deletion behavior is settled.
10. Diagnose shared settings component on device: Instrument first, then patch shared source fleet-wide.
9. Release acceptance criteria
No anonymous participant can mutate board entryCount unless the same atomic request creates exactly one valid entry and the post-count is <=500.
Open done toggle is authorized only for grocery boards.
A participant who knew an old share code or boardId loses server read/write access immediately after code rotation, except for data already cached/copied locally.
Deleting a list removes known child data and all nested rules deny reads when the parent board does not exist.
Locked board behavior matches the documented invariant for every participant write type.
Clear checked succeeds with 500 checked items and remains counter-correct under concurrent additions.
Grocery UI refuses foreign Engine 1 skins.
Remote deletion/rotation produces an intentional participant UI state, not a frozen stale board.
Anonymous-to-permanent auth transition has a tested ownership-preservation/merge policy.
Privacy and in-app trust copy exactly match final Firebase/Auth/cache behavior.
Clean-room QA package can install dependencies and run all documented tests from inside the extracted artifact.
Real-device settings-dialog bug is either reproduced and fixed or explicitly waived with evidence.
Android/iOS PWA install and production sign-in pass device tests before TWA submission.
10. Suggested new test cases to add to rules.test.mjs
participant cannot increment entryCount without creating an entry
participant cannot increment entryCount above 500
non-grocery board rejects stranger done toggle
non-grocery entry create rejects done field
participant cannot read boardId without current access grant
old access grant fails after code rotation
orphan approved entry is unreadable after parent board deletion
orphan slot and claim are unreadable after parent board deletion
locked board rejects participant entry delete
locked board rejects participant claim release
code document must match board shareCode
11. External platform references used for verification
Firebase documents getAfter() specifically for validating atomic multi-document invariants in transactions/batches. This is the mechanism to use for a real reciprocal counter coupling. Firebase: Writing conditions for Cloud Firestore Security Rules
Firebase documentation/reference states that a WriteBatch supports at most 500 writes, which makes 500 deletes plus the board update an over-limit operation. Firebase: Transactions and batched writes
Firebase recommends linking a permanent credential to an anonymous account so the user can continue accessing data protected by the anonymous UID. Firebase: Authenticate anonymously and convert the account
12. Final verdict
Current status: NOT READY FOR PUBLIC SHARED-DATA RELEASE WITHOUT RULES CHANGES.
The frontend shows careful iteration and several fixes are genuinely good. The risk is concentrated where it matters most: Firestore authorization and lifecycle invariants. Fix GL-SEC-01 first, then the revocable-access model, cross-skin isolation, and deletion behavior. Once those are covered by clean-room emulator tests, the remaining work is normal product hardening rather than an architectural emergency.
