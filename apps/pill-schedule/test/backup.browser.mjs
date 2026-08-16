/* The shared backup runtime, driven in a real browser.
 *
 * Local-only storage means a cleared browser takes the data with it, so the
 * backup file is the only safety net any of these apps has. It is tested here
 * on Pill Schedule because that is the highest-stakes payload in the set — a
 * medication list — but the runtime under test is design/backup.js, shared by
 * every app that uses it.
 *
 * Asserts the three things that would make it worthless:
 *   · a backup that does not actually contain the data
 *   · a restore that does not bring it back
 *   · a restore that accepts the WRONG app's file and overwrites good data
 *
 * Run from the repo root:  node apps/pill-schedule/test/backup.browser.mjs
 */
import { withApp } from '../../../design/harness.mjs';

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ok:', name); }
  else { failed++; console.error('  FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};

await withApp('pill-schedule', async ({ page, errors }) => {
  check('the shared runtime loaded', await page.evaluate(() => !!(window.SWS && SWS.backup)));
  check('the backup card is on the page', await page.evaluate(() => !!document.getElementById('backupCard')));
  check('both controls are wired', await page.evaluate(() => {
    const h = document.getElementById('backupControls');
    return !!h && h.querySelectorAll('button').length === 2;
  }));

  /* Put a real medication list in, the way the app stores it. */
  const wrote = await page.evaluate(() => {
    const payload = JSON.stringify({
      who: 'Mom',
      meds: [
        { name: 'Lisinopril', dose: '10 mg, 1 tablet', when: ['morning'] },
        { name: 'Metformin', dose: '500 mg', when: ['morning', 'evening'] },
      ],
      allergies: 'penicillin — rash',
    });
    localStorage.setItem('pill-schedule', payload);
    return payload.length;
  });
  check('seeded a medication list', wrote > 40, wrote);

  const shape = await page.evaluate(() => {
    const cfg = { app: 'pill-schedule', name: 'Pill Schedule', keys: ['pill-schedule'] };
    const out = SWS.backup.serialize(cfg);
    return {
      sws: out.sws, app: out.app, hasData: !!out.data['pill-schedule'],
      dated: !Number.isNaN(Date.parse(out.exportedAt)),
      /* The comfort settings live on the same origin under sws.prefs. A backup
         that scooped them up would be exporting another app's state. */
      onlyOwnKeys: Object.keys(out.data).every(k => k === 'pill-schedule'),
    };
  });
  check('the file is stamped with the app it came from', shape.app === 'pill-schedule', shape);
  check('the file carries the data', shape.hasData);
  check('the file is dated', shape.dated);
  check('the file contains only this app’s keys', shape.onlyOwnKeys);

  /* Wipe, then restore from the serialized copy. */
  const round = await page.evaluate(async () => {
    const cfg = { app: 'pill-schedule', name: 'Pill Schedule', keys: ['pill-schedule'] };
    const file = JSON.stringify(SWS.backup.serialize(cfg));
    const before = localStorage.getItem('pill-schedule');

    localStorage.removeItem('pill-schedule');
    const afterWipe = localStorage.getItem('pill-schedule');

    window.confirm = () => true;                 // the restore asks first, by design
    await new Promise((res) => {
      SWS.backup.restore(cfg, new Blob([file], { type: 'application/json' }), res);
    });
    return { afterWipe, restored: localStorage.getItem('pill-schedule'), before };
  });
  check('the wipe emptied it', round.afterWipe === null);
  check('restore brings the list back byte for byte', round.restored === round.before,
    { restored: (round.restored || '').slice(0, 60) });

  /* The dangerous case: someone picks the wrong file out of Downloads. */
  const wrong = await page.evaluate(async () => {
    const cfg = { app: 'pill-schedule', name: 'Pill Schedule', keys: ['pill-schedule'] };
    const good = localStorage.getItem('pill-schedule');
    const foreign = JSON.stringify({
      sws: 1, app: 'packing-list', name: 'Packing List', version: 1,
      exportedAt: new Date().toISOString(),
      data: { 'packing-list.trips': '[{"name":"Tahoe"}]' },
    });
    window.confirm = () => true;
    let called = false;
    SWS.backup.restore(cfg, new Blob([foreign], { type: 'application/json' }), () => { called = true; });
    await new Promise(r => setTimeout(r, 350));
    return {
      medsIntact: localStorage.getItem('pill-schedule') === good,
      leaked: localStorage.getItem('packing-list.trips'),
      called,
    };
  });
  check('a foreign backup is refused', wrong.medsIntact && !wrong.called);
  check('a foreign backup writes nothing', wrong.leaked === null, wrong.leaked);

  /* And a file that is not a backup at all. */
  const junk = await page.evaluate(async () => {
    const cfg = { app: 'pill-schedule', name: 'Pill Schedule', keys: ['pill-schedule'] };
    const good = localStorage.getItem('pill-schedule');
    window.confirm = () => true;
    SWS.backup.restore(cfg, new Blob(['not json at all'], { type: 'application/json' }), () => {});
    await new Promise(r => setTimeout(r, 300));
    return localStorage.getItem('pill-schedule') === good;
  });
  check('junk does not destroy the data', junk);

  const real = errors.filter(e => !/favicon/i.test(e));
  check('no page or console errors', real.length === 0, real.slice(0, 3));
}, { width: 412, height: 900 });

console.log(`\n${passed} passing, ${failed} failing`);
if (failed) process.exit(1);
console.log('BACKUP RUNTIME PASSED');
