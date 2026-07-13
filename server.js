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
    //
    // The broad attribute match below hits elements at every nesting level
    // (card wrapper, term span, stat badge all have "trend" in an
    // attribute), so a naive .textContent read swallows sibling/child text
    // into one blob (e.g. "Fandom Finishing TouchesPopular in Sport and
    // Beautyworld cup outfit +500%+5"). Fix is two-part: (1) keep only
    // "leaf" matches -- elements with no matching descendant -- which
    // eliminates that concatenation structurally; (2) drop known non-term
    // leaves (table headers, stat-only badges) that survive as clean leaves
    // in their own right. Part 2 is a heuristic over Pinterest's current
    // page copy, not a structural guarantee -- if trend terms start
    // getting dropped, check NOISE_EXACT/STAT_ONLY here first.
    const trends = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('[data-test-id*="trend"], [class*="trend"]')
      );

      const leaves = candidates.filter(
        (el) => !candidates.some((other) => other !== el && el.contains(other))
      );

      const NOISE_EXACT = new Set([
        "keywords",
        "weekly change",
        "monthly change",
        "yearly change",
      ]);
      // Matches stat-only badges: "98%", "300%", "10,000%+", "+500%", "-12% MoM"
      const STAT_ONLY = /^[+-]?[\d,.]+%?(\s*(mom|yoy|wow))?[+-]?$/i;
      // Screen-reader link suffix Pinterest appends to nav/related-search links.
      const OPENS_NEW_TAB_SUFFIX = /;\s*opens a new tab$/i;

      const texts = leaves
        .map((el) =>
          el.textContent
            .trim()
            .replace(/\s+/g, " ")
            .replace(OPENS_NEW_TAB_SUFFIX, "")
            .trim()
        )
        .filter((t) => t.length > 2 && t.length < 80)
        .filter((t) => !NOISE_EXACT.has(t.toLowerCase()))
        .filter((t) => !STAT_ONLY.test(t))
        .filter((t) => !/^view\s/i.test(t));

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
