/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * convert-features-pages.js
 *
 * Converts the new designs from `docs/Features pages` for:
 *   - 72 Features (F01 to F72) + 3 additional features (Audio Conference Calls, Screen Sharing, Video Meetings)
 *   - 7 AI Agents (F73 to F79)
 *   - 14 Blogs (plus Blog index and previous blogs)
 *   - Platform, AI, and Free Tools pages present in the folder
 *
 * Preserves existing industries, solutions, and platform pages in `np-index.ts`.
 * Generates pixel-perfect JSON, scoped CSS, client logic modules, and body components.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");
const FRONT = path.join(ROOT, "frontend");
const SRC = path.join(ROOT, "docs/Features pages");
const OUT_PAGES = path.join(FRONT, "src/lib/marketing/dc/pages");
const OUT_PUBLIC_NP = path.join(FRONT, "public/marketing/np");
const OUT_PUBLIC_HB = path.join(FRONT, "public/marketing/hb");
const OUT_PUBLIC_ASSETS = path.join(FRONT, "public/assets");

const puppeteer = require(require.resolve("puppeteer", { paths: [FRONT, path.join(ROOT, "backend")] }));

// Helper to copy dir recursively
function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const item of fs.readdirSync(srcDir)) {
    const sPath = path.join(srcDir, item);
    const dPath = path.join(destDir, item);
    if (fs.statSync(sPath).isDirectory()) {
      copyDirRecursive(sPath, dPath);
    } else {
      fs.copyFileSync(sPath, dPath);
    }
  }
}

// 1. Copy assets to public directories
console.log("Copying assets to public directories...");
copyDirRecursive(path.join(SRC, "assets"), OUT_PUBLIC_ASSETS);
copyDirRecursive(path.join(SRC, "assets"), path.join(OUT_PUBLIC_NP, "assets"));
copyDirRecursive(path.join(SRC, "assets"), path.join(OUT_PUBLIC_HB, "assets"));

// Copy root png files
for (const file of fs.readdirSync(SRC)) {
  if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".webp") || file.endsWith(".svg")) {
    fs.copyFileSync(path.join(SRC, file), path.join(FRONT, "public", file));
    fs.copyFileSync(path.join(SRC, file), path.join(OUT_PUBLIC_NP, file));
    fs.copyFileSync(path.join(SRC, file), path.join(OUT_PUBLIC_HB, file));
  }
}

// Process .image-slots.state.json if present
const statePath = path.join(SRC, ".image-slots.state.json");
if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  fs.mkdirSync(path.join(OUT_PUBLIC_NP, "slots"), { recursive: true });
  fs.mkdirSync(path.join(OUT_PUBLIC_HB, "slots"), { recursive: true });
  for (const [id, v] of Object.entries(state)) {
    const u = typeof v === "string" ? v : v && v.u;
    const m = u && /^data:image\/(\w+);base64,(.*)$/.exec(u);
    if (m) {
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const buf = Buffer.from(m[2], "base64");
      fs.writeFileSync(path.join(OUT_PUBLIC_NP, "slots", id + "." + ext), buf);
      fs.writeFileSync(path.join(OUT_PUBLIC_HB, "slots", id + "." + ext), buf);
    }
  }
}

// Define the comprehensive page mapping for Features pages folder
const canonMap = JSON.parse(fs.readFileSync(path.join(SRC, "scraps/seo-canon.json"), "utf8")).canon;

// Build file -> route mapping
const ALL_PAGES = {};
const LINK_MAP = {
  Home: "/",
  "Noxtill Home": "/",
  "Noxtill Homepage": "/",
  Platform: "/platform",
  Features: "/features",
  Solutions: "/solutions",
  Industries: "/industries",
  Pricing: "/pricing",
  "Noxtill Pricing": "/pricing",
  Contact: "/contact",
  "Book a Demo": "/book-a-demo",
  "Help Centre": "/help",
  Help: "/help",
  Resources: "/resources",
  Support: "/support",
  Blog: "/blog",
  "Terms of Service": "/trust/terms",
  "Privacy Policy": "/trust/privacy",
};

