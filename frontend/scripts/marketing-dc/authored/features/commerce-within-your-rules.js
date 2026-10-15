/* eslint-disable @typescript-eslint/no-require-imports */
// /features/commerce-within-your-rules — built around the rulebook: a guardrail card per area (prices,
// discounts, stock, campaigns), an approval matrix of what runs on its own vs waits for whom, and the
// audit log that records every automated action.
// Autonomous Commerce (owner decision 2026-10-15: written as a live feature).
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/commerce-within-your-rules";
const css = `
  @media (max-width: 1080px) { [data-book] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }
  @media (max-width: 640px) { [data-book] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 760px) { [data-matrix], [data-audit] { overflow-x: auto; } [data-matrix] table, [data-audit] table { min-width: 620px; } }`;

const rule = (ic, area, lines) => `
            <div style="padding: 20px; border-radius: 16px; background: #fff; border: 1px solid rgba(16,32,26,.08); box-shadow: 0 16px 34px -26px rgba(8,30,20,.4);">
              <p style="margin: 0 0 12px; display: flex; align-items: center; gap: 10px;"><span style="width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: #E8F3EC;">${icon(ic, 18, "#0B6B3F")}</span><b style="font-size: 15.5px;">${area}</b></p>
              <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px;">${lines.map(([k, v]) => `<li style="display: flex; justify-content: space-between; gap: 10px; font-size: 13px;"><span style="color: #4B5A52;">${k}</span><b>${v}</b></li>`).join("")}</ul>
            </div>`;

const hero = `
    <section aria-label="Commerce Within Your Rules" data-pad="1" style="background: #E8F3EC; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Autonomous Commerce", "/ai/autonomous-commerce", "Commerce Within Your Rules")}
        <div style="text-align: center; max-width: 760px; margin: 32px auto 0;">
          ${eyebrow("Commerce Within Your Rules")}
          <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Automation that knows<br>where to stop.</h1>
          <p style="margin: 20px auto 0; max-width: 580px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Write your rules once — the lowest price, the biggest discount, the largest order to place, who signs off — and every automated action in your store stays inside them.</p>
          <div style="display: flex; justify-content: center;">${ctas("Start Free Trial")}</div>
        </div>
        <div data-book="1" role="img" aria-label="Rulebook with guardrails for prices, discounts, stock and campaigns (example values)" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-top: 46px;">
          ${rule("percent", "Prices", [["Never below", "40% margin"], ["Auto-approve up to", "15%"], ["Checked", "Every 6 h"]])}
          ${rule("gift", "Discounts", [["Biggest discount", "25%"], ["Stacking", "Not allowed"], ["Bigger needs", "Owner"]])}
          ${rule("boxes", "Stock", [["Keep cover of", "7 days"], ["Auto-order up to", "$500"], ["Above that", "Manager"]])}
          ${rule("megaphone", "Campaigns", [["Auto-send up to", "500 people"], ["Quiet hours", "9 PM – 8 AM"], ["Opt-outs", "Always respected"]])}
        </div>
      </div>
    </section>`;

const yes = icon("check-circle", 18, "#16A85F"), wait = (who) => `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #8A5A00;">${icon("clock", 15, "#B98A1F")}${who}</span>`;
const tr = (c, head) => `<tr>${c.map((x, i) => `<${head ? "th" : "td"} style="padding: 13px 16px; text-align: ${i ? "center" : "left"}; font-size: ${head ? 11.5 : 13.5}px; ${head ? "letter-spacing: .06em; color: #6B776F; font-weight: 700;" : i === 0 ? "font-weight: 600;" : ""} border-top: 1px solid rgba(16,32,26,.07);">${x}</${head ? "th" : "td"}>`).join("")}</tr>`;
const matrix = sec(
  "Who signs off",
  "#fff",
  `${h2("Who signs off", "Small things run. Big things wait for the right person.", "For every kind of action you decide what runs on its own and who approves the rest, so a manager can sign off a restock while price cuts still come to you.")}
        <div data-matrix="1" style="${CARD} margin-top: 36px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;" aria-label="Approval matrix (example settings)">
            <thead style="background: #F6F4EE;">${tr(["ACTION", "WITHIN RULES", "OVER THE LIMIT"], true)}</thead>
            <tbody>
              ${tr(["Change a price", `${yes}`, wait("Owner")])}
              ${tr(["Create a discount", `${yes}`, wait("Owner")])}
              ${tr(["Place a stock order", `${yes}`, wait("Manager")])}
              ${tr(["Send a campaign", `${yes}`, wait("Marketing lead")])}
              ${tr(["Publish a new product", wait("Manager"), wait("Manager")])}
            </tbody>
          </table>
        </div>
        `,
);

const audit = sec(
  "Every action on record",
  "#F6F4EE",
  `${h2("Every action on record", "See exactly what ran, and why.", "Each automated action is logged with the rule it followed, what changed and who approved it, and can be undone from the log.")}
        <div data-audit="1" style="${CARD} margin-top: 36px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;" aria-label="Audit log of automated actions (example data)">
            <thead style="background: #fff;">${tr(["WHEN", "ACTION", "RULE", "APPROVED BY"], true).replace(/text-align: center/g, "text-align: left")}</thead>
            <tbody>
              ${tr(["Today 06:15", "Planter $27.50 → $29.50", "Prices · within 15%", "Ran on its own"]).replace(/text-align: center/g, "text-align: left")}
              ${tr(["Today 09:10", "Reorder 60 planters · $420", "Stock · under $500", "Ran on its own"]).replace(/text-align: center/g, "text-align: left")}
              ${tr(["Yesterday 17:02", "Cushion $36.00 → $29.00", "Prices · over 15%", "Sara (owner)"]).replace(/text-align: center/g, "text-align: left")}
              ${tr(["Yesterday 12:30", "Spring campaign · 1,240 people", "Campaigns · over 500", "Omar (marketing)"]).replace(/text-align: center/g, "text-align: left")}
            </tbody>
          </table>
        </div>
        `,
);

const body = `${hero}${matrix}${audit}${faq(
  "Commerce rules questions.",
  [
    ["What can I set rules for?", "Prices, discounts, stock orders, campaigns and new product listings, each with its own limits."],
    ["What happens when an action is over a limit?", "It is prepared and sent to the person you chose to approve that kind of action. It doesn’t run until they do."],
    ["Can I make everything need approval?", "Yes. Set any area to draft only and every action in it waits for a person."],
    ["Can I undo an automated action?", "Yes. Actions in the log can be reversed, and the reversal is logged too."],
    ["Who can change the rules?", "Only the owner and the people you give permission to manage commerce settings."],
  ],
  [["AI-Powered Operations", "/features/ai-powered-operations"], ["Dynamic Pricing", "/features/dynamic-pricing"], ["Approval Workflows", "/features/approval-workflows"]],
)}${closing("Let it run. On your terms.", "Start a 14-day free trial or book a demo to write your first commerce rules.")}`;

module.exports = {
  slug: "features--commerce-within-your-rules",
  html: page({ route, title: "Commerce Within Your Rules — AI Guardrails | Noxtill", desc: "Set limits for prices, discounts, stock orders and campaigns, choose who approves what, and see every automated store action logged with its rule.", css }, body),
};
