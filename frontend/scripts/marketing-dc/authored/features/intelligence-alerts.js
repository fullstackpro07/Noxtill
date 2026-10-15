/* eslint-disable @typescript-eslint/no-require-imports */
// /features/intelligence-alerts — built around the watchlist: a stack of alerts on a phone-sized panel,
// a watch builder (what to watch, the line, how often) and the alert history with what happened next.
// Module: (app)/business-brain watches (product stock, overdue credit, branch margin gap; hourly checks).
const { esc, icon, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page, img } = require("./fkit");

const route = "/features/intelligence-alerts";
const css = `
  @media (max-width: 1080px) { [data-iahero], [data-builder2] { grid-template-columns: minmax(0,1fr) !important; } [data-stack] { margin: 0 auto; } }
  @media (max-width: 760px) { [data-log] { overflow-x: auto; } [data-log] table { min-width: 620px; } }`;

const alert = (ic, tone, title, body, time, rot) => `
              <div style="display: flex; gap: 12px; padding: 14px; border-radius: 16px; background: rgba(255,255,255,.96); box-shadow: 0 18px 36px -18px rgba(0,0,0,.45); transform: rotate(${rot}deg);">
                <span style="flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: ${tone};">${icon(ic, 18, "#fff")}</span>
                <span style="min-width: 0;"><span style="display: flex; justify-content: space-between; gap: 10px;"><b style="font-size: 13.5px; color: #10201A;">${esc(title)}</b><span style="font-size: 11px; color: #8A968F;">${time}</span></span><span style="display: block; margin-top: 2px; font-size: 12.5px; line-height: 1.45; color: #4B5A52;">${esc(body)}</span></span>
              </div>`;

const hero = `
    <section aria-label="Intelligence Alerts" data-pad="1" style="background: #fff; padding: 30px 28px 0;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Business Intelligence", "/ai/insights-recommendations", "Intelligence Alerts")}
        <div data-iahero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center; margin-top: 26px;">
          <div style="padding-bottom: 60px;">
            ${eyebrow("Intelligence Alerts")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Hear about it<br>while you can still act.</h1>
            <p style="margin: 20px 0 0; max-width: 480px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Pick the things you care about, set the line, and Noxtill checks them every hour. When something crosses it, you get one clear alert with the reason and the next step.</p>
            ${ctas("Start Free Trial")}
          </div>
          <div style="position: relative; padding: 40px 40px 60px; border-radius: 26px 26px 0 0; background: linear-gradient(160deg, #0F2A1F, #173D2E);">
            <div data-stack="1" role="img" aria-label="Three alerts: low stock, overdue credit, branch margin gap (example data)" style="max-width: 400px; display: grid; gap: 14px;">
              ${alert("boxes", "#B98A1F", "Oat milk below 2 days of stock", "Airport branch · reorder draft ready for your approval.", "9:00", -1.2)}
              ${alert("wallet", "#A12C1F", "3 credit accounts crossed 30 days", "$1,280 owed · reminders prepared, not sent.", "10:00", 0.8)}
              ${alert("percent", "#1D5FA8", "Downtown margin 9 pts behind Airport", "Discounts on weekday afternoons explain most of the gap.", "11:00", -0.4)}
            </div>
          </div>
        </div>
      </div>
    </section>`;

