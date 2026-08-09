// QR maker — pure payload builders + SVG rendering. Tested in test/helpers.test.mjs.

/* ── UTF-8 ────────────────────────────────────────────────────────────────
   vendor-qrcode.js ships `stringToBytes` as `bytes.push(charCodeAt(i) & 0xff)`,
   which turns 'Café' into an illegal lone 0xE9 and '日本語' into junk — a
   perfectly valid, perfectly scannable code containing the wrong string. Every
   byte the app encodes goes through here instead. app.js installs it on the
   vendor object before the first encode; the tests use it directly. */
const enc = new TextEncoder();
export function utf8Bytes(s) {
  return Array.from(enc.encode(s == null ? '' : String(s)));
}
export function byteLen(s) {
  return enc.encode(s == null ? '' : String(s)).length;
}
/** The one line that stops a person's own name being replaced on a printed
    object. Called by app.js before the first encode, and by the tests. */
export function installUtf8(qrcode) {
  qrcode.stringToBytes = utf8Bytes;
  return qrcode;
}

/* Byte-mode capacity of the largest QR code (version 40) at each error
   correction level. These are the numbers the app must say out loud: a cap
   that only announces itself by wiping the canvas is the defect. */
export const CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };
export const EC_LABEL = { L: 'Light', M: 'Standard', Q: 'High', H: 'Maximum' };

