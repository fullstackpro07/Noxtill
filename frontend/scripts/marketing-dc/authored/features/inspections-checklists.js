/* eslint-disable @typescript-eslint/no-require-imports */
// /features/inspections-checklists — built around the checklist itself: a versioned template on the left,
// the same checklist on a technician's phone on site, and the inspection result it produces.
// Module: (app)/field-service (FsTemplate draft→published→superseded, FsInspection results, offline queue).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/inspections-checklists";
const css = `
  @media (max-width: 1080px) {
    [data-ichero], [data-builder], [data-result] { grid-template-columns: minmax(0,1fr) !important; }
    [data-phone] { margin: 0 auto; }
  }
  @media (max-width: 640px) { [data-rules] { grid-template-columns: minmax(0,1fr) !important; } }`;

const item = (text, type, state, extra = "") => {
  const mark = { ok: ["check-circle", "#16A85F"], fail: ["x-circle", "#A12C1F"], todo: ["clock", "#B7AE9C"] }[state];
  return `
              <li style="display: flex; gap: 10px; align-items: flex-start; padding: 11px 12px; border-radius: 10px; background: ${state === "fail" ? "#FCE8E6" : "#F6F4EE"};">${icon(mark[0], 18, mark[1])}<span style="flex: 1; min-width: 0;"><span style="display: block; font-size: 13px; font-weight: 600; color: #10201A;">${esc(text)}</span><span style="display: block; margin-top: 2px; font-size: 11px; color: #6B776F;">${esc(type)}</span>${extra}</span></li>`;
};

