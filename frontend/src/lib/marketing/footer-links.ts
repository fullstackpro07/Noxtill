/**
 * Footer link data — the five link columns and bottom legal shortcuts of
 * docs/Legal pages/SiteFooter.dc.html. The design links to noxtill.com paths; each maps to the
 * site's real route. Items with no page yet (API Docs, Community) point at /resources, the same
 * convention the header nav uses; Careers and Partners route to the matching Contact form.
 */

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Product Overview", href: "/product" },
      { label: "Explore Platform", href: "/product#nightly-close" },
      { label: "Pricing", href: "/pricing" },
      { label: "Integrations", href: "/integrations-directory" },
      { label: "AI & Automation", href: "/ai" },
      { label: "What's New", href: "/resources/product-updates" },
      { label: "Roadmap", href: "/resources/roadmap" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Small Business", href: "/solutions" },
      { label: "Multi-Location", href: "/solutions/several-locations" },
      { label: "Sales & Commerce", href: "/product/fast-sale" },
      { label: "Customers & Communication", href: "/product/inbox" },
      { label: "Marketing & Growth", href: "/product/marketing" },
      { label: "Finance & Operations", href: "/product/pnl" },
      { label: "Workforce Management", href: "/product/staff" },
      { label: "By Industry", href: "/solutions#navigator" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "/resources/help-centre" },
      { label: "Guides", href: "/resources/getting-started-guide" },
      { label: "Blog", href: "/resources/blog" },
      { label: "API Docs", href: "/resources" },
      { label: "Product Updates", href: "/resources/product-updates" },
      { label: "Status", href: "/status" },
      { label: "Community", href: "/resources" },
      { label: "Contact Support", href: "/contact#support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Careers", href: "/contact#general" },
      { label: "Partners & Referrals", href: "/contact#sales" },
      { label: "Book a Demo", href: "/contact#sales" },
      { label: "Company Information", href: "/legal/company" },
    ],
  },
  {
    title: "Legal & Trust",
    links: [
      { label: "Legal Center", href: "/legal" },
      { label: "Trust Center", href: "/trust" },
      { label: "Product & Service-Specific Terms", href: "/legal/product-terms" },
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Security", href: "/trust/security" },
      { label: "AI Transparency", href: "/legal/ai-transparency" },
      { label: "Messaging & Consent", href: "/legal/messaging-consent" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "Subprocessors", href: "/trust/subprocessors" },
      { label: "Accessibility", href: "/legal/accessibility" },
    ],
  },
];

export const FOOTER_BOTTOM: FooterLink[] = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Refunds", href: "/legal/refunds" },
  { label: "Cookie Settings", href: "/legal/cookies#preferences" },
  { label: "Privacy Choices", href: "/contact#privacy" },
  { label: "Do Not Sell or Share My Personal Information", href: "/legal/do-not-sell" },
  { label: "Security", href: "/trust/security" },
  { label: "Accessibility", href: "/legal/accessibility" },
  { label: "Legal & Trust Center", href: "/legal" },
];

/**
 * Noxtill social profiles. No official profile URLs exist yet, so the footer renders these as
 * non-link icons labelled "profile link not configured" (as the design specifies) — set a URL here
 * to turn an icon into a real link.
 */
export const FOOTER_SOCIALS: { name: "LinkedIn" | "X" | "YouTube" | "Instagram" | "Facebook"; url: string }[] = [
  { name: "LinkedIn", url: "" },
  { name: "X", url: "" },
  { name: "YouTube", url: "" },
  { name: "Instagram", url: "" },
  { name: "Facebook", url: "" },
];
