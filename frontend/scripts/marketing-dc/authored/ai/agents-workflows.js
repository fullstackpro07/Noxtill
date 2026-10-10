/* eslint-disable @typescript-eslint/no-require-imports */
// /ai/agents-workflows — a dark "systems" hero on the existing connected-modules artwork, then the
// workflow canvas (trigger → condition → AI step → approval → action), an approval queue and a run log.
// Module: (app)/automations with AI steps, approvals, versions and test runs.
const { icon, img, pill, CARD, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-canvas] { grid-template-columns: minmax(0,1fr) !important; }
    [data-canvas] [data-link] { width: 2px !important; height: 26px !important; margin: 0 auto; background: repeating-linear-gradient(180deg, #9CC9B1 0 6px, transparent 6px 11px) !important; }
    [data-two] { grid-template-columns: minmax(0,1fr) !important; }
    [data-logwrap] { overflow-x: auto !important; }
    [data-agents] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
  }
  @media (max-width: 720px) {
    [data-agents] { grid-template-columns: minmax(0,1fr) !important; }
    [data-ahero] { padding-top: 40px !important; padding-bottom: 40px !important; }
  }`;

const hero = `
    <section aria-label="Multi-step work, done with your approval" data-pad="1" data-ahero="1" style="position: relative; overflow: hidden; background: #06231A; color: #fff; padding: 70px 28px 76px;">
      ${img("np/pasted-1789675708771-0-mu5ypisw-0vop.png", "", "position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .5;")}
      <span aria-hidden="true" style="position: absolute; inset: 0; background: linear-gradient(90deg, rgba(6,35,26,.96) 0%, rgba(6,35,26,.82) 42%, rgba(6,35,26,.25) 100%);"></span>
      <div style="position: relative; max-width: 1400px; margin: 0 auto;">
        <div style="max-width: 600px;">
          ${eyebrow("AI Agents & Workflows", "#9FE3BF")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 50px; line-height: 1.05; letter-spacing: -0.035em;">Multi-step work.<br><span style="color: #9FE3BF;">Done with your approval.</span></h1>
          <p style="margin: 18px 0 0; font-size: 16.5px; line-height: 1.7; color: #D5E8DE;">Chain triggers, conditions and actions into a workflow, then add AI steps that draft, classify or summarise. Anything that matters stops and waits for a person.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">
            <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #9FE3BF; color: #06231A; font-size: 15px; font-weight: 700; padding: 14px 26px; border-radius: 9px;" style-hover="background: #C5F0D8; color: #06231A;">Build a Workflow <span aria-hidden="true">→</span></a>
            <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
          </div>
        </div>
      </div>
    </section>`;

// Workflow canvas: five nodes joined by dashed links.
const node = (kind, ic, title, detail, tone, extra = "") => `
          <div style="${CARD} border-radius: 14px; padding: 14px 15px; ${tone === "ai" ? "border: 1.5px solid #9CC9B1; background: #F7FCF9;" : tone === "gate" ? "border: 1.5px solid #E5B94A; background: #FFFBEF;" : ""}">
            <p style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; color: ${tone === "gate" ? "#8A5A00" : "#0B6B3F"};"><span aria-hidden="true" style="display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: ${tone === "gate" ? "#FFF0C7" : "#E7F6EC"};">${icon(ic, 14, tone === "gate" ? "#8A5A00" : "#0B6B3F")}</span>${kind}</p>
            <p style="margin: 10px 0 4px; font-size: 14.5px; font-weight: 700; line-height: 1.3; color: #10201A;">${title}</p>
            <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #56635C;">${detail}</p>${extra}
          </div>`;
const link = `<span data-link="1" aria-hidden="true" style="align-self: center; width: 100%; height: 2px; background: repeating-linear-gradient(90deg, #9CC9B1 0 6px, transparent 6px 11px);"></span>`;
const canvas = `
    <section aria-label="The workflow canvas" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 36px 28px 0;">
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
        <div style="max-width: 640px;">${eyebrow("One workflow, end to end")}<h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.03em; color: #10201A;">You can read it like a sentence.</h2></div>
        <p style="margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: #3C4A43;">${pill("Overdue invoice follow-up", "dark")}${pill("Version 4 · live", "good")}${pill("126 runs in 30 days", "mute")}</p>
      </div>
      <div role="img" aria-label="Workflow: when an invoice is unpaid for 7 days, and the customer has no open dispute, AI drafts a reminder, the owner approves any late fee, then the reminder is sent and a task is created (example)" style="background: #EEF3EF; border-radius: 18px; padding: 22px; background-image: radial-gradient(rgba(16,32,26,.1) 1px, transparent 1px); background-size: 18px 18px;">
        <div data-canvas="1" style="display: grid; grid-template-columns: minmax(0,1fr) 34px minmax(0,1fr) 34px minmax(0,1fr) 34px minmax(0,1fr) 34px minmax(0,1fr); align-items: stretch;">
          ${node("TRIGGER", "bolt", "Invoice unpaid for 7 days", "Checked every morning from Orders.")}
          ${link}
          ${node("CONDITION", "filter", "No open dispute", "Skips customers with a dispute or a payment plan.")}
          ${link}
          ${node("AI STEP", "brain", "Draft the reminder", "Polite, in your tone, with the amount and a pay link.", "ai", `<p style="margin: 9px 0 0; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid rgba(16,32,26,.08); font-size: 11.5px; line-height: 1.45; color: #3C4A43;">“Hi Bilal, a quick reminder that invoice #1040 for $410 is now due…”</p>`)}
          ${link}
          ${node("APPROVAL", "user-check", "Owner approves a late fee", "Only if a fee is added. Otherwise it continues.", "gate", `<p style="margin: 9px 0 0;">${pill("Waits for a person", "warn")}</p>`)}
          ${link}
          ${node("ACTION", "send", "Send and create a task", "WhatsApp reminder goes out; a follow-up task is set for 3 days.")}
        </div>
      </div>
      ${demoNote()}
    </section>`;

// Approval queue + what AI steps do.
const two = `
    <section aria-label="Approvals and AI steps" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-two="1" style="display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: 20px; align-items: stretch;">
        <div style="${CARD} border-radius: 16px; padding: 24px 26px 12px;">
          ${eyebrow("Approvals")}
          <h2 data-h2="1" style="margin: 0 0 6px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">The important decisions come to you.</h2>
          <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #56635C;">You choose which actions must wait. Each request shows what will happen and why.</p>
          ${[["Add a $15 late fee to invoice #1040", "Overdue invoice follow-up · Bilal R. · 14 days overdue", "coins"], ["Refund $45.00 to Emily Carter", "Refund request triage · reason: service issue", "receipt"], ["Order 24 × Argan Oil Shampoo", "Low-stock reorder · 3 left, sells 4 a day", "boxes"]]
            .map(([t, d, ic]) => `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 13px 0; border-top: 1px solid rgba(16,32,26,.07);"><span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #FFF3D6;">${icon(ic, 17, "#8A5A00")}</span><span style="flex: 1 1 220px; min-width: 0;"><span style="display: block; font-size: 14px; font-weight: 700; color: #10201A;">${t}</span><span style="display: block; font-size: 12px; color: #6B776F;">${d}</span></span><span style="display: flex; gap: 7px;"><span style="padding: 7px 12px; border-radius: 7px; border: 1px solid rgba(16,32,26,.14); font-size: 12px; font-weight: 600; color: #3C4A43;">Decline</span><span style="padding: 7px 14px; border-radius: 7px; background: #0B5535; color: #fff; font-size: 12px; font-weight: 600;">Approve</span></span></div>`)
            .join("")}
        </div>
        <div style="background: #0B3B2A; color: #fff; border-radius: 16px; padding: 24px 26px;">
          ${eyebrow("AI steps", "#9FE3BF")}
          <h2 data-h2="1" style="margin: 0 0 14px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Small, well-defined jobs. Not free rein.</h2>
          ${[["pen-tool", "Draft", "a message or reply, for review"], ["filter", "Classify", "a request, with the reason shown"], ["file", "Summarise", "a record, with its sources"], ["calculator", "Suggest", "a quantity or amount, for approval"]]
            .map(([ic, t, d]) => `<p style="margin: 0; display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.12); font-size: 14px; color: #D5E8DE;"><span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,.1);">${icon(ic, 16, "#9FE3BF")}</span><span><b style="color: #fff;">${t}</b> ${d}</span></p>`)
            .join("")}
        </div>
      </div>
    </section>`;

// Run log + versions/testing, with the existing automation screenshot.
const runs = [
  ["9:02 AM", "Overdue invoice follow-up", "Bilal R. · #1040", ["Waiting for approval", "warn"]],
  ["8:40 AM", "Low-stock reorder", "Argan Oil Shampoo", ["Waiting for approval", "warn"]],
  ["8:31 AM", "Review request", "Emily Carter · visit Thu", ["Completed", "good"]],
  ["8:05 AM", "No-show recovery", "Omar T. · rebook offer sent", ["Completed", "good"]],
  ["7:58 AM", "Review request", "Hina S. · no phone on file", ["Skipped by condition", "mute"]],
];
const log = `
    <section aria-label="Run history, versions and testing" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-two="1" style="display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: 20px; align-items: stretch;">
        <div data-logwrap="1" style="${CARD} border-radius: 16px; padding: 22px 24px 12px; min-width: 0;">
          <p style="margin: 0 0 4px; display: flex; align-items: center; justify-content: space-between; font-size: 17px; font-weight: 700; color: #10201A;">Every run is on the record <span style="font-size: 12px; font-weight: 600; color: #6B776F;">Today</span></p>
          <table style="width: 100%; min-width: 520px; border-collapse: collapse; font-size: 13px;">
            <tbody>${runs.map((r, i) => `<tr><td style="padding: 11px 8px 11px 0; white-space: nowrap; color: #6B776F; ${i ? "border-top: 1px solid rgba(16,32,26,.06);" : ""}">${r[0]}</td><td style="padding: 11px 8px; font-weight: 600; color: #10201A; ${i ? "border-top: 1px solid rgba(16,32,26,.06);" : ""}">${r[1]}</td><td style="padding: 11px 8px; color: #3C4A43; ${i ? "border-top: 1px solid rgba(16,32,26,.06);" : ""}">${r[2]}</td><td style="padding: 11px 0 11px 8px; text-align: right; ${i ? "border-top: 1px solid rgba(16,32,26,.06);" : ""}">${pill(r[3][0], r[3][1])}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div style="${CARD} border-radius: 16px; overflow: hidden; display: flex; flex-direction: column;">
          ${img("hb/slots/outcome-screen-auto.webp", "The Noxtill automation screen with workflow cards", "width: 100%; aspect-ratio: 16 / 9; object-fit: cover; object-position: top;")}
          <div style="padding: 20px 22px;">
            ${eyebrow("Versions & testing")}
            <h2 data-h2="1" style="margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">Change a workflow without breaking it.</h2>
            <p style="margin: 10px 0 0; font-size: 13.5px; line-height: 1.6; color: #56635C;">Edit a draft version, run it on test data, and publish when it behaves. Earlier versions stay available to restore.</p>
          </div>
        </div>
      </div>
    </section>`;

const agents = `
    <section aria-label="Ready-made starting points" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <h2 data-h2="1" style="margin: 0 0 16px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #10201A;">Start from a workflow that already works</h2>
      <div data-agents="1" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px;">
        ${[["invoice", "Overdue invoice follow-up", "Reminds politely; a late fee needs your approval."], ["calendar-x", "No-show recovery", "Offers a new slot when a booking is missed."], ["star", "Review request", "Asks at the right time after a visit."], ["alert-stock", "Low-stock reorder", "Suggests a quantity and waits for your OK."]]
          .map(([ic, t, d]) => `<div style="${CARD} padding: 18px;"><span aria-hidden="true" style="display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: #E7F6EC;">${icon(ic, 19, "#0B6B3F")}</span><p style="margin: 12px 0 0; font-size: 15px; font-weight: 700; color: #10201A;">${t}</p><p style="margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: #56635C;">${d}</p></div>`)
          .join("")}
      </div>
      <p style="margin: 16px 0 0; font-size: 13.5px; color: #56635C;">Works with <a href="/platform/automations-workflows" style="font-weight: 600;">Automations &amp; Workflows</a>, the <a href="/ai/assistant" style="font-weight: 600;">AI Assistant</a> and <a href="/ai/reply-drafting" style="font-weight: 600;">AI Reply Drafting</a>. How Noxtill uses AI: <a href="/legal/ai-transparency" style="font-weight: 600;">AI Transparency</a>.</p>
    </section>`;

const close = `
    <section aria-label="Hand over the routine" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="border-radius: 18px; background: #06231A; color: #fff; padding: 38px 38px; text-align: center;">
        <h2 data-h2="1" style="margin: 0 auto; max-width: 720px; font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em;">Hand the routine to Noxtill. Keep the decisions for yourself.</h2>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 22px;">
          <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #9FE3BF; color: #06231A; font-size: 15px; font-weight: 700; padding: 15px 28px; border-radius: 9px;" style-hover="background: #C5F0D8; color: #06231A;">Build a Workflow <span aria-hidden="true">→</span></a>
          <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
        </div>
        <div style="display: flex; justify-content: center;">${trial()}</div>
      </div>
    </section>`;

module.exports = {
  slug: "ai--agents-workflows",
  html: doc(
    { route: "/ai/agents-workflows", title: "AI Agents & Workflows — Multi-Step Work, Done With Your Approval | Noxtill", desc: "Build workflows from triggers, conditions and actions, add AI steps that draft, classify and summarise, and require a person's approval before anything consequential runs.", css },
    hero + canvas + two + log + agents + close,
  ),
};
