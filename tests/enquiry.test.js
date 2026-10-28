import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { validateEnquiry, BUSINESSES } from "../assets/js/enquiry-schema.js";
import { handleEnquiryRequest, configuredChannels, resetRateLimit } from "../server/enquiry-handler.js";

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

const valid = (over = {}) => ({
  business: "events",
  enquiryType: "Corporate event",
  name: "Ada Obi",
  email: "Ada@Example.com",
  phone: "+234 801 234 5678",
  eventDate: "2026-12-12",
  budget: "To be discussed",
  location: "Lagos",
  message: "We would love help planning our end-of-year dinner.",
  consent: true,
  startedAt: String(NOW - 60_000),
  ...over,
});

const post = (body, { type = "application/json", headers = {} } = {}) => new Request("http://localhost/api/enquiry", {
  method: "POST",
  headers: { "content-type": type, "x-real-ip": "203.0.113.9", ...headers },
  body: type === "application/json" ? JSON.stringify(body) : new URLSearchParams(body).toString(),
});

function fakeFetch() {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

const EMAIL_ENV = { RESEND_API_KEY: "re_test", ENQUIRY_FROM_EMAIL: "TITI GOLD <enquiries@example.com>", ENQUIRY_TO_EMAIL: "team@example.com" };
const DB_ENV = { SUPABASE_URL: "https://abc.supabase.co/", SUPABASE_SECRET_KEY: "sb_secret_test" };

beforeEach(() => resetRateLimit());

/* ---------------- schema ---------------- */

test("valid enquiry is normalised", () => {
  const r = validateEnquiry(valid(), { minDate: "2026-10-28" });
  assert.equal(r.ok, true);
  assert.equal(r.data.email, "ada@example.com");
  assert.equal(r.data.businessName, BUSINESSES.events.name);
});

test("fields from another business are dropped", () => {
  const r = validateEnquiry(valid({ business: "foundation", enquiryType: "Partnership", product: "Gown" }));
  assert.equal(r.ok, true);
  assert.equal(r.data.product, undefined);
  assert.equal(r.data.eventDate, undefined);
});

test("required and malformed fields are reported", () => {
  const r = validateEnquiry(valid({ name: "A", email: "nope", eventDate: "", message: "hi", consent: false, enquiryType: "Gown" }));
  assert.equal(r.ok, false);
  for (const k of ["name", "email", "eventDate", "message", "consent", "enquiryType"]) assert.ok(r.errors[k], k);
});

test("past and impossible dates are rejected", () => {
  assert.ok(validateEnquiry(valid({ eventDate: "2020-01-01" }), { minDate: "2026-10-28" }).errors.eventDate);
  assert.ok(validateEnquiry(valid({ eventDate: "2026-02-31" })).errors.eventDate);
});

test("unknown business is rejected", () => {
  assert.ok(validateEnquiry(valid({ business: "hacking" })).errors.business);
});

/* ---------------- handler ---------------- */

test("no channels configured → 503 not_configured (never claims delivery)", async () => {
  const res = await handleEnquiryRequest(post(valid()), { env: {}, now: NOW, fetch: fakeFetch() });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, code: "not_configured" });
});

test("validation runs before the configuration check", async () => {
  const res = await handleEnquiryRequest(post(valid({ email: "bad" })), { env: {}, now: NOW });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.email);
});

test("email channel sends a Resend email with reply-to the enquirer", async () => {
  const f = fakeFetch();
  const res = await handleEnquiryRequest(post(valid()), { env: EMAIL_ENV, now: NOW, fetch: f });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.reference, /^TG-261028-[A-Z2-9]{5}$/);
  assert.deepEqual(body.delivered, ["email"]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "https://api.resend.com/emails");
  assert.equal(f.calls[0].body.reply_to, "ada@example.com");
  assert.deepEqual(f.calls[0].body.to, ["team@example.com"]);
  assert.match(f.calls[0].body.subject, /Project & Event Management/);
});

test("per-business inbox overrides the default", async () => {
  const f = fakeFetch();
  await handleEnquiryRequest(post(valid({ business: "fashion", enquiryType: "Place an order" })), {
    env: { ...EMAIL_ENV, ENQUIRY_TO_EMAIL_FASHION: "shop@example.com, style@example.com" }, now: NOW, fetch: f,
  });
  assert.deepEqual(f.calls[0].body.to, ["shop@example.com", "style@example.com"]);
});

