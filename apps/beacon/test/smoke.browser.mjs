/* ═══════════════════════════════════════════════════════════════════════════
   Beacon in a real browser.

   Discord is stubbed with route interception so the outbox can be driven
   through the three answers that matter and told apart: accepted, refused
   forever, and no network. The original version collapsed the last two into
   one error string, which is how a mistyped webhook queued a child's messages
   forever while the page reassured her they were saved and being retried.

     node apps/beacon/test/smoke.browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { withApp } from '../../../design/harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  ok    ${name}`);
};

const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnop';
const OTHER = 'https://discord.com/api/webhooks/999999999999999999/zzzzzzzzzzzzzzzz';

/* One stub for every test below. `mode` is flipped per case. */
async function stub(page, state) {
  await page.route('**/api/webhooks/**', async (route) => {
    state.calls.push(JSON.parse(route.request().postData() || '{}'));
    if (state.mode === 'ok') return route.fulfill({ status: 204, body: '' });
    if (state.mode === 'gone') return route.fulfill({ status: 404, body: '{}' });
    if (state.mode === 'rate') return route.fulfill({ status: 429, body: '{}' });
    return route.abort('failed');                       /* no network at all */
  });
}

const setup = async (page, hook = HOOK) => {
  await page.fill('#s-hook', hook);
  await page.fill('#s-name', 'Penny');
  await page.fill('#s-ping', '4242424242');
  page.once('dialog', (d) => d.accept());
  await page.click('#s-save');
  await page.waitForTimeout(400);
};

console.log('Beacon, in a browser\n');

/* ── first run, setup, and what it refuses ──────────────────────────────── */
await withApp('beacon', async ({ page, errors, overflow }) => {
  await page.waitForTimeout(400);
  const state = { mode: 'ok', calls: [] };
  await stub(page, state);

  check('a first visitor lands on the grown-ups setup, not the button',
    await page.evaluate(() => !document.getElementById('setup').className
      && document.getElementById('main').className === 'hide'));
  check('no horizontal overflow', (await overflow()) === 0);

  /* the pinned host is what stops this becoming a general purpose beacon
     pointed at anybody's server */
  let alerted = '';
  page.once('dialog', (d) => { alerted = d.message(); d.accept(); });
  await page.fill('#s-hook', 'https://evil.example.com/api/webhooks/1/2');
  await page.fill('#s-name', 'Penny');
  await page.click('#s-save');
  await page.waitForTimeout(300);
  check('a non-Discord address is refused', /not a Discord webhook/i.test(alerted), alerted);
  check('and nothing was saved',
    await page.evaluate(() => !localStorage.getItem('beacon.cfg')));

  await setup(page);
  check('a real webhook saves and opens her page',
    await page.evaluate(() => document.getElementById('main').className === ''));
  check('and it greets her by name',
    (await page.textContent('#hello')).indexOf('Penny') !== -1);
  check('the config is written into the hash so a home-screen bookmark keeps it',
    (await page.evaluate(() => location.hash)).indexOf('h=') !== -1,
    'this is the copy that survives an iOS storage sweep');

  check('no page errors', errors.length === 0, errors.join(' | '));
});

