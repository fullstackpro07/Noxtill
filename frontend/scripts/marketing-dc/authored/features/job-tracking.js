/* eslint-disable @typescript-eslint/no-require-imports */
// /features/job-tracking — built around the job's journey: a status rail from Draft to Closed across the
// hero, the event timeline of one job, and the SLA clock that pauses while the customer is the blocker.
// Module: (app)/field-service (WT status transitions, FsEvent history, SLA pause in Awaiting Customer).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/job-tracking";
const css = `
  @media (max-width: 1080px) { [data-jt2] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 900px) { [data-rail] { overflow-x: auto; } [data-rail] ol { min-width: 860px; } }
  @media (max-width: 640px) { [data-sla] { grid-template-columns: minmax(0,1fr) !important; } }`;

const STEPS = ["Draft", "Open", "Approved", "Scheduled", "Assigned", "Dispatched", "En Route", "Arrived", "In Progress", "Completed", "Closed"];
const NOW = 6; // En Route
const rail = `
          <div data-rail="1" role="img" aria-label="Job status rail: Draft, Open, Approved, Scheduled, Assigned, Dispatched, En Route (current), Arrived, In Progress, Completed, Closed (example data)" style="margin-top: 44px; padding: 26px 24px; border-radius: 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(143,224,179,.25);">
            <ol style="margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(${STEPS.length}, minmax(0, 1fr)); position: relative;">
              ${STEPS.map((s, i) => {
                const done = i < NOW, cur = i === NOW;
                return `<li style="position: relative; display: grid; justify-items: center; gap: 10px; text-align: center;">
                <span aria-hidden="true" style="position: absolute; top: 13px; left: ${i === 0 ? "50%" : "0"}; right: ${i === STEPS.length - 1 ? "50%" : "0"}; height: 3px; background: ${i < NOW ? "#2FD39A" : "rgba(255,255,255,.18)"};"></span>
                <span style="position: relative; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: ${cur ? "#F2C46B" : done ? "#2FD39A" : "#173D2E"}; border: 2px solid ${cur ? "#F2C46B" : done ? "#2FD39A" : "rgba(255,255,255,.25)"}; ${cur ? "box-shadow: 0 0 0 6px rgba(242,196,107,.22);" : ""}">${done ? icon("check", 14, "#06372A") : cur ? icon("truck", 14, "#06372A") : ""}</span>
                <span style="font-size: 11.5px; font-weight: ${cur ? 700 : 500}; color: ${cur ? "#F2C46B" : done ? "#fff" : "rgba(255,255,255,.55)"};">${s}</span></li>`;
              }).join("")}
            </ol>
            <p style="margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 12.5px; color: rgba(255,255,255,.7);"><span>Side states:</span>${["Awaiting Approval", "Paused", "Awaiting Parts", "Awaiting Customer", "Cancelled"].map((x) => `<span style="padding: 3px 10px; border-radius: 99px; border: 1px solid rgba(255,255,255,.22);">${x}</span>`).join("")}</p>
          </div>`;

const hero = `
    <section aria-label="Job tracking" data-pad="1" style="background: #0F2A1F; padding: 30px 28px 64px; color: #fff;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("Field Service", "/industries/home-field-services", "Job Tracking", "rgba(255,255,255,.7)")}
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 30px; align-items: flex-end; margin-top: 30px;">
          <div style="max-width: 640px;">
            ${eyebrow("Job Tracking", "#8FE0B3")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Know where every job is,<br><span style="color: #2FD39A;">without calling anyone.</span></h1>
            <p style="margin: 20px 0 0; max-width: 540px; font-size: 16.5px; line-height: 1.7; color: rgba(255,255,255,.78);">Each job moves through one set of statuses, from the request to the closed invoice. Technicians tap the status on their phone; the office, the customer update and the SLA clock follow it.</p>
            ${ctas("Start Free Trial", true)}
          </div>
          <div style="width: 300px; ${CARD} background: #fff; color: #10201A; padding: 16px; box-shadow: 0 30px 60px -20px rgba(0,0,0,.5);">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 14px;">WO-2516</b>${pill("En Route", "warn")}</p>
            <p style="margin: 8px 0 2px; font-size: 13.5px; font-weight: 600;">Fridge not cooling</p>
            <p style="margin: 0; font-size: 12px; color: #6B776F;">Broad Ripple · Luis Herrera</p>
            <p style="margin: 12px 0 0; display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-radius: 9px; background: #E8F3EC; font-size: 12.5px; color: #0B6B3F;">${icon("navigation", 15, "#0B6B3F")}Customer told: on the way, about 12 min (estimated)</p>
          </div>
        </div>
        ${rail}
      </div>
    </section>`;

// Timeline of one job.
const ev = (time, who, what, ic, tone) => `
              <li style="display: grid; grid-template-columns: 64px 30px minmax(0,1fr); gap: 12px; align-items: start; padding: 10px 0;">
                <span style="font-size: 12.5px; font-weight: 600; color: #6B776F; padding-top: 5px;">${time}</span>
                <span style="width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: ${tone};">${icon(ic, 15, "#fff")}</span>
                <span><b style="display: block; font-size: 14px;">${esc(what)}</b><span style="font-size: 12.5px; color: #6B776F;">${esc(who)}</span></span>
              </li>`;
const timeline = sec(
  "Job history",
  "#fff",
  `
        <div data-jt2="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 60px; align-items: start;">
          <div>${h2("One timeline per job", "Every change, who made it and when.", "Status taps, reassignments, parts, photos, notes and approvals are written to the job as they happen. When a customer calls to ask, anyone in the office can answer from the same record.")}
            ${img("np/pasted-1790113507583-0-mud7d2j7-dqoi.png", "Technician on site while the office sees real-time updates", "width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 22px; margin-top: 32px;")}
          </div>
          <div style="${CARD} padding: 22px 24px;" role="img" aria-label="Event timeline of work order WO-2516 from request to arrival (example data)">
            <p style="margin: 0 0 6px; display: flex; justify-content: space-between;"><b style="font-size: 15px;">WO-2516 · Fridge not cooling</b><span style="font-size: 12px; color: #6B776F;">Today</span></p>
            <ol style="margin: 0; padding: 0; list-style: none; border-left: 0;">
              ${ev("7:58", "Booked online by the customer", "Request received", "inbox", "#4B5A52")}
              ${ev("8:03", "Gina Patterson · dispatcher", "Approved and scheduled 9:00–11:00", "calendar-check", "#0B6B3F")}
              ${ev("8:05", "Eligibility: skills match, 12 min away", "Assigned to Luis Herrera", "user-check", "#0B6B3F")}
              ${ev("8:41", "Luis Herrera · phone", "Dispatched", "send", "#0E9F6E")}
              ${ev("8:47", "Customer sent an arrival update", "En Route", "truck", "#B98A1F")}
              ${ev("9:01", "Luis Herrera · phone", "Arrived · checklist opened", "map-pin", "#16A85F")}
            </ol>
          </div>
        </div>`,
);

// SLA clock.
const slaRow = (label, val, tone) => `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid rgba(16,32,26,.07); font-size: 13.5px;"><span style="color: #4B5A52;">${label}</span><b style="color: ${tone || "#10201A"};">${val}</b></div>`;
const sla = sec(
  "Service levels",
  "#F6F4EE",
  `${h2("Fair service levels", "The clock stops when the wait isn’t yours.", "If a job is waiting on the customer, its SLA clock pauses and restarts when work resumes, so your response times show what your team actually controlled.")}
        <div data-sla="1" style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 40px;">
          <div style="${CARD} padding: 22px;" role="img" aria-label="SLA clock for WO-2490 paused while awaiting the customer (example data)">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 14px;">WO-2490 · Boiler leak</b>${pill("Awaiting Customer", "info")}</p>
            <p style="margin: 18px 0 2px; font-size: 40px; font-weight: 700; letter-spacing: -0.03em;">3h 12m</p>
            <p style="margin: 0 0 12px; display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #1D5FA8;">${icon("clock", 14, "#1D5FA8")}SLA clock paused · target 8h</p>
            ${slaRow("Time on the clock", "3h 12m")}${slaRow("Paused (customer)", "1h 40m", "#1D5FA8")}${slaRow("Remaining", "4h 48m", "#0B6B3F")}
          </div>
          <div style="${CARD} padding: 22px;">${icon("smartphone", 24, "#0B6B3F")}<p style="margin: 14px 0 6px; font-size: 16px; font-weight: 700;">One tap on site</p><p style="margin: 0; font-size: 14px; line-height: 1.65; color: #4B5A52;">Technicians move a job to En Route, Arrived, In Progress or Completed from their phone. Each status only allows the next sensible step.</p></div>
          <div style="${CARD} padding: 22px;">${icon("bell", 24, "#0B6B3F")}<p style="margin: 14px 0 6px; font-size: 16px; font-weight: 700;">Customers kept informed</p><p style="margin: 0; font-size: 14px; line-height: 1.65; color: #4B5A52;">Status changes can send the customer an update, with arrival times always labeled as estimated.</p></div>
        </div>
        `,
);

const body = `${hero}${timeline}${sla}${faq(
  "Job tracking questions.",
  [
    ["Which statuses does a job go through?", "Draft, Open, Approved, Scheduled, Assigned, Dispatched, En Route, Arrived, In Progress, Completed and Closed, with side states for Awaiting Approval, Paused, Awaiting Parts, Awaiting Customer and Cancelled."],
    ["Can a technician skip a step?", "No. Each status only allows the next valid ones, so a job can’t jump from Assigned to Completed without being dispatched and started."],
    ["When does the SLA clock pause?", "While the job is Awaiting Customer. It restarts when the job goes back to In Progress or is rescheduled."],
    ["Do technicians only see their own jobs?", "Staff with technician access see the jobs assigned to them. Managers and owners see every job."],
    ["Is arrival time exact?", "No. Arrival times are estimates and are always labeled that way to the customer."],
  ],
  [["Dispatch Board", "/features/dispatch-board"], ["Work Orders", "/features/work-orders"], ["Inspections & Checklists", "/features/inspections-checklists"]],
)}${closing("Every job, visible from request to invoice.", "Start a 14-day free trial or book a demo to see job tracking with your own team.")}`;

module.exports = {
  slug: "features--job-tracking",
  html: page({ route, title: "Field Service Job Tracking — Every Status, Live | Noxtill", desc: "Track every field job from request to closed invoice: one status flow, a full event timeline, customer updates and an SLA clock that pauses fairly.", css }, body),
};
