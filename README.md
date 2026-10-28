# TITI GOLD — website

The website for **TITIGOLD Project and Event Management**, **TITIGOLD Foundation** and **TITIGOLD Fashion Hub**.

A fast, dependency-free static site with a smart enquiry form and a small server function that delivers enquiries by **email (Resend)** and/or saves them to a **database (Supabase)**.

> **Enquiry delivery is not switched on yet.** Until you complete step 2 below, the form validates everything but tells visitors plainly that their enquiry *has not been sent*, keeps their details, and offers an email/WhatsApp/copy fallback. It never claims a submission was delivered unless the server confirms it.

---

## 1. Run it on your computer

Requires [Node.js](https://nodejs.org) 20 or newer. No `npm install` needed.

```bash
npm run dev      # http://localhost:3000
npm test         # 18 tests for validation and delivery
```

To test the full form flow locally without any accounts, copy `.env.example` to `.env` and set:

```
ENQUIRY_LOCAL_FILE=data/enquiries.ndjson
```

Submissions are then saved to that file (local development only — this option does nothing on the live site).

## 2. Switch on enquiry delivery

Pick one or both. The form reports success when **at least one** channel succeeds.

### Email — Resend (recommended first)

1. Create an account at [resend.com](https://resend.com) and **verify your domain** (e.g. `titigold.com`).
2. Create an API key.
3. Set these environment variables in your host (e.g. Vercel → Project → Settings → Environment Variables):

| Variable | Example |
|---|---|
| `RESEND_API_KEY` | `re_…` |
| `ENQUIRY_FROM_EMAIL` | `TITI GOLD Enquiries <enquiries@titigold.com>` |
| `ENQUIRY_TO_EMAIL` | `hello@titigold.com` |
| `ENQUIRY_TO_EMAIL_EVENTS` *(optional)* | inbox just for events |
| `ENQUIRY_TO_EMAIL_FOUNDATION` *(optional)* | inbox just for the Foundation |
| `ENQUIRY_TO_EMAIL_FASHION` *(optional)* | inbox just for the Fashion Hub |
| `ENQUIRY_SEND_CONFIRMATION` *(optional)* | `true` to email the visitor a receipt |

Each enquiry arrives as a branded email; pressing **Reply** answers the visitor directly.

### Database — Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste `supabase/migrations/20261028180000_create_enquiries.sql` and run it (or `supabase db push` with the CLI).
3. Copy the **Project URL** and a **Secret key** (`sb_secret_…`) from Project Settings → API Keys.
4. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in your host. **Never** put the secret key in front-end code.

Enquiries then appear in **Table Editor → enquiries**, with a `status` column (`new`, `in_progress`, `replied`, `closed`, `spam`) and `notes` for the team. The table is locked away from the public API — only the server function can write to it.

### Security setting

Set `ALLOWED_ORIGINS=https://titigold.com,https://www.titigold.com` once the domain is live.

## 3. Deploy (Vercel)

1. Push this folder to a GitHub repository.
2. Import it at [vercel.com/new](https://vercel.com/new) — no framework, no build command.
3. Add the environment variables above and redeploy.
4. Submit a test enquiry and confirm it arrives.

`vercel.json` adds security headers (including a strict Content-Security-Policy). `api/enquiry.js` is the only server code; it's a thin wrapper around `server/enquiry-handler.js`, which also runs on Netlify, Cloudflare or any host that supports standard `Request`/`Response` functions.

---

## Editing the site

| What | Where |
|---|---|
| Email, phone, WhatsApp, location, social links | `assets/js/site-config.js` — empty values stay hidden |
| Business names, form questions, dropdown options, budget ranges | `assets/js/enquiry-schema.js` — used by both the form and the server |
| Page text | `index.html` (look for `CONTENT:` comments) |
| Colours, fonts, spacing | `:root` at the top of `assets/css/styles.css` |
| Photos | `assets/img/photos/` — replace files keeping the same names and 4:5 shape |
| Logo | `assets/img/brand/` (web) and `brand-kit/` (masters) |

**Content still to add:** Titi's approved biography (About section), public contact details and social links (`site-config.js`), and the live domain (canonical URL in `index.html`).

> If you change the small inline `<script>` in the `<head>` of `index.html`, update its `sha256-…` hash in `vercel.json` or browsers will block it.

## Logo

The TG monogram was redrawn as clean vector geometry, fitted to the original artwork (97.5% overlap — the difference is only the crinkled foil edges). It keeps the original's proportions, including the heavier top of the G and its flat spur.

| File | Use |
|---|---|
| `titigold-mark.svg` | Gold-gradient monogram — website, digital |
| `titigold-mark-gold.svg` | Flat gold — small sizes, embroidery, single-colour print |
| `titigold-mark-black.svg` | Black — light backgrounds, stamps, documents |
| `titigold-lockup.svg` / `-black.svg` | Monogram + "THE TITI-GOLD" wordmark |
| `titigold-wordmark.svg` | Wordmark only |
| `titigold-mark-foil.png`, `titigold-lockup-foil.png` | Original gold-foil texture inside the new clean outlines (≈2000 px, transparent) — print, merch, social |

Regenerate the SVGs with `python3 scripts/build-brand.py` (needs `fonttools`).

## Project structure

```
index.html                 the page
404.html                   not-found page
assets/css/styles.css      all styles
assets/js/main.js          navigation, animations, contact details
assets/js/enquiry-form.js  smart form behaviour
assets/js/enquiry-schema.js  shared form definition + validation
assets/js/site-config.js   contact details and settings
api/enquiry.js             Vercel function (POST /api/enquiry)
server/enquiry-handler.js  validation, spam protection, delivery
supabase/migrations/       database table
scripts/dev-server.js      local server
tests/                     automated tests
brand-kit/                 logo master files (not deployed)
```

## What's built in

- **Responsive** from 320 px phones to wide desktops; no horizontal scrolling.
- **Accessible**: skip link, semantic landmarks, keyboard-friendly menu (Esc closes), visible focus, inline error messages linked to fields, live status announcements, AA colour contrast, 44 px tap targets, reduced-motion support, works without JavaScript.
- **Smart form**: questions adapt to the chosen business; same validation in the browser and on the server; future-date check; character counter; consent checkbox.
- **Spam protection**: hidden honeypot field, minimum fill time, per-IP rate limit (5 per 10 minutes, per server instance — add a Vercel Firewall rate-limit rule for stronger protection), size limits, optional origin allow-list.
- **Performance**: no frameworks, responsive WebP photos with JPEG fallback, preloaded hero image, lazy-loaded below-the-fold images.

Photography: Sirshow.
