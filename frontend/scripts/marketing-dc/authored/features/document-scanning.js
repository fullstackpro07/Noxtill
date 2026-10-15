/* eslint-disable @typescript-eslint/no-require-imports */
// /features/document-scanning — built around the capture moment: the phone camera framing a paper page,
// the ten kinds of page the scanner knows, and the honest file limits.
// Module: (app)/digitizer (SCANNER_TYPES, JPEG/PNG/WebP ≤10 MB, PDF ≤20 MB and 40 pages; no HEIC/Office).
const { esc, icon, img, pill, CARD, eyebrow, sec, h2, crumb, ctas, faq, closing, page } = require("./fkit");

const route = "/features/document-scanning";
const css = `
  [data-types] { min-width: 0 !important; }
  @media (max-width: 1080px) { [data-dshero], [data-limits] { grid-template-columns: minmax(0,1fr) !important; } }
  @media (max-width: 900px) { [data-types] { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }
  @media (max-width: 520px) { [data-types] { grid-template-columns: minmax(0,1fr) !important; } }`;

const hero = `
    <section aria-label="Document Scanning" data-pad="1" style="background: #EFE9DC; padding: 30px 28px 0; overflow: hidden;">
      <div style="max-width: 1180px; margin: 0 auto;">
        ${crumb("AI Photo Digitizer", "/ai/photo-digitizer", "Document Scanning")}
        <div data-dshero="1" style="display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 40px; align-items: end; margin-top: 24px;">
          <div style="padding-bottom: 80px;">
            ${eyebrow("Document Scanning")}
            <h1 data-h1="1" style="margin: 0; font-size: 56px; font-weight: 700; line-height: 1.03; letter-spacing: -0.04em;">Point your phone.<br>The paperwork’s in.</h1>
            <p style="margin: 20px 0 0; max-width: 470px; font-size: 16.5px; line-height: 1.7; color: #4B5A52;">Take a photo of a register page, a supplier invoice or a handwritten price list, or upload a PDF. Noxtill reads it and gets it ready for you to check.</p>
            ${ctas("Start Free Trial")}
            <p style="margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px;">${["Handwriting", "Printed pages", "Multi-page PDFs", "Photos from your gallery"].map((x) => `<span style="padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.7); border: 1px solid rgba(16,32,26,.1); font-size: 12.5px; font-weight: 600; color: #4B5A52;">${x}</span>`).join("")}</p>
          </div>
          ${img("np/pasted-1789677497167-0-mu5zruqn-evpw.png", "A phone camera framing a handwritten customer list, with supply and expense pages beside it", "width: 100%; height: auto; border-radius: 22px 22px 0 0;")}
        </div>
      </div>
    </section>`;

