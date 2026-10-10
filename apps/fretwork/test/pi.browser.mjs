// Fretwork's Pi rail (pi.js, 10 Oct 2026): the gate. Nothing here touches a real Pi app or the real server: the Pi
// SDK and the three functions are answered in this file. Scenes, each in a fresh browser context:
//   1 web       the page as skywolfstudio.com and the Play app load it: NO request to Pi, no lock, Bass switches,
//               the tip jar, the studio link and the feedback link exactly as before
//   2 outside   ?rail=pi with no Pi Browser: the menus say (8 Pi), Bass and Drop D and a hand retune ask instead
//               of switching, the ask says to open Pi Browser, and every way out is gone
//   3 buy       ?rail=pi inside a stub Pi Browser: sign in, status (not owned), the ask, a REAL tap on Unlock,
//               approve then complete with game "fretwork", owned: Bass switches and the (8 Pi) marks are gone
//   4 owned     the server says owned at sign in: nothing is locked
// node apps/fretwork/test/pi.browser.mjs [--plant webleak]   (webleak turns the rail on for every host: scene 1 MUST fail)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveApps } from '../../../design/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const plant = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : '';
const FN = 'https://us-central1-focus-grove-fffa8.cloudfunctions.net/';
const PI_SRC = readFileSync(join(HERE, '..', 'pi.js'), 'utf8');
function planted(src) {
  if (plant !== 'webleak') return src;
  const a = "return PI_HOSTS.indexOf(String(host || '').toLowerCase()) >= 0 ? 'pi' : 'web';";
  if (!src.includes(a)) throw new Error('plant anchor missing');
  return src.replace(a, "return 'pi';");
}
const PI_STUB = `
  window.__piCalls = [];
  window.Pi = {
    init(o) { window.__piCalls.push(['init', o]); },
    authenticate(scopes, onIncomplete) { window.__piCalls.push(['auth', scopes]);
      return Promise.resolve({ accessToken: 'tok-1', user: { uid: 'pi-u1', username: 'pioneer' } }); },
    createPayment(data, cb) { window.__piCalls.push(['pay', data]);
      setTimeout(() => cb.onReadyForServerApproval('pay-1'), 50);
      setTimeout(() => cb.onReadyForServerCompletion('pay-1', 'tx-1'), 400); },
  };`;

const site = await serveApps();
const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const fails = [];
const check = (scene, ok, what) => { if (!ok) fails.push(`${scene}: ${what}`); };

async function scene(name, { query = '', stub = false, owned = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 900 } });
  const page = await ctx.newPage();
  const seen = { sdk: 0, fn: [], errors: [] };
  let ownedNow = owned.slice();
  page.on('pageerror', (e) => seen.errors.push(String(e).split('\n')[0]));
  await page.route('**/*', (route) => {
    const r = route.request(), u = r.url();
    if (u.startsWith('https://sdk.minepi.com/')) { seen.sdk++; return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }); }
    if (u.startsWith(FN)) {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const fn = u.slice(FN.length);
      let data = {};
      try { data = JSON.parse(r.postData() || '{}').data || {}; } catch (e) { /* no body */ }
      seen.fn.push({ fn, data });
      const result = fn === 'piGameStatus' ? { ok: true, owned: ownedNow }
        : fn === 'piGameApprove' ? { ok: true, paymentId: data.paymentId }
          : fn === 'piGameComplete' ? ((ownedNow = ['full']), { ok: true, paymentId: data.paymentId, owned: ownedNow })
            : null;
      return route.fulfill({ status: result ? 200 : 404, headers: cors, contentType: 'application/json', body: JSON.stringify(result ? { result } : { error: { message: 'no such function' } }) });
    }
    if (/\/fretwork\/pi\.js(\?|$)/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: planted(PI_SRC) });
    return route.continue();
  });
  if (stub) await page.addInitScript(PI_STUB);
  await page.goto(site.url('fretwork') + query, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(stub ? 900 : 400);
  await page.click('#tabDrills');   // the Setup card lives on the Drills tab, a real tap gets there
  await page.waitForTimeout(250);
  return { page, ctx, seen };
}
const opts = (page, sel) => page.$$eval(sel + ' option', (os) => os.map((o) => o.textContent));
// the Setup menus: on screen the way a player gets there, the Drills tab then a scroll
async function pick(page, sel, value) {
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.selectOption(sel, value);
  await page.waitForTimeout(150);
  return page.$eval(sel, (s) => s.value);
}

