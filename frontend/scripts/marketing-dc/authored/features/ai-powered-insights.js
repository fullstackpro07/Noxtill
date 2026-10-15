/* eslint-disable @typescript-eslint/no-require-imports */
// /features/ai-powered-insights — built around one cause chain: what changed → why → what to do, laid out
// left to right, then the "ask your business" box answering in plain words with the numbers behind it.
// Module: (app)/business-brain Situation + Cause views, Ask (assistant), AI Insights.
const { esc, icon, img, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/ai-powered-insights";
const css = `
  @media (max-width: 1080px) { [data-chain] { grid-template-columns: minmax(0,1fr) !important; } [data-chain] [data-arrow] { transform: rotate(90deg); justify-self: center; } [data-ask] { grid-template-columns: minmax(0,1fr) !important; } }`;

const link = (head, title, lines, tone, ic) => `
            <div style="${CARD} padding: 20px; border-top: 4px solid ${tone};">
              <p style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .1em; color: ${tone};">${icon(ic, 15, tone)}${head}</p>
              <p style="margin: 10px 0 12px; font-size: 17px; font-weight: 700; line-height: 1.3;">${esc(title)}</p>
              <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; font-size: 13px; color: #4B5A52;">${lines.map((l) => `<li style="display: flex; gap: 8px;"><span style="color: ${tone};">•</span>${esc(l)}</li>`).join("")}</ul>
            </div>`;
const arrow = `<span data-arrow="1" aria-hidden="true" style="align-self: center; font-size: 26px; color: #B7AE9C;">→</span>`;

const hero = `
    <section aria-label="AI-Powered Insights" data-pad="1" style="background: #fff; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Business Intelligence", "/ai/insights-recommendations", "AI-Powered Insights")}
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 30px; align-items: flex-end; margin-top: 30px;">
          <div style="max-width: 660px;">
            ${eyebrow("AI-Powered Insights")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Not just what happened.<br><span style="color: #0B6B3F;">Why, and what to do.</span></h1>
            <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">When a number moves, Noxtill traces it back through your sales, customers, stock and staff to the cause, then suggests the next step in plain words.</p>
          </div>
          ${ctas("Start Free Trial")}
        </div>
        <div data-chain="1" role="img" aria-label="Cause chain: profit down 9 percent, because of supplier cost rise and discounting, suggested price review and discount limit (example data)" style="display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr); gap: 14px; margin-top: 46px; padding: 22px; border-radius: 22px; background: #F6F4EE;">
          ${link("WHAT CHANGED", "Gross profit fell 9% this month", ["Sales were steady: +1%", "Margin dropped from 61% to 55%", "Mostly at the Downtown branch"], "#A12C1F", "trending-down")}${arrow}
          ${link("WHY", "Two causes explain most of it", ["Pastry costs rose 14% from your supplier on the 3rd", "Staff discounts doubled on weekday afternoons", "Prices were not updated after the cost rise"], "#B98A1F", "search")}${arrow}
          ${link("WHAT TO DO", "Two steps worth about $1,900 a month", ["Review 6 pastry prices (draft ready)", "Set a staff discount limit of 10%", "Check again in 2 weeks"], "#0B6B3F", "target")}
        </div>
      </div>
    </section>`;

const ask = sec(
  "Ask your business",
  "#F6F4EE",
  `
        <div data-ask="1" style="display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center;">
          <div>${h2("Ask your business", "Questions in, plain answers out.", "Type a question the way you’d ask your accountant. The answer comes back in a sentence or two, with the figures it used so you can check them.")}
            ${img("np/7973c6d0-055a-4fea-9ea9-472b0118cd0e-mul91i2p-kkcp.png", "AI Insights dashboard on a laptop", "width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 22px; margin-top: 30px;")}
          </div>
          <div style="${CARD} padding: 22px; box-shadow: 0 30px 60px -36px rgba(8,30,20,.35);" role="img" aria-label="Ask box: question about why Tuesdays are slow, with a plain answer and the figures it used (example data)">
            <p style="margin: 0; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(16,32,26,.12); font-size: 14px;">${icon("search", 16, "#6B776F")}Why are Tuesdays slower than last month?</p>
            <div style="margin-top: 16px; padding: 16px; border-radius: 12px; background: #E8F3EC;">
              <p style="margin: 0 0 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #0B6B3F;">${icon("sparkles", 14, "#16A85F")}ANSWER</p>
              <p style="margin: 0; font-size: 15px; line-height: 1.6;">Tuesday sales are 18% lower, almost all between 3 and 6 PM. The after-school regulars who used the student offer stopped coming when it ended on the 1st.</p>
            </div>
            <p style="margin: 14px 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #6B776F;">BASED ON</p>
            <p style="margin: 0; display: flex; flex-wrap: wrap; gap: 8px;">${["Sales by hour · 8 Tuesdays", "42 student-offer customers", "Promotions log"].map((x) => `<span style="padding: 6px 10px; border-radius: 8px; background: #F6F4EE; font-size: 12px; color: #4B5A52;">${x}</span>`).join("")}</p>
          </div>
        </div>`,
);

const why = sec(
  "Why it matters",
  "#fff",
  `${h2("Why it matters", "Reports tell you the number. You still need the reason.", "Most owners see a dip, guess at a cause and move on. Insights check the guesses against your records and show which one the numbers actually support.")}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; margin-top: 36px;">
          ${[["layers", "Connected data", "Sales, customers, stock, staff and costs are read together, not one report at a time."], ["eye", "Shows its working", "Every insight lists the figures it used, so you can check before acting."], ["shield", "Your data only", "Insights come from your own records in Noxtill, not from guesses about your market."]].map(([ic, t, d]) => `<div style="padding: 22px; border-radius: 14px; background: #F6F4EE;">${icon(ic, 22, "#0B6B3F")}<p style="margin: 12px 0 4px; font-size: 16px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`).join("")}
        </div>`,
);

const body = `${hero}${ask}${why}${faq(
  "AI-Powered Insights questions.",
  [
    ["How does it find the cause of a change?", "It breaks the change down by branch, product, customer group and time, and checks the likely causes against your records, such as cost changes, discounts and promotions."],
    ["Can I check the answer?", "Yes. Every insight and every answer lists the figures it was based on."],
    ["What can I ask?", "Questions about your own business: sales, profit, customers, stock, staff and credit, in plain language."],
    ["Will it change anything on its own?", "No. Suggested steps are drafted for you and only run after you approve them."],
    ["Does it use other businesses’ data?", "No. It works only from your own records in Noxtill."],
  ],
  [["Business Brain", "/features/business-brain"], ["Opportunity Radar", "/features/opportunity-radar"], ["Intelligence Alerts", "/features/intelligence-alerts"]],
)}${closing("Find the reason behind every number.", "Start a 14-day free trial or book a demo to ask your own business a question.")}`;

module.exports = {
  slug: "features--ai-powered-insights",
  html: page({ route, title: "AI-Powered Insights — Why Numbers Changed | Noxtill", desc: "When a number moves, Noxtill traces it to the cause in your sales, customers, stock and staff, and suggests the next step in plain words.", css }, body),
};
