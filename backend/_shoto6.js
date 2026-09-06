const puppeteer = require("puppeteer");
const path = require("path");
const OUT = "C:/Users/User/AppData/Local/Temp/claude/d--Noxtil/cdd92328-b2e4-454c-891a-a9fae134b2a9/scratchpad";

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/product/orders", { waitUntil: "networkidle0" });
  const top = await page.evaluate(() => {
    const h2s = Array.from(document.querySelectorAll("h2"));
    const h2 = h2s.find((e) => e.textContent.includes("Why Teams Love"));
    return h2 ? h2.getBoundingClientRect().top + window.scrollY - 40 : null;
  });
  console.log("top", top);
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((r) => setTimeout(r, 80));
  }
  await page.evaluate((y) => window.scrollTo(0, y), top);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "orders-benefits-eco2.png"), clip: { x: 0, y: 0, width: 1440, height: 800 } });
  await browser.close();
})();
