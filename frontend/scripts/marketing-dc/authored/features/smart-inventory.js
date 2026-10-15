/* eslint-disable @typescript-eslint/no-require-imports */
// /features/smart-inventory — built around stock cover: a row of gauges showing days of stock left per
// channel, then the reorder suggestions table with drafted purchase orders, and the sync across
// store, POS and marketplace.
// Autonomous Commerce (owner decision 2026-10-15: written as a live feature).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/smart-inventory";
const css = `
  @media (max-width: 1080px) { [data-gauges] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } [data-si2] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 560px) { [data-gauges] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 760px) { [data-reorder] { overflow-x: auto; } [data-reorder] table { min-width: 640px; } }`;

// Semi-circle gauge: days of cover out of 30.
const gauge = (name, days, sub) => {
  const f = Math.min(days, 30) / 30, a = Math.PI * (1 - f);
  const x = 70 + Math.cos(a) * 54, y = 70 - Math.sin(a) * 54;
  const col = days < 5 ? "#E5654B" : days < 10 ? "#F2C46B" : "#2FD39A";
  return `
            <div style="padding: 18px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(143,224,179,.2); text-align: center;">
              <svg viewBox="0 0 140 84" aria-hidden="true" style="width: 100%; max-width: 180px; height: auto;"><path d="M16 70 A54 54 0 0 1 124 70" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="12" stroke-linecap="round"/><path d="M16 70 A54 54 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"/><text x="70" y="66" text-anchor="middle" fill="#fff" font-size="22" font-weight="700" font-family="Instrument Sans, system-ui, sans-serif">${days}d</text></svg>
              <b style="display: block; margin-top: 4px; font-size: 14px;">${esc(name)}</b><span style="font-size: 12px; color: rgba(255,255,255,.65);">${esc(sub)}</span>
            </div>`;
};

const hero = `
    <section aria-label="Smart Inventory" data-pad="1" style="background: linear-gradient(180deg, #0F2A1F, #173D2E); padding: 30px 28px 70px; color: #fff;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Autonomous Commerce", "/ai/autonomous-commerce", "Smart Inventory", "rgba(255,255,255,.7)")}
        <div style="text-align: center; max-width: 760px; margin: 32px auto 0;">
          ${eyebrow("Smart Inventory", "#8FE0B3")}
          <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Know how many days<br><span style="color: #2FD39A;">each product has left.</span></h1>
          <p style="margin: 20px auto 0; max-width: 580px; font-size: 16.5px; line-height: 1.7; color: rgba(255,255,255,.78);">Smart Inventory watches how fast every product sells across your store, POS and marketplaces, warns you before it runs out and drafts the reorder for you to approve.</p>
          <div style="display: flex; justify-content: center;">${ctas("Start Free Trial", true)}</div>
        </div>
        <div data-gauges="1" role="img" aria-label="Days of stock cover: ceramic planter 3 days, scented candle 8 days, linen cushion 26 days, picture frame set 14 days (example data)" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-top: 46px;">
          ${gauge("Ceramic planter", 3, "Selling 6 a day")}${gauge("Scented candle", 8, "Selling 4 a day")}${gauge("Picture frame set", 14, "Selling 2 a day")}${gauge("Linen cushion", 26, "Selling 1 a day")}
        </div>
      </div>
    </section>`;

const tr = (c, head) => `<tr>${c.map((x, i) => `<${head ? "th" : "td"} style="padding: 12px 14px; text-align: ${i > 0 && i < 4 ? "right" : "left"}; font-size: ${head ? 11.5 : 13.5}px; ${head ? "letter-spacing: .06em; color: #6B776F; font-weight: 700;" : i === 0 ? "font-weight: 600;" : ""} border-top: 1px solid rgba(16,32,26,.07);">${x}</${head ? "th" : "td"}>`).join("")}</tr>`;
const reorder = sec(
  "Reorder suggestions",
  "#fff",
  `${h2("Reorder suggestions", "The order is drafted before you run out.", "Suggested quantities come from your selling speed, your supplier’s lead time and the cover you want to keep. Each one becomes a purchase order only when you approve it.")}
        <div data-reorder="1" style="${CARD} margin-top: 36px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;" aria-label="Reorder suggestions (example data)">
            <thead style="background: #F6F4EE;">${tr(["PRODUCT", "IN STOCK", "LEAD TIME", "SUGGESTED", "STATUS"], true)}</thead>
            <tbody>
              ${tr(["Ceramic planter", "18", "5 days", "60", pill("Order today", "bad")])}
              ${tr(["Scented candle", "32", "7 days", "40", pill("Draft ready", "warn")])}
              ${tr(["Picture frame set", "28", "10 days", "—", pill("Enough for now", "good")])}
              ${tr(["Linen cushion", "26", "6 days", "—", pill("Slow seller", "mute")])}
            </tbody>
          </table>
        </div>
        `,
);

const sync = sec(
  "One stock count everywhere",
  "#F6F4EE",
  `
        <div data-si2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          ${img("np/32a8b871-dd45-48c7-84c4-e2bf0de926ed-mu61degt-4xz8.png", "Inventory overview with stock cover", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
          <div>${h2("One stock count everywhere", "Sell anywhere without overselling.", "A sale in the shop, online or on a marketplace updates the same stock, so the last item can’t be sold twice.")}
            <div style="display: grid; gap: 10px; margin-top: 26px;">
              ${[["store", "Shop & POS", "Counter sales update stock as they ring up."], ["globe", "Online store", "Your website shows what’s really available."], ["share", "Marketplaces", "Connected channels stay in step with your stock."]].map(([ic, t, d]) => `<div style="display: flex; gap: 14px; padding: 14px 16px; border-radius: 12px; background: #fff;">${icon(ic, 22, "#0B6B3F")}<span><b style="display: block; font-size: 14.5px;">${t}</b><span style="font-size: 13.5px; color: #4B5A52;">${d}</span></span></div>`).join("")}
            </div>
          </div>
        </div>`,
);

const body = `${hero}${reorder}${sync}${faq(
  "Smart inventory questions.",
  [
    ["How does it know when I’ll run out?", "From how fast each product has been selling across your channels, compared with what’s in stock."],
    ["Does it place orders with my suppliers?", "It drafts the purchase order. The order is placed only after you approve it."],
    ["How are suggested quantities worked out?", "From selling speed, your supplier’s lead time and the days of cover you want to keep."],
    ["Can it stop overselling online?", "Yes. Every channel draws from the same stock count, so the last item can’t be sold twice."],
    ["Can I set different cover for different products?", "Yes. Set the cover you want per product or per collection."],
  ],
  [["Dynamic Pricing", "/features/dynamic-pricing"], ["Automated Fulfillment", "/features/automated-fulfillment"], ["Inventory from Photos", "/features/inventory-from-photos"]],
)}${closing("Never be caught out of stock again.", "Start a 14-day free trial or book a demo to see your stock cover.")}`;

module.exports = {
  slug: "features--smart-inventory",
  html: page({ route, title: "Smart Inventory — Stock Cover and Reorders | Noxtill", desc: "See how many days of stock each product has across your store, POS and marketplaces, and approve reorders drafted before you run out.", css }, body),
};
