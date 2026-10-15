/* eslint-disable @typescript-eslint/no-require-imports */
// /features/review-approve-data — built around the review screen: the original page beside the rows read
// from it, each row with its own destination picker and flags, then duplicates and the approve step.
// Module: (app)/digitizer review (per-row destination, needsReview, duplicate decisions, accept all,
// edit rows, original view, approve → import commit).
const { icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/review-approve-data";
const css = `
  @media (max-width: 1080px) { [data-rvhero], [data-dup] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 760px) { [data-queue] { overflow-x: auto; } [data-queue] table { min-width: 640px; } }`;

const dest = (label, on) => `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px; border: 1px solid ${on ? "rgba(22,168,95,.5)" : "rgba(16,32,26,.15)"}; background: ${on ? "#E8F3EC" : "#fff"}; font-size: 12px; font-weight: 600;">${label} <span aria-hidden="true" style="color: #8A968F;">▾</span></span>`;
const row = (cells, d, flag) => `<tr>${cells.map((c) => `<td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px;">${c}</td>`).join("")}<td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07);">${d}</td><td style="padding: 11px 12px; border-top: 1px solid rgba(16,32,26,.07);">${flag}</td></tr>`;

const hero = `
    <section aria-label="Review and Approve Data" data-pad="1" style="background: #fff; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("AI Photo Digitizer", "/ai/photo-digitizer", "Review & Approve Data")}
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 30px; align-items: flex-end; margin-top: 30px;">
          <div style="max-width: 640px;">
            ${eyebrow("Review & Approve Data")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Nothing goes in<br>until you say so.</h1>
            <p style="margin: 20px 0 0; max-width: 540px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Everything Noxtill reads from a photo waits in review. Compare it with the original, fix what’s wrong, choose where each row goes, then approve. Only then does it reach your records.</p>
          </div>
          ${ctas("Start Free Trial")}
        </div>
        <div data-rvhero="1" style="display: grid; grid-template-columns: minmax(0, 0.55fr) minmax(0, 1.45fr); gap: 18px; margin-top: 44px; padding: 18px; border-radius: 22px; background: #F6F4EE;" role="img" aria-label="Review screen: original page beside five rows, each with a destination, two flagged (example data)">
          <div style="${CARD} padding: 10px;">
            <p style="margin: 2px 4px 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; color: #6B776F;">ORIGINAL</p>
            ${img("np/pasted-1789677447776-0-mu5zqsmq-a7t8.png", "The original handwritten page being reviewed", "width: 100%; height: auto; border-radius: 10px;")}
          </div>
          <div data-queue="1" style="${CARD} overflow: hidden;">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid rgba(16,32,26,.07);"><b style="font-size: 14.5px;">Customer list · Re: 06-24</b><span style="display: flex; gap: 8px;"><span style="padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(16,32,26,.15); font-size: 12.5px; font-weight: 600;">Accept all clear rows</span><span style="padding: 7px 14px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 12.5px; font-weight: 600;">Approve 12 rows</span></span></p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead><tr style="text-align: left; font-size: 11px; letter-spacing: .08em; color: #6B776F;"><th style="padding: 9px 12px;">NAME</th><th style="padding: 9px 12px;">PHONE</th><th style="padding: 9px 12px;">BALANCE</th><th style="padding: 9px 12px;">GOES TO</th><th style="padding: 9px 12px;"></th></tr></thead>
              <tbody>
                ${row(["James Miller", "(415) 555-0136", "$250.00"], dest("Customer + credit", true), pill("Clear", "good"))}
                ${row(["Emily Carter", "(212) 555-0189", "$120.00"], dest("Customer + credit", true), pill("Already a customer", "info"))}
                ${row(["Michael Brown", "(305) 555-0274", "$0.00"], dest("Customer", true), pill("Clear", "good"))}
                ${row(["Sarah Wilson", "(619) 555-0143", `<span style="background: #FFF4DC; padding: 2px 4px; border-radius: 4px;">$430.00 ?</span>`], dest("Customer + credit", true), pill("Check balance", "warn"))}
                ${row(["Jessica Lee", `<span style="background: #FFF4DC; padding: 2px 4px; border-radius: 4px;">(312) 555-0167 ?</span>`, "$320.00"], dest("Customer + credit", true), pill("Check phone", "warn"))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>`;

const D = [["user", "Customer"], ["tag", "Product"], ["receipt", "Expense"], ["truck", "Supplier"], ["ledger", "Credit opening balance"], ["boxes", "Stock"]];
const destinations = sec(
  "Where rows can go",
  "#F6F4EE",
  `${h2("Where rows can go", "Every row, sent to the right place.", "Each kind of page has a sensible default: receipts become expenses, a customer list becomes customers. Mixed pages are sorted row by row. You can change the destination of any single row.")}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 36px;">
          ${D.map(([ic, t]) => `<div style="${CARD} padding: 18px; text-align: center;"><span style="display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: #E8F3EC;">${icon(ic, 22, "#0B6B3F")}</span><b style="display: block; margin-top: 10px; font-size: 14px;">${t}</b></div>`).join("")}
        </div>`,
);

const dupChoice = (t, d, on) => `<div style="padding: 13px 15px; border-radius: 10px; border: ${on ? "2px solid #16A85F" : "1px solid rgba(16,32,26,.12)"}; background: ${on ? "#E8F3EC" : "#fff"};"><b style="display: block; font-size: 14px;">${t}</b><span style="font-size: 12.5px; color: #4B5A52;">${d}</span></div>`;
const dups = sec(
  "Duplicates",
  "#fff",
  `
        <div data-dup="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("Duplicates", "Already in Noxtill? You choose what happens.", "When a row looks like a customer, product or supplier you already have, review shows the match side by side. Use the existing record, create a new one, or skip the row.")}</div>
          <div style="${CARD} padding: 22px; box-shadow: 0 30px 60px -40px rgba(8,30,20,.35);" role="img" aria-label="Duplicate decision for Emily Carter: use the existing customer, create a new one, or skip (example data)">
            <p style="margin: 0 0 14px; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px;">Emily Carter looks familiar</b>${pill("Same phone number", "info")}</p>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-bottom: 14px;">
              <div style="padding: 12px; border-radius: 10px; background: #F6F4EE; font-size: 12.5px;"><b style="display: block; margin-bottom: 4px;">From the page</b>Emily Carter<br>(212) 555-0189<br>Balance $120.00</div>
              <div style="padding: 12px; border-radius: 10px; background: #F6F4EE; font-size: 12.5px;"><b style="display: block; margin-bottom: 4px;">In Noxtill</b>Emily Carter<br>(212) 555-0189<br>Customer since 2025</div>
            </div>
            <div style="display: grid; gap: 8px;">${dupChoice("Use the existing customer", "The $120.00 opening balance goes to her record", true)}${dupChoice("Create a new customer", "Keep both as separate records", false)}${dupChoice("Skip this row", "Leave her record as it is", false)}</div>
          </div>
        </div>`,
);

const body = `${hero}${destinations}${dups}${faq(
  "Review and approval questions.",
  [
    ["Is anything saved before I approve?", "No. Read data waits in review and is saved to your records only when you approve it."],
    ["Can I see the original while reviewing?", "Yes. The original photo or PDF is shown beside the rows read from it."],
    ["Can I change where a row goes?", "Yes. Each kind of page has a default destination, and you can change it for any single row."],
    ["What about records I already have?", "Possible duplicates are shown side by side. Use the existing record, create a new one or skip the row."],
    ["Is there a quick way for clean pages?", "Yes. Accept all clear rows at once and only work through the flagged ones."],
  ],
  [["Data Extraction", "/features/data-extraction"], ["Document Scanning", "/features/document-scanning"], ["Inventory from Photos", "/features/inventory-from-photos"]],
)}${closing("Your records, checked before they’re saved.", "Start a 14-day free trial or book a demo to review your first scan.")}`;

module.exports = {
  slug: "features--review-approve-data",
  html: page({ route, title: "Review & Approve Scanned Data | Noxtill", desc: "Compare scanned data with the original, fix flagged values, choose where each row goes and handle duplicates. Nothing is saved until you approve.", css }, body),
};
