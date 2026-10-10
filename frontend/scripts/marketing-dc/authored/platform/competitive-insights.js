/* eslint-disable @typescript-eslint/no-require-imports */
// /platform/competitive-insights — an analyst-style page: a scorecard hero, a "you vs. them" comparison
// with bars, a price tracker chart, ranked opportunities and the weekly brief.
// Module: (app)/competitive (competitors, compare, pricing, reputation, social, ads, trends,
// opportunities, tracking) + the weekly report.
const { icon, img, pill, CARD, btn, btnGhost, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-chero] { grid-template-columns: minmax(0,1fr) !important; }
    [data-compare] { grid-template-columns: minmax(0,1fr) !important; }
    [data-pricegrid] { grid-template-columns: minmax(0,1fr) !important; }
    [data-brief] { grid-template-columns: minmax(0,1fr) !important; }
    [data-cmpwrap] { overflow-x: auto !important; }
  }
  @media (max-width: 720px) {
    [data-score] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    [data-opp] { grid-template-columns: minmax(0,1fr) !important; row-gap: 8px !important; }
    [data-herophoto-card] { position: static !important; margin-top: 12px; width: auto !important; }
  }`;

const hero = `
    <section aria-label="Know your market, move first" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 30px 28px 0;">
      <div data-chero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr); gap: 44px; align-items: center;">
        <div>
          ${eyebrow("Competitive Insights")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.035em; color: #10201A;">Know your market.<br><span style="color: #0B6B3F;">Move first.</span></h1>
          <p style="margin: 18px 0 0; max-width: 520px; font-size: 16px; line-height: 1.7; color: #4A574F;">Pick the competitors that matter to you. Noxtill follows their prices, ratings and activity, shows how you compare, and turns the changes into a short list of moves worth making.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">${btn("Track Your Competitors")}${btnGhost("Book a Demo")}</div>
          <div data-score="1" style="margin-top: 28px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px;">
            ${[["6", "competitors tracked", "store"], ["4.7", "your rating, +0.3 vs area", "star"], ["96", "price index, 100 = area", "tag"], ["5", "open opportunities", "sparkles"]]
              .map(([v, l, ic]) => `<div style="${CARD} padding: 13px 14px;">${icon(ic, 16, "#0B6B3F")}<p style="margin: 8px 0 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">${v}</p><p style="margin: 2px 0 0; font-size: 11.5px; line-height: 1.35; color: #6B776F;">${l}</p></div>`)
              .join("")}
          </div>
          ${demoNote()}
        </div>
        <div style="position: relative; padding-bottom: 34px;">
          ${img("np/pasted-1789717561285-0-mu6nmkg6-cuw3.png", "The interior of a well-kept independent shop", "width: 100%; aspect-ratio: 16 / 11; object-fit: cover; border-radius: 18px;")}
          <div data-herophoto-card="1" style="position: absolute; right: 18px; bottom: 0; width: 290px; ${CARD} box-shadow: 0 20px 44px rgba(8,30,20,.2); padding: 14px 16px;">
            <p style="margin: 0; display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #0B6B3F;">THIS WEEK ${pill("New", "info", "font-size: 10px; padding: 2px 8px;")}</p>
            <p style="margin: 8px 0 4px; font-size: 14.5px; font-weight: 700; color: #10201A;">Two competitors raised colour prices</p>
            <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #56635C;">You are now 9% below the area average for colour treatment.</p>
          </div>
        </div>
      </div>
    </section>`;

// Comparison: metric rows with a bar per business; "you" highlighted.
const biz = [["You", "#0B6B3F"], ["Glow Studio", "#7A8A82"], ["Urban Cuts", "#7A8A82"], ["The Style Room", "#7A8A82"]];
const metric = (name, note, values, fmt, best) => `
            <tr>
              <th scope="row" style="padding: 14px 10px 14px 0; text-align: left; vertical-align: top; border-top: 1px solid rgba(16,32,26,.07);"><span style="display: block; font-size: 14px; font-weight: 700; color: #10201A;">${name}</span><span style="display: block; font-size: 11.5px; font-weight: 400; color: #6B776F;">${note}</span></th>
              ${values
                .map(([v, pct], i) => `<td style="padding: 14px 10px; vertical-align: top; border-top: 1px solid rgba(16,32,26,.07); ${i === 0 ? "background: #F1F9F4;" : ""}"><span style="display: flex; align-items: baseline; gap: 6px; font-size: 16px; font-weight: 700; color: ${i === 0 ? "#0B6B3F" : "#10201A"};">${fmt(v)}${i === best ? `<span style="font-size: 10.5px; font-weight: 700; color: #0B6B3F;">Best</span>` : ""}</span><span aria-hidden="true" style="display: block; margin-top: 7px; height: 6px; border-radius: 6px; background: #EEF3F0;"><span style="display: block; height: 100%; width: ${pct}%; border-radius: 6px; background: ${i === 0 ? "#16A85F" : "#B7C4BD"};"></span></span></td>`)
                .join("")}
            </tr>`;
const compare = `
    <section aria-label="You and them, side by side" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 40px 28px 0;">
      <div data-compare="1" style="display: grid; grid-template-columns: minmax(0, 0.42fr) minmax(0, 1.58fr); gap: 26px; align-items: start;">
        <div>
          ${eyebrow("Compare")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.03em; color: #10201A;">You and them, side by side.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">The measures customers actually notice, in one table. Each finding keeps the evidence it was based on, so you can check it before acting.</p>
          <p style="margin: 16px 0 0; display: flex; flex-wrap: wrap; gap: 8px;">${["Pricing", "Reputation", "Social", "Ads", "Trends"].map((t) => `<span style="padding: 6px 12px; border-radius: 999px; background: #fff; border: 1px solid rgba(16,32,26,.1); font-size: 12.5px; font-weight: 600; color: #3C4A43;">${t}</span>`).join("")}</p>
        </div>
        <div data-cmpwrap="1" style="${CARD} border-radius: 16px; padding: 8px 20px 14px; min-width: 0;">
          <table style="width: 100%; min-width: 660px; border-collapse: collapse;">
            <thead><tr><th style="padding: 12px 10px 12px 0; width: 24%;"></th>${biz.map(([n, c], i) => `<th style="padding: 12px 10px; text-align: left; font-size: 13px; font-weight: 700; color: ${c}; ${i === 0 ? "background: #F1F9F4; border-radius: 10px 10px 0 0;" : ""}">${n}</th>`).join("")}</tr></thead>
            <tbody>
              ${metric("Rating", "Average of public reviews", [[4.7, 94], [4.5, 90], [4.3, 86], [4.6, 92]], (v) => v.toFixed(1), 0)}
              ${metric("Reviews", "Total review count", [[312, 73], [428, 100], [196, 46], [254, 59]], (v) => v, 1)}
              ${metric("Haircut price", "Standard cut", [[45, 87], [48, 92], [40, 77], [52, 100]], (v) => "$" + v, 2)}
              ${metric("Evening hours", "Latest closing time", [[7, 78], [8, 89], [6, 67], [9, 100]], (v) => v + " PM", 3)}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

// Price tracker: three lines over 8 weeks + recent changes.
const priceChart = `
          <svg viewBox="0 0 560 230" role="img" aria-label="Line chart of colour treatment prices over eight weeks: yours steady at 85 dollars while two competitors rise" style="display: block; width: 100%; height: auto;">
            <g stroke="rgba(16,32,26,.08)" stroke-width="1">${[40, 85, 130, 175].map((y) => `<path d="M44 ${y}H548"></path>`).join("")}</g>
            <g font-size="11" fill="#8A968F" font-family="Instrument Sans, sans-serif">${[["$100", 44], ["$90", 89], ["$80", 134], ["$70", 179]].map(([t, y]) => `<text x="6" y="${y}">${t}</text>`).join("")}${["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"].map((w, i) => `<text x="${52 + i * 70}" y="214">${w}</text>`).join("")}</g>
            <path d="M58 152H128L198 152L268 130L338 130L408 107L478 107L548 107" fill="none" stroke="#B7C4BD" stroke-width="2.6" stroke-linejoin="round"></path>
            <path d="M58 130H128L198 130L268 130L338 116L408 116L478 85L548 85" fill="none" stroke="#E5A83B" stroke-width="2.6" stroke-linejoin="round"></path>
            <path d="M58 112H548" fill="none" stroke="#0B6B3F" stroke-width="3.4" stroke-linecap="round"></path>
            <circle cx="478" cy="85" r="5" fill="#fff" stroke="#E5A83B" stroke-width="2.6"></circle><circle cx="408" cy="107" r="5" fill="#fff" stroke="#B7C4BD" stroke-width="2.6"></circle>
          </svg>`;
const pricing = `
    <section aria-label="Price tracking" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 40px 28px 0;">
      <div data-pricegrid="1" style="display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr); gap: 20px; align-items: stretch;">
        <div style="${CARD} border-radius: 16px; padding: 22px 24px;">
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;">
            <div>${eyebrow("Pricing")}<h2 data-h2="1" style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Know when a competitor moves, not weeks later.</h2></div>
            <p style="margin: 0; display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: #3C4A43;">${[["You", "#0B6B3F"], ["The Style Room", "#E5A83B"], ["Glow Studio", "#B7C4BD"]].map(([n, c]) => `<span style="display: inline-flex; align-items: center; gap: 6px;"><span aria-hidden="true" style="width: 14px; height: 3px; border-radius: 3px; background: ${c};"></span>${n}</span>`).join("")}</p>
          </div>
          <p style="margin: 12px 0 6px; font-size: 13px; font-weight: 600; color: #56635C;">Colour treatment, last 8 weeks</p>
          ${priceChart}
        </div>
        <div style="${CARD} border-radius: 16px; padding: 22px 22px 10px;">
          <p style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #10201A;">Recent price changes</p>
          ${[["The Style Room", "Colour treatment", "+$8", "bad", "Week 7"], ["Glow Studio", "Colour treatment", "+$5", "bad", "Week 6"], ["Urban Cuts", "Haircut", "−$3", "good", "Week 5"], ["Shear Bliss", "Beard trim", "No change", "mute", "Week 8"]]
            .map(([b, item, change, tone, when]) => `<p style="margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 0; border-top: 1px solid rgba(16,32,26,.07);"><span style="min-width: 0;"><span style="display: block; font-size: 13.5px; font-weight: 600; color: #10201A;">${b}</span><span style="display: block; font-size: 11.5px; color: #6B776F;">${item} · ${when}</span></span>${pill(change, tone)}</p>`)
            .join("")}
        </div>
      </div>
    </section>`;

// Ranked opportunities.
const opp = (n, title, why, action, impact, tone) => `
          <li data-opp="1" style="display: grid; grid-template-columns: 44px minmax(0,1fr) auto; gap: 16px; align-items: center; padding: 16px 0; border-top: 1px solid rgba(255,255,255,.12);">
            <span aria-hidden="true" style="display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,.1); font-size: 18px; font-weight: 700; color: #9FE3BF;">${n}</span>
            <span><span style="display: block; font-size: 16px; font-weight: 700;">${title}</span><span style="display: block; margin-top: 3px; font-size: 13px; line-height: 1.55; color: #CFE6DC;"><b style="color: #fff; font-weight: 600;">Why:</b> ${why} <b style="color: #fff; font-weight: 600;">Try:</b> ${action}</span></span>
            ${pill(impact + " impact", tone)}
          </li>`;
const opportunities = `
    <section aria-label="Opportunities" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 40px 28px 0;">
      <div style="background: #0B3B2A; color: #fff; border-radius: 18px; padding: 30px 32px 16px;">
        <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; padding-bottom: 16px;">
          <div style="max-width: 600px;">${eyebrow("Opportunities", "#9FE3BF")}<h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.025em;">Not a report. A ranked list of what to do.</h2></div>
          <p style="margin: 0; max-width: 340px; font-size: 13.5px; line-height: 1.6; color: #CFE6DC;">You decide what to act on. Nothing in your business changes automatically.</p>
        </div>
        <ol style="margin: 0; padding: 0; list-style: none;">
          ${opp(1, "Add Saturday evening slots", "three competitors are fully booked on Saturdays after 5 PM.", "open 5 to 7 PM for two weeks and watch bookings.", "High", "good")}
          ${opp(2, "Promote colour treatment", "you are now 9% below the area average after two price rises nearby.", "feature it in this month's campaign.", "High", "good")}
          ${opp(3, "Reply to recent reviews", "Glow Studio answers within a day; four of yours are unanswered.", "use the drafted replies waiting in Reviews.", "Medium", "warn")}
        </ol>
      </div>
    </section>`;

// Weekly brief with the existing "Support Local Business" street photo.
const brief = `
    <section aria-label="The weekly brief" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 40px 28px 0;">
      <div data-brief="1" style="${CARD} border-radius: 18px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: stretch;">
        <div style="padding: 30px 32px;">
          ${eyebrow("Weekly brief")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.03em; color: #10201A;">Start the week with a plan, not a hunch.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">Once a week Noxtill sums up what moved among the businesses you track and what it means for you.</p>
          <ul style="margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 11px; font-size: 14.5px; color: #1D2B24;">
            ${["What changed: prices, ratings, new offers", "Where you gained or lost ground", "The top opportunities, with the reasoning shown"].map((t) => `<li style="display: flex; gap: 11px;"><span aria-hidden="true" style="flex: none; margin-top: 2px;">${icon("check-circle", 18, "#16A85F")}</span>${t}</li>`).join("")}
          </ul>
          <p style="margin: 20px 0 0; font-size: 13.5px; color: #56635C;">Works with <a href="/platform/reviews-reputation" style="font-weight: 600;">Reviews &amp; Reputation</a>, <a href="/platform/advertising" style="font-weight: 600;">Advertising</a>, <a href="/platform/business-listings" style="font-weight: 600;">Business Listings</a> and <a href="/ai/business-intelligence" style="font-weight: 600;">Business Intelligence</a>.</p>
        </div>
        ${img("np/assets/retail/cta.jpg", "A chalkboard sign outside a shop reading Support Local Business", "width: 100%; height: 100%; min-height: 300px; object-fit: cover;")}
      </div>
    </section>`;

const close = `
    <section aria-label="See the market clearly" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="border-radius: 18px; padding: 34px 36px; text-align: center; background: linear-gradient(180deg, #E7F6EC, #F5F7F3); border: 1px solid #CFE3D7;">
        <h2 data-h2="1" style="margin: 0 auto; max-width: 700px; font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: -0.03em; color: #10201A;">Stop guessing what competitors are doing.</h2>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 22px;">${btn("Track Your Competitors")}${btnGhost("Book a Demo")}</div>
        <div style="display: flex; justify-content: center;">${trial("#3C4A43", "#16A85F")}</div>
      </div>
    </section>`;

module.exports = {
  slug: "platform--competitive-insights",
  html: doc(
    { route: "/platform/competitive-insights", title: "Competitive Insights — Know Your Market, Move First | Noxtill", desc: "Track the competitors you choose and compare price, reputation and visibility side by side. Noxtill follows the changes and turns them into ranked opportunities and a weekly brief.", css },
    hero + compare + pricing + opportunities + brief + close,
  ),
};
