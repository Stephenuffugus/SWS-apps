// PDF Tools core — merge/reorder/rotate/delete/split, PDFLib injected.
// Documents never leave the device; this module never touches the network.

/* Errors the user is meant to read are tagged. Anything untagged is a bug in
   our code or a browser limit, and app.js shows its own sentence for those —
   a raw exception string ("Cannot read properties of undefined (reading
   'Pages')") is not an error message, it is an apology in the wrong language. */
export function humanError(msg) {
  const e = new Error(msg);
  e.human = true;
  return e;
}
export function isHuman(e) {
  return !!(e && e.human);
}

export const CANCELLED = 'sws-split-cancelled';

/* ── Sizes ─────────────────────────────────────────────────────────────── */

export function formatBytes(n) {
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1000) return n + ' B';
  const units = ['kB', 'MB', 'GB', 'TB'];
  let v = n / 1000, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
}

/* ── Merge / reorder / rotate ──────────────────────────────────────────── */

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
  if (valid.length === 0) throw humanError('no pages selected');
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

/* buildOutput silently drops any row that points past the end of its source.
   That is the right behaviour for the writer and the wrong behaviour for the
   user, who is entitled to know a page went missing. Ask first, then build. */
export function planOutput(loadedDocs, order) {
  const keep = [];
  const dropped = [];
  order.forEach((it, i) => {
    const d = loadedDocs[it.doc];
    if (d && it.page >= 0 && it.page < d.getPageCount()) keep.push(i);
    else dropped.push(i);
  });
  return { keep, dropped };
}

/* The angle a page will actually come out at: whatever the source PDF already
   carried, plus whatever the user added. Showing only the user's delta lies on
   exactly the files people bring here — a scan already at /Rotate 90. */
export function finalAngle(sourceAngle, added) {
  return ((((sourceAngle || 0) + (added || 0)) % 360) + 360) % 360;
}

/* ── Splitting, over the ASSEMBLED ORDER ───────────────────────────────── */
/* Everything below works on `order` — the rows visible on screen — never on
   the source document. A page the user deleted is gone; a rotation the user
   applied is carried, because the same buildOutput path writes every file. */

export const SPLIT_MODES = [
  { id: 'each', label: 'One file per page' },
  { id: 'every', label: 'A new file every N pages', spec: 'N', placeholder: '5' },
  { id: 'at', label: 'Start a new file at page…', spec: 'pages', placeholder: '4, 9' },
  { id: 'ranges', label: 'One file per range', spec: 'ranges', placeholder: '1-3, 4, 5-12' },
  { id: 'extract', label: 'Extract these pages as one file', spec: 'ranges', placeholder: '2-4' },
];

/* "1-3, 5, 8-10" → [[0,2],[4,4],[7,9]] (0-based, inclusive). Throws a human
   error naming the real limits — a range past the end must say how far the
   document actually goes, not just refuse. */
export function parseRanges(text, total) {
  const src = String(text == null ? '' : text).trim();
  if (!src) throw humanError('Type the pages you want, like 1-3, 5, 8-10.');
  const out = [];
  for (const rawPart of src.split(/[,;]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const m = /^(\d+)(?:\s*(?:-|–|—|–|to)\s*(\d+))?$/i.exec(part);
    if (!m) throw humanError('“' + part + '” is not a page or a range. Use numbers like 1-3, 5, 8-10.');
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < 1) {
      throw humanError('There is no page 0 — pages here are numbered 1 to ' + total + '.');
    }
    if (a > total || b > total) {
      throw humanError('Page ' + Math.max(a, b) + ' does not exist. This list is ' + total +
        ' page' + (total === 1 ? '' : 's') + ' long, so the highest you can ask for is ' + total + '.');
    }
    out.push(a <= b ? [a - 1, b - 1] : [b - 1, a - 1]);
  }
  if (out.length === 0) throw humanError('Type the pages you want, like 1-3, 5, 8-10.');
  return out;
}

export function parsePositions(text, total) {
  const ranges = parseRanges(text, total);
  const set = new Set();
  for (const [a, b] of ranges) for (let i = a; i <= b; i++) set.add(i);
  return [...set].sort((x, y) => x - y);
}

/* → array of groups; each group is a list of indices into `order`.
   Throws a human error rather than producing something surprising. */
export function splitGroups(orderLength, mode, spec) {
  const total = orderLength;
  if (total === 0) throw humanError('There are no pages to split. Add a PDF first.');

  if (mode === 'each') {
    return Array.from({ length: total }, (_, i) => [i]);
  }

  if (mode === 'every') {
    const n = Number(String(spec == null ? '' : spec).trim());
    if (!Number.isInteger(n) || n < 1) {
      throw humanError('Type how many pages go in each file — a whole number, 1 or more.');
    }
    if (n >= total) {
      throw humanError('Every ' + n + ' pages would be one file, because the list is only ' +
        total + ' page' + (total === 1 ? '' : 's') + ' long. Use a number below ' + total + '.');
    }
    const groups = [];
    for (let i = 0; i < total; i += n) {
      groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
    }
    return groups;
  }

  if (mode === 'at') {
    const cuts = parsePositions(spec, total).filter(p => p > 0);
    if (cuts.length === 0) {
      throw humanError('Page 1 is already the start of the first file. Name a later page, like 4.');
    }
    const bounds = [0, ...cuts, total];
    const groups = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      if (b > a) groups.push(Array.from({ length: b - a }, (_, k) => a + k));
    }
    return groups;
  }

  if (mode === 'ranges') {
    return parseRanges(spec, total)
      .map(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k));
  }

  if (mode === 'extract') {
    return [parsePositions(spec, total)];
  }

  throw humanError('Unknown split mode.');
}

