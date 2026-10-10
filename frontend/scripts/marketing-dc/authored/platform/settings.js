/* eslint-disable @typescript-eslint/no-require-imports */
// /platform/settings — hero over the existing "Welcome to Noxtill / setup" photo, then a coded mock of
// the Settings hub ((app)/settings: hub categories + tools: tax, labels, messages, nightly-close,
// privacy, security, billing, developer), a rule-propagation diagram and a role permission matrix.
const { esc, icon, pill, CARD, btn, btnGhost, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-shero] { background-position: 72% center !important; }
    [data-hub] { grid-template-columns: minmax(0,1fr) !important; }
    [data-hub-nav] { display: flex !important; flex-wrap: wrap; gap: 6px !important; padding: 12px !important; border-right: 0 !important; border-bottom: 1px solid rgba(16,32,26,.07); }
    [data-flowmap] { grid-template-columns: minmax(0,1fr) !important; }
    [data-flowmap] [data-arrow] { transform: rotate(90deg); margin: 0 auto; }
    [data-matrixwrap] { overflow-x: auto !important; }
    [data-tools] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
  }
  @media (max-width: 720px) {
    [data-shero] { background-image: none !important; padding-top: 32px !important; padding-bottom: 32px !important; }
    [data-shero-inner] { max-width: none !important; }
    [data-tools], [data-targets] { grid-template-columns: minmax(0,1fr) !important; }
    [data-row] { grid-template-columns: minmax(0,1fr) !important; row-gap: 6px !important; }
  }`;

const hero = `
    <section aria-label="Set it up once, run it your way" data-pad="1" data-shero="1" style="background: #F2F4EF url('/marketing/np/d956297d-a89e-4257-99ee-d0b0b769f5fc-mulpwnrb-h0x4.png') right center / cover no-repeat; padding: 64px 28px 68px;">
      <div style="max-width: 1400px; margin: 0 auto;">
        <div data-shero-inner="1" style="max-width: 520px;">
          ${eyebrow("Settings")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 46px; line-height: 1.08; letter-spacing: -0.035em; color: #10201A;">Set it up once.<br><span style="color: #0B6B3F;">Run it your way.</span></h1>
          <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.7; color: #3C4A43;">Currency, tax, roles, limits, message wording and security live in one hub. Change a rule in one place and the till, the invoice and the report all follow it.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">${btn("Configure Your Business")}${btnGhost("Book a Demo")}</div>
        </div>
      </div>
    </section>`;

const toggle = (on) => `<span role="img" aria-label="${on ? "On" : "Off"}" style="flex: none; position: relative; display: inline-block; width: 38px; height: 22px; border-radius: 999px; background: ${on ? "#16A85F" : "#C9D6CF"};"><span style="position: absolute; top: 3px; left: ${on ? "19px" : "3px"}; width: 16px; height: 16px; border-radius: 50%; background: #fff;"></span></span>`;
const valueBox = (v) => `<span style="flex: none; display: inline-flex; align-items: center; min-width: 92px; justify-content: space-between; gap: 10px; border: 1px solid rgba(16,32,26,.14); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; font-weight: 600; color: #10201A; background: #fff;">${v}<span aria-hidden="true" style="font-size: 9px; color: #8A968F;">▾</span></span>`;
const row = (title, desc, control, who) => `
              <div data-row="1" style="display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 14px; padding: 13px 0; border-top: 1px solid rgba(16,32,26,.07);">
                <div style="min-width: 0;"><p style="margin: 0; font-size: 13.5px; font-weight: 600; color: #10201A;">${title}</p><p style="margin: 2px 0 0; font-size: 12px; line-height: 1.45; color: #6B776F;">${desc}</p></div>
                <div style="display: flex; align-items: center; gap: 10px;">${who ? pill(who, "mute", "font-size: 10.5px;") : ""}${control}</div>
              </div>`;

const cats = [["store", "Business", 0], ["coins", "Money & Sales", 1], ["calendar", "Bookings", 0], ["users", "Team & Roles", 0], ["messages", "Messages", 0], ["sparkles", "AI & Automation", 0], ["shield", "Security", 0], ["lock", "Privacy & Data", 0], ["card", "Billing & Plan", 0]];

const hub = `
    <section aria-label="The Settings hub" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 18px;">
        <div style="max-width: 640px;">
          ${eyebrow("The Settings hub")}
          <h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">Nine categories. Every rule in plain words.</h2>
        </div>
        <p style="margin: 0; max-width: 380px; font-size: 14px; line-height: 1.6; color: #56635C;">Each setting says what it does, where it applies and who is allowed to change it.</p>
      </div>
      <div role="img" aria-label="Noxtill Settings hub showing the Money and Sales category with refund limit, maximum discount, tax rule and currency (example values)" data-hub="1" style="${CARD} border-radius: 16px; overflow: hidden; display: grid; grid-template-columns: 236px minmax(0,1fr); box-shadow: 0 26px 54px -32px rgba(8,30,20,.26);">
        <div data-hub-nav="1" style="background: #F6F8F5; border-right: 1px solid rgba(16,32,26,.07); padding: 16px 12px; display: grid; gap: 3px; align-content: start;">
          ${cats.map(([ic, l, on]) => `<span style="display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 9px; font-size: 13px; font-weight: 600; color: ${on ? "#0B4A2C" : "#3C4A43"}; background: ${on ? "#DDF1E5" : "transparent"};">${icon(ic, 16, on ? "#0B6B3F" : "#6B776F")}${l}</span>`).join("\n          ")}
        </div>
        <div style="padding: 20px 24px 12px; min-width: 0;">
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 14px;">
            <div><p style="margin: 0; font-size: 18px; font-weight: 700; color: #10201A;">Money &amp; Sales</p><p style="margin: 2px 0 0; font-size: 12.5px; color: #6B776F;">Applies to Fast Sale, Orders, Quotes and Reports</p></div>
            <span style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #0B6B3F;">${icon("check-circle", 15, "#16A85F")}All changes saved</span>
          </div>
          ${row("Currency", "Shown on every price, receipt and report.", valueBox("USD ($)"), "Owner")}
          ${row("Sales tax", "Added to taxable items at checkout and broken out in reports.", valueBox("8.25%"), "Owner")}
          ${row("Refund limit for staff", "Refunds above this amount wait for a manager or owner.", valueBox("$50.00"), "Owner")}
          ${row("Maximum discount", "The largest discount a staff member can apply alone.", valueBox("15%"), "Manager")}
          ${row("Require a reason for voids", "Staff must pick a reason before voiding a sale.", toggle(true), "Manager")}
          ${row("Allow selling when stock is zero", "Lets a sale go through and records the shortfall.", toggle(false), "Owner")}
        </div>
      </div>
      ${demoNote()}
    </section>`;

// One rule → where it is enforced.
const target = (ic, mod, what) => `<div style="${CARD} padding: 14px 16px; display: flex; align-items: flex-start; gap: 12px;"><span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #E7F6EC;">${icon(ic, 17, "#0B6B3F")}</span><div><p style="margin: 0; font-size: 14px; font-weight: 700; color: #10201A;">${mod}</p><p style="margin: 3px 0 0; font-size: 12.5px; line-height: 1.5; color: #56635C;">${what}</p></div></div>`;
const flowmap = `
    <section aria-label="One change, applied everywhere" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div style="background: #0B3B2A; border-radius: 18px; padding: 30px 32px; color: #fff;">
        <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.025em;">One change. Applied everywhere.</h2>
        <p style="margin: 10px 0 22px; max-width: 620px; font-size: 14.5px; line-height: 1.65; color: #CFE6DC;">A policy is stored once and checked at the moment of the action, so two screens can never disagree about the same rule.</p>
        <div data-flowmap="1" style="display: grid; grid-template-columns: minmax(0, 0.8fr) 56px minmax(0, 1.6fr); gap: 18px; align-items: center;">
          <div style="background: #fff; color: #10201A; border-radius: 14px; padding: 18px;">
            <p style="margin: 0; font-size: 11.5px; font-weight: 700; letter-spacing: .1em; color: #0B6B3F;">YOU SET</p>
            <p style="margin: 8px 0 4px; font-size: 17px; font-weight: 700;">Refund limit for staff</p>
            <p style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; color: #0B6B3F;">$50.00</p>
            <p style="margin: 8px 0 0; font-size: 12px; color: #6B776F;">Changed by Alex · recorded in the audit trail</p>
          </div>
          <svg data-arrow="1" viewBox="0 0 56 24" aria-hidden="true" style="width: 56px; height: 24px;"><path d="M2 12h44" stroke="#9FE3BF" stroke-width="2" stroke-dasharray="5 5" fill="none"></path><path d="m44 5 9 7-9 7Z" fill="#9FE3BF"></path></svg>
          <div data-targets="1" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px;">
            ${target("cart", "Fast Sale", "A $72 refund stops and asks for approval.")}${target("orders", "Orders", "Order refunds follow the same limit.")}${target("checklist", "Action Center", "The owner sees the request to approve.")}${target("reports", "Reports", "Approved refunds show who approved them.")}
          </div>
        </div>
      </div>
    </section>`;

// Roles × permissions matrix.
const yes = `<span aria-label="Allowed" style="display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #E7F6EC;">${icon("check", 13, "#0B6B3F")}</span>`;
const no = `<span aria-label="Not allowed" style="display: inline-block; width: 12px; height: 2px; border-radius: 2px; background: #C9D6CF;"></span>`;
const part = (t) => pill(t, "warn", "font-size: 10.5px;");
const perms = [
  ["Sell and take payment", yes, yes, yes, no],
  ["Apply a discount", yes, yes, part("Up to 15%"), no],
  ["Refund a sale", yes, yes, part("Up to $50"), no],
  ["See profit and costs", yes, part("Own branch"), no, yes],
  ["Change tax and currency", yes, no, no, no],
  ["Manage staff and roles", yes, part("Own branch"), no, no],
  ["Approve AI actions", yes, yes, no, no],
];
const matrix = `
    <section aria-label="Roles and permissions" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 26px; align-items: start;">
        <div style="max-width: 420px;">
          ${eyebrow("Team & roles")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.03em; color: #10201A;">Trust your team. Keep control.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">Start from four ready roles and tune each one. A permission can be a simple yes or no, or a limit: a manager can see profit, but only for their own branch.</p>
          <p style="margin: 16px 0 0; font-size: 14px;"><a href="/platform/staff" style="font-weight: 600;">How roles work with Staff →</a></p>
        </div>
        <div data-matrixwrap="1" style="${CARD} padding: 6px 18px 12px; grid-column: span 2; min-width: 0;">
          <table style="width: 100%; min-width: 640px; border-collapse: collapse; font-size: 13px;">
            <thead><tr style="text-align: center; color: #56635C; font-size: 12px;"><th style="padding: 13px 8px; text-align: left; font-weight: 600; border-bottom: 1px solid rgba(16,32,26,.08);">Permission</th>${["Owner", "Manager", "Staff", "Accountant"].map((r) => `<th style="padding: 13px 8px; font-weight: 700; color: #10201A; border-bottom: 1px solid rgba(16,32,26,.08);">${r}</th>`).join("")}</tr></thead>
            <tbody>
${perms.map((r, i) => `              <tr>${r.map((c, j) => `<td style="padding: 11px 8px; ${j ? "text-align: center;" : "font-weight: 600; color: #10201A;"} ${i < perms.length - 1 ? "border-bottom: 1px solid rgba(16,32,26,.06);" : ""}">${c}</td>`).join("")}</tr>`).join("\n")}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

// The other tools in the hub.
const tools = `
    <section aria-label="More in the hub" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <h2 data-h2="1" style="margin: 0 0 16px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Also in the hub</h2>
      <div data-tools="1" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px;">
        ${[
          ["messages", "Message wording", "Receipts, reminders and follow-ups in your own words.", "/platform/unified-inbox"],
          ["tag", "Labels", "Printable price and shelf labels from your catalogue.", "/platform/products-services"],
          ["clock", "Nightly Close", "Choose what the evening summary includes and who gets it.", "/nightly-close"],
          ["shield", "Security", "Two-step sign-in, sessions and sign-in history.", "/trust/security"],
          ["download", "Privacy & data", "Export your records whenever you need them.", "/privacy/choices"],
          ["card", "Billing & plan", "See your plan, usage and invoices in one place.", "/pricing"],
          ["plug", "Integrations", "Connect the other tools your business already uses.", "/platform/integrations"],
          ["cpu", "Developer", "API keys and webhooks for your own systems.", "/developers/api"],
        ]
          .map(([ic, t, d, h]) => `<a href="${h}" style="${CARD} display: block; padding: 16px; color: #10201A;" style-hover="border-color: #9CC9B1; color: #10201A;"><span aria-hidden="true" style="display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #E7F6EC;">${icon(ic, 17, "#0B6B3F")}</span><span style="display: block; margin-top: 12px; font-size: 14.5px; font-weight: 700;">${t}</span><span style="display: block; margin-top: 4px; font-size: 12.5px; line-height: 1.5; color: #56635C;">${esc(d)}</span></a>`)
          .join("\n        ")}
      </div>
    </section>`;

const close = `
    <section aria-label="Make Noxtill fit your business" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="${CARD} border-radius: 18px; padding: 30px 32px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; background: linear-gradient(120deg, #E7F6EC, #fff 70%);">
        <div style="flex: 1 1 380px;">
          <h2 data-h2="1" style="margin: 0; font-size: 27px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em; color: #10201A;">Make Noxtill fit your business, not the other way round.</h2>
          ${trial("#3C4A43", "#16A85F")}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 14px;">${btn("Configure Your Business")}${btnGhost("Book a Demo")}</div>
      </div>
    </section>`;

module.exports = {
  slug: "platform--settings",
  html: doc(
    { route: "/platform/settings", title: "Settings — Set It Up Once, Run It Your Way | Noxtill", desc: "One settings hub for currency, tax, roles, refund and discount limits, message wording, security and billing. Change a rule once and every Noxtill module follows it.", css },
    hero + hub + flowmap + matrix + tools + close,
  ),
};
