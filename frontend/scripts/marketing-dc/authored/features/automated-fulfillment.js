/* eslint-disable @typescript-eslint/no-require-imports */
// /features/automated-fulfillment — built around the fulfillment lanes: Paid → Picked → Packed → Shipped →
// Delivered as columns of order cards, then a packing slip with its label, and the customer updates
// each lane sends.
// Autonomous Commerce (owner decision 2026-10-15: written as a live feature).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/automated-fulfillment";
const css = `
  @media (max-width: 1080px) { [data-lanes] { overflow-x: auto; } [data-lanes] > div { min-width: 980px; } [data-af2] { grid-template-columns: minmax(0,1fr) !important; } }`;

const card = (no, who, items, tag) => `<div style="padding: 12px; border-radius: 12px; background: #fff; box-shadow: 0 6px 16px -10px rgba(8,30,20,.3);"><p style="margin: 0; display: flex; justify-content: space-between; gap: 6px;"><b style="font-size: 13px;">#${no}</b>${tag || ""}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #4B5A52;">${esc(who)}</p><p style="margin: 2px 0 0; font-size: 11.5px; color: #8A968F;">${items}</p></div>`;
const lane = (title, ic, n, cards, tone) => `
            <div style="padding: 12px; border-radius: 16px; background: ${tone};">
              <p style="margin: 0 0 10px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: #10201A;"><span style="display: flex; align-items: center; gap: 7px;">${icon(ic, 15, "#0B6B3F")}${title}</span><span style="padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,.75); font-size: 11.5px;">${n}</span></p>
              <div style="display: grid; gap: 8px;">${cards}</div>
            </div>`;

const hero = `
    <section aria-label="Automated Fulfillment" data-pad="1" style="background: #F6F4EE; padding: 30px 28px 70px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Autonomous Commerce", "/ai/autonomous-commerce", "Automated Fulfillment")}
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 30px; align-items: flex-end; margin-top: 30px;">
          <div style="max-width: 640px;">
            ${eyebrow("Automated Fulfillment")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">From “paid” to “delivered”<br>without the busywork.</h1>
            <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Paid orders move themselves through picking, packing and shipping. Labels are created, customers are kept updated, and your team only handles the boxes.</p>
          </div>
          ${ctas("Start Free Trial")}
        </div>
        <div data-lanes="1" role="img" aria-label="Fulfillment lanes: paid, picked, packed, shipped, delivered, with order cards in each (example data)" style="margin-top: 44px;">
          <div style="display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 12px;">
            ${lane("Paid", "card", 3, card(1052, "Maya R. · Austin", "2 items", pill("New", "info")) + card(1051, "Leo K. · Dallas", "1 item") + card(1050, "Ana P. · Austin", "3 items"), "#E4DED2")}
            ${lane("Picked", "checklist", 2, card(1049, "Sam T. · Houston", "1 item") + card(1048, "Jo W. · Austin", "4 items"), "#E8E2D6")}
            ${lane("Packed", "package", 2, card(1047, "Priya N. · Plano", "2 items", pill("Label ready", "good")) + card(1046, "Ben O. · Austin", "1 item", pill("Label ready", "good")), "#DFEBE2")}
            ${lane("Shipped", "truck", 3, card(1045, "Kim L. · Waco", "1 item") + card(1044, "Ravi S. · Dallas", "2 items") + card(1043, "Eva M. · Austin", "1 item"), "#D7E8DC")}
            ${lane("Delivered", "check-circle", 18, card(1042, "Tom B. · Austin", "Delivered 10:42", pill("Done", "good")), "#CFE6D6")}
          </div>
        </div>
      </div>
    </section>`;

