/**
 * TITI GOLD — enquiry handler (platform-agnostic)
 * ------------------------------------------------------------------
 * Takes a standard Web `Request` and returns a `Response`, so the same code
 * runs on Vercel (api/enquiry.js), the local dev server (scripts/dev-server.js)
 * and any other host that speaks Request/Response (Netlify, Cloudflare, Deno…).
 *
 * Delivery channels switch on automatically when their settings exist:
 *
 *   Email (Resend)     RESEND_API_KEY + ENQUIRY_FROM_EMAIL + ENQUIRY_TO_EMAIL
 *   Database (Supabase) SUPABASE_URL + SUPABASE_SECRET_KEY
 *
 * If no channel is configured the handler answers 503 "not_configured" and
 * the website tells the visitor plainly that the enquiry was NOT sent.
 * An enquiry is only reported as received when at least one channel succeeds.
 */
import { BUSINESSES, validateEnquiry, isoToday } from "../assets/js/enquiry-schema.js";

const MAX_BODY_BYTES = 24 * 1024;
const MIN_FILL_MS = 2000;                 // faster than this = almost certainly a bot
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const OUTBOUND_TIMEOUT_MS = 10000;

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const clean = (v) => (typeof v === "string" ? v.trim() : "");

/** Recipient list for a business: ENQUIRY_TO_EMAIL_<KEY> overrides ENQUIRY_TO_EMAIL. */
function recipientsFor(env, businessKey) {
  const specific = clean(env[`ENQUIRY_TO_EMAIL_${businessKey.toUpperCase()}`]);
  const raw = specific || clean(env.ENQUIRY_TO_EMAIL);
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function configuredChannels(env = {}) {
  const channels = [];
  if (clean(env.RESEND_API_KEY) && clean(env.ENQUIRY_FROM_EMAIL) && clean(env.ENQUIRY_TO_EMAIL)) {
    channels.push("email");
  }
  const supabaseKey = clean(env.SUPABASE_SECRET_KEY) || clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (clean(env.SUPABASE_URL) && supabaseKey) channels.push("database");
  return channels;
}

/* ------------------------------------------------------------------ */
/* Rate limiting (best effort, per server instance)                    */
/* ------------------------------------------------------------------ */

const hits = new Map();

export function resetRateLimit() { hits.clear(); }

function rateLimited(key, now) {
  if (!key) return false;
  const windowStart = now - RATE_LIMIT.windowMs;
  const list = (hits.get(key) || []).filter((t) => t > windowStart);
  if (list.length >= RATE_LIMIT.max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) { // keep memory bounded
    for (const [k, v] of hits) if (!v.some((t) => t > windowStart)) hits.delete(k);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const oneLine = (s, max = 120) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, max);

function makeReference(now) {
  const d = new Date(now);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const rand = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `TG-${ymd}-${rand}`;
}

/** Earliest allowed event date: yesterday (UTC) to tolerate visitors' time zones. */
function minEventDate(now) {
  return isoToday(new Date(now - 36 * 60 * 60 * 1000));
}

function clientIp(request) {
  const h = request.headers;
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || h.get("cf-connecting-ip") || "").trim();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

/** Result page for visitors whose browsers submitted the form without JavaScript. */
function htmlPage(status, title, paragraphs) {
  const body = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)} | TITI GOLD</title><link rel="stylesheet" href="/assets/css/styles.css"></head>
<body><main class="section"><div class="container" style="max-width:640px">
<p class="eyebrow">TITI GOLD</p><h1 style="font-size:clamp(2.2rem,6vw,3.4rem);margin:12px 0 24px">${escapeHtml(title)}</h1>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
<p style="margin-top:28px"><a class="btn" href="/#enquire">Back to the enquiry form</a></p>
</div></main></body></html>`;
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function readBody(request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return { error: "too_large" };

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { error: "too_large" };

  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(text || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "bad_json" };
      return { data: parsed, html: false };
    } catch { return { error: "bad_json" }; }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return { data: Object.fromEntries(new URLSearchParams(text)), html: true };
  }
  return { error: "unsupported_type" };
}

/* ------------------------------------------------------------------ */
/* Delivery channels                                                   */
/* ------------------------------------------------------------------ */

const FIELD_ROWS = [
  ["enquiryType", "Enquiry type"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["eventDate", "Preferred date"],
  ["budget", "Budget"],
  ["guests", "Guests"],
  ["organisation", "Organisation"],
  ["product", "Product"],
  ["quantity", "Quantity / size"],
  ["location", "Location"],
];

function buildNotificationEmail(data, reference) {
  const cfg = BUSINESSES[data.business];
  const rows = FIELD_ROWS.filter(([k]) => data[k]);
  const subject = oneLine(`New enquiry · ${cfg.shortName} · ${data.enquiryType} · ${data.name} [${reference}]`, 200);

  const text = [
    `New enquiry for ${cfg.name}`,
    `Reference: ${reference}`,
    "",
    ...rows.map(([k, label]) => `${label}: ${data[k]}`),
    "",
    "Message:",
    data.message,
    "",
    "Reply to this email to respond to the enquirer directly.",
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#faf7f0;font-family:Helvetica,Arial,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e4dccb">
<tr><td style="background:#151515;padding:22px 28px;color:#c6a04a;font-family:Georgia,serif;font-size:20px;letter-spacing:4px">TITI GOLD</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#85651f">New enquiry · ${escapeHtml(reference)}</p>
<h1 style="margin:0 0 22px;font-family:Georgia,serif;font-weight:normal;font-size:24px">${escapeHtml(cfg.name)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee6d6;font-size:14px">
${rows.map(([k, label]) => `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #eee6d6;color:#645f56;width:38%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #eee6d6;vertical-align:top">${escapeHtml(data[k])}</td></tr>`).join("")}
</table>
<p style="margin:22px 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#85651f">Message</p>
<div style="white-space:pre-wrap;font-size:15px;line-height:1.6">${escapeHtml(data.message)}</div>
<p style="margin:26px 0 0;font-size:12px;color:#645f56">Reply to this email to respond to ${escapeHtml(data.name)} directly.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

function buildConfirmationEmail(data, reference) {
  const cfg = BUSINESSES[data.business];
  const first = data.name.split(" ")[0];
  const subject = `Your enquiry to ${cfg.name}`;
  const text = `Dear ${first},\n\nThank you for contacting ${cfg.name}. We've received your enquiry (reference ${reference}) and will be in touch soon.\n\nWarm regards,\nTITI GOLD`;
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#faf7f0;font-family:Helvetica,Arial,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e4dccb">
<tr><td style="background:#151515;padding:22px 28px;color:#c6a04a;font-family:Georgia,serif;font-size:20px;letter-spacing:4px">TITI GOLD</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.65">
<p>Dear ${escapeHtml(first)},</p>
<p>Thank you for contacting <strong>${escapeHtml(cfg.name)}</strong>. We've received your enquiry and will be in touch soon.</p>
<p style="color:#645f56;font-size:13px">Your reference: ${escapeHtml(reference)}</p>
<p>Warm regards,<br>TITI GOLD</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function sendResendEmail(env, fetchImpl, message) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clean(env.RESEND_API_KEY)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
  return res.json().catch(() => ({}));
}

async function deliverByEmail(env, fetchImpl, data, reference) {
  const to = recipientsFor(env, data.business);
  const { subject, text, html } = buildNotificationEmail(data, reference);
  await sendResendEmail(env, fetchImpl, {
    from: clean(env.ENQUIRY_FROM_EMAIL),
    to,
    reply_to: data.email,
    subject,
    text,
    html,
    tags: [{ name: "business", value: data.business }],
  });
}

async function sendConfirmation(env, fetchImpl, data, reference) {
  const { subject, text, html } = buildConfirmationEmail(data, reference);
  const replyTo = recipientsFor(env, data.business)[0];
  await sendResendEmail(env, fetchImpl, {
    from: clean(env.ENQUIRY_FROM_EMAIL),
    to: [data.email],
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject,
    text,
    html,
  });
}

async function deliverToDatabase(env, fetchImpl, data, reference, meta) {
  const key = clean(env.SUPABASE_SECRET_KEY) || clean(env.SUPABASE_SERVICE_ROLE_KEY);
  const base = clean(env.SUPABASE_URL).replace(/\/+$/, "");
  const table = clean(env.SUPABASE_TABLE) || "enquiries";

  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  // Legacy JWT service_role keys also go in Authorization; new sb_secret_ keys only need `apikey`.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  const row = {
    reference,
    business: data.business,
    business_name: data.businessName,
    enquiry_type: data.enquiryType,
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    event_date: data.eventDate || null,
    budget: data.budget || null,
    guests: data.guests || null,
    organisation: data.organisation || null,
    location: data.location || null,
    product: data.product || null,
    quantity: data.quantity || null,
    message: data.message,
    consent: true,
    source: meta.source || null,
    user_agent: meta.userAgent ? meta.userAgent.slice(0, 400) : null,
  };

  const res = await fetchImpl(`${base}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Supabase responded ${res.status}: ${detail}`);
  }
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {Request} request
 * @param {object} [options]
 * @param {Record<string,string|undefined>} [options.env]  defaults to process.env
 * @param {typeof fetch} [options.fetch]                   injectable for tests
 * @param {number} [options.now]
 * @param {Array<{name:string, deliver:Function}>} [options.extraChannels] e.g. local file storage in dev
 */
