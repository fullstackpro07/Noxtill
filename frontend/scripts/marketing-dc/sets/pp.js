// docs/Noxtill pricing page built — Pricing, the Legal & Trust Center hub and the Legal Reader used by
// every legal / privacy / trust document page. Key = route with "/" → "--"; "legal-reader" is the
// document template, rendered by /legal/[doc], /trust/[doc] and /privacy/[doc] with its `doc` prop.
// Each design carries its own top bar and footer; they are removed so every page uses the site-wide
// SiteHeader / SiteFooter (same as the other marketing pages).

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

// Every design file a link can point at → its real route (canonical URLs from each file's <helmet>).
const linkMap = {
  "Noxtill Pricing": "/pricing",
  trust: "/trust",
  "privacy-choices": "/privacy/choices",
  "privacy-do-not-sell-or-share": "/privacy/do-not-sell-or-share",
  "trust-security": "/trust/security",
  "trust-subprocessors": "/trust/subprocessors",
  "trust-responsible-disclosure": "/trust/responsible-disclosure",
};
for (const d of [
  "acceptable-use", "accessibility", "ai-calling", "ai-transparency", "api-terms", "billing-terms", "changes",
  "children-privacy", "cookies", "data-retention", "dpa", "electronic-signatures", "intellectual-property",
  "marketing-advertising", "merchant-payments", "messaging-consent", "payroll", "privacy", "product-terms",
  "refunds", "regional-privacy", "sla", "terms", "website-commerce",
]) linkMap["legal-" + d] = "/legal/" + d;

// ── tree helpers (nodes are [tag, attrs, kids]) ───────────────────────────
const text = (n) => (typeof n === "string" ? n : n[2].map(text).join(""));
const map = (nodes, fn) => nodes.map((n) => (typeof n === "string" ? n : fn([n[0], n[1], map(n[2], fn), n[3]])));
/** The tree without one node (compared by identity, so filter at each level before rebuilding it). */
const without = (nodes, target) => nodes.filter((n) => n !== target).map((n) => (typeof n === "string" ? n : [n[0], n[1], without(n[2], target), n[3]]));
const find = (nodes, pred) => {
  for (const n of nodes) {
    if (typeof n === "string") continue;
    if (pred(n)) return n;
    const hit = find(n[2], pred);
    if (hit) return hit;
  }
  return null;
};

/** Placeholder links (href="#") → real routes, by the link's visible text. */
function linkByText(tree, routes) {
  return map(tree, (n) => {
    if (n[0] !== "a" || n[1].href !== "#") return n;
    const label = text(n).replace(/\s+/g, " ").trim();
    const hit = Object.entries(routes).find(([t]) => label === t || label.startsWith(t));
    if (!hit) throw new Error('No route for placeholder link "' + label + '" — add it to sets/pp.js');
    return [n[0], { ...n[1], href: hit[1] }, n[2], n[3]];
  });
}

/**
 * The page's own footer goes (the site footer replaces it), but `keep` (a node inside it worth keeping,
 * e.g. a pricing disclaimer) moves to the end of <main>, restyled by `style` for a light background.
 */
function dropFooter(tree, keep) {
  const footer = find(tree, (n) => n[0] === "footer");
  if (!footer) throw new Error("design footer not found");
  const kept = keep ? keep(footer) : null;
  const out = without(tree, footer);
  if (find(out, (n) => n[0] === "footer")) throw new Error("design footer still present");
  return !kept ? out : map(out, (n) => (n[0] === "main" ? [n[0], n[1], [...n[2], kept], n[3]] : n));
}

/** <img src="https://cdn.simpleicons.org/<slug>"> → the local copy (no third-party request at runtime). */
function localBrands(tree) {
  return map(tree, (n) => {
    const m = n[0] === "img" && /^https:\/\/cdn\.simpleicons\.org\/([a-z0-9]+)$/.exec(n[1].src || "");
    if (!m) return n;
    if (!fs.existsSync(path.join(__dirname, "../../../public/marketing/pp/brands", m[1] + ".svg"))) throw new Error("brand icon not downloaded: " + m[1]);
    return [n[0], { ...n[1], src: "/marketing/pp/brands/" + m[1] + ".svg" }, n[2], n[3]];
  });
}