test("user content is HTML-escaped in the email", async () => {
  const f = fakeFetch();
  await handleEnquiryRequest(post(valid({ message: "<script>alert(1)</script> please help" })), { env: EMAIL_ENV, now: NOW, fetch: f });
  assert.ok(!f.calls[0].body.html.includes("<script>"));
  assert.ok(f.calls[0].body.html.includes("&lt;script&gt;"));
});

test("database channel inserts a row into Supabase with the secret key", async () => {
  const f = fakeFetch();
  const res = await handleEnquiryRequest(post(valid()), { env: DB_ENV, now: NOW, fetch: f });
  assert.equal(res.status, 200);
  const call = f.calls[0];
  assert.equal(call.url, "https://abc.supabase.co/rest/v1/enquiries");
  assert.equal(call.init.headers.apikey, "sb_secret_test");
  assert.equal(call.init.headers.Authorization, undefined);
  assert.equal(call.body.business, "events");
  assert.equal(call.body.event_date, "2026-12-12");
  assert.equal(call.body.consent, true);
});

test("both channels: success if one works, failure only if all fail", async () => {
  const half = async (url) => (url.includes("resend")
    ? new Response("boom", { status: 500 })
    : new Response("", { status: 201 }));
  const origError = console.error; console.error = () => {};
  try {
    const ok = await handleEnquiryRequest(post(valid()), { env: { ...EMAIL_ENV, ...DB_ENV }, now: NOW, fetch: half });
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).delivered, ["database"]);

    const none = await handleEnquiryRequest(post(valid()), { env: { ...EMAIL_ENV, ...DB_ENV }, now: NOW, fetch: async () => new Response("x", { status: 500 }) });
    assert.equal(none.status, 502);
    assert.equal((await none.json()).code, "delivery_failed");
  } finally { console.error = origError; }
});

test("honeypot and instant submissions are silently dropped", async () => {
  const f = fakeFetch();
  const a = await handleEnquiryRequest(post(valid({ website: "spam.biz" })), { env: EMAIL_ENV, now: NOW, fetch: f });
  const b = await handleEnquiryRequest(post(valid({ startedAt: String(NOW - 500) })), { env: EMAIL_ENV, now: NOW, fetch: f });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(f.calls.length, 0);
});

test("rate limit after 5 submissions from one IP", async () => {
  const f = fakeFetch();
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleEnquiryRequest(post(valid()), { env: EMAIL_ENV, now: NOW + i, fetch: f })).status, 200);
  }
  assert.equal((await handleEnquiryRequest(post(valid()), { env: EMAIL_ENV, now: NOW + 9, fetch: f })).status, 429);
});

test("origin allow-list", async () => {
  const res = await handleEnquiryRequest(post(valid(), { headers: { origin: "https://evil.example" } }), {
    env: { ...EMAIL_ENV, ALLOWED_ORIGINS: "https://titigold.com" }, now: NOW, fetch: fakeFetch(),
  });
  assert.equal(res.status, 403);
});

test("no-JavaScript form posts get an HTML result page", async () => {
  const res = await handleEnquiryRequest(post({ ...valid(), consent: "yes" }, { type: "application/x-www-form-urlencoded" }), { env: {}, now: NOW });
  assert.equal(res.status, 503);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(await res.text(), /has not been sent/);
});

test("rejects GET, oversized and malformed bodies", async () => {
  assert.equal((await handleEnquiryRequest(new Request("http://x/api/enquiry"), { env: {} })).status, 405);
  const big = await handleEnquiryRequest(post(valid({ message: "x".repeat(30000) })), { env: {}, now: NOW });
  assert.equal(big.status, 413);
  const bad = await handleEnquiryRequest(new Request("http://x/api/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" }), { env: {} });
  assert.equal(bad.status, 400);
});

test("configuredChannels needs complete settings", () => {
  assert.deepEqual(configuredChannels({ RESEND_API_KEY: "x" }), []);
  assert.deepEqual(configuredChannels({ ...EMAIL_ENV, ...DB_ENV }), ["email", "database"]);
  assert.deepEqual(configuredChannels({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "eyJ..." }), ["database"]);
});
