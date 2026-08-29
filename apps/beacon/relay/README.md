# Beacon relay, the optional half

**You almost certainly do not need this.** Beacon works with nothing but a
Discord webhook: she taps a button, it lands in your chat, your phone buzzes.
That is the product, it costs nothing, and nothing of hers is stored anywhere.

This folder adds one thing: **she can see your answers on the tablet.**

## What it costs you

One Cloudflare Worker on the free plan. No credit card, 100,000 requests a day,
and a tablet polling every 20 seconds uses about 4,300 of them. Ten minutes to
set up once.

## The one design decision worth understanding

**The relay does not send the notification and does not hold your webhook.**

The tablet posts to Discord *directly*, and separately posts a copy here for the
thread. So:

- if this Worker is down, misconfigured, or you never deploy it, **"I need you"
  still reaches your phone**
- a wrong token here means replies do not show up, and nothing else

The first version of Beacon relayed everything, which meant one typo in a token
turned the whole app into a button that did nothing while telling a child it had
worked. The ping and the thread fail separately now, on purpose.

## Setting it up

1. **Cloudflare dashboard → Workers & Pages → Create → Worker.** Paste
   `worker.js` over whatever it starts with. Deploy.
2. **Storage & Databases → KV → Create a namespace.** Call it anything. Then in
   the Worker's **Settings → Bindings**, add a KV binding named exactly
   `BEACON` pointing at it.
3. **Settings → Variables and Secrets**, add three:

   | Name | Value |
   |---|---|
   | `DEVICE_TOKENS` | `penny:<24+ random characters>` |
   | `PARENT_TOKENS` | `dad:<another>,mum:<another>` |
   | `ALLOW_ORIGIN` | `https://skywolfstudio.com` |

   Any random string will do. A phrase of four unrelated words is fine. These
   are the whole key, so do not reuse a password you use elsewhere.

4. **Check it is alive.** Open `https://<your-worker>.workers.dev/health` in a
   browser. You should see `{"ok":true,"service":"beacon-relay"}`.

5. **In Beacon's setup screen** (open the app, tap the build tag five times),
   fill in section 4: the Worker URL and `penny`'s token. Save, then Add to
   Home Screen again so the bookmark carries the new settings.

## Replying

Any of these hit `/reply` with a parent token:

```bash
curl -X POST https://<your-worker>.workers.dev/reply \
  -H 'Content-Type: application/json' \
  -d '{"token":"<PARENT_TOKEN>","to":"penny","text":"On my way"}'
```

On a phone that is one **iOS Shortcut** away from being a home-screen button:
Shortcuts → new shortcut → *Get Contents of URL* → method POST, request body
JSON, the three fields above. Add it to your home screen and replying is a tap
and a sentence.

Her tablet picks it up within 20 seconds.

## If a token leaks

Change it in **Settings → Variables** and redeploy. That device stops working
immediately, the thread survives, and no other device is touched. Then re-run
Beacon's setup on the tablet with the new token.

Tokens are looked up by secret rather than by name for exactly this reason: you
can re-point `penny` at a fresh secret without disturbing anything she has
already sent.

## What it stores

One JSON thread per device name in KV, capped at 200 messages. Nothing else. No
webhook, no push credentials, nothing about who read what. Rate limiting is
computed from the timestamps already in the thread rather than from a separate
counter key, which keeps the whole thing inside the free KV write budget: a
counter written on every poll would be roughly 4,300 writes a day against a
1,000 write allowance, and the limiter would start failing open by lunchtime.

## Deleting it

Delete the Worker. Beacon keeps working, one way, exactly as it did before.
Clear the two relay fields in her setup screen so the tablet stops asking.
