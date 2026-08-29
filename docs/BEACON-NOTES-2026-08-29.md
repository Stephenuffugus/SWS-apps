# Beacon, build notes 2026-08-29

App 34. Live at `skywolfstudio.com/beacon/`, wearing the In testing badge.

One big button on an old tablet that reaches a grown-up. It posts into your own
family Discord channel, so there is no account, no phone number, and nothing for
her to install.

## Where it came from

Stephen built two apps on his phone the same night and handed both over as zips:
Party Line, an encrypted live push-to-talk radio, and Beacon, a page his
daughter could open on an old iPad to reach him. He asked what I thought of
them, and said plainly that he did not know how practical a walkie talkie app
was.

Six agents were sent over both, driving the code rather than reading the docs.

**Party Line is not shipping.** The engineering in it is real, and the crypto
holds up: correct HKDF domain separation with the channel id as salt, a fresh
random 96 bit IV on every seal so no nonce is reused, a knock proof bound to the
Firebase uid so it cannot be replayed by anyone else, and rules that gate every
traffic path on server verified membership rather than on knowing the code. A
stranger holding the full channel code cannot read one byte until the owner taps
ADMIT. The mu-law transport, which sidesteps the whole MediaRecorder
incompatibility mess by encoding one byte per sample by hand, is a genuinely
good idea worth keeping.

None of that matters, because the file contains no service worker, no
Notification API and no Push API at all. The only way anybody learns you are on
the line is by already staring at the tab, which means texting them first, which
means you could have called. A walkie talkie you have to stare at is not a
walkie talkie, it is a voice call both people have to agree to attend, and a
phone call does that better, full duplex, on the lock screen, for free. Firebase
Spark then caps the entire deployment at 100 simultaneous connections and around
262 listener hours a month, and the setup screen asks a stranger to create a
Google Cloud project. Kept as a family intercom. Not a fleet app.

**Beacon is the one he built for a need he actually has**, and that turned out
to be the whole signal. It is also one deletion away from being the right shape.

## What changed from the handoff, and why

The original relayed everything through a Cloudflare Worker so it could carry
replies back. That worked, and it was the right instinct: the reasoning about
why the secrets must not sit in page source is correct, and it is the same
reasoning that keeps this version safe. But it meant every family needed their
own Worker, KV namespace, environment variables and hand issued tokens, which is
not something you can hand to a stranger. The only alternative, one hosted
relay, would have made a man with no money the unpaid operator of a messaging
service for other people's children.

So the Worker is gone and the page posts straight to a Discord webhook.

**A webhook URL is write only by construction.** Somebody who reads it out of
this page can post junk into your channel, which you stop by deleting the
webhook, but they can never read a word she sent. That is a materially different
risk from ntfy, where the topic name IS the password and anyone holding it can
subscribe and read her messages. The original setup doc lists ntfy, Pushover and
Discord side by side as if the choice were only about reliability. It is not.

What that costs is replies, which is the half that needed the Worker and the KV.
One way was the right half to keep: "I need you" arriving on a grown-up's phone
is the entire product.

## The two blocking bugs it arrived with

Both were found by driving the original code, and both are the kind that matter
because a child is the user.

**A rejected message queued forever while telling her it would go through.**
`post()` collapsed every non-2xx into one error string and `send()` treated all
errors identically: queue the text, show "I saved it and I'll keep trying".
`flush()` only shifted an item off the queue on success, so a permanent
rejection never cleared and blocked every message behind it. Replaying the real
code against a 403 gave three taps, twenty four simulated hours of retries,
**2,883 POSTs and zero messages delivered**, with the child reassured three
times. It is reachable on day one by mistyping a token, which is the single most
likely setup mistake there is.

The transport now returns a kind alongside the error: `retry` for anything that
might work later (no network, a timeout, a 429, a 5xx) and `stop` for a
rejection that never will (401, 403, 404). Only retryable failures are queued,
each item counts its own attempts, and an item is dropped after fifteen rather
than blocking everything behind it. A permanent failure says to tell a grown-up.

