// Home inventory PDF exports — "export IS the product."
// Cover summary, then a page-per-room with a photo grid and value table,
// plus the value-descending variant adjusters actually want.
// PDFLib injected: window.PDFLib in the browser, require('pdf-lib') in tests.
import { totals, roomItems, byValueDesc, fmtCents, dataUrlToBytes } from './model.js';

export const PAGE = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
};

/* ── Text that survives Helvetica ────────────────────────────────────────
   The two standard PDF faces are WinAnsi-encoded: they can draw Latin-1 and
   nothing else. The old code replaced everything outside that range with '?',
   so 'Łukasz's Gdańsk decanter' printed as '?ukasz's Gda?sk decanter' — the
   app quietly corrupting the names of exactly the heirlooms that most need
   describing, in the one file that goes to the insurer.

   Embedding a Unicode face would need fontkit and a CJK-capable font; neither
   can be vendored into an offline app of this size. So instead we do the
   honest thing: transliterate everything that CAN be carried into Latin
   (Polish, Czech, Turkish, Baltic, Cyrillic, Greek, the euro sign), and
   REPORT what cannot — on the cover of the PDF itself and in the app before
   you export, naming the affected entries. Nothing is corrupted in silence,
   and the CSV, the .json backup and the screen always keep the original. */

/* Exactly what WinAnsi (CP1252) can draw — verified against pdf-lib, which
   throws rather than substituting. It is wider than Latin-1: the euro sign,
   the curly quotes, the dashes and Œ Š Ž all encode fine, and the old code
   was turning '€1,200' into '?1,200' for no reason at all. */
const KEEP = /[\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;

const EXTRA = {
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'Ŀ': 'L', 'ŀ': 'l',
  'İ': 'I', 'ı': 'i', 'Ŋ': 'N', 'ŋ': 'n', 'Ə': 'E', 'ə': 'e',
  'Ɖ': 'D', 'Ŧ': 'T', 'ŧ': 't', 'ẞ': 'SS',
  '₤': 'GBP ', '₹': 'INR ', '₽': 'RUB ', '₺': 'TRY ', '₴': 'UAH ', '¥': 'JPY ',
  ' ': ' ', ' ': ' ', ' ': ' ', '­': '-',
};

const CYR = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ґ': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'є': 'ye',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh',
  'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e',
  'ю': 'yu', 'я': 'ya',
};

const GRK = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th', 'ι': 'i',
  'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's',
  'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
};

function mapChar(ch, depth) {
  if (KEEP.test(ch)) return ch;
  if (EXTRA[ch] !== undefined) return EXTRA[ch];
  const lower = ch.toLowerCase();
  const table = CYR[lower] !== undefined ? CYR : (GRK[lower] !== undefined ? GRK : null);
  if (table) {
    const t = table[lower];
    if (ch === lower || !t) return t;
    return t.length > 1 ? t[0].toUpperCase() + t.slice(1) : t.toUpperCase();
  }
  // ą → a, ń → n, ř → r, ş → s: strip the combining marks the letter decomposes to,
  // then map what is left (ά → α → a) rather than giving up one step early.
  const d = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (d && d !== ch && (depth || 0) < 2) {
    let out = '';
    for (const c of d) {
      const m = mapChar(c, (depth || 0) + 1);
      if (m === null) return null;
      out += m;
    }
    return out;
  }
  return null; // genuinely unprintable in this font: CJK, emoji, Hebrew, Arabic
}

/**
 * Convert one string for drawing.
 * @returns {{text:string, lost:number}} lost = characters that had to become '?'
 */
export function pdfText(s) {
  const src = String(s === null || s === undefined ? '' : s);
  let out = '', lost = 0;
  for (const ch of src) {
    const m = mapChar(ch);
    if (m === null) { out += '?'; lost++; }
    else out += m;
  }
  return { text: out, lost };
}

/** Every field in the inventory that the PDF cannot print exactly. */
export function unprintable(inv) {
  const hits = [];
  const check = (label, value) => {
    const r = pdfText(value);
    if (r.lost) hits.push({ label, original: String(value), asPrinted: r.text });
  };
  check('Inventory name', inv.name || '');
  for (const r of (inv.rooms || [])) if (r && typeof r === 'object') check('Room', r.name || '');
  for (const i of (inv.items || [])) {
    if (!i || typeof i !== 'object') continue;
    check('Item', i.name || '');
    if (i.serial) check('Serial', i.serial);
    if (i.brand) check('Brand', i.brand);
  }
  return hits;
}

