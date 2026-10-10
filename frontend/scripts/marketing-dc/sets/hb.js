// docs/Noxtill Header Build — site header, Home, Blog, /platform and /ai landing pages.
module.exports = {
  src: "docs/Noxtill Header Build",
  stripChrome: false,
  /** Page-specific small-screen fixes, appended after the design's CSS (scoped to .dcx). */
  mobileCss: {
    // Home hero: once its columns stack (≤1100px) the text column loses the background picture and the visual "stage"
    // (with its floating status cards) shows the devices part of it, as the design composes it.
    home: `@media (max-width: 1100px) {
      section[aria-labelledby="hero-h"] .r-bgl { background-image: none !important; padding-bottom: 0 !important; }
      section[aria-labelledby="hero-h"] [style*="container-type:inline-size"] {
        background: url("/marketing/hb/run-your-entire-business-in-one-connecte-muxgs6oj-w72n.png") 100% 55% / 149% auto no-repeat;
      }
    }
    @media (max-width: 640px) {
      /* Integrations benefits: one left-aligned list instead of centred items with column dividers. */
      section[aria-labelledby="int2-h"] > div:nth-of-type(2) { padding: 0 24px !important; row-gap: 14px !important; }
      section[aria-labelledby="int2-h"] > div:nth-of-type(2) > div { flex: 1 1 100% !important; justify-content: flex-start !important; border-left: 0 !important; }
      section[aria-labelledby="int2-h"] > div:nth-of-type(2) > div > div { padding: 0 !important; }
      /* Module stack calls-to-action: a compact label so long module names fit inside the pill. */
      section[aria-labelledby="stack-h"] article a[style*="height:52px"] {
        font-size: 14px !important; letter-spacing: .01em !important; line-height: 1.3 !important;
        gap: 14px !important; padding: 12px 22px !important; text-align: left !important;
      }
      /* AI carousel cards: the product name and its badge share the narrow header. */
      section[aria-labelledby="ai-h"] article h3 { font-size: 17px !important; line-height: 1.25 !important; }
      section[aria-labelledby="ai-h"] article { padding: 20px !important; }
      section[aria-labelledby="ai-h"] [aria-roledescription="carousel"] > div:last-child { flex-wrap: nowrap !important; gap: 10px !important; }
    }
    @media (max-width: 860px) {
      /* AI Receptionist phone sits centred under its photos once the columns stack. */
      section[aria-labelledby="rec-h"] [aria-live] { margin: 0 auto !important; }
      /* Outcome screenshot: the screenshot (always laid over the coded demo panels) becomes the frame's
         only content, so the image slot can size the frame to the whole picture. */
      section[aria-labelledby="o-h"] [role="img"] > div:nth-child(2) { padding: 0 !important; min-height: 0 !important; }
      section[aria-labelledby="o-h"] [role="img"] > div:nth-child(2) > div[style*="position:absolute"] { position: relative !important; inset: auto !important; height: 100% !important; }
      section[aria-labelledby="o-h"] [role="img"] > div:nth-child(2) > div:not([style*="position:absolute"]) { display: none !important; }
      /* AI cards keep their two short "understands / can do" columns. */
      section[aria-labelledby="ai-h"] article .r-g2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; }
    }`,
  },
  // Image slots the designs left empty (they rendered as blank grey frames): filled with fitting
  // pictures that already exist under public/marketing.
  imageOverrides: {
    "blog-card-ai-receptionist-for-small-business": "/marketing/np/ai-phone-receptionist-for-businesses-24--muiymuyy-79tq.png",
    "b1-hero": "/marketing/np/ai-phone-receptionist-for-businesses-24--muiymuyy-79tq.png",
    "b1-compliance": "/marketing/np/3a69923f-05cf-4f11-8277-9cac4fba205a-mulq83zq-81kw.png",
    "blog-card-small-business-automation-ideas": "/marketing/hb/slots/outcome-screen-auto.webp",
    "b2-hero": "/marketing/hb/slots/outcome-screen-auto.webp",
    "b2-split": "/marketing/np/assets/noshows/flow.jpg",
    "blog-card-all-in-one-business-software-small-business": "/marketing/np/business-software-integrations-mu5yrgs8-5hgf.png",
    "b3-hero": "/marketing/np/business-software-integrations-mu5yrgs8-5hgf.png",
    "b3-retail": "/marketing/np/pasted-1789728784649-0-mu6ub4ew-7rxo.png",
    "b3-hvac": "/marketing/np/pasted-1789098582413-0-mtwf3p9z-hk8t.png",
    "b3-salon": "/marketing/np/pasted-1790457847416-0-muiwdguo-pmeo.png",
    "b3-auto": "/marketing/np/smarter-auto-business-operations--mu3rc8nr-ytaq.png",
  },
  pages: {
    "NoxtillHeader.dc.html": "header",
    "Noxtill Home.dc.html": "home",
    "Blog.dc.html": "blog",
    "Blog - AI Receptionist.dc.html": "blog--ai-receptionist-for-small-business",
    "Blog - All-in-One Software.dc.html": "blog--all-in-one-business-software-small-business",
    "Blog - Automation Ideas.dc.html": "blog--small-business-automation-ideas",
    "Assets - Maintenance.dc.html": "platform--assets-maintenance",
    "Customer Portal.dc.html": "platform--customer-portal",
    "Documents - eSign.dc.html": "platform--documents-esign",
    "Field Service.dc.html": "platform--field-service",
    "Finance - Accounting.dc.html": "platform--finance-accounting",
    "Helpdesk.dc.html": "platform--helpdesk",
    "Payments - Billing.dc.html": "platform--payments-billing",
    "People - Payroll.dc.html": "platform--people-payroll",
    "Procurement.dc.html": "platform--procurement",
    "Website - Commerce.dc.html": "platform--website-commerce",
    "Autonomous Commerce.dc.html": "ai--autonomous-commerce",
    "Business Intelligence.dc.html": "ai--business-intelligence",
    "SEO Autopilot.dc.html": "ai--seo-autopilot",
  },
};
