// Renders ads.html into PNGs for Meta Ads Manager:
//   out/ad-<letter>-feed.png  (1080x1080, Feed)
//   out/ad-<letter>-story.png (1080x1920, Stories/Reels)
// Run from anywhere: node docs/ads/render.js
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const dir = __dirname;
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  const browser = await chromium.launch();
  for (const ad of ["A", "B", "C", "V"]) {
    for (const [fmt, h, name] of [["sq", 1080, "feed"], ["story", 1920, "story"]]) {
      const page = await browser.newPage({ viewport: { width: 1080, height: h } });
      await page.goto(`file://${dir}/ads.html?ad=${ad}&fmt=${fmt}`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(dir, "out", `ad-${ad}-${name}.png`) });
      await page.close();
    }
  }
  await browser.close();
})();
