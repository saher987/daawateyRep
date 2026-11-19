// Renders posts.html into PNGs for Instagram/Facebook (week 1 of the
// content calendar): out/post-<id>.png, 1080x1350, the Reel cover 1080x1920.
// Run from anywhere: node docs/social/render.js
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const POSTS = [
  ["1", 1350], ["2-1", 1350], ["2-2", 1350], ["2-3", 1350], ["2-4", 1350], ["2-5", 1350], ["2-6", 1350],
  ["3", 1350], ["4", 1920], ["5", 1350],
];

(async () => {
  const dir = __dirname;
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  const browser = await chromium.launch();
  for (const [id, h] of POSTS) {
    const page = await browser.newPage({ viewport: { width: 1080, height: h } });
    await page.goto(`file://${dir}/posts.html?p=${id}`);
    await page.evaluate(() => document.fonts.ready);
    const name = id === "4" ? "post-4-reel-cover" : `post-${id}`;
    await page.screenshot({ path: path.join(dir, "out", `${name}.png`) });
    await page.close();
  }
  await browser.close();
})();
