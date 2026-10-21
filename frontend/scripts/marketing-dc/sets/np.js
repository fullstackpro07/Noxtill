// docs/Noxtill Pages — pages imported from the Claude Design project "Waiting on asset details".
// Key = route with "/" → "--" (top-level pages have no prefix). Each design carries its own older nav
// bar and footer; `stripChrome` removes them so every page uses the site-wide SiteHeader/SiteFooter.
// Pages with no Claude Design file: authored in the sibling pages' layout by
// scripts/marketing-dc/authored (build.js → pages/<key>.dc.html), converted like the rest.
/* eslint-disable @typescript-eslint/no-require-imports */
const featureHero = require("./np-feature-hero");
// Business Listings hero: the background picture has an empty card drawn at the end of each dashed
// line, but the coded badges were pixel-placed in three different containers and missed them. Move the
// badges into one layer over the picture and centre each on its card (measured from the picture, % of
// its size — the hero takes the picture's proportions on desktop). Below 1101px they form a row.
const LISTING_SPOTS = { Yelp: [35.4, 31.15], "Bing Places": [35.4, 55.88], "Google Business Profile": [81.6, 27.47], "Apple Maps": [81.57, 54.61], Facebook: [56.25, 81.35] };
function placeListingBadges(tree) {
  const isEl = (n) => Array.isArray(n);
  const text = (n) => (typeof n === "string" ? n : isEl(n) ? n[2].map(text).join("") : "");
  let section = null;
  const findSec = (nodes) => nodes.forEach((n) => { if (!isEl(n) || section) return; if (n[0] === "section" && /background:[^;]*url/.test(n[1].style || "")) section = n; else findSec(n[2]); });
  findSec(tree);
  if (!section) return tree;
  const badges = [];
  const pull = (nodes) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!isEl(n)) continue;
      const name = Object.keys(LISTING_SPOTS).find((k) => /position:\s*absolute/.test(n[1].style || "") && text(n).replace(/\s+/g, " ").trim().startsWith(k));
      if (name) { badges.unshift([name, n]); nodes.splice(i, 1); } else pull(n[2]);
    }
  };
  pull(section[2]);
  for (const [name, n] of badges) {
    const [x, y] = LISTING_SPOTS[name];
    const st = (n[1].style || "").replace(/(^|;)\s*(position|left|right|top|bottom|transform)\s*:[^;]*/g, "");
    n[1] = { ...n[1], "data-blspot": name, style: `${st}; --x: ${x}%; --y: ${y}%` };
  }
  section[1] = { ...section[1], style: (section[1].style || "") + "; position: relative" };
  section[2].push(["div", { "data-blbadges": "1" }, badges.map(([, n]) => n)]);
  return tree;
}

