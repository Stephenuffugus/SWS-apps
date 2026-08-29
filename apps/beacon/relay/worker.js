/* ═══════════════════════════════════════════════════════════════════════════
   BEACON RELAY, an optional Cloudflare Worker.

   Beacon works with no server at all. The tablet posts straight to a Discord
   webhook, which is write only by construction, so nobody who reads the page
   source can read a word the child sent. That is the default and most people
   should never deploy this file.

   What this adds is REPLIES, and replies need somewhere both sides can read.

   ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
   It holds no Discord webhook and it does not send the notification. The
   tablet posts to Discord DIRECTLY and, separately, posts a copy here for the
   thread. That split is the important design decision in this file:

     * if this Worker is down, misconfigured, or never deployed, "I need you"
       still reaches a grown-up's phone
     * this Worker never becomes the single point of failure on the one path
       that actually matters

   The first version of Beacon relayed everything through a Worker, so a typo
   in a token meant a child pressing a button that silently did nothing. The
   ping is the product. The thread is a nicety. They fail independently now.

   ── WHAT IT HOLDS ──────────────────────────────────────────────────────────
   One JSON thread per family in KV, capped. Nothing else. No webhook, no
   push credentials, no analytics.

   ── DEPLOY ─────────────────────────────────────────────────────────────────
   1. Cloudflare dashboard, Workers, Create, paste this file. Free plan,
      100,000 requests/day, no card.
   2. Storage & Databases, KV, create a namespace, bind it as BEACON.
   3. Settings, Variables, set:

        DEVICE_TOKENS  penny:<long-random-string>
        PARENT_TOKENS  dad:<another>,mum:<another>
        ALLOW_ORIGIN   https://skywolfstudio.com

      Generate the random strings with anything, 24 characters or more. A
      device token is not a password to an account, it is the whole key: treat
      a leak as "rotate it", which takes ten seconds and breaks nothing else.
   4. In Beacon's setup screen, paste the Worker URL and the device token.

   ── ROUTES ─────────────────────────────────────────────────────────────────
   POST /send    {token, text}          the tablet, adding to the thread
   POST /inbox   {token, since}         either side, reading it
   POST /reply   {token, to, text}      a grown-up, answering
   GET  /health                         is it alive

   Every route takes its token in the BODY, never the query string. The first
   version polled /inbox?token=..., which writes the token into Cloudflare's
   request logs and any analytics dataset recording the URI, forever.
   ═══════════════════════════════════════════════════════════════════════════ */

const MAX_TEXT = 350;        /* matches the tablet's own cap */
const MAX_THREAD = 200;      /* messages kept per family */
const RATE_PER_HOUR = 40;    /* per device; a tablet left face down cannot flood */

/* ── helpers ─────────────────────────────────────────────────────────────── */

/* Control characters out, length capped. Written as explicit escapes, because
   a literal control character in a source file is invisible in every diff and
   review that will ever look at this line. Kept even though nothing downstream
   parses headers any more: the thread is read back by a browser, and a stray
   newline in JSON has broken more parsers than it has any right to. */
function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, MAX_TEXT)
    .trim();
}

/* "penny:abc,sam:def" -> Map(abc -> penny). Keyed by SECRET, so a lookup is a
   secret-to-name resolution and a name can be re-pointed at a new secret
   without touching the thread it owns. That is what makes revocation cheap:
   rotate one token, the device dies, the history and the other devices live. */
function parseTokens(raw) {
  const out = new Map();
  for (const pair of String(raw || '').split(',')) {
    const i = pair.indexOf(':');
    if (i < 1) continue;
    const name = pair.slice(0, i).trim();
    const secret = pair.slice(i + 1).trim();
    if (name && secret) out.set(secret, name);
  }
  return out;
}

/* Timing-safe enough for this: the token space is 24+ random characters and
   the attacker has no oracle worth the round trips. Map lookup is constant
   work relative to the number of tokens, which is three. */
