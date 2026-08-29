# HANDOFF — Party Line & Beacon

Two related apps, one repo. Written for whoever picks this up next in a code
space. Read this before touching anything; several decisions look arbitrary and
are not.

**Nothing here has been run on a real device.** Everything below marked TESTED
was verified in Node against extracted logic. Everything marked ASSUMED is
reasoning about browser behaviour that has never executed. Do not trust the
second category.

---

## 1. What these are

**Party Line** — encrypted live push-to-talk over the web. Hold a bar, talk,
everyone on the line hears you ~600ms later. Single HTML file, no build step,
Firebase Realtime Database as the only backend.

**Beacon** — a kid's page that pings the parents' phones. Deliberately shares
*no code* with Party Line, because it has to run on a 2012 iPad and Party Line
cannot. A Cloudflare Worker relays to ntfy / Pushover / Discord.

---

## 2. Repo layout

```
partyline/
  partyline.html          the whole app, single file, ES modules
  database.rules.json     RTDB security rules — deploy these or nothing works
  PARTYLINE-SETUP.md      deployment + design rationale
beacon/
  beacon.html             kid page, deliberate ES5, runs on iOS 9
  worker.js               Cloudflare Worker relay
  BEACON-SETUP.md         deployment
tests/
  dsptest.mjs  rstest.mjs  e2e.mjs      codec + transport (all passing)
  wtest.mjs                            Worker auth/rate-limit (22 passing)
  hashtest.mjs                         Beacon credential parsing (12 passing)
```

Run `node tests/*.mjs`. They need no dependencies.

---

## 3. History, including a gap you should know about

- **v1** (single-file, store-and-forward): recorded a whole clip with
  MediaRecorder, encrypted it, sent on release.
- **v2** (current): rewritten to stream live. **This rewrite happened in a
  session that is not in my context.** I found it on disk by timestamp and
  verified it independently — it parses, and every database path it touches is
  defined in its rules. It is the baseline. But I did not write it and cannot
  explain intent behind anything not visible in the code.
- **Rename**: Squelch → Party Line. Cosmetic *except* for the crypto strings;
  see §5.

There is also an abandoned parallel branch (`app2.js` in history) that
store-and-forwards to a `tx/` node. **Do not merge it.** It targets database
paths the rules do not define; every transmission would be denied. Its four
good ideas are listed in §8 as work to redo against the streaming design.

---

## 4. Architecture

```
mic → 8kHz µ-law → 400ms chunks → AES-GCM → base64 → RTDB stream/$tx/c/$seq
                                                            ↓
                              listeners decrypt each chunk and play in order
```

Database shape:

```
ch/{id}/meta            owner, created, version
ch/{id}/members/{uid}   encrypted nickname — gates all reads
ch/{id}/knocks/{uid}    join requests + HMAC proof
ch/{id}/live/{uid}      presence, via onDisconnect
ch/{id}/stream/{tx}     c/{seq} chunks, done flag, heard/{uid} receipts
ch/{id}/msg/{id}        text messages
```

**Why µ-law and not Opus/MediaRecorder** (TESTED): Safari only gained WebM
recording in 18.4; Chrome only gained MP4 recording around M123. There is no
container both reliably *record* and *play* across the install base. Encoding
one byte per sample ourselves removes codec negotiation entirely — neither
browser's recorder is involved. Measured 37.2 dB SNR on voice-band content,
10.6 KB/s per listener after encryption and base64, ~275 listener-hours/month
on the free tier.

---

## 5. The crypto, and the one way to break it silently

A channel code is two halves:

```
5PJBXXH2 · HFWN-G4WP-1V3B-554J
└ id ──┘   └───── key ───────┘
 public     never sent anywhere
```

The id is the database path. The key is HKDF-derived into an AES-256-GCM key
and an HMAC key, and never leaves the device. Crockford base32, so no I/L/O/U
and codes survive being read aloud.

**The id is the HKDF salt**, so a key lifted from one channel is useless on
another. TESTED.

⚠️ **Three strings must always move together:**

```js
salt = encode('partyline|' + id)
bits('partyline/v1/traffic')
bits('partyline/v1/knock')
```

Change one and clients derive mismatched keys: they will connect, presence will
work, the roster will populate, and *nothing will decrypt*. It looks like a
network bug and is not. This bit me during the rename; there is a test for it.

