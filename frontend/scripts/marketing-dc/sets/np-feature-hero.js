// Feature pages (/features/*): the site's palette and one hero layout.
//
// 1. Palette — the feature designs drew with their own darks (#0F2A1F …), accents (#2FD39A, #8FE0B3) and a
//    warm beige (#F6F4EE); every other marketing page uses #061009 darks, #2FD97F/#6FE3A6 accents and
//    cool green-whites. Each colour below is swapped for the site's own.
// 2. Hero — the designs put their heading in many places (centred, right-aligned, over a full-bleed photo,
//    under a mock-up). The owner asked for the site's hero (2026-10-15): text on the left, the picture or
//    mock-up on the right, in one row. The heading block is lifted out of the design's hero and everything
//    else the hero showed becomes the right-hand visual; a full-bleed photo becomes a framed picture.

// Official palette = the site's design tokens (frontend/src/app/globals.css :root): surface-deep #053b2a,
// primary #07784c (hover #043023), accent #0ea86a, accent-on-deep #4fe3a8, surface-tint #f2f9f6,
// fg #0b1620, fg-muted #40514a, fg-faint #7b8a83, border #e6eae8 / #d6ddd9.
const PALETTE = {
  "#0F2A1F": "#053b2a",
  "#0D1A14": "#053b2a",
  "#0B2219": "#053b2a",
  "#06261B": "#053b2a",
  "#0D2A21": "#053b2a",
  "#06372A": "#053b2a",
  "#13241B": "#053b2a",
  "#1C1712": "#053b2a",
  "#061009": "#053b2a",
  "#08120D": "#053b2a",
  "#2A302D": "#053b2a",
  "#23282A": "#053b2a",
  "#1E2A25": "#053b2a",
  "#2B3A35": "#053b2a",
  "#232A27": "#053b2a",
  "#161B19": "#053b2a",
  "#121A17": "#053b2a",
  "#0F1F1A": "#053b2a",
  "#101513": "#053b2a",
  "#0B1611": "#053b2a",
  "#071F18": "#053b2a",
  "#0C0F0E": "#053b2a",
  "#2A1F18": "#053b2a",
  "#1A1612": "#053b2a",
  "#173D2E": "#043023",
  "#134535": "#043023",
  "#17473A": "#043023",
  "#0B4A2C": "#043023",
  "#084027": "#043023",
  "#1C5A44": "#07784c",
  "#0B6B3F": "#07784c",
  "#0B5535": "#07784c",
  "#0E9F6E": "#0ea86a",
  "#16A85F": "#0ea86a",
  "#19C38A": "#0ea86a",
  "#2FD39A": "#4fe3a8",
  "#2FD97F": "#4fe3a8",
  "#8FE0B3": "#4fe3a8",
  "#6FE3A6": "#4fe3a8",
  "#1FE0A0": "#4fe3a8",
  "#F6F4EE": "#f2f9f6",
  "#F6FAF7": "#f2f9f6",
  "#E8F3EC": "#f2f9f6",
  "#E7F6EC": "#f2f9f6",
  "#FBFAF6": "#f2f9f6",
  "#EFE9DC": "#f2f9f6",
  "#D9D2C3": "#e6eae8",
  "#E4DED2": "#e6eae8",
  "#E8E2D6": "#e6eae8",
  "#DFEBE2": "#e6eae8",
  "#B7AE9C": "#d6ddd9",
  "#C9C1B2": "#d6ddd9",
  "#10201A": "#0b1620",
  "#4B5A52": "#40514a",
  "#6B776F": "#7b8a83",
  "#7A877F": "#7b8a83",
  "#8A968F": "#7b8a83"
};
const DARK = "#053b2a";
// Mock-ups drawn for a wider space than the hero's right column (natural width in px, measured in the
// browser) are laid out at that width and scaled down evenly instead of being squeezed.
const VW = (() => { try { return require("./np-feature-hero-vw.json"); } catch { return {}; } })();
function scaleCss(slug) {
  const w = VW[slug];
  if (!w) return "";
  const col = (V) => ((Math.min(V - 15, 1360) - 56 - 56) * 1.05) / 2.05; // right column at viewport V
  let css = `@media (min-width: 1101px) { .dcx [data-fhero] > [data-fvis] { width: ${w}px !important; max-width: none !important; justify-self: end; } }`;
  for (let V = 1101; V < 1440; V += 20) css += `@media (min-width: ${V}px) and (max-width: ${V + 19}px) { .dcx [data-fhero] > [data-fvis] { zoom: ${Math.min(1, col(V) / w).toFixed(4)}; } }`;
  css += `@media (min-width: 1440px) { .dcx [data-fhero] > [data-fvis] { zoom: ${Math.min(1, col(1440) / w).toFixed(4)}; } }`;
  return css;
}
// Pictures chosen to fit each page's own section (owner review 2026-10-15): page slug → { design's
// image URL → [public path, alt text] }. Scoped per page because the designs reused one photo for
// different subjects on different pages.
const PHOTOS = (() => { try { return require("./np-feature-photos.json"); } catch { return {}; } })();
function swapPhotos(nodes, map) {
  for (const n of nodes) {
    if (!isEl(n)) continue;
    if (n[0] === "img" && map[n[1].src]) { const [src, alt] = map[n[1].src]; n[1] = { ...n[1], src, alt }; delete n[1].srcset; }
    swapPhotos(n[2], map);
  }
}
const FIX = (() => { try { return require("./np-feature-hero-fix.json"); } catch { return []; } })();
const PAL_RE = new RegExp(Object.keys(PALETTE).join("|"), "gi");
const recolor = (s) => s.replace(/(background(?:-color)?\s*:[^;"]*?)#10201A/gi, "$1#053b2a").replace(PAL_RE, (m) => PALETTE[m.toUpperCase()]);

// ── inline-style helpers ────────────────────────────────────────────────────
const parse = (s) => {
  const m = new Map();
  for (const d of String(s || "").split(";")) {
    const i = d.indexOf(":");
    if (i > 0) m.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
  }
  return m;
};
const ser = (m) => [...m].map(([k, v]) => `${k}: ${v}`).join("; ");
const isEl = (n) => Array.isArray(n);
const st = (n) => parse(n[1].style);
const setSt = (n, m) => (n[1] = { ...n[1], style: ser(m) });
const has = (n, pred) => isEl(n) && (pred(n) || n[2].some((k) => has(k, pred)));
const abs = (n) => isEl(n) && /absolute|fixed/.test(st(n).get("position") || "");
const lum = (hex) => {
  const h = /#([0-9a-f]{6})/i.exec(hex || "");
  if (!h) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const bgOf = (n) => {
  const s = st(n);
  return s.get("background-color") || s.get("background") || "";
};

/** Drop a design's own grid placement / ordering (it pinned the visual to column 1). */
function unplace(n) {
  if (!isEl(n)) return;
  const m = st(n);
  let ch = false;
  for (const k of ["grid-column", "grid-row", "grid-area", "grid-column-start", "grid-column-end"]) if (m.delete(k)) ch = true;
  if (/^-?\d+$/.test(m.get("order") || "")) (m.delete("order"), (ch = true));
  if (ch) setSt(n, m);
}
// a block of copy and/or buttons only (no picture, table or card) — part of the heading block
const TEXT_TAGS = /^(div|p|a|span|strong|em|b|small|br|nav|ul|li)$/;
const textish = (n) => isEl(n) && !has(n, (x) => !TEXT_TAGS.test(x[0]) || (x[0] !== "a" && /box-shadow|border-radius/.test(x[1].style || ""))) && has(n, (x) => x[0] === "a" || x[0] === "p");
const boxy = (n) => has(n, (x) => /background|border-radius|box-shadow/.test(x[1].style || ""));

function firstSection(nodes) {
  for (const n of nodes) {
    if (!isEl(n)) continue;
    if (n[0] === "section") return n;
    const f = firstSection(n[2]);
    if (f) return f;
  }
  return null;
}
function pathTo(n, pred, trail = []) {
  if (!isEl(n)) return null;
  if (pred(n)) return [...trail, n];
  for (const k of n[2]) {
    const p = pathTo(k, pred, [...trail, n]);
    if (p) return p;
  }
  return null;
}
const remove = (parent, child) => (parent[2] = parent[2].filter((k) => k !== child));
const meaningful = (n) => isEl(n) || String(n).trim();

/** Left-align the heading block (designs centred or right-aligned it). */
function leftAlign(n) {
  if (!isEl(n)) return;
  const s = st(n);
  let ch = false;
  if (s.has("text-align")) (s.set("text-align", "left"), (ch = true));
  if (/center|flex-end|end|right/.test(s.get("justify-content") || "")) (s.set("justify-content", "flex-start"), (ch = true));
  if (/center|end|right/.test(s.get("justify-items") || "") || /center|end/.test(s.get("align-items") || "") && /column/.test(s.get("flex-direction") || "")) (s.set("justify-items", "start"), s.set("align-items", "flex-start"), (ch = true));
  for (const k of ["margin", "margin-left", "margin-right", "margin-inline"]) {
    if (/auto/.test(s.get(k) || "")) {
      if (k === "margin") {
        const p = s.get(k).split(/\s+/);
        if (p.length === 1) s.set(k, "0");
        else if (p.length >= 2) (p[1] = "0", p.length === 4 && (p[3] = "0"), s.set(k, p.join(" ")));
      } else s.set(k, "0");
      ch = true;
    }
  }
  if (n[0] === "h1") (s.set("font-size", "clamp(40px, 4.2vw, 60px)"), (ch = true));
  if (ch) setSt(n, s);
  n[2].forEach(leftAlign);
}

function restructure(tree) {
  const sec = firstSection(tree);
  if (!sec) return;
  const p = pathTo(sec, (n) => n[0] === "h1");
  if (!p) return;
  const text = p[p.length - 2]; // the block holding eyebrow, h1, copy and buttons
  const chain = p.slice(1, -2); // section's descendants above the text block

  // a breadcrumb outside the text block moves to its top
  const crumbPath = pathTo(sec, (n) => n[0] === "nav" && /breadcrumb/i.test(n[1]["aria-label"] || ""));
  if (crumbPath && !crumbPath.includes(text)) {
    remove(crumbPath[crumbPath.length - 2], crumbPath[crumbPath.length - 1]);
    text[2].unshift(crumbPath[crumbPath.length - 1]);
  }

  // a design that set the heading alone in its own band: gather the breadcrumb, label, copy and buttons
  // scattered around the hero back around it (document order), on the section's own light ground
  let gathered = false;
  if (!has(text, (x) => x[0] === "p" || (x[0] === "a" && /signup|demo|login|contact/i.test(x[1].href || "")))) {
    const before = [], after = [], eyebrow = [];
    let seen = false;
    const pick = (n, parent) => {
      if (!isEl(n)) return;
      if (n === text) { seen = true; return; }
      if (has(n, (x) => x === text)) { [...n[2]].forEach((k) => pick(k, n)); return; }
      // a card / note / mock-up stays a visual (but a plain wrapper holding one is searched)
      if (boxy(n) && !textish(n) && /background|border-radius|box-shadow/.test(n[1].style || "")) return;
      if (boxy(n) && !textish(n) && n[0] !== "div") return;
      if (n[0] === "nav" || n[0] === "p" || textish(n)) {
        remove(parent, n);
        // a short uppercase label is the eyebrow: it goes right above the heading wherever it was
        const lbl = n[0] === "p" && /uppercase/.test(n[1].style || "") && (n[2].join ? true : true);
        if (lbl) eyebrow.push(n); else (seen ? after : before).push(n);
        return;
      }
      [...n[2]].forEach((k) => pick(k, n));
    };
    [...sec[2]].forEach((k) => pick(k, sec));
    if (before.length + after.length + eyebrow.length) {
      const h1 = p[p.length - 1], hs = st(h1);
      hs.set("color", "#0b1620"); setSt(h1, hs);
      for (const k of [...before, ...after]) { const ks = st(k); ["margin-left", "padding-left", "padding-right", "max-width"].forEach((x) => ks.delete(x)); if (ks.has("padding")) ks.set("padding", "0"); ks.set("justify-content", "flex-start"); ks.set("align-items", "flex-start"); if (/^0? ?auto|auto$/.test(ks.get("margin") || "")) ks.set("margin", "0"); setSt(k, ks); }
      const crumbs = text[2].filter((k) => isEl(k) && k[0] === "nav");
      text[2] = [...crumbs, ...before, ...eyebrow, ...text[2].filter((k) => !crumbs.includes(k)), ...after];
      gathered = true;
    }
  }

  // buttons that sat beside the text block (not inside it) join it
  const tparent = p[p.length - 3];
  for (const sib of [...tparent[2]]) if (sib !== text && textish(sib)) (remove(tparent, sib), text[2].push(sib));
  // mock-ups the design drew inside the text block, after its buttons, move to the visual column
  const ctaAt = text[2].findIndex((k) => isEl(k) && has(k, (x) => x[0] === "a" && /signup|demo|login|contact/i.test(x[1].href || "")));
  const moved = ctaAt >= 0 ? text[2].slice(ctaAt + 1).filter((k) => isEl(k) && boxy(k)) : [];
  text[2] = text[2].filter((k) => !moved.includes(k));

  // lift the text block out; drop ancestors left empty, flatten the ones still holding visuals
  remove(p[p.length - 3], text);
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i], parent = i ? chain[i - 1] : sec;
    if (!node[2].some(meaningful)) { remove(parent, node); continue; }
    const s = st(node);
    for (const k of ["padding", "padding-top", "padding-bottom", "padding-left", "padding-right", "margin", "margin-top", "margin-bottom", "max-width", "min-height", "height"]) s.delete(k);
    if (/grid/.test(s.get("display") || "")) (s.set("grid-template-columns", "minmax(0, 1fr)"), s.delete("grid-template-rows"));
    if (!node[2].some((k) => isEl(k) && !abs(k))) s.set("min-height", "440px");
    s.set("width", "100%");
    setSt(node, s);
    unplace(node);
  }

  // a full-bleed photo (and its tint) becomes a framed picture with the remaining visuals on it
  const photo = sec[2].find((k) => isEl(k) && k[0] === "img" && abs(k));
  const tints = sec[2].filter((k) => isEl(k) && k[0] === "div" && abs(k) && !k[2].some(meaningful));
  let rest = [...moved, ...sec[2].filter((k) => k !== photo && !tints.includes(k) && meaningful(k))];
  rest.forEach(unplace);
  const textDark = (lum(st(p[p.length - 1]).get("color")) ?? 0) < 128 && !/#fff|white/i.test(st(p[p.length - 1]).get("color") || "");
  // the remaining visuals (mock-ups, cards, floating chips) become the right-hand column
  const visual = ["div", { "data-fvis": "1", style: "position: relative; width: 100%; min-width: 0;" }, rest];

  const s = st(sec);
  ["display", "grid-template-columns", "align-items", "min-height", "height", "padding", "padding-top", "padding-bottom"].forEach((k) => s.delete(k));
  s.set("position", "relative"); s.set("overflow", "hidden");
  // white heading on a light hero (its photo or dark panel is gone) needs the site's dark background
  if (!photo && !gathered && !textDark && (lum(bgOf(sec)) ?? 255) > 110) (s.delete("background"), s.set("background", DARK));
  setSt(sec, s);
  const ts = st(text);
  ["max-width", "margin", "margin-top", "padding", "padding-top", "padding-bottom", "background", "border-radius", "position", "box-shadow", "backdrop-filter"].forEach((k) => ts.delete(k));
  ts.set("text-align", "left");
  setSt(text, ts);
  unplace(text);
  leftAlign(text);
  const row = ["div", { "data-fhero": "1", style: "position: relative; z-index: 1; max-width: 1360px; margin: 0 auto; padding: " + (photo ? "96px 28px 104px" : "64px 28px 84px") + "; min-height: " + (photo ? "640px" : "0") + "; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 56px; align-items: center;" }, [text, visual]];
  // a background photo (and its tint) stays exactly as designed, behind the new row
  sec[2] = photo ? [photo, ...tints, row] : [row];
}

// Disclaimer captions ("Illustrative week · fictional bookings", "Example data for illustration.", the
// "Illustrative demo · sample data · <business>, <city>" line and the closing "Illustrative business
// scenario" note) are taken off the feature pages (owner, 2026-10-16). Segments of such a caption that say
// something about the product ("drafts are never sent automatically") are kept.
const DISCLAIM = /illustrat|fictional|sample (data|prices|counts|tax)|example data|demo data/i;
const DROP_SEG = (s) => DISCLAIM.test(s) || /,\s*[A-Z]{2}$|locations$|\b(time|MST)$|^\d+ points? per/i.test(s.trim());
const textOf = (n) => (isEl(n) ? n[2].map(textOf).join("") : String(n));
function cleanCaption(t) {
  const trimmed = t.replace(/\s+/g, " ").trim();
  if (/^example data for illustration\.?$/i.test(trimmed)) return "";
  const segs = trimmed.split(/\s*·\s*/);
  if (segs.length < 2 && !/^illustrat/i.test(trimmed)) return null; // not a caption: leave it
  if (!/^illustrat/i.test(trimmed) && !segs.some((s) => DISCLAIM.test(s))) return null;
  const kept = segs.filter((s) => !DROP_SEG(s));
  if (kept.length === segs.length) return null;
  const out = kept.join(" · ");
  return out && out[0].toUpperCase() + out.slice(1);
}
function stripDisclaimers(nodes) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!isEl(n)) continue;
    for (const a of ["alt", "aria-label", "title"]) if (typeof n[1][a] === "string") n[1][a] = n[1][a].replace(/\s*\((example|demo) data\)/gi, "");
    const leaf = !n[2].some(isEl);
    const t = textOf(n);
    if (leaf && t.length < 200 && DISCLAIM.test(t)) {
      const c = cleanCaption(t);
      if (c === "") { nodes.splice(i, 1); continue; }
      if (c !== null) { n[2] = [c]; continue; }
    }
    const before = n[2].filter(isEl).length;
    stripDisclaimers(n[2]);
    // a wrapper left holding nothing once its caption is gone goes too
    if (before && !n[2].some(meaningful) && /^(div|p|figcaption|span)$/.test(n[0])) nodes.splice(i, 1);
  }
}

