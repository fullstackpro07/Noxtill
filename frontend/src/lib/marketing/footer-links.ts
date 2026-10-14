/**
 * Footer link data — six main link columns, 12 business tool clusters,
 * seven AI agents, social media links, and bottom legal shortcuts.
 */

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface BusinessNeedCluster {
  title: string;
  href: string;
  links: FooterLink[];
}

export interface AIAgentItem {
  title: string;
  subtitle: string;
  href: string;
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Product Overview", href: "/product" },
      { label: "Explore Platform", href: "/platform" },
      { label: "Pricing", href: "/pricing" },
      { label: "Integrations", href: "/integrations-directory" },
      { label: "AI & Intelligence", href: "/ai" },
      { label: "What's New", href: "/product-updates" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Small Business", href: "/solutions" },
      { label: "Multi-Location", href: "/solutions/run-several-locations" },
      { label: "Sales & Commerce", href: "/platform/fast-sale" },
      { label: "Customers & Communication", href: "/platform/crm" },
      { label: "Finance & Operations", href: "/product/pnl" },
      { label: "Workforce Management", href: "/platform/staff" },
    ],
  },
  {
    title: "By Industry",
    links: [
      { label: "Home Services", href: "/industries/home-field-services" },
      { label: "Salons & Beauty", href: "/industries/beauty-personal-care" },
      { label: "Restaurants", href: "/industries/restaurants-food" },
      { label: "Retail Stores", href: "/industries/retail-local-commerce" },
      { label: "Cleaning Services", href: "/industries/home-field-services" },
      { label: "Automotive Services", href: "/industries/automotive" },
      { label: "Professional Services", href: "/industries/real-estate-property" },
      { label: "Marketing Agencies", href: "/solutions" },
      { label: "View All Industries", href: "/solutions#navigator" },
    ],
  },
  {
    title: "Free Tools",
    links: [
      { label: "Discount Calculator", href: "/free-tools/discount-calculator" },
      { label: "Profit Margin Calculator", href: "/free-tools/profit-margin-calculator" },
      { label: "Break-Even Calculator", href: "/free-tools/break-even-calculator" },
      { label: "Invoice Generator", href: "/free-tools/invoice-generator" },
      { label: "QR Code Generator", href: "/free-tools/qr-code-generator" },
      { label: "Google Review Link & QR Generator", href: "/free-tools/google-review-link-generator" },
      { label: "WhatsApp Link Generator", href: "/free-tools/whatsapp-link-generator" },
      { label: "UTM Campaign Link Builder", href: "/free-tools/utm-campaign-link-builder" },
      { label: "Email Signature Generator", href: "/free-tools/email-signature-generator" },
      { label: "Missed Call Revenue Calculator", href: "/free-tools/missed-call-revenue-calculator" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "Guides", href: "/getting-started" },
      { label: "Blog", href: "/blog" },
      { label: "API Docs", href: "/developers/api" },
      { label: "Product Updates", href: "/product-updates" },
      { label: "Status", href: "/status" },
      { label: "Community", href: "/resources" },
      { label: "Contact Support", href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Partners & Referrals", href: "/contact" },
      { label: "Book a Demo", href: "/book-a-demo" },
      { label: "Company Information", href: "/legal/company" },
      { label: "Trust Center", href: "/trust" },
      { label: "Legal", href: "/trust" },
    ],
  },
];

