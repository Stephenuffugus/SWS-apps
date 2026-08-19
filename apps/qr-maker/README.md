# QR Maker

Permanent QR codes, generated entirely on your device. The "free" QR generator
industry runs a bait-and-switch: make a code, print it on 500 menus, then it
stops working unless you subscribe, because they silently made it a "dynamic"
code that routes through their server. Ours encode your data directly, so they
work forever and belong to no one. A free tool by Sky Wolf Studio.

Types: link, plain text, WiFi (scan-to-join, with proper special-character
escaping, a hidden-network flag and an honest note about WPA3), phone (vanity
letters and extensions parsed, not stripped), email.

**The payload readout** under the preview prints the exact encoded string with
its byte count. That is the product argument made visible, no redirect host
can hide in a string you can read, and it is also where every rewrite the app
makes announces itself, at the moment it is made.

**Output.** SVG is the primary export and carries a real physical width in
millimetres. PNG sizes are named as physical objects (business card 2 cm,
table tent 4 cm, flyer 8 cm, poster 15 cm) and the app states the DPI it
actually achieves; the canvas is rounded **up** to a whole module, so the file
is never smaller than the size asked for. There is a real print path, a card
with the destination in legible text under the code, and the Wi-Fi password
suppressed unless explicitly opted in, plus batch generation from a pasted
list, giving one printed sheet and a zip of named SVGs (zip written inline; no
dependency).

**On this device.** The working draft and up to 60 kept codes live in
`localStorage['qr-maker.v1']`, with JSON export/import. A kept Wi-Fi code
includes its password, which the trust stamp says out loud.

## Encoding

`helpers.installUtf8(qrcode)` replaces the vendored `stringToBytes`, whose
default is `charCodeAt(i) & 0xff`, that emits an illegal lone `0xE9` for
`Café` and junk for anything non-Latin, inside a code that scans perfectly.
`test/qrdecode.mjs` is a real (test-only) QR decoder: it reserves the function
patterns, reads the format info for the mask, walks the zigzag and parses the
byte-mode segment, so the suite asserts on the string a scanner would read
rather than on the shape of the SVG. It is restricted to single-RS-block
symbols and refuses loudly outside them.

Vendored [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
(MIT). No backend, no analytics. Test: `node test/helpers.test.mjs` (needs
qrcode-generator resolvable; `npm i --no-save qrcode-generator`).

`CONFIG.tipUrl` in `app.js`, Stripe tip link (hidden until set).