// Icons the designs supplied as small, soft raster pictures (owner review: "blurry icons"), redrawn as
// the site's own vector icons (nx-icon) in the same colour on the same tint: src → [icon, ink, tint, shape].
// shape: "circle" | "square" (rounded tile) | "solid" (white glyph on the ink colour) | "ring".
const A = "/marketing/np/assets/";
const RASTER_ICONS = {
  [A + "ai-phone/i-step-1.jpg"]: ["phone", "#039f6f", "#E3F5EA", "circle"],
  [A + "ai-phone/i-step-2.jpg"]: ["settings", "#21b481", "#E3F5EA", "circle"],
  [A + "ai-phone/i-step-3.jpg"]: ["brain", "#21b481", "#E3F5EA", "circle"],
  [A + "ai-phone/i-step-4.jpg"]: ["bar-chart", "#10b882", "#E3F5EA", "circle"],
  [A + "help/icon-1.png"]: ["sparkles", "#eb3944", "#fcedee", "square"],
  [A + "help/icon-2.png"]: ["cart", "#22b27e", "#e5fcf4", "square"],
  [A + "help/icon-3.png"]: ["users", "#18a6fd", "#e2f6fe", "square"],
  [A + "help/icon-4.png"]: ["calendar", "#6b35fb", "#efeafe", "square"],
  [A + "help/icon-5.png"]: ["box", "#1aab75", "#e0fcf3", "square"],
  [A + "help/icon-6.png"]: ["card", "#1e74fd", "#e7f1fe", "square"],
  [A + "help/icon-7.png"]: ["whatsapp", null, "#d7fcf1", "square"],
  [A + "help/icon-8.png"]: ["megaphone", "#ea323e", "#fce9ea", "square"],
  [A + "help/icon-9.png"]: ["bar-chart", "#09a06d", "#d9fdf2", "square"],
  [A + "help/icon-10.png"]: ["settings", "#2178fd", "#e7f1fe", "square"],
  [A + "help/sup-1.png"]: ["chat-dots", "#22aa7a", "#e3faf2", "square"],
  [A + "help/sup-2.png"]: ["mail", "#2578fd", "#e9f2fe", "square"],
  [A + "help/sup-3.png"]: ["phone", "#0ba974", "#e3faf2", "square"],
  [A + "help/sup-4.png"]: ["users", "#2ba1fd", "#dff4fe", "square"],
  [A + "suite/i-mod-1.png"]: ["cart", "#429961", "#eaf4ec", "circle"],
  [A + "suite/i-mod-2.png"]: ["box", "#4c8bdd", "#e4eefa", "circle"],
  [A + "suite/i-mod-3.png"]: ["calendar", "#8857dc", "#f0ebfb", "circle"],
  [A + "suite/i-mod-4.png"]: ["user-plus", "#459a65", "#ecf5ed", "circle"],
  [A + "suite/i-mod-5.png"]: ["card", "#f89651", "#fdece0", "circle"],
  [A + "suite/i-mod-6.png"]: ["wallet", "#3ea3a2", "#e8f5f4", "circle"],
  [A + "suite/i-mod-7.png"]: ["package", "#4a9861", "#ebf6ed", "circle"],
  [A + "suite/i-mod-8.png"]: ["chat-dots", "#4d8ce0", "#ecf2fa", "circle"],
  [A + "suite/i-mod-9.png"]: ["megaphone", "#e5628f", "#fceff4", "circle"],
  [A + "suite/i-mod-10.png"]: ["bar-chart", "#f0a63a", "#fdf7eb", "circle"],
  [A + "profit/i-drv-1.png"]: ["dollar", "#3d9768", "#eaf4ec", "circle"],
  [A + "profit/i-drv-2.png"]: ["cart", "#936cdb", "#f1ebfb", "circle"],
  [A + "profit/i-drv-3.png"]: ["wallet", "#5998e8", "#e8f1fb", "circle"],
  [A + "profit/i-drv-4.png"]: ["pie-chart", "#fb9e57", "#feefe5", "circle"],
  [A + "profit/i-drv-5.png"]: ["bar-chart", "#46976b", "#eaf4ed", "circle"],
  [A + "health/i-cta-shield.jpg"]: ["shield", "#017148", null, "solid"],
  "/marketing/np/pasted-1789017437556-0-mtv2shhh-c3us.png": ["file", "#05b869", null, "solid"],
  "/marketing/np/pasted-1789673317440-0-mu5xa9mw-acmm.png": ["heart", "#0c9d66", "#FFFFFF", "ring"],
};
function replaceRasterIcons(tree) {
  const walk = (nodes) => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!Array.isArray(n)) continue;
      const hit = (n[0] === "img" || n[0] === "image-slot") && RASTER_ICONS[n[1].src];
      if (!hit) { walk(n[2]); continue; }
      const [name, ink, tint, shape] = hit;
      const st = n[1].style || "";
      const w = +(/(?:^|;)\s*width:\s*(\d+)px/.exec(st) || [])[1] || 40;
      const h = +(/(?:^|;)\s*height:\s*(\d+)px/.exec(st) || [])[1] || w;
      const d = Math.min(w, h);
      const keep = st.replace(/(^|;)\s*(background(-color)?|border-radius|border|width|height)\s*:[^;]*/g, "");
      const radius = shape === "square" ? Math.round(d * 0.26) + "px" : "50%";
      const bg = shape === "solid" ? ink : tint;
      const box = `${keep}; width: ${d}px; height: ${d}px; display: inline-flex; align-items: center; justify-content: center; flex: none; border-radius: ${radius}; background: ${bg};${shape === "ring" ? ` border: 2px solid ${ink};` : ""}`;
      const g = Math.round(d * (name === "whatsapp" ? 0.62 : 0.5));
      const icon = ["nx-icon", { name, size: String(g), stroke: d <= 30 ? "2" : "1.9", ...(ink ? { color: shape === "solid" ? "#FFFFFF" : ink } : {}), radius: name === "whatsapp" ? "12" : undefined }, []];
      if (!icon[1].radius) delete icon[1].radius;
      nodes[i] = ["span", { "aria-hidden": "true", "data-vicon": name, style: box.replace(/^;\s*/, "") }, [icon]];
    }
  };
  walk(tree);
  return tree;
}