export const BUSINESS_NEEDS_CLUSTERS: BusinessNeedCluster[] = [
  {
    title: "AI Phone Receptionist",
    href: "/ai/phone-receptionist",
    links: [
      { label: "AI Call Answering", href: "/ai/phone-receptionist" },
      { label: "Missed Call Recovery", href: "/ai/phone-receptionist" },
      { label: "Call Transfer & Routing", href: "/ai/phone-receptionist" },
      { label: "Auto Dialer & Power Dialer", href: "/ai/phone-receptionist" },
      { label: "IVR & Call Menus", href: "/ai/phone-receptionist" },
      { label: "Call Analytics", href: "/ai/phone-receptionist" },
    ],
  },
  {
    title: "Customers (CRM)",
    href: "/platform/crm",
    links: [
      { label: "Lead Management", href: "/platform/crm" },
      { label: "Sales Pipeline", href: "/platform/crm" },
      { label: "Customer 360", href: "/platform/crm" },
      { label: "Follow-ups & Reminders", href: "/platform/crm" },
      { label: "Segmentation", href: "/platform/crm" },
      { label: "Loyalty & Memberships", href: "/platform/crm" },
    ],
  },
  {
    title: "Bookings",
    href: "/platform/bookings",
    links: [
      { label: "Online Booking", href: "/platform/bookings" },
      { label: "Appointment Calendar", href: "/platform/bookings" },
      { label: "Staff Availability", href: "/platform/bookings" },
      { label: "Automated Reminders", href: "/platform/bookings" },
      { label: "Rescheduling", href: "/platform/bookings" },
      { label: "Booking Management", href: "/platform/bookings" },
    ],
  },
  {
    title: "Unified Inbox",
    href: "/platform/unified-inbox",
    links: [
      { label: "WhatsApp Inbox", href: "/platform/unified-inbox" },
      { label: "SMS Inbox", href: "/platform/unified-inbox" },
      { label: "Email Inbox", href: "/platform/unified-inbox" },
      { label: "Instagram & Messenger", href: "/platform/unified-inbox" },
      { label: "AI Reply Drafting", href: "/platform/unified-inbox" },
      { label: "Team Assignment", href: "/platform/unified-inbox" },
    ],
  },
  {
    title: "Automations & Workflows",
    href: "/platform/automations-workflows",
    links: [
      { label: "Workflow Builder", href: "/platform/automations-workflows" },
      { label: "AI Agents & Workflows", href: "/platform/automations-workflows" },
      { label: "Triggers & Actions", href: "/platform/automations-workflows" },
      { label: "Scheduled Workflows", href: "/platform/automations-workflows" },
      { label: "Webhook Automation", href: "/platform/automations-workflows" },
      { label: "Approval Workflows", href: "/platform/automations-workflows" },
    ],
  },
  {
    title: "SEO Autopilot",
    href: "/platform/marketing-campaigns",
    links: [
      { label: "SEO Audits", href: "/platform/marketing-campaigns" },
      { label: "Keyword Tracking", href: "/platform/marketing-campaigns" },
      { label: "Content Optimization", href: "/platform/marketing-campaigns" },
      { label: "Technical SEO", href: "/platform/marketing-campaigns" },
      { label: "Local SEO", href: "/platform/marketing-campaigns" },
      { label: "SEO Performance", href: "/platform/marketing-campaigns" },
    ],
  },
  {
    title: "Reviews & Reputation",
    href: "/platform/reviews-reputation",
    links: [
      { label: "Review Management", href: "/platform/reviews-reputation" },
      { label: "Review Requests", href: "/platform/reviews-reputation" },
      { label: "AI Review Replies", href: "/platform/reviews-reputation" },
      { label: "Reputation Monitoring", href: "/platform/reviews-reputation" },
      { label: "Review Analytics", href: "/platform/reviews-reputation" },
      { label: "Customer Feedback", href: "/platform/reviews-reputation" },
    ],
  },
  {
    title: "Fast Sale (POS)",
    href: "/platform/fast-sale",
    links: [
      { label: "Quick Checkout", href: "/platform/fast-sale" },
      { label: "Barcode Scanning", href: "/platform/fast-sale" },
      { label: "Payment Methods", href: "/platform/fast-sale" },
      { label: "Receipts & Invoices", href: "/platform/fast-sale" },
      { label: "Discounts & Promotions", href: "/platform/fast-sale" },
      { label: "Sales History", href: "/platform/fast-sale" },
    ],
  },
  {
    title: "Field Service",
    href: "/industries/home-field-services",
    links: [
      { label: "Work Orders", href: "/industries/home-field-services" },
      { label: "Dispatch Board", href: "/industries/home-field-services" },
      { label: "Technician Scheduling", href: "/industries/home-field-services" },
      { label: "Service Calendar", href: "/industries/home-field-services" },
      { label: "Inspections & Checklists", href: "/industries/home-field-services" },
      { label: "Job Tracking", href: "/industries/home-field-services" },
    ],
  },
  {
    title: "Business Intelligence",
    href: "/ai/insights-recommendations",
    links: [
      { label: "Business Brain", href: "/ai/insights-recommendations" },
      { label: "Opportunity Radar", href: "/ai/insights-recommendations" },
      { label: "Business Simulator", href: "/ai/insights-recommendations" },
      { label: "Digital Twin", href: "/ai/insights-recommendations" },
      { label: "AI-Powered Insights", href: "/ai/insights-recommendations" },
      { label: "Intelligence Alerts", href: "/ai/insights-recommendations" },
    ],
  },
  {
    title: "AI Photo Digitizer",
    href: "/ai/photo-digitizer",
    links: [
      { label: "Document Scanning", href: "/ai/photo-digitizer" },
      { label: "Data Extraction", href: "/ai/photo-digitizer" },
      { label: "Product Digitization", href: "/ai/photo-digitizer" },
      { label: "Receipt & Invoice Scan", href: "/ai/photo-digitizer" },
      { label: "Inventory from Photos", href: "/ai/photo-digitizer" },
      { label: "Review & Approve Data", href: "/ai/photo-digitizer" },
    ],
  },
  {
    title: "Autonomous Commerce",
    href: "/platform/orders",
    links: [
      { label: "AI-Powered Operations", href: "/platform/orders" },
      { label: "Dynamic Pricing", href: "/platform/orders" },
      { label: "Smart Inventory", href: "/platform/inventory" },
      { label: "Order Optimization", href: "/platform/orders" },
      { label: "Automated Fulfillment", href: "/platform/orders" },
      { label: "Commerce Within Your Rules", href: "/platform/orders" },
    ],
  },
];

