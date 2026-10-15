/* eslint-disable @typescript-eslint/no-require-imports */
// /features/data-extraction — built around the read itself: the handwritten page on one side, the
// structured table it becomes on the other, with every cell carrying its own confidence; then the
// field kinds it recognises (money, phone, email, SKU, quantities).
// Module: (app)/digitizer (per-field confidence, needsReview, field kinds, reprocess, original view).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/data-extraction";
const css = `
  [data-kinds] { min-width: 0 !important; }
  @media (max-width: 1080px) { [data-dex] { grid-template-columns: minmax(0,1fr) !important; } [data-dex] [data-arrow] { right: 50% !important; top: auto !important; bottom: -36px; transform: translateX(50%) rotate(90deg) !important; } }
  @media (max-width: 760px) { [data-xt] { overflow-x: auto; } [data-xt] table { min-width: 520px; } [data-kinds] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }`;

const cell = (v, conf) => {
  const c = conf === "low" ? ["#FFF4DC", "#8A5A00"] : ["transparent", "#10201A"];
  return `<td style="padding: 10px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px; background: ${c[0]}; color: ${c[1]};">${esc(v)}${conf === "low" ? ` <span title="Check this" style="font-size: 11px; font-weight: 700;">?</span>` : ""}</td>`;
};
const r = (n, name, phone, bal, low = {}) => `<tr><td style="padding: 10px; border-top: 1px solid rgba(16,32,26,.07); font-size: 12px; color: #8A968F;">${n}</td>${cell(name, low.name)}${cell(phone, low.phone)}${cell(bal, low.bal)}</tr>`;

const hero = `
    <section aria-label="Data Extraction" data-pad="1" style="background: #fff; padding: 30px 28px 80px;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("AI Photo Digitizer", "/ai/photo-digitizer", "Data Extraction")}
        <div style="max-width: 720px; margin-top: 30px;">
          ${eyebrow("Data Extraction")}
          <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">From ink to rows<br>you can work with.</h1>
          <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Noxtill reads each line of the page into proper fields: names, phone numbers, amounts, quantities and dates. Anything it isn’t sure about is highlighted, so you only check what needs checking.</p>
          ${ctas("Start Free Trial")}
        </div>
        <div data-dex="1" style="display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 28px; align-items: center; margin-top: 46px;">
          <div style="position: relative;">
            ${img("np/pasted-1789677447776-0-mu5zqsmq-a7t8.png", "A handwritten customer list in a notebook: names, phone numbers and balances", "width: 100%; height: auto; border-radius: 20px;")}
            <span aria-hidden="true" style="position: absolute; left: 13%; right: 16%; top: 30.5%; height: 6%; border: 2px solid #16A85F; border-radius: 8px; background: rgba(22,168,95,.08);"></span>
            <span data-arrow="1" aria-hidden="true" style="position: absolute; right: -36px; top: 50%; transform: translateY(-50%); z-index: 2; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #0F2A1F; box-shadow: 0 0 0 4px #fff;">${icon("sparkles", 19, "#2FD39A")}</span>
          </div>
          <div data-xt="1" style="${CARD} overflow: hidden; box-shadow: 0 30px 60px -36px rgba(8,30,20,.35);" role="img" aria-label="Extracted customer table with two cells flagged for checking">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px; background: #0F2A1F; color: #fff; white-space: nowrap;"><b style="font-size: 13.5px;">Customer list · 12 rows</b>${pill("2 to check", "warn")}</p>
            <table style="width: 100%; border-collapse: collapse; white-space: nowrap;">
              <thead><tr style="text-align: left; font-size: 10.5px; letter-spacing: .08em; color: #6B776F;"><th style="padding: 9px 10px;">#</th><th style="padding: 9px 10px;">NAME</th><th style="padding: 9px 10px;">PHONE</th><th style="padding: 9px 10px;">BALANCE</th></tr></thead>
              <tbody>${r(1, "James Miller", "(415) 555-0136", "$250.00")}${r(2, "Emily Carter", "(212) 555-0189", "$120.00")}${r(3, "Sarah Wilson", "(619) 555-0143", "$430.00", { bal: "low" })}${r(4, "Jessica Lee", "(312) 555-0167", "$320.00", { phone: "low" })}</tbody>
            </table>
            <p style="margin: 0; padding: 10px 14px; font-size: 12px; color: #6B776F; border-top: 1px solid rgba(16,32,26,.07);">+ 8 more rows · original page kept alongside</p>
          </div>
        </div>
      </div>
    </section>`;

