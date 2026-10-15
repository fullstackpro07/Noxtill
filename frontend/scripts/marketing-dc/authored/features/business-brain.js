/* eslint-disable @typescript-eslint/no-require-imports */
// /features/business-brain — built around the morning briefing: what changed overnight, the findings
// ranked by impact, and each finding's prepare → approve → run action strip.
// Module: (app)/business-brain (deterministic detectors, brain.* thresholds, actions need approval).
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/business-brain";
const css = `
  @media (max-width: 1080px) { [data-bbhero], [data-bb2] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 720px) { [data-strip] { grid-template-columns: minmax(0,1fr) !important; } [data-strip] [data-arrow] { display: none; } [data-th] { grid-template-columns: minmax(0,1fr) !important; } }`;

const finding = (rank, title, why, tone, tag) => `
              <li style="display: grid; grid-template-columns: 34px minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 13px 14px; border-radius: 12px; background: #fff; border: 1px solid rgba(16,32,26,.07);">
                <b style="width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #E8F3EC; color: #0B6B3F; font-size: 14px;">${rank}</b>
                <span style="min-width: 0;"><b style="display: block; font-size: 14px;">${esc(title)}</b><span style="font-size: 12.5px; color: #6B776F;">${esc(why)}</span></span>
                ${pill(tag, tone)}
              </li>`;

const hero = `
    <section aria-label="Business Brain" data-pad="1" style="background: radial-gradient(1200px 500px at 85% -10%, #DCEFE3, #F6F4EE 60%); padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Business Intelligence", "/ai/insights-recommendations", "Business Brain")}
        <div data-bbhero="1" style="display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center; margin-top: 30px;">
          <div>
            ${eyebrow("Business Brain")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Your business,<br>read every morning.</h1>
            <p style="margin: 20px 0 0; max-width: 470px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Business Brain reads your sales, stock, credit, reviews and deliveries, finds what needs you today, and prepares the next step. You approve before anything runs.</p>
            ${ctas("Start Free Trial")}
          </div>
          <div style="${CARD} border-radius: 20px; padding: 22px; background: #FBFAF6; box-shadow: 0 34px 70px -38px rgba(8,30,20,.4);" role="img" aria-label="Business Brain morning briefing with three ranked findings (example data)">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <p style="margin: 0; display: flex; align-items: center; gap: 10px;"><span style="width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: #0F2A1F;">${icon("brain", 20, "#2FD39A")}</span><span><b style="display: block; font-size: 15px;">Good morning, Sara</b><span style="font-size: 12px; color: #6B776F;">Tuesday · read at 6:00 from yesterday’s records</span></span></p>
              ${pill("3 need you", "warn")}
            </div>
            <p style="margin: 16px 0 14px; padding: 12px 14px; border-radius: 12px; background: #0F2A1F; color: #E8F3EC; font-size: 14px; line-height: 1.55;">Sales were 6% below a usual Monday. Most of the gap is repeat customers: 14 regulars who buy every week didn’t come in.</p>
            <ol style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px;">
              ${finding(1, "14 regular buyers have lapsed", "No purchase in 21 days, usually weekly", "warn", "Customers")}
              ${finding(2, "$2,340 of credit is 30+ days overdue", "6 customers · 2 promised to pay this week", "bad", "Credit")}
              ${finding(3, "Oat milk covers 2 days of sales", "Below your 5-day cover rule", "info", "Stock")}
            </ol>
          </div>
        </div>
      </div>
    </section>`;

