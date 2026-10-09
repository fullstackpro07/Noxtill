/* eslint-disable */
/**
 * Converts marketing-site designs (*.dc.html from Claude Design) into data the frontend renders with
 * `components/site/dc/dc-render.tsx`. One design folder = one "set" (scripts/marketing-dc/sets/<set>.js):
 *
 *   hb  docs/Noxtill Header Build — site header, Home, Blog, /platform + /ai landing pages
 *   np  docs/Noxtill Pages        — industries, solutions, platform modules, AI, tools, resources, company
 *
 * Output per set:
 *   src/lib/marketing/dc/pages/[<set>--]<key>.json   { tree, css, head, effects, logic? }
 *   src/lib/marketing/dc/logic/<set>/<key>.js        the design's component logic as an ES module (np)
 *   src/lib/marketing/dc/slots-<set>.json            image-slot id -> { u?: public URL, s, x, y }
 *   src/lib/marketing/dc/lucide-icons.json (hb) / nx-icons.json (np)
 *   public/marketing/<set>/**                        every image the designs reference (byte-for-byte)
 *
 * The template is parsed by a real browser (puppeteer) exactly the way the design runtime
 * (support.js) parses it, so the node tree, bindings ({{ }}), sc-if / sc-for and style-hover rules
 * are preserved one-to-one.
 *
 * Re-run after a design folder changes:  node scripts/marketing-dc/convert.js <hb|np>
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");
const FRONT = path.join(ROOT, "frontend");
const OUT_PAGES = path.join(FRONT, "src/lib/marketing/dc/pages");
const SET = process.argv[2] || "hb";
const CONF = require("./sets/" + SET + ".js");
const SRC = path.join(ROOT, CONF.src);
const OUT_PUBLIC = path.join(FRONT, "public/marketing", SET);
const PUBLIC_BASE = "/marketing/" + SET + "/";

const puppeteer = require(require.resolve("puppeteer", { paths: [FRONT, path.join(ROOT, "backend")] }));

/** design file -> page key (used for the JSON file name). */
const PAGES = CONF.pages;

/** Helmet <script> bodies -> named client effects (components/site/dc/dc-effects.ts). */
function effectName(body) {
  if (body.includes("meta[name=\"robots\"]")) return "robots";
  if (body.includes("data-nx-fit") && body.includes("data-nx-scale")) return "fitScaleBlog";
  if (body.includes("data-nx-fit")) return "fit";
  if (body.includes("data-nx-scale")) return "scale";
  if (body.includes("__nxMotion")) return "motion";
  throw new Error("Unknown helmet script: " + body.slice(0, 80));
}

// ── CSS scoping ────────────────────────────────────────────────────────────
// Design CSS is global in the design file. Here it is scoped under `.dcx` (the page wrapper) so it
// outranks the `.dcx *` reset in dc.css (which undoes Tailwind preflight, as the designs assume
// browser defaults) and never leaks into the app.
// Classes the design logic sets on <html> (document.documentElement) — they stay ancestors of the scope.
const ROOT_CLASSES = ["nx-js"];

function scopeSelector(sel, scope) {
  return [
    ...new Set(
      sel.split(",").map((s) => {
        s = s.trim();
        if (!s) return s;
        if (/^(html|body)$/.test(s)) return scope;
        if (/^(html|body)\s/.test(s)) return scope + " " + s.replace(/^(html|body)\s+/, "");
        if (s.startsWith(":root")) return scope + s.slice(5);
        const root = ROOT_CLASSES.find((c) => s.startsWith("." + c + " ") || s.startsWith("html." + c + " "));
        if (root) return "html." + root + " " + scope + " " + s.replace(/^(html)?\.[\w-]+\s+/, "");
        return scope + " " + s;
      }),
    ),
  ].join(",");
}

function scopeCss(css, scope) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // find matching close brace
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith("@media") || head.startsWith("@supports") || head.startsWith("@container")) {
      out += head + "{" + scopeCss(body, scope) + "}\n";
    } else if (head.startsWith("@")) {
      out += head + "{" + body + "}\n";
    } else {
      // custom elements render as elements with a same-named class (image-slot → div.image-slot)
      const sel = scopeSelector(head, scope).replace(/(^|[\s>+~,(])(image-slot|nx-icon)(?![\w-])/g, "$1.$2");
      // html/body rules land on the page wrapper: overflow-x:hidden there would make it a scroll
      // container and break the sticky header; clip gives the same visual result without that.
      const decls = sel.split(",").includes(scope) ? body.replace(/overflow-x:\s*hidden/g, "overflow-x:clip") : body;
      out += sel + "{" + decls + "}\n";
    }
    i = j;
  }
  return out;
}