**Any link she tapped with a different hash silently re-pointed her lifeline.**
`fromHash()` overwrote the config unconditionally, with no origin check and no
scheme check, and the relay's success contract made it worse: the page showed
"Sent! Their phone just buzzed" whenever the response carried a non-zero
delivered field, which an attacker's server simply returns. The one property the
app exists to guarantee was subvertible by one tap, and the interface actively
reassured her while it was broken.

Two changes fix it. The host is pinned, so the only addresses this app will ever
talk to are Discord webhook URLs. And a hash is adopted silently ONLY when there
is nothing stored to contradict it, which is the storage-eviction recovery case
the hash exists for. If it disagrees with what is saved, nothing changes and the
grown-ups' screen opens saying so.

## A third bug, found by the new tests

With the network stubbed out, one press of the button queued the message twice.
A dropped XHR fires both `onreadystatechange` with status 0 AND `onerror`, so an
unguarded callback runs twice. `post()` now fires its callback once.

## The ES5 contract, which is the whole premise

`test/es5.mjs` parses the inline script with acorn at `ecmaVersion: 5` and fails
if anything newer appears. One arrow function is not a lint warning on an iPad 2:
it is a syntax error that stops the entire script, and the page a child taps for
help renders as a dead sheet of text. That failure is invisible on every machine
anyone would develop on, which is exactly why it is pinned rather than trusted
to discipline.

The test also sweeps for runtime APIs that are ES5 syntax but do not exist on
iOS 9 (`fetch`, `Promise`, `Object.assign`, `.includes`, `.find`), and for CSS
the browser cannot draw (`var(--`, grid, `gap`, flex, `@supports`). The API
sweep runs on comment-stripped source, because the header comment in the app
names the very things it forbids and scanning raw text reported the prose
documenting the rule as a breach of it.

**Do not apply the studio base CSS to this app.** It would break the one device
it was written for. `design/hub.mjs` carries that warning beside the entry.

## Where mentions are locked

Discord notifies most servers only on a mention, so without a ping the grown-up's
phone may stay silent. The setup screen takes an optional user ID and every
message is prefixed with it.

`allowed_mentions` is then the load-bearing part: `parse` is empty and the only
id ever permitted is the one typed at setup, so nothing she writes in the free
text box can mention everyone, here, or anybody else. There is a browser test
that sends `hello @everyone @here <@111> look at me` and asserts the permitted
set is unchanged.

## What is verified and what is not

Verified: the ES5 parse, the CSS sweep, and the whole app driven in Chromium
with Discord stubbed through accepted, refused-forever, rate-limited and
no-network. Every test was run against the reverted code first and had to fail
with the reported symptom before it was kept. They all did.

Also verified independently: Discord webhooks really do allow a browser to POST
to them. The preflight returns 200 with `Content-Type` in the allowed headers,
and a bad webhook returns 404, which is exactly the permanent rejection case the
outbox now handles.

**Not verified: it has never been opened on an actual 2012 iPad**, which is the
only claim that really matters. That is why it wears the In testing badge. One
earlier claim, that a 2016 TLS stack would not reach the host at all, was
checked and overturned by running the handshake.

## Still needed from Stephen

- Open it on the real iPad. That is the one test nobody here can run.
- `marketing/stripe-thumbnail.png` at 1254x1254. Until then the hub falls back
  to `icon.svg`, and the icons in this folder are placeholders I drew.
- A Stripe link for `TIP_URL`.
- Confirm the Discord ping actually buzzes his phone rather than only showing a
  dot. The setup screen's test button now says to check exactly that.

## What it could become

The bigger market is probably not kids. It is an elderly parent with one button
and an old tablet, which sits directly beside Sitter Sheet, Pill Schedule and
Caregiver Log. Nothing in the app is child specific except the six quick
messages, and those are one array.
