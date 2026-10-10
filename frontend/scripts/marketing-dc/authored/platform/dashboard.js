/* eslint-disable @typescript-eslint/no-require-imports */
// /platform/dashboard — a "command centre" page. The centrepiece is a coded mock of the Dashboard
// module itself ((app)/dashboard: today, actions, activity, insights, health-score, nightly-close).
const { esc, icon, img, pill, CARD, btn, btnGhost, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-dhero] { grid-template-columns: minmax(0,1fr) !important; }
    [data-bento] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    [data-bento] > [data-wide] { grid-column: 1 / -1 !important; }
    [data-day] { grid-template-columns: repeat(3, minmax(0,1fr)) !important; row-gap: 26px; }
    [data-day-line] { display: none !important; }
    [data-screens] { grid-template-columns: minmax(0,1fr) !important; }
  }
  @media (max-width: 720px) {
    [data-bento], [data-day] { grid-template-columns: minmax(0,1fr) !important; }
    [data-win-side] { display: none !important; }
    [data-win-body] { grid-template-columns: minmax(0,1fr) !important; }
    [data-kpis] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    [data-phone] { display: none !important; }
  }`;

const kpi = (label, value, delta, tone) => `
              <div style="background: #F6FAF7; border: 1px solid rgba(16,32,26,.06); border-radius: 10px; padding: 11px 12px;">
                <p style="margin: 0; font-size: 11px; color: #56635C;">${label}</p>
                <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">${value}</p>
                <p style="margin: 3px 0 0; font-size: 10.5px; font-weight: 600; color: ${tone === "warn" ? "#8A5A00" : "#0B6B3F"};">${delta}</p>
              </div>`;

const action = (ic, title, from, tone, label) => `
                <li style="display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid rgba(16,32,26,.06);">
                  <span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: #EEF6F1;">${icon(ic, 14, "#0B6B3F")}</span>
                  <span style="flex: 1; min-width: 0;"><span style="display: block; font-size: 12px; font-weight: 600; color: #10201A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</span><span style="display: block; font-size: 10.5px; color: #8A968F;">${from}</span></span>
                  ${pill(label, tone, "font-size: 10px; padding: 3px 8px;")}
                </li>`;

// The module window: sidebar, greeting, four KPIs, a sales curve and the action list.
const moduleWindow = `
        <div role="img" aria-label="The Noxtill Dashboard: today's sales, bookings and credit, a sales chart and a list of actions waiting for the owner (example data)" style="${CARD} border-radius: 16px; overflow: hidden; box-shadow: 0 30px 60px -30px rgba(8,30,20,.28);">
          <div style="display: flex; align-items: center; gap: 7px; padding: 10px 14px; background: #F3F6F4; border-bottom: 1px solid rgba(16,32,26,.07);">
            <span style="width: 9px; height: 9px; border-radius: 50%; background: #E0655A;"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #E5B94A;"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #54B36B;"></span>
            <span style="margin-left: 10px; font-size: 11px; color: #8A968F;">app.noxtill.com / dashboard</span>
          </div>
          <div data-win-body="1" style="display: grid; grid-template-columns: 150px minmax(0,1fr);">
            <div data-win-side="1" style="background: #0B3B2A; padding: 14px 10px; display: flex; flex-direction: column; gap: 4px;">
              ${[["dashboard", "Dashboard", 1], ["cart", "Fast Sale"], ["calendar", "Bookings"], ["users", "Customers"], ["boxes", "Inventory"], ["reports", "Reports"], ["settings", "Settings"]]
                .map(([ic, l, on]) => `<span style="display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; font-size: 11.5px; font-weight: 600; color: ${on ? "#0B3B2A" : "#BFD9CC"}; background: ${on ? "#9FE3BF" : "transparent"};">${icon(ic, 14, on ? "#0B3B2A" : "#9FE3BF")}${l}</span>`)
                .join("\n              ")}
            </div>
            <div style="padding: 16px 18px 18px; min-width: 0;">
              <div style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px;">
                <p style="margin: 0; font-size: 16px; font-weight: 700; color: #10201A;">Good morning, Alex</p>
                <p style="margin: 0; font-size: 11px; color: #8A968F;">Friday · Main branch</p>
              </div>
              <div data-kpis="1" style="margin-top: 12px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 9px;">
                ${kpi("Sales today", "$3,005", "↑ 12% vs last Fri")}${kpi("Bookings", "19", "4 slots open")}${kpi("Outstanding credit", "$640", "3 customers", "warn")}${kpi("Real profit", "$1,120", "37% margin")}
              </div>
              <div style="margin-top: 12px; display: grid; grid-template-columns: minmax(0,1.25fr) minmax(0,1fr); gap: 12px;" data-win-body="1">
                <div style="border: 1px solid rgba(16,32,26,.07); border-radius: 10px; padding: 12px;">
                  <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #10201A;">Sales this week</p>
                  <svg viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true" style="display: block; width: 100%; height: 118px;">
                    <defs><linearGradient id="dg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16A85F" stop-opacity=".28"></stop><stop offset="1" stop-color="#16A85F" stop-opacity="0"></stop></linearGradient></defs>
                    <path d="M0 30H320M0 60H320M0 90H320" stroke="rgba(16,32,26,.07)" stroke-width="1"></path>
                    <path d="M0 96 C30 88 44 70 64 74 S100 58 128 62 S168 30 192 40 S232 46 256 24 S300 26 320 12 V120 H0Z" fill="url(#dg)"></path>
                    <path d="M0 96 C30 88 44 70 64 74 S100 58 128 62 S168 30 192 40 S232 46 256 24 S300 26 320 12" fill="none" stroke="#16A85F" stroke-width="2.4" stroke-linecap="round"></path>
                    <circle cx="256" cy="24" r="4.5" fill="#fff" stroke="#16A85F" stroke-width="2.4"></circle>
                  </svg>
                  <p style="margin: 4px 0 0; display: flex; justify-content: space-between; font-size: 10px; color: #8A968F;"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></p>
                </div>
                <div style="border: 1px solid rgba(16,32,26,.07); border-radius: 10px; padding: 12px 12px 4px;">
                  <p style="margin: 0 0 2px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: #10201A;">Needs you ${pill("3", "bad", "font-size: 10px; padding: 2px 8px;")}</p>
                  <ul style="margin: 0; padding: 0; list-style: none;">
                    ${action("receipt", "Approve refund $45.00", "Fast Sale · 9:12 AM", "warn", "Approve")}${action("alert-stock", "Argan Oil Shampoo: 3 left", "Inventory · 8:40 AM", "bad", "Reorder")}${action("calendar-check", "3 bookings unconfirmed", "Bookings · tomorrow", "info", "Remind")}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>`;

const hero = `
    <section aria-label="Your whole business on one screen" data-pad="1" style="background: linear-gradient(180deg, #EAF6EF 0%, #F5F7F3 78%); padding: 34px 28px 10px;">
      <div data-dhero="1" style="max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr); gap: 40px; align-items: center;">
        <div>
          ${eyebrow("Dashboard")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 46px; line-height: 1.08; letter-spacing: -0.035em; color: #10201A; text-wrap: balance;">Your whole business.<br><span style="color: #0B6B3F;">One screen.</span></h1>
          <p style="margin: 18px 0 0; max-width: 470px; font-size: 16px; line-height: 1.7; color: #4A574F;">Open Noxtill and know where you stand before the first customer walks in: today's sales, bookings, cash and credit, plus the short list of things only you can decide.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">${btn("Open Your Dashboard")}${btnGhost("Book a Demo")}</div>
          <p style="margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 13.5px; color: #3C4A43;">
            <span style="display: inline-flex; align-items: center; gap: 8px;">${icon("sync", 16, "#16A85F")}Live from every module</span>
            <span style="display: inline-flex; align-items: center; gap: 8px;">${icon("locations", 16, "#16A85F")}Per branch or all branches</span>
          </p>
        </div>
        <div>${moduleWindow}
          ${demoNote()}
        </div>
      </div>
    </section>`;

// Six real views of the module as a bento grid — each tile is a small mock of that view.
const gauge = `
            <svg viewBox="0 0 200 118" aria-hidden="true" style="display: block; width: 100%; max-width: 230px; margin: 4px auto 0;">
              <path d="M20 104 A80 80 0 0 1 180 104" fill="none" stroke="#E6EFEA" stroke-width="16" stroke-linecap="round"></path>
              <path d="M20 104 A80 80 0 0 1 163 53" fill="none" stroke="#16A85F" stroke-width="16" stroke-linecap="round"></path>
              <text x="100" y="92" text-anchor="middle" font-size="40" font-weight="700" fill="#10201A" font-family="Instrument Sans, sans-serif">82</text>
              <text x="100" y="110" text-anchor="middle" font-size="11" fill="#56635C" font-family="Instrument Sans, sans-serif">out of 100 · Very healthy</text>
            </svg>`;
const bar = (label, value) => `<li style="display: grid; grid-template-columns: 92px minmax(0,1fr) 26px; align-items: center; gap: 8px; font-size: 12px; color: #3C4A43;"><span>${label}</span><span aria-hidden="true" style="height: 6px; border-radius: 6px; background: #EEF3F0; overflow: hidden;"><span style="display: block; height: 100%; width: ${value}%; background: ${value < 75 ? "#E5A83B" : "#16A85F"}; border-radius: 6px;"></span></span><span style="font-weight: 700; color: #10201A; text-align: right;">${value}</span></li>`;
const feed = (ic, text, time) => `<li style="display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: #1D2B24;"><span aria-hidden="true" style="flex: none; margin-top: 1px; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #E7F6EC;">${icon(ic, 12, "#0B6B3F")}</span><span style="flex: 1;">${text}<span style="display: block; font-size: 11px; color: #8A968F;">${time}</span></span></li>`;
const tileHead = (ic, title, text) => `<div style="display: flex; align-items: center; gap: 10px;"><span aria-hidden="true" style="display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #E7F6EC;">${icon(ic, 17, "#0B6B3F")}</span><h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #10201A;">${title}</h3></div><p style="margin: 8px 0 12px; font-size: 13px; line-height: 1.55; color: #56635C;">${text}</p>`;

const views = `
    <section aria-label="Six views of your business" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div style="max-width: 680px;">
        ${eyebrow("Six views, one home")}
        <h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">Everything you check every day, already checked.</h2>
      </div>
      <div data-bento="1" style="margin-top: 20px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px;">
        <div style="${CARD} padding: 18px 20px;">
          ${tileHead("sun", "Today", "Sales, orders, payments and cash for the day so far.")}
          <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; font-size: 13px;">
            ${[["Sales", "$3,005"], ["Orders", "26"], ["Average order", "$115.58"], ["Payments received", "$2,880"]].map(([l, v]) => `<li style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid rgba(16,32,26,.06);"><span style="color: #3C4A43;">${l}</span><span style="font-weight: 700; color: #10201A;">${v}</span></li>`).join("")}
          </ul>
        </div>
        <div style="${CARD} padding: 18px 20px;">
          ${tileHead("gauge", "Health Score", "One score from your own data, weakest area first.")}
          ${gauge}
          <ul style="margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 7px;">${bar("Cash & credit", 71)}${bar("Operations", 79)}${bar("Customers", 84)}${bar("Sales", 88)}</ul>
        </div>
        <div style="${CARD} padding: 18px 20px;">
          ${tileHead("activity", "Activity", "A running record of who did what, across the business.")}
          <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 11px;">
            ${feed("lock", "Sara closed register 1", "6:02 PM · Fast Sale")}${feed("invoice", "Invoice #1042 paid in full", "4:47 PM · Orders")}${feed("boxes", "24 items received into stock", "2:15 PM · Inventory")}${feed("calendar-check", "New booking: Emily Carter", "1:30 PM · Bookings")}
          </ul>
        </div>
        <div data-wide="1" style="${CARD} grid-column: span 2; padding: 18px 20px;">
          ${tileHead("insights", "Insights", "What changed, why it matters and what you could do about it.")}
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
            ${[["trending-up", "Weekend bookings are up 32%", "Consider opening two more Saturday slots.", "good", "Opportunity"], ["alert", "Credit is 14 days overdue for 2 customers", "$210 outstanding. A reminder is ready to send.", "warn", "Needs attention"], ["tag", "Colour treatment has your best margin", "70% margin, 31 sold this month.", "info", "Worth knowing"]]
              .map(([ic, t, d, tone, label]) => `<div style="border: 1px solid rgba(16,32,26,.08); border-radius: 12px; padding: 14px;"><div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">${icon(ic, 18, "#0B6B3F")}${pill(label, tone)}</div><p style="margin: 10px 0 4px; font-size: 14px; font-weight: 700; color: #10201A;">${t}</p><p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #56635C;">${d}</p></div>`)
              .join("")}
          </div>
        </div>
        <div style="position: relative; border-radius: 14px; overflow: hidden; background: #0A1B33; color: #fff; padding: 18px 20px; min-height: 250px;">
          ${img("np/pasted-1789718339762-0-mu6o393y-mop6.png", "", "position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .55;")}
          <div style="position: relative;">
            <div style="display: flex; align-items: center; gap: 10px;"><span aria-hidden="true" style="display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: rgba(255,255,255,.14);">${icon("clock", 17, "#9FE3BF")}</span><h3 style="margin: 0; font-size: 16px; font-weight: 700;">Nightly Close</h3></div>
            <p style="margin: 8px 0 14px; font-size: 13px; line-height: 1.55; color: #D5E3F2;">The day, summed up and sent to you every evening.</p>
            <div style="background: rgba(255,255,255,.96); color: #10201A; border-radius: 12px; padding: 12px 13px; font-size: 12px;">
              <p style="margin: 0 0 6px; font-weight: 700;">Tonight's summary · 9:00 PM</p>
              ${[["Sales", "$3,005"], ["Real profit", "$1,120"], ["Tomorrow's bookings", "14"], ["Low stock", "2 items"]].map(([l, v]) => `<p style="margin: 0; display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px solid rgba(16,32,26,.07);"><span style="color: #56635C;">${l}</span><b>${v}</b></p>`).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>`;

// A day with the dashboard: one horizontal line through the working day.
const day = `
    <section aria-label="A day with your dashboard" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div style="${CARD} padding: 26px 28px 28px;">
        <h2 data-h2="1" style="margin: 0 0 22px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">A day with your dashboard</h2>
        <div style="position: relative;">
          <span data-day-line="1" aria-hidden="true" style="position: absolute; left: 4%; right: 4%; top: 17px; height: 2px; background: repeating-linear-gradient(90deg, #B9D9C6 0 8px, transparent 8px 14px);"></span>
          <ol data-day="1" style="position: relative; margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 14px;">
            ${[["8:30 AM", "sun", "Open", "See yesterday's close and what today looks like."], ["11:00 AM", "checklist", "Decide", "Approve the refund and the reorder waiting for you."], ["2:00 PM", "insights", "Notice", "An insight flags a slow afternoon; send an offer."], ["6:00 PM", "lock", "Close", "Registers close and totals reconcile by themselves."], ["9:00 PM", "clock", "Review", "The Nightly Close arrives with the full picture."]]
              .map(([time, ic, t, d]) => `<li style="text-align: center; padding: 0 6px;"><span aria-hidden="true" style="display: grid; place-items: center; width: 36px; height: 36px; margin: 0 auto; border-radius: 50%; background: #0B5535; box-shadow: 0 0 0 5px #fff;">${icon(ic, 17, "#fff")}</span><p style="margin: 12px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #0B6B3F;">${time}</p><p style="margin: 4px 0 0; font-size: 15px; font-weight: 700; color: #10201A;">${t}</p><p style="margin: 4px 0 0; font-size: 12.5px; line-height: 1.5; color: #56635C;">${d}</p></li>`)
              .join("")}
          </ol>
        </div>
      </div>
    </section>`;

// On every screen: the laptop + phone product shot already used on the site, with the mobile greeting.
const screens = `
    <section aria-label="The same picture on every screen" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div data-screens="1" style="display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr); gap: 26px; align-items: center;">
        <div style="position: relative; border-radius: 16px; overflow: hidden; background: #EAF6EF; padding: 22px 22px 0;">
          ${img("hb/run-your-entire-business-in-one-connecte-muxgs6oj-w72n.png", "The Noxtill dashboard on a laptop and a phone", "width: 100%; height: auto;")}
        </div>
        <div>
          ${eyebrow("Desk, counter or pocket")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.03em; color: #10201A;">The same numbers, wherever you are.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">The dashboard is built from live records, not a nightly export. Check it at the counter in the morning and on your phone in the evening and it always agrees with the till.</p>
          <ul style="margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 11px; font-size: 14.5px; color: #1D2B24;">
            ${["Switch between one branch and all branches", "Each role sees only what it is allowed to see", "Tap any number to open the records behind it"].map((t) => `<li style="display: flex; align-items: flex-start; gap: 11px;"><span aria-hidden="true" style="flex: none; margin-top: 2px;">${icon("check-circle", 18, "#16A85F")}</span>${esc(t)}</li>`).join("")}
          </ul>
          <p style="margin: 20px 0 0; display: flex; flex-wrap: wrap; gap: 10px;">
            ${[["Reports", "/platform/reports"], ["Profit & Analytics", "/platform/profit-analytics"], ["Nightly Close", "/nightly-close"]].map(([l, h]) => `<a href="${h}" style="display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(16,32,26,.14); border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #10201A; background: #fff;" style-hover="border-color: #0B6B3F; color: #0B6B3F;">${l} <span aria-hidden="true">→</span></a>`).join("")}
          </p>
        </div>
      </div>
    </section>`;

const close = `
    <section aria-label="Start every day knowing where you stand" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="background: #0B4A2C; border-radius: 18px; padding: 36px 38px; text-align: center; color: #fff;">
        <h2 data-h2="1" style="margin: 0 auto; max-width: 720px; font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em;">Start every day knowing exactly where you stand.</h2>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 22px;">
          <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #fff; color: #0B4A2C; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: #E7F6EC; color: #0B4A2C;">Open Your Dashboard <span aria-hidden="true">→</span></a>
          <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
        </div>
        <div style="display: flex; justify-content: center;">${trial()}</div>
      </div>
    </section>`;

module.exports = {
  slug: "platform--dashboard",
  html: doc(
    { route: "/platform/dashboard", title: "Dashboard — Your Whole Business on One Screen | Noxtill", desc: "See today's sales, bookings, cash and credit, the actions waiting for you, a business health score and a Nightly Close summary — live from every Noxtill module.", css },
    hero + views + day + screens + close,
  ),
};