for (const file of fs.readdirSync(SRC)) {
  if (!file.endsWith(".dc.html") || file.startsWith("Canvas") || file.includes("(old)")) continue;
  const content = fs.readFileSync(path.join(SRC, file), "utf8");
  const canonMatch = content.match(/<link rel="canonical" href="https:\/\/noxtill\.com([^"]*)"/);
  const route = canonMatch ? canonMatch[1] : null;

  if (route) {
    ALL_PAGES[file] = route;
    const baseName = file.replace(/\.dc\.html$/, "");
    LINK_MAP[baseName] = route;
  }
}

// Specific link map aliases
LINK_MAP["AI Call Answering"] = "/features/ai-call-answering";
LINK_MAP["Missed Call Recovery"] = "/features/missed-call-recovery";
LINK_MAP["Call Transfer and Routing"] = "/features/call-transfer-and-routing";
LINK_MAP["Call Transfer - Routing"] = "/features/call-transfer-and-routing";
LINK_MAP["Auto Dialer and Power Dialer"] = "/features/auto-dialer-and-power-dialer";
LINK_MAP["Auto Dialer - Power Dialer"] = "/features/auto-dialer-and-power-dialer";

function effectName(body) {
  if (body.includes("meta[name=\"robots\"]")) return "robots";
  if (body.includes("data-nx-fit") && body.includes("data-nx-scale")) return "fitScaleBlog";
  if (body.includes("data-nx-fit")) return "fit";
  if (body.includes("data-nx-scale")) return "scale";
  if (body.includes("__nxMotion")) return "motion";
  if (body.includes("data-toc") || body.includes("IntersectionObserver")) return "toc";
  if (body.includes("style.zoom") || body.includes("data-fitzoom")) return null;
  // fallback for any other inline script
  return "custom";
}

function scopeCss(css, scope) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    let body = css.slice(open + 1, j - 1);
    if (/^(html|body)$/.test(head)) {
      body = body.replace(/overflow-x\s*:\s*hidden;?/gi, "");
    }
    if (head.startsWith("@media") || head.startsWith("@supports") || head.startsWith("@container")) {
      out += head + "{" + scopeCss(body, scope) + "}\n";
    } else if (head.startsWith("@")) {
      out += head + "{" + body + "}\n";
    } else {
      const sels = head.split(",").map((s) => {
        s = s.trim();
        if (!s) return s;
        if (/^(html|body)$/.test(s)) return scope;
        if (/^(html|body)\s/.test(s)) return scope + " " + s.replace(/^(html|body)\s+/, "");
        if (s.startsWith(":root")) return scope + s.slice(5);
        return scope + " " + s;
      });
      out += sels.join(",") + "{" + body + "}\n";
    }
    i = j;
  }
  return out;
}

function assetUrl(ref, set = "np") {
  let clean = ref.replace(/^\.\//, "");
  try { clean = decodeURIComponent(clean); } catch {}
  if (clean.startsWith("assets/")) {
    return "/assets/" + clean.slice(7);
  }
  return "/marketing/" + set + "/" + clean;
}

function rewriteUrls(v, set = "np") {
  if (typeof v !== "string") return v;
  return v.replace(/url\((["']?)(\.\/[^"')]+|(?:assets|uploads)\/[^"')]+|[\w .()-]+\.(?:png|jpe?g|webp|avif|svg|gif))\1\)/g, (m, q, ref) => {
    const u = assetUrl(ref, set);
    return `url(${q}${u}${q})`;
  });
}

