/* Board test: the "new since you last looked" divider, the running questions
   list and the export. */
import { board } from './drive-caregiver.mjs';

const R = [];
const ok = (n, p, d = '') => { R.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };

await board(async ({ page, errors }) => {
  await page.evaluate(() => {
    const ts = (d) => ({ toDate: () => d, toMillis: () => d.getTime() });
    const S = window.__S;
    S.entries = [];
    for (let i = 0; i < 6; i++) {
      S.entries.push({ id: 'e' + i, authorName: 'Dana', body: 'Entry ' + i, type: 'note',
        status: 'ok', creatorUid: 'owner', createdAt: ts(new Date(Date.now() - (6 - i) * 3600000)) });
    }
    window.__emit();
  });
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(300);
  // written after leaving the board, because leaving stamps "seen" as now
  await page.evaluate(() => localStorage.setItem('cl-seen-b1', String(Date.now() - 2.5 * 3600000)));
  await page.evaluate(() => { location.hash = '#/b/AAAAAA'; });
  await page.waitForTimeout(600);
  const seen = await page.evaluate(() => {
    const line = document.querySelector('.seenline');
    const before = [];
    let n = line && line.previousElementSibling;
    while (n) { if (n.classList.contains('entry')) before.push(n); n = n.previousElementSibling; }
    return { has: !!line, text: line && line.textContent, newAbove: before.length,
      fresh: document.querySelector('.freshline').textContent };
  });
  ok('a returning relative sees a "new since you last looked" divider',
    seen.has && seen.newAbove === 2, JSON.stringify(seen));
  ok('the freshness line counts what is new', /2 new since you last looked/.test(seen.fresh), seen.fresh);

  // the running questions list
  await page.click('[data-fk="seg-question"]');
  await page.fill('[data-fk="authorname"]', 'Dana');
  await page.fill('[data-fk="composebody"]', 'Ask about the ankle swelling.');
  await page.click('[data-fk="addentry"]');
  await page.waitForTimeout(250);
  const askBtn = await page.$('[data-fk^="asked-"]');
  ok('a question can be crossed off the running list', !!askBtn);
  await askBtn.click();
  await page.waitForTimeout(250);
  const asked = await page.evaluate(() => ({
    done: window.__S.entries.find(e => e.type === 'question').done,
    badge: !!document.querySelector('.badge.asked'),
  }));
  ok('marking it asked writes the one field the rules allow',
    asked.done === true && asked.badge, JSON.stringify(asked));
  await page.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); });
  await page.waitForTimeout(200);
  const printed = await page.evaluate(() => {
    const t = document.querySelector('.card.printonly').innerText;
    const i = t.toUpperCase().indexOf('QUESTIONS FOR THIS VISIT');
    return { hasSection: i >= 0, all: t };
  });
  ok('an asked question drops off the doctor page\'s questions list',
    !printed.hasSection && /ankle swelling/.test(printed.all), '');

  // export
  const dl = page.waitForEvent('download', { timeout: 5000 });
  await page.evaluate(() => { document.querySelector('details.manage').open = true; });
  await page.click('[data-fk="export"]');
  const file = await dl;
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  const json = JSON.parse(readFileSync(path, 'utf8'));
  ok('the export is a real file with the whole log',
    json.app === 'caregiver-log' && json.entries.length >= 7 && !!json.entries[0].happenedAt,
    file.suggestedFilename() + ', ' + json.entries.length + ' entries');
  ok('no console errors', errors.length === 0, errors.join('|'));
}, { width: 414 });

console.log('\n' + R.filter(r => r.p).length + ' passed, ' + R.filter(r => !r.p).length + ' failed');
if (R.some(r => !r.p)) process.exitCode = 1;