export const AI_AGENTS_LIST: AIAgentItem[] = [
  {
    title: "AI Receptionist",
    subtitle: "Calls · Bookings · Leads",
    href: "/ai/phone-receptionist",
  },
  {
    title: "AI Sales Agent",
    subtitle: "Lead Follow-ups · CRM",
    href: "/platform/fast-sale",
  },
  {
    title: "AI Booking Agent",
    subtitle: "Appointments · Reminders",
    href: "/platform/bookings",
  },
  {
    title: "AI Support Agent",
    subtitle: "Customer Support · FAQs",
    href: "/platform/unified-inbox",
  },
  {
    title: "AI Marketing Agent",
    subtitle: "Campaigns · Content",
    href: "/platform/marketing-campaigns",
  },
  {
    title: "AI SEO Agent",
    subtitle: "SEO Audits · Optimization",
    href: "/platform/marketing-campaigns",
  },
  {
    title: "AI Business Assistant",
    subtitle: "Insights · Recommendations",
    href: "/ai/assistant",
  },
];

export const FOOTER_BOTTOM: FooterLink[] = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Refunds", href: "/legal/refunds" },
  { label: "Cookie Settings", href: "/legal/cookies" },
  { label: "Privacy Choices", href: "/privacy/choices" },
  { label: "Do Not Sell or Share My Personal Information", href: "/privacy/do-not-sell-or-share" },
  { label: "Security", href: "/trust/security" },
  { label: "Accessibility", href: "/legal/accessibility" },
  { label: "Legal & Trust Center", href: "/trust" },
];

export const FOOTER_SOCIALS: { name: string; url: string }[] = [
  { name: "LinkedIn", url: "https://www.linkedin.com/company/noxtill" },
  { name: "X", url: "https://x.com/noxtill" },
  { name: "YouTube", url: "https://www.youtube.com/@noxtill" },
  { name: "Instagram", url: "https://www.instagram.com/noxtill" },
  { name: "Facebook", url: "https://www.facebook.com/noxtill" },
];