/* ── sending, and the three answers ─────────────────────────────────────── */
console.log('\nsending');
await withApp('beacon', async ({ page, errors }) => {
  await page.waitForTimeout(400);
  const state = { mode: 'ok', calls: [] };
  await stub(page, state);
  await setup(page);

  await page.click('#beacon');
  await page.waitForTimeout(600);
  check('the big button sends', state.calls.length === 1);
  check('and she is told it went',
    /on their phone/i.test(await page.textContent('#status')),
    await page.textContent('#status'));
  check('nothing is queued when it worked',
    await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.queue') || '[]').length) === 0);

  /* the payload contract: her name, the ping, and no way to mention anyone else */
  const body = state.calls[0];
  check('the message carries her name', /Penny/.test(body.content), body.content);
  check('and pings the grown-up who set it up', /<@4242424242>/.test(body.content));
  check('allowed_mentions forbids everything by default',
    body.allowed_mentions && Array.isArray(body.allowed_mentions.parse)
      && body.allowed_mentions.parse.length === 0);
  check('and permits only the configured grown-up',
    body.allowed_mentions.users.length === 1
      && body.allowed_mentions.users[0] === '4242424242');

  /* a child typing an @everyone must not be able to ping a whole server */
  await page.fill('#free', 'hello @everyone @here <@111> look at me');
  await page.click('#send-free');
  await page.waitForTimeout(700);
  const evil = state.calls[state.calls.length - 1];
  check('nothing she types can widen who gets mentioned',
    evil.allowed_mentions.parse.length === 0
      && evil.allowed_mentions.users.length === 1
      && evil.allowed_mentions.users[0] === '4242424242',
    JSON.stringify(evil.allowed_mentions));

  check('no page errors', errors.length === 0, errors.join(' | '));
});

/* ── the outbox, which is the bug this rewrite exists to fix ────────────── */
console.log('\nthe outbox');
await withApp('beacon', async ({ page, errors }) => {
  /* This block deliberately aborts requests and returns 404s, so the harness's
     requestfailed and console noise is the fixture working, not a defect. Only
     real page errors are counted at the end. */
  const realErrors = () => errors.filter((e) => e.indexOf('pageerror:') === 0);
  await page.waitForTimeout(400);
  const state = { mode: 'dead', calls: [] };
  await stub(page, state);
  await setup(page);

  /* 1. no network: queue it and say so honestly */
  await page.click('#beacon');
  await page.waitForTimeout(900);
  check('with no internet the message is kept',
    await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.queue') || '[]').length) === 1);
  check('and she is told it is saved, not that it arrived',
    /keep trying/i.test(await page.textContent('#status')),
    await page.textContent('#status'));

  /* 2. the network comes back: the queue drains */
  state.mode = 'ok';
  await page.evaluate(() => { /* the app flushes on a 30s timer; nudge it */ });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  check('when the internet returns the waiting message goes',
    await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.queue') || '[]').length) === 0,
    'the queue never drained');

  /* 3. a webhook that has been deleted: this must NOT queue forever */
  state.mode = 'gone';
  state.calls.length = 0;
  await page.waitForTimeout(1700);          /* clear the anti-spam cooldown */
  await page.click('#beacon');
  await page.waitForTimeout(900);
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.queue') || '[]'));
  check('a deleted or mistyped webhook is NOT queued', q.length === 0,
    `${q.length} item(s) queued, which is the bug: it would retry forever`);
  check('and she is told to fetch a grown-up rather than reassured',
    /grown-up/i.test(await page.textContent('#status')),
    await page.textContent('#status'));

  /* 4. a rate limit IS retryable, and must be told apart from a dead webhook.
     The wait clears the app's 1.5s anti-spam cooldown; without it the click is
     swallowed and this test passes or fails on nothing. */
  state.mode = 'rate';
  await page.waitForTimeout(1700);
  await page.click('#beacon');
  await page.waitForTimeout(900);
  check('but a rate limit is kept and retried',
    await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.queue') || '[]').length) === 1,
    'a 429 means slow down, not give up');

  check('no page errors', realErrors().length === 0, realErrors().join(' | '));
});

/* ── the tapped link that used to re-point her lifeline ─────────────────── */
console.log('\nthe hijack that used to work');
await withApp('beacon', async ({ page, errors }) => {
  await page.waitForTimeout(400);
  const state = { mode: 'ok', calls: [] };
  await stub(page, state);
  await setup(page);
  const url = page.url().split('#')[0];

  /* a link to the same page carrying somebody else's webhook */
  await page.goto(url + '#h=' + encodeURIComponent(OTHER) + '&n=Penny&p=1',
    { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);

  check('a link pointing somewhere else does not silently take over',
    await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.cfg')).hook)
      === HOOK, 'her messages were re-pointed by one tap');
  check('the grown-ups screen opens instead of her button',
    await page.evaluate(() => document.getElementById('setup').className === ''));
  check('and it says plainly what happened',
    /points somewhere different/i.test(await page.textContent('#hijack')),
    await page.textContent('#hijack'));

  /* the legitimate case still has to work: the SAME hash, after storage loss */
  await page.evaluate(() => localStorage.removeItem('beacon.cfg'));
  await page.goto(url + '#h=' + encodeURIComponent(HOOK) + '&n=Penny&p=1',
    { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  check('but the bookmark still restores her after iOS clears storage',
    await page.evaluate(() => document.getElementById('main').className === ''),
    'this is the whole reason the config rides in the hash');

  check('no page errors', errors.length === 0, errors.join(' | '));
});

/* ------------------------------------------------------ replies, optional
   The relay is the only part of Beacon that is allowed to fail quietly, so
   most of this block is about proving that a broken one changes nothing about
   the message reaching a grown-up. */
console.log('\nreplies, when a relay is configured');

const RELAY = 'https://relay.example.com';

const setupWithRelay = async (page) => {
  await page.fill('#s-hook', HOOK);
  await page.fill('#s-name', 'Penny');
  await page.fill('#s-ping', '4242424242');
  await page.fill('#s-relay', RELAY);
  await page.fill('#s-rtok', 'device-token-abc');
  page.once('dialog', (d) => d.accept());
  await page.click('#s-save');
  await page.waitForTimeout(500);
};

await withApp('beacon', async ({ page, errors }) => {
  await page.waitForTimeout(400);
  const state = { mode: 'ok', calls: [] };
  await stub(page, state);

  const relay = { mode: 'ok', calls: [], thread: [] };
  await page.route('**/relay.example.com/**', async (route) => {
    const url = route.request().url();
    const body = JSON.parse(route.request().postData() || '{}');
    relay.calls.push({ url, body });
    if (relay.mode === 'dead') return route.abort('failed');
    if (relay.mode === 'gone') return route.fulfill({ status: 403, body: '{}' });
    if (/\/send$/.test(url)) {
      relay.thread.push({ from: 'child', who: 'Penny', text: body.text, at: Date.now() });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }) });
    }
    if (/\/inbox$/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, messages: relay.thread }) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });

  await setupWithRelay(page);
  await page.click('#beacon');
  await page.waitForTimeout(1200);

  check('the chat still gets the message first',
    state.calls.length === 1, `${state.calls.length} Discord call(s)`);
  check('and a copy is mirrored to the relay',
    relay.calls.some((c) => /\/send$/.test(c.url)));
  check('the relay token rides in the body, not the URL',
    relay.calls.every((c) => c.url.indexOf('token') === -1)
      && relay.calls.some((c) => c.body.token === 'device-token-abc'),
    'a token in a URL lands in the relay host request logs forever');

  /* the half this whole exercise was for */
  relay.thread.push({ from: 'home', who: 'Dad', text: 'On my way', at: Date.now() });
  /* The real 20 second poll, waited out rather than routed around. A reply
     that only lands because the test poked the app would prove nothing about
     the tablet on the kitchen counter. */
  await page.waitForTimeout(22000);
  const shown = await page.evaluate(() => document.getElementById('sent').textContent);
  check('a reply from home appears on her tablet', /On my way/.test(shown), shown.slice(0, 90));
  check('and it is marked as coming from home',
    await page.evaluate(() => !!document.querySelector('#sent .msg.home')));
  check('the panel calls itself a conversation now',
    /you and home/i.test(await page.textContent('#sentlabel')),
    await page.textContent('#sentlabel'));

  check('no page errors', errors.length === 0, errors.join(' | '));
});

