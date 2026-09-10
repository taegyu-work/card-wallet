# Deploying the Card Wallet OCR Worker

The app reads business cards by POSTing the photo to a small Cloudflare Worker
that calls the Claude API. You need two things: an Anthropic API key, and the
Worker deployed with that key as a secret.

## 1. Get an Anthropic API key

1. https://console.anthropic.com → **Settings → API keys → Create Key**
   (name it e.g. `card-wallet`). Copy it — it starts `sk-ant-...`.
2. **Billing → add credit** (minimum $5). Card reading costs roughly
   **$0.002 per card** on the default model (`claude-haiku-4-5`), so $5 is
   thousands of cards.
3. Optional but recommended: **Billing → Usage limits → set a monthly cap**
   (e.g. $5) so a runaway can't cost more than that.

## 2. Deploy the Worker (Cloudflare dashboard)

1. https://dash.cloudflare.com → **Workers & Pages → Create → Create Worker**.
2. Name it **`card-wallet-ocr`** → Deploy (the placeholder code).
3. **Edit code** → delete everything → paste the entire contents of
   `card-wallet-ocr.js` (this folder) → **Deploy**.
4. **Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Name: **`ANTHROPIC_API_KEY`**
   - Value: the `sk-ant-...` key from step 1
   - Save / Deploy.
5. Copy the Worker URL — it looks like
   `https://card-wallet-ocr.<your-subdomain>.workers.dev`.

## 3. Point the app at it

In `index.html`, set:

```js
var OCR_ENDPOINT = "https://card-wallet-ocr.<your-subdomain>.workers.dev/";
```

(keep the trailing slash), then re-upload `index.html` to the repo and bump
`CACHE` in `sw.js`.

## Notes

- The Worker only accepts requests from `https://taegyu-work.github.io` (and
  `localhost:8731` for testing). To allow another origin, edit `ALLOWED_ORIGINS`.
- Model is `claude-haiku-4-5`. For harder cards, change `MODEL` to
  `claude-sonnet-5` (~5× the cost, still fractions of a cent).
- No image or card data is stored by the Worker — it proxies one request and
  returns the fields.
- If you ever see abuse (unexpected Anthropic spend), the fastest fixes are:
  rotate the key, or add a Cloudflare **Rate limiting rule** on the Worker
  (Workers & Pages → your worker → Settings → free tier allows a basic rule).
