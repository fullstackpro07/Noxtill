const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  for (const [name, width] of [["narrow", 1024], ["wide", 1600]]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto("http://localhost:3000/integrations-directory", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const heading = [...document.querySelectorAll("h2")].find(h => h.textContent.includes("What You Can Connect"));
      if (heading) heading.scrollIntoView({ block: "start" });
    });
    await new Promise(r => setTimeout(r, 400));
    const overflowInfo = await page.evaluate(() => {
      return { docScrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth };
    });
    console.log(name, JSON.stringify(overflowInfo));
    await page.screenshot({ path: `C:/Users/User/AppData/Local/Temp/claude/d--Noxtil/cdd92328-b2e4-454c-891a-a9fae134b2a9/scratchpad/no-scroll-${name}.png`, fullPage: false });
  }
  await browser.close();
})();
