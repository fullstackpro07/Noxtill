/* eslint-disable @typescript-eslint/no-require-imports */
// /features/digital-twin — built around a living map of the business: branches, stock, staff, customers
// and suppliers as connected nodes, then a "ripple" view of how one change travels through the model.
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/digital-twin";
const css = `
  @media (max-width: 1080px) { [data-dt2], [data-ripple] { grid-template-columns: minmax(0,1fr) !important; } }`;

// Node graph (viewBox 900×420).
const N = {
  core: [450, 210, "Your business", "store", 46],
  b1: [190, 110, "Downtown branch", "building", 30],
  b2: [190, 310, "Airport branch", "building", 30],
  stock: [450, 60, "Stock · 412 items", "boxes", 28],
  staff: [450, 360, "Staff · 18 people", "users", 28],
  cust: [710, 110, "Customers · 3,240", "heart", 30],
  sup: [710, 310, "Suppliers · 9", "truck", 28],
};
const E = [["core", "b1"], ["core", "b2"], ["core", "stock"], ["core", "staff"], ["core", "cust"], ["core", "sup"], ["b1", "stock"], ["b2", "staff"], ["sup", "stock"], ["cust", "b1"]];
const graph = `
          <svg viewBox="0 0 900 420" role="img" aria-label="Digital twin map connecting the business to two branches, stock, staff, customers and suppliers (example data)" style="width: 100%; height: auto; display: block;">
            ${E.map(([a, b]) => `<line x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}" stroke="rgba(143,224,179,.35)" stroke-width="1.5" stroke-dasharray="${a === "core" ? "0" : "4 5"}"/>`).join("")}
            ${Object.values(N).map(([x, y, label, , r]) => `<circle cx="${x}" cy="${y}" r="${r + 10}" fill="rgba(47,211,154,.08)"/><circle cx="${x}" cy="${y}" r="${r}" fill="${r > 40 ? "#2FD39A" : "#173D2E"}" stroke="#2FD39A" stroke-width="1.5"/><text x="${x}" y="${y + r + 24}" text-anchor="middle" fill="#E8F3EC" font-size="14" font-weight="600" font-family="Instrument Sans, system-ui, sans-serif">${esc(label)}</text>`).join("")}
            <text x="450" y="216" text-anchor="middle" fill="#06372A" font-size="13" font-weight="700" font-family="Instrument Sans, system-ui, sans-serif">LIVE</text>
          </svg>`;

const hero = `
    <section aria-label="Digital Twin" data-pad="1" style="background: linear-gradient(180deg, #0F2A1F 0%, #0B2219 100%); padding: 30px 28px 64px; color: #fff;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Business Intelligence", "/ai/insights-recommendations", "Digital Twin", "rgba(255,255,255,.7)")}
        <div style="text-align: center; max-width: 780px; margin: 34px auto 0;">
          ${eyebrow("Digital Twin", "#8FE0B3")}
          <h1 data-h1="1" style="margin: 0; font-size: 58px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">A working model<br><span style="color: #2FD39A;">of your whole business.</span></h1>
          <p style="margin: 20px auto 0; max-width: 580px; font-size: 16.5px; line-height: 1.7; color: rgba(255,255,255,.78);">Digital Twin keeps a live model of how your branches, stock, staff, customers and suppliers connect, updated from your records as they change. Ask what happens if one part moves, and see the whole picture move with it.</p>
          <div style="display: flex; justify-content: center;">${ctas("Start Free Trial", true)}</div>
        </div>
        <div style="margin-top: 40px;">${graph}</div>
      </div>
    </section>`;

// Ripple: one change and its knock-on effects.
const step = (n, title, d, tone) => `<li style="position: relative; padding: 0 0 22px 44px;"><span style="position: absolute; left: 0; top: 0; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: ${tone}; color: #fff; font-size: 13px; font-weight: 700;">${n}</span><b style="display: block; font-size: 15px;">${title}</b><span style="font-size: 13.5px; line-height: 1.55; color: #4B5A52;">${d}</span></li>`;
const ripple = sec(
  "Follow a change through",
  "#fff",
  `
        <div data-ripple="1" style="display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 56px; align-items: start;">
          <div>${h2("Follow a change through", "Move one piece. Watch the rest respond.", "Because every part of the model is connected, a change in one place shows its knock-on effects everywhere else, before it happens for real.")}</div>
          <div style="${CARD} padding: 24px;" role="img" aria-label="Ripple of a supplier delay through stock, sales, staff and customers (example data)">
            <p style="margin: 0 0 18px; display: flex; justify-content: space-between; align-items: center; gap: 10px;"><b style="font-size: 15px;">If the dairy supplier is 3 days late</b>${pill("Ripple view", "info")}</p>
            <ol style="margin: 0; padding: 0; list-style: none; border-left: 2px dashed #E4DED2; margin-left: 14px; padding-left: 0;">
              ${step(1, "Stock", "Milk at the Airport branch runs out on day 2; Downtown has 4 days of cover.", "#B98A1F")}
              ${step(2, "Sales", "About 140 milk-based drinks at risk at the Airport branch.", "#A12C1F")}
              ${step(3, "Branches", "Moving 20 L from Downtown covers the gap with a day to spare.", "#0B6B3F")}
              ${step(4, "Customers", "No loyalty orders affected if the transfer goes out today.", "#16A85F")}
            </ol>
          </div>
        </div>`,
);

const tiles = sec(
  "What the model includes",
  "#F6F4EE",
  `${h2("What the model includes", "Built from the records you already keep.", "There’s nothing extra to fill in. The twin is assembled from the modules you already use and stays current as sales, deliveries and shifts are recorded.")}
        <div data-dt2="1" style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 36px;">
          ${[["building", "Branches", "Opening hours, sales patterns and margins per location."], ["boxes", "Stock", "Levels, selling speed and cover at each branch."], ["users", "Staff", "Shifts, skills and the hours each location runs on."], ["heart", "Customers", "Visit habits, spend and credit, grouped the way you segment them."], ["truck", "Suppliers", "Lead times and the products that depend on them."], ["wallet", "Money", "Cash, credit owed and costs as they’re recorded."]].map(([ic, t, d]) => `<div style="${CARD} padding: 20px;">${icon(ic, 22, "#0B6B3F")}<p style="margin: 12px 0 4px; font-size: 15.5px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`).join("")}
        </div>`,
);

const body = `${hero}${ripple}${tiles}${faq(
  "Digital Twin questions.",
  [
    ["What is a digital twin of a business?", "A live model of how the parts of your business connect — branches, stock, staff, customers, suppliers and money — kept up to date from your own records."],
    ["Do I need to set it up?", "No. It is built from the modules you already use, such as Sales, Inventory, Staff, Customers and Branches."],
    ["How is it different from the Business Simulator?", "The twin is the model of your business as it is now. The Simulator uses that model to test a specific decision and compare scenarios."],
    ["Does exploring a change affect real data?", "No. Changes you explore in the twin stay in the model until you act on them in the real module."],
    ["How current is the model?", "It updates as records are saved, so sales, deliveries and shifts appear as they happen."],
  ],
  [["Business Simulator", "/features/business-simulator"], ["Business Brain", "/features/business-brain"], ["AI-Powered Insights", "/features/ai-powered-insights"]],
)}${closing("See how every part of the business connects.", "Start a 14-day free trial or book a demo to explore your own twin.")}`;

module.exports = {
  slug: "features--digital-twin",
  html: page({ route, title: "Digital Twin — A Live Model of Your Business | Noxtill", desc: "A live model of how your branches, stock, staff, customers and suppliers connect, so you can see how one change ripples through the business.", css }, body),
};
