/* ═══════════════════════════════════════════════════════════════════════════
   Music Studio, in a real browser.

   This app was not written here. It came across from the Lucid Winds arcade on
   2026-08-29 byte for byte, and everything this file checks is either something
   the port CHANGED (branding, the footer seams, the one link that now leaves
   the site) or something the port could plausibly have broken by touching the
   head and the tail of a 228KB single file.

   The music itself is not under test. It works, it has been shipped on the
   arcade for a while, and re-deriving a sequencer's behaviour here would be
   theatre. What is under test is that porting it did not break it.

     node apps/music-studio/test/smoke.browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { withApp } from '../../../design/harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  ok    ${name}`);
};

console.log('Music Studio, ported\n');

/* The app greets a first visitor with a "start a song" modal, which is good
   onboarding and blocks every click underneath it. Every block below dismisses
   it first, the way a person would, and one block asserts it is actually there
   so this can never quietly go vacuous. */
const dismissStarters = (page) => page.evaluate(() => {
  if (window.GS && GS.closeStarters) GS.closeStarters();
  const m = document.getElementById('gs-starters');
  if (m) m.classList.remove('open');
});

await withApp('music-studio', async ({ page, errors, overflow }) => {
  await page.waitForTimeout(1800);

  check('a first visitor is offered a song to start from',
    await page.evaluate(() =>
      document.getElementById('gs-starters').classList.contains('open')),
    'the onboarding modal never opened, so dismissing it below proves nothing');
  await dismissStarters(page);
  await page.waitForTimeout(300);

  /* ---- it still boots ---- */
  check('the studio boots', await page.evaluate(() => typeof GS === 'object' && !!GS));
  check('the transport is there', await page.evaluate(() =>
    !!document.getElementById('gs-play') && !!document.getElementById('gs-bpm')));
  check('the grid is drawn', await page.evaluate(() =>
    document.querySelectorAll('button').length > 30));
  check('no horizontal overflow', (await overflow()) === 0);

  /* ---- it still makes sound ----
     The context is closure-scoped, so rather than reach for a property that
     does not exist, wrap the constructor before the page loads and watch
     whether the studio actually opens audio hardware. That is the thing a
     person would notice, and a port is exactly where it could quietly stop. */
  await page.addInitScript(() => {
    var Real = window.AudioContext || window.webkitAudioContext;
    window.__audio = { made: 0, last: null };
    function Wrapped(a) {
      var c = a === undefined ? new Real() : new Real(a);
      window.__audio.made += 1; window.__audio.last = c;
      return c;
    }
    Wrapped.prototype = Real.prototype;
    window.AudioContext = Wrapped;
    window.webkitAudioContext = Wrapped;
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await dismissStarters(page);
  await page.waitForTimeout(300);

  await page.click('#gs-play');
  await page.waitForTimeout(1500);
  const playing = await page.evaluate(() => ({
    label: document.getElementById('gs-play').textContent.trim(),
    made: window.__audio.made,
    state: window.__audio.last ? window.__audio.last.state : null,
  }));
  check('pressing play starts the transport', /pause|⏸/i.test(playing.label), playing.label);
  check('and the studio really opens audio hardware',
    playing.made > 0 && playing.state === 'running',
    `${playing.made} context(s), state ${playing.state}`);
  await page.click('#gs-play');
  await page.waitForTimeout(400);
  check('and it stops again',
    /play|▶/i.test((await page.textContent('#gs-play')).trim()));

  /* ---- the port: branding ---- */
  const html = await page.content();
  check('it is a Sky Wolf Studio app now',
    /by Sky Wolf Studio/.test(html) && !/by Lucid Winds/.test(html));
  /* Asked of the DOM, not of the source text. A comment in the file explaining
     why the arcade domain was replaced contains the domain, and counting raw
     text reported the note about the fix as the fix being absent. */
  const arcade = await page.evaluate(() => ({
    links: [...document.querySelectorAll('a[href*="lucidwinds.com"]')].map((a) => a.getAttribute('href')),
    visible: /lucidwinds\.com/.test(document.body.innerText || ''),
  }));
  check('the only Lucid Winds link left is the deliberate PadLab one',
    arcade.links.length === 1 && /\/padlab\//.test(arcade.links[0]),
    arcade.links.join(', ') || 'none found');
  check('and nothing on the page tells a visitor they are on the arcade',
    !arcade.visible);
  check('an exported song is watermarked with the site it came from',
    /skywolfstudio\.com/.test(html) && !/Music Studio · lucidwinds/.test(html),
    'a shared export is the one piece of this app that travels on its own');
  check('and that link is marked as leaving the site',
    await page.evaluate(() => {
      const a = document.querySelector('a[href*="lucidwinds.com"]');
      return !!a && a.target === '_blank' && /noopener/.test(a.rel);
    }), 'an offsite link with no rel=noopener is a real defect, not a nitpick');

  /* ---- the port: the fleet seams ---- */
  check('the footer points back at the studio hub',
    await page.evaluate(() => !!document.querySelector('.gs-foot a[href="../"]')));
  check('there is a build tag to quote in a support message',
    (await page.textContent('#buildTag')).trim().length > 0,
    await page.textContent('#buildTag'));
  check('the tip jar stays hidden until there is a link for it',
    await page.evaluate(() => {
      const t = document.getElementById('tipBtn');
      return !!t && getComputedStyle(t).display === 'none';
    }), 'an empty tip jar that is visible is a dead button');
  check('the install button is offered',
    await page.evaluate(() => {
      const b = document.getElementById('swsInstall');
      return !!b && getComputedStyle(b).display !== 'none';
    }));

  /* ---- the seam must never be able to take the app down with it ---- */
  check('the studio seam runs after the app, not before',
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('script:not([src])')];
      const app = s.findIndex((x) => /GS\.init\(\)/.test(x.textContent));
      /* matched on the seam's shape, not its version string: pinning the
         literal meant the next build bump silently stopped finding the seam
         and reported the order as broken. */
      const seam = s.findIndex((x) => /var BUILD\s*=/.test(x.textContent));
      return app !== -1 && seam !== -1 && seam > app;
    }), 'a seam that runs first can stop GS.init() from ever running');

  check('no page errors', errors.length === 0, errors.join(' | '));
});

