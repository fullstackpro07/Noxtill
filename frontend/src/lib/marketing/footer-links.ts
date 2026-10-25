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
      { label: "AI Call Answering", href: "/features/ai-call-answering" },
      { label: "Missed Call Recovery", href: "/features/missed-call-recovery" },
      { label: "Call Transfer & Routing", href: "/features/call-transfer-routing" },
      { label: "Auto Dialer & Power Dialer", href: "/features/auto-dialer-power-dialer" },
      { label: "IVR & Call Menus", href: "/features/ivr-call-menus" },
      { label: "Call Analytics", href: "/features/call-analytics" },
    ],
  },
  {
    title: "Customers (CRM)",
    href: "/platform/crm",
    links: [
      { label: "Lead Management", href: "/features/lead-management" },
      { label: "Sales Pipeline", href: "/features/sales-pipeline" },
      { label: "Customer 360", href: "/features/customer-360" },
      { label: "Follow-ups & Reminders", href: "/features/follow-ups-reminders" },
      { label: "Segmentation", href: "/features/segmentation" },
      { label: "Loyalty & Memberships", href: "/features/loyalty-memberships" },
    ],
  },
  {
    title: "Bookings",
    href: "/platform/bookings",
    links: [
      { label: "Online Booking", href: "/features/online-booking" },
      { label: "Appointment Calendar", href: "/features/appointment-calendar" },
      { label: "Staff Availability", href: "/features/staff-availability" },
      { label: "Automated Reminders", href: "/features/automated-reminders" },
      { label: "Rescheduling", href: "/features/rescheduling" },
      { label: "Booking Management", href: "/features/booking-management" },
    ],
  },
  {
    title: "Unified Inbox",
    href: "/platform/unified-inbox",
    links: [
      { label: "WhatsApp Inbox", href: "/features/whatsapp-inbox" },
      { label: "SMS Inbox", href: "/features/sms-inbox" },
      { label: "Email Inbox", href: "/features/email-inbox" },
      { label: "Instagram & Messenger", href: "/features/instagram-messenger" },
      { label: "AI Reply Drafting", href: "/features/ai-reply-drafting" },
      { label: "Team Assignment", href: "/features/team-assignment" },
    ],
  },
  {
    title: "Automations & Workflows",
    href: "/platform/automations-workflows",
    links: [
      { label: "Workflow Builder", href: "/features/workflow-builder" },
      { label: "AI Agents & Workflows", href: "/features/ai-agents-workflows" },
      { label: "Triggers & Actions", href: "/features/triggers-actions" },
      { label: "Scheduled Workflows", href: "/features/scheduled-workflows" },
      { label: "Webhook Automation", href: "/features/webhook-automation" },
      { label: "Approval Workflows", href: "/features/approval-workflows" },
    ],
  },
  {
    title: "SEO Autopilot",
    href: "/platform/marketing-campaigns",
    links: [
      { label: "SEO Audits", href: "/features/seo-audits" },
      { label: "Keyword Tracking", href: "/features/keyword-tracking" },
      { label: "Content Optimization", href: "/features/content-optimization" },
      { label: "Technical SEO", href: "/features/technical-seo" },
      { label: "Local SEO", href: "/features/local-seo" },
      { label: "SEO Performance", href: "/features/seo-performance" },
    ],
  },
  {
    title: "Reviews & Reputation",
    href: "/platform/reviews-reputation",
    links: [
      { label: "Review Management", href: "/features/review-management" },
      { label: "Review Requests", href: "/features/review-requests" },
      { label: "AI Review Replies", href: "/features/ai-review-replies" },
      { label: "Reputation Monitoring", href: "/features/reputation-monitoring" },
      { label: "Review Analytics", href: "/features/review-analytics" },
      { label: "Customer Feedback", href: "/features/customer-feedback" },
    ],
  },
  {
    title: "Fast Sale (POS)",
    href: "/platform/fast-sale",
    links: [
      { label: "Quick Checkout", href: "/features/quick-checkout" },
      { label: "Barcode Scanning", href: "/features/barcode-scanning" },
      { label: "Payment Methods", href: "/features/payment-methods" },
      { label: "Receipts & Invoices", href: "/features/receipts-invoices" },
      { label: "Discounts & Promotions", href: "/features/discounts-promotions" },
      { label: "Sales History", href: "/features/sales-history" },
    ],
  },
  {
    title: "Field Service",
    href: "/industries/home-field-services",
    links: [
      { label: "Work Orders", href: "/features/work-orders" },
      { label: "Dispatch Board", href: "/features/dispatch-board" },
      { label: "Technician Scheduling", href: "/features/technician-scheduling" },
      { label: "Service Calendar", href: "/features/service-calendar" },
      { label: "Inspections & Checklists", href: "/features/inspections-checklists" },
      { label: "Job Tracking", href: "/features/job-tracking" },
    ],
  },
  {
    title: "Business Intelligence",
    href: "/ai/insights-recommendations",
    links: [
      { label: "Business Brain", href: "/features/business-brain" },
      { label: "Opportunity Radar", href: "/features/opportunity-radar" },
      { label: "Business Simulator", href: "/features/business-simulator" },
      { label: "Digital Twin", href: "/features/digital-twin" },
      { label: "AI-Powered Insights", href: "/features/ai-powered-insights" },
      { label: "Intelligence Alerts", href: "/features/intelligence-alerts" },
    ],
  },
  {
    title: "AI Photo Digitizer",
    href: "/ai/photo-digitizer",
    links: [
      { label: "Document Scanning", href: "/features/document-scanning" },
      { label: "Data Extraction", href: "/features/data-extraction" },
      { label: "Product Digitization", href: "/features/product-digitization" },
      { label: "Receipt & Invoice Scan", href: "/features/receipt-invoice-scan" },
      { label: "Inventory from Photos", href: "/features/inventory-from-photos" },
      { label: "Review & Approve Data", href: "/features/review-approve-data" },
    ],
  },
  {
    title: "Autonomous Commerce",
    href: "/platform/orders",
    links: [
      { label: "AI-Powered Operations", href: "/features/ai-powered-operations" },
      { label: "Dynamic Pricing", href: "/features/dynamic-pricing" },
      { label: "Smart Inventory", href: "/features/smart-inventory" },
      { label: "Order Optimization", href: "/features/order-optimization" },
      { label: "Automated Fulfillment", href: "/features/automated-fulfillment" },
      { label: "Commerce Within Your Rules", href: "/features/commerce-within-your-rules" },
    ],
  },
];

export const AI_AGENTS_LIST: AIAgentItem[] = [
  {
    title: "AI Receptionist",
    subtitle: "Calls · Bookings · Leads",
    href: "/agents/phone-receptionist",
  },
  {
    title: "AI Sales Agent",
    subtitle: "Lead Follow-ups · CRM",
    href: "/agents/sales-agent",
  },
  {
    title: "AI Booking Agent",
    subtitle: "Appointments · Reminders",
    href: "/agents/booking-agent",
  },
  {
    title: "AI Support Agent",
    subtitle: "Customer Support · FAQs",
    href: "/agents/support-agent",
  },
  {
    title: "AI Marketing Agent",
    subtitle: "Campaigns · Content",
    href: "/agents/marketing-agent",
  },
  {
    title: "AI SEO Agent",
    subtitle: "SEO Audits · Optimization",
    href: "/agents/seo-agent",
  },
  {
    title: "AI Business Assistant",
    subtitle: "Insights · Recommendations",
    href: "/agents/business-assistant",
  },
];

export const FOOTER_BOTTOM: FooterLink[] = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Refunds", href: "/legal/refunds" },
  { label: "Cookie Settings", href: "/privacy/cookie-settings" },
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