// Per-page fixes appended to a page's CSS (owner review).
const PAGE_CSS = {
  // the hero box was drawn 1700px wide with a centred cover image: below that width the image's right
  // side (the Delivered step and card) ran off-screen. Fit the box and keep the image anchored right.
  "platform--business-listings": `@media (min-width: 1101px) { .dcx [data-blbadges] { position: absolute; inset: 0; pointer-events: none; } .dcx [data-blbadges] > * { position: absolute !important; left: var(--x); top: var(--y); transform: translate(-50%, -50%); pointer-events: auto; white-space: nowrap; } } @media (max-width: 1100px) { .dcx [data-blbadges] { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 18px 0 8px; } .dcx [data-blbadges] > * { position: static !important; } }`,
  "platform--orders": `@media (min-width: 1025px) { .dcx .r-bgl.r-hfull { width: 100% !important; background-position: right center !important; } } @media (min-width: 1025px) and (max-width: 1540px) { .dcx .r-bgl.r-hfull { background-size: 100% auto !important; grid-template-columns: minmax(0, 400px) minmax(0, 1fr) !important; padding-left: 32px !important; } .dcx .r-bgl.r-hfull [data-hfeat] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; row-gap: 18px !important; } }`,
};
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
    // Feature pages hot-link Pexels photos; served from public/marketing/np/features instead.
    ...require("./np-feature-images.json"),
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
    // Feature pages (footer "Everything Your Business Needs"), one per module feature, at /features/<slug>
    "AI Call Answering.dc.html": "features--ai-call-answering",
    "Missed Call Recovery.dc.html": "features--missed-call-recovery",
    "Call Transfer and Routing.dc.html": "features--call-transfer-routing",
    "Auto Dialer and Power Dialer.dc.html": "features--auto-dialer-power-dialer",
    "IVR and Call Menus.dc.html": "features--ivr-call-menus",
    "Call Analytics.dc.html": "features--call-analytics",
    "Lead Management.dc.html": "features--lead-management",
    "Sales Pipeline.dc.html": "features--sales-pipeline",
    "Customer 360.dc.html": "features--customer-360",
    "Follow-ups and Reminders.dc.html": "features--follow-ups-reminders",
    "Segmentation.dc.html": "features--segmentation",
    "Loyalty and Memberships.dc.html": "features--loyalty-memberships",
    "Online Booking.dc.html": "features--online-booking",
    "Appointment Calendar.dc.html": "features--appointment-calendar",
    "Staff Availability.dc.html": "features--staff-availability",
    "Automated Reminders.dc.html": "features--automated-reminders",
    "Rescheduling.dc.html": "features--rescheduling",
    "Booking Management.dc.html": "features--booking-management",
    "WhatsApp Inbox.dc.html": "features--whatsapp-inbox",
    "SMS Inbox.dc.html": "features--sms-inbox",
    "Email Inbox.dc.html": "features--email-inbox",
    "Instagram and Messenger.dc.html": "features--instagram-messenger",
    "AI Reply Drafting.dc.html": "features--ai-reply-drafting",
    "Team Assignment.dc.html": "features--team-assignment",
    "Workflow Builder.dc.html": "features--workflow-builder",
    "AI Agents and Workflows.dc.html": "features--ai-agents-workflows",
    "Triggers and Actions.dc.html": "features--triggers-actions",
    "Scheduled Workflows.dc.html": "features--scheduled-workflows",
    "Webhook Automation.dc.html": "features--webhook-automation",
    "Approval Workflows.dc.html": "features--approval-workflows",
    "SEO Audits.dc.html": "features--seo-audits",
    "Keyword Tracking.dc.html": "features--keyword-tracking",
    "Content Optimization.dc.html": "features--content-optimization",
    "Technical SEO.dc.html": "features--technical-seo",
    "Local SEO.dc.html": "features--local-seo",
    "SEO Performance.dc.html": "features--seo-performance",
    "Review Management.dc.html": "features--review-management",
    "Review Requests.dc.html": "features--review-requests",
    "AI Review Replies.dc.html": "features--ai-review-replies",
    "Reputation Monitoring.dc.html": "features--reputation-monitoring",
    "Review Analytics.dc.html": "features--review-analytics",
    "Customer Feedback.dc.html": "features--customer-feedback",
    "Quick Checkout.dc.html": "features--quick-checkout",
    "Barcode Scanning.dc.html": "features--barcode-scanning",
    "Payment Methods.dc.html": "features--payment-methods",
    "Receipts and Invoices.dc.html": "features--receipts-invoices",
    "Discounts and Promotions.dc.html": "features--discounts-promotions",
    "Sales History.dc.html": "features--sales-history",
    "Work Orders.dc.html": "features--work-orders",
    "Dispatch Board.dc.html": "features--dispatch-board",
    "Technician Scheduling.dc.html": "features--technician-scheduling",
    "Service Calendar.dc.html": "features--service-calendar",
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
  // /features/*: the site's palette and its text-left / visual-right hero (sets/np-feature-hero.js).
  transformAll: (key, tree) => featureHero.featurePages(key, replaceRasterIcons(tree)),
  cssTransform: (key, css) => (key.startsWith("features--") ? featureHero.recolor(css) + featureHero.MOBILE_CSS.replace("{ [data-fhero]", "{ .dcx [data-fhero]") + featureHero.scaleCss(key.slice("features--".length)) + featureHero.FEATURE_CSS : css) + (PAGE_CSS[key] || ""),
  logicTransform: (key, body) => (key.startsWith("features--") ? featureHero.recolor(body) : body),
  transform: {
    resources: (tree) =>
      fillPlaceholders(tree, [
        ["np/pasted-1788938876908-0-mtts0npb-403t.png", "Paper records beside a laptop showing the same records in Noxtill"],
        ["np/pasted-1789717781326-0-mu6nra83-25b2.png", "Checking stock on a phone in a storeroom"],
        ["np/slots/cc2-khata.webp", "A handwritten customer credit ledger"],
        ["np/ai-powered-business-health-checker-muloy4wo-ed0o.png", "A business health score on a laptop", "left center"],
        ["np/assets/noshows/flow.jpg", "Booking, reminder and confirmation steps"],
        ["hb/slots/ai-card-ai-agents-workflows.png", "An automation workflow with an approval step", "top"],
        ["hb/slots/stack-img-2.png", "The Unified Inbox with conversations from several channels", "top"],
        ["np/pasted-1788936227392-0-mttqfvbe-r059.png", "A profit overview with margin by product", "top"],
        ["np/pasted-1788931483207-0-mttnm6op-ksii.png", "Four branches of the same business"],
      ]),
    contact: (tree) => fillPlaceholders(tree, [["np/pasted-1789583610843-0-mu4fvjmo-ij65.png", "A small team working together in a shared office"]]),
    "platform--business-listings": placeListingBadges,
    // The small "High Risk" alert card (292×258) was the whole section's background, stretched to 1500px
    // and blurred behind the text. It goes into the empty 235px column drawn for it beside the list.
    "tools--business-health-score": (tree) => {
      const SRC = "/marketing/np/f8cae583-06ec-48c7-b5a7-36623b5309c3-mu5wu2e9-qz49.png";
      const walk = (nodes) => nodes.forEach((n) => {
        if (!Array.isArray(n)) return;
        if ((n[1].style || "").includes(SRC)) {
          n[1] = { ...n[1], style: n[1].style.replace(/background:\s*url\([^)]*\)[^;]*;?/, ""), className: (n[1].className || "").replace(/\br-(bgl|hfull)\b/g, "").trim() };
          const card = n[2].find(Array.isArray)?.[2].find(Array.isArray);
          if (card) card[2].push(["div", { style: "display: flex; align-items: center; justify-content: center; padding: 24px 22px 24px 0;" }, [["img", { src: "/marketing/np/features/high-risk-alert-card.png", alt: "High risk alert: outstanding credit is 28% higher than the industry average", width: "552", height: "492", loading: "lazy", style: "display: block; width: 100%; max-width: 235px; height: auto; border-radius: 14px; box-shadow: 0 18px 40px -24px rgba(10,19,48,.35);" }, []]]]);
          return;
        }
        walk(n[2]);
      });
      walk(tree);
      return tree;
    },
    // the review picture without its empty dark left side (owner review)
    "ai--reply-drafting": (tree) => {
      const swap = (nodes) => nodes.forEach((n) => { if (!Array.isArray(n)) return; if (n[0] === "img" && n[1].src === "/marketing/np/review-response-generator-for-small-busi-muloc3ew-foui.png") n[1] = { ...n[1], src: "/marketing/agents/support-review-replies.png", style: (n[1].style || "").replace(/object-position:[^;]*;?/, "object-position: center;") }; swap(n[2]); });
      swap(tree);
      return tree;
    },
    // the devices picture without its empty left half (owner review)
    "platform--dashboard": (tree) => {
      const swap = (nodes) => nodes.forEach((n) => { if (!Array.isArray(n)) return; if (n[0] === "img" && n[1].src === "/marketing/hb/run-your-entire-business-in-one-connecte-muxgs6oj-w72n.png") n[1] = { ...n[1], src: "/marketing/np/features/dashboard-devices.png" }; swap(n[2]); });
      swap(tree);
      return tree;
    },
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
