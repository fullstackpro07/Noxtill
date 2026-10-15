/* eslint-disable @typescript-eslint/no-require-imports */
// /features/business-simulator — built around the what-if panel: levers on the left (price, staff hours,
// opening days, a promotion) and the projected month on the right, then two scenarios compared side by
// side against today's baseline.
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page, img } = require("./fkit");

const route = "/features/business-simulator";
const css = `
  @media (max-width: 1080px) { [data-sim], [data-bs2] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 760px) { [data-cmp] { overflow-x: auto; } [data-cmp] table { min-width: 620px; } }`;

const lever = (label, val, pct, hint) => `
              <div style="padding: 14px 0; border-top: 1px solid rgba(16,32,26,.08);">
                <p style="margin: 0 0 10px; display: flex; justify-content: space-between; font-size: 13.5px;"><b>${label}</b><b style="color: #0B6B3F;">${val}</b></p>
                <div style="position: relative; height: 6px; border-radius: 99px; background: #E4DED2;"><div style="width: ${pct}%; height: 100%; border-radius: 99px; background: #16A85F;"></div><span style="position: absolute; left: calc(${pct}% - 9px); top: -6px; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #16A85F;"></span></div>
                <p style="margin: 8px 0 0; font-size: 11.5px; color: #6B776F;">${hint}</p>
              </div>`;
const bar = (label, base, next, max, fmt) => `
              <div style="margin-top: 16px;">
                <p style="margin: 0 0 6px; display: flex; justify-content: space-between; font-size: 13px;"><span style="color: rgba(255,255,255,.72);">${label}</span><b>${fmt(next)} <span style="color: ${next >= base ? "#16A85F" : "#A12C1F"}; font-weight: 600;">${next >= base ? "+" : "−"}${fmt(Math.abs(next - base))}</span></b></p>
                <div style="position: relative; height: 12px; border-radius: 6px; background: rgba(255,255,255,.1);"><div style="width: ${(base / max) * 100}%; height: 100%; border-radius: 6px; background: rgba(255,255,255,.28);"></div><div style="position: absolute; left: 0; top: 0; width: ${(next / max) * 100}%; height: 100%; border-radius: 6px; background: ${next >= base ? "rgba(22,168,95,.75)" : "rgba(161,44,31,.6)"};"></div></div>
              </div>`;
const money = (n) => "$" + n.toLocaleString("en-US");

const hero = `
    <section aria-label="Business Simulator" data-pad="1" style="background: #F6F4EE; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Business Intelligence", "/ai/insights-recommendations", "Business Simulator")}
        <div style="max-width: 760px; margin-top: 30px;">
          ${eyebrow("Business Simulator")}
          <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Try the decision<br>before you make it.</h1>
          <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Raise a price, cut an hour, open on Sundays. The simulator runs the change against your real sales, costs and staffing and shows what the month would likely look like.</p>
          ${ctas("Start Free Trial")}
        </div>
        <div data-sim="1" role="img" aria-label="Simulator with four levers and the projected month: revenue, gross profit, staff cost and net profit compared with today (example data)" style="display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 0; margin-top: 46px; ${CARD} border-radius: 20px; overflow: hidden; box-shadow: 0 34px 70px -40px rgba(8,30,20,.4);">
          <div style="padding: 22px 24px; background: #fff;">
            <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .1em; color: #6B776F;">WHAT IF…</p>
            ${lever("Coffee prices", "+5%", 62, "Applied to 18 hot drinks")}
            ${lever("Weekday staff hours", "−6 h / week", 38, "Tue–Thu, 2–4 PM")}
            ${lever("Open on Sundays", "8 AM – 2 PM", 80, "Uses Saturday morning as a guide")}
            ${lever("Pastry bundle promotion", "10% off", 45, "Coffee + pastry before 11 AM")}
          </div>
          <div style="padding: 22px 26px; background: #0F2A1F; color: #fff;">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px;">Projected next month</b>${pill("Likely range ±6%", "dark")}</p>
            <div style="color: #E8F3EC;">
              ${bar("Revenue", 48200, 53900, 60000, money)}
              ${bar("Gross profit", 30100, 33300, 60000, money)}
              ${bar("Staff cost", 14600, 15900, 60000, money)}
              ${bar("Net profit", 9800, 11600, 60000, money)}
            </div>
            <p style="margin: 18px 0 0; padding: 12px 14px; border-radius: 10px; background: rgba(47,211,154,.12); font-size: 13px; line-height: 1.55; color: #CFEFDC;">${icon("sparkles", 14, "#2FD39A")} Sunday opening adds the most. The price rise may cost about 3% of drink volume, based on how sales moved after your last change.</p>
          </div>
        </div>
      </div>
    </section>`;

