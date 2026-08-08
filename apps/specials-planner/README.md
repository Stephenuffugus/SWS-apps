# Specials Planner — a lesson planner for specials teachers

Set up your schedule once — year dates, teaching days, periods, where lunch falls, your A/B/C rotation — and every week of the school year is generated for you: dates filled in, rotation letters correct, lunch in the right column. Then just type in the boxes.

Built for teachers who teach the same lesson to many classes (art, music, PE, library):

- **Fill whole day / Fill all A-days** — write a lesson once, copy it everywhere it repeats with one tap
- **No-class days** — mark a work day or break; the rotation letter skips it so the cycle stays true all year
- **Print** a clean landscape week for a sub binder
- **Export CSV** that opens straight in Google Sheets
- **Backup & restore** — your plans live on your device; download a backup file anytime
- Optional **Google Drive** save/load and works offline as an installable app

Free. No account. No ads.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000  (the service worker needs http/localhost, not file://)
```

## Deploy

Push to a GitHub repo → Settings → Pages → Deploy from branch → `main` / root. Live in about a minute.

## Test

```bash
npm install
npm test          # 52-assertion jsdom regression harness
```

## Configure (optional)

Top of the `<script>` in `index.html`:

- `CLIENT_ID` — Google OAuth Web Client ID enables Drive save/load (`drive.file` scope)
- `TIP_URL` — Stripe Payment Link shows a quiet tip-jar link in Setup

Both empty = features hidden. Nothing is ever paywalled.
