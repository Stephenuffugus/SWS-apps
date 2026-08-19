# Trust copy for the four shared apps

18 of 23 apps carry a `.trust` badge. These four do not, and the review agents
were right to leave them alone: caregiver-log, grocery-list, signup-sheets and
team-parent are Firebase-backed, so stamping *"nothing leaves your device"* on
them would be a lie.

They still need the promise as an object rather than grey footer copy, the
research is just as blunt about that here. It simply has to be a **different,
true** promise.

## What is actually true, verified from the code

Checked in `apps/<slug>/data.js` and `firestore.rules`, not assumed:

| Claim | True? | Evidence |
|---|---|---|
| Data is stored on a server | **Yes** | Firestore; a shared board cannot work otherwise |
| Anyone with the link/code can read it | **Yes** | access is by `shareCode`, not by identity |
| Joining needs no account | **Yes** | `signInAnonymously` is the participant path |
| *Creating* needs no account | **NO** | owners sign in, `GoogleAuthProvider`, `signInWithEmailLink` |
| No ads | **Yes** | no ad or tracking code anywhere in the tree |

That fourth row is why the copy below never says "no account" flatly. It is
true for the many people who join a list and false for the one who made it, and
a promise that is false for the person reading it is worse than no promise.

## Proposed copy

Written to describe the **mechanism**, which is verifiable, rather than to make
promises about business conduct, which are the owner's to make and not the
editor's. Adjust the wording freely, the constraint is only that every
sentence stays checkable against the code.

**caregiver-log**
> **Shared, so it lives on a server.** That is the only way two phones can show
> the same log. Anyone holding the invite link can read every entry, treat it
> like a key to the house. Joining needs no account and there are no ads.

**grocery-list**
> **A shared list has to live somewhere both phones can reach.** So this one is
> stored online, not just on your device. Anyone with the link can see it and
> tick things off. Joining needs no account and there are no ads.

**signup-sheets**
> **A sheet other people sign has to live online.** So this one does. Anyone
> with the share code can see who has signed up for what. Signing up needs no
> account, no email address is collected, and there are no ads.

**team-parent**
> **A team board everyone reads has to live online.** So this one does. Anyone
> with the link can see the schedule and who is bringing what. Joining needs no
> account and there are no ads.

## Where it goes

Same as the other 18: a `.trust` element at the top of the working surface, not
in the footer. In these four the board renders from JS, so it belongs at the
top of the board render rather than in static markup.

## Left for the owner

Anything about **retention**, how long a deleted list survives in Firestore,
whether backups hold it, what happens to an abandoned board. None of that is
readable from the client code, and a guess published as a promise is exactly
the kind of claim the competitor research condemns these apps' rivals for.