/** Replace one exact text node. */
function retext(tree, from, to) {
  let n = 0;
  const walk = (nodes) => nodes.map((k) => (typeof k === "string" ? (k.includes(from) ? (n++, k.replace(from, to)) : k) : [k[0], k[1], walk(k[2]), k[3]]));
  const out = walk(tree);
  if (n !== 1) throw new Error("retext: expected one match, got " + n + " for " + from.slice(0, 40));
  return out;
}

const SIGNUP = "/login?tab=signup";

module.exports = {
  src: "docs/Noxtill pricing page built",
  stripChrome: true,
  logic: true,
  // These designs are responsive by themselves (fluid grids + width-aware logic): no generic r-* layer;
  // PpPage marks the page `.dcx-own` so dc-responsive.css's element-level phone rules skip it too.
  responsive: false,
  dataIcons: true,
  // the designs' own lucide aliases (fillIcons → findIcon in Noxtill Pricing.dc.html)
  iconAlt: {
    "check-circle-2": ["CircleCheck", "CheckCircle2"],
    "upload-cloud": ["CloudUpload", "UploadCloud"],
    "alert-triangle": ["TriangleAlert", "AlertTriangle"],
    "id-card": ["IdCard", "Contact"],
    "plus-circle": ["CirclePlus", "PlusCircle"],
    "bar-chart-2": ["ChartNoAxesColumn", "BarChart2"],
  },
  // legal/content.js (window.NOX_LEGAL). `reviewNotes` are internal launch notes the design marks
  // "remove before publication" — they are not published.
  registries: [
    {
      src: "legal/content.js",
      global: "NOX_LEGAL",
      out: "pp-legal.json",
      empty: ["reviewNotes"],
      // 2026-10-10: the owner confirmed this content is the final, approved version — the registry's
      // "Draft — pending legal review" status and "draft published for review" wording are not shown.
      patch: (L) => {
        for (const d of L.docs) d.status = "";
        for (const u of L.updates) u.title = u.title.replace("Legal & Trust Center draft published for review", "Legal & Trust Center published");
      },
    },
  ],
  linkMap,
  pages: {
    "Noxtill Pricing.dc.html": "pricing",
    "trust.dc.html": "trust",
    "Legal Reader.dc.html": "legal-reader",
  },
  transform: {
    pricing: (tree) =>
      localBrands(linkByText(
        dropFooter(tree, (footer) => {
          // "All prices in USD … Terms of Service · Refund & Cancellation Policy …" stays as page content.
          const p = find(footer[2], (n) => n[0] === "p" && /All prices in USD/.test(text(n)));
          if (!p) throw new Error("pricing disclaimer not found");
          return ["div", { style: "max-width:1160px;margin:0 auto;padding:40px 20px 28px" }, [[p[0], { ...p[1], style: "margin:0;font-size:13px;line-height:1.7;color:#4B5B53" }, p[2]]]];
        }),
        {
          "Contact sales": "/contact",
          "or book a demo": "/book-a-demo",
          "Book a demo": "/book-a-demo",
          "Start free trial": SIGNUP,
          "{{ p.trialBtn }}": SIGNUP,
          "Refund & Cancellation Policy": "/legal/refunds",
          "Refund &amp; Cancellation Policy": "/legal/refunds",
          "Terms of Service": "/legal/terms",
          "Privacy Policy": "/legal/privacy",
          "Pricing, Billing": "/legal/billing-terms",
          "Billing": "/legal/billing-terms",
          "Cookie": "/legal/cookies",
          "Acceptable Use": "/legal/acceptable-use",
          "Help Centre": "/help",
          "Contact Sales": "/contact",
          "Sign in": "/login",
          "Noxtill": "/",
          "Book a Demo": "/book-a-demo",
          "Start Free Trial": SIGNUP,
          "{{ n.label }}": "/pricing",
          "{{ l }}": "/",
          "": "/",
        },
      )),
    trust: (tree) =>
      // Privacy choices are saved and data-rights requests are sent for real here, so the tools intro
      // no longer calls every public tool a simulation.
      approvedTrust(retext(
        dropFooter(tree),
        "Public tools are clearly labelled simulations. Your real account status, requests and refunds are handled inside your signed-in workspace.",
        "Calculators and timelines are clearly labelled simulations. Privacy choices are saved and data-rights requests reach our privacy team; your account status and refunds are handled inside your signed-in workspace.",
      )),
    "legal-reader": (tree) => {
      let out = approvedReader(dropFooter(tree));
      // Breadcrumb "Home" is the site home (the design, a standalone file set, pointed it at Pricing).
      out = map(out, (n) => (n[0] === "a" && text(n).trim() === "Home" ? [n[0], { ...n[1], href: "/" }, n[2], n[3]] : n));
      // The data-rights form is real now (see logicPatches): its "Simulation" badge goes.
      const form = find(out, (n) => n[0] === "form");
      const badge = form && find(form[2], (n) => n[0] === "span" && text(n).trim() === "Simulation");
      if (!badge) throw new Error("data-rights Simulation badge not found");
      return without(out, badge);
    },
  },
  logicImports: {
    trust: ['import NOX_LEGAL from "@/lib/marketing/dc/pp-legal.json";'],
    "legal-reader": [
      'import NOX_LEGAL from "@/lib/marketing/dc/pp-legal.json";',
      'import { browserConsentId, recordConsent, submitLegalForm } from "@/lib/legal-public-api";',
    ],
  },
  logicPatches: {
    pricing: [
      // Brand logos are served from public/marketing/pp/brands (copies of cdn.simpleicons.org/<slug>).
      ["src: 'https://cdn.simpleicons.org/' + b.slug", "src: '/marketing/pp/brands/' + b.slug + '.svg'"],
      // Same first render on the server and in the browser (design width); the real width is read on mount.
      ["vw: typeof window !== 'undefined' ? window.innerWidth : 1280", "vw: 1280"],
      // Icons are rendered server-side from the same lucide geometry (data-icon); without window.lucide
      // the design's filler would re-schedule itself forever.
      ["  fillIcons() {\n    const L = window.lucide;", "  fillIcons() {\n    return;\n    const L = window.lucide;"],
    ],
    trust: [
      ["window.NOX_LEGAL", "NOX_LEGAL"],
      // The registry is bundled, so the page renders complete on the server (the design waited for a
      // <script> to load it). Nothing in the first render may read window/location.
      ["state = { ready: false,", "state = { ready: true,"],
      ["vw: typeof window !== 'undefined' ? window.innerWidth : 1280", "vw: 1280"],
      ["this.onResize = () => this.setState({ vw: window.innerWidth }); window.addEventListener('resize', this.onResize);", "this.onResize = () => this.setState({ vw: window.innerWidth }); window.addEventListener('resize', this.onResize); this.onResize();"],
      ["const base = location.href.split('?')[0].split('#')[0].replace(/[^/]*$/, '');", "const base = '';"],
      // Country names come from Intl.DisplayNames, whose data differs between Node and browsers
      // ("Falkland Islands" vs "Falkland Islands (Islas Malvinas)"): fill the list after mount.
      ["this.setState({ f, faqOpen });", "this.setState({ f, faqOpen, mounted: true });"],
      // approved content: no "drafts pending" note on the regional banner
      ["The global baseline applies, plus the regional notice below. Notices are drafts pending local legal review.", "The global baseline applies, plus the regional notice below."],
      ["const countries = L.iso.map(c => ({ code: c, name: cname(c) })).sort((a, b) => a.name.localeCompare(b.name));", "const countries = !st.mounted ? [] : L.iso.map(c => ({ code: c, name: cname(c) })).sort((a, b) => a.name.localeCompare(b.name));"],
      // document links are site routes now (not files next to this one)
      ["copy: () => this.copy(base + d.file, 'Link copied')", "copy: () => this.copy(location.origin + d.file, 'Link copied')"],
    ],
    "legal-reader": [
      ["window.NOX_LEGAL", "NOX_LEGAL"],
      // Rendered complete on the server (see trust): the legal text is in the HTML, not "Loading document…".
      ["state = { ready: false,", "state = { ready: true,"],
      ["vw: typeof window !== 'undefined' ? window.innerWidth : 1280", "vw: 1280"],
      ["effectiveLabel: d.effective ? fmt(d.effective) : 'On approval',", "effectiveLabel: d.effective ? fmt(d.effective) : '',"],
      ["window.addEventListener('scroll', this.onScroll, { passive: true });", "window.addEventListener('scroll', this.onScroll, { passive: true }); this.setState({ vw: window.innerWidth });"],
      // The design's data-rights form only simulated a request ("Simulation: in production this creates
      // request NX-…"). It now goes to privacy@noxtill.com through the public Legal forms API.
      [
        "const ref = 'NX-' + Math.random().toString(36).slice(2, 8).toUpperCase(); this.setState({ reqErr: false, reqDone: `Simulation: in production this creates request ${ref} and emails ${req.email.trim()} a verification link. We respond within the deadline the law sets for your region.` }); },",
        "const types = { access: 'Access my data', correct: 'Correct my data', delete: 'Delete my data', port: 'Get a portable copy', optout: 'Opt out of sale/sharing', limit: 'Limit use of sensitive data' }, rels = { visitor: 'Website visitor or prospect', customer: 'Noxtill account user', enduser: 'Customer of a business that uses Noxtill' }; this.setState({ reqErr: false, reqDone: 'Sending…' }); submitLegalForm({ route: 'privacy', fields: { email: req.email.trim(), requestType: types[req.type], relationship: rels[req.rel] }, page: location.pathname, gpc: !!this.gpc }).then(() => this.setState({ reqDone: `Request sent to privacy@noxtill.com. We will reply to ${req.email.trim()} to verify it is you, and respond within the deadline the law sets for your region.` }), () => this.setState({ reqDone: 'We could not send the request. Email privacy@noxtill.com instead and we will handle it from there.' })); },",
      ],
      // Saved choices are also recorded on Noxtill's servers (consent record), as the earlier cookie page did.
      [
        "    window.dispatchEvent(new CustomEvent('noxtill:consent', { detail: choices }));",
        "    window.dispatchEvent(new CustomEvent('noxtill:consent', { detail: choices }));\n    try { const dns = this.props.doc === 'do-not-sell'; recordConsent({ consentId: browserConsentId(), kind: dns ? 'do_not_sell_or_share' : 'cookie_preferences', policyVersion: '1.0', categories: dns ? undefined : { necessary: true, functional: !!choices.functional, analytics: !!choices.analytics, advertising: !!choices.marketing }, optedOut: dns ? !!choices.sale : undefined, language: navigator.language, source: location.pathname, gpc: !!this.gpc }).catch(() => {}); } catch (e) {}",
      ],
    ],
  },
};

