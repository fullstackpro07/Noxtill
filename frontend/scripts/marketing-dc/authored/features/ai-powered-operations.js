/* eslint-disable @typescript-eslint/no-require-imports */
// /features/ai-powered-operations — built around the day's operations log: a timeline of what the AI did
// in the store since opening (done / needs approval), a "while you were away" summary, and the jobs it
// takes over (listings, prices, stock, campaigns).
// Autonomous Commerce (owner decision 2026-10-15: written as a live feature).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/ai-powered-operations";
const css = `
  @media (max-width: 1080px) { [data-ophero], [data-op2] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 640px) { [data-jobs] { grid-template-columns: minmax(0,1fr) !important; } }`;

const ev = (time, ic, text, detail, state) => `
              <li style="display: grid; grid-template-columns: 52px 34px minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.08);">
                <span style="font-size: 12.5px; color: rgba(255,255,255,.55);">${time}</span>
                <span style="width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: rgba(47,211,154,.14);">${icon(ic, 17, "#2FD39A")}</span>
                <span style="min-width: 0;"><b style="display: block; font-size: 14px; color: #fff;">${esc(text)}</b><span style="font-size: 12.5px; color: rgba(255,255,255,.6);">${esc(detail)}</span></span>
                ${state === "done" ? pill("Done", "good") : pill("Needs approval", "warn")}
              </li>`;

const hero = `
    <section aria-label="AI-Powered Operations" data-pad="1" style="background: #fff; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Autonomous Commerce", "/ai/autonomous-commerce", "AI-Powered Operations")}
        <div data-ophero="1" style="display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 50px; align-items: center; margin-top: 28px;">
          <div>
            ${eyebrow("AI-Powered Operations")}
            <h1 data-h1="1" style="margin: 0; font-size: 54px; font-weight: 700; line-height: 1.04; letter-spacing: -0.04em;">The store keeps running<br>while you sleep.</h1>
            <p style="margin: 20px 0 0; max-width: 470px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Noxtill AI handles the routine work of an online store around the clock: updating listings, adjusting prices, syncing stock and drafting campaigns. Anything beyond your rules waits for you.</p>
            ${ctas("Start Free Trial")}
          </div>
          <div style="padding: 22px; border-radius: 22px; background: #0F2A1F; box-shadow: 0 34px 70px -36px rgba(8,30,20,.55);" role="img" aria-label="Operations log for today: five actions done and one waiting for approval (example data)">
            <p style="margin: 0 0 6px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px; color: #fff;">Today’s operations</b><span style="font-size: 12.5px; color: rgba(255,255,255,.6);">willowandpine.com</span></p>
            <ol style="margin: 0; padding: 0; list-style: none;">
              ${ev("06:00", "refresh", "Synced stock across 3 channels", "Store, POS and marketplace", "done")}
              ${ev("06:15", "tag", "Updated 12 prices", "All within your pricing rules", "done")}
              ${ev("07:30", "pen-tool", "Improved 8 product descriptions", "Reviewed by Emily Carter", "done")}
              ${ev("09:10", "boxes", "Drafted a reorder for planters", "3 days of stock left", "done")}
              ${ev("11:40", "megaphone", "Drafted a weekend candle campaign", "Above your auto-send limit", "wait")}
            </ol>
          </div>
        </div>
      </div>
    </section>`;

const away = sec(
  "While you were away",
  "#F6F4EE",
  `
        <div data-op2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("While you were away", "One summary instead of fifty notifications.", "When you open Noxtill, you see what was handled, what changed and the few decisions that are yours, in a couple of minutes of reading.")}</div>
          <div style="${CARD} padding: 22px; box-shadow: 0 30px 60px -40px rgba(8,30,20,.35);" role="img" aria-label="Summary since last visit: orders, actions handled and two decisions waiting (example data)">
            <p style="margin: 0 0 14px; font-size: 16px; font-weight: 700;">Since you last checked · 14 hours</p>
            <div style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px;">${[["38", "Orders"], ["27", "Actions handled"], ["2", "Need you"]].map(([n, l], i) => `<div style="padding: 14px; border-radius: 10px; background: ${i === 2 ? "#FFF4DC" : "#F6F4EE"};"><b style="display: block; font-size: 24px;">${n}</b><span style="font-size: 12px; color: #6B776F;">${l}</span></div>`).join("")}</div>
            <ul style="margin: 16px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; font-size: 13.5px;">
              <li style="display: flex; justify-content: space-between; gap: 10px; padding: 11px 13px; border-radius: 10px; border: 1px solid rgba(16,32,26,.1);"><span>Weekend candle campaign · 1,240 customers</span><b style="color: #0B6B3F;">Review</b></li>
              <li style="display: flex; justify-content: space-between; gap: 10px; padding: 11px 13px; border-radius: 10px; border: 1px solid rgba(16,32,26,.1);"><span>Linen cushion price drop of 19%</span><b style="color: #0B6B3F;">Review</b></li>
            </ul>
          </div>
        </div>`,
);

const jobs = sec(
  "The work it takes on",
  "#fff",
  `${h2("The work it takes on", "The jobs that eat your evenings.", "Each job runs inside its own rules, and every action is written to the log with what changed and why.")}
        <div data-jobs="1" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-top: 36px;">
          ${[["tag", "Listings", "Writes and improves product titles, descriptions and categories for you to review."], ["percent", "Prices", "Adjusts prices within your floors, ceilings and margins."], ["boxes", "Stock", "Keeps stock in step across channels and drafts reorders."], ["megaphone", "Campaigns", "Drafts promotions from what’s in stock and selling."]].map(([ic, t, d]) => `<div style="display: flex; gap: 16px; padding: 22px; border-radius: 16px; background: #F6F4EE;"><span style="flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; background: #0F2A1F;">${icon(ic, 22, "#2FD39A")}</span><span><b style="display: block; font-size: 16px;">${t}</b><span style="font-size: 14px; line-height: 1.6; color: #4B5A52;">${d}</span></span></div>`).join("")}
        </div>
        <div style="margin-top: 40px;">${img("np/pasted-1788890382354-0-mtsz593d-zxws.png", "Owner running the online store from Noxtill", "width: 100%; aspect-ratio: 21 / 8; object-fit: cover; border-radius: 22px;")}</div>`,
);

const body = `${hero}${away}${jobs}${faq(
  "AI-powered operations questions.",
  [
    ["What does it do on its own?", "Routine store work inside your rules: syncing stock, adjusting prices within your limits, improving listings and drafting reorders and campaigns."],
    ["What needs my approval?", "Anything beyond your limits, such as a big price change or a campaign above your auto-send size, waits for you."],
    ["Can I see everything it did?", "Yes. Every action is in the operations log with what changed, when and why."],
    ["Can I turn a job off?", "Yes. Switch any job off, or set it to draft only so nothing goes live without you."],
    ["Does it work with my existing store?", "It runs on your Noxtill Website & Commerce store and connected channels."],
  ],
  [["Commerce Within Your Rules", "/features/commerce-within-your-rules"], ["Dynamic Pricing", "/features/dynamic-pricing"], ["Automated Fulfillment", "/features/automated-fulfillment"]],
)}${closing("Hand over the routine. Keep the decisions.", "Start a 14-day free trial or book a demo to see AI-powered operations.")}`;

module.exports = {
  slug: "features--ai-powered-operations",
  html: page({ route, title: "AI-Powered Store Operations | Noxtill", desc: "Noxtill AI runs routine store work around the clock: listings, prices, stock sync and campaign drafts, inside your rules, with every action logged.", css }, body),
};
