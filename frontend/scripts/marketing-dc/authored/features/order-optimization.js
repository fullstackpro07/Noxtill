/* eslint-disable @typescript-eslint/no-require-imports */
// /features/order-optimization — built around routing: a map deciding which location ships which order,
// then the batched pick list it produces, and the rules that choose (stock, distance, cost).
// Autonomous Commerce (owner decision 2026-10-15: written as a live feature).
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/order-optimization";
const css = `
  @media (max-width: 1080px) { [data-oohero], [data-oo2] { grid-template-columns: minmax(0,1fr) !important; } }`;

const LOC = { store: [220, 150, "Downtown store"], wh: [560, 250, "Warehouse"] };
const ORD = [[120, 60, "store"], [330, 70, "store"], [150, 260, "store"], [470, 120, "wh"], [690, 140, "wh"], [640, 340, "wh"], [400, 330, "wh"]];
const map = `
            <svg viewBox="0 0 780 400" role="img" aria-label="Map: seven orders routed, three to the downtown store and four to the warehouse, by stock and distance (example data)" style="width: 100%; height: auto; display: block; border-radius: 18px; background: #E9F1EA;">
              ${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100 - 120}" y2="400" stroke="#D5E4D9" stroke-width="10"/>`).join("")}
              ${Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${i * 100 + 30}" x2="780" y2="${i * 100 + 10}" stroke="#D5E4D9" stroke-width="8"/>`).join("")}
              ${ORD.map(([x, y, l]) => `<line x1="${x}" y1="${y}" x2="${LOC[l][0]}" y2="${LOC[l][1]}" stroke="${l === "store" ? "#16A85F" : "#1D5FA8"}" stroke-width="2.5" stroke-dasharray="6 5"/>`).join("")}
              ${ORD.map(([x, y, l]) => `<circle cx="${x}" cy="${y}" r="9" fill="#fff" stroke="${l === "store" ? "#16A85F" : "#1D5FA8"}" stroke-width="3"/>`).join("")}
              ${Object.entries(LOC).map(([k, [x, y, n]]) => `<rect x="${x - 22}" y="${y - 22}" width="44" height="44" rx="12" fill="${k === "store" ? "#16A85F" : "#1D5FA8"}"/><text x="${x}" y="${y + 44}" text-anchor="middle" fill="#10201A" font-size="14" font-weight="700" font-family="Instrument Sans, system-ui, sans-serif">${n}</text>`).join("")}
            </svg>`;

const hero = `
    <section aria-label="Order Optimization" data-pad="1" style="background: #fff; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Autonomous Commerce", "/ai/autonomous-commerce", "Order Optimization")}
        <div data-oohero="1" style="display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 50px; align-items: center; margin-top: 28px;">
          <div>
            ${eyebrow("Order Optimization")}
            <h1 data-h1="1" style="margin: 0; font-size: 54px; font-weight: 700; line-height: 1.04; letter-spacing: -0.04em;">Every order shipped<br>from the right place.</h1>
            <p style="margin: 20px 0 0; max-width: 470px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">When orders come in, Noxtill decides which location fills each one, using who has the stock, who is closest and what it costs to ship, then groups the picking so your team walks less.</p>
            ${ctas("Start Free Trial")}
            <p style="margin: 22px 0 0; display: flex; gap: 20px; font-size: 13px; color: #4B5A52;"><span style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 4px; background: #16A85F;"></span>Downtown store · 3</span><span style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 4px; background: #1D5FA8;"></span>Warehouse · 4</span></p>
          </div>
          <div>${map}</div>
        </div>
      </div>
    </section>`;

const pick = (bin, item, qty, orders) => `<li style="display: grid; grid-template-columns: 64px minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 10px; background: #fff; border: 1px solid rgba(16,32,26,.08);"><b style="padding: 6px 0; border-radius: 8px; background: #0F2A1F; color: #2FD39A; font-size: 13px; text-align: center;">${bin}</b><span><b style="display: block; font-size: 14px;">${esc(item)}</b><span style="font-size: 12px; color: #6B776F;">For ${orders}</span></span><b style="font-size: 16px;">× ${qty}</b></li>`;
const batch = sec(
  "Batched picking",
  "#F6F4EE",
  `
        <div data-oo2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("Batched picking", "One walk through the shelves, not seven.", "Orders going out from the same place are grouped into one pick list sorted by shelf, so a morning’s orders are gathered in a single pass and then split into parcels.")}</div>
          <div role="img" aria-label="Warehouse pick list for four orders sorted by shelf (example data)">
            <p style="margin: 0 0 12px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px;">Warehouse · pick list 3 of today</b>${pill("4 orders · 9 items", "info")}</p>
            <ol style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px;">
              ${pick("A-02", "Ceramic planter, sage", 3, "#1043, #1046, #1049")}${pick("A-07", "Linen cushion, oat", 1, "#1046")}${pick("B-11", "Scented candle, fig", 4, "#1043, #1047")}${pick("C-03", "Picture frame set", 1, "#1049")}
            </ol>
          </div>
        </div>`,
);

const how = sec(
  "How it chooses",
  "#fff",
  `${h2("How it chooses", "Clear reasons for every routing decision.", "Each order shows why it went where it did, and you can change the weighting or send any order somewhere else by hand.")}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 36px;">
          ${[["boxes", "Who has it", "Orders go to a location that can fill them completely, so they don’t ship in pieces."], ["route", "Who is closest", "Shorter trips mean faster delivery and lower shipping cost."], ["dollar", "What it costs", "Shipping and handling cost per location is weighed against speed."], ["sliders", "Your priorities", "Favour speed, cost or keeping the store stocked — your call."]].map(([ic, t, d]) => `<div style="${CARD} padding: 20px;">${icon(ic, 22, "#0B6B3F")}<p style="margin: 12px 0 4px; font-size: 15.5px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`).join("")}
        </div>`,
);

const body = `${hero}${batch}${how}${faq(
  "Order optimization questions.",
  [
    ["How does it pick the location for an order?", "By who has all the items in stock, who is closest to the customer and what it costs to ship, weighted the way you choose."],
    ["Can I override where an order ships from?", "Yes. Any order can be moved to another location by hand, and the reason is kept."],
    ["What is batched picking?", "Orders going out from the same place are grouped into one pick list sorted by shelf, so staff collect everything in one pass."],
    ["Will it split an order across locations?", "Only if you allow it. By default it prefers one location that can fill the whole order."],
    ["Does it work with my own delivery riders?", "Yes. Orders routed to a location can go to your riders or to a shipping carrier."],
  ],
  [["Automated Fulfillment", "/features/automated-fulfillment"], ["Smart Inventory", "/features/smart-inventory"], ["AI-Powered Operations", "/features/ai-powered-operations"]],
)}${closing("Ship faster from the right place.", "Start a 14-day free trial or book a demo to route your next orders.")}`;

module.exports = {
  slug: "features--order-optimization",
  html: page({ route, title: "Order Optimization — Smarter Order Routing | Noxtill", desc: "Route every order to the location that has the stock, is closest and costs least to ship, and batch picking so your team gathers orders in one pass.", css }, body),
};
