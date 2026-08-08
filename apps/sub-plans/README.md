# Sub Plans — substitute binder builder

Fill in your class once — schedule, routines, helpers, where things are, emergencies —
and print a clean substitute folder any time. When you're sick at 5:30am, update
"Today," hit print, or copy a link that carries the whole folder inside it and text
it to the office.

- Empty sections stay off the printed page
- Emergency info prints in a red box at the top, where a stranger will find it
- Ends with a ruled "leave me a note" box for the sub
- Free. No account. No ads. Everything stays in your browser's local storage.

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

`CONFIG.tipUrl` at the top of `app.js` — a Stripe Payment Link shows the tip-jar
button. Empty = hidden. Nothing is ever paywalled.
