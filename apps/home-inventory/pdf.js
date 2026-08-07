// Home inventory PDF exports — "export IS the product."
// Cover summary, then a page-per-room with a photo grid and value table,
// plus the value-descending variant adjusters actually want.
// PDFLib injected: window.PDFLib in the browser, require('pdf-lib') in tests.
import { totals, roomItems, byValueDesc, fmtCents, dataUrlToBytes } from './model.js';

export const PAGE = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
};

function safe(s) {
  return String(s || '').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”…]/g, '?');
}

async function embedPhoto(doc, dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes) return null;
  try { return await doc.embedJpg(bytes); }
  catch (e) {
    try { return await doc.embedPng(bytes); }
    catch (e2) { return null; }
  }
}

export async function makeInventoryPdf(PDFLib, inv, size = 'letter') {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const soft = rgb(0.45, 0.45, 0.5);
  const margin = 46;

  // ---- cover ----
  const t = totals(inv);
  let page = doc.addPage([w, h]);
  let y = h - margin - 30;
  const center = (txt, s, font, color, dy) => {
    page.drawText(safe(txt), { x: (w - font.widthOfTextAtSize(safe(txt), s)) / 2, y, size: s, font, color });
    y -= dy;
  };
  center(inv.name, 26, bold, ink, 34);
  center('Home inventory report', 12, sans, soft, 40);
  center(t.count + ' items · ' + t.photos + ' photographed', 14, sans, ink, 22);
  center('Documented value: ' + fmtCents(t.valueCents), 18, bold, ink, 30);
  center('Generated ' + new Date().toLocaleDateString(), 10, sans, soft, 36);
  for (const row of t.perRoom) {
    center(row.room.name + ' — ' + row.count + ' items · ' + fmtCents(row.valueCents), 11, sans, ink, 17);
  }
  y -= 12;
  center('Keep a copy of this file OFF the property: email it to yourself,', 9.5, sans, soft, 13);
  center('save it to cloud storage, or hand it to a relative.', 9.5, sans, soft, 13);

  // ---- room pages ----
  const rooms = [...inv.rooms];
  const orphans = inv.items.filter(i => !rooms.some(r => r.id === i.roomId));
  if (orphans.length) rooms.push({ id: '', name: 'Unsorted' });

  for (const room of rooms) {
    const items = room.id === '' ? orphans : roomItems(inv, room.id);
    if (items.length === 0) continue;
    page = doc.addPage([w, h]);
    y = h - margin;
    page.drawText(safe(room.name), { x: margin, y: y - 16, size: 16, font: bold, color: ink });
    const rv = items.reduce((a, i) => a + (i.valueCents || 0), 0);
    const rvTxt = items.length + ' items · ' + fmtCents(rv);
    page.drawText(rvTxt, { x: w - margin - sans.widthOfTextAtSize(rvTxt, 10), y: y - 14, size: 10, font: sans, color: soft });
    y -= 34;

    const cellW = (w - margin * 2 - 16) / 2;
    const cellH = 150;
    let col = 0;
    for (const item of items) {
      if (y - cellH < margin) { page = doc.addPage([w, h]); y = h - margin; col = 0; }
      const x = margin + col * (cellW + 16);
      const img = item.photo ? await embedPhoto(doc, item.photo) : null;
      if (img) {
        const box = { w: cellW, h: cellH - 40 };
        const scale = Math.min(box.w / img.width, box.h / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        page.drawImage(img, { x: x + (box.w - iw) / 2, y: y - 4 - ih, width: iw, height: ih });
      } else {
        page.drawRectangle({ x, y: y - 4 - (cellH - 40), width: cellW, height: cellH - 40,
          borderColor: soft, borderWidth: 0.75 });
        page.drawText('no photo', { x: x + 8, y: y - 4 - 22, size: 9, font: sans, color: soft });
      }
      let ty = y - cellH + 30;
      page.drawText(safe(item.name).slice(0, 48), { x, y: ty, size: 10.5, font: bold, color: ink });
      const detail = [item.valueCents ? fmtCents(item.valueCents) : null,
                      item.serial ? 'SN ' + item.serial : null,
                      item.purchaseDate || null].filter(Boolean).join(' · ');
      if (detail) page.drawText(safe(detail).slice(0, 60), { x, y: ty - 13, size: 8.5, font: sans, color: soft });
      col = 1 - col;
      if (col === 0) y -= cellH;
    }
  }
  return doc.save();
}

export async function makeAdjusterPdf(PDFLib, inv, size = 'letter') {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const soft = rgb(0.45, 0.45, 0.5);
  const margin = 46;

  const roomName = Object.create(null);
  for (const r of inv.rooms) roomName[r.id] = r.name;
  const t = totals(inv);

  let page = doc.addPage([w, h]);
  let y = h - margin;
  const line = (cols, { font = sans, s = 10, color = ink, gap = 15 } = {}) => {
    if (y - gap < margin) { page = doc.addPage([w, h]); y = h - margin; }
    const [name, room, serial, value] = cols;
    page.drawText(safe(name).slice(0, 52), { x: margin, y: y - s, size: s, font, color });
    page.drawText(safe(room).slice(0, 20), { x: margin + 250, y: y - s, size: s, font: sans, color: soft });
    page.drawText(safe(serial).slice(0, 18), { x: margin + 350, y: y - s, size: s, font: sans, color: soft });
    page.drawText(safe(value), { x: w - margin - sans.widthOfTextAtSize(safe(value), s), y: y - s, size: s, font, color });
    y -= gap;
  };
  page.drawText(safe(inv.name + ' — items by value'), { x: margin, y: y - 15, size: 15, font: bold, color: ink });
  y -= 24;
  page.drawText('For insurance purposes · generated ' + new Date().toLocaleDateString() +
    ' · total documented value ' + fmtCents(t.valueCents),
    { x: margin, y: y - 9, size: 9, font: sans, color: soft });
  y -= 24;
  line(['Item', 'Room', 'Serial', 'Value'], { font: bold, s: 9.5, gap: 17 });
  for (const item of byValueDesc(inv)) {
    line([item.name, roomName[item.roomId] || 'Unsorted', item.serial || '', item.valueCents ? fmtCents(item.valueCents) : '—']);
  }
  line(['', '', 'Total', fmtCents(t.valueCents)], { font: bold, gap: 18 });
  return doc.save();
}
