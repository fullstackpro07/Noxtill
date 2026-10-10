// docs/Noxtill Pages — pages imported from the Claude Design project "Waiting on asset details".
// Key = route with "/" → "--" (top-level pages have no prefix). Each design carries its own older nav
// bar and footer; `stripChrome` removes them so every page uses the site-wide SiteHeader/SiteFooter.
// Pages with no Claude Design file: authored in the sibling pages' layout by
// scripts/marketing-dc/authored (build.js → pages/<key>.dc.html), converted like the rest.
/* eslint-disable @typescript-eslint/no-require-imports */
const authored = Object.fromEntries(
  require("fs")
    .readdirSync(require("path").join(__dirname, "../authored/pages"))
    .filter((f) => f.endsWith(".dc.html"))
    .map((f) => ["../../frontend/scripts/marketing-dc/authored/pages/" + f, f.replace(".dc.html", "")]),
);

// Striped boxes the designs left as labelled placeholders ("article image", "team / office photo"):
// each becomes a real picture that already exists under public/marketing, in the same box.
const txt = (n) => (typeof n === "string" ? n : n[2].map(txt).join(""));
function fillPlaceholders(tree, pictures) {
  let i = 0;
  const walk = (nodes) =>
    nodes.map((n) => {
      if (typeof n === "string") return n;
      const s = n[1].style || "";
      if (/repeating-linear-gradient/.test(s) && /monospace/.test(s)) {
        const pic = pictures[i++];
        if (!pic) throw new Error("no picture for placeholder: " + txt(n).trim());
        const size = (/(?:min-)?height:s*[^;]+/.exec(s) || ["height: 100%"])[0];
        return ["img", { src: "/marketing/" + pic[0], alt: pic[1], loading: "lazy", decoding: "async", style: "display: block; width: 100%; " + (size.startsWith("min-") ? "height: 100%; " : "") + size + "; object-fit: cover; object-position: " + (pic[2] || "center") + ";" }, []];
      }
      return [n[0], n[1], walk(n[2]), n[3]];
    });
  const out = walk(tree);
  if (i !== pictures.length) throw new Error("placeholders found: " + i + ", pictures given: " + pictures.length);
  return out;
}

