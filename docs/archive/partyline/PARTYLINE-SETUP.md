# Party Line — setup

Encrypted live push-to-talk. One HTML file, no build step, Firebase RTDB as the
only backend. People hear you *while* you're talking, not after you let go.

## Stand it up

1. **New Firebase project.** Enable **Realtime Database** and, under Authentication →
   Sign-in method, enable **Anonymous**. Nothing else.
2. **Publish the rules** from `database.rules.json`.
3. **Deploy `partyline.html`** anywhere HTTPS. Microphone access requires it — this
   will not work over `file://`.
4. Add your hosting domain to Authentication → Settings → Authorized domains,
   or anonymous sign-in gets rejected.

First run asks for your Firebase web config. Set `BAKED_CONFIG` at the top of the
script to skip that for other people.

## What changed from v1, and why

**Voice streams now.** v1 recorded a whole clip with MediaRecorder and sent it on
release. v2 sends ~320ms packets while you're still holding the button. Latency
went from "length of your sentence" to about 600ms. This is the thing Voxer built
its whole product on and it's what makes a walkie-talkie feel like a walkie-talkie
instead of a voicemail exchange.

**We dropped MediaRecorder entirely.** Audio is G.711 µ-law — one byte per sample,
no container. We encode and decode it ourselves into raw AudioBuffers, so there is
no codec negotiation and every browser behaves identically. Measured 37 dB SNR on
voice-band content, which is clean. This also killed the entire MP4-vs-Opus problem
from v1: Safari's recorder and Chrome's recorder no longer have to agree on anything,
because neither one is involved.

Costs 8 KB/s (16 KB/s in Clear Voice mode). Measured end to end at **10.6 KB/s per
listener** after encryption and base64 — about 275 listener-hours per month on the
free tier.

## Features, and which complaint each one answers

| Feature | The complaint it fixes |
|---|---|
| Live streaming voice | "It's a voicemail app, not a radio" |
| Hardware/Bluetooth button (media keys) | Zello reviews, repeatedly: reaching for the screen with gloves on, or while driving |
| VOX hands-free | Same — opens on your voice, closes after 850ms of silence |
| Latch mode | Holding a button for a two-minute message is miserable |
| 15 min of catch-up history | "I missed it and it's gone" |
| Replay + 1×/1.5×/2× speed | Voxer and Marco Polo both have it; people use it constantly |
| Heard-by receipts | "I don't know if anyone actually got that" |
| Mute with missed-count | Zello reviews: "can't just mute a channel and have it run" |
| Text messages | For when you can't talk but need to say something |
| Priority alert | Tone + haptic that ignores your volume setting |
| Real waveform per message | See which one was the long explanation before you replay it |
| One-tap admit with key verification | Zello reviews: "approving someone can take five minutes because it's not obvious how" |
| Roger beep | Knowing the transmission actually ended |

## How a channel works

```
P3XD9VG9 · RENM-ESJE-V2PP-YXZB
└ id ───┘  └──── key ─────────┘
  public     never sent anywhere
```

**id** (40 bits) is the database path. **key** (80 bits) is HKDF-derived into an
AES-256-GCM key and an HMAC key, and stays on the device. Everything written to
the database — audio packets, call signs, text — is ciphertext. The id is the HKDF
salt, so a key lifted from one channel is useless on another.

Crockford base32 throughout: no I, L, O or U, so codes read aloud over the phone
without anyone asking "letter O or zero."

### Two independent locks

1. **Membership.** Anonymous auth gives every device a stable UID. A newcomer with
   a valid code lands in `knocks`; the owner taps ADMIT. Rules only let members read
   or write traffic.
2. **Encryption.** AES-GCM on top, so database access alone — yours, Google's, a
   leaked config — yields noise.

The knock carries `HMAC(knock-key, uid)`. The server can't check it; the owner's
device can. So the admit screen distinguishes *holds the channel key* from *cannot
prove they have the key*. Someone who scraped an id out of a URL shows up as the
second kind.

Threat model is "keep strangers off my channel," not "protect against a participant."
Anyone you admit can obviously keep a copy of what they hear.

## Things that will bite you if you forget them

**Packets are reassembled by sequence number, not arrival order.** RTDB usually
delivers in order and this looks like it works either way — until a retry scrambles
someone's sentence. `parts` is a Map keyed by seq; `drain()` holds early arrivals
until the gap ahead of them fills. There's an e2e test for this; keep it that way.

**Metadata must be written before the first packet.** The rules reject a chunk whose
parent node has no `u`, so a chunk that lands first is denied. Capture starts
immediately and buffers locally while the metadata write is in flight — that's why
the first syllable isn't clipped.

**`done` can outrun the last packet.** Receivers wait for `nc` (the chunk count) and
only build the replay buffer once they hold that many. A sender who drops mid-sentence
never writes `nc`, so there's a 4-second salvage path.

**`n` is the encrypted call sign, `nc` is the chunk count.** They live in the same
node. Don't reuse `n`.

**`CFG.SPLIT` and the 32000-char cap in the rules are a pair.** A throttled background
tab hands you a backlog; oversized flushes get split rather than dropped.

## The iOS limitation, stated plainly

**You cannot receive audio while the app is backgrounded on iPhone.** Not a bug to
fix later. Apple has no silent push and no background wake — a push notification
cannot execute code in the background the way it does natively. iOS 26 additionally
has an open bug where installed PWAs play audio once and then go quiet until Safari's
data is cleared.

So the app is built around being open: Wake Lock holds the screen during transmit,
and returning to the tab resumes the audio context and catches up on history. The
pattern is "we're both on channel right now," like a handheld you switch on.

Worth noting this is also the single most common complaint about Zello, which *is*
native — "it goes into background mode and you only get a visual notification, so if
it's on your belt you'll miss calls." The web version of this problem is harder, but
it isn't a solved problem for anyone.

If pocket-listening turns out to be the point, that's where this needs a Capacitor
shell. Nothing on the web platform closes that gap.

## Other limits

- Spark (free) plan caps **100 simultaneous connections**.
- 2 minutes per transmission; 15 minutes of history.
- Traffic is deleted by the sender's client. If they close the tab immediately, their
  packets linger until the TTL. A scheduled Cloud Function would make it deterministic.
- VOX keeps the mic open continuously, which costs battery. It's off by default.

## Controls

- **Hold the bar** to talk. **PTT / VOX / LATCH** switches how it opens.
- **Spacebar** at a desk. **Headset play/pause button** anywhere.
- **↻** replays; the **1×** button cycles 1× → 1.5× → 2×.
- The transmit bar is the level meter — the fill is your live mic input, so you can
  see you're being picked up before you let go.
