/* Board test: the doctor-visit page, in light and in dark, and at scale. */
import { board } from './drive-caregiver.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const R = [];
const ok = (n, p, d = '') => { R.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };

const seed = (page, n) => page.evaluate((n) => {
  const S = window.__S;
  S.board.description = 'Medicines: Donepezil 5mg mornings, Lisinopril 10mg.\nAllergies: penicillin.\nDr Reyes, cardiology 555-0142. Pharmacy: Ash Street 555-0190.\nAdvance directive is in the blue folder on the hall shelf.';
  const day = 86400000;
  const ts = (d) => ({ toDate: () => d, toMillis: () => d.getTime() });
  S.entries = [];
  for (let i = 0; i < n; i++) {
    const at = new Date(Date.now() - (n - i) * day / 3);
    S.entries.push({ id: 'e' + i, authorName: i % 2 ? 'Dana' : 'Rosalie',
      body: i % 7 === 0 ? 'Gave Donepezil, 5mg' : 'Quiet afternoon, entry number ' + i + '.',
      type: i % 7 === 0 ? 'medication' : 'note', status: 'ok', creatorUid: 'owner', createdAt: ts(at) });
  }
  S.entries.push({ id: 'q1', authorName: 'Dana', body: 'Ask about the swelling in her ankles.',
    type: 'question', status: 'ok', creatorUid: 'owner', createdAt: ts(new Date(Date.now() - 40 * day)) });
  S.entries.push({ id: 'q2', authorName: 'Marcus', body: 'Is the lisinopril still the right dose?',
    type: 'question', status: 'ok', creatorUid: 'owner', createdAt: ts(new Date(Date.now() - 2 * day)) });
  window.__emit();
}, n);

async function pdfOf(page, file) {
  await page.emulateMedia({ media: 'print' });
  const buf = await page.pdf({ format: 'Letter', printBackground: true });
  writeFileSync(file, buf);
  await page.emulateMedia({ media: 'screen' });
  return file;
}

// ── light mode, 7 days by default ────────────────────────────────────────────
await board(async ({ page, errors }) => {
  await seed(page, 500);
  await page.waitForTimeout(600);
  await page.click('[data-fk="print"]');
  await page.waitForTimeout(150);
  const dlg = await page.evaluate(() => ({
    open: document.getElementById('printDlg').open,
    checked: document.querySelector('input[name="printrange"]:checked').value,
  }));
  ok('the print button asks for a range and defaults to 7 days', dlg.open && dlg.checked === '7', JSON.stringify(dlg));
  await page.evaluate(() => { document.getElementById('printDlg').close(); window.dispatchEvent(new Event('beforeprint')); });
  await page.waitForTimeout(300);

  const f = await pdfOf(page, '/tmp/care-7.pdf');
  const info = execFileSync('pdfinfo', [f]).toString();
  const pages = Number(info.match(/Pages:\s+(\d+)/)[1]);
  const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  ok('a 500-entry log prints the last 7 days, not 56 pages', pages <= 6, pages + ' pages');
  const U = txt.toUpperCase();
  ok('the standing reference block is on the page', /STANDING DETAILS/.test(U) && /penicillin/.test(txt));
  ok('the open questions are collected at the top',
    /QUESTIONS FOR THIS VISIT/.test(U) && /swelling in her ankles/.test(txt)
    && U.indexOf('QUESTIONS FOR THIS VISIT') < U.indexOf('WHAT HAPPENED'));
  ok('the medication given is grouped, with times and who gave it',
    /MEDICATION GIVEN/.test(U) && /Donepezil/.test(txt) && /doses logged/.test(txt),
    (txt.match(/Donepezil[^\n]*/) || [''])[0]);
  ok('the patient identity is not printed twice',
    (txt.match(/Care log, Mom/g) || []).length === 1 && !/Caring for Mom/.test(txt));
  ok('the range is stated on the page', /Covering .* to today/.test(txt));
  ok('the rota, the invite code and the tip jar stay off the page',
    !/Who’s there/.test(txt) && !/Invite code/.test(txt) && !/Tip jar/.test(txt));
  ok('the disclaimer is still there', /Not a medical record/.test(txt));
  const pageText = execFileSync('pdftotext', ['-layout', '-f', String(pages), '-l', String(pages), f, '-']).toString();
  let allPagesNamed = true;
  const numbered = [];
  for (let i = 1; i <= pages; i++) {
    const t = execFileSync('pdftotext', ['-layout', '-f', String(i), '-l', String(i), f, '-']).toString();
    if (!/FAMILY-KEPT CARE LOG/i.test(t)) allPagesNamed = false;
    if (new RegExp('Page ' + i + ' of ' + pages).test(t)) numbered.push(i);
  }
  ok('every page says whose log it is', allPagesNamed, pages + ' pages checked');
  // Deferred once on the belief that Chromium renders no @page margin boxes.
  // It does, and it resolves both counters, measured here, page by page.
  ok('every page is numbered, and knows how many there are',
    numbered.length === pages, numbered.length + ' of ' + pages + ' pages carry "Page n of ' + pages + '"');
  ok('no console errors in the print path', errors.length === 0, errors.join('|'));

  // everything
  await page.evaluate(() => {
    document.querySelector('input[name="printrange"][value="0"]').checked = true;
    document.getElementById('printGo').click();
  });
  await page.waitForTimeout(400);
}, { width: 414 });

