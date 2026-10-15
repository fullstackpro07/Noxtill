/* eslint-disable @typescript-eslint/no-require-imports */
// /features/inventory-from-photos — built around a stock count: a handwritten count sheet, then the
// before → after stock diff it produces, and the lines it couldn't match waiting for a decision.
// Module: (app)/digitizer (inventory_sheet scanner type → inventory destination; updates the stock of
// products that already exist).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/inventory-from-photos";
const css = `
  @media (max-width: 1080px) { [data-ifhero], [data-unm] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 760px) { [data-diff] { overflow-x: auto; } [data-diff] table { min-width: 560px; } }`;

const sheetRow = (item, count) => `<li style="display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid rgba(29,95,168,.25); font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-size: 17px; color: #1F3B6E;"><span>${esc(item)}</span><span>${count}</span></li>`;
const sheet = `
            <div style="padding: 26px 26px 30px; border-radius: 4px; background: #FFFDF6; background-image: repeating-linear-gradient(transparent 0 33px, rgba(29,95,168,.12) 33px 34px); box-shadow: 0 24px 50px -24px rgba(40,30,10,.45); transform: rotate(1.6deg);">
              <p style="margin: 0 0 12px; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-size: 20px; color: #1F3B6E;">Stock count · back room · Fri</p>
              <ul style="margin: 0; padding: 0; list-style: none;">${sheetRow("Oat milk 1L", 14)}${sheetRow("Whole milk 2L", 22)}${sheetRow("Coffee beans 1kg", 9)}${sheetRow("Paper cups 12oz", "6 slv")}${sheetRow("Choc syrup", 3)}${sheetRow("Lids (sm)", 11)}</ul>
            </div>`;

const d = (item, before, after, tone) => {
  const diff = typeof before === "number" && typeof after === "number" ? after - before : null;
  return `<tr><td style="padding: 11px 14px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13.5px; font-weight: 600;">${esc(item)}</td><td style="padding: 11px 14px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13.5px; text-align: right; color: #6B776F;">${before}</td><td style="padding: 11px 14px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13.5px; text-align: right; font-weight: 700;">${after}</td><td style="padding: 11px 14px; border-top: 1px solid rgba(16,32,26,.07); text-align: right;">${diff === null ? pill("No match", "warn") : pill((diff > 0 ? "+" : "") + diff, tone || (diff < 0 ? "bad" : diff > 0 ? "good" : "mute"))}</td></tr>`;
};

const hero = `
    <section aria-label="Inventory from Photos" data-pad="1" style="background: #F6F4EE; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("AI Photo Digitizer", "/ai/photo-digitizer", "Inventory from Photos")}
        <div data-ifhero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center; margin-top: 28px;">
          <div>
            ${eyebrow("Inventory from Photos")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Count on paper.<br>Update stock in seconds.</h1>
            <p style="margin: 20px 0 0; max-width: 480px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Do your stock count the way you always have, on a clipboard. Take a photo of the sheet and Noxtill updates the stock of each product, showing exactly what changed before you approve.</p>
            ${ctas("Start Free Trial")}
          </div>
          <div role="img" aria-label="Handwritten stock count sheet with six items (example data)">${sheet}</div>
        </div>
      </div>
    </section>`;

const diff = sec(
  "What changes",
  "#fff",
  `${h2("What changes", "See every difference before it’s saved.", "Your count is compared with what Noxtill expected you to have. Shortfalls, surpluses and lines it couldn’t match are laid out side by side, so a miscount doesn’t quietly become your stock level.")}
        <div data-diff="1" style="${CARD} margin-top: 36px; overflow: hidden; box-shadow: 0 30px 60px -40px rgba(8,30,20,.35);">
          <p style="margin: 0; display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #0F2A1F; color: #fff;"><b style="font-size: 14px;">Stock count · back room · Friday</b>${pill("5 matched · 1 to decide", "dark")}</p>
          <table style="width: 100%; border-collapse: collapse;" aria-label="Stock before and after the count (example data)">
            <thead><tr style="font-size: 11px; letter-spacing: .08em; color: #6B776F;"><th style="padding: 10px 14px; text-align: left;">PRODUCT</th><th style="padding: 10px 14px; text-align: right;">IN NOXTILL</th><th style="padding: 10px 14px; text-align: right;">COUNTED</th><th style="padding: 10px 14px; text-align: right;">CHANGE</th></tr></thead>
            <tbody>${d("Oat milk 1 L", 16, 14)}${d("Whole milk 2 L", 22, 22)}${d("Coffee beans 1 kg", 7, 9)}${d("Paper cups 12 oz (sleeve of 50)", 8, 6)}${d("Chocolate syrup", 3, 3)}${d("“Lids (sm)”", "—", 11)}</tbody>
          </table>
        </div>
        `,
);

const unm = sec(
  "Lines it can’t match",
  "#F6F4EE",
  `
        <div data-unm="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          ${img("np/pasted-1789680517500-0-mu61kl90-5cj7.png", "Stock check in the warehouse on a tablet", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
          <div>${h2("Lines it can’t match", "You decide, and it remembers.", "A count updates products you already have. When a line like “Lids (sm)” doesn’t clearly match one, it waits for you to pick the right product. Your choice is remembered for the next count.")}
            <div style="margin-top: 24px; ${CARD} padding: 18px;" role="img" aria-label="Unmatched line Lids (sm) with two suggested products (example data)">
              <p style="margin: 0 0 12px; font-size: 14px;"><b>“Lids (sm)” · 11</b> <span style="color: #6B776F;">matches which product?</span></p>
              <div style="display: grid; gap: 8px;">
                <span style="display: flex; justify-content: space-between; padding: 10px 12px; border-radius: 9px; border: 2px solid #16A85F; background: #E8F3EC; font-size: 13.5px; font-weight: 600;">Cup lids 8 oz ${pill("Best match", "good")}</span>
                <span style="display: flex; justify-content: space-between; padding: 10px 12px; border-radius: 9px; border: 1px solid rgba(16,32,26,.12); font-size: 13.5px;">Cup lids 12 oz <span style="color: #6B776F; font-size: 12px;">Possible</span></span>
              </div>
            </div>
          </div>
        </div>`,
);

const body = `${hero}${diff}${unm}${faq(
  "Inventory from photos questions.",
  [
    ["Can I photograph a handwritten count?", "Yes. Handwritten and printed stock counts both work, as photos or PDFs."],
    ["Does a count create new products?", "No. A stock count updates products you already have. Lines it can’t match wait for you to choose a product."],
    ["Will I see the changes first?", "Yes. Every product shows what Noxtill had, what you counted and the difference, before you approve."],
    ["What if I miscounted one line?", "Edit the number during review. Only the approved figures are saved."],
    ["Does it remember my short names?", "Yes. When you match a written name to a product, it remembers it for the next count."],
  ],
  [["Product Digitization", "/features/product-digitization"], ["Review & Approve Data", "/features/review-approve-data"], ["Smart Inventory", "/features/smart-inventory"]],
)}${closing("Stock counts without the typing.", "Start a 14-day free trial or book a demo to photograph your first count.")}`;

module.exports = {
  slug: "features--inventory-from-photos",
  html: page({ route, title: "Inventory from Photos — Stock Counts Made Easy | Noxtill", desc: "Photograph your handwritten stock count and Noxtill updates each product's stock, showing every difference and unmatched line before you approve.", css }, body),
};
