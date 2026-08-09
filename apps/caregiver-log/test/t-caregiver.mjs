/* Board test: the composer, back-dating, inline edit, the double-dose guard,
   undo, freshness, coverage and hostile text. */
import { board } from './drive-caregiver.mjs';

const R = [];
const ok = (name, pass, detail = '') => { R.push({ name, pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); };

await board(async ({ page, errors, overflow, offenders, axe, smallTargets }) => {
  // ---- 1. composer survives a remote write, caret and all ----
  await page.click('[data-fk="composebody"]');
  await page.type('[data-fk="composebody"]', 'She was in good spirits and ate a full');
  // caret parked mid-sentence, which is where a slow typist actually is
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  const beforeRemote = await page.evaluate(() => document.activeElement.selectionStart);
  await page.evaluate(() => window.__addRemote({ body: 'Marcus called the cardiology office.' }));
  await page.waitForTimeout(200);
  const focusState = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a && a.tagName, fk: a && a.dataset && a.dataset.fk,
      len: a && a.value ? a.value.length : -1, sel: a && a.selectionStart };
  });
  ok('remote write leaves the caret exactly where it was mid-sentence',
    focusState.fk === 'composebody' && focusState.len === 38 && focusState.sel === beforeRemote && beforeRemote === 33,
    JSON.stringify(focusState) + ' before=' + beforeRemote);
  await page.evaluate(() => { const a = document.activeElement; a.setSelectionRange(a.value.length, a.value.length); });

  // ---- 2. back-dating ----
  await page.fill('[data-fk="authorname"]', 'Dana');
  await page.click('[data-fk="whenbtn"]');
  const stamp = await page.evaluate(() => {
    const d = new Date(); d.setHours(14, 0, 0, 0);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T14:00';
  });
  await page.fill('[data-fk="wheninput"]', stamp);
  await page.dispatchEvent('[data-fk="wheninput"]', 'change');
  await page.click('[data-fk="addentry"]');
  await page.waitForTimeout(250);
  const stored = await page.evaluate(() => window.__S.entries.map(e => e.body));
  ok('back-dated entry stores the time it happened',
    stored.some(b => /^\[when \d{4}-\d\d-\d\dT14:00\] She was in good spirits/.test(b)),
    JSON.stringify(stored.slice(-1)));
  const shownTimes = await page.evaluate(() =>
    [...document.querySelectorAll('.entry .when')].map(n => n.textContent));
  ok('the board shows 2:00 PM and says when it was logged',
    shownTimes.some(t => /2:00/.test(t)) && shownTimes.some(t => /logged/.test(t)),
    JSON.stringify(shownTimes));

  // ---- 3. inline edit ----
  const editBtns = await page.$$('[data-fk^="edit-entry-"]');
  ok('the author gets an inline edit control', editBtns.length >= 1, editBtns.length + ' buttons');
  await editBtns[0].click();
  await page.waitForTimeout(120);
  await page.fill('.entry.editing textarea', 'She was in good spirits and ate a full lunch.');
  await page.click('[data-fk^="editsave-"]');
  await page.waitForTimeout(250);
  const afterEdit = await page.evaluate(() => window.__S.entries.map(e => e.body).join('|'));
  ok('the edit is saved with an edited marker',
    /ate a full lunch\. \[edited \d{4}/.test(afterEdit), afterEdit.slice(0, 140));
  const editedShown = await page.evaluate(() => document.body.innerText.includes('· edited'));
  ok('the entry says it was edited', editedShown);

  // ---- 4. the double-dose guard ----
  await page.click('[data-fk="seg-medication"]');
  await page.fill('[data-fk="drug"]', 'Donepezil');
  await page.fill('[data-fk="dose"]', '5mg');
  await page.click('[data-fk="addentry"]');
  await page.waitForTimeout(200);
  const medBody = await page.evaluate(() => window.__S.entries.slice(-1)[0].body);
  ok('a medication entry records the drug and dose', medBody === 'Gave Donepezil — 5mg', medBody);

  // second person, same drug, an hour later
  await page.evaluate(() => window.__addRemote({ body: 'Gave the 2pm donepezil.', type: 'medication', author: 'Rosalie' }));
  await page.waitForTimeout(150);
  await page.fill('[data-fk="drug"]', 'Donepezil');
  const lastGiven = await page.evaluate(() => {
    const n = document.querySelector('.lastgiven');
    return { text: n.textContent, hidden: n.classList.contains('hidden'), soon: n.classList.contains('soon'),
      px: parseFloat(getComputedStyle(n).fontSize) };
  });
  ok('the composer shows last-given in large type before the save',
    !lastGiven.hidden && lastGiven.soon && /Last given/.test(lastGiven.text) && lastGiven.px >= 19,
    JSON.stringify(lastGiven));
  const before = await page.evaluate(() => window.__S.entries.length);
  await page.click('[data-fk="addentry"]');
  await page.waitForTimeout(200);
  const guarded = await page.evaluate(() => ({
    open: document.getElementById('doseDlg').open,
    n: window.__S.entries.length,
    txt: document.getElementById('doseWhen').textContent,
  }));
  ok('a repeat dose inside the interval is stopped by an explicit confirm',
    guarded.open && guarded.n === before, JSON.stringify(guarded));
  await page.click('#doseGo');
  await page.waitForTimeout(250);
  ok('the confirm lets it through when the user insists',
    (await page.evaluate(() => window.__S.entries.length)) === before + 1);

  // ---- 5. undo, by keyboard, twice in a row ----
  await page.evaluate(() => { window.__S.entries = []; window.__emit(); });
  for (let i = 0; i < 4; i++) {
    await page.evaluate((i) => window.__addRemote({ body: 'Entry number ' + i, uid: 'owner' }), i);
  }
  await page.waitForTimeout(200);
  const dels = await page.$$('[data-fk^="delete-"]');
  await dels[0].click();
  await page.waitForTimeout(80);
  const focusAfterDelete = await page.evaluate(() => {
    const a = document.activeElement;
    return { cls: a && a.className, txt: a && a.textContent };
  });
  ok('focus lands on the Undo button after a delete',
    focusAfterDelete.cls === 'undo', JSON.stringify(focusAfterDelete));
  const dels2 = await page.$$('[data-fk^="delete-"]');
  await dels2[0].click();
  await page.waitForTimeout(80);
  const toastNow = await page.evaluate(() => document.getElementById('toast').textContent);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const restored = await page.evaluate(() => document.querySelectorAll('.entry').length);
  ok('two deletes in one window both come back',
    restored === 4, 'toast=' + JSON.stringify(toastNow) + ' entries=' + restored);
  await page.waitForTimeout(11000);
  const stillThere = await page.evaluate(() => window.__S.entries.length);
  ok('nothing was committed behind the undo', stillThere === 4, String(stillThere));

  // ---- 6. freshness ----
  const fresh = await page.evaluate(() => document.querySelector('.freshline').textContent);
  ok('the board says how fresh it is', /Last written .* by /.test(fresh), fresh);

  // ---- 7. the type picker scales ----
  const segH = await page.evaluate(() => Math.round(document.querySelector('.seg button').getBoundingClientRect().height));
  ok('the type picker is at least 44px at default text', segH >= 44, segH + 'px');

  // ---- 8. tip jar and growth footer on an owned board ----
  const chrome = await page.evaluate(() => ({
    tip: !document.getElementById('tipLink').classList.contains('hidden'),
    org: document.getElementById('orgLine').textContent,
  }));
  ok('the owner still has the tip jar', chrome.tip, JSON.stringify(chrome));
  ok('the colophon is not a growth ad', !/Start yours/.test(chrome.org), chrome.org);

  // ---- 9. week idempotence ----
  await page.click('[data-fk="addweek"]');
  await page.waitForTimeout(200);
  await page.click('[data-fk="addweek"]');
  await page.waitForTimeout(250);
  const slots = await page.evaluate(() => window.__S.slots.map(s => s.label));
  const dupes = slots.length - new Set(slots).size;
  ok('pressing Add the next 7 days twice does not duplicate the week',
    slots.length === 7 && dupes === 0, slots.length + ' slots, ' + dupes + ' duplicates');
  const covPencil = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.slot')];
    return rows.map(r => {
      const p = r.querySelector('.slotedit');
      if (!p) return null;
      const claim = r.querySelector('.claimrow');
      const atTop = Math.abs(p.getBoundingClientRect().top - r.querySelector('.top').getBoundingClientRect().top) < 2;
      const aboveClaim = !claim || p.getBoundingClientRect().bottom <= claim.getBoundingClientRect().top;
      return atTop && aboveClaim;
    });
  });
  ok('the edit pencil stays on the first line of every coverage row',
    covPencil.every(Boolean), JSON.stringify(covPencil));

  // ---- 10. pending surfacing ----
  await page.evaluate(() => {
    window.__addRemote({ body: 'A note held for approval', status: 'pending', author: 'Rosalie' });
    window.__addRemote({ body: 'Another held note', status: 'pending', author: 'Rosalie' });
  });
  await page.waitForTimeout(200);
  const pend = await page.evaluate(() => {
    const b = document.querySelector('.pendbar');
    return b ? b.textContent : null;
  });
  ok('the owner is told how many notes are waiting', /2 notes are waiting/.test(pend || ''), String(pend));

  // ---- 11. hostile text through the new fields ----
  await page.evaluate(() => { window.__S.entries = []; window.__emit(); });
  await page.click('[data-fk="seg-note"]');
  const payloads = [
    '<img src=x onerror="window.__pwn=1">',
    '[when 2026-13-45T99:99] a note that only looks like it carries a time',
    '[when 2026-02-30T10:00] thirty days hath February',
    'plain note [edited 9999-99-99T99:99]',
    'A'.repeat(2100),
  ];
  for (const p of payloads) {
    await page.fill('[data-fk="composebody"]', p);
    await page.click('[data-fk="addentry"]');
    await page.waitForTimeout(150);
  }
  await page.click('[data-fk="seg-medication"]');
  await page.fill('[data-fk="drug"]', '<script>alert(1)</script>');
  await page.fill('[data-fk="dose"]', 'A'.repeat(200));
  await page.click('[data-fk="addentry"]');
  await page.waitForTimeout(200);
  const hostile = await page.evaluate(() => ({
    pwn: !!window.__pwn,
    imgs: document.querySelectorAll('#view img').length,
    scripts: document.querySelectorAll('#view script').length,
    bad: /NaN|Invalid Date|undefined|\[object/.test(document.getElementById('view').innerText),
    maxBody: Math.max(...window.__S.entries.map(e => e.body.length)),
    times: [...document.querySelectorAll('.entry .when')].map(n => n.textContent).join(' '),
  }));
  ok('hostile text through the composer and the drug field is inert',
    !hostile.pwn && hostile.imgs === 0 && hostile.scripts === 0 && !hostile.bad, JSON.stringify(hostile));
  ok('a nonsense [when] token stays plain text and never becomes a time',
    !/Invalid|NaN/.test(hostile.times), hostile.times);
  ok('nothing exceeds the 2000-character write cap', hostile.maxBody <= 2000, String(hostile.maxBody));

  ok('no console errors', errors.length === 0, errors.join(' | '));
  ok('no horizontal overflow', (await overflow()) <= 1, String(await overflow()));
  const v = await axe();
  ok('axe on the live board', v.length === 0, JSON.stringify(v));
  // The three 36px header controls are the shared base's chrome, identical in
  // all 23 apps and held in design/ — not this app's to change.
  const BASE_CHROME = ['a#brandLink', 'button#swsPrefsBtn.noprint', 'a#tipLink.tipbtn', 'button#authBtn.btn'];
  const small = (await smallTargets()).filter(t => !BASE_CHROME.includes(t.sel));
  ok('no targets under the comfort floor', small.length === 0, JSON.stringify(small));
}, { width: 414 });

console.log('\n' + R.filter(r => r.pass).length + ' passed, ' + R.filter(r => !r.pass).length + ' failed');
if (R.some(r => !r.pass)) process.exitCode = 1;
