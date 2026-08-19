/* ═══════════════════════════════════════════════════════════════════════════
   A store-only ZIP writer, ~100 lines, no dependency.

   WHY STORE-ONLY (method 0, no deflate)
   The payload is JPEG/WebP/PNG, already entropy-coded. Deflating it buys
   fractions of a percent and would cost a compressor we would have to vendor.
   A ZIP is not being used here to make things smaller; it is being used so the
   browser performs ONE download instead of fifty.

   WHY A ZIP AT ALL
   The old path fired N `<a download>` clicks 350 ms apart: 17.6 s for fifty
   files, and the app had to ask the user to grant Chrome's bulk-download
   permission, the single worst thing a free file tool can ask a stranger for.
   Safari drops queued downloads outright, so an iPad batch mostly failed.
   ═══════════════════════════════════════════════════════════════════════════ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, seed = 0) {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time. ZIP has stored time this way since 1989 and still does. */
export function dosTime(date) {
  const d = date || new Date();
  const y = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function w16(a, o, v) { a[o] = v & 0xff; a[o + 1] = (v >>> 8) & 0xff; }
function w32(a, o, v) { w16(a, o, v & 0xffff); w16(a, o + 2, (v >>> 16) & 0xffff); }

/** ZIP64 starts at 4 GiB; above that we hand the caller a clear refusal. */
export const ZIP_LIMIT = 0xfffffffe;

/**
 * makeZip([{ name, blob }]) -> Blob
 * Names must already be unique (see helpers.uniqueNames).
 * `onProgress(done, total)` fires per entry so a 50-file batch can show itself.
 */
export async function makeZip(entries, onProgress) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const stamp = dosTime(new Date());

  for (let i = 0; i < entries.length; i++) {
    const { name, blob } = entries[i];
    const nameBytes = enc.encode(name);
    const data = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    w32(local, 0, 0x04034b50);
    w16(local, 4, 20);            // version needed
    w16(local, 6, 0x0800);        // UTF-8 names
    w16(local, 8, 0);             // method: stored
    w16(local, 10, stamp.time);
    w16(local, 12, stamp.date);
    w32(local, 14, crc);
    w32(local, 18, data.length);
    w32(local, 22, data.length);
    w16(local, 26, nameBytes.length);
    w16(local, 28, 0);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    w32(cd, 0, 0x02014b50);
    w16(cd, 4, 20);               // version made by
    w16(cd, 6, 20);               // version needed
    w16(cd, 8, 0x0800);
    w16(cd, 10, 0);
    w16(cd, 12, stamp.time);
    w16(cd, 14, stamp.date);
    w32(cd, 16, crc);
    w32(cd, 20, data.length);
    w32(cd, 24, data.length);
    w16(cd, 28, nameBytes.length);
    w32(cd, 42, offset);
    cd.set(nameBytes, 46);

    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
    if (offset > ZIP_LIMIT) throw new Error('ZIP_TOO_LARGE');
    if (onProgress) onProgress(i + 1, entries.length);
    // Yield so a 50-file zip does not freeze the tab between entries.
    if ((i & 3) === 3) await new Promise((r) => setTimeout(r, 0));
  }

  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  w32(eocd, 0, 0x06054b50);
  w16(eocd, 8, entries.length);
  w16(eocd, 10, entries.length);
  w32(eocd, 12, cdSize);
  w32(eocd, 16, offset);

  return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
}
