# Pinterest Trends Scraper — Railway Deployment

## What this is
A small web service with one endpoint: `GET /trends?region=US`.
It launches a headless Chromium browser (Playwright), loads Pinterest Trends,
and returns the current trending search terms as JSON. n8n calls this
endpoint weekly as Step 2a of the pipeline (see "Dual channel" below).

**This service handles Pinterest only.** It is not responsible for Google
Trends — that channel does not need Railway or Playwright at all (see
below). Do not add a second scraping route to this service for Google
Trends; keep this repo single-purpose.

## Dual channel — how trend detection actually works

This scraper is the **primary** channel, not the only one. n8n is
responsible for trying channels in this order and falling through on
failure — this repo does not implement that fallback logic itself:

1. **Primary — this service** (`GET /trends?region=US`). Pinterest has
   confirmed anti-bot detection (rate limiting, changing page structure,
   IP blocking), so this can legitimately return an empty result. That is
   expected, not necessarily a bug — see the `warning` field in the
   response.
2. **Fallback — Google Trends public RSS feed**, called *directly by n8n*,
   no Railway involved: `https://trends.google.com/trending/rss?geo=US`.
   This is a public, unauthenticated, non-JS endpoint (plain XML/RSS), so
   it needs no headless browser and carries much lower scraping risk than
   either Pinterest or the Google Trends *web UI*. n8n parses it with its
   native XML node.
3. **Final fallback — static keyword list**, hardcoded in the n8n workflow,
   used only if both of the above return empty, so the weekly run never
   fully halts.

Full pipeline context, credential names, and the Google Sheet schema this
plugs into live in `SKILLS.md` at the root of the main project repo —
that file is the single source of truth for how this scraper's output is
used downstream. `AGENTS.md` in that same repo documents the constraints
this build must not drift from (e.g., no logged-in/authenticated scraping
— this service intentionally never logs into any account).

## Deploy to Railway (click-by-click)

1. Go to railway.app, log into your Hobby account.
2. Click **New Project** → **Deploy from GitHub repo** (recommended) OR
   **Empty Project** → then use Railway's CLI/dashboard file upload if you don't
   want to use GitHub.
   - If using GitHub: push this folder's contents to a new repo first, then
     select that repo in Railway.
3. Once the project is created, click into it → **Variables** tab.
4. Add a variable: `SCRAPER_API_KEY` = (a long random string you invent
   yourself — this is a shared secret you and n8n both know, not something
   issued by any third party. See "API key" note below).
5. Click **Deploy** (Railway auto-detects Node.js and uses `nixpacks.toml`
   in this folder to also install Playwright's browser).
6. Wait for the build to finish (first build is slower — it's downloading
   the Chromium binary). Check the **Deployments** tab for build logs if
   it fails.
7. Once deployed, click **Settings** → **Networking** → **Generate Domain**.
   This gives you a public URL like `https://your-app.up.railway.app`.
8. Test it: visit `https://your-app.up.railway.app/health` in your browser —
   should return `{"status":"ok"}`.
9. Test the real endpoint from your browser or Postman:
   `https://your-app.up.railway.app/trends?region=US`
   with header `x-api-key: <your SCRAPER_API_KEY value>`.

## What n8n needs to call this (Step 2a only)
- Method: `GET`
- URL: `https://your-app.up.railway.app/trends?region=US`
- Header: `x-api-key` = the same value as `SCRAPER_API_KEY`
- On empty `trends` array or non-200 response: n8n should fall through to
  Step 2b (Google Trends RSS, called directly, no Railway) rather than
  fail the run.

## API key note
`SCRAPER_API_KEY` is not obtained from anywhere — you invent the string
yourself (e.g. via a password generator), set it once in Railway's
Variables tab, and reuse the exact same value in n8n's HTTP Request header.
It exists only to stop random internet traffic from hitting your endpoint;
it is not tied to any account or third-party service.

## Known risk (read this before relying on it)
Pinterest does not publish a stable public API for Trends, and the page is
JS-rendered. This scraper reads visible page text generically (see the
"SELECTOR CONFIG" comment block in `server.js`) rather than one exact CSS
class, to reduce (not eliminate) breakage risk. If `/trends` starts
returning an empty array with a `warning` field, Pinterest likely changed
their page — that's the first place to check and update. This is exactly
why the dual-channel fallback above exists: this known fragility is
handled at the n8n workflow level, not assumed away here.
