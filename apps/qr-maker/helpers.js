// QR maker — pure payload builders + SVG rendering. Tested in test/helpers.test.mjs.

// WiFi QR escaping per the de-facto spec: backslash-escape \ ; , : "
export function escapeWifi(s) {
  return String(s || '').replace(/([\\;,:"])/g, '\\$1');
}

export function buildPayload(type, f) {
  f = f || {};
  if (type === 'url') {
    let u = String(f.url || '').trim();
    if (!u) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = 'https://' + u;
    return u;
  }
  if (type === 'wifi') {
    const ssid = String(f.ssid || '').trim();
    if (!ssid) return '';
    const auth = f.auth === 'nopass' ? 'nopass' : (f.auth === 'WEP' ? 'WEP' : 'WPA');
    let out = 'WIFI:T:' + auth + ';S:' + escapeWifi(ssid) + ';';
    if (auth !== 'nopass') out += 'P:' + escapeWifi(f.pass || '') + ';';
    if (f.hidden) out += 'H:true;';
    return out + ';';
  }
  if (type === 'tel') {
    const n = String(f.tel || '').replace(/[^\d+]/g, '');
    return n ? 'tel:' + n : '';
  }
  if (type === 'email') {
    const to = String(f.email || '').trim();
    return to ? 'mailto:' + to : '';
  }
  return String(f.text || '');
}

/* Render a made qr object (vendored qrcode-generator API) to a standalone SVG.
   One path of module squares — crisp at any size, black on white. */
export function qrToSvg(qr, quiet = 4) {
  const n = qr.getModuleCount();
  const size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
    '<path d="' + d + '" fill="#000000"/></svg>';
}

export function drawQrToCanvas(qr, canvas, px) {
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.floor(px / (n + quiet * 2)) || 1;
  const size = cell * (n + quiet * 2);
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
