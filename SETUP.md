# Card Wallet — setup & deploy

A digital business-card wallet. Photograph or upload a business card; the app
reads the text on-device (Tesseract.js OCR, Korean + English), guesses the
name / title / company / phone / email / address into an editable form, and
files it in a searchable, installable wallet. Optional Firebase live sync keeps
every device in step.

Built following the personal-PWA pattern (Good Eats, Calorie Counter).

## Files

```
index.html                 the whole app
manifest.webmanifest       PWA metadata
sw.js                       service worker (offline shell + installable)
icon-192 / 512 / maskable-512 / apple-touch-icon / favicon-32   PNG icons (white ID-card on indigo)
.nojekyll                   serve files as-is
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

## B. Turn on live sync (Firebase — optional)

Sync shares the wallet across your devices and anyone with the link.

1. **Realtime Database** — create a project (Analytics + Gemini off) → Realtime
   Database, `us-central1`, locked mode. Rules:
   ```json
   { "rules": { "cardWallet": { ".read": "auth != null", ".write": "auth != null" } } }
   ```
2. **Authentication** → enable **Anonymous** (+ auto-clean-up).
3. **Storage** (optional, for full-res card photos) → get started → rules:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /cardWallet/{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
   If Storage isn't available on the free plan, skip it — the app automatically
   falls back to storing a compressed (~1000 px) copy of each card **inside the
   Realtime Database** so photos still sync. A few hundred cards is well within
   the free 1 GB.
4. **Project settings ▸ Your apps ▸ Web** → register an app → copy the
   `firebaseConfig` object into the `const CONFIG = { }` block near the bottom of
   `index.html` (first `<script type="module">`). Re-upload `index.html`.

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

- `tesseract.js@5` loads from jsDelivr; the Korean + English language data
  (~15 MB) downloads once and the browser caches it.
- `parseCard(text)` in `index.html` is a heuristic splitter (regex for email,
  phone/fax, URL, Korean/English job titles, company suffixes, address tokens).
  It will get things wrong on busy layouts — every field is editable before you
  save, and "Show raw scanned text" reveals exactly what the engine saw.
- Runs fully on-device. No image or text is sent anywhere unless Firebase sync
  is configured.

## Install as an app

- Desktop Chrome/Edge: install icon in the address bar.
- iPhone Safari: Share ▸ Add to Home Screen.
- Android Chrome: ⋮ ▸ Install app. (Camera capture opens straight to the camera.)