Membership is a second, independent lock: anonymous auth → knock → owner admits
by hand → rules permit reads. The knock carries `HMAC(knock-key, uid)`, which
the server cannot verify but the owner's device can, so the admit screen shows
*holds the key* vs *cannot prove they have the key*.

Threat model is "keep strangers off my line," not "protect against a
participant." Anyone admitted can record what they hear.

---

## 6. iOS constraints that drove the design

These are not preferences. Each one closed off an approach.

| Constraint | Consequence |
|---|---|
| No silent push, no background wake | Cannot receive audio backgrounded. Foreground-only, Wake Lock while transmitting. Not fixable on the web. |
| iOS 26 PWA audio bug: installed PWAs play audio once, then need Safari data cleared | ASSUMED mitigated by one reused `<audio>` element. **Verify first.** |
| 7-day storage eviction (localStorage, IndexedDB, SW) | Home-screen apps exempt with their own counter. See §7. |
| ~50MB storage cap, evicted under pressure | History must be prunable and non-essential. |
| Web push needs 16.4+ *and* home-screen install | Beacon polls instead. |

iPad ceilings, because "old tablet" spans a decade:
iPad 2/3/mini 1 → iOS 9.3.5 · iPad 4 → 10.3.4 · Air 1/mini 2/3 → 12.5.7 ·
Air 2/mini 4 → 15.8 · iPad 5 → 16.7.

Beacon is written in deliberate ES5 — no arrow functions, no `let`, no template
literals, no `fetch`, no Promises, no CSS variables, no grid, no flex `gap`. It
is uglier than it needs to be on purpose. There is a lint check for this; keep
it passing or it stops booting on the old hardware it exists to serve.

---

## 7. Storage eviction — the subtle one

WebKit deletes script-writable storage after 7 days without interaction.
Home-screen apps are exempt and get their own use counter.

**Beacon** stored its device token in localStorage, so a tablet used
occasionally would silently sign itself out. Fixed: credentials now ride in the
URL hash (`#u=…&t=…&n=…`). A home-screen bookmark is not script-writable
storage and cannot be evicted, so localStorage became a cache rather than the
only copy. TESTED (12 cases).

**Party Line has the same exposure and it is worse.** The channel key exists
only on device — there is no server copy, by design. If storage is evicted, the
line is unrecoverable. Partially mitigated with `navigator.storage.persist()`,
which is undocumented against ITP and *not a guarantee*.

Note the tension: the app calls `history.replaceState` to strip the key from
the URL after joining, which is good for screenshots and bad for durability.
**Unresolved.** Options: keep the invite link as the user-facing backup, prompt
Add to Home Screen before first use, or add an explicit export. Pick one before
anyone relies on this.

---

## 8. Work not done

Four features exist only in the abandoned branch and should be rebuilt against
the streaming design, not ported:

1. **Offline outbox** — highest value. Reviewers hit Zello hardest on exactly
   this: if the network drops, it simply stops. Beacon already has a working
   pattern to copy.
2. **On-device transcription** — Web Speech API at record time, encrypted with
   the audio so the text is protected too. Voxer paywalls this at $7.99/mo.
   Runs concurrently with mic capture; may conflict on iOS. Feature-detect and
   degrade.
3. **History past the server's 15-minute sweep** — IndexedDB, pruned.
4. **Background notifications + haptics** — only fires while the tab is open in
   the background, which is a real limit, not a bug.

Also open: a parent reply page for Beacon so nobody touches curl; photo
messages via R2; a "read it" receipt distinct from "delivered."

---

## 9. First session checklist

1. Deploy `database.rules.json` **before** the app. Nothing works without it,
   and the failure looks like a network problem.
2. Enable Anonymous auth; add the hosting domain to Authorized Domains.
3. Two phones, same wifi, before attempting iPhone↔Android. The codec choice
   exists to make cross-platform work, but that is an untested claim.
4. Then specifically: iPhone↔Android, a backgrounded tab, an installed PWA
   playing audio twice in a row (the iOS 26 bug), and a tablet left untouched
   for eight days.
5. Free tier caps 100 simultaneous connections. Family and crew, not product.

---

## 10. Sources worth keeping

- WebKit ITP / 7-day cap: https://webkit.org/tracking-prevention/
- MediaRecorder support matrix and the Safari 18.4 change
- Cloudflare Workers free tier: 100k req/day, KV included, no card
- ntfy: topic name *is* the password — never expose it client-side
- RTDB limits: 10MB per string, 100 simultaneous connections on Spark