const field = (label, value) => `<div><span style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #6B776F;">${label}</span><span style="display: flex; justify-content: space-between; align-items: center; padding: 11px 13px; border-radius: 10px; border: 1px solid rgba(16,32,26,.14); background: #fff; font-size: 14px; font-weight: 600;">${value}<span aria-hidden="true" style="color: #8A968F;">▾</span></span></div>`;
const builder = sec(
  "Set up a watch",
  "#F6F4EE",
  `
        <div data-builder2="1" style="display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center;">
          <div>${h2("Set up a watch", "Three choices and it’s watching.", "Choose what to watch and where to draw the line. Watches cover product stock, overdue customer credit and the margin gap between branches, and alert the owner and managers once each time they trip.")}
            ${img("np/pasted-1790600596025-0-mul9d2ed-ff29.png", "Noxtill AI insight notification on a phone", "width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 22px; margin-top: 30px;")}
          </div>
          <div style="${CARD} padding: 24px; box-shadow: 0 30px 60px -36px rgba(8,30,20,.35);" role="img" aria-label="New watch form: product stock for oat milk at the Airport branch, alert below 2 days of cover, checked hourly (example data)">
            <p style="margin: 0 0 18px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 16px;">New watch</b>${pill("Checked every hour", "good")}</p>
            <div style="display: grid; gap: 14px;">
              ${field("Watch", "Product stock")}
              ${field("Item", "Oat milk 1 L · Airport branch")}
              ${field("Alert when cover is below", "2 days")}
            </div>
            <div style="margin-top: 18px; padding: 12px 14px; border-radius: 10px; background: #E8F3EC; font-size: 13px; color: #0B6B3F;">Right now: 3.5 days of cover. You’ll hear about it if it drops below 2.</div>
            <p style="margin: 18px 0 0; text-align: right;"><span style="padding: 10px 18px; border-radius: 9px; background: #0B5535; color: #fff; font-size: 13.5px; font-weight: 600;">Start watching</span></p>
          </div>
        </div>`,
);

const tr = (c, head) => `<tr>${c.map((x) => `<${head ? "th" : "td"} style="padding: 12px 16px; text-align: left; font-size: ${head ? 11.5 : 13.5}px; ${head ? "letter-spacing: .06em; color: #6B776F; font-weight: 700;" : ""} border-top: 1px solid rgba(16,32,26,.07);">${x}</${head ? "th" : "td"}>`).join("")}</tr>`;
const log = sec(
  "Alert history",
  "#fff",
  `${h2("Alert history", "Every alert, and what happened after.", "Alerts stay on record with who saw them and what was done, so you can tell a one-off from a pattern.")}
        <div data-log="1" style="${CARD} margin-top: 36px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;" aria-label="Alert history (example data)">
            <thead style="background: #F6F4EE;">${tr(["WHEN", "ALERT", "SEEN BY", "OUTCOME"], true)}</thead>
            <tbody>
              ${tr(["Today 9:00", "Oat milk below 2 days · Airport", "Sara", pill("Reorder approved", "good")])}
              ${tr(["Today 10:00", "3 credit accounts over 30 days", "Omar", pill("Reminders sent", "good")])}
              ${tr(["Mon 11:00", "Downtown margin 9 pts behind", "Sara", pill("Looking into it", "warn")])}
              ${tr(["Sat 15:00", "Croissants below 1 day · Downtown", "—", pill("Recovered on its own", "mute")])}
            </tbody>
          </table>
        </div>
        `,
);

const body = `${hero}${builder}${log}${faq(
  "Intelligence Alerts questions.",
  [
    ["What can I set alerts on?", "Product stock (days of cover), overdue customer credit and the margin gap between branches."],
    ["How often are watches checked?", "Every hour. The morning briefing also summarises anything that changed overnight."],
    ["Will an alert do something automatically?", "No. An alert can come with a prepared action, like a reorder or reminder, but it only runs after you approve it."],
    ["Will the same alert keep repeating?", "No. A watch alerts once when it trips, then waits until the value recovers. You can also remove the watch or change its line."],
    ["Who receives alerts?", "The owner and managers, in their Noxtill notifications, with a link straight to the finding."],
  ],
  [["Business Brain", "/features/business-brain"], ["Opportunity Radar", "/features/opportunity-radar"], ["AI-Powered Insights", "/features/ai-powered-insights"]],
)}${closing("Know before it becomes a problem.", "Start a 14-day free trial or book a demo to set up your first watch.")}`;

module.exports = {
  slug: "features--intelligence-alerts",
  html: page({ route, title: "Intelligence Alerts — Hourly Business Watches | Noxtill", desc: "Watch stock cover, overdue credit and branch margins every hour, and get one clear alert with the reason and a prepared next step.", css }, body),
};
