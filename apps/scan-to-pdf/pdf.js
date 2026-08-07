// Scan-to-PDF — images in, one clean PDF out. PDFLib injected for testability.
import { dataUrlToBytes } from './helpers.js';

export const PAGE = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
};

/* pages: [{ dataUrl }] — rotation is applied at capture time via canvas,
   so embedding stays simple and testable. Returns { bytes, skipped }. */
export async function makePdfFromImages(PDFLib, pages, size = 'letter', margin = 18) {
  const { PDFDocument } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  let skipped = 0;
  for (const p of pages) {
    const bytes = dataUrlToBytes(p.dataUrl);
    let img = null;
    if (bytes) {
      try { img = await doc.embedJpg(bytes); }
      catch (e) {
        try { img = await doc.embedPng(bytes); }
        catch (e2) { img = null; }
      }
    }
    if (!img) { skipped++; continue; }
    const page = doc.addPage([w, h]);
    const boxW = w - margin * 2, boxH = h - margin * 2;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    page.drawImage(img, { x: (w - iw) / 2, y: (h - ih) / 2, width: iw, height: ih });
  }
  if (doc.getPageCount() === 0) doc.addPage([w, h]);
  return { bytes: await doc.save(), skipped };
}
