/* Board test: putting a downloaded copy back, folding away the days that have
   gone by, Ctrl+Z on the undo, and what the app says when the shared database
   rules refuse the 501st entry. */
import { board } from './drive-caregiver.mjs';

const R = [];
const ok = (n, p, d = '') => { R.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };

const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const dayLabel = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return fmt.format(d);
};

// ── the coverage list after a log has been running for months ────────────────
await board(async ({ page, errors, overflow, axe }) => {
  await page.evaluate((labels) => {
    const S = window.__S;
    S.slots = labels.map((label, i) => ({ id: 's' + i, label, capacity: 1, order: i, claimedCount: 0 }));
    window.__emit();
  }, [dayLabel(-30), dayLabel(-8), dayLabel(-1), dayLabel(0), dayLabel(1), dayLabel(3),
    'Thursday night', 'school run']);
  await page.waitForTimeout(400);

  const cov = await page.evaluate(() => {
    const card = document.querySelectorAll('section.card')[1];
    const det = card.querySelector('details.pastdays');
    const visible = [...card.children].filter(n => n.classList.contains('slot'))
      .map(n => n.querySelector('.label').textContent);
    return {
      summary: det && det.querySelector('summary').textContent,
      folded: det ? det.querySelectorAll('.slot .label').length : 0,
      open: det ? det.open : null,
      visible,
    };
  });
  ok('the days that have gone by fold away instead of being deleted',
    cov.folded === 3 && /3 earlier days/.test(cov.summary), JSON.stringify(cov));
  ok('today and the days ahead stay on the list',
    cov.visible.length === 5 && cov.visible[0] === dayLabel(0)
    && cov.visible.slice(0, 3).join('|') === [dayLabel(0), dayLabel(1), dayLabel(3)].join('|'),
    JSON.stringify(cov.visible));
  ok('a free-text label is never guessed at and never folded',
    cov.visible.includes('Thursday night') && cov.visible.includes('school run'),
    JSON.stringify(cov.visible));

  await page.click('details.pastdays > summary');
  await page.waitForTimeout(150);
  const opened = await page.evaluate(() => {
    const det = document.querySelector('details.pastdays');
    return { open: det.open, rows: det.querySelectorAll('.slot').length,
      claim: det.querySelectorAll('[data-fk^="claim-"]').length };
  });
  ok('the folded days are one tap away, with their claim buttons intact',
    opened.open && opened.rows === 3 && opened.claim === 3, JSON.stringify(opened));

  // a redraw from a sibling's write must not slam the disclosure shut
  await page.evaluate(() => window.__addRemote({ body: 'A sibling wrote something.' }));
  await page.waitForTimeout(300);
  ok('a remote write does not slam the fold shut',
    await page.evaluate(() => document.querySelector('details.pastdays').open));

  ok('no overflow with the fold open', (await overflow()) === 0);
  const v1 = await axe();
  ok('axe with the earlier days open', v1.length === 0, JSON.stringify(v1));

  // every day in the past: the list still says something
  await page.evaluate((labels) => {
    const S = window.__S;
    S.slots = labels.map((label, i) => ({ id: 'p' + i, label, capacity: 1, order: i, claimedCount: 0 }));
    window.__emit();
  }, [dayLabel(-5), dayLabel(-4)]);
  await page.waitForTimeout(300);
  const allPast = await page.evaluate(() => {
    const card = document.querySelectorAll('section.card')[1];
    const e = card.querySelector('.empty');
    return { text: e && e.textContent, fold: !!card.querySelector('details.pastdays') };
  });
  ok('a list where every day has gone by still has an empty state',
    allPast.fold && /Nothing on the list from today onwards/.test(allPast.text || ''),
    JSON.stringify(allPast));

  ok('no console errors in the coverage fold', errors.length === 0, errors.join('|'));
}, { width: 414 });

// ── putting a copy back ──────────────────────────────────────────────────────
const COPY = {
  app: 'caregiver-log', version: 1,
  exportedAt: '2026-08-01T10:00:00.000Z',
  board: { title: 'Mom', description: 'Donepezil 5mg mornings.' },
  coverage: [
    { label: 'Tuesday, Aug 11', capacity: 2, people: [{ name: 'Dana', note: '' }] },
    { label: 'school run', capacity: 1, people: [] },
  ],
  entries: [
    { author: 'Rosalie', type: 'medication', text: 'Gave Donepezil — 5mg',
      happenedAt: '2026-03-04T14:00:00.000Z', writtenAt: '2026-03-04T23:40:00.000Z', editedAt: null, status: 'ok' },
    { author: 'Dana', type: 'question', text: 'Ask about the ankle swelling.',
      happenedAt: '2026-03-05T09:15:00.000Z', writtenAt: '2026-03-05T09:15:00.000Z', editedAt: null, status: 'ok' },
    { author: 'Marcus', type: 'note', text: '<img src=x onerror="window.__pwn=1"><script>window.__pwn=1<\/script>',
      happenedAt: '2026-03-06T08:00:00.000Z', writtenAt: '2026-03-06T08:00:00.000Z', editedAt: null, status: 'ok' },
    { author: '', type: 'nonsense', text: 'A note whose author and type are junk.',
      happenedAt: 'not-a-date', writtenAt: null, editedAt: null, status: 'ok' },
    { author: 'Dana', type: 'note', text: '   ', happenedAt: '2026-03-07T08:00:00.000Z' },
  ],
};

