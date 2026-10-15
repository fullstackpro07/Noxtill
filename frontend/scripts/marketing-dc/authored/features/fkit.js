/* eslint-disable @typescript-eslint/no-require-imports */
// Frame shared by the hand-designed feature pages in this folder, in the visual family of the
// designed feature pages (docs/Noxtill Pages, e.g. "Dispatch Board.dc.html"): Instrument Sans, white and
// #F6F4EE sections at 96px, the dark #0F2A1F closing band. Only the frame is shared — every page has
// its own hero and its own coded mock-ups of its feature.
const kit = require("../kit");
const { esc, icon } = kit;

const W = "max-width: 1180px; margin: 0 auto;";
const sec = (label, bg, inner, pad = "96px 28px") => `
    <section aria-label="${esc(label)}" data-pad="1" style="background: ${bg}; padding: ${pad};">
      <div style="${W}">${inner}
      </div>
    </section>`;

const h2 = (eyebrowText, title, sub = "", color = "#10201A") => `
        ${kit.eyebrow(eyebrowText)}
        <h2 data-h2="1" style="margin: 0; max-width: 640px; font-size: 40px; font-weight: 700; line-height: 1.1; letter-spacing: -0.03em; color: ${color};">${title}</h2>${sub ? `
        <p style="margin: 16px 0 0; max-width: 620px; font-size: 16px; line-height: 1.7; color: #4B5A52;">${sub}</p>` : ""}`;

const crumb = (moduleName, moduleHref, name, color = "#4B5A52") =>
  `<nav aria-label="Breadcrumb" style="font-size: 13px; color: ${color};"><a href="/features" style="color: inherit;">Features</a> <span aria-hidden="true">/</span> <a href="${moduleHref}" style="color: inherit;">${esc(moduleName)}</a> <span aria-hidden="true">/</span> <span aria-current="page" style="font-weight: 600;">${esc(name)}</span></nav>`;

const ctas = (primary, dark = false) => `
          <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px;">
            <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: ${dark ? "#2FD39A" : "#0B5535"}; color: ${dark ? "#06372A" : "#fff"}; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 999px;" style-hover="background: ${dark ? "#8FE0B3" : "#084027"}; color: ${dark ? "#06372A" : "#fff"};">${esc(primary)} <span aria-hidden="true">→</span></a>
            <a href="/book-a-demo" style="display: inline-flex; align-items: center; background: transparent; border: 1px solid ${dark ? "rgba(255,255,255,.4)" : "rgba(16,32,26,.2)"}; color: ${dark ? "#fff" : "#10201A"}; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 999px;" style-hover="border-color: ${dark ? "#fff" : "#0B6B3F"};">Book a Demo</a>
          </div>`;

/** FAQ column + related feature links (native <details>, like the designs' accordion). */
const faq = (title, items, related) =>
  sec(
    "FAQs",
    "#F6F4EE",
    `
        <div data-faq="1" style="display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: start;">
          <div>
            ${kit.eyebrow("FAQs")}
            <h2 data-h2="1" style="margin: 0; font-size: 40px; font-weight: 700; line-height: 1.1; letter-spacing: -0.03em;">${title}</h2>
            <p style="margin: 16px 0 0; font-size: 14px; color: #4B5A52;">Related: ${related.map(([n, h]) => `<a href="${h}">${esc(n)}</a>`).join(" · ")}</p>
          </div>
          <div style="display: grid; gap: 12px;">${items
            .map(
              ([q, a]) => `
            <details style="background: #fff; border: 1px solid rgba(16,32,26,.08); border-radius: 12px; padding: 18px 20px;">
              <summary style="cursor: pointer; font-size: 15.5px; font-weight: 600; color: #10201A;">${esc(q)}</summary>
              <p style="margin: 12px 0 0; font-size: 14.5px; line-height: 1.7; color: #4B5A52;">${esc(a)}</p>
            </details>`,
            )
            .join("")}
          </div>
        </div>`,
  );

const closing = (title, sub) => `
    <section aria-label="Get started" data-pad="1" style="background: #0F2A1F; padding: 88px 28px; text-align: center;">
      <div style="${W}">
        <h2 data-h2="1" style="margin: 0 auto; max-width: 760px; font-size: 42px; font-weight: 700; line-height: 1.1; letter-spacing: -0.03em; color: #fff;">${title}</h2>
        <p style="margin: 14px auto 0; max-width: 560px; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,.78);">${esc(sub)}</p>
        <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-top: 28px;">
          <a href="/login?tab=signup" style="display: inline-flex; align-items: center; gap: 10px; background: #fff; color: #0F2A1F; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 999px;" style-hover="background: #E8F3EC; color: #0F2A1F;">Start Free Trial <span aria-hidden="true">→</span></a>
          <a href="/book-a-demo" style="display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 999px;" style-hover="border-color: #fff; color: #fff;">Book a Demo</a>
        </div>
      </div>
    </section>`;

/** A small labelled caption under a mock. */
const note = (text, color = "#7A877F") => `<p style="margin: 12px 0 0; font-size: 12px; color: ${color};">${esc(text)}</p>`;

const FAQ_CSS = `
  @media (max-width: 900px) { [data-faq] { grid-template-columns: minmax(0,1fr) !important; gap: 24px !important; } }`;

/** Page wrapper: white body (feature pages alternate white / #F6F4EE sections). */
const page = (meta, body) => kit.doc({ ...meta, css: FAQ_CSS + (meta.css || "") }, body).replace("background: #F5F7F3; color: #10201A;", "background: #fff; color: #10201A;");

module.exports = { ...kit, icon, W, sec, h2, crumb, ctas, faq, closing, note, page };