/** A hero kept as designed: its grid's fixed min-height (bottom-aligned copy under a band of empty space)
 *  goes, so the hero is as tall as its content. Photo heroes keep theirs — the photo needs the room. */
function untallHero(tree) {
  const sec = firstSection(tree);
  if (!sec || sec[2].some((k) => isEl(k) && k[0] === "img" && abs(k))) return;
  const grid = sec[2].find((k) => isEl(k) && /grid/.test(st(k).get("display") || "") && st(k).has("min-height"));
  if (!grid) return;
  const s = st(grid);
  s.delete("min-height");
  if (/end/.test(s.get("align-items") || "")) s.set("align-items", "center");
  setSt(grid, s);
}

// Hero visuals drawn larger than the copy beside them (owner, 2026-10-16: a clock, rings and a routing
// map left a band of empty space around the copy). Desktop only; slug → rules scoped to the hero.
const HERO = ".dcx main > section:first-of-type";
const SIZE = {
  "scheduled-workflows": `${HERO} > div > div:nth-child(2) { zoom: .74; }`,
  "call-transfer-routing": `${HERO} > div > div:nth-child(2) > div:first-child { max-width: 440px !important; }`,
  "call-analytics": `${HERO} > div > div:nth-child(2) > div:first-of-type { height: 220px !important; }`,
  segmentation: `${HERO} [data-fvis] > div > div:first-child { max-width: 450px !important; margin: 0 auto; }`,
  "customer-360": `${HERO} aside { aspect-ratio: auto !important; }`,
};
// calendar chips: one line, never wrapped inside their fixed-height slot
const CHIP = (sel) => `${HERO} ${sel} { padding: 0 5px !important; display: flex; align-items: center; font-size: 11px !important; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }`;
SIZE["appointment-calendar"] = `${HERO} .r-g6s { gap: 8px !important; margin-top: 0 !important; } ${HERO} .r-g6s > div { padding: 8px !important; } ${CHIP(".r-g6s > div > span:not(:first-child)")}`;
const sizeCss = (slug) => (SIZE[slug] ? `@media (min-width: 1101px) { ${SIZE[slug]} }` : "");

