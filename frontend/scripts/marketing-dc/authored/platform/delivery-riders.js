/* eslint-disable @typescript-eslint/no-require-imports */
// /platform/delivery-riders — hero over the existing "order journey" illustration; the centrepiece is a
// dispatch board with a route map. Module: (app)/deliveries (dispatch, routes, zones, riders,
// tracking, pod, exceptions, analytics, automations) and the public /track/[token] page.
const { icon, img, pill, avatar, CARD, btn, btnGhost, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-dlhero] { background-position: 68% center !important; }
    [data-dispatch] { grid-template-columns: minmax(0,1fr) !important; }
    [data-track] { grid-template-columns: minmax(0,1fr) !important; }
    [data-track-phone] { max-width: 300px; margin: 0 auto; }
    [data-zonegrid] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
  }
  @media (max-width: 720px) {
    [data-dlhero] { background-image: none !important; padding-top: 30px !important; padding-bottom: 30px !important; }
    [data-dlhero-inner] { max-width: none !important; }
    [data-zonegrid], [data-dlstats] { grid-template-columns: minmax(0,1fr) !important; }
  }`;

const hero = `
    <section aria-label="Every order out, every rider tracked" data-pad="1" data-dlhero="1" style="background: #fff url('/marketing/np/noxtill-is-an-ai-powered-business-manage-mu5zy8g6-6f9s.png') right center / auto 100% no-repeat; padding: 60px 28px 64px; border-bottom: 1px solid rgba(16,32,26,.06);">
      <div style="max-width: 1400px; margin: 0 auto;">
        <div data-dlhero-inner="1" style="max-width: 500px;">
          ${eyebrow("Delivery & Riders")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 46px; line-height: 1.08; letter-spacing: -0.035em; color: #10201A;">Every order out.<br><span style="color: #0B6B3F;">Every rider tracked.</span></h1>
          <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.7; color: #3C4A43;">Run deliveries with your own riders: dispatch from one board, plan routes by zone, follow each drop live and collect proof at the door, all tied to the order in Noxtill.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">${btn("Start Dispatching")}${btnGhost("Book a Demo")}</div>
        </div>
      </div>
    </section>`;

// Dispatch board: queue · map · riders.
const order = (no, name, zone, tone, label, on) => `
            <li style="display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 10px 11px; border-radius: 10px; ${on ? "background: #E7F6EC; border: 1px solid #B9DFC9;" : "border: 1px solid rgba(16,32,26,.08); background: #fff;"}">
              <span style="min-width: 0;"><span style="display: block; font-size: 13px; font-weight: 700; color: #10201A;">${no} · ${name}</span><span style="display: flex; align-items: center; gap: 5px; margin-top: 2px; font-size: 11.5px; color: #6B776F;">${icon("map-pin", 12, "#8A968F")}${zone}</span></span>
              ${pill(label, tone, "font-size: 10.5px;")}
            </li>`;
const rider = (initials, name, drops, load, color, status) => `
            <li style="padding: 10px 0; border-top: 1px solid rgba(16,32,26,.07);">
              <span style="display: flex; align-items: center; gap: 9px;">${avatar(initials, color, 28)}<span style="flex: 1; min-width: 0;"><span style="display: block; font-size: 13px; font-weight: 700; color: #10201A;">${name}</span><span style="display: block; font-size: 11px; color: #6B776F;">${status}</span></span><span style="font-size: 12px; font-weight: 700; color: #10201A;">${drops}</span></span>
              <span aria-hidden="true" style="display: block; margin-top: 7px; height: 5px; border-radius: 5px; background: #EEF3F0;"><span style="display: block; height: 100%; width: ${load}%; border-radius: 5px; background: ${color};"></span></span>
            </li>`;
const pin = (x, y, color, label) => `<g transform="translate(${x} ${y})"><path d="M0 -22c-7.2 0-13 5.6-13 12.6C-13 0 0 12 0 12S13 0 13 -9.4C13 -16.4 7.2 -22 0 -22z" fill="${color}"></path><circle cy="-9.5" r="5" fill="#fff"></circle><text y="-6.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="${color}" font-family="Instrument Sans, sans-serif">${label}</text></g>`;
const map = `
          <svg viewBox="0 0 520 380" role="img" aria-label="Map of delivery routes with rider and drop pins" style="display: block; width: 100%; height: auto; align-self: center; border-radius: 12px; background: #EAF1EC;">
            <path d="M0 250 C90 230 150 300 240 280 S400 220 520 260 V380 H0Z" fill="#CFE5F2"></path>
            <rect x="330" y="30" width="120" height="78" rx="14" fill="#D7ECD9"></rect><rect x="40" y="46" width="96" height="70" rx="14" fill="#D7ECD9"></rect>
            <g stroke="#fff" stroke-width="13" stroke-linecap="round" fill="none"><path d="M-10 150H530"></path><path d="M180 -10V250"></path><path d="M300 -10V230"></path><path d="M420 120V250"></path><path d="M-10 70H180"></path><path d="M60 150V230"></path><path d="M300 60H530"></path><path d="M180 205H420"></path></g>
            <g stroke="#DCE5DF" stroke-width="1.2" fill="none"><path d="M-10 150H530"></path><path d="M180 -10V250"></path><path d="M300 -10V230"></path></g>
            <path d="M92 70H180V150H300V60H410" fill="none" stroke="#0B6B3F" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M92 70H180V205H420V160" fill="none" stroke="#1D5FA8" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 9"></path>
            <g><rect x="62" y="48" width="62" height="24" rx="12" fill="#0B3B2A"></rect><text x="93" y="64" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Instrument Sans, sans-serif">Store</text></g>
            ${pin(300, 110, "#0B6B3F", "1")}${pin(410, 60, "#0B6B3F", "2")}${pin(300, 205, "#1D5FA8", "1")}${pin(420, 160, "#1D5FA8", "2")}
            <g transform="translate(232 150)"><circle r="15" fill="#fff" stroke="#0B6B3F" stroke-width="3"></circle><text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#0B6B3F" font-family="Instrument Sans, sans-serif">AK</text></g>
            <g transform="translate(240 205)"><circle r="15" fill="#fff" stroke="#1D5FA8" stroke-width="3"></circle><text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#1D5FA8" font-family="Instrument Sans, sans-serif">OT</text></g>
            <g transform="translate(14 318)"><rect width="206" height="46" rx="10" fill="#fff" stroke="rgba(16,32,26,.1)"></rect><circle cx="20" cy="16" r="5" fill="#0B6B3F"></circle><text x="32" y="20" font-size="11" fill="#10201A" font-family="Instrument Sans, sans-serif">Route A · Ali K. · 2 drops left</text><circle cx="20" cy="33" r="5" fill="#1D5FA8"></circle><text x="32" y="37" font-size="11" fill="#10201A" font-family="Instrument Sans, sans-serif">Route B · Omar T. · 2 drops left</text></g>
          </svg>`;
const dispatch = `
    <section aria-label="The dispatch board" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 36px 28px 0;">
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
        <div style="max-width: 640px;">${eyebrow("Dispatch")}<h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">Orders on the left. Riders on the right. The road in between.</h2></div>
        <div data-dlstats="1" style="display: grid; grid-template-columns: repeat(3, auto); gap: 8px 22px; font-size: 13px; color: #3C4A43;">
          ${[["63", "delivered today"], ["94%", "on time"], ["27 min", "average"]].map(([v, l]) => `<span><b style="font-size: 20px; color: #10201A; letter-spacing: -0.02em;">${v}</b> ${l}</span>`).join("")}
        </div>
      </div>
      <div data-dispatch="1" style="${CARD} border-radius: 16px; padding: 16px; display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.5fr) minmax(0, 0.8fr); gap: 16px; box-shadow: 0 26px 54px -32px rgba(8,30,20,.26);">
        <div style="min-width: 0;">
          <p style="margin: 0 0 10px; display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; font-weight: 700; color: #10201A;">Ready to go ${pill("5 orders", "mute", "font-size: 10.5px;")}</p>
          <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px;">
            ${order("#1048", "Emily Carter", "Downtown · 1.2 km", "info", "Route A", true)}${order("#1047", "Bilal R.", "Riverside · 2.8 km", "info", "Route B")}${order("#1049", "Hina S.", "Uptown · 3.1 km", "good", "Route A")}${order("#1050", "Zara M.", "Riverside · 2.4 km", "info", "Route B")}${order("#1051", "Star Cafe", "Westside · 4.6 km", "warn", "Needs a rider")}
          </ul>
        </div>
        ${map}
        <div style="min-width: 0;">
          <p style="margin: 0 0 4px; font-size: 13.5px; font-weight: 700; color: #10201A;">Riders on shift</p>
          <ul style="margin: 0; padding: 0; list-style: none;">
            ${rider("AK", "Ali K.", "5 drops", 83, "#0B6B3F", "On Route A · next stop 4 min")}${rider("OT", "Omar T.", "4 drops", 67, "#1D5FA8", "On Route B · next stop 7 min")}${rider("SP", "Sana P.", "3 drops", 50, "#8A5A00", "Returning to store")}${rider("JN", "Jamal N.", "0 drops", 4, "#7A8A82", "Available now")}
          </ul>
          <span style="display: block; margin-top: 8px; text-align: center; border: 1px dashed #9CC9B1; border-radius: 10px; padding: 9px; font-size: 12.5px; font-weight: 600; color: #0B6B3F;">Assign #1051 to Jamal N.</span>
        </div>
      </div>
      ${demoNote()}
    </section>`;

// Live tracking: the existing route-phone photo + the status timeline a customer sees.
const step = (t, d, time, done, last) => `
              <li style="position: relative; display: grid; grid-template-columns: 26px minmax(0,1fr) auto; gap: 12px; padding-bottom: ${last ? 0 : 18}px;">
                ${last ? "" : `<span aria-hidden="true" style="position: absolute; left: 12px; top: 26px; bottom: 0; width: 2px; background: ${done ? "#16A85F" : "#DCE5DF"};"></span>`}
                <span aria-hidden="true" style="position: relative; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: ${done ? "#16A85F" : "#fff"}; border: 2px solid ${done ? "#16A85F" : "#C9D6CF"};">${done ? icon("check", 13, "#fff") : ""}</span>
                <span><span style="display: block; font-size: 14.5px; font-weight: 700; color: ${done ? "#10201A" : "#7A8A82"};">${t}</span><span style="display: block; font-size: 12.5px; color: #6B776F;">${d}</span></span>
                <span style="font-size: 12px; font-weight: 600; color: #6B776F; white-space: nowrap;">${time}</span>
              </li>`;
const tracking = `
    <section aria-label="Live tracking for your customer" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-track="1" style="display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr) minmax(0, 0.9fr); gap: 30px; align-items: center;">
        <div data-track-phone="1">${img("np/pasted-1789018926454-0-mtv3oebo-iw7s.png", "A phone showing a rider's route on a map with a Navigate button", "width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 18px;")}</div>
        <div>
          ${eyebrow("Live tracking")}
          <h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">Customers know when it arrives.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">Each delivery has its own tracking link. Your customer opens it in a browser, no app and no account, and sees the same status your dispatcher sees.</p>
          <ul style="margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 11px; font-size: 14.5px; color: #1D2B24;">
            ${["A tracking link is sent when the rider sets off", "Riders get their stops in order on their phone", "Proof is saved to the order: a photo or a signature", "Problems are logged with a reason, not lost in a call"].map((t) => `<li style="display: flex; gap: 11px;"><span aria-hidden="true" style="flex: none; margin-top: 2px;">${icon("check-circle", 18, "#16A85F")}</span>${t}</li>`).join("")}
          </ul>
        </div>
        <div style="${CARD} border-radius: 16px; padding: 20px 22px;">
          <p style="margin: 0; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #6B776F;">Order #1048 ${pill("On the way", "info")}</p>
          <p style="margin: 6px 0 16px; font-size: 18px; font-weight: 700; color: #10201A;">Arriving about 10:05 AM</p>
          <ol style="margin: 0; padding: 0; list-style: none;">
            ${step("Order placed", "Paid online", "9:12 AM", true)}${step("Packed", "Ready at the store", "9:31 AM", true)}${step("Out for delivery", "Ali K. is on the way", "9:48 AM", true)}${step("Delivered", "Photo or signature at the door", "—", false, true)}
          </ol>
        </div>
      </div>
    </section>`;

// Zones with their fees + what else the module records.
const zones = `
    <section aria-label="Zones, proof and exceptions" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div style="background: #EAF3EE; border-radius: 18px; padding: 28px 30px;">
        <div style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px;">
          <h2 data-h2="1" style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Zones set the fee. You set the zones.</h2>
          <p style="margin: 0; font-size: 14px; color: #56635C;">The delivery fee is added at checkout from the customer's zone.</p>
        </div>
        <div data-zonegrid="1" style="margin-top: 18px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px;">
          ${[["Downtown", "$3.00", "Up to 2 km", "22 min", "#0B6B3F"], ["Riverside", "$4.50", "2 to 4 km", "28 min", "#1D5FA8"], ["Uptown", "$4.50", "2 to 4 km", "30 min", "#8A5A00"], ["Westside", "$6.00", "4 to 7 km", "38 min", "#7A4BB5"]]
            .map(([z, fee, dist, eta, c]) => `<div style="${CARD} padding: 16px 18px; border-top: 4px solid ${c};"><p style="margin: 0; font-size: 15px; font-weight: 700; color: #10201A;">${z}</p><p style="margin: 6px 0 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">${fee}</p><p style="margin: 6px 0 0; display: flex; justify-content: space-between; font-size: 12px; color: #6B776F;"><span>${dist}</span><span>about ${eta}</span></p></div>`)
            .join("")}
        </div>
        <div style="margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 14px;">
          ${[["camera", "Proof of delivery", "A photo or signature is captured at the door and stored on the order."], ["alert", "Exceptions", "Not home, wrong address, late: each one is recorded with its reason."], ["bar-chart", "Delivery analytics", "On-time rate, average time and drops per rider, by day and zone."]]
            .map(([ic, t, d]) => `<div style="display: flex; gap: 12px; align-items: flex-start;"><span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: #fff;">${icon(ic, 18, "#0B6B3F")}</span><div><p style="margin: 0; font-size: 14.5px; font-weight: 700; color: #10201A;">${t}</p><p style="margin: 3px 0 0; font-size: 13px; line-height: 1.5; color: #56635C;">${d}</p></div></div>`)
            .join("")}
        </div>
      </div>
      <p style="margin: 16px 0 0; font-size: 13.5px; color: #56635C;">Works with <a href="/platform/orders" style="font-weight: 600;">Orders</a>, <a href="/platform/fast-sale" style="font-weight: 600;">Fast Sale</a>, <a href="/platform/website-commerce" style="font-weight: 600;">Website &amp; Commerce</a> and <a href="/platform/staff" style="font-weight: 600;">Staff</a>.</p>
    </section>`;

const close = `
    <section aria-label="Deliver with your own riders" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="position: relative; overflow: hidden; border-radius: 18px; background: #0B4A2C; color: #fff; padding: 36px 38px;">
        <svg aria-hidden="true" viewBox="0 0 600 200" preserveAspectRatio="none" style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: .22;"><path d="M-20 160 C120 150 160 60 300 70 S470 150 620 40" fill="none" stroke="#9FE3BF" stroke-width="3" stroke-dasharray="3 12" stroke-linecap="round"></path></svg>
        <div style="position: relative; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 22px;">
          <div style="flex: 1 1 420px;">
            <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em;">Keep every order visible, from your counter to their door.</h2>
            ${trial()}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 14px;">
            <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #fff; color: #0B4A2C; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: #E7F6EC; color: #0B4A2C;">Start Dispatching <span aria-hidden="true">→</span></a>
            <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
          </div>
        </div>
      </div>
    </section>`;

module.exports = {
  slug: "platform--delivery-riders",
  html: doc(
    { route: "/platform/delivery-riders", title: "Delivery & Riders — Every Order Out, Every Rider Tracked | Noxtill", desc: "Dispatch orders to your own riders, plan routes by zone, share a live tracking link and capture proof of delivery, all connected to the order and customer in Noxtill.", css },
    hero + dispatch + tracking + zones + close,
  ),
};