const put = async (page, obj) => {
  await page.evaluate(() => { document.querySelector('details.manage').open = true; });
  await page.setInputFiles('#importFile', {
    name: 'care-log-mom.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(obj)),
  });
  await page.waitForTimeout(300);
};

await board(async ({ page, errors, overflow, axe }) => {
  await put(page, COPY);
  const dlg = await page.evaluate(() => ({
    open: document.getElementById('importDlg').open,
    summary: document.getElementById('importSummary').textContent,
    warn: document.getElementById('importWarn').textContent,
    warnShown: !document.getElementById('importWarn').classList.contains('hidden'),
    focus: document.activeElement.id,
  }));
  ok('a copy asks before it writes anything, and counts what it will do',
    dlg.open && /4 notes and 2 coverage days/.test(dlg.summary), JSON.stringify(dlg));
  ok('the two unusable rows are counted as skipped, not silently dropped',
    /1 unreadable and skipped/.test(dlg.summary), dlg.summary);
  ok('it says out loud that claimed days cannot come back',
    dlg.warnShown && /cannot come back/.test(dlg.warn), dlg.warn);
  ok('the confirm button has focus', dlg.focus === 'importGo', dlg.focus);
  const v0 = await axe();
  ok('axe on the restore dialog', v0.length === 0, JSON.stringify(v0));

  await page.click('#importGo');
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.entry')].map(n => ({
      who: n.querySelector('.who').textContent,
      when: n.querySelector('.when').textContent,
      logged: !!n.querySelector('.when.logged'),
      body: n.querySelector('.body').textContent,
    }));
    return {
      rows,
      days: [...document.querySelectorAll('.slot .label')].map(n => n.textContent),
      count: window.__S.entries.length,
      entryCount: window.__S.board.entryCount,
      stored: window.__S.entries.map(e => e.body),
      pwn: !!window.__pwn,
      imgs: document.querySelectorAll('.entry img').length,
      scripts: document.querySelectorAll('.entry script').length,
      dlg: document.getElementById('importDlg').open,
    };
  });
  ok('the notes are back in the log', after.count === 4, after.count + ' entries');
  ok('the dialog closes itself when it is done', !after.dlg);
  ok('the board counter moved with them, the way the rules require',
    after.entryCount === 4, String(after.entryCount));
  ok('a note whose author was blank still lands, named rather than rejected',
    after.rows.some(r => r.who === 'Someone'), JSON.stringify(after.rows.map(r => r.who)));

  const dose = after.stored.find(b => /Donepezil/.test(b));
  ok('the time it HAPPENED is preserved, not re-dated to the restore',
    /^\[when 2026-03-04T\d\d:\d\d\] Gave Donepezil — 5mg$/.test(dose), dose);
  const doseRow = after.rows.find(r => /Donepezil/.test(r.body));
  ok('the timeline shows it at its original time, marked as logged today',
    doseRow && doseRow.logged && doseRow.when.length > 0, JSON.stringify(doseRow));

  ok('a junk type is filed as a plain note rather than rejected by the rules',
    after.rows.some(r => /author and type are junk/.test(r.body)), '');
  ok('hostile text in a copy is inert', !after.pwn && after.imgs === 0 && after.scripts === 0,
    JSON.stringify({ pwn: after.pwn, imgs: after.imgs, scripts: after.scripts }));
  ok('the coverage days came back, empty for the family to claim again',
    after.days.includes('school run') && after.days.includes('Tuesday, Aug 11'),
    JSON.stringify(after.days));

  // idempotence — the same file twice must not double a year of log
  await put(page, COPY);
  const second = await page.evaluate(() => ({
    open: document.getElementById('importDlg').open,
    toast: document.getElementById('toast').textContent,
    count: window.__S.entries.length,
  }));
  ok('the same copy put back twice adds nothing and says so',
    !second.open && second.count === 4 && /already in the log/.test(second.toast),
    JSON.stringify(second));

  ok('no overflow after a restore', (await overflow()) === 0);
  const v1 = await axe();
  ok('axe after a restore', v1.length === 0, JSON.stringify(v1));
  ok('no console errors through the restore', errors.length === 0, errors.join('|'));
}, { width: 414 });