// ── the same page printed from a phone in dark mode ──────────────────────────
await board(async ({ page }) => {
  await seed(page, 20);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const colors = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const grab = (sel) => { const n = document.querySelector(sel); return n ? getComputedStyle(n).color : null; };
    return {
      surface: cs.getPropertyValue('--surface').trim(),
      ink: cs.getPropertyValue('--ink').trim(),
      title: grab('.card.printonly h2'),
      meta: grab('.printmeta'),
      dayhead: grab('.card.printonly .dayhead'),
      disclaimer: grab('.card.printonly .disclaimer'),
      cardBg: getComputedStyle(document.querySelector('.card.printonly')).backgroundColor,
    };
  });
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number).map(v => {
      const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratioOnWhite = (rgb) => ((1.05) / (lum(rgb) + 0.05)).toFixed(2);
  const ratios = {
    title: ratioOnWhite(colors.title), meta: ratioOnWhite(colors.meta),
    dayhead: ratioOnWhite(colors.dayhead), disclaimer: ratioOnWhite(colors.disclaimer),
  };
  ok('dark mode + print resets the palette', colors.surface === '#fff' && colors.ink === '#000', JSON.stringify(colors));
  ok('the printed title is black on white, not a ghost', Number(ratios.title) >= 15, ratios.title + ':1 (was 1.2)');
  ok('the print date, day separators and the disclaimer are legible',
    Number(ratios.meta) >= 7 && Number(ratios.dayhead) >= 7 && Number(ratios.disclaimer) >= 7,
    JSON.stringify(ratios) + ' (were 2.3:1)');
  ok('no dark slab behind the timeline',
    /rgba?\(255, 255, 255/.test(colors.cardBg) || colors.cardBg === 'rgba(0, 0, 0, 0)', colors.cardBg);

  const sizes = await page.evaluate(() => ({
    h2: getComputedStyle(document.querySelector('.card.printonly h2')).fontSize,
    fam: getComputedStyle(document.querySelector('.card.printonly h2')).fontFamily.slice(0, 20),
  }));
  ok('the printed title still gets the display treatment', parseFloat(sizes.h2) >= 18, JSON.stringify(sizes));

  const buf = await page.pdf({ format: 'Letter', printBackground: true });
  writeFileSync('/tmp/care-dark.pdf', buf);
  execFileSync('pdftoppm', ['-r', '70', '-png', '-f', '1', '-l', '1', '/tmp/care-dark.pdf', '/tmp/care-dark']);
  const png = readFileSync('/tmp/care-dark-1.png');
  ok('the dark-mode PDF renders', png.length > 1000, png.length + ' bytes');
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
}, { width: 414, scheme: 'dark' });

console.log('\n' + R.filter(r => r.p).length + ' passed, ' + R.filter(r => !r.p).length + ' failed');
if (R.some(r => !r.p)) process.exitCode = 1;