module.exports = {
  src: "docs/Noxtill Pages",
  stripChrome: true,
  nxIcons: true,
  logic: true,
  // links to another design of this set resolve to that page's route without a linkMap entry
  autoLinks: true,
  // Five designs (Staff, Social, Unified Inbox, Run Several Locations, Track Customer Credit) set
  // `body { zoom: 0.75 }` on desktop; the owner wants pages at full size (2026-10-10).
  noZoom: true,
  // Per-page phone CSS appended after the design's own (scoped to .dcx by the converter).
  mobileCss: {
    // The design keeps three stat columns at every phone width; below 480px they collide.
    "platform--products-services": `@media (max-width: 480px) { [data-stats] { grid-template-columns: minmax(0, 1fr) !important; } }`,
    // The hero picture sits on a wrapper holding the whole page; show it whole, full width, at the top.
    "developers--api": `@media (min-width: 641px) { .r-hfull { background-size: 100% auto !important; background-position: center top !important; } }`,
    // Two insight cards per row (the design's phone rule) do not fit below ~420px.
    "platform--inventory": `@media (max-width: 420px) { [data-inscards] { grid-template-columns: minmax(0, 1fr) !important; } }`,
    // The donut + legend row is a fixed 361px wide; the legend drops under the donut on narrow phones.
    "platform--credit": `@media (max-width: 420px) { [style*="width:361px"] { flex-wrap: wrap !important; row-gap: 14px; } }`,
    // This design shrinks itself to 75% on desktop (body zoom), which left its hero narrower than the
    // sibling Solutions pages and short of the screen edge; render it at full size like them. The hero
    // picture is shown whole (the design frame cropped the top pin label). Stacked: gutters on both
    // sides, picture centred; on phones the third hero stat wraps to its own row without the divider.
    "solutions--run-several-locations": `@media (min-width: 1101px) { body { zoom: 1; } }
#rl-hero { aspect-ratio: 1312 / 1199 !important; height: auto !important; }
@media (max-width: 1100px) { main > section:first-child > [data-two] { padding: 0 28px 40px !important; gap: 12px !important; } #rl-hero { width: min(100%, 640px) !important; justify-self: center; border-radius: 22px; overflow: hidden; } }
@media (max-width: 640px) { main > section:first-child > [data-two] { padding: 0 20px 32px !important; } #rl-hero { border-radius: 16px; } [data-herostats] { row-gap: 20px !important; } [data-herostats] > li:nth-child(3) { padding-left: 0 !important; border-left: 0 !important; } }`,
  },
  // Review-card portraits: the designs' avatars were blurry 46–200px crops (one a logo, one empty), so
  // they are replaced with AI-generated portraits of people who do not exist
  // (thispersondoesnotexist.com), stored in public/marketing/np/avatars/. Keyed by image-slot id, or by
  // the published picture path for a plain <img>.
  imageOverrides: {
// slots the designs left empty (blank grey frames) — existing pictures
    "bk-qr-stand": "416e5d70-33d2-4b95-bdde-b92a819d8f14-mulr3qyb-2qes.png",
    "bk-reminder-photo": "pasted-1788939737334-0-mttsj3lw-866g.png",
    "beauty-appt-1": "avatars/ns.jpg",
    "beauty-appt-2": "avatars/rv.jpg",
    "beauty-appt-3": "avatars/ps.jpg",
    "beauty-appt-4": "avatars/so.jpg",
    "sc-badge-ayesha": "avatars/rv.jpg",
    "ad-25": "avatars/ad.jpg",
    "au-quote-av": "avatars/au.jpg",
    "ec-avatar": "avatars/ec.jpg",
    "ed-avatar": "avatars/ed.jpg",
    "ev-avatar": "avatars/ev.jpg",
    "hvac-avatar": "avatars/hv.jpg",
    "lc-avatar": "avatars/lc.jpg",
    "pc-avatar": "avatars/pc.jpg",
    "ps-quote-av": "avatars/ps.jpg",
    "plumb-avatar": "avatars/pl.jpg",
    "pm-avatar": "avatars/pm.jpg",
    "pp-avatar": "avatars/pp.jpg",
    "rv-avatar": "avatars/rv.jpg",
    "pf-avatar": "avatars/pf.jpg",
    "ns-avatar": "avatars/ns.jpg",
    "bl-testimonial": "avatars/bl.jpg",
    "cc2-testimonial": "avatars/cc.jpg",
    "/marketing/np/noxtill-is-an-ai-powered-business-manage-mu4dg0f6-adnd.jpg": "avatars/so.jpg",
  },
  pages: {
    // Industries — the 22 slugs the site header links to (/industries/<slug>)
    "Automotive-end.dc.html": "industries--automotive",
    "Auto Detailing-end.dc.html": "industries--auto-detailing",
    "Car Washes-end.dc.html": "industries--car-washes",
    "Beauty and Personal Care-end.dc.html": "industries--beauty-personal-care",
    "Coworking Spaces-icon remaining.dc.html": "industries--coworking-spaces",
    "E-commerce and Dropshipping-End.dc.html": "industries--ecommerce-dropshipping",
    "Education and Training-end.dc.html": "industries--education-training",
    "Electrical Contractors-end.dc.html": "industries--electrical-contractors",
    "Equipment Rental-end.dc.html": "industries--equipment-rental",
    "Events and Creative-end.dc.html": "industries--events-creative",
    "Fitness and Wellness-end.dc.html": "industries--fitness-wellness",
    "HVAC Companies-end.dc.html": "industries--hvac",
    "Healthcare and Clinics-end.dc.html": "industries--healthcare-clinics",
    "Home and Field Services-END.dc.html": "industries--home-field-services",
    "Landscaping and Lawn Care-end.dc.html": "industries--landscaping-lawn-care",
    "Pest Control-End.dc.html": "industries--pest-control",
    "Pet Services-end.dc.html": "industries--pet-services",
    "Plumbing Companies-end.dc.html": "industries--plumbing",
    "Property Management-end.dc.html": "industries--property-management",
    "Real Estate and Property-end.dc.html": "industries--real-estate-property",
    "Restaurants and Food-end.dc.html": "industries--restaurants-food",
    "Retail and Local Commerce-end.dc.html": "industries--retail-local-commerce",
    // Solutions (needs)
    "Reduce No-Shows-end.dc.html": "solutions--reduce-no-shows",
    "Collect More Reviews-end.dc.html": "solutions--collect-more-reviews",
    "Know Your Real Profit-end.dc.html": "solutions--know-your-real-profit",
    "Bring Paper Records In-end.dc.html": "solutions--bring-paper-records-in",
    "Run Several Locations-end.dc.html": "solutions--run-several-locations",
    "Track Customer Credit-done.dc.html": "solutions--track-customer-credit",
    // Platform modules
    "Platform.dc.html": "platform",
    "Fast Sale-end.dc.html": "platform--fast-sale",
    "Orders-end.dc.html": "platform--orders",
    "Products and Services-end.dc.html": "platform--products-services",
    "Inventory-end.dc.html": "platform--inventory",
    "Bookings.dc.html": "platform--bookings",
    "CRM.dc.html": "platform--crm",
    "Reviews and Reputation v2-end.dc.html": "platform--reviews-reputation",
    "Marketing and Campaigns-end.dc.html": "platform--marketing-campaigns",
    "Business Listings-End.dc.html": "platform--business-listings",
    "Customer Credit v2-End.dc.html": "platform--credit",
    ...authored,
    "Unified Inbox-done.dc.html": "platform--unified-inbox",
    "Staff and Commissions-Done.dc.html": "platform--staff",
    "Social and Advertising-DONE.dc.html": "platform--social-media",
    "Profit and Loss-end.dc.html": "platform--profit-analytics",
    "Reports-End.dc.html": "platform--reports",
    "Integrations.dc.html": "platform--integrations",
    "Automation.dc.html": "platform--automations-workflows",
    "Nightly Close-End.dc.html": "nightly-close",
    // AI
    "Business Assistant-End.dc.html": "ai--assistant",
    "AI Phone Receptionist-end.dc.html": "ai--phone-receptionist",
    "Photo Digitizer-end.dc.html": "ai--photo-digitizer",
    "AI Insights-end.dc.html": "ai--insights-recommendations",
    // Free tools
    "Business Health Check-end.dc.html": "tools--business-health-check",
    "Business Health Score-END.dc.html": "tools--business-health-score",
    "No-Show Cost Calculator-end.dc.html": "tools--no-show-cost-calculator",
    "Profit Margin Calculator-end.dc.html": "tools--profit-margin-calculator",
    "QR Code Generator-end.dc.html": "tools--qr-code-generator",
    "Review Response Generator-end.dc.html": "tools--review-response-generator",
    // Resources & support
    "Resources.dc.html": "resources",
    "Help Centre.dc.html": "help",
    "Contact Support-end.dc.html": "support",
    "Getting Started Guide-end.dc.html": "getting-started",
    "Product Updates-end.dc.html": "product-updates",
    "Roadmap-end.dc.html": "roadmap",
    "API Reference-end.dc.html": "developers--api",
    "Developer Docs-end.dc.html": "developers--docs",
    // Company & product pages
    // "Pricing.dc.html" is superseded by docs/Noxtill pricing page built (set "pp") at /pricing.
    "Contact.dc.html": "contact",
    "Book a Demo-end.dc.html": "book-a-demo",
    "Features.dc.html": "features",
    "Email.dc.html": "email",
    "Files.dc.html": "files",
  },
  /** Exact-string patches applied to a page's component logic (see the report in the PR/summary). */
  /**
   * The designs link to each other by file name ("Contact.dc.html"). Each name → the site route that
   * page lives at (or, for designs not built as pages, the closest real page). Unmapped names fail
   * the conversion so no link can silently 404.
   */
  linkMap: {
    "Noxtill Homepage": "/",
    Platform: "/platform",
    Features: "/features",
    Integrations: "/platform/integrations",
    Reports: "/platform/reports",
    Inventory: "/platform/inventory",
    Bookings: "/platform/bookings",
    Orders: "/platform/orders",
    "Fast Sale": "/platform/fast-sale",
    Sales: "/platform/fast-sale",
    "Products and Services": "/platform/products-services",
    CRM: "/platform/crm",
    Customers: "/platform/crm",
    "Customer Credit": "/platform/credit",
    "Profit and Loss": "/platform/profit-analytics",
    Marketing: "/platform/marketing-campaigns",
    "Marketing and Campaigns": "/platform/marketing-campaigns",
    "Reviews and Reputation": "/platform/reviews-reputation",
    "Unified Inbox": "/platform/unified-inbox",
    "WhatsApp AI": "/platform/unified-inbox",
    Automation: "/platform/automations-workflows",
    "AI Assistant": "/ai/assistant",
    "AI Insights": "/ai/insights-recommendations",
    Solutions: "/solutions",
    "QR Code Generator": "/tools/qr-code-generator",
    "Profit Margin Calculator": "/tools/profit-margin-calculator",
    "Review Response Generator": "/tools/review-response-generator",
    "No-Show Cost Calculator": "/tools/no-show-cost-calculator",
    "Business Health Score": "/tools/business-health-score",
    Resources: "/resources",
    "Help Centre": "/help",
    "Video Tutorials": "/help",
    Community: "/support",
    "Contact Support": "/support",
    "Getting Started Guide": "/getting-started",
    "Product Updates": "/product-updates",
    Roadmap: "/roadmap",
    "API Reference": "/developers/api",
    "Developer Docs": "/developers/docs",
    "Case Studies": "/resources/case-studies",
    // older file names of pages rebuilt from newer designs
    "Social and Advertising-end": "/platform/social-media",
    "Staff and Commissions-End": "/platform/staff",
    "Track Customer Credit-end": "/solutions/track-customer-credit",
    "Unified Inbox-end": "/platform/unified-inbox",
    "See All 300 Business Types": "/solutions",
    About: "/about",
    "Noxtill Homepage": "/",
    Pricing: "/pricing",
    Contact: "/contact",
  },
  transform: {
    resources: (tree) =>
      fillPlaceholders(tree, [
        ["np/pasted-1788938876908-0-mtts0npb-403t.png", "Paper records beside a laptop showing the same records in Noxtill"],
        ["np/pasted-1789717781326-0-mu6nra83-25b2.png", "Checking stock on a phone in a storeroom"],
        ["np/slots/cc2-khata.webp", "A handwritten customer credit ledger"],
        ["np/ai-powered-business-health-checker-muloy4wo-ed0o.png", "A business health score on a laptop", "left center"],
        ["np/assets/noshows/flow.jpg", "Booking, reminder and confirmation steps"],
        ["hb/slots/ai-card-ai-agents-workflows.webp", "An automation workflow with an approval step", "top"],
        ["hb/slots/stack-img-2.webp", "The Unified Inbox with conversations from several channels", "top"],
        ["np/pasted-1788936227392-0-mttqfvbe-r059.png", "A profit overview with margin by product", "top"],
        ["np/pasted-1788931483207-0-mttnm6op-ksii.png", "Four branches of the same business"],
      ]),
    contact: (tree) => fillPlaceholders(tree, [["np/pasted-1789583610843-0-mu4fvjmo-ij65.png", "A small team working together in a shared office"]]),
  },
  logicImports: {
    contact: ['import { submitDemoRequest } from "@/components/site/dc/dc-forms";'],
    help: ['import { runHelpSearch } from "@/components/site/dc/dc-forms";'],
  },
  logicPatches: {
    // The design's demo-request form only pretended to send ("Demo form — no data is submitted").
    // It now goes to the sales inbox through the public forms API; copy reflects the real outcome.
    contact: [
      ["state = { menu: false, sent: false };", "state = { menu: false, sent: false, sending: false, error: '' };"],
      [
        "submitLabel: this.state.sent ? 'Request received' : 'Book a Demo',",
        "submitLabel: this.state.sent ? 'Request received' : this.state.sending ? 'Sending…' : 'Book a Demo',",
      ],
      [
        "? 'Thanks — this is a demo form, so nothing was actually sent.'\n        : 'We reply within one business day. Demo form — no data is submitted.',",
        "? 'Thanks — your request reached our team. We reply within one business day.'\n        : this.state.error || 'We reply within one business day.',",
      ],
      [
        "onSubmit: (e) => { e.preventDefault(); this.setState({ sent: true }); }",
        "onSubmit: (e) => { e.preventDefault(); if (this.state.sending || this.state.sent) return; const form = e.currentTarget; this.setState({ sending: true, error: '' }); submitDemoRequest(form, '/contact').then((r) => this.setState(r.ok ? { sending: false, sent: true } : { sending: false, error: r.message })); }",
      ],
    ],
    // The design's search box did nothing (preventDefault only); it now filters the page's help topics.
    help: [["onSubscribe: (e) => { e.preventDefault(); }", "onSubscribe: (e) => { e.preventDefault(); runHelpSearch(e.currentTarget); }"]],
    // A ticking clock initialised at render time would differ between server and client markup.
    "nightly-close": [["state = { t: new Date() };", "state = { t: new Date(2026, 0, 1, 21, 0, 0) };"], ["  componentDidMount() {\n", "  componentDidMount() {\n    this.setState({ t: new Date() });\n"]],
  },
};