/* A broken relay must be invisible to her. This is the failure the whole
   split-path design exists to prevent. */
await withApp('beacon', async ({ page, errors }) => {
  const realErrors = () => errors.filter((e) => e.indexOf('pageerror:') === 0);
  await page.waitForTimeout(400);
  const state = { mode: 'ok', calls: [] };
  await stub(page, state);
  await page.route('**/relay.example.com/**', (route) => route.abort('failed'));

  await setupWithRelay(page);
  await page.click('#beacon');
  await page.waitForTimeout(1500);

  check('with the relay dead the chat still gets it', state.calls.length === 1);
  check('and she is still told it arrived',
    /on their phone/i.test(await page.textContent('#status')),
    await page.textContent('#status'));
  check('a dead relay does not queue her message',
    await page.evaluate(() => JSON.parse(localStorage.getItem('beacon.queue') || '[]').length) === 0,
    'the relay is a nicety and must never make her message look unsent');
  check('and it falls back to showing what she sent',
    /what you sent/i.test(await page.textContent('#sentlabel')),
    await page.textContent('#sentlabel'));

  check('no page errors', realErrors().length === 0, realErrors().join(' | '));
});

/* http is refused: a token on somebody else's wifi in clear text */
await withApp('beacon', async ({ page }) => {
  await page.waitForTimeout(400);
  let alerted = '';
  page.once('dialog', (d) => { alerted = d.message(); d.accept(); });
  await page.fill('#s-hook', HOOK);
  await page.fill('#s-name', 'Penny');
  await page.fill('#s-relay', 'http://relay.example.com');
  await page.fill('#s-rtok', 'abc');
  await page.click('#s-save');
  await page.waitForTimeout(300);
  check('a plain http relay is refused', /https/i.test(alerted), alerted);
  check('and nothing was saved',
    await page.evaluate(() => !localStorage.getItem('beacon.cfg')));
});

console.log(failures ? `\n${failures} check(s) failed` : '\nBEACON BROWSER PASSED');
process.exit(failures ? 1 : 0);