const T = [
  ["book", "Register page", "Daily sales or a till book"],
  ["receipt", "Receipt", "Shop and supplier receipts"],
  ["invoice", "Invoice", "Supplier invoices and bills"],
  ["utensils", "Menu", "Menus and printed price lists"],
  ["tag", "Product list", "Catalogues and product sheets"],
  ["id-card", "Business card", "Supplier and contact cards"],
  ["users", "Customer list", "Names, phones, opening balances"],
  ["checklist", "Stock count", "Handwritten or printed counts"],
  ["ledger", "Credit ledger", "Customer credit and payments"],
  ["file", "Anything else", "Mixed pages, sorted row by row"],
];
const types = sec(
  "What you can scan",
  "#fff",
  `${h2("What you can scan", "Ten kinds of page, each read the right way.", "Tell the scanner what kind of page it is, or let it decide. Each kind has its own fields and a sensible place for the data to go, which you can change before anything is saved.")}
        <div data-types="1" style="display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 12px; margin-top: 38px;" role="list">
          ${T.map(([ic, t, d], i) => `<div role="listitem" style="${CARD} padding: 18px; ${i === 1 ? "border-color: #16A85F; box-shadow: 0 0 0 3px rgba(22,168,95,.14);" : ""}">${icon(ic, 22, "#0B6B3F")}<b style="display: block; margin: 12px 0 4px; font-size: 14.5px;">${t}</b><span style="font-size: 12.5px; line-height: 1.5; color: #6B776F;">${d}</span></div>`).join("")}
        </div>`,
);

const lim = (ic, t, big, small) => `<div style="${CARD} padding: 22px;">${icon(ic, 24, "#0B6B3F")}<p style="margin: 14px 0 2px; font-size: 13px; font-weight: 600; color: #6B776F;">${t}</p><p style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;">${big}</p><p style="margin: 4px 0 0; font-size: 13px; color: #4B5A52;">${small}</p></div>`;
const limits = sec(
  "Files and limits",
  "#F6F4EE",
  `
        <div data-limits="1" style="display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center;">
          <div>${h2("Files and limits", "Clear about what it reads.", "Photos and PDFs work. Some formats don’t yet, and we say so up front instead of failing quietly after you upload.")}
            <div style="margin-top: 24px; display: grid; gap: 10px; font-size: 14.5px; color: #4B5A52;">
              <p style="margin: 0; display: flex; gap: 10px;">${icon("check-circle", 18, "#16A85F")}JPEG, PNG and WebP photos</p>
              <p style="margin: 0; display: flex; gap: 10px;">${icon("check-circle", 18, "#16A85F")}PDFs, including multi-page ones</p>
              <p style="margin: 0; display: flex; gap: 10px;">${icon("x-circle", 18, "#A12C1F")}iPhone HEIC files and Word or Excel files are not read yet</p>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px;" data-limits="1">
            ${lim("camera", "Photo size", "10 MB", "Per image")}${lim("file", "PDF size", "20 MB", "Per document")}${lim("layers", "PDF pages", "40", "Per document")}
          </div>
        </div>`,
);

const tips = sec(
  "Better photos",
  "#fff",
  `
        <div data-dshero="1" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center;">
          ${img("np/pasted-1789677447776-0-mu5zqsmq-a7t8.png", "An open notebook with a handwritten customer list of names, phones and balances", "width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 22px;")}
          <div>${h2("Better photos", "Old notebooks welcome.", "Faded ink, ruled pages and cramped handwriting are what this was built for. A few habits make every page read cleaner.")}
            <ol style="margin: 24px 0 0; padding: 0; list-style: none; display: grid; gap: 14px;">
              ${[["sun", "Good light, no flash glare", "Daylight or an even lamp keeps faint ink readable."], ["grid", "Whole page in the frame", "Keep all four corners in view so no column is cut off."], ["layers", "One page per photo", "For a book, photograph each page; for many pages, a PDF is easiest."]].map(([ic, t, d]) => `<li style="display: flex; gap: 14px;"><span style="flex: none; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: #E8F3EC;">${icon(ic, 18, "#0B6B3F")}</span><span><b style="display: block; font-size: 15px;">${t}</b><span style="font-size: 14px; color: #4B5A52;">${d}</span></span></li>`).join("")}
            </ol>
          </div>
        </div>`,
);

const body = `${hero}${types}${limits}${tips}${faq(
  "Document scanning questions.",
  [
    ["Can it read handwriting?", "Yes. It is built for handwritten registers, ledgers and price lists as well as printed pages. Anything it is unsure of is marked for you to check."],
    ["Which files can I upload?", "JPEG, PNG and WebP photos up to 10 MB, and PDFs up to 20 MB and 40 pages. HEIC photos and Word or Excel files are not supported yet."],
    ["Do I have to say what kind of page it is?", "No. You can pick the kind of page, or choose “anything else” and let it sort each row on its own."],
    ["Is anything saved straight away?", "No. Scanned data waits for your review and goes into your records only after you approve it."],
    ["Can I see the original later?", "Yes. The original photo or PDF stays with the scan so you can compare it with what was read."],
  ],
  [["Data Extraction", "/features/data-extraction"], ["Review & Approve Data", "/features/review-approve-data"], ["Receipt & Invoice Scan", "/features/receipt-invoice-scan"]],
)}${closing("Bring the paper in, one photo at a time.", "Start a 14-day free trial or book a demo to scan your first page.")}`;

module.exports = {
  slug: "features--document-scanning",
  html: page({ route, title: "Document Scanning — Photos and PDFs to Data | Noxtill", desc: "Photograph registers, invoices, price lists and handwritten ledgers, or upload PDFs, and Noxtill reads them and readies the data for review.", css }, body),
};
