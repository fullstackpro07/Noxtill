/* eslint-disable @typescript-eslint/no-require-imports */
// /platform/projects-tasks — built around the two views people live in: a kanban board and a timeline.
// Module: (app)/projects (board, tasks, timeline, calendar, milestones, time, files, approvals,
// templates, client-portal, reports).
const { icon, img, pill, avatar, CARD, btn, btnGhost, eyebrow, demoNote, doc, trial } = require("../kit");

const css = `
  @media (max-width: 1180px) {
    [data-phero] { grid-template-columns: minmax(0,1fr) !important; }
    [data-board] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    [data-ganttwrap] { overflow-x: auto !important; }
    [data-portal] { grid-template-columns: minmax(0,1fr) !important; }
    [data-extras] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
  }
  @media (max-width: 720px) {
    [data-board], [data-extras] { grid-template-columns: minmax(0,1fr) !important; }
    [data-pstats] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
    [data-photo-cards] { display: none !important; }
  }`;

const hero = `
    <section aria-label="Plan the work, finish on time" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 30px 28px 0;">
      <div data-phero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); gap: 44px; align-items: center;">
        <div>
          ${eyebrow("Projects & Tasks")}
          <h1 data-h1="1" style="margin: 0; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.035em; color: #10201A;">Plan the work.<br><span style="color: #0B6B3F;">Finish on time.</span></h1>
          <p style="margin: 18px 0 0; max-width: 520px; font-size: 16px; line-height: 1.7; color: #4A574F;">Client jobs and internal work in one place. Every task has an owner and a date, every hour is logged against it, and your client can follow along without a single status email.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px;">${btn("Start a Project")}${btnGhost("Book a Demo")}</div>
          <div data-pstats="1" style="margin-top: 30px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 0; border-top: 1px solid rgba(16,32,26,.1);">
            ${[["8", "active projects"], ["146", "tasks done this month"], ["312 h", "tracked"], ["7 of 8", "on schedule"]].map(([v, l], i) => `<div style="padding: 16px 14px 0 ${i ? "14px" : "0"}; ${i ? "border-left: 1px solid rgba(16,32,26,.1);" : ""}"><p style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: #10201A;">${v}</p><p style="margin: 2px 0 0; font-size: 12px; color: #6B776F;">${l}</p></div>`).join("")}
          </div>
          ${demoNote()}
        </div>
        <div style="position: relative; padding: 0 0 26px 26px;">
          ${img("np/pasted-1788895613649-0-mtt29dl6-9ogi.png", "Three colleagues reviewing a plan together in a bright office", "width: 100%; aspect-ratio: 1 / 0.92; object-fit: cover; border-radius: 18px;")}
          <div data-photo-cards="1" style="position: absolute; left: 0; bottom: 0; width: 250px; ${CARD} box-shadow: 0 18px 40px rgba(8,30,20,.16); padding: 13px 14px;">
            <p style="margin: 0; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #6B776F;">Shopfront refit ${pill("On track", "good", "font-size: 10px; padding: 2px 8px;")}</p>
            <p style="margin: 6px 0 8px; font-size: 14px; font-weight: 700; color: #10201A;">Fit-out complete</p>
            <span aria-hidden="true" style="display: block; height: 6px; border-radius: 6px; background: #EEF3F0;"><span style="display: block; height: 100%; width: 72%; border-radius: 6px; background: #16A85F;"></span></span>
            <p style="margin: 8px 0 0; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #6B776F;"><span>72% · due Oct 20</span><span style="display: flex;">${avatar("SM", "#0B6B3F", 22)}<span style="margin-left: -6px; display: flex;">${avatar("OT", "#1D5FA8", 22)}</span></span></p>
          </div>
        </div>
      </div>
    </section>`;

// Kanban board mock.
const task = (title, tag, tone, who, bg, due, extra = "") => `
            <div style="${CARD} border-radius: 11px; padding: 11px 12px; box-shadow: 0 1px 2px rgba(16,32,26,.04);">
              ${pill(tag, tone, "font-size: 10px; padding: 2px 8px;")}
              <p style="margin: 7px 0 9px; font-size: 13px; font-weight: 600; line-height: 1.35; color: #10201A;">${title}</p>
              <p style="margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #6B776F;"><span style="display: inline-flex; align-items: center; gap: 6px;">${icon("calendar", 12, "#8A968F")}${due}</span>${extra}${avatar(who, bg, 22)}</p>
            </div>`;
const column = (name, count, dot, cards) => `
          <div style="background: #EEF2EF; border-radius: 13px; padding: 12px; display: flex; flex-direction: column; gap: 9px;">
            <p style="margin: 0 2px 2px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: #10201A;"><span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 50%; background: ${dot};"></span>${name}<span style="margin-left: auto; font-weight: 600; color: #6B776F;">${count}</span></p>${cards}
          </div>`;
const clip = `<span style="display: inline-flex; align-items: center; gap: 4px;">${icon("file", 12, "#8A968F")}2</span>`;
const board = `
    <section aria-label="The board" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
        <div>${eyebrow("Board")}<h2 data-h2="1" style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.03em; color: #10201A;">See the whole job at a glance.</h2></div>
        <p style="margin: 0; display: flex; flex-wrap: wrap; gap: 6px;">${["Board", "Timeline", "Calendar", "Milestones", "Files"].map((t, i) => `<span style="padding: 7px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 600; ${i ? "background: #fff; border: 1px solid rgba(16,32,26,.1); color: #3C4A43;" : "background: #0B4A2C; color: #fff;"}">${t}</span>`).join("")}</p>
      </div>
      <div role="img" aria-label="Kanban board for the Shopfront refit project with tasks in To do, In progress, In review and Done (example data)" style="${CARD} border-radius: 16px; padding: 16px;">
        <p style="margin: 0 0 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; color: #10201A;">${icon("briefcase", 17, "#0B6B3F")}Shopfront refit <span style="font-weight: 500; color: #6B776F;">· Luma Studio</span></p>
        <div data-board="1" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; align-items: start;">
          ${column("To do", 3, "#9AA7A0", task("Order display shelving", "Purchasing", "info", "BR", "#1D5FA8", "Oct 14") + task("Book electrician for signage", "Trades", "warn", "AK", "#8A5A00", "Oct 15") + task("Print opening-week flyers", "Marketing", "mute", "HS", "#56635C", "Oct 17"))}
          ${column("In progress", 2, "#1D5FA8", task("Paint front counter and walls", "Fit-out", "good", "OT", "#0B6B3F", "Oct 12", clip) + task("Install new POS and card reader", "Setup", "info", "SM", "#1D5FA8", "Oct 13"))}
          ${column("In review", 2, "#E5A83B", task("Signage artwork, version 3", "Design", "warn", "HS", "#8A5A00", "Waiting for client", clip) + task("Floor plan with seating", "Design", "warn", "SM", "#0B6B3F", "Oct 11"))}
          ${column("Done", 4, "#16A85F", task("Site survey and measurements", "Fit-out", "good", "OT", "#0B6B3F", "Oct 2") + task("Budget approved by client", "Approval", "good", "SM", "#0B6B3F", "Oct 4") + task("Remove old fixtures", "Fit-out", "good", "AK", "#56635C", "Oct 7"))}
        </div>
      </div>
      ${demoNote()}
    </section>`;

// Timeline (Gantt) mock: 5 rows over 4 weeks.
const weeks = ["Oct 6", "Oct 13", "Oct 20", "Oct 27"];
const rows = [
  ["Design", "SM", 0, 34, "#16A85F", "Done"],
  ["Purchasing", "BR", 22, 30, "#1D5FA8", "In progress"],
  ["Fit-out", "OT", 30, 44, "#0B6B3F", "In progress"],
  ["Signage & branding", "HS", 52, 26, "#E5A83B", "Waiting for approval"],
  ["Client handover", "SM", 82, 12, "#7A8A82", "Planned"],
];
const gantt = `
    <section aria-label="The timeline" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 26px; align-items: center;">
        <div style="max-width: 400px;">
          ${eyebrow("Timeline")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.03em; color: #10201A;">Know what slips before it slips.</h2>
          <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.7; color: #56635C;">Phases sit on a calendar with their milestones. When one phase is waiting on an approval, you can see exactly what it holds up.</p>
          <ul style="margin: 16px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; font-size: 14px; color: #1D2B24;">
            ${["Milestones with an owner, an outcome and a date", "Reusable templates for jobs you run often", "Hours logged against tasks, billable or not"].map((t) => `<li style="display: flex; gap: 10px;"><span aria-hidden="true" style="flex: none; margin-top: 2px;">${icon("check-circle", 17, "#16A85F")}</span>${t}</li>`).join("")}
          </ul>
        </div>
        <div data-ganttwrap="1" style="${CARD} border-radius: 16px; padding: 18px 20px; grid-column: span 2; min-width: 0;">
          <div role="img" aria-label="Project timeline showing five phases across four weeks, with signage waiting for client approval (example data)" style="min-width: 620px;">
            <div style="display: grid; grid-template-columns: 170px minmax(0,1fr); gap: 12px; font-size: 11.5px; font-weight: 600; color: #6B776F;">
              <span>Phase</span>
              <span style="display: grid; grid-template-columns: repeat(4, 1fr);">${weeks.map((w) => `<span style="padding-left: 8px; border-left: 1px solid rgba(16,32,26,.08);">${w}</span>`).join("")}</span>
            </div>
            ${rows
              .map(
                ([name, who, left, width, color, status]) => `
            <div style="display: grid; grid-template-columns: 170px minmax(0,1fr); gap: 12px; align-items: center; padding: 11px 0; border-top: 1px solid rgba(16,32,26,.06);">
              <span style="display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; color: #10201A;">${avatar(who, color, 24)}${name}</span>
              <span style="position: relative; height: 26px; background: repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), rgba(16,32,26,.06) calc(25% - 1px) 25%);">
                <span style="position: absolute; top: 3px; height: 20px; left: ${left}%; width: ${width}%; border-radius: 6px; background: ${color}; color: #fff; font-size: 10.5px; font-weight: 600; display: flex; align-items: center; padding: 0 8px; white-space: nowrap; overflow: hidden;">${status}</span>
              </span>
            </div>`,
              )
              .join("")}
            <div style="display: grid; grid-template-columns: 170px minmax(0,1fr); gap: 12px; padding-top: 10px; border-top: 1px solid rgba(16,32,26,.06);">
              <span style="font-size: 11.5px; color: #6B776F;">Milestones</span>
              <span style="position: relative; height: 22px;">
                ${[[34, "Design approved"], [74, "Fit-out complete"], [94, "Handover"]].map(([l, t]) => `<span style="position: absolute; left: ${l}%; top: 0; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; color: #0B6B3F; white-space: nowrap;"><span aria-hidden="true" style="width: 9px; height: 9px; transform: rotate(45deg); background: #0B6B3F;"></span>${t}</span>`).join("")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>`;

// Client portal + approvals, with the existing "signing a document" photo.
const portal = `
    <section aria-label="Client portal and approvals" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 38px 28px 0;">
      <div data-portal="1" style="background: #0B3B2A; border-radius: 18px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: stretch;">
        ${img("np/pasted-1788895579970-0-mtt28nlk-15w1.png", "A client signing an approval document", "width: 100%; height: 100%; min-height: 300px; object-fit: cover;")}
        <div style="padding: 32px 34px; color: #fff;">
          ${eyebrow("Client portal", "#9FE3BF")}
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.18; letter-spacing: -0.025em;">Keep clients informed without the emails.</h2>
          <p style="margin: 12px 0 18px; font-size: 14.5px; line-height: 1.65; color: #CFE6DC;">Invite a client to a private portal for their project. They see progress, files and what needs their sign-off, and nothing else.</p>
          <div style="background: #fff; color: #10201A; border-radius: 13px; padding: 14px 16px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; letter-spacing: .1em; color: #0B6B3F;">WAITING FOR YOUR APPROVAL</p>
            ${[["Signage artwork, version 3", "Sent Oct 9 · 2 files", "warn", "Review"], ["Budget change: +$420 for lighting", "Sent Oct 8", "warn", "Review"], ["Floor plan with seating", "Approved Oct 6 by Luma Studio", "good", "Approved"]]
              .map(([t, d, tone, label]) => `<p style="margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid rgba(16,32,26,.07);"><span style="min-width: 0;"><span style="display: block; font-size: 13.5px; font-weight: 600;">${t}</span><span style="display: block; font-size: 11.5px; color: #6B776F;">${d}</span></span>${pill(label, tone)}</p>`)
              .join("")}
          </div>
        </div>
      </div>
    </section>`;

const extras = `
    <section aria-label="Also part of every project" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 30px 28px 0;">
      <div data-extras="1" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px;">
        ${[["timer", "Time tracking", "Start a timer on a task or add hours afterwards."], ["folder", "Files", "Drawings, quotes and photos stay with the project."], ["calendar", "Calendar", "Deadlines and milestones in a month view."], ["file-chart", "Reports", "Hours, progress and what is overdue, per project."]]
          .map(([ic, t, d]) => `<div style="${CARD} padding: 16px 18px; display: flex; gap: 12px; align-items: flex-start;"><span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: #E7F6EC;">${icon(ic, 18, "#0B6B3F")}</span><div><p style="margin: 0; font-size: 14.5px; font-weight: 700; color: #10201A;">${t}</p><p style="margin: 3px 0 0; font-size: 12.5px; line-height: 1.5; color: #56635C;">${d}</p></div></div>`)
          .join("")}
      </div>
      <p style="margin: 18px 0 0; font-size: 13.5px; color: #56635C;">Works with <a href="/platform/field-service" style="font-weight: 600;">Field Service</a>, <a href="/platform/staff" style="font-weight: 600;">Staff</a>, <a href="/platform/documents-esign" style="font-weight: 600;">Documents &amp; eSign</a> and the <a href="/platform/customer-portal" style="font-weight: 600;">Customer Portal</a>.</p>
    </section>`;

const close = `
    <section aria-label="Deliver every project on time" data-pad="1" style="max-width: 1400px; margin: 0 auto; padding: 34px 28px 34px;">
      <div style="border-radius: 18px; padding: 34px 36px; background: #0B4A2C; color: #fff; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 22px;">
        <div style="flex: 1 1 420px;">
          <h2 data-h2="1" style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.2; letter-spacing: -0.025em;">Deliver every project on time, with everyone on the same page.</h2>
          ${trial()}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 14px;">
          <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #fff; color: #0B4A2C; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: #E7F6EC; color: #0B4A2C;">Start a Project <span aria-hidden="true">→</span></a>
          <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 15px 28px; border-radius: 9px;" style-hover="background: rgba(255,255,255,.1); color: #fff;">Book a Demo</a>
        </div>
      </div>
    </section>`;

module.exports = {
  slug: "platform--projects-tasks",
  html: doc(
    { route: "/platform/projects-tasks", title: "Projects & Tasks — Plan the Work, Finish on Time | Noxtill", desc: "Run client projects and internal work with boards, timelines, milestones, time tracking, files and approvals, plus a private portal where clients follow progress and sign off.", css },
    hero + board + gantt + portal + extras + close,
  ),
};
