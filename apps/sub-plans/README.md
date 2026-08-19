# Sub Plans, substitute binder builder

Fill in your class once, schedule, routines, helpers, where things are, emergencies, and print a clean substitute folder any time. When you're sick at 5:30am, update
"Today," hit print, or copy a link that carries the whole folder inside it and text
it to the office.

- Empty sections stay off the printed page
- Emergency info prints in a heavy black box at the top, where a stranger will find it, designed for the black-and-white copier schools actually use, not for colour
- A "your first ten minutes" block pinned to page 1: room, bathroom, WiFi and computer
  passwords (monospaced, so 1/l/I and 0/O can't be misread), office extension, the
  teacher next door
- A running header repeats the teacher, room, school, date and packet length on every
  sheet, so page 2 is never anonymous
- Live page count on the Print button, and a "read it as your sub would" preview that
  shows the real printed folder in black and white before you commit paper to it
- Ends with a substitute feedback page: checkboxes plus ruled lines, not a blank rectangle
- Free. No account. No ads. Everything stays in your browser's local storage.

## Two views

**Today** shows only the date, the plan, the backup activity and the emergency block, the sick-morning path. **The whole binder** shows all nine sections. The examples in the
empty fields switch between elementary and secondary from the picker in "The basics".

## Sharing

Copy link packs the entire folder into the URL fragment (deflate-raw, then base64url), nothing is uploaded and there is no server to upload to. Show QR draws the same link;
compression is what makes a real binder fit inside a scannable code. Printing the QR on
page 1 is off by default because a scannable code for a full binder is a ~56mm square and
costs about half a page; the checkbox is in the share panel and the page count updates
live when you tick it.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000  (the service worker needs http/localhost, not file://)
```

## Test

```bash
npm install
npm test          # jsdom smoke suite
```

## Configure (optional)

`CONFIG.tipUrl` at the top of `app.js`, a Stripe Payment Link shows the tip-jar
button. Empty = hidden. Nothing is ever paywalled.
