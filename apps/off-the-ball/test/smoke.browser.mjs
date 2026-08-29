#!/usr/bin/env node
/**
 * Off the Ball, browser smoke.
 *
 *   node apps/off-the-ball/test/smoke.browser.mjs
 *
 * engine-test.mjs proves the simulation. This proves the part a person
 * touches: the board renders, a play runs and produces a verdict and a
 * ledger, the playbook saves, exports, imports and refuses rubbish, and a
 * share link survives a round trip into a fresh tab.
 *
 * The two files are deliberately separate. The engine harness must never
 * touch the DOM, see HANDOFF.md section 2.
 */
import { withApp } from '../../../design/harness.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  ok    ${name}`);
};
const FILE = join(tmpdir(), 'otb-playbook-test.json');

/* The development curtain stands in front of everything, so every page in a
   run has to step past it first. Storage is per origin and shared across the
   pages in one context, so unlocking once covers the tabs opened later. The
   gate's own behaviour is tested on its own fresh context at the bottom. */
const DEV_PASS = 'wolfden';
const ungate = async (p) => {
  await p.evaluate((v) => localStorage.setItem('otb.dev.unlocked', v), DEV_PASS);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
};

await withApp('off-the-ball', async ({ page, errors, overflow }) => {
  await ungate(page);
  await page.waitForTimeout(900);

  /* ---- the board is actually there ---- */
  check('the pitch canvas renders', await page.evaluate(() =>
    !!document.getElementById('pitch') && document.getElementById('pitch').width > 0));
  check('no horizontal overflow', (await overflow()) === 0);

  /* ---- a play runs and says something diagnostic ---- */
  await page.click('#play');
  await page.waitForTimeout(4200);
  const verdict = (await page.textContent('#verdict')).trim();
  check('running the play produces a verdict', verdict.length > 8, verdict);
  /* the whole product is diagnostic, never a score. If a win state ever
     appears this is where it gets caught. */
  check('the verdict is not a score', !/\b(win|lose|won|lost|score:|points?)\b/i.test(verdict), verdict);
  const ledger = await page.evaluate(() => document.getElementById('ledger').textContent.trim());
  check('the ledger reports what the defenders did', ledger.length > 20);

  /* ---- the playbook, which is how a team keeps anything ---- */
  await page.evaluate(() => localStorage.removeItem('otb.playbook'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  for (const [name, preset] of [['Wall', 'giveandgo'], ['Penny', 'decoy']]) {
    await page.selectOption('#preset', preset);
    await page.waitForTimeout(350);
    await page.fill('#callname', name);
    await page.click('#saveplay');
    await page.waitForTimeout(250);
  }
  const saved = await page.evaluate(() =>
    [...document.getElementById('playbook').options].map(o => o.text));
  check('two plays save to the playbook', saved.includes('Wall') && saved.includes('Penny'), saved.join(','));

  /* export, wipe, import: the round trip a squad relies on */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportbook')]);
  await dl.saveAs(FILE);
  const doc = JSON.parse(readFileSync(FILE, 'utf8'));
  check('the export is a self describing playbook file',
    doc.app === 'off-the-ball' && doc.kind === 'playbook' && doc.v >= 1 && doc.plays.length === 2,
    JSON.stringify({ app: doc.app, v: doc.v, n: doc.plays && doc.plays.length }));

  await page.evaluate(() => localStorage.removeItem('otb.playbook'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.setInputFiles('#bookfile', FILE);
  await page.waitForTimeout(600);
  check('importing puts them back', /2 added/.test(await page.textContent('#toast')),
    await page.textContent('#toast'));

  await page.setInputFiles('#bookfile', FILE);
  await page.waitForTimeout(600);
  check('importing twice replaces rather than duplicating',
    /2 replaced/.test(await page.textContent('#toast')), await page.textContent('#toast'));

  writeFileSync(FILE + '.bad', 'not json at all');
  await page.setInputFiles('#bookfile', FILE + '.bad');
  await page.waitForTimeout(500);
  check('rubbish is refused, not swallowed',
    /not a playbook/i.test(await page.textContent('#toast')), await page.textContent('#toast'));

  writeFileSync(FILE + '.mix', JSON.stringify({ app: 'off-the-ball', kind: 'playbook', v: 1,
    plays: [{ n: 'Broken', d: 'not-decodable' }, { n: 'Fresh', d: doc.plays[0].d }] }));
  await page.setInputFiles('#bookfile', FILE + '.mix');
  await page.waitForTimeout(600);
  check('a play that will not open is counted, not dropped in silence',
    /could not be read/i.test(await page.textContent('#toast')), await page.textContent('#toast'));

  /* ---- the share link, which is the whole no-account sharing story ---- */
  await page.fill('#callname', 'Round Trip');
  await page.waitForTimeout(200);
  await page.click('#copylink');
  await page.waitForTimeout(300);
  const url = await page.evaluate(() => location.origin + location.pathname + location.hash);
  check('sharing writes a play into the URL', /#p=/.test(url));
  const fresh = await page.context().newPage();
  await fresh.goto(url, { waitUntil: 'load' });
  await fresh.waitForTimeout(900);
  check('a shared link opens the same call in a fresh tab',
    (await fresh.evaluate(() => document.getElementById('callname').value)) === 'Round Trip');
  await fresh.close();

  /* ---- formats ----
     The pitch is not one size. Offside is genuinely off at 5 and 7 a side,
     per The FA's own Rule 34, so the board must stop drawing a line it does
     not play, and every format must still run a play without throwing. */
  for (const f of ['5v5', '7v7', '9v9', '11v11']) {
    await page.click(`#fmtseg button[data-fmt="${f}"]`);
    await page.waitForTimeout(650);
    const on = await page.evaluate((k) =>
      document.querySelector(`#fmtseg button[data-fmt="${k}"]`).getAttribute('aria-pressed'), f);
    check(`${f} selects`, on === 'true');
    const cite = await page.textContent('#fmtnote');
    check(`${f} says where its numbers came from`, /FA|Laws of the Game/.test(cite), cite.slice(0, 40));
    await page.click('#play');
    await page.waitForTimeout(4200);
    check(`${f} runs a play`, (await page.textContent('#verdict')).trim().length > 8);
  }
  /* choosing a preset is choosing an 11 a side play, and it says so */
  await page.click('#fmtseg button[data-fmt="5v5"]');
  await page.waitForTimeout(500);
  await page.selectOption('#preset', 'decoy');
  await page.waitForTimeout(600);
  check('picking a preset returns the board to 11 a side',
    (await page.evaluate(() =>
      document.querySelector('#fmtseg button[data-fmt="11v11"]').getAttribute('aria-pressed'))) === 'true');

  /* ---- the squad ----
     Fixed rosters are a category wide complaint, HANDOFF section 10. Adding
     and removing has to clean up after itself or the play breaks quietly:
     the ball cannot leave with a removed attacker, a pass cannot point at
     somebody who is gone, and a defender cannot go on marking a ghost. */
  await page.goto(await page.evaluate(() => location.origin + location.pathname), { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const squad = () => page.evaluate(() => document.getElementById('squadnote').textContent);
  check('the board says who is on it', /4 attackers against 4 defenders/.test(await squad()), await squad());
  await page.click('#addatt'); await page.waitForTimeout(350);
  await page.click('#adddef'); await page.waitForTimeout(350);
  check('players can be added', /5 attackers against 5 defenders/.test(await squad()), await squad());
  await page.fill('#dname', 'Big Lad');
  await page.dispatchEvent('#dname', 'change');
  await page.waitForTimeout(350);
  check('a defender can be renamed',
    /Big Lad/.test(await page.evaluate(() => document.getElementById('pcardHost').textContent)));
  await page.click('#rmdef'); await page.waitForTimeout(350);
  check('players can be removed', /5 attackers against 4 defenders/.test(await squad()), await squad());

  /* Removing the ball carrier must hand the ball on rather than lose it, so
     the check is that the play still produces a real verdict afterwards
     rather than falling to "nothing happens". */
  await page.click('#play');
  await page.waitForTimeout(4200);
  check('the play still runs on a changed roster',
    (await page.textContent('#verdict')).trim().length > 8, await page.textContent('#verdict'));

  /* ---- a shared link is a link from a stranger ----
     On 2026-08-28 a crafted #p= link ran script in the reader's page: the
     scouting card put the defender's NAME into innerHTML, so an img onerror
     in that name fired the moment you tapped him. Sharing is the whole
     product, so this is the check that keeps the pipe safe while it widens.
     The payload is inert and only sets a flag. */
  const enc = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = '<img src=x onerror="window.__pwned=1">';
  const hostile = enc({ k: 'giveandgo', n: payload, s: 'rec',
    a: [['a10', payload, 46, 26, [], payload, 1, []], ['a9', '9', 36, 37, ['check'], '', 0, []]],
    d: [['d2', payload, 46, 33, 'man', 'a10', null]], p: [] });
  const eve = await page.context().newPage();
  await eve.goto((await page.evaluate(() => location.origin + location.pathname)) + '#p=' + hostile,
    { waitUntil: 'load' });
  await eve.waitForTimeout(1100);
  /* The welcome overlay covers the board on a first open, and a shared link is
     exactly a first open. Dismiss it, or the tap below lands on the overlay and
     this whole section passes for the wrong reason: a click that never reached
     the canvas also fails to pwn anything. */
  await eve.evaluate(() => {
    const w = document.querySelector('.welcome');
    if (w) w.querySelector('#wskip').click();
  });
  check('the welcome greets a shared link and then gets out of the way',
    await eve.evaluate(() => !document.querySelector('.welcome')));
  /* tap the defender, which is the sink that fired */
  const pt = await eve.evaluate(() => {
    const cv = document.getElementById('pitch'), r = cv.getBoundingClientRect();
    return { x: r.left + r.width * (46 / 68), y: r.top + r.height * (1 - (33 + 10) / 62.5) };
  });
  await eve.mouse.click(pt.x, pt.y);
  await eve.waitForTimeout(600);
  /* and prove the tap actually landed, so this section can never go vacuous
     again the way it just did */
  check('the defender tap reaches the canvas',
    await eve.evaluate(() => {
      const sh = document.getElementById('sheet');
      return !!sh && !sh.hasAttribute('hidden');
    }), 'the scouting sheet never opened, so the sink was never reached');
  await eve.click('#play');
  await eve.waitForTimeout(4200);
  const evil = await eve.evaluate(() => ({
    pwned: !!window.__pwned,
    injected: !!document.querySelector('img[src="x"]'),
    nameIsText: document.getElementById('callname').value.indexOf('<img') === 0,
  }));
  check('a hostile share link runs no script', !evil.pwned);
  check('a hostile share link injects no element', !evil.injected);
  check('a hostile name survives as inert text', evil.nameIsText,
    'the name should still be readable, just not executable');
  await eve.close();

  /* and an ordinary link must still open, which a careless escape fix broke
     once by using a helper one line before declaring it */
  const good = enc({ k: 'giveandgo', n: 'Plain Link', s: 'rec',
    a: [['a10', '10', 46, 26, [], '', 1, []], ['a9', '9', 36, 37, ['check'], '', 0, []]],
    d: [['d2', '2', 46, 33, 'man', 'a10', null]], p: [] });
  const plain = await page.context().newPage();
  await plain.goto((await page.evaluate(() => location.origin + location.pathname)) + '#p=' + good,
    { waitUntil: 'load' });
  await plain.waitForTimeout(900);
  check('an ordinary shared link still opens',
    (await plain.evaluate(() => document.getElementById('callname').value)) === 'Plain Link');
  await plain.close();

  /* ------------------------------------------------- reading the run
     The engine test proves the mechanism in isolation. This proves a real
     user sees it: run the preset the reactivity increment was built for and
     look for the divert in the ledger a coach actually reads. */
  await page.selectOption('#preset', 'overlap');
  await page.selectOption('#skill', 'rec');
  await page.click('#play');
  await page.waitForTimeout(4200);
  const read = await page.evaluate(() => {
    const v = document.getElementById('verdict').getBoundingClientRect();
    const c = document.getElementById('callchip').getBoundingClientRect();
    const b = document.querySelector('.board').getBoundingClientRect();
    const overlap = (p, q) => p.left < q.right && q.left < p.right
                           && p.top < q.bottom && q.top < p.bottom;
    return {
      ledger: [...document.querySelectorAll('#ledger .ev')].map((n) => n.textContent),
      verdict: document.getElementById('verdict').textContent,
      judged: document.querySelector('.board').classList.contains('judged'),
      clear: !overlap(v, c),
      /* the goal mouth is the top eighth of the board */
      goalClear: v.top > b.top + b.height / 8,
    };
  });
  check('a runner reading the space is reported to the coach',
    read.ledger.some((l) => /checks back|stops his run|runs into it anyway/.test(l)),
    'no divert reached the ledger');
  check('the overlap now finds the pass', /SPACE CREATED/.test(read.verdict),
    `verdict was ${read.verdict}`);
  check('the call sign and the verdict never overlap', read.clear,
    'the verdict banner is sitting on top of the play call');
  check('the verdict does not cover the goal mouth', read.goalClear,
    'the banner is over the goal line, which is where the open goal is drawn');
  await page.click('#reset');
  await page.waitForTimeout(300);
  check('resetting clears the judged state',
    !(await page.evaluate(() => document.querySelector('.board').classList.contains('judged'))));

  /* ------------------------------------------------------- the keeper
     He is drawn, he is not a control, and the verdict talks about him. */
  await page.selectOption('#preset', 'giveandgo');
  await page.selectOption('#skill', 'rec');
  await page.click('#play');
  await page.waitForTimeout(4200);
  const gk = await page.evaluate(() => ({
    verdict: document.getElementById('verdict').textContent,
    ledger: [...document.querySelectorAll('#ledger .ev')].map((n) => n.textContent).join(' '),
  }));
  check('the verdict is a shot, not a proximity guess',
    /open goal|of goal showing|down to .*of goal/.test(gk.verdict), gk.verdict);
  check('the ledger says where the keeper was',
    /keeper .* off his line/.test(gk.ledger), 'no keeper line reached the ledger');
  check('the keeper is not a scoutable control',
    await page.evaluate(() => {
      const sel = document.getElementById('dsel');
      const txt = sel ? sel.textContent : '';
      return !/goalkeeper|\bGK\b/i.test(txt);
    }), 'the keeper turned up in the defender picker, which makes him tunable');

  /* ------------------------------------------------------ the welcome
     HANDOFF issue 6. Storage is shared across pages in this context and the
     hostile-link page above already dismissed it, so this opens a page with
     the flag cleared rather than trusting the order tests happen to run in. */
  const base = await page.evaluate(() => location.origin + location.pathname);
  const w1 = await page.context().newPage();
  await w1.goto(base, { waitUntil: 'load' });
  await w1.evaluate(() => localStorage.removeItem('otb-seen'));
  await w1.reload({ waitUntil: 'load' });
  await w1.waitForTimeout(700);
  const wel = await w1.evaluate(() => {
    const w = document.querySelector('.welcome');
    if (!w) return null;
    const box = w.getBoundingClientRect();
    const go = w.querySelector('#wgo').getBoundingClientRect();
    const skip = w.querySelector('#wskip').getBoundingClientRect();
    return { head: w.querySelector('h2').textContent,
             inside: go.bottom <= box.bottom + 1 && skip.bottom <= box.bottom + 1,
             tall: go.height >= 30 && skip.height >= 30 };
  });
  check('a first time visitor is told what the board is', !!wel);
  check('and it is the general greeting, not the shared one',
    wel && wel.head === 'A chalkboard that runs.', wel && wel.head);
  check('both welcome buttons are inside the panel and tappable',
    wel && wel.inside && wel.tall,
    'a button below the fold is an overlay a phone user cannot dismiss');
  await w1.click('#wgo');
  await w1.waitForTimeout(4200);
  check('Show me dismisses the welcome and runs the play',
    await w1.evaluate(() => !document.querySelector('.welcome')
      && /:/.test(document.getElementById('verdict').textContent)));
  await w1.reload({ waitUntil: 'load' });
  await w1.waitForTimeout(600);
  check('and it stays gone on the next visit',
    await w1.evaluate(() => !document.querySelector('.welcome')));
  await w1.close();

  const real = errors.filter((e) => !/favicon/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));
});

/* ------------------------------------------------ the welcome, small phone
   A separate run because the viewport is the thing under test. On a 320 by
   568 handset the first build put both buttons below the fold, which is an
   overlay a first time visitor on an old iPhone cannot dismiss. It scrolls
   now and the buttons are sticky, so this pins both. */
console.log('\nthe welcome on the smallest phone');
await withApp('off-the-ball', async ({ page }) => {
  await ungate(page);
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const w = document.querySelector('.welcome');
    if (!w) return null;
    const box = w.getBoundingClientRect();
    const go = w.querySelector('#wgo').getBoundingClientRect();
    const skip = w.querySelector('#wskip').getBoundingClientRect();
    return { reachable: go.bottom <= box.bottom + 1 && skip.bottom <= box.bottom + 1
                        && go.top >= box.top && skip.top >= box.top,
             tall: Math.min(go.height, skip.height) >= 30,
             scrolls: w.scrollHeight > w.clientHeight };
  });
  check('the welcome still appears at 320px', !!m);
  check('and both buttons stay on screen', m && m.reachable && m.tall,
    'a phone user could not dismiss it');
  if (m && m.scrolls) console.log('        (the copy scrolls here, which is expected)');
  await page.click('#wskip');
  check('and it can actually be dismissed by tapping',
    await page.evaluate(() => !document.querySelector('.welcome')));
}, { width: 320, height: 568 });

/* ------------------------------------------------- the development curtain
   A fresh context, deliberately NOT ungated, because the point of this block
   is the state every stranger actually arrives in. The gate is not security
   and the notes say so; what it has to do is stand in front of the board, let
   the passphrase through, and stay open afterwards. */
console.log('\nthe development curtain');
await withApp('off-the-ball', async ({ page, errors }) => {
  await page.waitForTimeout(700);

  check('a stranger meets the curtain, not the board',
    await page.evaluate(() => !!document.querySelector('.devgate')));
  check('and it says the app is unfinished rather than just refusing',
    /in development/i.test(await page.textContent('.devgate')));
  check('the welcome does not stack underneath it',
    await page.evaluate(() => !document.querySelector('.welcome')),
    'two panels on a cold open is the un-dismissable overlay again');

  /* the board is built underneath, but the curtain has to cover it */
  check('the curtain covers the whole viewport',
    await page.evaluate(() => {
      const r = document.querySelector('.devgate').getBoundingClientRect();
      return r.top <= 0 && r.left <= 0
          && r.bottom >= window.innerHeight && r.right >= window.innerWidth;
    }));

  await page.fill('#devpass', 'not-it');
  await page.click('#devgo');
  check('a wrong passphrase is refused and says so',
    await page.evaluate(() => !!document.querySelector('.devgate')
      && /not that one/i.test(document.querySelector('.gerr').textContent)));

  await page.fill('#devpass', 'wolfden');
  await page.click('#devgo');
  await page.waitForTimeout(400);
  check('the passphrase opens it',
    await page.evaluate(() => !document.querySelector('.devgate')));
  check('and the welcome takes its turn afterwards',
    await page.evaluate(() => !!document.querySelector('.welcome')));

  await page.click('#wskip');
  await page.click('#play');
  await page.waitForTimeout(4200);
  check('the board behind it actually works once opened',
    (await page.textContent('#verdict')).trim().length > 8);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  check('it stays open on the next visit',
    await page.evaluate(() => !document.querySelector('.devgate')));

  check('the curtain raised no page errors', errors.length === 0, errors.join(' | '));
});

/* A shared link is the way into this app, so somebody holding one is told what
   they have and who to ask rather than just being stopped at a password. */
await withApp('off-the-ball', async ({ page }) => {
  const url = page.url();
  /* A hash-only goto is a same-document navigation, so boot never re-runs and
     the curtain keeps the copy it was built with. A real visitor clicking a
     shared link gets a fresh load, so the test has to ask for one. */
  await page.goto(url + '#p=zzz-not-a-real-play', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const txt = await page.evaluate(() => {
    const g = document.querySelector('.devgate');
    return g ? g.textContent : '';
  });
  check('a shared link still meets the curtain', txt.length > 0);
  check('but it says somebody sent you a play', /somebody sent you a play/i.test(txt), txt.slice(0, 120));
});

console.log(failures ? `\n${failures} check(s) failed` : '\nOFF THE BALL BROWSER PASSED');
process.exit(failures ? 1 : 0);