/* Human, stable, unique filenames — and the same function the UI previews
   with, so what it shows is what lands in Downloads. */
export function splitNames(base, groups) {
  const clean = String(base || 'pages').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pages';
  const used = new Set();
  return groups.map((g, gi) => {
    const first = g[0] + 1;
    const last = g[g.length - 1] + 1;
    const contiguous = g.every((v, k) => v === g[0] + k);
    let stem;
    if (g.length === 1) stem = clean + '-p' + first;
    else if (contiguous) stem = clean + '-p' + first + '-' + last;
    else stem = clean + '-part' + (gi + 1);
    let name = stem + '.pdf';
    let n = 2;
    while (used.has(name.toLowerCase())) { name = stem + '-' + n + '.pdf'; n++; }
    used.add(name.toLowerCase());
    return name;
  });
}

/* Build one PDF per group, through buildOutput, so deletions and rotations
   are carried exactly as the merge path carries them.
   onProgress(done, total) may await — that is how the UI gets a paint and how
   Cancel gets a chance to be clicked. */
export async function buildSplit(PDFLib, loadedDocs, order, groups, onProgress, isCancelled) {
  const outs = [];
  for (let i = 0; i < groups.length; i++) {
    if (isCancelled && isCancelled()) {
      const e = new Error(CANCELLED);
      e.cancelled = true;
      throw e;
    }
    const sub = groups[i].map(k => order[k]).filter(Boolean);
    outs.push(await buildOutput(PDFLib, loadedDocs, sub));
    if (onProgress) await onProgress(i + 1, groups.length);
  }
  return outs;
}

/* ── ZIP (stored, no compression) ──────────────────────────────────────── */
/* PDFs are already compressed, so deflate would buy a few percent for a large
   dependency. Storing needs ~80 lines and no dependency at all, and it removes
   the browser's "allow multiple downloads?" prompt plus the 70-second drip of
   200 separate saves that the stress run measured. */

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

export function crc32(bytes) {
  const t = crcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ t[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosStamp(d) {
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date: date & 0xFFFF, time: time & 0xFFFF };
}

/* The one hard limit in this app, and it says its own name at the moment it
   bites rather than producing a corrupt archive. */
export const ZIP_MAX_BYTES = 4 * 1000 * 1000 * 1000 - 1;

/** files: [{ name, bytes: Uint8Array }] → Uint8Array of a stored .zip */
export function zipStore(files, now) {
  const enc = new TextEncoder();
  const stamp = dosStamp(now || new Date());
  const entries = files.map(f => {
    const nameBytes = enc.encode(f.name);
    return { nameBytes, bytes: f.bytes, crc: crc32(f.bytes) };
  });

  let total = 0;
  for (const e of entries) total += 30 + e.nameBytes.length + e.bytes.length + 46 + e.nameBytes.length;
  total += 22;
  if (total > ZIP_MAX_BYTES) {
    throw humanError('These pages add up to ' + formatBytes(total) +
      ', and a plain .zip cannot go past ' + formatBytes(ZIP_MAX_BYTES) +
      '. Choose “Separate downloads” instead, or split into fewer files at a time.');
  }

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  let off = 0;
  const u16 = (v) => { view.setUint16(off, v, true); off += 2; };
  const u32 = (v) => { view.setUint32(off, v >>> 0, true); off += 4; };
  const raw = (b) => { buf.set(b, off); off += b.length; };

  for (const e of entries) {
    e.offset = off;
    u32(0x04034b50);
    u16(20);            // version needed
    u16(0x0800);        // UTF-8 filename
    u16(0);             // stored
    u16(stamp.time); u16(stamp.date);
    u32(e.crc);
    u32(e.bytes.length); u32(e.bytes.length);
    u16(e.nameBytes.length); u16(0);
    raw(e.nameBytes);
    raw(e.bytes);
  }

  const cdStart = off;
  for (const e of entries) {
    u32(0x02014b50);
    u16(20); u16(20);
    u16(0x0800);
    u16(0);
    u16(stamp.time); u16(stamp.date);
    u32(e.crc);
    u32(e.bytes.length); u32(e.bytes.length);
    u16(e.nameBytes.length); u16(0); u16(0);
    u16(0); u16(0);
    u32(0);
    u32(e.offset);
    raw(e.nameBytes);
  }
  const cdSize = off - cdStart;

  u32(0x06054b50);
  u16(0); u16(0);
  u16(entries.length); u16(entries.length);
  u32(cdSize); u32(cdStart);
  u16(0);

  return buf;
}

/* ── Loading ───────────────────────────────────────────────────────────── */

/* Load with a human error for the common failure modes. getPageCount() is
   called HERE, inside the guard: a truncated PDF loads fine and then throws
   from the first page-tree read, which used to escape as a raw exception. */
export async function loadPdf(PDFLib, bytes) {
  let doc;
  try {
    doc = await PDFLib.PDFDocument.load(bytes);
  } catch (e) {
    const msg = String((e && e.message) || '');
    if (/encrypt/i.test(msg)) {
      throw humanError('That PDF is password-protected. Remove the password first (open it, print it to a new PDF), then load it here.');
    }
    throw humanError('That file doesn’t look like a readable PDF.');
  }
  let count;
  try {
    count = doc.getPageCount();
  } catch {
    throw humanError('That PDF is damaged — its page list could not be read. Try re-downloading or re-exporting it.');
  }
  if (!count) throw humanError('That PDF has no pages in it.');
  return doc;
}

/* Every page's rotation as the source file already carries it, so the UI can
   show the angle a page will come out at rather than the user's delta. */
export function sourceAngles(doc) {
  const out = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    let a = 0;
    try { a = doc.getPage(i).getRotation().angle || 0; } catch { a = 0; }
    out.push(((a % 360) + 360) % 360);
  }
  return out;
}
