/**
 * Card Wallet OCR Worker
 * -------------------------------------------------------------------------
 * Cloudflare Worker that reads a business-card photo with Claude vision and
 * returns structured contact fields as JSON.
 *
 * Deploy: Cloudflare dashboard -> Workers & Pages -> Create Worker -> paste
 * this file -> Deploy. Then add the API key as a secret:
 *   Settings -> Variables and Secrets -> Add -> "Secret"
 *   Name:  ANTHROPIC_API_KEY
 *   Value: your key from console.anthropic.com  (starts sk-ant-...)
 *
 * The app calls   POST <worker-url>/   with JSON body:  { "image": "<data URL or base64>" }
 * and gets back    { ok: true, fields: { name, title, department, company,
 *                    mobile, phone, fax, email, website, address, notes } }
 * -------------------------------------------------------------------------
 */

const MODEL = "claude-haiku-4-5"; // cheap + plenty for card reading; bump to "claude-sonnet-5" for more accuracy
const MAX_IMAGE_BYTES = 3_500_000; // ~3.5 MB decoded
const ALLOWED_ORIGINS = [
  "https://taegyu-work.github.io",
  "http://localhost:8731", // local testing
];

const FIELDS = [
  "name", "title", "department", "company",
  "mobile", "phone", "fax", "email", "website", "address", "notes",
];

const CARD_TOOL = {
  name: "record_card",
  description: "Record the contact details read from the business card.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: FIELDS,
    properties: {
      name: { type: "string", description: "The person's name. If the card shows a Korean name AND a romanised/English name, use the Korean one here and put the English one in notes (or vice-versa if only English is given)." },
      title: { type: "string", description: "Job title / position only, e.g. 선임, 책임연구원, 대표이사, Director. NOT the team name. If the title appears in both Korean and English, use the Korean form and put the English form in notes." },
      department: { type: "string", description: "Team / division / department, e.g. 경영기획팀, R&D, Global Business Division." },
      company: { type: "string", description: "Company or organisation name. Prefer the full legal name if shown (e.g. 주식회사 에버트라이 / EverTri)." },
      mobile: { type: "string", description: "Mobile / cell number, kept formatted as printed (e.g. 010-4127-4339)." },
      phone: { type: "string", description: "Office / landline phone number, as printed." },
      fax: { type: "string", description: "Fax number, as printed." },
      email: { type: "string", description: "Email address, lower-cased, no 'mailto:'." },
      website: { type: "string", description: "Website URL if present (not the email domain unless the card prints it as a site)." },
      address: { type: "string", description: "Full postal address as a single line, in the original language." },
      notes: { type: "string", description: "Anything else useful and NOT captured above: English/Korean alternate name, second title, honorific, a second office, a tagline. Empty string if there is nothing." },
    },
  },
};

const PROMPT =
  "This image is a business card. Read every detail you can and call record_card with it. " +
  "The card may be Korean, English, or both. Use an empty string for any field that is not on the card — " +
  "do not guess. Keep phone/fax numbers formatted exactly as printed. If a line combines a team and a title " +
  "(e.g. '경영기획팀 | 선임'), split them into department and title.";

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "POST an image to this endpoint." }, 405, origin);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ ok: false, error: "origin not allowed" }, 403, origin);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "Worker is missing the ANTHROPIC_API_KEY secret." }, 500, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "body must be JSON" }, 400, origin);
    }

    let raw = String(payload.image || "");
    let mediaType = "image/jpeg";
    const m = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
    if (m) { mediaType = m[1].toLowerCase(); raw = m[2]; }
    raw = raw.replace(/\s/g, "");
    if (!raw) return json({ ok: false, error: "no image" }, 400, origin);
    if (raw.length * 0.75 > MAX_IMAGE_BYTES) {
      return json({ ok: false, error: "image too large" }, 413, origin);
    }
    if (mediaType === "image/jpg") mediaType = "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      return json({ ok: false, error: "unsupported image type " + mediaType }, 415, origin);
    }

    const apiBody = {
      model: MODEL,
      max_tokens: 1024,
      tools: [CARD_TOOL],
      tool_choice: { type: "tool", name: "record_card" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: raw } },
          { type: "text", text: PROMPT },
        ],
      }],
    };

    let apiRes, apiJson;
    try {
      apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(apiBody),
      });
      apiJson = await apiRes.json();
    } catch (e) {
      return json({ ok: false, error: "could not reach the model API" }, 502, origin);
    }

    if (!apiRes.ok) {
      const msg = (apiJson && apiJson.error && apiJson.error.message) || ("model API error " + apiRes.status);
      return json({ ok: false, error: msg }, 502, origin);
    }

    const block = (apiJson.content || []).find((b) => b.type === "tool_use" && b.name === "record_card");
    if (!block) {
      return json({ ok: false, error: "the model did not return card fields" }, 502, origin);
    }

    const out = {};
    for (const f of FIELDS) out[f] = typeof block.input[f] === "string" ? block.input[f].trim() : "";

    return json({
      ok: true,
      fields: out,
      usage: apiJson.usage || null,
      model: apiJson.model || MODEL,
    }, 200, origin);
  },
};