export async function handleEnquiryRequest(request, options = {}) {
  const env = options.env ?? (typeof process !== "undefined" ? process.env : {});
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now();
  const extraChannels = options.extraChannels ?? [];

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" }, { Allow: "POST, OPTIONS" });

  // Optional origin allow-list, e.g. ALLOWED_ORIGINS="https://titigold.com,https://www.titigold.com"
  const allowed = clean(env.ALLOWED_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  if (allowed.length && origin && !allowed.includes(origin)) {
    return json(403, { ok: false, code: "forbidden_origin" });
  }

  const parsed = await readBody(request);
  if (parsed.error) {
    const status = parsed.error === "too_large" ? 413 : parsed.error === "unsupported_type" ? 415 : 400;
    return json(status, { ok: false, code: parsed.error });
  }
  const { data: raw, html } = parsed;

  // Spam traps: pretend success so bots learn nothing, but deliver nothing.
  const startedAt = Number(raw.startedAt);
  const tooFast = Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < MIN_FILL_MS;
  if (clean(raw.website) || tooFast) {
    return html
      ? htmlPage(200, "Thank you", ["Your enquiry has been received."])
      : json(200, { ok: true, reference: null });
  }

  if (rateLimited(clientIp(request), now)) {
    return html
      ? htmlPage(429, "Please try again later", ["We've received several enquiries from your connection in a short time."])
      : json(429, { ok: false, code: "rate_limited" }, { "Retry-After": "600" });
  }

  const result = validateEnquiry(raw, { minDate: minEventDate(now) });
  if (!result.ok) {
    return html
      ? htmlPage(422, "Please check your enquiry", [...Object.values(result.errors), "Use your browser's back button to return to the form. Your answers should still be there."])
      : json(422, { ok: false, code: "invalid", errors: result.errors });
  }
  const data = result.data;

  const channels = configuredChannels(env);
  if (!channels.length && !extraChannels.length) {
    return html
      ? htmlPage(503, "Online enquiries aren't switched on yet", ["Your enquiry has not been sent. Please contact TITI GOLD directly, or try again soon."])
      : json(503, { ok: false, code: "not_configured" });
  }

  const reference = makeReference(now);
  const meta = { source: request.headers.get("referer"), userAgent: request.headers.get("user-agent") };

  const jobs = [];
  if (channels.includes("email")) jobs.push(["email", () => deliverByEmail(env, fetchImpl, data, reference)]);
  if (channels.includes("database")) jobs.push(["database", () => deliverToDatabase(env, fetchImpl, data, reference, meta)]);
  for (const ch of extraChannels) jobs.push([ch.name, () => ch.deliver({ ...data, reference, receivedAt: new Date(now).toISOString() })]);

  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  const delivered = [];
  settled.forEach((r, i) => {
    const name = jobs[i][0];
    if (r.status === "fulfilled") delivered.push(name);
    else console.error(`[enquiry ${reference}] ${name} delivery failed:`, r.reason?.message || r.reason);
  });

  if (!delivered.length) {
    return html
      ? htmlPage(502, "We couldn't send your enquiry", ["Something went wrong on our side. Please try again in a moment, or contact TITI GOLD directly."])
      : json(502, { ok: false, code: "delivery_failed" });
  }

  // Optional acknowledgement to the enquirer. Never affects the result.
  if (channels.includes("email") && clean(env.ENQUIRY_SEND_CONFIRMATION).toLowerCase() === "true") {
    try { await sendConfirmation(env, fetchImpl, data, reference); }
    catch (err) { console.error(`[enquiry ${reference}] confirmation email failed:`, err.message); }
  }

  return html
    ? htmlPage(200, "Enquiry received", [`Thank you, ${data.name.split(" ")[0]}. Your enquiry has reached ${data.businessName}.`, `Your reference is ${reference}.`])
    : json(200, { ok: true, reference, delivered });
}
