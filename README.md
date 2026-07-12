# Pinterest Trends Scraper — Railway Deployment

## What this is
A small web service with one endpoint: `GET /trends?region=US`.
It launches a headless Chromium browser (Playwright), loads Pinterest Trends,
and returns the current trending search terms as JSON. n8n calls this endpoint
weekly as Step 2 of the pipeline.

## Deploy to Railway (click-by-click)

1. Go to railway.app, log into your Hobby account.
2. Click **New Project** → **Deploy from GitHub repo** (recommended) OR
   **Empty Project** → then use Railway's CLI/dashboard file upload if you don't
   want to use GitHub.
   - If using GitHub: push this folder's contents to a new repo first, then
     select that repo in Railway.
3. Once the project is created, click into it → **Variables** tab.
4. Add a variable: `SCRAPER_API_KEY` = (make up a long random string, e.g.
   `cfg-scraper-8f3k2m9x`). This is the shared secret n8n will send.
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
   with header `x-api-key: cfg-scraper-8f3k2m9x` (whatever you set in step 4).

## What n8n needs to call this
- Method: `GET`
- URL: `https://your-app.up.railway.app/trends?region=US`
- Header: `x-api-key` = the same value as `SCRAPER_API_KEY`

## Known risk (read this before relying on it)
Pinterest does not publish a stable public API for Trends, and the page is
JS-rendered. This scraper reads visible page text generically (see the
"SELECTOR CONFIG" comment block in `server.js`) rather than one exact CSS
class, to reduce (not eliminate) breakage risk. If `/trends` starts
returning an empty array with a `warning` field, Pinterest likely changed
their page — that's the first place to check and update.