const K = [["at-sign", "Email"], ["phone", "Phone"], ["dollar", "Amounts"], ["barcode", "SKU codes"], ["calculator", "Quantities"], ["calendar", "Dates"], ["user", "Names"], ["file", "Free text"]];
const kinds = sec(
  "What it recognises",
  "#F6F4EE",
  `${h2("What it recognises", "Each value read as what it is.", "A phone number is checked as a phone number, an amount as money and a quantity as a whole number, so a stray mark doesn’t turn into a wrong balance.")}
        <div data-kinds="1" style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 36px;">
          ${K.map(([ic, t]) => `<div style="${CARD} padding: 18px; display: flex; align-items: center; gap: 12px;">${icon(ic, 20, "#0B6B3F")}<b style="font-size: 14.5px;">${t}</b></div>`).join("")}
        </div>`,
);

const conf = sec(
  "Confidence you can see",
  "#fff",
  `
        <div data-dex="1" style="display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 56px; align-items: center;">
          <div>${h2("Confidence you can see", "It tells you where it’s unsure.", "Every field carries a confidence level. Clear values go straight to review; smudged digits, crossed-out entries and totals that don’t add up are highlighted for a person to confirm.")}</div>
          <div style="display: grid; gap: 12px;">
            ${[["check-circle", "#16A85F", "Clear", "Read with high confidence. Ready to accept."], ["alert", "#B98A1F", "Check this", "Faint, crossed out or unusual. Shown highlighted for you to confirm."], ["refresh", "#1D5FA8", "Read it again", "Retake the photo or reprocess the page if a whole section came out wrong."]].map(([ic, col, t, d]) => `<div style="display: flex; gap: 14px; padding: 16px 18px; border-radius: 14px; background: #F6F4EE;">${icon(ic, 22, col)}<span><b style="display: block; font-size: 15px;">${t}</b><span style="font-size: 14px; color: #4B5A52;">${d}</span></span></div>`).join("")}
          </div>
        </div>`,
);

const body = `${hero}${kinds}${conf}${faq(
  "Data extraction questions.",
  [
    ["What does it extract from a page?", "The rows and fields on it: names, phone numbers, emails, amounts, quantities, product codes, dates and notes, depending on the kind of page."],
    ["What happens when it can’t read something?", "The field is highlighted with a lower confidence so you can correct it, and you can reprocess the page or retake the photo."],
    ["Does it check the numbers?", "Yes. Values are checked as the kind of field they are, and totals that don’t match their lines are flagged."],
    ["Can I edit the extracted table?", "Yes. Edit any cell or row before approving. The original page stays alongside for comparison."],
    ["Where does the data go?", "Nowhere until you approve it. Then each row goes to customers, products, expenses, suppliers, credit balances or stock, as you choose."],
  ],
  [["Document Scanning", "/features/document-scanning"], ["Review & Approve Data", "/features/review-approve-data"], ["Product Digitization", "/features/product-digitization"]],
)}${closing("Turn every page into clean data.", "Start a 14-day free trial or book a demo to read your first page.")}`;

module.exports = {
  slug: "features--data-extraction",
  html: page({ route, title: "Data Extraction from Photos and PDFs | Noxtill", desc: "Turn handwritten and printed pages into structured rows: names, phones, amounts and quantities, each with a confidence level and unsure values flagged.", css }, body),
};