const safe = (s) => pdfText(s).text;

/* Truncate by MEASURED width — a caps-heavy 48-character name is far wider
   than a lowercase one, and slicing by character count is what drew an item
   caption 178pt past the edge of the paper. */
function fit(txt, font, size, maxW) {
  let t = safe(txt);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
  return t + '…';
}

/* Wrap to at most `maxLines`, ellipsising the last one. Used by the cover
   title, which is an address by the app's own suggestion and therefore long. */
function wrapLines(txt, font, size, maxW, maxLines) {
  const words = safe(txt).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? cur + ' ' + word : word;
    if (font.widthOfTextAtSize(next, size) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = word; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (!lines.length) return [''];
  const last = lines.length - 1;
  if (font.widthOfTextAtSize(lines[last], size) > maxW) lines[last] = fit(lines[last], font, size, maxW);
  return lines;
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

const qtyOf = (i) => (Number(i.quantity) >= 1 ? Math.round(Number(i.quantity)) : 1);
const lineValue = (i) => (i.valueCents || 0) * qtyOf(i);

export async function makeInventoryPdf(PDFLib, inv, size = 'letter') {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const { w, h } = PAGE[size] || PAGE.letter;
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const soft = rgb(0.45, 0.45, 0.5);
  const margin = 46;
  const textW = w - margin * 2;

  // ---- cover (paginates: a 40-room house must not run off the page) ----
  const t = totals(inv);
  let page = doc.addPage([w, h]);
  let y = h - margin - 30;
  const center = (txt, s, font, color, dy) => {
    if (y - dy < margin) { page = doc.addPage([w, h]); y = h - margin; }
    const str = fit(txt, font, s, textW);
    page.drawText(str, { x: (w - font.widthOfTextAtSize(str, s)) / 2, y, size: s, font, color });
    y -= dy;
  };
  for (const l of wrapLines(inv.name, bold, 26, textW, 2)) center(l, 26, bold, ink, 32);
  y -= 4;
  center('Home inventory report', 12, sans, soft, 40);
  center(t.count + ' entries · ' + t.units + ' items · ' + t.photos + ' photographed', 14, sans, ink, 22);
  center('Documented value: ' + fmtCents(t.valueCents), 18, bold, ink, 30);
  center('Generated ' + new Date().toLocaleDateString(), 10, sans, soft, 36);
  for (const row of t.perRoom) {
    const count = row.count + ' items · ' + fmtCents(row.valueCents);
    center(fit(row.room.name, sans, 11, textW - sans.widthOfTextAtSize(' — ' + count, 11)) + ' — ' + count, 11, sans, ink, 17);
  }
  y -= 12;
  center('Keep a copy of this file OFF the property: email it to yourself,', 9.5, sans, soft, 13);
  center('save it to cloud storage, or hand it to a relative.', 9.5, sans, soft, 13);

  const lost = unprintable(inv);
  if (lost.length) {
    y -= 8;
    center(lost.length + ' name' + (lost.length === 1 ? '' : 's') + ' contain characters this PDF font cannot draw', 9, sans, soft, 12);
    center('(shown as “?”). The CSV and the .json backup keep them exactly as typed.', 9, sans, soft, 12);
  }

  // ---- room pages ----
  const rooms = (inv.rooms || []).filter(r => r && typeof r === 'object').slice();
  const items0 = (inv.items || []).filter(i => i && typeof i === 'object');
  const orphans = items0.filter(i => !rooms.some(r => r.id === i.roomId));
  if (orphans.length) rooms.push({ id: '', name: 'Unsorted' });

  for (const room of rooms) {
    const items = room.id === '' ? orphans : roomItems(inv, room.id);
    if (items.length === 0) continue;
    page = doc.addPage([w, h]);
    y = h - margin;
    const rv = items.reduce((a, i) => a + lineValue(i), 0);
    const rvTxt = items.length + ' items · ' + fmtCents(rv);
    const rvW = sans.widthOfTextAtSize(rvTxt, 10);
    page.drawText(fit(room.name, bold, 16, textW - rvW - 14), { x: margin, y: y - 16, size: 16, font: bold, color: ink });
    page.drawText(rvTxt, { x: w - margin - rvW, y: y - 14, size: 10, font: sans, color: soft });
    y -= 34;

    const cellW = (w - margin * 2 - 16) / 2;
    const cellH = 150;
    let col = 0;
    for (const item of items) {
      if (y - cellH < margin) { page = doc.addPage([w, h]); y = h - margin; col = 0; }
      const x = margin + col * (cellW + 16);
      const img = item.photo ? await embedPhoto(doc, item.photo) : null;
      if (img) {
        const box = { w: cellW, h: cellH - 44 };
        const scale = Math.min(box.w / img.width, box.h / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        page.drawImage(img, { x: x + (box.w - iw) / 2, y: y - 4 - ih, width: iw, height: ih });
      } else {
        page.drawRectangle({ x, y: y - 4 - (cellH - 44), width: cellW, height: cellH - 44,
          borderColor: soft, borderWidth: 0.75 });
        page.drawText('photo not taken', { x: x + 8, y: y - 4 - 22, size: 9, font: sans, color: soft });
      }
      const ty = y - cellH + 24;
      const qty = qtyOf(item);
      const title = (qty > 1 ? qty + ' × ' : '') + (item.name || '');
      page.drawText(fit(title, bold, 10.5, cellW), { x, y: ty, size: 10.5, font: bold, color: ink });
      const detail = [lineValue(item) ? fmtCents(lineValue(item)) : null,
                      item.condition || null,
                      item.serial ? 'SN ' + item.serial : null,
                      item.purchaseDate || null].filter(Boolean).join(' · ');
      if (detail) page.drawText(fit(detail, sans, 8.5, cellW), { x, y: ty - 12, size: 8.5, font: sans, color: soft });
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
  const textW = w - margin * 2;

  const roomName = Object.create(null);
  for (const r of (inv.rooms || [])) if (r && typeof r === 'object') roomName[r.id] = r.name;
  const t = totals(inv);

  let page = doc.addPage([w, h]);
  let y = h - margin;

  // column geometry, measured from the right so the money always fits
  const xQty = margin;
  const xName = margin + 26;
  const wName = textW - 26 - 200;
  const xRoom = xName + wName + 8;
  const xSerial = xRoom + 92;
  const rightVal = w - margin;

  const line = (cols, { font = sans, s = 10, color = ink, gap = 15 } = {}) => {
    if (y - gap < margin) { page = doc.addPage([w, h]); y = h - margin; }
    const [qty, name, room, serial, value] = cols;
    page.drawText(fit(qty, sans, s, 24), { x: xQty, y: y - s, size: s, font: sans, color: soft });
    page.drawText(fit(name, font, s, wName), { x: xName, y: y - s, size: s, font, color });
    page.drawText(fit(room, sans, s, 88), { x: xRoom, y: y - s, size: s, font: sans, color: soft });
    page.drawText(fit(serial, sans, s, 66), { x: xSerial, y: y - s, size: s, font: sans, color: soft });
    const v = safe(value);
    page.drawText(v, { x: rightVal - sans.widthOfTextAtSize(v, s), y: y - s, size: s, font, color });
    y -= gap;
  };

  for (const l of wrapLines(inv.name + ' — items by value', bold, 15, textW, 2)) {
    page.drawText(l, { x: margin, y: y - 15, size: 15, font: bold, color: ink });
    y -= 19;
  }
  y -= 5;
  page.drawText(fit('For insurance purposes · generated ' + new Date().toLocaleDateString() +
    ' · total documented value ' + fmtCents(t.valueCents), sans, 9, textW),
    { x: margin, y: y - 9, size: 9, font: sans, color: soft });
  y -= 24;
  line(['Qty', 'Item', 'Room', 'Serial', 'Value'], { font: bold, s: 9.5, gap: 17 });
  for (const item of byValueDesc(inv)) {
    line([String(qtyOf(item)), item.name, roomName[item.roomId] || 'Unsorted',
      item.serial || '', lineValue(item) ? fmtCents(lineValue(item), { pad: true }) : '—']);
  }
  line(['', '', '', 'Total', fmtCents(t.valueCents, { pad: true })], { font: bold, gap: 18 });

  const lost = unprintable(inv);
  if (lost.length) {
    y -= 6;
    page.drawText(fit(lost.length + ' name(s) contain characters this PDF font cannot draw and appear as “?”. The CSV keeps them exactly.', sans, 8, textW),
      { x: margin, y: y - 8, size: 8, font: sans, color: soft });
  }
  return doc.save();
}