// WiFi QR escaping per the de-facto spec: backslash-escape \ ; , : "
export function escapeWifi(s) {
  return String(s || '').replace(/([\\;,:"])/g, '\\$1');
}

/* ── Phone numbers ────────────────────────────────────────────────────────
   The old rule was `replace(/[^\d+]/g, '')`, which silently turned
   '1-800-FLOWERS' into tel:1800 and '555.010.1234 x22' into tel:555010123422 —
   an extension welded onto the number, dialling a stranger. Both scanned
   perfectly. This parses instead of stripping, and reports every change. */
const KEYPAD = { a:2,b:2,c:2, d:3,e:3,f:3, g:4,h:4,i:4, j:5,k:5,l:5,
                 m:6,n:6,o:6, p:7,q:7,r:7,s:7, t:8,u:8,v:8, w:9,x:9,y:9,z:9 };

export function parseTel(raw) {
  const notes = [];
  const src = String(raw == null ? '' : raw).trim();
  if (!src) return { number: '', ext: '', notes, problem: '' };

  let s = src;
  let ext = '';
  // ' x22', ' ext. 22', ',22', ';22' at the very end — an extension, not digits
  // to dial. RFC 3966 spells it ;ext=.
  const m = s.match(/\s*(?:[,;]|(?:x|ext|extn|extension)\.?)\s*(\d{1,8})\s*$/i);
  if (m) { ext = m[1]; s = s.slice(0, m.index).trim(); }

  if (/[a-z]/i.test(s)) {
    // A vanity number is digits first, then letters: 1-800-FLOWERS. Anything
    // that starts with letters is prose, and prose is not a phone number.
    const lead = s.match(/^\+?\s*(\d[\d\s().-]*)/);
    const leadDigits = lead ? lead[1].replace(/\D/g, '') : '';
    if (leadDigits.length < 2) {
      return { number: '', ext: '', notes,
        problem: '“' + src + '” is not a phone number. Letters only work in a vanity number that starts with digits, like 1-800-FLOWERS.' };
    }
    const letters = s.match(/[a-z]+/gi).join('');
    s = s.replace(/[a-z]/gi, (ch) => String(KEYPAD[ch.toLowerCase()] || ''));
    notes.push({ level: 'info', text: 'Letters dialled as keypad digits: ' + letters.toUpperCase() +
      ' → ' + letters.replace(/[a-z]/gi, (ch) => String(KEYPAD[ch.toLowerCase()] || '')) + '.' });
  }

  const plus = /^\s*\+/.test(s);
  const digits = s.replace(/\D/g, '');
  if (digits.length < 3) {
    return { number: '', ext: '', notes,
      problem: 'A phone number needs at least 3 digits — “' + src + '” has ' + digits.length + '.' };
  }
  const number = (plus ? '+' : '') + digits;
  if (ext) {
    notes.push({ level: 'info', text: 'Extension ' + ext + ' encoded as ;ext=' + ext +
      ' — the phone dials ' + number + ' first, then the extension. It is not part of the number.' });
  }
  if (!plus && digits.length > 7) {
    notes.push({ level: 'warn', text: 'No country code. A phone abroad cannot dial ' + number +
      ' — start with + and the country code (+1, +44, +61…) if this code will travel.' });
  }
  return { number, ext, notes, problem: '' };
}

/* ── Payloads ─────────────────────────────────────────────────────────────
   Returns { payload, problem, notes }. `notes` is every rewrite the app made
   to what the user typed, so the readout under the preview can show them.
   `problem` means no code at all, and says why — the old code returned '' and
   left the canvas blank with no explanation. */
export function buildPayloadInfo(type, f) {
  f = f || {};
  const notes = [];
  const ok = (payload) => ({ payload: payload || '', problem: '', notes });
  const no = (problem) => ({ payload: '', problem: problem || '', notes });

  if (type === 'url') {
    const raw = String(f.url || '');
    const u0 = raw.trim();
    if (!u0) return ok('');
    let u = u0;
    // Only recognized link schemes pass through untouched. Everything else —
    // including "example.com:8080/menu" (a colon is NOT a scheme here) and
    // javascript:/data: payloads (neutralized) — gets https:// prepended.
    if (!/^(https?|mailto|tel|sms|ftp|geo):/i.test(u)) {
      const scheme = (u.match(/^([a-z][a-z0-9+.-]*):(?![\d/])/i) || [])[1];
      u = 'https://' + u;
      if (scheme) {
        notes.push({ level: 'warn', text: '“' + scheme + ':” is not something a phone camera will open, so it was left as ordinary text behind https://. The code opens ' + u + ', which will not go anywhere.' });
      } else {
        notes.push({ level: 'info', text: 'https:// added — the code opens ' + u + '.' });
      }
    }
    if (u0 !== raw) notes.push({ level: 'info', text: 'Spaces at the start or end were removed.' });
    if (/\s/.test(u)) notes.push({ level: 'warn', text: 'This address has a space inside it. Most phones will refuse to open it.' });
    return ok(u);
  }

  if (type === 'wifi') {
    const rawSsid = String(f.ssid || '');
    const ssid = rawSsid.trim();
    if (!ssid) return ok('');
    if (ssid !== rawSsid) {
      notes.push({ level: 'warn', text: 'Spaces at the start or end of the network name were removed. Wi-Fi names are exact — if yours really ends in a space, this code will not connect.' });
    }
    const auth = f.auth === 'nopass' ? 'nopass' : (f.auth === 'WEP' ? 'WEP' : 'WPA');
    const pass = String(f.pass || '');
    let out = 'WIFI:T:' + auth + ';S:' + escapeWifi(ssid) + ';';
    if (auth !== 'nopass') out += 'P:' + escapeWifi(pass) + ';';
    if (f.hidden) out += 'H:true;';
    out += ';';
    if (auth !== 'nopass' && !pass) {
      notes.push({ level: 'warn', text: 'No password typed. With ' + auth + ' selected the code says the password is empty (P:;), and the phone will refuse to join. Type the password, or choose “Open (no password)”.' });
    }
    if (f.hidden) {
      notes.push({ level: 'info', text: 'Marked hidden (H:true) — required when the router does not broadcast the name.' });
    }
    if (escapeWifi(ssid) !== ssid || escapeWifi(pass) !== pass) {
      notes.push({ level: 'info', text: 'Backslashes added in front of ; : , and " — that is how the Wi-Fi card format quotes them, and the phone takes them back out.' });
    }
    return ok(out);
  }

  if (type === 'tel') {
    const r = parseTel(f.tel);
    for (const n of r.notes) notes.push(n);
    if (r.problem) return no(r.problem);
    if (!r.number) return ok('');
    return ok('tel:' + r.number + (r.ext ? ';ext=' + r.ext : ''));
  }

  if (type === 'email') {
    const raw = String(f.email || '');
    const to = raw.trim();
    if (!to) return ok('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return no('“' + to + '” is not an email address, so no code was made. A scan would have opened a blank message addressed to nobody. Check for a missing @ or a typo.');
    }
    if (to !== raw) notes.push({ level: 'info', text: 'Spaces at the start or end were removed.' });
    return ok('mailto:' + to);
  }

  return ok(String(f.text || ''));
}

/** Back-compatible thin wrapper: the string only. */
export function buildPayload(type, f) {
  return buildPayloadInfo(type, f).payload;
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

/* Render a made qr object (vendored qrcode-generator API) to a standalone SVG.
   One path of module squares — crisp at any size, black on white.
   opts.mm stamps a real physical width on the file, so a print shop opening it
   gets the size we promised rather than 96 DPI of nothing. */
export function qrToSvg(qr, opts) {
  opts = (typeof opts === 'number') ? { quiet: opts } : (opts || {});
  const quiet = opts.quiet == null ? 4 : opts.quiet;
  const n = qr.getModuleCount();
  const size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    }
  }
  const dim = opts.mm ? ' width="' + opts.mm + 'mm" height="' + opts.mm + 'mm"' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg"' + dim + ' viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
    '<path d="' + d + '" fill="#000000"/></svg>';
}

/* The exported PNG has to be a whole number of modules per side or the squares
   come out uneven, so the pixel count is always rounded to a whole cell. It
   used to round DOWN, which is why '2048 px' shipped 1947 px files — short by
   up to 31%, worst exactly when the code is densest. Rounding up keeps the
   promise; `fit` rounds down and is only for the on-screen preview, which has
   a box it must not overflow. */
export function qrPixelSize(moduleCount, px, fit) {
  const total = moduleCount + 8;
  const cell = fit
    ? Math.max(1, Math.floor(px / total))
    : Math.max(1, Math.ceil(px / total));
  return { cell, px: cell * total, total };
}

export function drawQrToCanvas(qr, canvas, px, fit) {
  const n = qr.getModuleCount();
  const quiet = 4;
  const { cell, px: size } = qrPixelSize(n, px, fit);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  return size;
}

/* ── Physical sizing ─────────────────────────────────────────────────────
   'Bea's print shop asked for 300dpi at final size and the app cannot answer.'
   It can now: every size is a real object at a real width, and the app states
   the DPI it actually achieved and how wide one module lands on paper. Below
   about 0.4 mm a module stops scanning reliably on a phone camera. */
export const SIZES = [
  { id: 'card',   mm: 20,  dpi: 600, label: 'Business card — 2 cm' },
  { id: 'tent',   mm: 40,  dpi: 600, label: 'Table tent — 4 cm' },
  { id: 'flyer',  mm: 80,  dpi: 400, label: 'Flyer or sign — 8 cm' },
  { id: 'poster', mm: 150, dpi: 300, label: 'Poster — 15 cm' },
];

export function sizeById(id) {
  return SIZES.find((s) => s.id === id) || SIZES[1];
}

/** What a given preset actually produces for a code of `moduleCount` modules. */
export function sizePlan(size, moduleCount) {
  const target = Math.round((size.mm / 25.4) * size.dpi);
  const { cell, px, total } = qrPixelSize(moduleCount, target, false);
  const dpi = Math.round(px / (size.mm / 25.4));
  const moduleMm = size.mm / total;
  return { mm: size.mm, target, cell, px, dpi, total, moduleMm };
}

/** A filename that means something, from the thing the code points at. */
export function slugFor(type, f, payload) {
  f = f || {};
  let base = '';
  if (type === 'url') {
    const u = String(f.url || payload || '');
    base = (u.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0]) || 'link';
  } else if (type === 'wifi') {
    base = 'wifi-' + String(f.ssid || '');
  } else if (type === 'tel') {
    base = 'tel-' + String(payload || '').replace(/^tel:/, '');
  } else if (type === 'email') {
    base = String(f.email || '').replace('@', '-at-');
  } else {
    base = String(f.text || payload || '').split(/\s+/).slice(0, 5).join(' ');
  }
  const slug = base.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'qr-code';
}
