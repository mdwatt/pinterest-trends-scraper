// Pinterest Trends Scraper Service
// Deployed on Railway. n8n calls GET /trends?region=US to get current trending terms.
//
// IMPORTANT: Pinterest Trends is JS-rendered and may change its page structure or
// add bot-detection at any time. If this starts returning empty results, the
// SELECTOR CONFIG section below is the first thing to check/update.

const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// A simple shared-secret check so random internet traffic can't hit your scraper.
// Set this same value as an n8n credential/header when calling this service.
const API_KEY = process.env.SCRAPER_API_KEY || "";

function checkAuth(req, res, next) {
  if (!API_KEY) return next(); // no key configured = open (not recommended for prod)
  const key = req.header("x-api-key");
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/trends", checkAuth, async (req, res) => {
  const region = req.query.region || "US";
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
    });

    const page = await context.newPage();

    const url = `https://trends.pinterest.com/?region=${encodeURIComponent(region)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Give client-side rendering extra time to populate trend cards.
    await page.waitForTimeout(3000);

    // ---- SELECTOR CONFIG (most likely thing to need updating over time) ----
    // Pinterest doesn't publish a stable API, so this pulls visible trend
    // card text generically rather than relying on one exact class name.
    const trends = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('[data-test-id*="trend"], [class*="trend"]')
      );
      const texts = candidates
        .map((el) => el.textContent.trim())
        .filter((t) => t.length > 2 && t.length < 80);
      return Array.from(new Set(texts)).slice(0, 25);
    });
    // -------------------------------------------------------------------

    await browser.close();

    if (!trends || trends.length === 0) {
      return res.status(200).json({
        region,
        trends: [],
        warning:
          "No trend terms found. Pinterest's page structure may have changed, or the region has no data. Check SELECTOR CONFIG in server.js.",
      });
    }

    return res.json({ region, trends, scraped_at: new Date().toISOString() });
  } catch (err) {
    if (browser) await browser.close();
    console.error("Scrape failed:", err.message);
    return res.status(500).json({
      error: "Scrape failed",
      detail: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Pinterest trends scraper running on port ${PORT}`);
});
