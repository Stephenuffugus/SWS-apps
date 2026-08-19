// Scan-to-PDF, images in, one clean PDF out. PDFLib injected for testability.
import { dataUrlToBytes, normRot } from './helpers.js';

export const PAGE = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
  fit: null,          // the sheet takes the shape of the capture
};

/* A "fit to image" sheet is scaled so its long edge is 11in, which keeps the
   printed result the same physical size as Letter instead of a random one. */
const FIT_LONG = 792;

/**
 * pages: [{ bytes | dataUrl, rot }], rot is clockwise degrees held as
 * metadata, so a rotation costs nothing and never re-encodes the photo.
 *
 * Returns { bytes, skipped, made }. When `made` is 0 there is NO document:
 * bytes is null. Handing somebody a one-page blank PDF and calling it "saved"
 * is the failure the audit caught, and it is worse than an error.
 */
export async function makePdfFromImages(PDFLib, pages, size = 'letter', margin = 18) {
  const { PDFDocument, degrees } = PDFLib;
  const box = Object.prototype.hasOwnProperty.call(PAGE, size) ? PAGE[size] : PAGE.letter;
  const fit = box === null;
  const doc = await PDFDocument.create();
  let skipped = 0, made = 0;

  for (const p of pages) {
    const bytes = p.bytes ? p.bytes : dataUrlToBytes(p.dataUrl);
    let img = null;
    if (bytes && bytes.length) {
      try { img = await doc.embedJpg(bytes); }
      catch (e) {
        try { img = await doc.embedPng(bytes); }
        catch (e2) { img = null; }
      }
    }
    if (!img) { skipped++; continue; }

    /* Natural size as the user sees it after their rotations. */
    const rot = normRot(p.rot);
    const turned = rot === 90 || rot === 270;
    const natW = turned ? img.height : img.width;
    const natH = turned ? img.width : img.height;

    let pw, ph, m;
    if (fit) {
      const s = FIT_LONG / Math.max(natW, natH);
      pw = natW * s; ph = natH * s; m = 0;
    } else {
      /* A portrait sheet for a portrait scan and a landscape sheet for a
         landscape one. Pinning the box to portrait drew a 2000x933 capture at
         32% of the paper. */
      const landscape = natW > natH;
      pw = landscape ? box.h : box.w;
      ph = landscape ? box.w : box.h;
      m = margin;
    }

    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - m * 2) / natW, (ph - m * 2) / natH);
    const dw = natW * scale, dh = natH * scale;              // footprint on the sheet
    const iw = img.width * scale, ih = img.height * scale;   // the image's own box
    const X = (pw - dw) / 2, Y = (ph - dh) / 2;

    /* pdf-lib turns anticlockwise about (x, y); our rot is clockwise, and the
       pivot is a corner, so the anchor moves with the quarter turn. */
    const deg = (360 - rot) % 360;
    const at = deg === 90 ? { x: X + dw, y: Y }
      : deg === 180 ? { x: X + dw, y: Y + dh }
        : deg === 270 ? { x: X, y: Y + dh }
          : { x: X, y: Y };

    page.drawImage(img, { x: at.x, y: at.y, width: iw, height: ih, rotate: degrees(deg) });
    made++;
  }

  if (made === 0) return { bytes: null, skipped, made: 0 };
  return { bytes: await doc.save(), skipped, made };
}