// Action strip.
const stage = (n, t, d, ic, on) => `<div style="${CARD} padding: 20px; ${on ? "border-color: #16A85F; box-shadow: 0 0 0 3px rgba(22,168,95,.15);" : ""}"><span style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #0B6B3F;">${icon(ic, 16, "#0B6B3F")} STEP ${n}</span><p style="margin: 10px 0 6px; font-size: 17px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`;
const arrow = `<span data-arrow="1" aria-hidden="true" style="align-self: center; font-size: 22px; color: #B7AE9C;">→</span>`;
const actions = sec(
  "From finding to action",
  "#fff",
  `${h2("From finding to action", "It prepares the work. You decide.", "Each finding comes with a suggested action from the module it belongs to: a win-back message, a credit reminder, a purchase order. Nothing is sent, posted or ordered until a person with the right permission approves it.")}
        <div data-strip="1" style="display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr); gap: 14px; margin-top: 40px;">
          ${stage(1, "Prepare", "Brain drafts the message to the 14 lapsed regulars with your usual offer, and shows who it will reach.", "pen-tool", false)}${arrow}
          ${stage(2, "Approve", "You read it, edit the wording or the list, and approve. Only staff allowed to run campaigns can.", "check-circle", true)}${arrow}
          ${stage(3, "Run", "The campaign goes out through Marketing and the finding moves to Resolved, with a record of who approved it.", "send", false)}
        </div>`,
);

// Thresholds = your rules.
const th = (label, val, hint) => `<div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid rgba(16,32,26,.08);"><span><b style="display: block; font-size: 14px;">${label}</b><span style="font-size: 12px; color: #6B776F;">${hint}</span></span><span style="padding: 7px 12px; border-radius: 8px; background: #F6F4EE; font-size: 14px; font-weight: 700;">${val}</span></div>`;
const rules = sec(
  "Your thresholds",
  "#F6F4EE",
  `
        <div data-bb2="1" style="display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center;">
          <div>${h2("Your rules, not ours", "It flags what you said matters.", "Findings come from clear checks over your own records, and the lines they use are yours to set. Change “lapsed” from 21 to 30 days and tomorrow’s briefing follows it.")}
            <ul style="margin: 26px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; font-size: 14.5px; color: #4B5A52;">${["Overdue credit and repeat-customer drops", "Discounts beyond your policy and missing product costs", "Lapsed buyers, failed deliveries and low reviews"].map((x) => `<li style="display: flex; gap: 10px;">${icon("check-circle", 18, "#16A85F")}${x}</li>`).join("")}</ul>
          </div>
          <div data-th="1" style="display: grid; grid-template-columns: minmax(0,1fr); gap: 10px;" role="img" aria-label="Business Brain thresholds: lapsed after 21 days, overdue after 30 days, repeat drop 20 percent, stock cover 5 days, margin gap 8 points, notable change 10 percent (example values)">
            ${th("Customer counts as lapsed after", "21 days", "Based on how often they usually buy")}${th("Credit counts as overdue after", "30 days", "From the due date on the credit sale")}${th("Flag a repeat-customer drop of", "20%", "Compared with the same weekday")}${th("Keep stock cover of at least", "5 days", "At recent selling speed")}${th("Flag a branch margin gap over", "8 pts", "Against your other branches")}${th("Call out changes bigger than", "10%", "In the morning summary")}
          </div>
        </div>`,
);

const body = `${hero}${actions}${rules}${faq(
  "Business Brain questions.",
  [
    ["Does Business Brain guess?", "No. Findings come from fixed checks over your real records, such as credit past its due date or a regular customer who stopped buying. AI is used to answer questions you ask and to word messages, not to invent findings."],
    ["Will it send messages or place orders by itself?", "No. Every action is prepared first and runs only after a person with permission for that module approves it."],
    ["Can I change what counts as a problem?", "Yes. The thresholds behind each check are your settings, and you can dismiss any finding with a reason."],
    ["How often does it check?", "It builds a daily snapshot and checks the items you choose to watch every hour."],
    ["Who can see Business Brain?", "Owners and staff you give access to. Each suggested action still needs the permission of the module it uses."],
  ],
  [["Opportunity Radar", "/features/opportunity-radar"], ["Intelligence Alerts", "/features/intelligence-alerts"], ["AI-Powered Insights", "/features/ai-powered-insights"]],
)}${closing("Start every day knowing what matters.", "Start a 14-day free trial or book a demo to see your own morning briefing.")}`;

module.exports = {
  slug: "features--business-brain",
  html: page({ route, title: "Business Brain — Your Daily Business Briefing | Noxtill", desc: "A morning briefing from your own records: findings ranked by impact, thresholds you set, and actions that run only after you approve them.", css }, body),
};