function whoIs(map, token) {
  const t = String(token || '').trim();
  return t ? (map.get(t) || null) : null;
}

function cors(env) {
  const origin = env.ALLOW_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors(env)),
  });
}

async function readBody(request) {
  try { return await request.json(); } catch (e) { return null; }
}

const key = (family) => 'thread:' + family;

async function loadThread(env, family) {
  try {
    const raw = await env.BEACON.get(key(family));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

/* One read and one write per message, and NO separate counter key. The rate
   limit is derived from the timestamps already in the thread, which keeps this
   inside Cloudflare's free KV write budget: the first version wrote a counter
   on every request, which on a 20 second poll is roughly 4,300 writes a day
   against a 1,000 write free tier, so the limiter would fail open by lunchtime
   and take the thread down with it. */
async function append(env, family, msg) {
  const thread = await loadThread(env, family);
  thread.push(msg);
  const trimmed = thread.slice(-MAX_THREAD);
  await env.BEACON.put(key(family), JSON.stringify(trimmed));
  return trimmed;
}

function overRate(thread, from) {
  const hourAgo = Date.now() - 3600 * 1000;
  let n = 0;
  for (const m of thread) if (m.from === from && m.at > hourAgo) n += 1;
  return n >= RATE_PER_HOUR;
}

/* ── routes ──────────────────────────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    if (path === '/health') {
      return json({ ok: true, service: 'beacon-relay' }, 200, env);
    }
    if (request.method !== 'POST') {
      return json({ error: 'post only' }, 405, env);
    }

    const body = await readBody(request);
    if (!body) return json({ error: 'bad body' }, 400, env);

    const devices = parseTokens(env.DEVICE_TOKENS);
    const parents = parseTokens(env.PARENT_TOKENS);
    const device = whoIs(devices, body.token);
    const parent = whoIs(parents, body.token);

    /* One shape of refusal for every bad token, so the response cannot be used
       to learn whether a token is a real device, a real parent, or nothing. */
    if (!device && !parent) return json({ error: 'not allowed' }, 403, env);

    if (path === '/send') {
      if (!device) return json({ error: 'not allowed' }, 403, env);
      const text = clean(body.text);
      if (!text) return json({ error: 'empty' }, 400, env);
      const thread = await loadThread(env, device);
      if (overRate(thread, 'child')) {
        return json({ error: 'too many', retryAfter: 600 }, 429, env);
      }
      const kept = await append(env, device, {
        from: 'child', who: device, text, at: Date.now(),
      });
      return json({ ok: true, count: kept.length }, 200, env);
    }

    if (path === '/reply') {
      if (!parent) return json({ error: 'not allowed' }, 403, env);
      const to = String(body.to || '').trim();
      if (!devices.size) return json({ error: 'no devices configured' }, 400, env);
      /* the parent names which tablet, and it has to be one that exists */
      const known = new Set(devices.values());
      const target = known.has(to) ? to : (known.size === 1 ? [...known][0] : null);
      if (!target) return json({ error: 'which device' }, 400, env);
      const text = clean(body.text);
      if (!text) return json({ error: 'empty' }, 400, env);
      const thread = await loadThread(env, target);
      if (overRate(thread, 'home')) {
        return json({ error: 'too many', retryAfter: 600 }, 429, env);
      }
      await append(env, target, {
        from: 'home', who: parent, text, at: Date.now(),
      });
      return json({ ok: true }, 200, env);
    }

    if (path === '/inbox') {
      const family = device || (String(body.to || '').trim() || null);
      if (!family) return json({ error: 'which device' }, 400, env);
      if (parent && !device) {
        const known = new Set(devices.values());
        if (!known.has(family)) return json({ error: 'which device' }, 400, env);
      }
      const since = Number(body.since) || 0;
      const thread = await loadThread(env, family);
      const messages = thread.filter((m) => m.at > since);
      return json({ ok: true, messages }, 200, env);
    }

    return json({ error: 'no such route' }, 404, env);
  },
};