// ── the copy that will not fit, and the file that is not a copy ──────────────
await board(async ({ page, errors }) => {
  await page.evaluate(() => { window.__S.board.entryCount = 498; window.__emit(); });
  await page.waitForTimeout(200);
  await put(page, COPY);
  const full = await page.evaluate(() => ({
    warn: document.getElementById('importWarn').textContent,
    disabled: document.getElementById('importGo').disabled,
    focus: document.activeElement.id,
  }));
  ok('a copy too big for the room left is refused, with the number said out loud',
    full.disabled && /room for 2 more entries/.test(full.warn) && /4/.test(full.warn), JSON.stringify(full));
  ok('focus goes somewhere reachable when the confirm is disabled',
    full.focus === 'importCancel', full.focus);
  await page.click('#importCancel');

  await put(page, { app: 'grocery-list', items: [] });
  const wrong = await page.evaluate(() => ({
    open: document.getElementById('importDlg').open,
    toast: document.getElementById('toast').textContent,
  }));
  ok('a file from another app is turned away by name',
    !wrong.open && /did not come from Caregiver Log/.test(wrong.toast), JSON.stringify(wrong));

  await page.evaluate(() => { document.querySelector('details.manage').open = true; });
  await page.setInputFiles('#importFile', {
    name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{ this is not json'),
  });
  await page.waitForTimeout(300);
  const junk = await page.evaluate(() => ({
    open: document.getElementById('importDlg').open,
    toast: document.getElementById('toast').textContent,
  }));
  ok('an unreadable file says so instead of throwing',
    !junk.open && /could not be read/.test(junk.toast), JSON.stringify(junk));

  // the 501st entry: the rules refuse it, and the app has to say the real reason
  await page.evaluate(() => { window.__S.board.entryCount = 500; window.__emit(); });
  await page.waitForTimeout(200);
  await page.fill('[data-fk="authorname"]', 'Dana');
  await page.fill('[data-fk="composebody"]', 'She ate a full lunch.');
  await page.click('[data-fk="addentry"]');
  await page.waitForTimeout(400);
  const capped = await page.evaluate(() => document.getElementById('toast').textContent);
  ok('a full log says it is full, not "the log may be locked"',
    /This log is full/.test(capped) && /500/.test(capped) && !/may be locked/.test(capped), capped);

  ok('no console errors in the refusal paths', errors.length === 0, errors.join('|'));
}, { width: 414 });

// ── Ctrl+Z reaches the undo ──────────────────────────────────────────────────
await board(async ({ page, errors }) => {
  await page.evaluate(() => {
    window.__addRemote({ body: 'The one I meant to keep.', uid: 'owner' });
    window.__addRemote({ body: 'The duplicate.', uid: 'owner' });
  });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => document.querySelectorAll('.entry').length);
  await page.click('[data-fk^="delete-"]');
  await page.waitForTimeout(200);
  const mid = await page.evaluate(() => document.querySelectorAll('.entry').length);
  // put focus somewhere that is not the Undo button, the way a mouse user would
  await page.evaluate(() => document.getElementById('view').focus());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    n: document.querySelectorAll('.entry').length,
    toast: document.getElementById('toast').textContent,
    stored: window.__S.entries.length,
  }));
  ok('Ctrl+Z brings a deleted entry back', before === 2 && mid === 1 && after.n === 2,
    JSON.stringify({ before, mid, after: after.n }));
  ok('nothing was committed behind the Ctrl+Z', after.stored === 2, String(after.stored));

  // and it must not fire twice, or steal the key from someone typing
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  ok('a second Ctrl+Z does nothing — the offer expired with the toast',
    (await page.evaluate(() => document.querySelectorAll('.entry').length)) === 2);

  await page.click('[data-fk^="delete-"]');
  await page.waitForTimeout(200);
  await page.focus('[data-fk="composebody"]');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  ok('Ctrl+Z inside the composer stays the browser\'s, not ours',
    (await page.evaluate(() => document.querySelectorAll('.entry').length)) === 1);

  ok('no console errors in the undo path', errors.length === 0, errors.join('|'));
}, { width: 1280 });

console.log('\n' + R.filter(r => r.p).length + ' passed, ' + R.filter(r => !r.p).length + ' failed');
if (R.some(r => !r.p)) process.exitCode = 1;
