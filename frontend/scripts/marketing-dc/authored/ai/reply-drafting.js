/* eslint-disable @typescript-eslint/no-require-imports */
// /ai/reply-drafting — built around one conversation: the inbox thread with the AI draft in the
// composer and the sources it used. Module: (app)/unified-inbox (ai, replies) + review replies.
const { icon, img, pill, avatar, CARD, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-rhero] { grid-template-columns: minmax(0,1fr) !important; }
    [data-inbox] { grid-template-columns: minmax(0,1fr) !important; }
    [data-inbox-list] { display: none !important; }
    [data-edit] { grid-template-columns: minmax(0,1fr) !important; }
    [data-edit] [data-arrow] { transform: rotate(90deg); margin: 0 auto; }
    [data-reviews] { grid-template-columns: minmax(0,1fr) !important; }
    [data-safe] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
  }
  @media (max-width: 720px) {
    [data-safe] { grid-template-columns: minmax(0,1fr) !important; }
    [data-herocard] { position: static !important; width: auto !important; margin-top: 12px; }
  }`;

const hero = `
    <section aria-label="Replies drafted for you, sent by you" data-pad="1" style="background: linear-gradient(180deg, #EAF6EF, #F5F7F3 80%); padding: 34px 28px 6px;">
      <div data-rhero="1" style="max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 46px; align-items: center;">
        <div>
          ${eyebrow("AI Reply Drafting")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.035em; color: #10201A;">Replies drafted for you.<br><span style="color: #0B6B3F;">Sent by you.</span></h1>
          <p style="margin: 18px 0 0; max-width: 520px; font-size: 16px; line-height: 1.7; color: #4A574F;">When a customer writes, Noxtill prepares a reply from their history, your prices and your policies. You read it, change what you like and press send. Nothing goes out without a person.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">
            <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #0B5535; color: #fff; font-size: 15px; font-weight: 600; padding: 14px 26px; border-radius: 9px;" style-hover="background: #084027; color: #fff;">Try Reply Drafting <span aria-hidden="true">→</span></a>
            <a href="/book-a-demo" style="display: inline-flex; align-items: center; background: #fff; border: 1px solid rgba(16,32,26,.14); color: #10201A; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 9px;" style-hover="border-color: #0B6B3F; color: #0B6B3F;">Book a Demo</a>
          </div>
          <p style="margin: 24px 0 0; display: flex; flex-wrap: wrap; gap: 8px;">${["WhatsApp", "SMS", "Email", "Instagram", "Messenger", "Reviews"].map((c) => `<span style="padding: 6px 12px; border-radius: 999px; background: #fff; border: 1px solid rgba(16,32,26,.1); font-size: 12.5px; font-weight: 600; color: #3C4A43;">${c}</span>`).join("")}</p>
        </div>
        <div style="position: relative; padding: 0 0 30px 30px;">
          ${img("np/pasted-1790461879826-0-muiyrwap-lzqy.png", "A smiling business owner talking to a customer on the phone", "width: 100%; aspect-ratio: 1 / 0.86; object-fit: cover; object-position: center 20%; border-radius: 18px;")}
          <div data-herocard="1" style="position: absolute; left: 0; bottom: 0; width: 300px; ${CARD} box-shadow: 0 20px 44px rgba(8,30,20,.18); padding: 13px 15px;">
            <p style="margin: 0; display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #0B6B3F;">${icon("sparkles", 13, "#16A85F")}DRAFT READY</p>
            <p style="margin: 7px 0 10px; font-size: 13.5px; line-height: 1.5; color: #1D2B24;">“Hi Emily! Saturday works. I can offer 11:00 or 2:30 with Sara. Which suits you?”</p>
            <p style="margin: 0; display: flex; gap: 8px;"><span style="padding: 6px 12px; border-radius: 7px; border: 1px solid rgba(16,32,26,.14); font-size: 12px; font-weight: 600; color: #3C4A43;">Edit</span><span style="padding: 6px 14px; border-radius: 7px; background: #0B5535; color: #fff; font-size: 12px; font-weight: 600;">Send</span></p>
          </div>
        </div>
      </div>
    </section>`;

// The inbox: conversation list · thread · draft composer with sources.
const convo = (initials, name, text, ch, time, on, bg) => `
            <li style="display: flex; gap: 10px; padding: 11px 12px; border-radius: 11px; ${on ? "background: #E7F6EC;" : ""}">${avatar(initials, bg, 34)}<span style="flex: 1; min-width: 0;"><span style="display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; color: #10201A;">${name}<span style="font-size: 11px; font-weight: 500; color: #8A968F;">${time}</span></span><span style="display: block; font-size: 12px; color: #56635C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${text}</span><span style="display: inline-block; margin-top: 4px; font-size: 10.5px; font-weight: 600; color: #0B6B3F;">${ch}</span></span></li>`;
const bubble = (text, mine, time) => `<p style="margin: 0; align-self: ${mine ? "flex-end" : "flex-start"}; max-width: 78%; padding: 10px 13px; border-radius: ${mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px"}; background: ${mine ? "#DDF3E4" : "#fff"}; border: 1px solid rgba(16,32,26,.07); font-size: 13.5px; line-height: 1.5; color: #1D2B24;">${text}<span style="display: block; margin-top: 3px; font-size: 10.5px; color: #8A968F; text-align: right;">${time}</span></p>`;
const source = (ic, label, value) => `<span style="display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 8px; background: #fff; border: 1px solid rgba(16,32,26,.1); font-size: 11.5px; color: #3C4A43;">${icon(ic, 13, "#0B6B3F")}<b style="color: #10201A;">${label}</b> ${value}</span>`;
const inbox = `
    <section aria-label="A draft, in the conversation" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 0;">
      <div style="max-width: 700px; margin-bottom: 18px;">${eyebrow("In your Unified Inbox")}<h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">The draft is waiting when you open the message.</h2></div>
      <div data-inbox="1" role="img" aria-label="Unified Inbox conversation with a customer asking to move a booking, and an AI draft reply showing the calendar, customer history and policy it used (example data)" style="${CARD} border-radius: 16px; overflow: hidden; display: grid; grid-template-columns: 290px minmax(0,1fr); box-shadow: 0 26px 54px -32px rgba(8,30,20,.26);">
        <ul data-inbox-list="1" style="margin: 0; padding: 12px; list-style: none; display: grid; gap: 4px; align-content: start; border-right: 1px solid rgba(16,32,26,.07); background: #FAFCFB;">
          ${convo("EC", "Emily Carter", "Can I move my Friday booking?", "WhatsApp", "9:14", true, "#0B6B3F")}${convo("BR", "Bilal R.", "Do you have this in stock?", "Instagram", "9:02", false, "#1D5FA8")}${convo("HS", "Hina S.", "Where is my order?", "SMS", "8:47", false, "#8A5A00")}${convo("ZM", "Zara M.", "How much is a colour treatment?", "Messenger", "8:30", false, "#7A4BB5")}${convo("OT", "Omar T.", "Thanks, see you Saturday!", "WhatsApp", "Yesterday", false, "#56635C")}
        </ul>
        <div style="display: flex; flex-direction: column; min-width: 0;">
          <p style="margin: 0; display: flex; align-items: center; gap: 10px; padding: 13px 18px; border-bottom: 1px solid rgba(16,32,26,.07); font-size: 14px; font-weight: 700; color: #10201A;">${avatar("EC", "#0B6B3F", 30)}Emily Carter <span style="font-size: 12px; font-weight: 500; color: #6B776F;">· 14 visits · loyalty member</span></p>
          <div style="display: flex; flex-direction: column; gap: 10px; padding: 18px; background: #F3F7F4;">
            ${bubble("Hi! Something came up on Friday. Can I move my appointment to the weekend?", false, "9:14 AM")}
          </div>
          <div style="padding: 16px 18px 18px; border-top: 1px solid rgba(16,32,26,.07);">
            <p style="margin: 0 0 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #0B6B3F;"><span style="display: inline-flex; align-items: center; gap: 7px;">${icon("sparkles", 14, "#16A85F")}SUGGESTED REPLY</span>${pill("Waiting for you", "warn")}</p>
            <div style="border: 1.5px solid #9CC9B1; border-radius: 12px; padding: 13px 15px; background: #F7FCF9; font-size: 14.5px; line-height: 1.6; color: #10201A;">Hi Emily! No problem at all. Your colour appointment with Sara can move to <b>Saturday at 11:00 AM</b> or <b>2:30 PM</b>. Which would you prefer? There is no change fee, as it is more than 24 hours ahead.</div>
            <p style="margin: 10px 0 0; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; color: #56635C;">BASED ON</p>
            <p style="margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 7px;">${source("calendar", "Calendar", "Sara free Sat 11:00, 2:30")}${source("user", "Customer", "Colour · Fri 3:00 PM")}${source("book", "Policy", "Free changes 24 h ahead")}</p>
            <p style="margin: 14px 0 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 9px;"><span style="padding: 9px 15px; border-radius: 8px; border: 1px solid rgba(16,32,26,.14); font-size: 13px; font-weight: 600; color: #3C4A43;">Discard</span><span style="padding: 9px 15px; border-radius: 8px; border: 1px solid rgba(16,32,26,.14); font-size: 13px; font-weight: 600; color: #3C4A43;">Edit</span><span style="padding: 9px 20px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 13px; font-weight: 600;">Send reply →</span></p>
          </div>
        </div>
      </div>
      ${demoNote()}
    </section>`;

// Your edit stays yours: draft → your version.
const edit = `
    <section aria-label="A head start, not an autopilot" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div style="background: #0B3B2A; color: #fff; border-radius: 18px; padding: 30px 32px;">
        ${eyebrow("A head start, not an autopilot", "#9FE3BF")}
        <h2 data-h2="1" style="margin: 0 0 20px; max-width: 640px; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.025em;">Keep it, shorten it or rewrite it. It is still your reply.</h2>
        <div data-edit="1" style="display: grid; grid-template-columns: minmax(0,1fr) 48px minmax(0,1fr); gap: 16px; align-items: center;">
          <div style="background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 16px 18px;">
            <p style="margin: 0 0 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; color: #9FE3BF;">THE DRAFT</p>
            <p style="margin: 0; font-size: 14.5px; line-height: 1.6; color: #E6F2EC;">Hello Zara, thank you for your message. A colour treatment starts from $85 and includes a patch test 48 hours before. Would you like me to book one for you?</p>
          </div>
          <svg data-arrow="1" viewBox="0 0 48 24" aria-hidden="true" style="width: 48px; height: 24px;"><path d="M2 12h36" stroke="#9FE3BF" stroke-width="2" fill="none"></path><path d="m36 5 9 7-9 7Z" fill="#9FE3BF"></path></svg>
          <div style="background: #fff; color: #10201A; border-radius: 14px; padding: 16px 18px;">
            <p style="margin: 0 0 8px; display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; color: #0B6B3F;">WHAT YOU SENT ${pill("Edited", "info", "letter-spacing: 0;")}</p>
            <p style="margin: 0; font-size: 14.5px; line-height: 1.6;">Hi Zara! Colour starts from $85, patch test included. <span style="background: #DDF3E4; border-radius: 3px; padding: 0 2px;">I have Thursday at 4 free if you fancy it 😊</span></p>
          </div>
        </div>
      </div>
    </section>`;

// Review replies with the existing review-response image.
const reviews = `
    <section aria-label="Replies to reviews" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-reviews="1" style="${CARD} border-radius: 18px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); align-items: stretch;">
        ${img("np/review-response-generator-for-small-busi-muloc3ew-foui.png", "A customer review on a tablet with an AI-generated response beneath it", "width: 100%; height: 100%; min-height: 300px; object-fit: cover; object-position: 60% center;")}
        <div style="padding: 30px 32px;">
          ${eyebrow("Reviews too")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.03em; color: #10201A;">A thoughtful answer for every review.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">Public reviews get a drafted response as well: a thank-you for the kind ones, a calm and specific reply for the difficult ones. You approve each before it is posted.</p>
          <p style="margin: 18px 0 0; font-size: 14px;"><a href="/platform/reviews-reputation" style="font-weight: 600;">See Reviews &amp; Reputation →</a></p>
        </div>
      </div>
    </section>`;

const safe = `
    <section aria-label="How it stays safe" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <h2 data-h2="1" style="margin: 0 0 16px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Built so a mistake is caught before it is sent</h2>
      <div data-safe="1" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px;">
        ${[["user-check", "A person always sends", "Drafts never go out on their own."], ["eye", "It shows its sources", "See the booking, order or policy it used."], ["lock", "Only your own data", "It reads your business records, nobody else's."], ["archive", "Saved to the conversation", "The reply and who sent it stay on the record."]]
          .map(([ic, t, d]) => `<div style="${CARD} padding: 18px;"><span aria-hidden="true" style="display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: #E7F6EC;">${icon(ic, 19, "#0B6B3F")}</span><p style="margin: 12px 0 0; font-size: 15px; font-weight: 700; color: #10201A;">${t}</p><p style="margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: #56635C;">${d}</p></div>`)
          .join("")}
      </div>
      <p style="margin: 16px 0 0; font-size: 13.5px; color: #56635C;">AI output can be incomplete or wrong, which is why every draft is reviewed. Read more in <a href="/legal/ai-transparency" style="font-weight: 600;">AI Transparency</a>. Works with <a href="/platform/unified-inbox" style="font-weight: 600;">Unified Inbox</a> and the <a href="/ai/assistant" style="font-weight: 600;">AI Assistant</a>.</p>
    </section>`;

const close = `
    <section aria-label="Answer customers in minutes" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="border-radius: 18px; background: #0B4A2C; color: #fff; padding: 36px 38px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 22px;">
        <div style="flex: 1 1 420px;"><h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em;">Answer customers in minutes, in your own voice.</h2>${trial()}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 14px;">
          <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #fff; color: #0B4A2C; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: #E7F6EC; color: #0B4A2C;">Try Reply Drafting <span aria-hidden="true">→</span></a>
          <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
        </div>
      </div>
    </section>`;

module.exports = {
  slug: "ai--reply-drafting",
  html: doc(
    { route: "/ai/reply-drafting", title: "AI Reply Drafting — Replies Drafted for You, Sent by You | Noxtill", desc: "Noxtill drafts replies to customer messages and reviews from the customer's history, your prices and your policies. You review, edit and send every one.", css },
    hero + inbox + edit + reviews + safe + close,
  ),
};
