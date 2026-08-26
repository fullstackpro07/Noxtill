import puppeteer from "puppeteer";
const outDir = "C:/Noxtil-shots";
import fs from "node:fs";
fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1560, height: 1100 });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("h2")).find(h => h.textContent.includes("business answers"));
  heading?.scrollIntoView({ block: "start" });
});
await new Promise((r) => setTimeout(r, 600));
const handle = await page.evaluateHandle(() => {
  const inbox = Array.from(document.querySelectorAll("*")).find(e => e.textContent?.trim() === "Noxtill Unified Inbox" && e.children.length === 0);
  const inboxRect = inbox.getBoundingClientRect();
  const candidates = Array.from(document.querySelectorAll("*")).filter(e => e.textContent?.trim() === "File / PDF" && e.children.length === 0);
  const near = candidates.find(e => Math.abs(e.getBoundingClientRect().y - inboxRect.y) < 400 && e.getBoundingClientRect().y > 0);
  let card = near;
  for (let i = 0; i < 3; i++) card = card.parentElement;
  return card;
});
const el = handle.asElement();
if (el) {
  await el.screenshot({ path: `${outDir}/filecard.png` });
  console.log("saved element screenshot to", `${outDir}/filecard.png`);
} else {
  console.log("element not found");
}
await browser.close();
