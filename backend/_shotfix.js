const puppeteer = require("puppeteer");
const path = require("path");
const OUT = "C:/Users/User/AppData/Local/Temp/claude/d--Noxtil/cdd92328-b2e4-454c-891a-a9fae134b2a9/scratchpad";

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/product/health-score", { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(OUT, "health-hero-fixed.png"), clip: { x: 0, y: 0, width: 1440, height: 400 } });

  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((r) => setTimeout(r, 80));
  }
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "health-full-fixed.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log("overflow:", overflow);
  await browser.close();
})();
