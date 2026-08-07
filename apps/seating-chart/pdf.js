// The three print outputs. "The PDF is the entire product" — vector text,
// explicit page sizes and margins, Letter and A4, embedded standard fonts.
// PDFLib is injected (window.PDFLib in the browser, require('pdf-lib') in tests).
import { lastNameOf, occupancy, mealSummary } from './model.js';

export const PAGE = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
};

// Standard-14 fonts use WinAnsi encoding; strip anything it can't express.
function safe(s) {
  return String(s || '').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”…]/g, '?');
}

function attending(project) {
  return project.guests.filter(g => g.rsvp !== 'no');
}

/* ---------- 1. entrance display — big, pretty, by table ---------- */

export async function makeEntrancePdf(PDFLib, project, size = 'letter') {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifIt = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.13, 0.15, 0.18);
  const soft = rgb(0.45, 0.48, 0.52);

  const margin = 54, colGap = 30;
  const colW = (w - margin * 2 - colGap) / 2;
  const occ = occupancy(project);
  const tables = [...project.tables];

  // shrink-to-fit: long titles/names must never clip the page or bleed columns
  const fitSize = (font, text, startSize, maxW, minSize = 7) => {
    let s = startSize;
    while (s > minSize && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
    return s;
  };

  let page = null, col = 0, y = 0, first = true;
  const newPage = () => {
    page = doc.addPage([w, h]);
    let top = h - margin;
    if (first) {
      const title = safe(project.name);
      const ts = fitSize(serifIt, title, 28, w - margin * 2, 14);
      page.drawText(title, { x: (w - serifIt.widthOfTextAtSize(title, ts)) / 2, y: top - ts, size: ts, font: serifIt, color: ink });
      const sub = 'Please find your seat';
      const ss = 12;
      page.drawText(sub, { x: (w - serif.widthOfTextAtSize(sub, ss)) / 2, y: top - ts - 22, size: ss, font: serif, color: soft });
      top -= 28 + 48;
      first = false;
    }
    col = 0;
    y = top;
    return top;
  };
  let colTop = newPage();

  const ensure = (need) => {
    if (y - need < margin) {
      if (col === 0) { col = 1; y = colTop; }
      else { colTop = newPage(); }
    }
  };

  for (const t of tables) {
    const guests = (occ[t.id] || []).filter(g => g.rsvp !== 'no')
      .sort((a, b) => a.name.localeCompare(b.name));
    if (guests.length === 0) continue;
    const blockH = 20 + guests.length * 15 + 14;
    ensure(Math.min(blockH, 200));
    const x = margin + col * (colW + colGap);
    const tl = safe(t.label);
    page.drawText(tl, { x, y: y - 14, size: fitSize(serifBold, tl, 14, colW), font: serifBold, color: ink });
    y -= 22;
    for (const g of guests) {
      ensure(15);
      const gx = margin + col * (colW + colGap);
      const gn = safe(g.name);
      page.drawText(gn, { x: gx + 6, y: y - 11, size: fitSize(serif, gn, 11.5, colW - 8), font: serif, color: ink });
      y -= 15;
    }
    y -= 14;
  }
  return doc.save();
}

/* ---------- 2. escort cards — alphabetical, cut-line grid ---------- */

