# QR Maker

Permanent QR codes, generated entirely on your device. The "free" QR generator
industry runs a bait-and-switch: make a code, print it on 500 menus, then it
stops working unless you subscribe — because they silently made it a "dynamic"
code that routes through their server. Ours encode your data directly, so they
work forever and belong to no one. A free tool by Sky Wolf Studios.

Types: link, plain text, WiFi (scan-to-join, with proper special-character
escaping), phone, email. Output: PNG (512–2048px) and infinitely scalable SVG.
Error-correction selector for codes that live on smudgy surfaces.

Vendored [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
(MIT). No backend, no analytics. Test: `node test/helpers.test.mjs` (needs
qrcode-generator resolvable; `npm i --no-save qrcode-generator`).

`CONFIG.tipUrl` in `app.js` — Stripe tip link (hidden until set).