function rewriteRef(v, set = "np") {
  if (typeof v !== "string" || v.includes("{{")) return v;
  const dc = /^(?:\.\/)?([^#?/]+)\.dc\.html(#.*)?$/.exec(v);
  if (dc) {
    const name = decodeURIComponent(dc[1]);
    const route = LINK_MAP[name];
    if (route) return route + (dc[2] || "");
  }
  if (/^(\.\/|assets\/)/.test(v) || /^[\w .()-]+\.(png|jpe?g|webp|avif|svg|gif|pdf)$/i.test(v)) {
    return assetUrl(v, set);
  }
  return v;
}

function rewriteSrcSet(v, set = "np") {
  if (typeof v !== "string") return v;
  return v
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/^(\S+)(\s+.*)?$/);
      if (!match) return part;
      const url = rewriteRef(match[1], set);
      return url + (match[2] || "");
    })
    .join(", ");
}

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
  const effects = [...helmetHtml.matchAll(/<script(?![^>]*ld\+json)(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => effectName(m[1]))
    .filter(Boolean);
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

const HTML_ATTR = {
  novalidate: "noValidate",
  itemscope: "itemScope",
  itemtype: "itemType",
  itemprop: "itemProp",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  colspan: "colSpan",
  rowspan: "rowSpan",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
  autocomplete: "autoComplete",
  enterkeyhint: "enterKeyHint",
  inputmode: "inputMode",
  datetime: "dateTime",
  fetchpriority: "fetchPriority",
  referrerpolicy: "referrerPolicy",
  "xlink:href": "xlinkHref",
  "xmlns:xlink": "xmlnsXlink",
  "xml:space": "xmlSpace",
  "clip-path": "clipPath",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
};
const SVG_ATTR = /^(stroke-|fill-|clip-|font-|text-anchor|dominant-baseline|stop-|marker-|color-interpolation|shape-rendering|vector-effect|paint-order)/;
const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup", "select", "optgroup"]);

function postProcessTree(tree, rules, set = "np") {
  const fix = (n) => {
    if (typeof n === "string") return n;
    const [tag, attrs, kids, pseudo] = n;
    const a = {};
    for (let [k, v] of Object.entries(attrs)) {
      if (k === "data-screen-label" || k === "data-dc-tpl" || k.startsWith("hint-")) continue;
      if (k === "class") k = "className";
      else if (k === "for") k = "htmlFor";
      else if (HTML_ATTR[k]) k = HTML_ATTR[k];
      else if (SVG_ATTR.test(k)) k = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (k === "style") v = rewriteUrls(v, set);
      if (k === "src" || k === "href" || k === "poster") v = rewriteRef(v, set);
      if (k === "srcSet" || k === "srcset") v = rewriteSrcSet(v, set);
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
    const tableKids = TABLE_TAGS.has(tag) || (tag === "sc-for" || tag === "sc-if");
    const k = tableKids ? kids.filter((c) => typeof c !== "string" || c.trim()) : kids;
    return [tag, a, k.map((c) => fix(c))];
  };
  return tree.map((n) => fix(n));
}

function stripChrome(tree) {
  // Preserve headers! The design's header (or blog hero header) must remain in the tree.
  return { tree, stripped: [] };
}

function emitLogic(key, src, set = "np") {
  const at = src.indexOf("data-dc-script");
  if (at < 0) return null;
  const body0 = src.slice(src.indexOf(">", at) + 1, src.indexOf("</script>", at)).trim();
  if (!/class\s+Component\s+extends\s+DCLogic/.test(body0)) return null;

  let body = body0
    .replace(/class\s+Component\s+extends\s+DCLogic/, "export class Logic extends DcLogic")
    .replace(/React\.createElement/g, "createElement");

  body = rewriteUrls(body, set);
  body = body.replace(/(['"`])((?:\.\/)?([^'"`#?/]+)\.dc\.html)(#[^'"`]*)?\1/g, (_m, q, ref, name, hash) => {
    const route = LINK_MAP[decodeURIComponent(name)];
    return route ? q + route + (hash || "") + q : _m;
  });

  if (/\bComponent\b/.test(body.replace(/export class Logic/, ""))) body += "\nconst Component = Logic;";

  const imports = [
    'import { createElement } from "react";',
    'import { DcLogic } from "@/components/site/dc/dc-host";',
  ];

  const dir = path.join(FRONT, "src/lib/marketing/dc/logic", set);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, key + ".js"),
    "/* eslint-disable */\n// GENERATED by convert-features-pages.js from the design's component logic — do not edit.\n" +
      imports.join("\n") +
      "\n\n" +
      body +
      "\n",
  );
  return key;
}

(async () => {
  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto("about:blank");

  // Load Lucide icons into Puppeteer
  const LUCIDE = "https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js";
  try {
    const lucideSrc = await (await fetch(LUCIDE)).text();
    await page.addScriptTag({ content: lucideSrc });
  } catch (e) {
    console.warn("Could not fetch remote lucide, continuing with existing lucide icons");
  }

  // Scan icon names across all designs
  const iconNames = new Set(["Circle", "ArrowRight", "Layers", "Phone", "Check", "Sparkles", "Calendar", "Star", "ChevronDown", "Minus", "Plus", "Clock", "Settings", "FileText", "Mic", "Play", "ArrowRightLeft", "CalendarDays", "User"]);
  for (const file of Object.keys(ALL_PAGES)) {
    const t = fs.readFileSync(path.join(SRC, file), "utf8");
    const script = t.slice(t.indexOf("data-dc-script"));
    for (const m of script.matchAll(/["']([A-Z][A-Za-z0-9]*)["']/g)) iconNames.add(m[1]);
    for (const m of script.matchAll(/i\.([A-Z][A-Za-z0-9]*)/g)) iconNames.add(m[1]);
  }

  const iconsData = await page.evaluate((names) => {
    const out = {};
    if (!window.lucide || !window.lucide.icons) return out;
    for (const n of names) {
      let node = window.lucide.icons[n] || window.lucide.icons.Circle;
      if (!node) continue;
      if (node[0] === "svg") node = node[2];
      out[n] = node;
    }
    return out;
  }, [...iconNames]);

  const existingLucidePath = path.join(FRONT, "src/lib/marketing/dc/lucide-icons.json");
  const existingLucide = fs.existsSync(existingLucidePath) ? JSON.parse(fs.readFileSync(existingLucidePath, "utf8")) : {};
  const mergedLucide = { ...existingLucide, ...iconsData };
  fs.writeFileSync(existingLucidePath, JSON.stringify(mergedLucide, null, 2));
  console.log("Updated lucide-icons.json with", Object.keys(mergedLucide).length, "icons.");

  const featureLogicKeys = [];
  const featureEntries = {}; // routeKey -> { jsonName, hasLogic }
  const blogEntries = {}; // slug -> jsonName

  console.log(`Starting conversion of ${Object.keys(ALL_PAGES).length} pages...`);

  for (const [file, route] of Object.entries(ALL_PAGES)) {
    const src = fs.readFileSync(path.join(SRC, file), "utf8");
    const open = /<x-dc(?:\s[^>]*)?>/.exec(src);
    const close = src.lastIndexOf("</x-dc>");
    if (!open || close < 0) {
      console.warn(`Skipping ${file}: no <x-dc> tags found.`);
      continue;
    }
    const template = src.slice(open.index + open[0].length, close);

    const { tree, helmet } = await page.evaluate(browserWalk, template);
    let { head, css, effects } = parseHead(helmet.join("\n"));
    const rules = new Map();

    const isBlog = route.startsWith("/blog");
    const set = isBlog ? "hb" : "np";

    let raw = tree;
    const { tree: strippedTree } = stripChrome(raw);
    raw = strippedTree;

    const outTree = postProcessTree(raw, rules, set);

    let pageKey = "";
    let jsonFileName = "";

    if (route === "/blog") {
      pageKey = "blog";
      jsonFileName = "blog.json";
    } else if (isBlog) {
      const slug = route.replace("/blog/", "");
      pageKey = "blog--" + slug;
      jsonFileName = "blog--" + slug + ".json";
      blogEntries[slug] = jsonFileName;
    } else if (route.startsWith("/features/")) {
      const slug = route.replace("/features/", "");
      pageKey = "features--" + slug;
      jsonFileName = "np--" + pageKey + ".json";
    } else if (route.startsWith("/platform/")) {
      const slug = route.replace("/platform/", "");
      pageKey = "platform--" + slug;
      jsonFileName = "platform--" + slug + ".json";
    } else if (route.startsWith("/ai/")) {
      const slug = route.replace("/ai/", "");
      pageKey = "ai--" + slug;
      jsonFileName = "ai--" + slug + ".json";
    } else if (route.startsWith("/free-tools/")) {
      const slug = route.replace("/free-tools/", "");
      pageKey = "tools--" + slug;
      jsonFileName = "np--" + pageKey + ".json";
    } else {
      pageKey = route.replace(/^\//, "").replace(/\//g, "--");
      jsonFileName = "np--" + pageKey + ".json";
    }

    const logic = emitLogic(pageKey, src, set);

    const pageCss = scopeCss(rewriteUrls(css, set), ".dcx") + "\n" + [...rules.values()].join("\n");

    const pageData = {
      tree: outTree,
      css: pageCss,
      head,
      effects,
      logic: logic || undefined,
    };

    fs.writeFileSync(path.join(OUT_PAGES, jsonFileName), JSON.stringify(pageData));
    fs.writeFileSync(
      path.join(OUT_PAGES, jsonFileName.replace(/\.json$/, ".d.json.ts")),
      '// GENERATED by convert-features-pages.js — do not edit.\nimport type { DcPageData } from "@/components/site/dc/dc-render";\n\ndeclare const page: DcPageData;\nexport default page;\n',
    );

    if (route.startsWith("/features/")) {
      featureEntries[pageKey] = { jsonFileName, hasLogic: !!logic };
      if (logic) featureLogicKeys.push(pageKey);
    }

    console.log(`Converted ${file.padEnd(38)} -> ${jsonFileName}`);
  }

  await browser.close();

  // Generate component body wrappers for logic feature pages
  const pascal = (k) => "Body_" + k.replace(/[^a-zA-Z0-9]+/g, "_");
  const bodiesDir = path.join(FRONT, "src/components/site/dc/bodies/np");
  fs.mkdirSync(bodiesDir, { recursive: true });

  for (const k of featureLogicKeys) {
    fs.writeFileSync(
      path.join(bodiesDir, k + ".tsx"),
      `"use client";\n\n// GENERATED by convert-features-pages.js — do not edit.\nimport { DcHost } from "../../dc-host";\nimport type { DcNode } from "../../dc-render";\nimport { Logic } from "@/lib/marketing/dc/logic/np/${k}";\n\nexport function ${pascal(k)}({ tree, props }: { tree: DcNode[]; props?: Record<string, unknown> }) {\n  return <DcHost tree={tree} logic={Logic} props={props} />;\n}\n`,
    );
  }

  // Update np-index.ts: preserve non-features, update/add all features and aliases
  console.log("Updating np-index.ts...");
  const npIndexPath = path.join(FRONT, "src/lib/marketing/dc/np-index.ts");
  const currentNpIndex = fs.readFileSync(npIndexPath, "utf8");

  // Extract non-feature imports and entries
  const existingImports = [...currentNpIndex.matchAll(/^import\s+\{\s*(Body_[a-zA-Z0-9_]+)\s*\}\s+from\s+["']@\/components\/site\/dc\/bodies\/np\/(?!features--)([^"']+)["'];/gm)];
  const existingEntries = [...currentNpIndex.matchAll(/^\s*"((?!features--)[^"]+)":\s*\{[^}]+\},/gm)];

  // Slugs aliases mapping (both long and short versions)
  const ALIASES = {
    "features--call-transfer-routing": "features--call-transfer-and-routing",
    "features--auto-dialer-power-dialer": "features--auto-dialer-and-power-dialer",
    "features--ivr-call-menus": "features--ivr-and-call-menus",
    "features--follow-ups-reminders": "features--follow-ups-and-reminders",
    "features--loyalty-memberships": "features--loyalty-and-memberships",
    "features--instagram-messenger": "features--instagram-and-messenger",
    "features--ai-agents-workflows": "features--ai-agents-and-workflows",
    "features--triggers-actions": "features--triggers-and-actions",
    "features--receipt-invoice-scan": "features--receipt-and-invoice-scan",
    "features--review-approve-data": "features--review-and-approve-data",
  };

  const newImports = [];
  const newEntries = [];

  for (const imp of existingImports) {
    newImports.push(imp[0]);
  }
  for (const k of featureLogicKeys) {
    newImports.push(`import { ${pascal(k)} } from "@/components/site/dc/bodies/np/${k}";`);
  }

  for (const ent of existingEntries) {
    newEntries.push(ent[0].trim());
  }

  for (const [k, info] of Object.entries(featureEntries)) {
    newEntries.push(`  ${JSON.stringify(k)}: { load: () => import("./pages/${info.jsonFileName}")${info.hasLogic ? ", Body: " + pascal(k) : ""} },`);
  }

  // Add alias entries pointing to the same page
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (featureEntries[canonical]) {
      const info = featureEntries[canonical];
      newEntries.push(`  ${JSON.stringify(alias)}: { load: () => import("./pages/${info.jsonFileName}")${info.hasLogic ? ", Body: " + pascal(canonical) : ""} },`);
    }
  }

  const npIndexContent = [
    "// GENERATED by convert-features-pages.js — do not edit.",
    'import type { ComponentType } from "react";',
    'import type { DcNode } from "@/components/site/dc/dc-render";',
    ...newImports,
    "",
    "export type DcSetPage = { load: () => Promise<{ default: unknown }>; Body?: ComponentType<{ tree: DcNode[]; props?: Record<string, unknown> }> };",
    "",
    '/** Pages of the "np" design set, by route key ("a--b" = /a/b). */',
    "export const NP_PAGES: Record<string, DcSetPage> = {",
    ...newEntries,
    "};",
    "",
  ].join("\n");

  fs.writeFileSync(npIndexPath, npIndexContent);
  console.log("np-index.ts updated with", Object.keys(featureEntries).length, "features & agents + aliases.");

  // Update pages-index.ts with all blog pages
  console.log("Updating pages-index.ts with blog pages...");
  const pagesIndexPath = path.join(FRONT, "src/lib/marketing/dc/pages-index.ts");
  const blogList = [
    "ai-agents-small-business-human-oversight",
    "ai-photo-digitizer-for-small-business-paper-records",
    "ai-receptionist-for-small-business",
    "all-in-one-business-software-small-business",
    "appointment-scheduling-for-small-business",
    "autonomous-commerce-small-business",
    "business-intelligence-small-business",
    "field-service-management-small-business",
    "review-management-for-small-business",
    "small-business-automation-ideas",
    "small-business-crm-playbook",
    "small-business-operations-playbook",
    "small-business-pos-system-guide",
    "small-business-seo-practical-system",
    "small-business-workflow-automation",
    "unified-inbox-small-business",
  ];

  const blogEntriesStr = blogList
    .map((slug) => `  "${slug}": () => import("./pages/blog--${slug}.json"),`)
    .join("\n");

  const pagesIndexContent = `import type { DcPageData } from "@/components/site/dc/dc-render";

type Loader = () => Promise<{ default: unknown }>;

/** Pages converted from \`docs/Noxtill Header Build\` and \`docs/Features pages\`, by route. */
export const PLATFORM_PAGES: Record<string, Loader> = {
  "assets-maintenance": () => import("./pages/platform--assets-maintenance.json"),
  "customer-portal": () => import("./pages/platform--customer-portal.json"),
  "documents-esign": () => import("./pages/platform--documents-esign.json"),
  "field-service": () => import("./pages/platform--field-service.json"),
  "finance-accounting": () => import("./pages/platform--finance-accounting.json"),
  helpdesk: () => import("./pages/platform--helpdesk.json"),
  "payments-billing": () => import("./pages/platform--payments-billing.json"),
  "people-payroll": () => import("./pages/platform--people-payroll.json"),
  procurement: () => import("./pages/platform--procurement.json"),
  "website-commerce": () => import("./pages/platform--website-commerce.json"),
};

export const AI_PAGES: Record<string, Loader> = {
  "autonomous-commerce": () => import("./pages/ai--autonomous-commerce.json"),
  "business-intelligence": () => import("./pages/ai--business-intelligence.json"),
  "seo-autopilot": () => import("./pages/ai--seo-autopilot.json"),
};

export const BLOG_PAGES: Record<string, Loader> = {
${blogEntriesStr}
};

export async function loadDcPage(loader: Loader | undefined): Promise<DcPageData | null> {
  if (!loader) return null;
  return (await loader()).default as DcPageData;
}
`;
  fs.writeFileSync(pagesIndexPath, pagesIndexContent);
  console.log("pages-index.ts updated with", blogList.length, "blog pages.");

  console.log("All conversion steps completed successfully!");
})();

