// PDF Tools core — merge/reorder/rotate/delete/split, PDFLib injected.
// Documents never leave the device; this module never touches the network.

/* order: [{ doc: index into loadedDocs, page: 0-based page index, rotate: extra degrees 0/90/180/270 }]
   loadedDocs: array of PDFDocument. Returns merged bytes. */
export async function buildOutput(PDFLib, loadedDocs, order) {
  const { PDFDocument, degrees } = PDFLib;
  const out = await PDFDocument.create();
  // group copies by source doc for efficiency, but preserve final order
  for (const item of order) {
    const src = loadedDocs[item.doc];
    if (!src || item.page < 0 || item.page >= src.getPageCount()) continue;
    const [page] = await out.copyPages(src, [item.page]);
    if (item.rotate % 360 !== 0) {
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees(((current + item.rotate) % 360 + 360) % 360));
    }
    out.addPage(page);
  }
  if (out.getPageCount() === 0) throw new Error('no pages selected');
  return out.save();
}

/* One output PDF per page of the source. */
export async function splitAll(PDFLib, srcDoc) {
  const { PDFDocument } = PDFLib;
  const outs = [];
  for (let i = 0; i < srcDoc.getPageCount(); i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(srcDoc, [i]);
    doc.addPage(page);
    outs.push(await doc.save());
  }
  return outs;
}

/* Load with a human error for the common failure modes. */
export async function loadPdf(PDFLib, bytes) {
  try {
    return await PDFLib.PDFDocument.load(bytes);
  } catch (e) {
    const msg = String((e && e.message) || '');
    if (/encrypt/i.test(msg)) {
      throw new Error('That PDF is password-protected. Remove the password first (print it to a new PDF), then load it here.');
    }
    throw new Error('That file doesn’t look like a readable PDF.');
  }
}