function recolorTree(nodes) {
  for (const n of nodes) {
    if (!isEl(n)) continue;
    for (const k of Object.keys(n[1])) if (typeof n[1][k] === "string" && /#[0-9a-f]{6}/i.test(n[1][k])) n[1][k] = recolor(n[1][k]);
    recolorTree(n[2]);
  }
}

module.exports = {
  /** sets/np.js transformAll hook. */
  featurePages(key, tree) {
    if (!key.startsWith("features--")) return tree;
    recolorTree(tree);
    stripDisclaimers(tree);
    const slug = key.slice("features--".length);
    if (PHOTOS[slug]) swapPhotos(tree, PHOTOS[slug]);
    // Only heroes that are not already text-left / visual-right (np-feature-hero-fix.json, measured from
    // the rendered designs) are rearranged; the rest keep the design's hero as drawn.
    if (process.env.NP_HERO_MEASURE !== "1" && FIX.includes(key.slice("features--".length))) restructure(tree);
    else untallHero(tree);
    return tree;
  },
  recolor,
  scaleCss: (slug) => scaleCss(slug) + sizeCss(slug),
  // Feature-page small-screen rules (already scoped to .dcx).
  FEATURE_CSS: `
@media (max-width: 1100px) {
  /* a hero grid keeps its desktop min-height once its visual stacks or is hidden: let content size it */
  .dcx main > section:first-of-type :is(div, section):has(h1) { min-height: 0 !important; }
  /* the stacked visual: full width up to a readable size, centred, no desktop scaling */
  .dcx [data-fhero] { min-height: 0 !important; padding-top: 56px !important; padding-bottom: 64px !important; }
  /* full-bleed photo heroes keep their desktop height on tablets otherwise: size them to the text */
  .dcx main > section:first-of-type:has(> img) { min-height: 0 !important; align-items: start !important; }
  .dcx [data-fhero] > [data-fvis] { width: 100% !important; max-width: 640px !important; justify-self: center; zoom: 1 !important; }
  /* a stacked hero visual built only from absolutely placed pieces would collapse to zero height and
     spill over the buttons: give it room of its own */
  .dcx main > section:first-of-type div:has(> :is([style*="position:absolute"], [style*="position: absolute"])):not(:has(> :not([style*="position:absolute"], [style*="position: absolute"]))):not(:has(h1)) { position: relative !important; min-height: 340px !important; height: auto !important; margin-top: 8px; }
}
@media (max-width: 760px) {
  /* tables and wide data rows scroll sideways inside their card instead of being cut off */
  .dcx :is(div, section, article):has(> table) { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .dcx table th, .dcx table td { white-space: nowrap; }
  /* a row made only of cards is a card grid, not a table row: wrap it instead of scrolling */
  .dcx .r-trow:not(:has(> :not([style*="border-radius"]))) { min-width: 0 !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}`,
  MOBILE_CSS: `@media (max-width: 1100px) { [data-fhero] { grid-template-columns: minmax(0, 1fr) !important; gap: 36px !important; } }`,
};