export async function makeEscortCardsPdf(PDFLib, project, size = 'letter') {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifIt = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.13, 0.15, 0.18);
  const soft = rgb(0.55, 0.58, 0.62);

  const tableLabel = Object.create(null);
  for (const t of project.tables) tableLabel[t.id] = t.label;
  const guests = attending(project)
    .filter(g => project.assignments[g.id])
    .sort((a, b) => lastNameOf(a.name).localeCompare(lastNameOf(b.name)) || a.name.localeCompare(b.name));

  const cols = 2, rows = 5;
  const margin = 36;
  const cardW = (w - margin * 2) / cols;
  const cardH = (h - margin * 2) / rows;
  const perPage = cols * rows;

  for (let i = 0; i < guests.length; i += perPage) {
    const page = doc.addPage([w, h]);
    // dashed cut lines
    for (let c = 0; c <= cols; c++) {
      const x = margin + c * cardW;
      page.drawLine({ start: { x, y: margin }, end: { x, y: h - margin }, thickness: 0.5, color: soft, dashArray: [4, 4] });
    }
    for (let r = 0; r <= rows; r++) {
      const y = margin + r * cardH;
      page.drawLine({ start: { x: margin, y }, end: { x: w - margin, y }, thickness: 0.5, color: soft, dashArray: [4, 4] });
    }
    const batch = guests.slice(i, i + perPage);
    batch.forEach((g, j) => {
      const c = j % cols, r = Math.floor(j / cols);
      const cx = margin + c * cardW + cardW / 2;
      const cy = h - margin - r * cardH - cardH / 2;
      const name = safe(g.name);
      let ns = 15;
      while (serif.widthOfTextAtSize(name, ns) > cardW - 30 && ns > 8) ns -= 0.5;
      page.drawText(name, { x: cx - serif.widthOfTextAtSize(name, ns) / 2, y: cy + 4, size: ns, font: serif, color: ink });
      const tbl = safe(tableLabel[project.assignments[g.id]] || '');
      const ts = 10.5;
      page.drawText(tbl, { x: cx - serifIt.widthOfTextAtSize(tbl, ts) / 2, y: cy - 14, size: ts, font: serifIt, color: soft });
    });
  }
  if (guests.length === 0) doc.addPage([w, h]);
  return doc.save();
}

/* ---------- 3. caterer's sheet — the one nobody does well ---------- */

export async function makeCatererPdf(PDFLib, project, size = 'letter') {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const soft = rgb(0.45, 0.45, 0.5);

  const margin = 46;
  let page = doc.addPage([w, h]);
  let y = h - margin;
  const line = (txt, { size: s = 10.5, font = sans, color = ink, x = margin, gap = 15 } = {}) => {
    if (y - gap < margin) { page = doc.addPage([w, h]); y = h - margin; }
    page.drawText(safe(txt), { x, y: y - s, size: s, font, color });
    y -= gap;
  };

  line(project.name + ' — kitchen & service sheet', { size: 15, font: sansBold, gap: 22 });
  const today = new Date();
  line('Generated ' + today.toLocaleDateString() + ' · counts include only guests not marked as declined', { size: 8.5, color: soft, gap: 18 });

  const { perTable, totals, total } = mealSummary(project);

  for (const { table, guests, meals } of perTable) {
    if (guests.length === 0) continue;
    line(table.label + '  ·  ' + guests.length + (guests.length === 1 ? ' guest' : ' guests'), { size: 12, font: sansBold, gap: 19 });
    for (const g of [...guests].sort((a, b) => a.name.localeCompare(b.name))) {
      const flags = (g.tags || []).join(', ');
      line('   ' + g.name + ' — ' + (g.meal || 'Unspecified') + (flags ? '   ⚠ ' + flags : ''), { gap: 14 });
    }
    const counts = Object.entries(meals).map(([m, n]) => m + ' ×' + n).join('   ');
    line('   ' + counts, { size: 9, color: soft, gap: 18 });
  }

  line(' ', { gap: 10 });
  line('Totals', { size: 13, font: sansBold, gap: 19 });
  for (const [m, n] of Object.entries(totals)) line('   ' + m + ' — ' + n, { gap: 14 });
  line('   All meals — ' + total, { font: sansBold, gap: 16 });

  const flagged = attending(project).filter(g => (g.tags || []).length > 0);
  if (flagged.length) {
    line(' ', { gap: 8 });
    line('Dietary flags & allergies', { size: 13, font: sansBold, gap: 19 });
    const tableLabelById = Object.create(null);
    for (const t of project.tables) tableLabelById[t.id] = t.label;
    for (const g of flagged) {
      const where = tableLabelById[project.assignments[g.id]] || 'unseated';
      line('   ' + g.name + ' (' + where + ') — ' + g.tags.join(', '), { gap: 14 });
    }
  }
  return doc.save();
}
