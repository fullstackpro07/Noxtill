/* eslint-disable @typescript-eslint/no-require-imports */
// /features/receipt-invoice-scan — built around one supplier invoice: the paper on the left, the expense
// it becomes on the right with its supplier and lines, and the totals check that catches a sum that
// doesn't add up before it reaches your books.
// Module: (app)/digitizer (receipt/invoice scanner types → expense destination, invoice reconciliation,
// total_mismatch).
const { icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/receipt-invoice-scan";
const css = `
  @media (max-width: 1080px) { [data-rihero], [data-check] { grid-template-columns: minmax(0,1fr) !important; } }`;

const line = (item, q, p, t) => `<tr><td style="padding: 9px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px;">${item}</td><td style="padding: 9px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px; text-align: right;">${q}</td><td style="padding: 9px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px; text-align: right;">${p}</td><td style="padding: 9px 12px; border-top: 1px solid rgba(16,32,26,.07); font-size: 13px; text-align: right; font-weight: 600;">${t}</td></tr>`;

const hero = `
    <section aria-label="Receipt and Invoice Scan" data-pad="1" style="background: #0F2A1F; padding: 30px 28px 80px; color: #fff;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("AI Photo Digitizer", "/ai/photo-digitizer", "Receipt & Invoice Scan", "rgba(255,255,255,.7)")}
        <div style="max-width: 700px; margin-top: 30px;">
          ${eyebrow("Receipt & Invoice Scan", "#8FE0B3")}
          <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Snap the bill.<br><span style="color: #2FD39A;">The expense writes itself.</span></h1>
          <p style="margin: 20px 0 0; max-width: 560px; font-size: 16.5px; line-height: 1.7; color: rgba(255,255,255,.78);">Photograph a receipt or a supplier invoice and Noxtill reads the supplier, the date, each line and the total, then prepares the expense for you to approve.</p>
          ${ctas("Start Free Trial", true)}
        </div>
        <div data-rihero="1" style="display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); gap: 46px; align-items: center; margin-top: 50px;">
          <div style="text-align: center;">${img("np/assets/paper/invoice.png", "A scanned paper invoice for shampoo, conditioner, hair mask and hair oil, totalling 131", "width: 100%; max-width: 320px; height: auto; margin: 0 auto; border-radius: 16px; box-shadow: 0 30px 60px -20px rgba(0,0,0,.5);")}</div>
          <div style="${CARD} background: #fff; color: #10201A; padding: 22px; box-shadow: 0 30px 60px -20px rgba(0,0,0,.5);" role="img" aria-label="Expense prepared from the invoice: supplier, date, four lines and a total that matches (example data)">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px;"><b style="font-size: 16px;">New expense · from scan</b>${pill("Totals match", "good")}</p>
            <div style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin: 14px 0;">
              ${[["Supplier", "Bella Salon Supply"], ["Date", "12 Aug 2026"], ["Category", "Retail stock"]].map(([k, v]) => `<div style="padding: 10px 12px; border-radius: 10px; background: #F6F4EE;"><span style="display: block; font-size: 11px; color: #6B776F;">${k}</span><b style="font-size: 13.5px;">${v}</b></div>`).join("")}
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead><tr style="font-size: 11px; letter-spacing: .08em; color: #6B776F;"><th style="padding: 8px 12px; text-align: left;">ITEM</th><th style="padding: 8px 12px; text-align: right;">QTY</th><th style="padding: 8px 12px; text-align: right;">PRICE</th><th style="padding: 8px 12px; text-align: right;">TOTAL</th></tr></thead>
              <tbody>${line("Shampoo", 3, "12.00", "36.00")}${line("Conditioner", 2, "15.00", "30.00")}${line("Hair mask", 1, "25.00", "25.00")}${line("Hair oil", 4, "10.00", "40.00")}</tbody>
              <tfoot><tr><td colspan="3" style="padding: 11px 12px; border-top: 2px solid #10201A; font-size: 14px; font-weight: 700;">Total</td><td style="padding: 11px 12px; border-top: 2px solid #10201A; font-size: 14px; font-weight: 700; text-align: right;">$131.00</td></tr></tfoot>
            </table>
            <p style="margin: 14px 0 0; display: flex; justify-content: flex-end; gap: 8px;"><span style="padding: 9px 14px; border-radius: 8px; border: 1px solid rgba(16,32,26,.15); font-size: 13px; font-weight: 600;">Edit</span><span style="padding: 9px 16px; border-radius: 8px; background: #0B5535; color: #fff; font-size: 13px; font-weight: 600;">Approve expense</span></p>
          </div>
        </div>
      </div>
    </section>`;

const check = sec(
  "Totals check",
  "#fff",
  `
        <div data-check="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          <div>${h2("Totals check", "Catches the sum that doesn’t add up.", "Each line is worked out from its quantity and price, then added up and compared with the total printed on the invoice. If they differ, or a line can’t be read, the scan is flagged before it reaches your books.")}</div>
          <div style="${CARD} padding: 22px; border-color: rgba(161,44,31,.35);" role="img" aria-label="Totals check failing: lines add up to 118, printed total is 131, one line unreadable (example data)">
            <p style="margin: 0; display: flex; justify-content: space-between; align-items: center;"><b style="font-size: 15px;">Invoice #4471 · Fresh Farms</b>${pill("Totals don’t match", "bad")}</p>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 16px;">
              <div style="padding: 14px; border-radius: 10px; background: #F6F4EE;"><span style="display: block; font-size: 11.5px; color: #6B776F;">Lines add up to</span><b style="font-size: 22px;">$118.00</b></div>
              <div style="padding: 14px; border-radius: 10px; background: #F6F4EE;"><span style="display: block; font-size: 11.5px; color: #6B776F;">Printed total</span><b style="font-size: 22px;">$131.00</b></div>
            </div>
            <p style="margin: 14px 0 0; padding: 12px 14px; border-radius: 10px; background: #FCE8E6; font-size: 13.5px; color: #A12C1F;">Line 3 couldn’t be read, so it isn’t in the sum. Check the original or retake the photo.</p>
          </div>
        </div>`,
);

const where = sec(
  "Where it goes",
  "#F6F4EE",
  `${h2("Where it goes", "The right place, every time.", "Receipts and invoices become expenses by default. A business card becomes a supplier. You can change where any row goes before approving.")}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 36px;">
          ${[["receipt", "Receipts", "Shop and fuel receipts become expenses with their date and amount."], ["invoice", "Supplier invoices", "Line items, the supplier and the invoice total, checked against each other."], ["id-card", "Business cards", "New suppliers with their phone and email."], ["file-check", "The original", "The photo stays with the expense for your records."]].map(([ic, t, d]) => `<div style="${CARD} padding: 20px;">${icon(ic, 22, "#0B6B3F")}<p style="margin: 12px 0 4px; font-size: 15.5px; font-weight: 700;">${t}</p><p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4B5A52;">${d}</p></div>`).join("")}
        </div>
        <div style="margin-top: 40px;">${img("hb/slots/ai-card-ai-photo-digitizer.webp", "Scanning a paper receipt with a phone", "width: 100%; aspect-ratio: 21 / 8; object-fit: cover; border-radius: 22px;")}</div>`,
);

const body = `${hero}${check}${where}${faq(
  "Receipt and invoice scan questions.",
  [
    ["What does it read from an invoice?", "The supplier, the date, each line with quantity and price, and the printed total."],
    ["What if the total doesn’t match the lines?", "The scan is flagged with the difference and any line it couldn’t read, so you can check before approving."],
    ["Where do scanned receipts end up?", "As expenses by default. You can send any row somewhere else, such as a supplier record, during review."],
    ["Can I keep the paper copy digitally?", "Yes. The original photo or PDF stays attached to the scan."],
    ["Is anything posted automatically?", "No. The expense is prepared for you and saved only after you approve it."],
  ],
  [["Document Scanning", "/features/document-scanning"], ["Data Extraction", "/features/data-extraction"], ["Review & Approve Data", "/features/review-approve-data"]],
)}${closing("No more shoebox of receipts.", "Start a 14-day free trial or book a demo to scan your first invoice.")}`;

module.exports = {
  slug: "features--receipt-invoice-scan",
  html: page({ route, title: "Receipt & Invoice Scanning to Expenses | Noxtill", desc: "Photograph receipts and supplier invoices: Noxtill reads the supplier, lines and total, checks the sum and prepares the expense for approval.", css }, body),
};
