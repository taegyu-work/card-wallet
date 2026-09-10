# Card Wallet — setup & deploy

A digital business-card wallet. Photograph or upload a business card; a small
Cloudflare Worker sends the photo to Claude vision, which reads the name / title /
department / company / phones / email / address into an editable form, and the
app files it in a searchable, installable wallet with Firebase live sync.

Built following the personal-PWA pattern (Good Eats, Calorie Counter).

## Files

```
index.html                 the whole app
manifest.webmanifest       PWA metadata
sw.js                       service worker (offline shell + installable)
icon-192 / 512 / maskable-512 / apple-touch-icon / favicon-32   PNG icons (white ID-card on indigo)
.nojekyll                   serve files as-is
worker/card-wallet-ocr.js   the OCR Cloudflare Worker
worker/DEPLOY.md            how to deploy the Worker + get an Anthropic key
```

Nothing to build. Open `index.html` on a static host.

## A. Put it on GitHub Pages

1. `github.com/new` → new **public** repo `card-wallet`, no README.
2. Create `.nojekyll` (one char) so `main` exists.
3. **Add file ▸ Upload files** → drop every file in this folder → **Commit**.
4. **Settings ▸ Pages** → Deploy from a branch → `main` / `/root` → Save.
5. ~40 s later it's live at `https://taegyu-work.github.io/card-wallet/`.

That alone gives a working, installable app that saves **in that browser only**
(card fields + thumbnails in `localStorage`, full-size photos in `localStorage`
too but never leave the device).

## B. Live sync (Firebase) — already set up

Project **`card-wallet-a36af`** (console.firebase.google.com), Spark / no-cost plan.

- **Realtime Database** `us-central1`
  (`https://card-wallet-a36af-default-rtdb.firebaseio.com`), rules published:
  ```json
  { "rules": { "cardWallet": { ".read": "auth != null", ".write": "auth != null" } } }
  ```
- **Authentication** → **Anonymous** enabled, auto-clean-up on (anon accounts > 30 days deleted).
- **Storage** — *not enabled* (the free plan requires a billing account). The app
  detects this and stores a compressed (~760 px, ~40–70 KB) copy of each card
  photo **inside the Realtime Database**, so photos still sync. Fine for a few
  hundred cards within the free 1 GB. To switch to Storage later: upgrade the
  project to Blaze, enable Storage with the rule below, and new cards will upload
  there automatically (old inline photos stay put).
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /cardWallet/{allPaths=**} { allow read, write: if request.auth != null; }
    }
  }
  ```
- The web app config is already pasted into `index.html` (first `<script type="module">`).

Data lives at `cardWallet/cards` = `{ cards: [...], rev, updatedAt }`.

`DB_PATH = "cardWallet/cards"`, sync global `window.CW_SYNC`, event
`cw-sync-decided`. Payload at `cardWallet/cards` = `{ cards: [...], rev, updatedAt }`.
Full images are stripped from the synced payload; they live at
`cardWallet/cards/<id>.jpg` in Storage (or inline per-card when Storage is off).

## Updating

1. Edit files here.
2. Re-upload the changed files to the repo.
3. **Bump `var CACHE` in `sw.js`** (`card-wallet-v2`, …) or installed copies keep
   the old version.

## How the OCR works

- On capture the app POSTs the photo (JPEG, ~1500 px) to `OCR_ENDPOINT`
  (a `var` near the top of the classic `<script>` in `index.html`) —
  the deployed Worker `https://card-wallet-ocr.evertri-hr.workers.dev/`.
- The Worker (`worker/card-wallet-ocr.js`) calls the Claude API
  (`claude-haiku-4-5`) with a forced structured-output tool and returns
  `{ ok, fields: { name, title, department, company, mobile, phone, fax,
  email, website, address, notes } }`. ~$0.002–0.004 per card.
- The `ANTHROPIC_API_KEY` lives as a **Worker secret** (Cloudflare dash →
  the Worker → Settings → Variables and Secrets). CORS is locked to
  `taegyu-work.github.io` + `localhost:8731`.
- Every field is editable before you save. Set `OCR_ENDPOINT = ""` to turn
  auto-read off (capture then drops straight to a manual form).
- Full deploy/redeploy steps for the Worker: `worker/DEPLOY.md`.
- An earlier version used on-device Tesseract.js; it was too inaccurate on
  real phone photos of Korean cards and was removed.

## Install as an app

- Desktop Chrome/Edge: install icon in the address bar.
- iPhone Safari: Share ▸ Add to Home Screen.
- Android Chrome: ⋮ ▸ Install app. (Camera capture opens straight to the camera.)
