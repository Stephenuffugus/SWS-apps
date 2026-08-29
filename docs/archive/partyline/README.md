# Party Line, archived not shipped

Assessed 2026-08-29 and deliberately not built out. Stephen asked whether it
was a good app, whether there was a market, and whether it was worth it, and
took the answer.

**Why it is not shipping.** The file contains no service worker, no
Notification API and no Push API at all, so the only way anybody learns you are
on the line is by already staring at the tab. That means texting them first,
which means you could have called. Discord already does push to talk, free, in
the background, on the lock screen, on hardware the family already owns.
Firebase Spark then caps the whole deployment at 100 simultaneous connections
and roughly 262 listener hours a month.

**Why it is kept anyway.** Two pieces are genuinely good and reusable:

- **The mu-law transport.** Audio is encoded one byte per sample by hand, so
  neither browser's MediaRecorder is involved and there is no codec to
  negotiate. Measured 37 dB SNR on voice-band content, about 10.6 KB/s per
  listener after encryption and base64. This is the part to lift if any future
  app needs live audio between two browsers.
- **The crypto.** Adversarially reviewed and it held: HKDF with the channel id
  as salt so a key lifted from one channel is useless on another, a fresh
  random 96 bit IV on every seal, a separate HMAC key for the knock proof bound
  to the Firebase uid so it cannot be replayed, and rules that gate every
  traffic path on server verified membership rather than on knowing the code.

**Known issues if it is ever revived.** Self admission is gated on `meta` not
existing, so any anonymous user can write under a channel id that has no meta,
and deleting a channel turns it into one anyone can join. The channel key is 80
bits while the UI says "AES-256". The invite link path had not been verified.
See `HANDOFF-18.md`, whose TESTED labels are unbacked: the five test files it
cites are not in the handoff.

**What is here.** `partyline.html` is the whole app, v2.2, as handed over. The
Firebase rules arrived as a PDF export, hard wrapped at 43 characters mid
statement, and are not recoverable as JSON; they would need re-exporting from
Stephen's phone.

Art for it is at `docs/art/partyline.png`.
