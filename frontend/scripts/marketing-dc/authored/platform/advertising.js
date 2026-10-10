/* eslint-disable @typescript-eslint/no-require-imports */
// /platform/advertising — a dark hero with a wall of the ad creatives already in the asset library,
// then the campaign builder as a stepper, a results funnel and an A/B experiment.
// Module: (app)/advertising (campaigns, builder, audiences, creatives, calendar, experiments, rules,
// leads, performance, analytics).
const { icon, img, pill, CARD, eyebrow, demoNote, doc, trial } = require("../kit");

const AD = {
  spree: "np/pasted-1789762164765-0-mu7e6kp4-uudb.png",
  birthday: "np/pasted-1789762183415-0-mu7e6z2a-cdjs.png",
  miss: "np/pasted-1789762212303-0-mu7e7lcz-wcuv.png",
  review: "np/pasted-1789762195750-0-mu7e78l5-ijey.png",
};

const css = `
  @media (max-width: 1180px) {
    [data-adhero] { grid-template-columns: minmax(0,1fr) !important; }
    [data-wall] { max-width: 620px; margin: 0 auto; }
    [data-builder] { grid-template-columns: minmax(0,1fr) !important; }
    [data-stepper] { flex-direction: row !important; flex-wrap: wrap; }
    [data-stepper] > li { flex: 1 1 200px !important; }
    [data-funnel] { grid-template-columns: minmax(0,1fr) !important; }
    [data-ab] { grid-template-columns: minmax(0,1fr) !important; }
  }
  @media (max-width: 720px) {
    [data-wall] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    [data-wall] > * { transform: none !important; margin: 0 !important; }
    [data-abpair] { grid-template-columns: minmax(0,1fr) !important; }
    [data-rules] { grid-template-columns: minmax(0,1fr) !important; }
  }`;

const adCard = (file, alt, label, stat, style) => `
          <figure style="margin: 0; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 22px 44px -18px rgba(0,0,0,.5); ${style}">
            ${img(file, alt, "width: 100%; aspect-ratio: 16 / 9; object-fit: cover;")}
            <figcaption style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; font-size: 12px; color: #10201A;"><b>${label}</b><span style="color: #0B6B3F; font-weight: 700;">${stat}</span></figcaption>
          </figure>`;

const hero = `
    <section aria-label="Ads that reach, results you can see" data-pad="1" style="background: radial-gradient(900px 420px at 80% 10%, #14694A 0%, rgba(20,105,74,0) 60%), #0B3B2A; color: #fff; padding: 52px 28px 56px;">
      <div data-adhero="1" style="max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 46px; align-items: center;">
        <div>
          ${eyebrow("Advertising", "#9FE3BF")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.035em;">Ads that reach.<br><span style="color: #9FE3BF;">Results you can see.</span></h1>
          <p style="margin: 18px 0 0; max-width: 480px; font-size: 16px; line-height: 1.7; color: #CFE6DC;">Build campaigns from the customers you already know, test what works, and follow every ad from the first impression to a booking or a sale.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">
            <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #9FE3BF; color: #0B3B2A; font-size: 15px; font-weight: 700; padding: 14px 26px; border-radius: 9px;" style-hover="background: #C5F0D8; color: #0B3B2A;">Launch a Campaign <span aria-hidden="true">→</span></a>
            <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
          </div>
          <p style="margin: 26px 0 0; display: flex; flex-wrap: wrap; gap: 10px 26px; font-size: 13.5px; color: #CFE6DC;">
            ${[["295", "leads in 30 days"], ["$4.20", "cost per lead"], ["7.2×", "return on spend"]].map(([v, l]) => `<span><b style="font-size: 22px; color: #fff; letter-spacing: -0.02em;">${v}</b> ${l}</span>`).join("")}
          </p>
          ${demoNote("#9DBFAF")}
        </div>
        <div data-wall="1" role="group" aria-label="Example ad creatives" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px; align-items: start;">
          ${adCard(AD.spree, "Shopping Spree sale ad creative", "Weekend Flash Sale", "4.6% CTR", "transform: rotate(-2.5deg);")}
          ${adCard(AD.miss, "We Miss You win-back ad creative", "Win-back Offer", "112 leads", "transform: rotate(2deg); margin-top: 26px;")}
          ${adCard(AD.birthday, "Happy Birthday offer ad creative", "Birthday Treat", "38 bookings", "transform: rotate(1.5deg); margin-top: -8px;")}
          ${adCard(AD.review, "Review request ad creative with a star", "Review Drive", "61 reviews", "transform: rotate(-1.5deg); margin-top: 16px;")}
        </div>
      </div>
    </section>`;