const tr = (cells, head) => `<tr>${cells.map((c, i) => `<${head ? "th" : "td"} style="padding: 13px 16px; text-align: ${i ? "right" : "left"}; font-size: ${head ? 12 : 14}px; ${head ? "letter-spacing: .06em; color: #6B776F; font-weight: 700;" : i ? "font-weight: 600;" : "color: #4B5A52;"} border-top: 1px solid rgba(16,32,26,.07);">${c}</${head ? "th" : "td"}>`).join("")}</tr>`;
const compare = sec(
  "Compare scenarios",
  "#fff",
  `${h2("Compare scenarios", "Put two plans next to each other.", "Save a scenario, change the levers and save another. The comparison keeps today as the baseline so you can see which plan earns more, and what it costs in hours and risk.")}
        <div data-cmp="1" style="${CARD} margin-top: 38px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;" aria-label="Scenario comparison against today (example data)">
            <thead style="background: #F6F4EE;">${tr(["", "TODAY", "A · SUNDAY OPENING", "B · PRICE + PROMO"], true)}</thead>
            <tbody>
              ${tr(["Revenue / month", "$48,200", "$52,700", "$50,100"])}
              ${tr(["Gross margin", "62.4%", "61.9%", "64.8%"])}
              ${tr(["Staff hours / week", "212", "224", "206"])}
              ${tr(["Net profit / month", "$9,800", `<span style="color: #0B6B3F;">$11,200</span>`, "$10,900"])}
              ${tr(["Confidence", "—", pill("Medium", "warn"), pill("High", "good")])}
            </tbody>
          </table>
        </div>
        `,
);

const how = sec(
  "How the numbers are worked out",
  "#F6F4EE",
  `
        <div data-bs2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          ${img("np/pasted-1788936227392-0-mttqfvbe-r059.png", "Profit overview in Noxtill", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
          <div>${h2("Grounded in your records", "Built on what your business actually did.", "Projections start from your own last months of sales, product costs, staff shifts and opening hours, so a change is tested against how your customers really behave.")}
            <ul style="margin: 26px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; font-size: 14.5px; color: #4B5A52;">
              ${["Every result is a likely range, not a promise.", "Confidence drops when there’s little history to learn from.", "Nothing changes in your business until you apply it yourself."].map((x) => `<li style="display: flex; gap: 10px;">${icon("check-circle", 18, "#16A85F")}${esc(x)}</li>`).join("")}
            </ul>
          </div>
        </div>`,
);

const body = `${hero}${compare}${how}${faq(
  "Business Simulator questions.",
  [
    ["What can I change in a scenario?", "Prices, discounts and promotions, staff hours and shifts, opening days and hours, and product costs."],
    ["Where do the projections come from?", "From your own recent sales, costs and staffing in Noxtill, including how sales moved after past changes."],
    ["How accurate is it?", "Every result is shown as a likely range with a confidence level. Short histories and unusual weeks lower the confidence."],
    ["Does running a scenario change anything?", "No. Scenarios are sandboxed. You apply a change yourself in the module it belongs to when you are ready."],
    ["Can I share a scenario with my manager?", "Yes. Saved scenarios can be opened by anyone on your team with access to Business Intelligence."],
  ],
  [["Digital Twin", "/features/digital-twin"], ["Business Brain", "/features/business-brain"], ["Opportunity Radar", "/features/opportunity-radar"]],
)}${closing("Decide with the numbers in front of you.", "Start a 14-day free trial or book a demo to run your first scenario.")}`;

module.exports = {
  slug: "features--business-simulator",
  html: page({ route, title: "Business Simulator — Test Decisions First | Noxtill", desc: "Test a price change, new hours or a promotion against your real sales, costs and staffing, and compare scenarios before you commit.", css }, body),
};
