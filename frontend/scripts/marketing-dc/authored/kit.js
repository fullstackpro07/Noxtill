// Small shared pieces for the hand-designed pages in ./platform (each page has its own layout and its
// own coded module mock-up; only document boilerplate, icons, pills and buttons are shared so the
// pages stay in the site's visual family: Instrument Sans, the Noxtill greens, 14px white cards).
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (name, size, color) => `<nx-icon name="${name}" size="${size}" style="color: ${color};"></nx-icon>`;
/** An image that already exists under public/marketing/ (path relative to it). */
const img = (file, alt, style) => `<img src="/marketing/${file}" alt="${esc(alt)}" loading="lazy" decoding="async" style="display: block; ${style}">`;

const TONES = { good: ["#E7F6EC", "#0B6B3F"], warn: ["#FFF3D6", "#8A5A00"], bad: ["#FDE8E4", "#A3301C"], info: ["#E6F0FB", "#1D5FA8"], mute: ["#EEF1EF", "#56635C"], dark: ["#0B4A2C", "#fff"] };
const pill = (text, tone = "good", extra = "") => `<span style="display: inline-flex; align-items: center; background: ${TONES[tone][0]}; color: ${TONES[tone][1]}; border-radius: 999px; padding: 4px 11px; font-size: 11.5px; font-weight: 600; white-space: nowrap; ${extra}">${esc(text)}</span>`;
const avatar = (initials, bg = "#0B6B3F", size = 26) => `<span aria-hidden="true" style="flex: none; display: grid; place-items: center; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${bg}; color: #fff; font-size: ${Math.round(size * 0.38)}px; font-weight: 700;">${esc(initials)}</span>`;

const CARD = "background: #fff; border: 1px solid rgba(16,32,26,.08); border-radius: 14px;";
const btn = (label, href = "/login?tab=signup") => `<a href="${href}" style="display: inline-flex; align-items: center; gap: 10px; background: #0B5535; color: #fff; font-size: 15px; font-weight: 600; padding: 14px 26px; border-radius: 9px;" style-hover="background: #084027; color: #fff;">${esc(label)} <span aria-hidden="true">→</span></a>`;
const btnGhost = (label, href = "/book-a-demo") => `<a href="${href}" style="display: inline-flex; align-items: center; gap: 10px; background: #fff; border: 1px solid rgba(16,32,26,.14); color: #10201A; font-size: 15px; font-weight: 600; padding: 14px 24px; border-radius: 9px;" style-hover="border-color: #0B6B3F; color: #0B6B3F;">${esc(label)}</a>`;
const eyebrow = (text, color = "#0B6B3F") => `<p style="margin: 0 0 12px; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; font-weight: 600; color: ${color};">${esc(text)}</p>`;
const demoNote = (color = "#8A968F") => `<p style="margin: 10px 0 0; font-size: 11px; color: ${color};">Example data for illustration.</p>`;

/** <helmet> content: SEO tags + the page's own CSS (`css` = that page's responsive rules). */
function head({ route, title, desc, css }) {
  const url = "https://noxtill.com" + route;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": "https://noxtill.com/#organization", name: "Noxtill", url: "https://noxtill.com/", description: "The AI-Powered Business Operating System" },
      { "@type": "WebPage", "@id": url + "#webpage", url, name: title, description: desc, isPartOf: { "@id": "https://noxtill.com/#website" } },
    ],
  };
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Noxtill">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #F5F7F3; }
  a[style*="inline-flex"] { white-space: nowrap; }
  img { max-width: 100%; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
  a { color: #0B6B3F; text-decoration: none; }
  a:hover { color: #16A85F; }
  :focus-visible { outline: 2px solid #16A85F; outline-offset: 3px; }
  @media (max-width: 720px) {
    [data-pad] { padding-left: 18px !important; padding-right: 18px !important; }
    [data-h1] { font-size: 32px !important; }
    [data-h2] { font-size: 24px !important; }
  }
${css}
</style>`;
}

/** Wrap a page body as a .dc.html design file (the format the converter reads). */
const doc = (meta, body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<x-dc>
<helmet>
${head(meta)}
</helmet>

<div style="background: #F5F7F3; color: #10201A; font-family: 'Instrument Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.55; width: 100%; overflow-x: clip;">
  <main id="main">
${body}
  </main>
</div>
</x-dc>
</body>
</html>
`;

const trial = (color = "rgba(255,255,255,.82)", tick = "#6FE3A6") =>
  `<ul style="margin: 20px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 12px 30px; font-size: 13.5px; color: ${color};">${["14-day free trial", "No credit card required", "Cancel anytime"].map((x) => `<li style="display: flex; align-items: center; gap: 9px;">${icon("verified", 16, tick)}${x}</li>`).join("")}</ul>`;

module.exports = { esc, icon, img, pill, avatar, CARD, btn, btnGhost, eyebrow, demoNote, doc, trial };