/* ---- songs survive a reload, which is the only promise the footer makes ---- */
console.log('\nkeeping a song');
await withApp('music-studio', async ({ page, errors }) => {
  await page.waitForTimeout(1800);
  await dismissStarters(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

  /* Edit through the grid cells the app itself binds, then wait out its own
     autosave tick, which runs every 4 seconds and only when the state is
     dirty. The first version of this test clicked arbitrary buttons and waited
     1.2s, then reported the app as losing work when it was the test that had
     not waited. */
  const edited = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-l][data-r]')];
    cells.slice(0, 8).forEach((c) => c.click());
    return cells.length;
  });
  check('the sequencer grid is reachable to edit', edited > 0,
    'no [data-l][data-r] cells found, so the edit below proves nothing');
  await page.waitForTimeout(5200);
  const saved = await page.evaluate(() => !!localStorage.getItem('gs_autosave'));
  check('editing the grid autosaves to this device', saved,
    'nothing was written to gs_autosave, so a reload would lose the work');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await dismissStarters(page);
  check('and the studio comes back up after a reload',
    await page.evaluate(() => typeof GS === 'object' && !!GS));
  check('with the autosave still on the device',
    await page.evaluate(() => !!localStorage.getItem('gs_autosave')));

  check('no page errors', errors.length === 0, errors.join(' | '));
});

/* ---- the smallest phone anyone still uses ---- */
console.log('\non a small phone');
await withApp('music-studio', async ({ page, errors, overflow }) => {
  await page.waitForTimeout(1800);
  await dismissStarters(page);
  await page.waitForTimeout(300);
  check('it still fits at 320px', (await overflow()) <= 2, `${await overflow()}px of sideways scroll`);
  check('and the play button is big enough to hit',
    await page.evaluate(() => {
      const r = document.getElementById('gs-play').getBoundingClientRect();
      return r.height >= 40 && r.width >= 40;
    }));
  check('no page errors', errors.length === 0, errors.join(' | '));
}, { width: 320, height: 568 });

console.log(failures ? `\n${failures} check(s) failed` : '\nMUSIC STUDIO BROWSER PASSED');
process.exit(failures ? 1 : 0);