const slip = sec(
  "Labels and packing slips",
  "#fff",
  `
        <div data-af2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div style="display: grid; grid-template-columns: minmax(0,1.1fr) minmax(0,0.9fr); gap: 14px;" role="img" aria-label="Packing slip and shipping label for order 1047 (example data)">
            <div style="${CARD} padding: 18px; font-size: 12.5px;">
              <p style="margin: 0 0 10px; display: flex; justify-content: space-between;"><b style="font-size: 14px;">Packing slip · #1047</b><span style="color: #6B776F;">Willow &amp; Pine</span></p>
              ${[["Ceramic planter, sage", 1], ["Scented candle, fig", 1]].map(([n, q]) => `<p style="margin: 0; display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid rgba(16,32,26,.07);"><span>${n}</span><b>× ${q}</b></p>`).join("")}
              <p style="margin: 12px 0 0; padding: 10px; border-radius: 8px; background: #F6F4EE; color: #4B5A52;">Gift note: “Happy housewarming! — Sam”</p>
            </div>
            <div style="padding: 16px; border-radius: 12px; border: 2px solid #10201A; background: #fff; font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; line-height: 1.5;">
              <b style="font-size: 13px;">PRIYA NAIR</b><br>4410 Elm Creek Dr<br>Plano, TX 75024
              <div aria-hidden="true" style="height: 46px; margin: 12px 0 6px; background: repeating-linear-gradient(90deg, #10201A 0 2px, transparent 2px 4px, #10201A 4px 7px, transparent 7px 9px);"></div>
              1Z 4F7 0A3 03 9182 4471
            </div>
          </div>
          <div>${h2("Labels and packing slips", "Packed means ready to go.", "When an order is packed, its shipping label and packing slip are created from the order, with the carrier and service chosen by your rules. Print them together and drop the box at collection.")}
          </div>
        </div>`,
);

const updates = sec(
  "Customers kept in the loop",
  "#F6F4EE",
  `
        <div data-af2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("Customers kept in the loop", "Updates go out at every step.", "Order confirmed, shipped with tracking, out for delivery, delivered. Each message goes out by email or WhatsApp as the order moves, in your wording.")}
            <ol style="margin: 24px 0 0; padding: 0; list-style: none; display: grid; gap: 10px;">
              ${[["mail", "Order confirmed", "Sent when payment clears"], ["truck", "Shipped", "With the tracking link"], ["navigation", "Out for delivery", "On the day it arrives"], ["check-circle", "Delivered", "With a link to leave a review"]].map(([ic, t, d]) => `<li style="display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; background: #fff;">${icon(ic, 20, "#0B6B3F")}<span><b style="display: block; font-size: 14px;">${t}</b><span style="font-size: 13px; color: #4B5A52;">${d}</span></span></li>`).join("")}
            </ol>
          </div>
          ${img("np/pasted-1788889121102-0-mtsye7wd-rliz.png", "Order shipped, out for delivery and delivered", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
        </div>`,
);

const body = `${hero}${slip}${updates}${faq(
  "Automated fulfillment questions.",
  [
    ["What happens automatically after an order is paid?", "It is routed to a location, added to a pick list, and gets its label and packing slip when packed. The customer gets an update at each step."],
    ["Which carriers can I use?", "Your connected shipping carriers, or your own delivery riders for local orders."],
    ["Can I hold an order back?", "Yes. Put any order on hold, for example to check an address, and it stops moving until you release it."],
    ["Do customers get tracking?", "Yes. The shipped message includes the tracking link, followed by out-for-delivery and delivered updates."],
    ["Can I change the customer messages?", "Yes. Each update uses your wording and can go by email or WhatsApp."],
  ],
  [["Order Optimization", "/features/order-optimization"], ["Smart Inventory", "/features/smart-inventory"], ["Commerce Within Your Rules", "/features/commerce-within-your-rules"]],
)}${closing("Let orders move themselves.", "Start a 14-day free trial or book a demo to automate your fulfillment.")}`;

module.exports = {
  slug: "features--automated-fulfillment",
  html: page({ route, title: "Automated Order Fulfillment | Noxtill", desc: "Paid orders move through picking, packing and shipping on their own, with labels created and customers updated at every step.", css }, body),
};
