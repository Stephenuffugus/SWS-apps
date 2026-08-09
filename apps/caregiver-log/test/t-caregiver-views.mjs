/* Board test: the participant view, the locked log, comfort at Largest,
   and 500 entries. */
import { board } from './drive-caregiver.mjs';

const R = [];
const ok = (n, p, d = '') => { R.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };

// ── the page a relative opens from a text message ────────────────────────────
await board(async ({ page, errors, overflow, axe }) => {
  const v = await page.evaluate(() => ({
    tip: !document.getElementById('tipLink').classList.contains('hidden'),
    signin: !document.getElementById('authBtn').classList.contains('hidden'),
    org: document.getElementById('orgLine').textContent,
    body: document.body.innerText,
    composer: !!document.querySelector('.composer'),
    print: !!document.querySelector('[data-fk="print"]'),
    manage: !!document.querySelector('details.manage'),
  }));
  ok('no tip jar on a board the viewer does not own', !v.tip);
  ok('no money ask anywhere on the shared view', !/Tip jar|tip jar|donat/i.test(v.body), '');
  ok('no "Start yours" growth line in the footer', !/Start yours/.test(v.org), v.org);
  ok('no "Sign in" button contradicting the invite', !v.signin);
  ok('the relative can still write and still print', v.composer && v.print);
  ok('the owner-only panel stays hidden', !v.manage);
  ok('the trust badge says what actually travels',
    /sync through this app’s own database/.test(v.body) && /Anyone holding the/.test(v.body));
  ok('the trust badge does not claim nothing leaves the device',
    !/never leaves your device|nothing leaves your device/i.test(v.body));
  const a = await axe();
  ok('axe on the participant view', a.length === 0, JSON.stringify(a));
  ok('no overflow on the participant view', (await overflow()) <= 1);
  ok('no console errors', errors.length === 0, errors.join('|'));
}, { width: 414, uid: 'other' });

// ── locked log: the owner is told they can write, and can ────────────────────
await board(async ({ page }) => {
  await page.evaluate(() => { window.__S.board.settings = { approvalRequired: false, locked: true }; window.__emit(); });
  await page.waitForTimeout(250);
  const own = await page.evaluate(() => ({
    banner: document.querySelector('.banner').textContent,
    composer: !!document.querySelector('.composer'),
  }));
  ok('a locked log still lets the owner write', own.composer, own.banner);
  ok('the banner tells the owner the truth', /You can still write/.test(own.banner), own.banner);
}, { width: 414 });

await board(async ({ page }) => {
  await page.evaluate(() => { window.__S.board.settings = { approvalRequired: false, locked: true }; window.__emit(); });
  await page.waitForTimeout(250);
  const part = await page.evaluate(() => ({
    banner: document.querySelector('.banner').textContent,
    composer: !!document.querySelector('.composer'),
  }));
  ok('a locked log is read-only for the family', !part.composer, part.banner);
}, { width: 414, uid: 'other' });

// ── comfort: the type picker at Largest, and 320px ───────────────────────────
await board(async ({ page, overflow, offenders, axe }) => {
  const sizes = await page.evaluate(() => {
    const seg = document.querySelector('.seg button');
    const prim = document.querySelector('.btn.primary');
    return { root: getComputedStyle(document.documentElement).fontSize,
      seg: Math.round(seg.getBoundingClientRect().height),
      primary: Math.round(prim.getBoundingClientRect().height) };
  });
  ok('at Largest the type picker grows with everything else',
    sizes.seg >= 60 && Math.abs(sizes.seg - sizes.primary) <= 2,
    JSON.stringify(sizes) + ' (was 38px at every setting)');
  ok('no overflow at Largest text', (await overflow()) <= 1, JSON.stringify(await offenders()));
  const a = await axe();
  ok('axe at Largest text', a.length === 0, JSON.stringify(a));
}, { width: 414, prefs: { text: 'xxl' } });

await board(async ({ page, overflow, offenders }) => {
  await page.click('[data-fk="addweek"]');
  await page.waitForTimeout(300);
  ok('no overflow at 320px with a full week of coverage', (await overflow()) <= 1, JSON.stringify(await offenders()));
  const pencils = await page.evaluate(() => [...document.querySelectorAll('.slot')].map((r) => {
    const p = r.querySelector('.slotedit'), t = r.querySelector('.top'), c = r.querySelector('.claimrow');
    return Math.abs(p.getBoundingClientRect().top - t.getBoundingClientRect().top) < 2
      && (!c || p.getBoundingClientRect().bottom <= c.getBoundingClientRect().top);
  }));
  ok('the edit pencil holds its place at 320px too', pencils.every(Boolean), JSON.stringify(pencils));
}, { width: 320 });

// ── 500 entries: nodes, height, and the cost of a sibling's write ────────────
await board(async ({ page, errors }) => {
  await page.evaluate(() => {
    const ts = (d) => ({ toDate: () => d, toMillis: () => d.getTime() });
    const S = window.__S;
    S.entries = [];
    for (let i = 0; i < 500; i++) {
      S.entries.push({ id: 'e' + i, authorName: 'Dana', body: 'Entry number ' + i,
        type: 'note', status: 'ok', creatorUid: 'owner',
        createdAt: ts(new Date(Date.now() - (500 - i) * 3600000)) });
    }
    window.__emit();
  });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => ({
    nodes: document.getElementsByTagName('*').length,
    height: Math.round(document.body.scrollHeight),
    printCopies: document.querySelectorAll('.card.printonly .entry').length,
  }));
  ok('the hidden print copy is not held in the DOM at rest',
    m.printCopies === 0 && m.nodes < 5000, JSON.stringify(m) + ' (was 6,906 nodes / 500 duplicated entries)');
  // find in the log
  await page.fill('[data-fk="filter"]', 'number 137');
  await page.waitForTimeout(300);
  const filtered = await page.evaluate(() => ({
    rows: document.querySelectorAll('.entry').length,
    count: document.querySelector('.filtercount').textContent,
    focus: document.activeElement.dataset.fk,
  }));
  ok('a long log can be searched, and the box keeps focus',
    filtered.rows === 1 && /Showing 1 of 500 entries/.test(filtered.count) && filtered.focus === 'filter',
    JSON.stringify(filtered));
  await page.fill('[data-fk="filter"]', '');
  await page.waitForTimeout(300);

  const redraw = await page.evaluate(() => {
    const t0 = performance.now();
    window.__addRemote({ body: 'A sibling wrote something.' });
    return Math.round(performance.now() - t0);
  });
  ok('a remote write redraw stays fast at 500 entries', redraw < 400, redraw + 'ms');
  ok('no console errors at 500 entries', errors.length === 0, errors.join('|'));
}, { width: 414 });

console.log('\n' + R.filter(r => r.p).length + ' passed, ' + R.filter(r => !r.p).length + ' failed');
if (R.some(r => !r.p)) process.exitCode = 1;
