// QR Maker — permanent static codes, generated on-device.
import { buildPayload, qrToSvg, drawQrToCanvas } from './helpers.js';

const CONFIG = { tipUrl: '' };

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}

const TYPES = [
  ['url', 'Link'],
  ['text', 'Text'],
  ['wifi', 'WiFi'],
  ['tel', 'Phone'],
  ['email', 'Email'],
];
let type = 'url';
const fields = {};      // live field values per type
let currentQr = null;   // last successfully made qr object

function renderTypeSeg() {
  const seg = $('typeSeg');
  seg.replaceChildren();
  for (const [k, label] of TYPES) {
    seg.append(el('button', {
      type: 'button', class: k === type ? 'active' : '', role: 'tab',
      onclick: () => { type = k; renderFields(); update(); },
    }, label));
  }
}

function input(key, attrs) {
  return el('input', {
    ...attrs, value: fields[type + '.' + key] || '',
    oninput: (ev) => { fields[type + '.' + key] = ev.target.value; update(); },
  });
}

function renderFields() {
  renderTypeSeg();
  const box = $('fields');
  box.replaceChildren();
  if (type === 'url') {
    box.append(el('label', { class: 'f' }, el('span', {}, 'Web address'),
      input('url', { type: 'url', placeholder: 'skywolf.example or https://…', autocomplete: 'off' })));
  } else if (type === 'text') {
    const ta = el('textarea', { placeholder: 'Any text — a message, an address, a serial number…' });
    ta.value = fields['text.text'] || '';
    ta.addEventListener('input', (ev) => { fields['text.text'] = ev.target.value; update(); });
    box.append(el('label', { class: 'f' }, el('span', {}, 'Text'), ta));
  } else if (type === 'wifi') {
    const authSel = el('select', {
      onchange: (ev) => { fields['wifi.auth'] = ev.target.value; renderFields(); update(); } },
      el('option', { value: 'WPA', text: 'WPA / WPA2 (most networks)' }),
      el('option', { value: 'WEP', text: 'WEP (old routers)' }),
      el('option', { value: 'nopass', text: 'Open (no password)' }));
    authSel.value = fields['wifi.auth'] || 'WPA';
    box.append(
      el('label', { class: 'f' }, el('span', {}, 'Network name (SSID)'),
        input('ssid', { type: 'text', autocomplete: 'off' })),
      el('label', { class: 'f' }, el('span', {}, 'Security'), authSel));
    if ((fields['wifi.auth'] || 'WPA') !== 'nopass') {
      box.append(el('label', { class: 'f' }, el('span', {}, 'Password'),
        input('pass', { type: 'text', autocomplete: 'off' })));
    }
    box.append(el('p', { class: 'hint', text: 'Guests point their camera at the code and join — no typing, no asking twice. Stick it on the fridge or frame it for the guest room.' }));
  } else if (type === 'tel') {
    box.append(el('label', { class: 'f' }, el('span', {}, 'Phone number'),
      input('tel', { type: 'tel', placeholder: '+1 555 010 1234', autocomplete: 'off' })));
  } else if (type === 'email') {
    box.append(el('label', { class: 'f' }, el('span', {}, 'Email address'),
      input('email', { type: 'email', placeholder: 'hello@example.com', autocomplete: 'off' })));
  }
}

function currentFields() {
  return {
    url: fields['url.url'],
    text: fields['text.text'],
    ssid: fields['wifi.ssid'], pass: fields['wifi.pass'], auth: fields['wifi.auth'],
    tel: fields['tel.tel'],
    email: fields['email.email'],
  };
}

function update() {
  const payload = buildPayload(type, currentFields());
  const canvas = $('qrCanvas');
  if (!payload) {
    currentQr = null;
    const ctx = canvas.getContext('2d');
    canvas.width = 300; canvas.height = 300;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 300);
    $('emptyHint').classList.remove('hidden');
    return;
  }
  try {
    const qr = qrcode(0, $('ecLevel').value);
    qr.addData(payload);
    qr.make();
    currentQr = qr;
    drawQrToCanvas(qr, canvas, 300);
    $('emptyHint').classList.add('hidden');
  } catch (e) {
    // never leave a stale code on screen that doesn't match the inputs
    currentQr = null;
    const ctx = canvas.getContext('2d');
    canvas.width = 300; canvas.height = 300;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 300);
    $('emptyHint').classList.remove('hidden');
    toast('That’s too much data for one QR code — shorten it a little.', 4000);
  }
}

function download(href, filename) {
  const a = el('a', { href, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 300);
}

function wire() {
  $('ecLevel').addEventListener('change', update);
  $('dlPng').addEventListener('click', () => {
    if (!currentQr) { toast('Fill in the code first'); return; }
    const off = document.createElement('canvas');
    drawQrToCanvas(currentQr, off, parseInt($('pngSize').value, 10));
    download(off.toDataURL('image/png'), 'qr-code.png');
    toast('Saved — this code is yours forever');
  });
  $('dlSvg').addEventListener('click', () => {
    if (!currentQr) { toast('Fill in the code first'); return; }
    const blob = new Blob([qrToSvg(currentQr)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    download(url, 'qr-code.svg');
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('SVG saved — scales to any size, even a billboard');
  });
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  renderFields();
  update();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