// Campaign builder as a stepper + the form of the active step.
const stepItem = (n, t, d, state) => `
            <li style="flex: 0 0 auto; display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; ${state === "on" ? "background: #E7F6EC; border: 1px solid #B9DFC9;" : "border: 1px solid transparent;"}">
              <span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: 12.5px; font-weight: 700; ${state === "done" ? "background: #16A85F; color: #fff;" : state === "on" ? "background: #0B4A2C; color: #fff;" : "background: #EEF1EF; color: #6B776F;"}">${state === "done" ? "✓" : n}</span>
              <span><span style="display: block; font-size: 14px; font-weight: 700; color: ${state === "todo" ? "#6B776F" : "#10201A"};">${t}</span><span style="display: block; font-size: 12px; color: #6B776F;">${d}</span></span>
            </li>`;
const chip = (t, on) => `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; ${on ? "background: #0B4A2C; color: #fff;" : "background: #fff; border: 1px solid rgba(16,32,26,.14); color: #3C4A43;"}">${on ? "✓ " : ""}${t}</span>`;
const builder = `
    <section aria-label="The campaign builder" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div style="max-width: 680px; margin-bottom: 18px;">${eyebrow("Campaign builder")}<h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">Four steps, and your customer list does the targeting.</h2></div>
      <div data-builder="1" role="img" aria-label="Campaign builder on the Audience step, selecting customers who have not visited for 60 days (example data)" style="${CARD} border-radius: 16px; padding: 18px; display: grid; grid-template-columns: 250px minmax(0,1fr); gap: 20px; align-items: start; box-shadow: 0 26px 54px -32px rgba(8,30,20,.26);">
        <ol data-stepper="1" style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px;">
          ${stepItem(1, "Goal", "More bookings", "done")}${stepItem(2, "Audience", "Who should see it", "on")}${stepItem(3, "Creative", "Image and wording", "todo")}${stepItem(4, "Budget & dates", "Then launch", "todo")}
        </ol>
        <div style="min-width: 0; border: 1px solid rgba(16,32,26,.08); border-radius: 13px; padding: 18px 20px;">
          <p style="margin: 0; font-size: 17px; font-weight: 700; color: #10201A;">Who should see this campaign?</p>
          <p style="margin: 4px 0 14px; font-size: 13px; color: #6B776F;">Audiences are built from your own customers, bookings and sales.</p>
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #56635C;">SAVED AUDIENCES</p>
          <p style="margin: 0; display: flex; flex-wrap: wrap; gap: 8px;">${chip("Lapsed 60+ days", true)}${chip("High spenders")}${chip("New this month")}${chip("Booked, never bought")}${chip("Birthday this month")}</p>
          <div style="margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px;">
            <div style="background: #F6FAF7; border-radius: 11px; padding: 13px 14px;"><p style="margin: 0; font-size: 12px; color: #56635C;">People in this audience</p><p style="margin: 4px 0 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">1,120</p><p style="margin: 2px 0 0; font-size: 11.5px; color: #6B776F;">Last visit more than 60 days ago</p></div>
            <div style="background: #F6FAF7; border-radius: 11px; padding: 13px 14px;"><p style="margin: 0; font-size: 12px; color: #56635C;">Visited at least twice</p><p style="margin: 4px 0 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">742</p><p style="margin: 2px 0 0; font-size: 11.5px; color: #6B776F;">Returning customers who lapsed</p></div>
            <div style="background: #F6FAF7; border-radius: 11px; padding: 13px 14px;"><p style="margin: 0; font-size: 12px; color: #56635C;">Average past spend</p><p style="margin: 4px 0 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">$84</p><p style="margin: 2px 0 0; font-size: 11.5px; color: #6B776F;">Per visit, last 12 months</p></div>
          </div>
          <p style="margin: 16px 0 0; display: flex; justify-content: flex-end; gap: 10px;"><span style="padding: 9px 16px; border-radius: 8px; border: 1px solid rgba(16,32,26,.14); font-size: 13px; font-weight: 600; color: #3C4A43;">Back</span><span style="padding: 9px 18px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 13px; font-weight: 600;">Next: Creative →</span></p>
        </div>
      </div>
      ${demoNote()}
    </section>`;

