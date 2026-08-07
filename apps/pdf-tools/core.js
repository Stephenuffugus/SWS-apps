// PDF Tools core — merge/reorder/rotate/delete/split, PDFLib injected.
// Documents never leave the device; this module never touches the network.

/* order: [{ doc: index into loadedDocs, page: 0-based page index, rotate: extra degrees 0/90/180/270 }]
   loadedDocs: array of PDFDocument. Returns merged bytes.
   Pages are copied in ONE copyPages call per source document — per-page calls
   each create a fresh copier and re-embed shared fonts/images, bloating a
   100-page letterhead PDF by ~100×. */
export async function buildOutput(PDFLib, loadedDocs, order) {
  const { PDFDocument, degrees } = PDFLib;
  const out = await PDFDocument.create();
  const valid = order.filter(it =>
    loadedDocs[it.doc] && it.page >= 0 && it.page < loadedDocs[it.doc].getPageCount());
  if (valid.length === 0) throw new Error('no pages selected');
  const byDoc = new Map();
  valid.forEach((it, i) => {
    if (!byDoc.has(it.doc)) byDoc.set(it.doc, []);
    byDoc.get(it.doc).push({ i, page: it.page, rotate: it.rotate });
  });
  const placed = new Array(valid.length);
  for (const [docIdx, entries] of byDoc) {
    const pages = await out.copyPages(loadedDocs[docIdx], entries.map(e => e.page));
    entries.forEach((e, j) => { placed[e.i] = { page: pages[j], rotate: e.rotate }; });
  }
  for (const { page, rotate } of placed) {
    if (rotate % 360 !== 0) {
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees(((current + rotate) % 360 + 360) % 360));
    }
    out.addPage(page);
  }
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
