/* eslint-disable @typescript-eslint/no-require-imports */
// /features/dynamic-pricing — built around one product's price line moving inside its guard rails: a
// chart with the floor, ceiling and minimum-margin bands, then the rule card that sets them and the
// approval queue for changes beyond the auto-approve limit.
// Autonomous Commerce (owner decision 2026-10-15: written as a live feature).
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/dynamic-pricing";
const css = `
  @media (max-width: 1080px) { [data-dp2] { grid-template-columns: minmax(0,1fr) !important; } }`;

// Price chart (viewBox 760×300): floor 22, ceiling 34, price wanders between.
const P = [26, 26, 27.5, 27.5, 29, 30.5, 30.5, 29, 28, 31.5, 33, 32, 30, 29.5];
const X0 = 50, X1 = 740, Y = (v) => 270 - ((v - 18) / 20) * 250;
const pts = P.map((v, i) => [X0 + (i * (X1 - X0)) / (P.length - 1), Y(v)]);
const chart = `
          <svg viewBox="0 0 760 300" role="img" aria-label="Price of a ceramic planter over 14 days moving between a $22 floor and a $34 ceiling (example data)" style="width: 100%; height: auto; display: block;">
            <rect x="${X0}" y="${Y(34)}" width="${X1 - X0}" height="${Y(22) - Y(34)}" fill="rgba(47,211,154,.10)"/>
            <line x1="${X0}" y1="${Y(34)}" x2="${X1}" y2="${Y(34)}" stroke="#F2C46B" stroke-width="2" stroke-dasharray="6 6"/>
            <line x1="${X0}" y1="${Y(22)}" x2="${X1}" y2="${Y(22)}" stroke="#F2C46B" stroke-width="2" stroke-dasharray="6 6"/>
            <text x="${X1}" y="${Y(34) - 8}" text-anchor="end" fill="#F2C46B" font-size="13" font-family="Instrument Sans, system-ui, sans-serif">Ceiling $34</text>
            <text x="${X1}" y="${Y(22) + 20}" text-anchor="end" fill="#F2C46B" font-size="13" font-family="Instrument Sans, system-ui, sans-serif">Floor $22 · keeps 40% margin</text>
            <polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="#2FD39A" stroke-width="3" stroke-linejoin="round"/>
            ${pts.map(([x, y], i) => (i === 9 || i === pts.length - 1 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#0F2A1F" stroke="#2FD39A" stroke-width="3"/>` : "")).join("")}
            <text x="${pts[9][0].toFixed(1)}" y="${(pts[9][1] - 14).toFixed(1)}" text-anchor="middle" fill="#E8F3EC" font-size="12" font-family="Instrument Sans, system-ui, sans-serif">Weekend demand +$3.50</text>
            ${["Day 1", "Day 7", "Day 14"].map((t, i) => `<text x="${X0 + i * ((X1 - X0) / 2)}" y="296" text-anchor="${["start", "middle", "end"][i]}" fill="rgba(232,243,236,.5)" font-size="12" font-family="Instrument Sans, system-ui, sans-serif">${t}</text>`).join("")}
          </svg>`;

const hero = `
    <section aria-label="Dynamic Pricing" data-pad="1" style="background: #0F2A1F; padding: 30px 28px 70px; color: #fff;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Autonomous Commerce", "/ai/autonomous-commerce", "Dynamic Pricing", "rgba(255,255,255,.7)")}
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 30px; align-items: flex-end; margin-top: 30px;">
          <div style="max-width: 640px;">
            ${eyebrow("Dynamic Pricing", "#8FE0B3")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Prices that move with demand.<br><span style="color: #2FD39A;">Never past your limits.</span></h1>
            <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: rgba(255,255,255,.78);">Noxtill adjusts your online prices as demand, stock and costs change, always between the floor and ceiling you set and never below your minimum margin.</p>
          </div>
          ${ctas("Start Free Trial", true)}
        </div>
        <div style="margin-top: 44px; padding: 24px; border-radius: 20px; background: rgba(255,255,255,.04); border: 1px solid rgba(143,224,179,.2);">
          <p style="margin: 0 0 14px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;"><b style="font-size: 15px;">Ceramic planter · last 14 days</b><span style="font-size: 13px; color: rgba(255,255,255,.7);">Now <b style="color: #fff;">$29.50</b> · 18 sold this week</span></p>
          ${chart}
        </div>
      </div>
    </section>`;

const fieldRow = (label, val, hint) => `<div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 0; border-top: 1px solid rgba(16,32,26,.07);"><span><b style="display: block; font-size: 14px;">${label}</b><span style="font-size: 12px; color: #6B776F;">${hint}</span></span><span style="padding: 7px 12px; border-radius: 8px; background: #F6F4EE; font-size: 14px; font-weight: 700; white-space: nowrap;">${val}</span></div>`;
const rules = sec(
  "Your pricing rules",
  "#fff",
  `
        <div data-dp2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("Your pricing rules", "You draw the lines. It works inside them.", "Set the lowest and highest price, the margin you won’t go under and how far a price may move on its own. Anything bigger waits for you.")}
            <ul style="margin: 24px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; font-size: 14.5px; color: #4B5A52;">
              ${["Rules per product, per collection or for the whole store", "Prices in your store, POS and channels stay in step", "Every change logged with the reason and the old price"].map((x) => `<li style="display: flex; gap: 10px;">${icon("check-circle", 18, "#16A85F")}${esc(x)}</li>`).join("")}
            </ul>
          </div>
          <div style="${CARD} padding: 22px; box-shadow: 0 30px 60px -40px rgba(8,30,20,.35);" role="img" aria-label="Pricing rule for the Planters collection (example values)">
            <p style="margin: 0 0 6px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 16px;">Rule · Planters collection</b>${pill("Active", "good")}</p>
            ${fieldRow("Price floor", "$22.00", "Never sell below this")}${fieldRow("Price ceiling", "$34.00", "Never charge more than this")}${fieldRow("Minimum margin", "40%", "Based on your product cost")}${fieldRow("Auto-approve changes up to", "15%", "Bigger moves wait for you")}${fieldRow("Check prices", "Every 6 hours", "Using demand, stock and cost")}
          </div>
        </div>`,
);

const q = (name, from, to, why) => `<li style="display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 14px; align-items: center; padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid rgba(16,32,26,.08);"><span><b style="display: block; font-size: 14px;">${esc(name)}</b><span style="font-size: 12.5px; color: #6B776F;">${esc(why)}</span></span><span style="text-align: right;"><span style="font-size: 13px; color: #6B776F; text-decoration: line-through;">${from}</span> <b style="font-size: 15px;">${to}</b></span></li>`;
const approvals = sec(
  "Big changes wait for you",
  "#F6F4EE",
  `${h2("Big changes wait for you", "Over your limit? It asks first.", "Small moves inside your rules happen on their own. A drop or rise beyond your auto-approve limit lands in your approval queue with the reason, so a big change never surprises you.")}
        <div style="${CARD} margin-top: 36px; padding: 18px;" role="img" aria-label="Two price changes waiting for approval because they exceed the 15 percent limit (example data)">
          <p style="margin: 0 0 12px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px;">Waiting for approval</b>${pill("2 over your 15% limit", "warn")}</p>
          <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 10px;">
            ${q("Linen cushion", "$36.00", "$29.00", "Slow seller · 64 in stock · 19% drop")}${q("Scented candle", "$24.00", "$28.50", "Sold out twice this month · 19% rise")}
          </ul>
          <p style="margin: 14px 0 0; display: flex; justify-content: flex-end; gap: 8px;"><span style="padding: 9px 14px; border-radius: 8px; border: 1px solid rgba(16,32,26,.15); font-size: 13px; font-weight: 600;">Decline</span><span style="padding: 9px 16px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 13px; font-weight: 600;">Approve both</span></p>
        </div>`,
);

const body = `${hero}${rules}${approvals}${faq(
  "Dynamic pricing questions.",
  [
    ["What makes a price change?", "Demand, stock levels and your product costs, checked on the schedule you set."],
    ["Can a price ever go below my floor?", "No. Prices always stay between your floor and ceiling and above your minimum margin."],
    ["What happens to big price changes?", "Any change bigger than your auto-approve limit waits in your approval queue with the reason."],
    ["Will my channels show different prices?", "No. The same price is kept in step across your online store, POS and connected channels."],
    ["Can I see what changed and why?", "Yes. Every change is logged with the old price, the new price and the reason."],
  ],
  [["Commerce Within Your Rules", "/features/commerce-within-your-rules"], ["Smart Inventory", "/features/smart-inventory"], ["AI-Powered Operations", "/features/ai-powered-operations"]],
)}${closing("Price with the market, on your terms.", "Start a 14-day free trial or book a demo to set your first pricing rule.")}`;

module.exports = {
  slug: "features--dynamic-pricing",
  html: page({ route, title: "Dynamic Pricing Within Your Limits | Noxtill", desc: "Online prices that adjust to demand, stock and cost, always between your floor and ceiling, above your minimum margin, with big changes approved by you.", css }, body),
};