// ── "final and approved" (owner, 2026-10-10): no draft / pending wording on the pages ──────────────
/** Trust hub: hero chip and each library card lose their draft status. */
function approvedTrust(tree) {
  let out = retext(tree, "Legal version 1.0 · updated October 10, 2026 · draft pending legal review", "Legal version 1.0 · updated October 10, 2026");
  out = retext(out, "v{{ d.version }} · Updated {{ d.updated }} · ", "v{{ d.version }} · Updated {{ d.updated }}");
  const status = find(out, (n) => n[0] === "span" && text(n).trim() === "{{ d.status }}");
  if (!status) throw new Error("trust card status not found");
  return without(out, status);
}
/** Legal Reader: the status row, the "Effective date: On approval" cell and the Status column go. */
function approvedReader(tree) {
  let out = tree;
  const drop = (pred, what) => {
    const n = find(out, pred);
    if (!n) throw new Error("legal reader: " + what + " not found");
    out = without(out, n);
  };
  drop((n) => n[0] === "div" && n[2].some((k) => typeof k !== "string" && k[0] === "dd" && text(k).trim() === "{{ doc.status }}"), "status row");
  drop((n) => n[0] === "div" && n[2].some((k) => typeof k !== "string" && k[0] === "dt" && text(k).trim() === "Effective date"), "effective date cell");
  drop((n) => n[0] === "th" && text(n).trim() === "Status", "Status column heading");
  drop((n) => n[0] === "td" && text(n).trim() === "{{ v.status }}", "Status column cell");
  return retext(out, " · Version {{ doc.version }} · {{ effectiveLabel }} · ", " · Version {{ doc.version }} · ");
}

/** (unused since the content was approved) "© 2026 Noxtill LLC. Draft legal content pending …" */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function legalFootnote(footer) {
  const p = find(footer[2], (n) => n[0] === "p" && /Draft legal content/.test(text(n)));
  if (!p) throw new Error("legal footnote not found");
  return ["div", { style: "max-width:1240px;margin:0 auto;padding:40px 20px 28px" }, [[p[0], { ...p[1], style: "margin:0;padding-top:16px;border-top:1px solid #E4ECE8;font-size:12px;color:#4B5B53" }, p[2]]]];
}