// ── 1 web ──
{
  const { page, ctx, seen } = await scene('web');
  check('web', seen.sdk === 0, `asked Pi for its SDK (${seen.sdk})`);
  check('web', seen.fn.length === 0, `called the Pi server (${seen.fn.map((f) => f.fn).join(',')})`);
  check('web', (await page.evaluate(() => window.FW_PI && window.FW_PI.rail)) === 'web', 'the rail is not web');
  const insts = await opts(page, '#setInst'), tuns = await opts(page, '#setTuning');
  check('web', !insts.concat(tuns).some((t) => /Pi/.test(t)), 'a menu says Pi: ' + insts.concat(tuns).join(' | '));
  check('web', (await pick(page, '#setInst', 'bass')) === 'bass', 'Bass did not switch');
  check('web', !(await page.$('#piAsk.on')), 'the Pi ask opened');
  check('web', (await page.$eval('#tipBtn', (b) => !b.hidden)), 'the tip jar is hidden');
  check('web', (await page.$eval('#studioLink', (a) => a.getAttribute('href'))) === '../', 'the studio link lost its href');
  check('web', !!(await page.$('#feedbackLink')), 'the feedback link is gone');
  check('web', /A free tool by/.test(await page.textContent('.about .foot')), 'the footer changed');
  check('web', /no account, no ads, nothing leaves your phone/.test(await page.textContent('#homePromise')), 'the home promise changed on the web');
  check('web', seen.errors.length === 0, 'page errors: ' + seen.errors.join(' | '));
  await ctx.close();
}
// ── 2 outside Pi Browser ──
{
  const { page, ctx, seen } = await scene('outside', { query: '?rail=pi' });
  check('outside', seen.sdk === 1, `asked Pi for its SDK ${seen.sdk} times, not once`);
  const insts = await opts(page, '#setInst'), tuns = await opts(page, '#setTuning');
  check('outside', /^Guitar$/.test(insts[0]) && insts.slice(1).every((t) => /\(8 Pi\)$/.test(t)), 'instrument marks wrong: ' + insts.join(' | '));
  check('outside', /^Standard/.test(tuns[0]) && !/Pi/.test(tuns[0]) && tuns.slice(1).every((t) => /\(8 Pi\)$/.test(t)), 'tuning marks wrong: ' + tuns.join(' | '));
  check('outside', (await pick(page, '#setInst', 'bass')) === 'guitar', 'Bass switched without the unlock');
  check('outside', !!(await page.$('#piAsk.on')), 'Bass did not open the ask');
  check('outside', /Open Fretwork in Pi Browser/.test(await page.textContent('#piAsk')), 'the ask does not say to open Pi Browser');
  await page.click('#piLater');
  check('outside', !(await page.$('#piAsk.on')), 'Not now did not close the ask');
  const t0 = (await opts(page, '#setTuning'))[1];
  check('outside', (await pick(page, '#setTuning', await page.$eval('#setTuning', (s) => s.options[1].value))) === 'standard', `${t0} switched without the unlock`);
  check('outside', !!(await page.$('#piAsk.on')), 'a locked tuning did not open the ask');
  await page.click('#piLater');
  const chip = page.locator('#tuneStrip .chip').first(); await chip.scrollIntoViewIfNeeded(); await chip.click();
  check('outside', !!(await page.$('#piAsk.on')) && (await page.$eval('#tunePop', (p) => p.hidden)), 'a hand retune did not ask');
  check('outside', await page.$eval('#tipBtn', (b) => b.hidden), 'the tip jar shows');
  check('outside', (await page.$eval('#studioLink', (a) => a.getAttribute('href'))) === null, 'the studio link still leaves');
  check('outside', !(await page.$('#feedbackLink')), 'the feedback link is still there');
  check('outside', /^By Sky Wolf Studio/.test((await page.textContent('.about .foot')).trim()), 'the footer still says free: ' + (await page.textContent('.about .foot')).trim().slice(0, 40));
  check('outside', !/no account|nothing leaves/.test(await page.textContent('#homePromise')), 'the Pi copy still promises no account');
  check('outside', seen.fn.length === 0, 'called the server with nobody signed in');
  check('outside', seen.errors.length === 0, 'page errors: ' + seen.errors.join(' | '));
  await page.screenshot({ path: '' + (process.env.PI_SHOTS || '/tmp') + '/fretwork-pi-outside.png' }).catch(() => {});
  await ctx.close();
}
// ── 3 buy inside a Pi Browser stub ──
{
  const { page, ctx, seen } = await scene('buy', { query: '?rail=pi', stub: true });
  const calls = await page.evaluate(() => window.__piCalls);
  const auth = calls.find((c) => c[0] === 'auth');
  check('buy', !!auth && auth[1].join(',') === 'username,payments', 'sign in scopes ' + (auth ? auth[1].join(',') : 'none'));
  const st = seen.fn.find((f) => f.fn === 'piGameStatus');
  check('buy', !!st && st.data.game === 'fretwork' && st.data.accessToken === 'tok-1', 'status not asked for fretwork with the token');
  check('buy', (await pick(page, '#setInst', 'ukulele')) === 'guitar', 'Ukulele switched before the unlock');
  check('buy', !!(await page.$('#piAsk.on #piBuy')), 'the ask has no Unlock button after sign in');
  await page.screenshot({ path: '' + (process.env.PI_SHOTS || '/tmp') + '/fretwork-pi-ask.png' }).catch(() => {});
  await page.click('#piBuy');   // a real tap
  await page.waitForTimeout(1200);
  const pay = (await page.evaluate(() => window.__piCalls)).find((c) => c[0] === 'pay');
  check('buy', !!pay && pay[1].amount === 8 && pay[1].metadata.game === 'fretwork' && pay[1].metadata.sku === 'full', 'payment asked wrong: ' + JSON.stringify(pay && pay[1]));
  const fns = seen.fn.map((f) => f.fn).join(',');
  check('buy', /piGameApprove/.test(fns) && /piGameComplete/.test(fns), 'approve then complete not called: ' + fns);
  check('buy', (await page.evaluate(() => window.FW_PI.owned)) === true, 'not owned after the purchase');
  check('buy', !(await page.$('#piAsk.on')), 'the ask is still open');
  check('buy', /yours/.test(await page.textContent('#piToast').catch(() => '')), 'no thank you toast');
  check('buy', !(await opts(page, '#setInst')).some((t) => /Pi/.test(t)), 'the (8 Pi) marks stayed after the unlock');
  check('buy', (await pick(page, '#setInst', 'ukulele')) === 'ukulele', 'Ukulele does not switch after the unlock');
  check('buy', seen.errors.length === 0, 'page errors: ' + seen.errors.join(' | '));
  await ctx.close();
}
// ── 4 owned at sign in ──
{
  const { page, ctx, seen } = await scene('owned', { query: '?rail=pi', stub: true, owned: ['full'] });
  check('owned', (await page.evaluate(() => window.FW_PI.owned)) === true, 'the server said owned and the page did not listen');
  check('owned', !(await opts(page, '#setInst')).some((t) => /Pi/.test(t)), 'an owned copy still marks (8 Pi)');
  check('owned', (await pick(page, '#setInst', 'banjo')) === 'banjo', 'Banjo does not switch on an owned copy');
  check('owned', seen.errors.length === 0, 'page errors: ' + seen.errors.join(' | '));
  await ctx.close();
}
await browser.close(); site.close();
if (fails.length) { console.log('PI_FAIL ' + fails.length + (plant ? ' (plant ' + plant + ')' : '') + '\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PI_PASS web untouched (no Pi request, no lock, exits as before); outside Pi Browser locked with every exit gone; a stub Pi Browser signs in, buys for 8 Pi through approve and complete, unlocks; an owned copy opens unlocked');