// ── assets ─────────────────────────────────────────────────────────────────
const copied = new Set();
function assetUrl(ref) {
  let clean = ref.replace(/^\.\//, "");
  try { clean = decodeURIComponent(clean); } catch {}
  const file = path.join(SRC, clean);
  if (!fs.existsSync(file)) return null;
  const dest = path.join(OUT_PUBLIC, clean);
  if (!copied.has(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    copied.add(dest);
  }
  return PUBLIC_BASE + clean.split(path.sep).join("/").split("/").map(encodeURIComponent).join("/");
}
function rewriteUrls(v) {
  if (typeof v !== "string") return v;
  // url("./x.png") / url(assets/x.png) / url(uploads/x.png) / url(x.png)
  v = v.replace(/url\((["']?)(\.\/[^"')]+|(?:assets|uploads)\/[^"')]+|[\w .()-]+\.(?:png|jpe?g|webp|avif|svg|gif))\1\)/g, (m, q, ref) => {
    const u = assetUrl(ref);
    return u ? `url(${q}${u}${q})` : m;
  });
  return v;
}
function rewriteRef(v) {
  if (typeof v !== "string" || v.includes("{{")) return v;
  // links between designs ("Contact.dc.html#x") → the page's real route
  const dc = /^(?:\.\/)?([^#?/]+)\.dc\.html(#.*)?$/.exec(v);
  if (dc) {
    const name = decodeURIComponent(dc[1]);
    const route = (CONF.linkMap || {})[name];
    if (!route) throw new Error("No route for design link " + JSON.stringify(v) + " — add it to sets/" + SET + ".js linkMap");
    return route + (dc[2] || "");
  }
  if (/^(\.\/|assets\/|uploads\/)/.test(v) || /^[\w .()-]+\.(png|jpe?g|webp|avif|svg|gif|pdf)$/i.test(v)) {
    return assetUrl(v) || v;
  }
  return v;
}

// ── browser-side template walk (mirrors support.js compile.ts) ──────────────
function browserWalk(html) {
  const CAMEL = "sc-camel-";
  const RAW_WRAP = { select: "sc-raw-select", table: "sc-raw-table", tbody: "sc-raw-tbody", thead: "sc-raw-thead", tfoot: "sc-raw-tfoot", tr: "sc-raw-tr", td: "sc-raw-td", th: "sc-raw-th", caption: "sc-raw-caption" };
  const RAW_UNWRAP = Object.fromEntries(Object.entries(RAW_WRAP).map(([a, b]) => [b, a]));
  const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
  html = html.replace(new RegExp("<(x-import|dc-import)(" + ATTRS + ")/>", "gi"), (_, t, a) => "<" + t + a + "></" + t + ">");
  html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1").replace(/<\/helmet\s*>/gi, "</sc-helmet>");
  html = html.replace(/(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g, (_, sp, name, eq) => sp + CAMEL + name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + eq);
  for (const [real, alias] of Object.entries(RAW_WRAP)) html = html.replace(new RegExp("(</?)" + real + "(?=[\\s>])", "gi"), "$1" + alias);
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const pseudo = [];
  const helmet = [];
  function walk(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue || "";
      if (!t.trim() && !t.includes(" ")) return null;
      return t;
    }
    if (node.nodeType !== 1) return null;
    const tag0 = node.localName;
    if (tag0 === "sc-helmet") {
      helmet.push(node.innerHTML);
      return null;
    }
    const tag = RAW_UNWRAP[tag0] || tag0;
    const attrs = {};
    const cls = [];
    for (const { name, value } of [...node.attributes]) {
      let key = name.startsWith(CAMEL) ? kebabToCamel(name.slice(CAMEL.length)) : name;
      if (key.startsWith("style-")) {
        cls.push([key.slice(6), value]);
        continue;
      }
      attrs[key] = value;
    }
    if (cls.length) pseudo.push(cls);
    const kids = [...node.childNodes].map(walk).filter((k) => k != null);
    return [tag, attrs, kids, cls.length ? cls : undefined];
  }
  const tree = [...tpl.content.childNodes].map(walk).filter((k) => k != null);
  return { tree, helmet };
}

// ── head metadata from the helmet ──────────────────────────────────────────
function parseHead(helmetHtml) {
  const head = {};
  const dec = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const title = helmetHtml.match(/<title>([\s\S]*?)<\/title>/);
  if (title) head.title = dec(title[1]);
  head.meta = [];
  for (const m of helmetHtml.matchAll(/<meta\s+(name|property)="([^"]+)"\s+content="([^"]*)"/g)) head.meta.push([m[1], m[2], dec(m[3])]);
  const canon = helmetHtml.match(/<link rel="canonical" href="([^"]+)"/);
  if (canon) head.canonical = canon[1];
  head.jsonLd = [...helmetHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const css = [...helmetHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const effects = [...helmetHtml.matchAll(/<script(?![^>]*ld\+json)(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => effectName(m[1]));
  return { head, css, effects };
}

function hashClass(pseudo, css) {
  return "dch-" + crypto.createHash("md5").update(pseudo + "|" + css).digest("hex").slice(0, 8);
}
function importantify(css) {
  return css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => (/!important\s*$/.test(d) ? d : d + " !important"))
    .join(";");
}

// ── post-process the tree in node: classes, urls, slots ───────────────────
const SVG_ATTR = /^(stroke-|fill-|clip-|font-|text-anchor|dominant-baseline|stop-|marker-|color-interpolation|shape-rendering|vector-effect|paint-order)/;
const HTML_ATTR = { itemscope: "itemScope", itemtype: "itemType", itemprop: "itemProp", tabindex: "tabIndex", readonly: "readOnly", maxlength: "maxLength", colspan: "colSpan", rowspan: "rowSpan", crossorigin: "crossOrigin", srcset: "srcSet", autocomplete: "autoComplete", enterkeyhint: "enterKeyHint", inputmode: "inputMode", datetime: "dateTime", fetchpriority: "fetchPriority", referrerpolicy: "referrerPolicy", "xlink:href": "xlinkHref", "xmlns:xlink": "xmlnsXlink", "xml:space": "xmlSpace", "clip-path": "clipPath", "fill-rule": "fillRule", "clip-rule": "clipRule" };

// ── responsive pass ────────────────────────────────────────────────────────
// The designs are drawn at 1440px with inline styles. This tags each node, from its own inline style,
// with classes that src/components/site/dc/dc-responsive.css adapts below 1100 / 860 / 640px. Page
// CSS from the design (its own media queries) is emitted after that stylesheet, so where a design
// already specifies mobile behaviour, the design wins. Product mock-ups (role="img", aria-hidden,
// nx-scale/fit frames) are scaled as a whole and are not rearranged internally.
function cssDecls(style) {
  const out = {};
  for (const d of String(style || "").split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
  }
  return out;
}
function splitTracks(v) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of v.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === " " && depth === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  const tracks = [];
  for (const t of out) {
    const m = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/.exec(t);
    if (m) for (let k = 0; k < +m[1]; k++) tracks.push(m[2].trim());
    else tracks.push(t);
  }
  return tracks;
}
const pxOf = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v).trim()); return m ? +m[1] : null; };
/** A grid track that holds page content (fr / large px), as opposed to an icon or label column. */
function bigTrack(t) {
  if (/fr\b/.test(t)) return true;
  const mm = /^minmax\(\s*([^,]+),\s*(.+)\)$/.exec(t);
  if (mm) { if (/fr\b/.test(mm[2])) return true; const p = pxOf(mm[2]); return p != null && p >= 160; }
  const p = pxOf(t);
  return p != null && p >= 160;
}
function textLen(n) { return typeof n === "string" ? n.trim().length : n[2].reduce((t, k) => t + textLen(k), 0); }
function hasTag(n, tags) { return typeof n !== "string" && (tags.includes(n[0]) || n[2].some((k) => hasTag(k, tags))); }
function isMockRoot(a) {
  return a.role === "img" || a["aria-hidden"] === "true" || a["data-nx-scale"] != null || a["data-nx-fit"] != null || /\bnx-fit-inner\b/.test(a.class || a.className || "") || /transform:\s*scale\(\s*[\d.]/.test(a.style || "");
  // (A templated scale — scale({{ c.sc }}) — is a carousel card's focus animation, not a scaled mock.)
}
const bgRatio = new Map();
function imageRatio(url) {
  if (bgRatio.has(url)) return bgRatio.get(url);
  let r = null;
  try {
    const rel = decodeURIComponent(url.replace(PUBLIC_BASE, ""));
    const buf = fs.readFileSync(path.join(OUT_PUBLIC, rel));
    // PNG IHDR / JPEG SOFn / WebP VP8X dimensions
    if (buf.readUInt32BE(0) === 0x89504e47) r = buf.readUInt32BE(20) / buf.readUInt32BE(16);
    else if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { r = buf.readUInt16BE(i + 5) / buf.readUInt16BE(i + 7); break; }
        i += 2 + len;
      }
    }
  } catch {}
  bgRatio.set(url, r);
  return r;
}
const LIGHT_TEXT = /color:\s*(#fff\b|#ffffff\b|white\b|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;
function lightHeading(n) {
  if (typeof n === "string") return false;
  if (["h1", "h2"].includes(n[0]) && LIGHT_TEXT.test(n[1].style || "")) return true;
  return n[2].some(lightHeading);
}

/** A grid laid out like a table row: one short cell per column (keep columns; scroll sideways). */
function isRowGrid(n) {
  if (typeof n === "string") return false;
  const d = cssDecls(n[1].style);
  if (!d["grid-template-columns"] || d["grid-template-columns"].includes("{{")) return false;
  const tracks = splitTracks(d["grid-template-columns"]);
  const cells = n[2].filter((k) => typeof k !== "string");
  return tracks.length >= 4 && cells.length >= tracks.length - 1 && cells.length <= tracks.length && cells.every((c) => textLen(c) <= 48 && c[2].filter((k) => typeof k !== "string").length <= 3);
}
/** A whole table drawn as one grid: several rows of short cells. */
function isCellGrid(n) {
  if (typeof n === "string") return false;
  const d = cssDecls(n[1].style);
  if (!d["grid-template-columns"] || d["grid-template-columns"].includes("{{")) return false;
  const tracks = splitTracks(d["grid-template-columns"]);
  const cells = n[2].filter((k) => typeof k !== "string");
  return tracks.length >= 4 && cells.length >= tracks.length * 2 && cells.length % tracks.length === 0 && cells.every((c) => textLen(c) <= 48 && !hasTag(c, ["img", "image-slot", "p", "h3", "h4"]));
}

/** Classes + CSS custom properties for one node. Returns { cls: [], vars: [] }. */
function responsiveFor(node, inMock, parentStyle = "") {
  const pd = cssDecls(parentStyle);
  // A positioned card inside a proportional stage (a parent with aspect-ratio) scales with it.
  const inStage = !!pd["aspect-ratio"];
  const [tag, attrs, kids] = node;
  const d = cssDecls(attrs.style);
  const cls = [], vars = [];
  const elKids = kids.filter((k) => typeof k !== "string");
  // Wide fixed widths (also on a mock's own root, so the mock still fits its column).
  // Empty placeholder blocks (no content, no picture) left in a design only add blank space.
  const minH = pxOf(d["min-height"]) ?? pxOf(d.height);
  if (minH != null && minH >= 160 && kids.every((k) => typeof k === "string" && !k.trim()) && !(d.background && !/^#fff(fff)?$/i.test(d.background.trim())) && !(d["background-color"] && !/^#fff(fff)?$/i.test(d["background-color"].trim())) && !d["background-image"] && !d.border && !d["box-shadow"] && !["image-slot", "img", "iframe", "video", "canvas"].includes(tag)) cls.push("r-empty");
  // Picture frames sized from the viewport height turn portrait on phones and crop landscape shots.
  if (/vh\b/.test(d.height || "") && hasTag(node, ["img", "image-slot"])) cls.push("r-vhimg");
  // Fixed-basis flex items (carousel cards): content must not silently widen them.
  if (/^0\s+0\s+(\d+(\.\d+)?px|\{\{[^}]+\}\})$/.test((d.flex || "").trim())) cls.push("r-fb");
  const w = pxOf(d.width), mw = pxOf(d["min-width"]);
  if (w != null && w >= 200 && !inMock) cls.push("r-w");
  // Mid-size fixed widths on text blocks can exceed a narrow phone grid cell.
  else if (w != null && w >= 100 && textLen(node) >= 20 && !inMock) cls.push("r-ws");
  const wp = /^(\d+(?:\.\d+)?)%$/.exec((d.width || "").trim());
  if (wp && +wp[1] > 100 && !inMock) cls.push("r-wp");
  if (mw != null && mw >= 340 && !inMock) cls.push("r-mw");
  for (const side of ["left", "right"]) {
    const m = pxOf(d["margin-" + side]);
    if (m != null && m <= -24 && !inMock) cls.push("r-nm" + side[0]);
    // Large fixed side offsets (margin-left: 131px) push a block off a phone screen once columns stack.
    if (m != null && m >= 40 && !inMock) cls.push("r-pm" + side[0]);
  }
  if (inMock) return { cls, vars };
  // Large content wrappers drawn as inline-block (they size to their content, not the screen).
  if (/^inline-block$/.test((d.display || "").trim()) && elKids.length >= 1 && textLen(node) >= 100) cls.push("r-ib");
  // "icon | text | button" bars: the trailing call-to-action drops under the text on phones.
  if (d["grid-template-columns"] && !d["grid-template-columns"].includes("{{")) {
    const tr = splitTracks(d["grid-template-columns"]);
    const last = elKids[elKids.length - 1];
    if (tr.length === 3 && /fr\b/.test(tr[1]) && !bigTrack(tr[0]) && !/fr\b/.test(tr[2]) && elKids.length === 3 && last && (last[0] === "a" || last[0] === "button" || hasTag(last, ["a", "button"]))) cls.push("r-gcta");
  }
  // "text | button" bars (minmax(0,1fr) auto): the button drops under the text on phones.
  if (d["grid-template-columns"] && !d["grid-template-columns"].includes("{{")) {
    const tr = splitTracks(d["grid-template-columns"]);
    const [first, last] = [elKids[0], elKids[elKids.length - 1]];
    if (tr.length === 2 && /fr\b/.test(tr[0]) && /^(auto|max-content)$/.test(tr[1]) && elKids.length === 2 && textLen(first) >= 30 && (last[0] === "a" || last[0] === "button" || hasTag(last, ["a", "button"]))) cls.push("r-g2cta");
  }
  // Decorative vertical side labels (writing-mode / rotated text) only take space once columns stack.
  if ((/vertical/.test(d["writing-mode"] || "") || /rotate\(\s*-?90deg\)/.test(d.transform || "")) && textLen(node) <= 30) cls.push("r-vert");
  // "marker | label | description" rows: the description wraps under the label on phones.
  if (d["grid-template-columns"] && !d["grid-template-columns"].includes("{{")) {
    const tr = splitTracks(d["grid-template-columns"]);
    const mid = /^minmax\(\s*0(px)?\s*,\s*(\d+)px\s*\)$/.exec(tr[1] || "") || /^(\d+)px$/.exec(tr[1] || "");
    const firstSmall = /^(auto|\d+px)$/.test(tr[0] || "") && (pxOf(tr[0]) ?? 0) <= 64;
    if (tr.length === 3 && firstSmall && mid && /fr\b/.test(tr[2])) cls.push("r-g3row");
  }
  // Table-like blocks: rows of cells scroll sideways on phones instead of re-folding.
  const flat = (ks) => ks.flatMap((k) => (typeof k === "string" ? [] : k[0] === "sc-for" || k[0] === "sc-if" ? flat(k[2]) : [k]));
  if (flat(kids).filter(isRowGrid).length >= 2 || flat(kids).some(isCellGrid)) cls.push("r-tbl");
  if (isRowGrid(node) || isCellGrid(node)) cls.push("r-trow");
  // Page-layout grids: every track is a content column.
  else if (d["grid-template-columns"] && !d["grid-template-columns"].includes("{{")) {
    const tracks = splitTracks(d["grid-template-columns"]);
    if (tracks.length >= 2 && tracks.every(bigTrack) && !/auto-fit|auto-fill/.test(d["grid-template-columns"])) {
      const short = elKids.length >= 4 && elKids.every((k) => textLen(k) <= 60 && !hasTag(k, ["img", "image-slot", "p"]));
      cls.push("r-g" + Math.min(tracks.length, 6) + (short ? "s" : ""));
    }
  }
  // Rows of several items that never wrap.
  if (/flex/.test(d.display || "") && !/column/.test(d["flex-direction"] || "") && !/^wrap/.test((d["flex-wrap"] || "").trim()) && elKids.length >= 3 && textLen(node) > 20) cls.push("r-fw");
  // Title + badge rows (space-between) may wrap so their card can shrink to its intended width.
  if (/flex/.test(d.display || "") && /space-between/.test(d["justify-content"] || "") && !/column/.test(d["flex-direction"] || "") && elKids.length === 2 && !/^wrap/.test((d["flex-wrap"] || "").trim())) cls.push("r-sbw");
  // Two big side-by-side flex blocks (text + visual) stack.
  if ((/flex/.test(d.display || "") && !/column/.test(d["flex-direction"] || "") && elKids.length === 2 && elKids.some((k) => (pxOf(cssDecls(k[1].style).width) || 0) >= 300 || /flex:\s*1\s+1\s+\d{3}px/.test(k[1].style || ""))) || (elKids.length === 2 && /flex/.test(d.display || "") && !/column/.test(d["flex-direction"] || "") && elKids.some((k) => hasTag(k, ["h1", "h2", "h3"]) && textLen(k) >= 25) && elKids.every((k) => textLen(k) >= 4 || hasTag(k, ["img", "image-slot"])))) cls.push("r-fst");
  // Floating content cards (absolute overlays with text) collide with headings once columns stack.
  if (!inStage && !((pxOf(pd.height) ?? 99) <= 20 || (pd["container-type"] && !pd["aspect-ratio"])) && /absolute/.test(d.position || "") && textLen(node) >= 12 && (d.background || d["background-color"] || d["box-shadow"]) && !/^0(px)?$/.test(String(d.inset || "").trim()) && !(pxOf(d.left) === 0 && pxOf(d.right) === 0) && !((pxOf(d.left) ?? 0) <= -100 || (pxOf(d.top) ?? 0) <= -40)) cls.push("r-abs");
  // Items absolutely placed inside a collapsed (near-zero height) container: same problem, no card styling.
  else if (/absolute/.test(d.position || "") && textLen(node) >= 4 && ((pxOf(pd.height) ?? 99) <= 20 || (pd["container-type"] && !pd["aspect-ratio"]))) cls.push("r-absz");
  // Picture frames with both height:100% and an aspect ratio stretch over their card's text once the
  // card reflows; let the aspect ratio size them.
  // (image-slot's own default is height:100%.)
  if (d["aspect-ratio"] && ((tag === "image-slot" && (!d.height || /^100%$/.test(d.height.trim()))) || (tag === "img" && /^100%$/.test((d.height || "").trim())))) cls.push("r-ar");
  // Offset / sticky side panels (top: 130px etc.) sit back in the flow once columns stack.
  const top = pxOf(d.top);
  if (top != null && top >= 24 && /relative|sticky|\{\{/.test(d.position || "")) cls.push("r-top");
  if (/sticky/.test(d.position || "")) cls.push("r-top");
  // Single-line pill buttons: long labels may wrap on narrow phones; the design height stays the minimum.
  // Fixed-height buttons with a long label need the same treatment (the label wraps; the height may not stay fixed).
  // (Only boxes — an inline text link inside a sentence must not get button padding.)
  if ((tag === "a" || tag === "button") && textLen(node) >= 12 && (d.display || d.height || d.padding || tag === "button") && (/nowrap/.test(d["white-space"] || "") || (pxOf(d.height) ?? 99) <= 64)) {
    cls.push("r-btn");
    const bh = pxOf(d.height);
    if (bh != null) vars.push("--r-bh:" + bh + "px");
  }
  // Large display type.
  const fsz = pxOf(d["font-size"]);
  if (fsz != null && fsz >= 32) { cls.push("r-fs" + (fsz >= 52 ? "xl" : fsz >= 40 ? "l" : "m")); }
  // Generous padding.
  const pad = d.padding ? d.padding.split(/\s+/) : [];
  const [pt, pr, pb, pl] = pad.length === 1 ? [pad[0], pad[0], pad[0], pad[0]] : pad.length === 2 ? [pad[0], pad[1], pad[0], pad[1]] : pad.length === 3 ? [pad[0], pad[1], pad[2], pad[1]] : pad;
  const P = (v, k) => pxOf(d["padding-" + k] ?? v);
  if ((P(pl, "left") ?? 0) >= 40 || (P(pr, "right") ?? 0) >= 40) cls.push("r-px");
  if ((P(pt, "top") ?? 0) >= 72) cls.push("r-pt");
  if ((P(pb, "bottom") ?? 0) >= 72) cls.push("r-pb");
  // Large fixed gaps.
  const gap = pxOf(String(d.gap || d["column-gap"] || "").split(/\s+/).pop());
  if (gap != null && gap >= 40) cls.push("r-gap");
  // Tall fixed-height text blocks.
  const h = pxOf(d.height);
  // Fixed heights on text blocks: once the content reflows it needs to grow.
  // (Device screens — fixed height, rounded, clipping — keep their height: messages scroll inside them.)
  const deviceScreen = /hidden/.test(d.overflow || "") && (pxOf(d["border-radius"]) ?? 0) >= 24;
  if (h != null && !deviceScreen && ((h >= 80 && (hasTag(node, ["h1", "h2", "h3", "h4", "p", "ul", "ol"]) || textLen(node) >= 40)) || cls.includes("r-fw") || cls.includes("r-fst"))) cls.push("r-h");
  // Hero sections whose picture is a CSS background behind the text.
  const bg = /url\((["']?)([^"')]+)\1\)/.exec(d.background || d["background-image"] || "");
  if (bg && hasTag(node, ["h1", "h2"]) && !/(^|[\s,])repeat([\s,]|$)/.test(d.background || d["background-repeat"] || "")) {
    if (lightHeading(node)) {
      cls.push("r-bgd");
      vars.push("--r-bg:url(" + bg[2] + ")");
    } else {
      const ratio = imageRatio(bg[2]);
      if (ratio) {
        cls.push("r-bgl");
        vars.push("--r-ratio:" + ratio.toFixed(4));
      }
    }
    // Tablet/desktop: a cover background in a box of other proportions is zoomed and cropped; the hero
    // takes the picture's own proportions instead (growing only when its text needs more height).
    const ratio = imageRatio(bg[2]);
    if (ratio && /cover/.test(d.background || d["background-size"] || "")) {
      cls.push("r-hfull");
      vars.push("--r-iar:" + (1 / ratio).toFixed(4));
    }
  }
  return { cls, vars };
}

const HINT_TAGS = new Set(["img", "video", "canvas", "iframe", "embed", "object", "input"]);
const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup", "select", "optgroup"]);

function post(tree, rules, responsive = true) {
  const fix = (n, inMock = false, parentStyle = "") => {
    if (typeof n === "string") return n;
    const [tag, attrs, kids, pseudo] = n;
    const a = {};
    for (let [k, v] of Object.entries(attrs)) {
      if (k === "data-screen-label" || k === "data-dc-tpl" || k.startsWith("hint-")) continue;
      if (k === "class") k = "className";
      else if (k === "for") k = "htmlFor";
      else if (HTML_ATTR[k]) k = HTML_ATTR[k];
      else if (SVG_ATTR.test(k)) k = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (k === "style") v = rewriteUrls(v);
      // repeat(auto-fit, minmax(320px, 1fr)) overflows a column narrower than 320px; min(100%, …) is
      // identical wherever the column is wider (desktop) and fits narrow phones.
      if (k === "style" && responsive) v = v.replace(/(repeat\(\s*auto-(?:fit|fill)\s*,\s*minmax\(\s*)(\d+(?:\.\d+)?px)(\s*,)/g, "$1min(100%, $2)$3");
      if (k === "src" || k === "href" || k === "poster") v = rewriteRef(v);
      // (CONF.imageOverrides keyed by a published picture path replaces that <img>/<image-slot> src.)
      if (k === "src" && typeof v === "string" && (CONF.imageOverrides || {})[v]) v = PUBLIC_BASE + CONF.imageOverrides[v];
      a[k] = v;
    }
    if (pseudo) {
      const names = pseudo.map(([p, css]) => {
        const cls = hashClass(p, css);
        const isEl = p === "before" || p === "after";
        rules.set(cls, "." + cls + (isEl ? "::" : ":") + p + "{" + (isEl ? css : importantify(css)) + "}");
        return cls;
      });
      a.className = [a.className, ...names].filter(Boolean).join(" ");
    }
    // width/height attributes are presentational hints, which dc.css's `all: revert` reset discards;
    // carry them as inline sizes (prepended, so the design's own inline width/height still win).
    if (HINT_TAGS.has(tag)) {
      const hints = ["width", "height"]
        .filter((d) => a[d] != null && /^\d+(\.\d+)?%?$/.test(String(a[d]).trim()) && !new RegExp("(^|;)\\s*" + d + "\\s*:").test(a.style || ""))
        .map((d) => d + ":" + String(a[d]).trim() + (String(a[d]).trim().endsWith("%") ? "" : "px"));
      if (hints.length) a.style = hints.join(";") + ";" + (a.style || "");
    }
    // Responsive classes / vars from the node's own inline style.
    const mock = inMock || isMockRoot(a);
    if (responsive && tag !== "svg") {
      const { cls, vars } = responsiveFor([tag, a, kids], inMock, parentStyle);
      if (cls.length) a.className = [a.className, ...cls].filter(Boolean).join(" ");
      if (vars.length) a.style = (a.style ? a.style.replace(/;?\s*$/, ";") : "") + vars.join(";");
    }
    // Whitespace between table rows/cells is not rendered by browsers and is invalid in React's DOM.
    const k = TABLE_TAGS.has(tag) ? kids.filter((c) => typeof c !== "string" || c.trim()) : kids;
    return [tag, a, k.map((c) => fix(c, mock || tag === "svg", (tag === "sc-for" || tag === "sc-if") ? parentStyle : attrs.style || ""))];
  };
  return tree.map((n) => fix(n));
}

/** A trailing stray image placed after the footer import is a design-canvas leftover, not page content. */
function dropTrailingStray(tree) {
  const els = tree.filter((n) => typeof n !== "string");
  const last = els[els.length - 1];
  const prev = els[els.length - 2];
  if (last && last[0] === "img" && prev && prev[0] === "dc-import") {
    return tree.filter((n) => n !== last);
  }
  return tree;
}

/**
 * The imported designs each carry their own (older) nav bar and footer. The site uses one header and
 * one footer everywhere, so drop the page's first <header> and its page-level <footer> (the last
 * footer holding a link list); DcPage renders SiteHeader/SiteFooter around the body instead.
 */
function stripChrome(tree) {
  let header = null;
  const footers = [];
  const countLinks = (n) => (typeof n === "string" ? 0 : (n[0] === "a" ? 1 : 0) + n[2].reduce((t, k) => t + countLinks(k), 0));
  (function find(nodes) {
    for (const n of nodes) {
      if (typeof n === "string") continue;
      if (n[0] === "header" && !header) header = n;
      if (n[0] === "footer") footers.push(n);
      find(n[2]);
    }
  })(tree);
  const footer = footers.reverse().find((f) => countLinks(f) >= 5) || null;
  const drop = (nodes) => nodes.filter((n) => n !== header && n !== footer).map((n) => (typeof n === "string" ? n : [n[0], n[1], drop(n[2]), n[3]]));
  return { tree: drop(tree), stripped: [header ? "header" : null, footer ? "footer" : null].filter(Boolean) };
}

/** Image paths inside component-logic strings ('./x.png', 'assets/…') → published URLs. */
function rewriteLogicAssets(code) {
  return code.replace(/(['"`])((?:\.\/)?(?:assets|uploads)\/[^'"`]+|\.\/[\w .()-]+\.(?:png|jpe?g|webp|avif|svg|gif))\1/g, (m, q, ref) => {
    const u = assetUrl(ref);
    return u ? q + u + q : m;
  });
}

/**
 * Generated registry for a set: route key → page JSON loader (+ client body bound to the page's
 * logic). One tiny "use client" module per logic page keeps each page's logic in its own chunk.
 */
function writeIndex(keys, logicKeys) {
  const pascal = (k) => "Body_" + k.replace(/[^a-zA-Z0-9]+/g, "_");
  const bodiesDir = path.join(FRONT, "src/components/site/dc/bodies", SET);
  fs.rmSync(bodiesDir, { recursive: true, force: true });
  fs.mkdirSync(bodiesDir, { recursive: true });
  for (const k of logicKeys) {
    fs.writeFileSync(
      path.join(bodiesDir, k + ".tsx"),
      `"use client";\n\n// GENERATED by scripts/marketing-dc/convert.js — do not edit.\nimport { DcHost } from "../../dc-host";\nimport type { DcNode } from "../../dc-render";\nimport { Logic } from "@/lib/marketing/dc/logic/${SET}/${k}";\n\nexport function ${pascal(k)}({ tree }: { tree: DcNode[] }) {\n  return <DcHost tree={tree} logic={Logic} />;\n}\n`,
    );
  }
  const lines = [
    "// GENERATED by scripts/marketing-dc/convert.js — do not edit.",
    'import type { ComponentType } from "react";',
    'import type { DcNode } from "@/components/site/dc/dc-render";',
    ...logicKeys.map((k) => `import { ${pascal(k)} } from "@/components/site/dc/bodies/${SET}/${k}";`),
    "",
    "export type DcSetPage = { load: () => Promise<{ default: unknown }>; Body?: ComponentType<{ tree: DcNode[] }> };",
    "",
    `/** Pages of the "${SET}" design set (${CONF.src}), by route key ("a--b" = /a/b). */`,
    `export const ${SET.toUpperCase()}_PAGES: Record<string, DcSetPage> = {`,
    ...keys.map((k) => `  ${JSON.stringify(k)}: { load: () => import("./pages/${SET}--${k}.json")${logicKeys.includes(k) ? ", Body: " + pascal(k) : ""} },`),
    "};",
    "",
  ];
  fs.writeFileSync(path.join(FRONT, "src/lib/marketing/dc", SET + "-index.ts"), lines.join("\n"));
}

/** The design's component logic as an ES module (verbatim apart from the listed patches). */
function emitLogic(key, src) {
  const at = src.indexOf("data-dc-script");
  if (at < 0) return null;
  const body0 = src.slice(src.indexOf(">", at) + 1, src.indexOf("</script>", at)).trim();
  if (!/class\s+Component\s+extends\s+DCLogic/.test(body0)) return null;
  let body = body0.replace(/class\s+Component\s+extends\s+DCLogic/, "export class Logic extends DcLogic").replace(/React\.createElement/g, "createElement");
  for (const [from, to] of (CONF.logicPatches || {})[key] || []) {
    if (!body.includes(from)) throw new Error("logic patch not found for " + key + ": " + from.slice(0, 60));
    body = body.split(from).join(to);
  }
  body = rewriteLogicAssets(body);
  const imports = ['import { createElement } from "react";', 'import { DcLogic } from "@/components/site/dc/dc-host";', ...((CONF.logicImports || {})[key] || [])];
  const dir = path.join(FRONT, "src/lib/marketing/dc/logic", SET);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, key + ".js"),
    "/* eslint-disable */\n// GENERATED by scripts/marketing-dc/convert.js from the design's component logic — do not edit.\n" +
      imports.join("\n") +
      "\n\n" +
      body +
      "\n",
  );
  return key;
}

(async () => {
  fs.mkdirSync(OUT_PAGES, { recursive: true });
  fs.mkdirSync(OUT_PUBLIC, { recursive: true });
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto("about:blank");

  // Icons: the designs render lucide@0.460.0 (unpkg UMD). Keep that exact geometry for every
  // PascalCase name the component logic mentions, evaluated inside the browser page.
  if (CONF.lucide !== false && SET === "hb") {
  const LUCIDE = "https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js";
  const lucideSrc = await (await fetch(LUCIDE)).text();
  await page.addScriptTag({ content: lucideSrc });
  const iconNames = new Set();
  for (const file of Object.keys(PAGES)) {
    const t = fs.readFileSync(path.join(SRC, file), "utf8");
    const script = t.slice(t.indexOf("data-dc-script"));
    for (const m of script.matchAll(/["']([A-Z][A-Za-z0-9]*)["']/g)) iconNames.add(m[1]);
  }
  iconNames.add("Circle");
  const icons = await page.evaluate((names) => {
    const out = {};
    for (const n of names) {
      let node = window.lucide.icons[n];
      if (!node) continue;
      if (node[0] === "svg") node = node[2];
      out[n] = node;
    }
    return out;
  }, [...iconNames]);
  fs.writeFileSync(path.join(FRONT, "src/lib/marketing/dc/lucide-icons.json"), JSON.stringify(icons));
  console.log("icons:", Object.keys(icons).length);
  }

  // nx-icon.js (design-local icon element): expose its path maps so icons render server-side.
  if (CONF.nxIcons) {
    const nx = fs.readFileSync(path.join(SRC, "nx-icon.js"), "utf8").replace("window.NX_ICON_NAMES = Object.keys(S);", "window.__NX = { S, B, GREEN }; window.NX_ICON_NAMES = Object.keys(S);");
    await page.evaluate(nx);
    const data = await page.evaluate(() => window.__NX);
    fs.writeFileSync(path.join(FRONT, "src/lib/marketing/dc/nx-icons.json"), JSON.stringify(data));
    console.log("nx-icons:", Object.keys(data.S).length, "brands:", Object.keys(data.B).length);
  }

  const logicKeys = [];
  for (const [file, key] of Object.entries(PAGES)) {
    const src = fs.readFileSync(path.join(SRC, file), "utf8");
    const open = /<x-dc(?:\s[^>]*)?>/.exec(src);
    const close = src.lastIndexOf("</x-dc>");
    const template = src.slice(open.index + open[0].length, close);
    // images the component logic references (ported by hand) still need to be published
    for (const m of src.slice(close).matchAll(/['"](\.\/[\w.-]+\.(?:png|jpe?g|webp))['"]/g)) assetUrl(m[1]);
    const { tree, helmet } = await page.evaluate(browserWalk, template);
    const { head, css, effects } = parseHead(helmet.join("\n"));
    const rules = new Map();
    let raw = dropTrailingStray(tree);
    let stripped = [];
    if (CONF.stripChrome) ({ tree: raw, stripped } = stripChrome(raw));
    const outTree = post(raw, rules, key !== "header");
    const logic = CONF.logic ? emitLogic(key, src) : null;
    // Page-specific small-screen fixes (sets/<set>.js mobileCss), emitted after the design's own CSS.
    const extra = (CONF.mobileCss || {})[key] || "";
    const pageCss = scopeCss(rewriteUrls(css), key === "header" ? ".dcxh" : ".dcx") + [...rules.values()].join("\n") + (extra ? "\n" + scopeCss(extra, ".dcx") : "");
    fs.writeFileSync(path.join(OUT_PAGES, (SET === "hb" ? "" : SET + "--") + key + ".json"), JSON.stringify({ tree: outTree, css: pageCss, head, effects, logic: logic || undefined }));
    logicKeys.push(...(logic ? [logic] : []));
    console.log(key.padEnd(52), (JSON.stringify(outTree).length / 1024).toFixed(0) + "KB", effects.join(","), stripped.join("+"), logic ? "logic" : "");
  }
  await browser.close();

  // image-slot contents saved in the design's slot state -> real files, plus each slot's crop view
  const state = JSON.parse(fs.readFileSync(path.join(SRC, ".image-slots.state.json"), "utf8"));
  const slots = {};
  fs.mkdirSync(path.join(OUT_PUBLIC, "slots"), { recursive: true });
  for (const [id, v] of Object.entries(state)) {
    const u = typeof v === "string" ? v : v && v.u;
    const view = typeof v === "object" && v ? { s: v.s ?? 1, x: v.x ?? 0, y: v.y ?? 0 } : { s: 1, x: 0, y: 0 };
    const entry = { ...view };
    const m = u && /^data:image\/(\w+);base64,(.*)$/.exec(u);
    if (m) {
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      fs.writeFileSync(path.join(OUT_PUBLIC, "slots", id + "." + ext), Buffer.from(m[2], "base64"));
      entry.u = PUBLIC_BASE + "slots/" + id + "." + ext;
    }
    if (entry.u || entry.s !== 1 || entry.x || entry.y) slots[id] = entry;
  }
  // Pictures replaced outside the design (CONF.imageOverrides: slot id -> file under public/marketing/<set>/).
  for (const [id, file] of Object.entries(CONF.imageOverrides || {})) {
    if (!id.startsWith("/")) slots[id] = { s: 1, x: 0, y: 0, u: PUBLIC_BASE + file };
  }
  fs.writeFileSync(path.join(FRONT, "src/lib/marketing/dc/slots-" + SET + ".json"), JSON.stringify(slots, null, 2) + "\n");
  if (SET !== "hb") writeIndex(Object.values(PAGES), logicKeys);
  console.log("slots:", Object.keys(slots).length, "assets copied:", copied.size, "logic:", logicKeys.length);
})();
