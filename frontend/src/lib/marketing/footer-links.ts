/**
 * Footer link data — SiteFooter's five columns plus the bottom-bar legal links.
 * `/features/[slug]/` and `/solutions/[slug]/` pages from the source design are out of
 * scope, so feature/business-type links point at anchors on /product and /solutions;
 * placeholder items with no source content (help centre, blog, compare pages, etc.)
 * point at /resources rather than a route that would 404.
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
    title: "Features",
    links: [
      { label: "Nightly Close", href: "/product#nightly-close" },
      { label: "Point of sale", href: "/product#fast-sale" },
      { label: "Appointment bookings", href: "/product#bookings" },
      { label: "Customer credit ledger", href: "/product#credit" },
      { label: "Inventory management", href: "/product#inventory" },
      { label: "Profit & loss", href: "/product#pnl" },
      { label: "Reviews & reputation", href: "/product#reviews" },
      { label: "Unified inbox", href: "/product#inbox" },
      { label: "Voice-entry sales", href: "/product/voice-sales" },
      { label: "Photo digitizer", href: "/product/photo-digitizer" },
      { label: "AI phone receptionist", href: "/product/ai-receptionist" },
    ],
  },
  {
    title: "Business types",
    links: [
      { label: "Salon software", href: "/solutions#salons" },
      { label: "Restaurant software", href: "/solutions#restaurants" },
      { label: "Clinic software", href: "/solutions#clinics" },
      { label: "Gym software", href: "/solutions#gyms" },
      { label: "Retail shop software", href: "/solutions#retail" },
      { label: "Auto repair software", href: "/solutions#auto" },
      { label: "Spa & beauty software", href: "/solutions#spas" },
      { label: "Bakery software", href: "/solutions#bakeries" },
      { label: "Pet grooming software", href: "/solutions#pet-grooming" },
      { label: "Laundry software", href: "/solutions#laundry" },
      { label: "See all 300+ types →", href: "/solutions" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { label: "No-show cost calculator", href: "/resources" },
      { label: "Profit margin calculator", href: "/resources" },
      { label: "Review response generator", href: "/resources" },
      { label: "QR code generator", href: "/resources" },
      { label: "Business health check", href: "/resources" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Integrations", href: "/integrations-directory" },
      { label: "Help centre", href: "/resources" },
      { label: "Blog", href: "/resources" },
      { label: "Case studies", href: "/resources" },
      { label: "Book a demo", href: "/book-a-demo" },
      { label: "System status", href: "/resources" },
      { label: "Contact support", href: "/resources" },
    ],
  },
];

export const FOOTER_BOTTOM_LINKS: FooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/resources" },
  { label: "GDPR", href: "/resources" },
];