const hero = `
    <section aria-label="Inspections and checklists" data-pad="1" style="background: #E8F3EC; padding: 30px 28px 0; overflow: hidden;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Field Service", "/industries/home-field-services", "Inspections & Checklists")}
        <div data-ichero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); gap: 56px; align-items: end; margin-top: 26px;">
          <div style="padding-bottom: 70px;">
            ${eyebrow("Inspections & Checklists")}
            <h1 data-h1="1" style="margin: 0; font-size: 54px; font-weight: 700; line-height: 1.04; letter-spacing: -0.04em;">Every visit done<br>the same right way.</h1>
            <p style="margin: 20px 0 0; max-width: 500px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Build a checklist once, publish it, and every technician works through the same steps on site, with photos where you ask for proof. Each inspection ends with a clear result your manager can approve.</p>
            ${ctas("Start Free Trial")}
          </div>
          <div style="position: relative; min-height: 470px;">
            ${img("np/features/pexels-33531830-w1600.jpeg", "Electrician checking voltage with a multimeter", "position: absolute; right: 0; top: 0; width: 82%; height: 420px; object-fit: cover; border-radius: 22px 22px 0 0;")}
            <div data-phone="1" role="img" aria-label="A technician's phone showing the boiler service checklist, four of six items answered (example data)" style="position: absolute; left: 0; bottom: 0; width: 270px; background: #10201A; border-radius: 30px 30px 0 0; padding: 12px 12px 0; box-shadow: 0 30px 60px -20px rgba(8,30,20,.45);">
              <div style="background: #fff; border-radius: 22px 22px 0 0; padding: 16px 14px 18px;">
                <p style="margin: 0; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; color: #0B6B3F;">WO-2481 · ARRIVED</p>
                <p style="margin: 4px 0 12px; font-size: 15px; font-weight: 700;">Boiler annual service</p>
                <div style="height: 6px; border-radius: 99px; background: #E4DED2;"><div style="width: 66%; height: 100%; border-radius: 99px; background: #16A85F;"></div></div>
                <p style="margin: 6px 0 12px; font-size: 11px; color: #6B776F;">4 of 6 · 2 required left</p>
                <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 7px;">
                  ${item("Gas pressure within range", "Number · 20 mbar", "ok")}
                  ${item("Flue clear of blockage", "Pass / fail · photo", "ok")}
                  ${item("Pressure relief valve", "Pass / fail", "fail")}
                  ${item("Customer signature", "Signature · required", "todo")}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;

const why = sec(
  "Why it matters",
  "#fff",
  `
        <div data-result="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 60px; align-items: center;">
          <div>${h2("Why it matters", "A paper sheet can’t prove the job was done right.", "Paper checklists get skipped, filled in from memory or lost in the van. When a customer questions a repair, you need to show what was checked, by whom, when, and what it looked like.")}
            <p style="margin: 16px 0 0; max-width: 560px; font-size: 16px; line-height: 1.7; color: #4B5A52;">With Noxtill, the checklist travels with the work order. Answers, readings, photos and the signature are recorded on site and kept with the job.</p>
          </div>
          ${img("np/features/pexels-34054470-w2000.jpeg", "Technician examining an electronic part inside a machinery panel", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
        </div>`,
);

// Template builder: versions + item types.
const ver = (v, status, tone, date) => `<li style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; border: 1px solid ${status === "Published" ? "rgba(22,168,95,.45)" : "rgba(16,32,26,.08)"}; background: ${status === "Published" ? "#E8F3EC" : "#fff"};"><span><b style="font-size: 13.5px;">Version ${v}</b><span style="display: block; font-size: 11.5px; color: #6B776F;">${date}</span></span>${pill(status, tone)}</li>`;
const row = (t, type, req, ev) => `<tr><td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px; font-weight: 600;">${esc(t)}</td><td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 12.5px; color: #4B5A52;">${type}</td><td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07);">${req ? pill("Required", "good") : pill("Optional", "mute")}</td><td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 12.5px; color: #4B5A52;">${ev ? `${icon("camera", 14, "#0B6B3F")} Photo` : "—"}</td></tr>`;
const builder = sec(
  "Checklist templates",
  "#F6F4EE",
  `${h2("Templates", "Write it once. Publish it. Every visit follows it.", "A template is a list of items, each with an answer type, whether it is required and whether it needs photo evidence. Publishing a new version supersedes the old one; jobs already started keep the version they began with.")}
        <div data-builder="1" style="display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 20px; margin-top: 40px;">
          <div style="${CARD} padding: 18px;">
            <p style="margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #6B776F;">BOILER SERVICE · BS-01</p>
            <ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: 8px;">${ver(4, "Draft", "warn", "Edited today")}${ver(3, "Published", "good", "In use since 2 Sep")}${ver(2, "Superseded", "mute", "Used on 148 jobs")}${ver(1, "Superseded", "mute", "Used on 61 jobs")}</ul>
          </div>
          <div style="${CARD} overflow: hidden;" role="img" aria-label="Checklist template items with answer type, required flag and photo evidence (example data)">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #10201A; color: #fff;"><b style="font-size: 14px;">Version 3 · Published</b><span style="font-size: 12px; color: #8FE0B3;">Applies to: Boiler · any site</span></div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead><tr style="text-align: left; font-size: 11px; letter-spacing: .08em; color: #6B776F;"><th style="padding: 10px 12px; font-weight: 700;">ITEM</th><th style="padding: 10px 12px; font-weight: 700;">ANSWER</th><th style="padding: 10px 12px; font-weight: 700;">RULE</th><th style="padding: 10px 12px; font-weight: 700;">EVIDENCE</th></tr></thead>
              <tbody>${row("Gas pressure within range", "Number (mbar)", true, false)}${row("Flue clear of blockage", "Pass / fail", true, true)}${row("Pressure relief valve", "Pass / fail", true, true)}${row("Condensate trap cleaned", "Yes / no", false, true)}${row("Advice given to customer", "Text", false, false)}${row("Customer signature", "Signature", true, false)}</tbody>
            </table>
          </div>
        </div>
        `,
);

// Result card + rules.
const rule = (ic, t, d) => `<div style="${CARD} padding: 20px;">${icon(ic, 22, "#0B6B3F")}<p style="margin: 12px 0 4px; font-size: 15px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`;
const result = sec(
  "Inspection results",
  "#fff",
  `
        <div data-result="1" style="display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 50px; align-items: start;">
          <div style="${CARD} padding: 22px; box-shadow: 0 24px 50px -30px rgba(8,30,20,.3);" role="img" aria-label="Inspection IN-0932 passed with one exception, waiting for manager approval (example data)">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;"><b style="font-size: 16px;">Inspection IN-0932</b>${pill("Passed with exceptions", "warn")}</div>
            <p style="margin: 6px 0 16px; font-size: 12.5px; color: #6B776F;">WO-2481 · Boiler annual service · Template BS-01 v3 · Luis Herrera</p>
            <div style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px;">
              ${[["5", "Passed"], ["1", "Exception"], ["2", "Photos"]].map(([n, l]) => `<div style="padding: 12px; border-radius: 10px; background: #F6F4EE;"><b style="display: block; font-size: 22px;">${n}</b><span style="font-size: 11.5px; color: #6B776F;">${l}</span></div>`).join("")}
            </div>
            <div style="margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #FCE8E6; font-size: 13px; color: #A12C1F;"><b>Pressure relief valve: fail.</b> Valve weeping; replacement quoted to the customer.</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(16,32,26,.08);"><span style="font-size: 12.5px; color: #4B5A52;">Started 9:42 · completed 10:31</span><span style="padding: 8px 14px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 12.5px; font-weight: 600;">Approve result</span></div>
          </div>
          <div>${h2("Results you can stand behind", "Passed, failed, or passed with exceptions.", "When the last item is answered the inspection gets its result, counts its exceptions and waits for a manager to approve it. A failed item prompts for a follow-up job, and the repair can be quoted from the work order.")}
            <div data-rules="1" style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-top: 28px;">
              ${rule("checklist", "Required items first", "You can require every mandatory item before a job can be completed.")}
              ${rule("camera", "Photo evidence", "Items marked for evidence ask for a photo when the template says so.")}
              ${rule("wifi", "Works offline", "Answers, notes and signatures are queued on the device and sync when the signal returns.")}
              ${rule("shield", "Recorded on site", "Answers are taken while the job is Arrived or In Progress, not filled in later from the office.")}
            </div>
          </div>
        </div>`,
);

const body = `${hero}${why}${builder}${result}${faq(
  "Inspection and checklist questions.",
  [
    ["What answer types can a checklist item have?", "Pass/fail, yes/no, a number, free text, a photo or a signature. Each item can be required or optional and can ask for photo evidence."],
    ["What happens to jobs when I publish a new version?", "New jobs use the new version. A job that already started keeps the version it began with, so its record matches what the technician actually saw."],
    ["Can technicians fill in a checklist without signal?", "Yes. Answers, notes, the signature and status taps are queued on the device and sync when it reconnects. The office sees them as saved only after they sync."],
    ["Who approves an inspection result?", "A manager or owner. Technicians record the answers; the result is approved by someone with Field Service manager access."],
    ["Can a failed item turn into more work?", "Yes. A failed item prompts for a comment, a photo and a follow-up work order, and the repair can be quoted straight from the work order."],
  ],
  [["Work Orders", "/features/work-orders"], ["Job Tracking", "/features/job-tracking"], ["Technician Scheduling", "/features/technician-scheduling"]],
)}${closing("Make every visit provable.", "Start a 14-day free trial or book a demo to set up your first checklist.")}`;

module.exports = {
  slug: "features--inspections-checklists",
  html: page({ route, title: "Inspections & Checklists for Field Service | Noxtill", desc: "Versioned checklists with required items and photo evidence, completed on site even offline, and inspection results a manager approves.", css }, body),
};
