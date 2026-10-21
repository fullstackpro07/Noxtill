/* eslint-disable @typescript-eslint/no-require-imports */
// /features/product-digitization — built around a paper menu turning into a product catalogue: a coded
// menu card on the left, the product cards it becomes on the right, then name matching (aliases) so
// "Capp. lrg" lands on the product you already have instead of a duplicate.
// Module: (app)/digitizer (menu / product scanner types → product destination, aliases, duplicates).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/product-digitization";
const css = `
  @media (max-width: 1080px) { [data-pdhero], [data-alias] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 640px) { [data-cards] { grid-template-columns: minmax(0,1fr) !important; } }`;

const menuLine = (name, price) => `<li style="display: flex; align-items: baseline; gap: 8px; font-size: 16px;"><span>${esc(name)}</span><span aria-hidden="true" style="flex: 1; border-bottom: 2px dotted rgba(60,40,20,.3);"></span><span>${price}</span></li>`;
const menu = `
            <div style="position: relative; padding: 30px 28px; border-radius: 6px; background: #FBF5E8; box-shadow: 0 24px 50px -24px rgba(60,40,20,.45); transform: rotate(-2.2deg); font-family: Georgia, 'Times New Roman', serif; color: #3A2A18;">
              <p style="margin: 0; text-align: center; font-size: 26px; letter-spacing: .08em;">THE CORNER CUP</p>
              <p style="margin: 4px 0 18px; text-align: center; font-size: 12px; letter-spacing: .3em; color: #8A6A44;">COFFEE · BAKERY</p>
              <p style="margin: 0 0 8px; font-size: 13px; letter-spacing: .2em; color: #8A6A44;">COFFEE</p>
              <ul style="margin: 0 0 16px; padding: 0; list-style: none; display: grid; gap: 7px;">${menuLine("Espresso", "3.00")}${menuLine("Cappuccino", "4.25")}${menuLine("Flat white", "4.50")}${menuLine("Iced latte", "5.00")}</ul>
              <p style="margin: 0 0 8px; font-size: 13px; letter-spacing: .2em; color: #8A6A44;">BAKERY</p>
              <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 7px;">${menuLine("Butter croissant", "3.25")}${menuLine("Almond croissant", "4.00")}${menuLine("Banana bread", "3.75")}</ul>
            </div>`;
const pcard = (name, cat, price, state) => `<div style="${CARD} padding: 14px;"><p style="margin: 0; display: flex; justify-content: space-between; gap: 8px; align-items: center;"><b style="font-size: 14px;">${esc(name)}</b>${state}</p><p style="margin: 6px 0 0; display: flex; justify-content: space-between; font-size: 12.5px; color: #6B776F;"><span>${cat}</span><b style="color: #10201A;">$${price}</b></p></div>`;

const hero = `
    <section aria-label="Product Digitization" data-pad="1" style="background: linear-gradient(180deg, #F6F4EE, #fff); padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("AI Photo Digitizer", "/ai/photo-digitizer", "Product Digitization")}
        <div style="max-width: 720px; margin-top: 30px;">
          ${eyebrow("Product Digitization")}
          <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Your menu becomes<br>your catalogue.</h1>
          <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Photograph a menu, a price list or a supplier catalogue. Noxtill turns each line into a product with its name, category and price, ready to sell at the counter and online once you approve it.</p>
          ${ctas("Start Free Trial")}
        </div>
        <div data-pdhero="1" style="display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 50px; align-items: center; margin-top: 46px;" role="img" aria-label="A printed café menu turned into seven product cards, one matched to an existing product (example data)">
          ${menu}
          <div>
            <p style="margin: 0 0 12px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px;">7 products found</b>${pill("Waiting for your approval", "warn")}</p>
            <div data-cards="1" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px;">
              ${pcard("Espresso", "Coffee", "3.00", pill("New", "info"))}${pcard("Cappuccino", "Coffee", "4.25", pill("Matches existing", "good"))}${pcard("Flat white", "Coffee", "4.50", pill("New", "info"))}${pcard("Iced latte", "Coffee", "5.00", pill("New", "info"))}${pcard("Butter croissant", "Bakery", "3.25", pill("New", "info"))}${pcard("Almond croissant", "Bakery", "4.00", pill("New", "info"))}
            </div>
          </div>
        </div>
      </div>
    </section>`;

const al = (from, to) => `<li style="display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); gap: 12px; align-items: center; padding: 12px 14px; border-radius: 10px; background: #fff; border: 1px solid rgba(16,32,26,.08);"><span style="font-family: Georgia, serif; font-size: 15px; font-style: italic; color: #5A4630;">“${esc(from)}”</span><span aria-hidden="true" style="color: #16A85F;">→</span><b style="font-size: 14px;">${esc(to)}</b></li>`;
const alias = sec(
  "No duplicates",
  "#F6F4EE",
  `
        <div data-alias="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("No duplicates", "It learns what you call things.", "Handwritten lists shorten names. When a line looks like a product you already sell, Noxtill suggests the match and lets you decide. Once you confirm, it remembers that name for next time.")}</div>
          <div>
            <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 10px;" role="img" aria-label="Written names matched to existing products (example data)">
              ${al("Capp. lrg", "Cappuccino · Large")}${al("Almd crois", "Almond croissant")}${al("Ban bread slice", "Banana bread")}${al("Oat flat wht", "Flat white · Oat milk")}
            </ul>
          </div>
        </div>`,
);

const after = sec(
  "After approval",
  "#fff",
  `
        <div data-alias="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          ${img("hb/slots/stack-img-1.png", "Products ready to sell on the Noxtill register", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
          <div>${h2("After approval", "Ready to sell the same day.", "Approved products appear in Products and Services with their category and price, so you can ring them up at the counter and list them online without typing a single line.")}
            <ul style="margin: 24px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; font-size: 14.5px; color: #4B5A52;">
              ${["New products are created; matched lines use the product you already have", "Prices and categories are editable before you approve", "Nothing changes in your catalogue until you approve"].map((x) => `<li style="display: flex; gap: 10px;">${icon("check-circle", 18, "#16A85F")}${esc(x)}</li>`).join("")}
            </ul>
          </div>
        </div>`,
);

const body = `${hero}${alias}${after}${faq(
  "Product digitization questions.",
  [
    ["What can I turn into products?", "Menus, printed or handwritten price lists, supplier catalogues and product sheets, as photos or PDFs."],
    ["Will it create duplicates of products I already have?", "It suggests a match when a line looks like an existing product and lets you choose. Confirmed matches are remembered for next time."],
    ["Does it set the category?", "It suggests one from the page, such as the menu heading, and you can change it before approving."],
    ["Can I fix a price before it goes live?", "Yes. Every name, category and price can be edited during review."],
    ["When do the products appear in my catalogue?", "Only after you approve them in the review step."],
  ],
  [["Inventory from Photos", "/features/inventory-from-photos"], ["Review & Approve Data", "/features/review-approve-data"], ["Data Extraction", "/features/data-extraction"]],
)}${closing("From paper menu to live catalogue.", "Start a 14-day free trial or book a demo to digitize your first menu.")}`;

module.exports = {
  slug: "features--product-digitization",
  html: page({ route, title: "Product Digitization — Menus to Catalogue | Noxtill", desc: "Photograph a menu, price list or catalogue and Noxtill turns each line into a product with name, category and price, matched to what you already sell.", css }, body),
};