// Funnel + campaign table.
const funnelRow = (label, value, pct, note) => `
            <li style="display: grid; grid-template-columns: 110px minmax(0,1fr); gap: 12px; align-items: center;">
              <span style="font-size: 13px; font-weight: 600; color: #3C4A43;">${label}</span>
              <span style="display: block; height: 40px; border-radius: 9px; background: #EEF3F0; overflow: hidden;"><span style="display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 100%; width: ${pct}%; min-width: 150px; padding: 0 12px; background: linear-gradient(90deg, #0B5535, #16A85F); color: #fff; font-size: 13px; font-weight: 700; border-radius: 9px; white-space: nowrap;">${value}<span style="font-weight: 500; font-size: 11.5px; opacity: .9;">${note}</span></span></span>
            </li>`;
const campaigns = [
  ["Autumn Rebook Offer", "$420", "112", "$3.75", ["Active", "good"]],
  ["New Customer Welcome", "$310", "74", "$4.19", ["Active", "good"]],
  ["Weekend Flash Sale", "$280", "61", "$4.59", ["Active", "good"]],
  ["Gift Card Promotion", "$150", "33", "$4.55", ["Scheduled", "info"]],
];
const funnel = `
    <section aria-label="From impression to sale" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-funnel="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: stretch;">
        <div style="${CARD} border-radius: 16px; padding: 22px 24px;">
          ${eyebrow("Performance")}
          <h2 data-h2="1" style="margin: 0 0 16px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Follow an ad all the way to the sale.</h2>
          <ol style="margin: 0; padding: 0; list-style: none; display: grid; gap: 9px;">
            ${funnelRow("Seen", "48,200", 100, "impressions")}${funnelRow("Clicked", "1,930", 62, "4.0% of views")}${funnelRow("Became a lead", "295", 40, "15% of clicks")}${funnelRow("Bought or booked", "108", 26, "$8,960 revenue")}
          </ol>
          <p style="margin: 14px 0 0; font-size: 12.5px; line-height: 1.55; color: #6B776F;">Leads land in Customers (CRM) with the campaign attached, so a later booking or sale is credited to the ad that started it.</p>
        </div>
        <div style="${CARD} border-radius: 16px; padding: 22px 24px; min-width: 0;">
          <p style="margin: 0 0 6px; display: flex; align-items: center; justify-content: space-between; font-size: 16px; font-weight: 700; color: #10201A;">Campaigns <span style="font-size: 12px; font-weight: 600; color: #6B776F;">Last 30 days</span></p>
          <div style="overflow-x: auto;">
            <table style="width: 100%; min-width: 440px; border-collapse: collapse; font-size: 13px;">
              <thead><tr style="text-align: left; color: #8A968F; font-size: 11.5px;">${["Campaign", "Spend", "Leads", "Cost per lead", ""].map((c) => `<th style="padding: 10px 8px; font-weight: 600; border-bottom: 1px solid rgba(16,32,26,.08);">${c}</th>`).join("")}</tr></thead>
              <tbody>${campaigns.map((r, i) => `<tr>${r.map((c, j) => `<td style="padding: 11px 8px; ${i < campaigns.length - 1 ? "border-bottom: 1px solid rgba(16,32,26,.06);" : ""} ${j === 0 ? "font-weight: 600; color: #10201A;" : "color: #1D2B24;"}">${Array.isArray(c) ? pill(c[0], c[1]) : c}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>`;

// A/B experiment with two real creatives + rules.
const variant = (file, alt, name, ctr, leads, win) => `
            <div style="border-radius: 13px; overflow: hidden; background: #fff; ${win ? "border: 2px solid #16A85F;" : "border: 1px solid rgba(16,32,26,.1);"}">
              ${img(file, alt, "width: 100%; aspect-ratio: 16 / 9; object-fit: cover;")}
              <div style="padding: 12px 14px;">
                <p style="margin: 0; display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; font-weight: 700; color: #10201A;">${name}${win ? pill("Winner", "good") : pill("Paused", "mute")}</p>
                <p style="margin: 8px 0 0; display: flex; gap: 18px; font-size: 12.5px; color: #56635C;"><span><b style="font-size: 18px; color: #10201A;">${ctr}</b> CTR</span><span><b style="font-size: 18px; color: #10201A;">${leads}</b> leads</span></p>
              </div>
            </div>`;
const ab = `
    <section aria-label="Experiments and rules" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-ab="1" style="display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr); gap: 20px; align-items: stretch;">
        <div style="background: #EAF3EE; border-radius: 18px; padding: 24px 26px;">
          ${eyebrow("Experiments")}
          <h2 data-h2="1" style="margin: 0 0 16px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Run two versions. Keep the one that works.</h2>
          <div data-abpair="1" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px;">
            ${variant(AD.miss, "Variant A: We Miss You creative", "A · “We miss you”", "4.6%", "68", true)}
            ${variant(AD.spree, "Variant B: Shopping Spree creative", "B · “Shopping spree”", "3.1%", "44", false)}
          </div>
        </div>
        <div style="${CARD} border-radius: 18px; padding: 24px 24px 12px;">
          ${eyebrow("Rules")}
          <h2 data-h2="1" style="margin: 0 0 10px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">A poor ad never quietly spends your budget.</h2>
          ${[["sliders", "Pause when cost per lead is above $8", "On"], ["bell", "Alert me at 80% of budget", "On"], ["trending-up", "Raise budget 10% when CTR beats 4%", "Off"]]
            .map(([ic, t, s]) => `<p style="margin: 0; display: flex; align-items: center; gap: 11px; padding: 12px 0; border-top: 1px solid rgba(16,32,26,.07); font-size: 13.5px; color: #1D2B24;">${icon(ic, 17, "#0B6B3F")}<span style="flex: 1;">${t}</span>${pill(s, s === "On" ? "good" : "mute")}</p>`)
            .join("")}
        </div>
      </div>
      <p style="margin: 16px 0 0; font-size: 13.5px; color: #56635C;">Works with <a href="/platform/social-media" style="font-weight: 600;">Social Media Management</a>, <a href="/platform/marketing-campaigns" style="font-weight: 600;">Marketing &amp; Campaigns</a>, <a href="/platform/crm" style="font-weight: 600;">Customers (CRM)</a> and <a href="/platform/competitive-insights" style="font-weight: 600;">Competitive Insights</a>.</p>
    </section>`;

const close = `
    <section aria-label="Advertise with your own customer data" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="border-radius: 18px; background: #0B4A2C; color: #fff; padding: 36px 38px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 24px; align-items: center;">
        <div>
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em;">Know which ads bring customers through the door.</h2>
          ${trial()}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: flex-start;">
          <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #9FE3BF; color: #0B3B2A; font-size: 15px; font-weight: 700; padding: 15px 28px; border-radius: 9px;" style-hover="background: #C5F0D8; color: #0B3B2A;">Launch a Campaign <span aria-hidden="true">→</span></a>
          <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
        </div>
      </div>
    </section>`;

module.exports = {
  slug: "platform--advertising",
  html: doc(
    { route: "/platform/advertising", title: "Advertising — Ads That Reach, Results You Can See | Noxtill", desc: "Plan, build and measure ad campaigns from the same place you manage customers: audiences from your own data, a creative library, A/B experiments, rules and lead tracking to the sale.", css },
    hero + builder + funnel + ab + close,
  ),
};
