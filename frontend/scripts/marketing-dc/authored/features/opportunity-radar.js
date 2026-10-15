/* eslint-disable @typescript-eslint/no-require-imports */
// /features/opportunity-radar — built around a radar: opportunities and risks plotted by size (distance
// from the centre = how soon) on a dark scope, then one opportunity opened up with its evidence,
// confidence and the choices you have (look into it, watch it, dismiss with a reason).
// Module: (app)/business-brain Opportunity view (opportunities and risks, confidence, watch, dismiss).
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/opportunity-radar";
const css = `
  @media (max-width: 1080px) { [data-orhero], [data-or2] { grid-template-columns: minmax(0,1fr) !important; } [data-scope] { max-width: 520px; margin: 0 auto; } }
  @media (max-width: 640px) { [data-legend] { grid-template-columns: minmax(0,1fr) !important; } }`;

// Blips: [angle deg, radius 0..1, size, kind, label]
const BLIPS = [
  [-38, 0.34, 15, "opp", "Weekend brunch demand"],
  [24, 0.58, 11, "opp", "Lapsed regulars"],
  [118, 0.46, 13, "risk", "Credit overdue"],
  [168, 0.78, 9, "risk", "Low reviews · 2 stars"],
  [212, 0.3, 10, "opp", "Bundle best-sellers", "left"],
  [290, 0.66, 12, "risk", "Supplier price rise"],
];
const C = 200, R = 178;
const blip = ([a, r, s, kind, label, side]) => {
  const x = C + Math.cos((a * Math.PI) / 180) * R * r, y = C + Math.sin((a * Math.PI) / 180) * R * r;
  const col = kind === "opp" ? "#2FD39A" : "#F2C46B";
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s + 8}" fill="${col}" opacity=".16"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s / 2 + 3}" fill="${col}"/><text x="${(side === "left" ? x - s / 2 - 10 : x + s / 2 + 10).toFixed(1)}" y="${(y + 4).toFixed(1)}"${side === "left" ? ' text-anchor="end"' : ""} fill="#E8F3EC" font-size="12" font-family="Instrument Sans, system-ui, sans-serif">${esc(label)}</text>`;
};
const scope = `
            <svg data-scope="1" viewBox="-10 0 430 400" role="img" aria-label="Opportunity radar with three opportunities and three risks; nearer the centre means sooner" style="width: 100%; max-width: 460px; height: auto; display: block; margin: 0 auto;">
              <defs><radialGradient id="orsweep" cx="0" cy="0" r="1"><stop offset="0" stop-color="#2FD39A" stop-opacity=".35"/><stop offset="1" stop-color="#2FD39A" stop-opacity="0"/></radialGradient></defs>
              <circle cx="${C}" cy="${C}" r="${R}" fill="#0B2219" stroke="rgba(143,224,179,.35)"/>
              ${[0.33, 0.66].map((k) => `<circle cx="${C}" cy="${C}" r="${(R * k).toFixed(1)}" fill="none" stroke="rgba(143,224,179,.18)"/>`).join("")}
              <line x1="${C - R}" y1="${C}" x2="${C + R}" y2="${C}" stroke="rgba(143,224,179,.14)"/><line x1="${C}" y1="${C - R}" x2="${C}" y2="${C + R}" stroke="rgba(143,224,179,.14)"/>
              <path d="M${C} ${C} L${C + R} ${C} A${R} ${R} 0 0 0 ${(C + Math.cos(-Math.PI / 4) * R).toFixed(1)} ${(C + Math.sin(-Math.PI / 4) * R).toFixed(1)} Z" fill="url(#orsweep)" transform="translate(${C} ${C}) scale(1) translate(-${C} -${C})"/>
              ${BLIPS.map(blip).join("")}
              <text x="${C}" y="${C - R * 0.33 + 14}" text-anchor="middle" fill="rgba(232,243,236,.45)" font-size="10" font-family="Instrument Sans, system-ui, sans-serif">THIS WEEK</text>
              <text x="${C}" y="${C - R * 0.66 + 14}" text-anchor="middle" fill="rgba(232,243,236,.45)" font-size="10" font-family="Instrument Sans, system-ui, sans-serif">THIS MONTH</text>
            </svg>`;

const hero = `
    <section aria-label="Opportunity Radar" data-pad="1" style="background: #0F2A1F; padding: 30px 28px 70px; color: #fff;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Business Intelligence", "/ai/insights-recommendations", "Opportunity Radar", "rgba(255,255,255,.7)")}
        <div data-orhero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center; margin-top: 28px;">
          <div>
            ${eyebrow("Opportunity Radar", "#8FE0B3")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">See the next win<br><span style="color: #2FD39A;">before it walks past.</span></h1>
            <p style="margin: 20px 0 0; max-width: 480px; font-size: 16.5px; line-height: 1.7; color: rgba(255,255,255,.78);">Opportunity Radar puts the openings and the risks in your own numbers on one screen, sized by what they’re worth and placed by how soon they matter.</p>
            ${ctas("Start Free Trial", true)}
            <p style="margin: 26px 0 0; display: flex; gap: 22px; font-size: 13px; color: rgba(255,255,255,.75);"><span style="display: flex; align-items: center; gap: 8px;"><span style="width: 10px; height: 10px; border-radius: 50%; background: #2FD39A;"></span>Opportunity</span><span style="display: flex; align-items: center; gap: 8px;"><span style="width: 10px; height: 10px; border-radius: 50%; background: #F2C46B;"></span>Risk</span><span>Nearer the centre = sooner</span></p>
          </div>
          <div>${scope}</div>
        </div>
      </div>
    </section>`;

// One opportunity opened.
const evidence = (label, val) => `<div style="padding: 12px 14px; border-radius: 10px; background: #F6F4EE;"><span style="display: block; font-size: 11.5px; color: #6B776F;">${label}</span><b style="font-size: 18px;">${val}</b></div>`;
const detail = sec(
  "Inside an opportunity",
  "#fff",
  `
        <div data-or2="1" style="display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: 56px; align-items: start;">
          <div style="${CARD} padding: 24px; box-shadow: 0 30px 60px -36px rgba(8,30,20,.35);" role="img" aria-label="Opportunity detail for weekend brunch demand with evidence, confidence and actions (example data)">
            <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center;"><span style="display: flex; align-items: center; gap: 10px;">${icon("trending-up", 22, "#16A85F")}<b style="font-size: 17px;">Weekend brunch demand</b></span>${pill("Opportunity", "good")}</div>
            <p style="margin: 10px 0 18px; font-size: 14px; line-height: 1.6; color: #4B5A52;">Saturday 10:00–12:00 sales are up four weeks running, and 9 of the 12 brunch items sold out before noon last Saturday.</p>
            <div style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px;">${evidence("Saturday late-morning sales", "+31%")}${evidence("Items sold out by 12:00", "9 of 12")}${evidence("Weeks in a row", "4")}</div>
            <p style="margin: 18px 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #6B776F;">CONFIDENCE</p>
            <div style="display: flex; align-items: center; gap: 12px;"><div style="flex: 1; height: 8px; border-radius: 99px; background: #E4DED2;"><div style="width: 72%; height: 100%; border-radius: 99px; background: #16A85F;"></div></div><b style="font-size: 13px;">High · 4 weeks of data</b></div>
            <p style="margin: 20px 0 0; display: flex; flex-wrap: wrap; gap: 10px;"><span style="padding: 9px 14px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 13px; font-weight: 600;">Look into it</span><span style="padding: 9px 14px; border-radius: 8px; border: 1px solid rgba(16,32,26,.15); font-size: 13px; font-weight: 600;">Watch it</span><span style="padding: 9px 14px; border-radius: 8px; border: 1px solid rgba(16,32,26,.15); font-size: 13px; font-weight: 600; color: #6B776F;">Dismiss with a reason</span></p>
          </div>
          <div>${h2("Evidence first", "Every blip shows its working.", "Open any opportunity or risk and you see the records behind it, how confident the read is and how long the pattern has held. If the data is thin, it says so instead of overstating.")}
            <div data-legend="1" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 26px;">
              ${[["search", "Look into it", "Open the sales, customers or stock behind the signal."], ["eye", "Watch it", "Add it to your watchlist and get told when it moves."], ["x-circle", "Dismiss", "Say why, so it isn’t raised again for the same reason."], ["check-circle", "Resolved", "It leaves the radar when the numbers recover."]].map(([ic, t, d]) => `<div style="padding: 16px; border-radius: 12px; background: #F6F4EE;">${icon(ic, 18, "#0B6B3F")}<b style="display: block; margin: 8px 0 4px; font-size: 14px;">${t}</b><span style="font-size: 13px; line-height: 1.55; color: #4B5A52;">${d}</span></div>`).join("")}
            </div>
          </div>
        </div>`,
);

const kinds = sec(
  "What it looks for",
  "#F6F4EE",
  `${h2("What it looks for", "Openings and warning signs, side by side.", "The same scan that finds a growing product also notices the customers drifting away, so you see both before deciding where to spend the week.")}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 36px;">
          ${[["growth-arrow", "Rising demand", "Products, hours or branches selling faster than usual."], ["users", "Customers drifting", "Regular buyers who have stopped coming back."], ["wallet", "Money waiting", "Credit past due and promises to pay that slipped."], ["star", "Reputation", "Low-rated reviews that need a reply."], ["percent", "Margin leaks", "Discounts beyond your policy and items sold without a cost."], ["truck", "Delivery trouble", "Orders that failed to arrive and repeat problems by area."]].map(([ic, t, d]) => `<div style="${CARD} padding: 20px;">${icon(ic, 22, "#0B6B3F")}<p style="margin: 12px 0 4px; font-size: 15.5px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`).join("")}
        </div>`,
);

const body = `${hero}${detail}${kinds}${faq(
  "Opportunity Radar questions.",
  [
    ["Where do the opportunities come from?", "From checks over your own sales, customers, credit, stock, reviews and deliveries in Noxtill. Nothing is pulled from outside data."],
    ["What does confidence mean?", "How much data supports the signal and how long the pattern has held. Short or noisy patterns are marked lower."],
    ["Can I stop seeing something?", "Yes. Dismiss it with a reason and it won’t be raised again for the same reason."],
    ["Does it take action on its own?", "No. It shows the signal and the evidence. Any action is prepared for you and runs only after you approve it."],
    ["How is this different from Business Brain?", "Business Brain is your daily briefing. Opportunity Radar is the full map of openings and risks, ranked by size and urgency."],
  ],
  [["Business Brain", "/features/business-brain"], ["Intelligence Alerts", "/features/intelligence-alerts"], ["Business Simulator", "/features/business-simulator"]],
)}${closing("Spend the week on what’s worth the most.", "Start a 14-day free trial or book a demo to see your own radar.")}`;

module.exports = {
  slug: "features--opportunity-radar",
  html: page({ route, title: "Opportunity Radar — Openings and Risks, Ranked | Noxtill", desc: "See the opportunities and risks in your own numbers on one radar, sized by value and placed by urgency, each with its evidence and confidence.", css }, body),
};
