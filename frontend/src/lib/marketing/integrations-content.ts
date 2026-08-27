import type { LucideIcon } from "lucide-react";
import {
  ShoppingBag,
  Users,
  CreditCard,
  Package,
  FileBarChart,
  ShieldCheck,
  RefreshCw,
  SlidersHorizontal,
  Server,
  Lock,
  KeyRound,
  EyeOff,
  Sparkles,
  Bell,
  Gift,
  MessageCircle,
  Phone,
} from "lucide-react";

/** Ported from Integrations.dc.html — `cats` array: [key, sidebar label, top-pill label]. */
export interface IntegrationCategory {
  key: string;
  label: string;
  topLabel: string;
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  { key: "all", label: "All Integrations", topLabel: "All" },
  { key: "ecommerce", label: "E-commerce", topLabel: "E-commerce" },
  { key: "payments", label: "Payments", topLabel: "Payments" },
  { key: "accounting", label: "Accounting & Finance", topLabel: "Accounting" },
  { key: "crm", label: "CRM", topLabel: "CRM" },
  { key: "marketing", label: "Marketing & Email", topLabel: "Marketing" },
  { key: "communication", label: "Communication", topLabel: "Communication" },
  { key: "social", label: "Social & Messaging", topLabel: "Social & Messaging" },
  { key: "reputation", label: "Reviews & Reputation", topLabel: "Reviews & Reputation" },
  { key: "listings", label: "Business Listings", topLabel: "Business Listings" },
  { key: "inventory", label: "Inventory & POS", topLabel: "Inventory" },
  { key: "bookings", label: "Bookings", topLabel: "Bookings" },
  { key: "automation", label: "Automation", topLabel: "Automation" },
  { key: "analytics", label: "Analytics & Reporting", topLabel: "Analytics & Reporting" },
  { key: "other", label: "Other", topLabel: "Other" },
];

export const TOP_FILTER_KEYS = ["all", "ecommerce", "payments", "accounting", "crm", "marketing", "communication", "inventory"];
export const MORE_FILTER_KEYS = ["reputation", "social", "listings", "bookings", "automation", "analytics", "other"];

export interface IntegrationTool {
  name: string;
  slug: string;
  logo: string;
  categoryLabel: string;
  description: string;
  tags: string[];
  categories: string[];
  popular: boolean;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Ported verbatim from Integrations.dc.html's `catalog` array (name, logo, category label, description, sync tags, category keys, popular). */
const CATALOG_RAW: [string, string, string, string, string[], string[], boolean][] = [
  ["Shopify", "shopify.png", "E-commerce", "Sync orders, products, customers and inventory in real time.", ["Orders", "Products", "Customers", "Inventory"], ["ecommerce", "inventory", "crm"], true],
  ["WooCommerce", "woocommerce.png", "E-commerce", "Connect your WooCommerce store and manage everything from one place.", ["Orders", "Products", "Customers"], ["ecommerce", "inventory"], true],
  ["Square", "square.png", "E-commerce", "Bring Square transactions and catalog items into your sales records.", ["Payments", "Products", "Customers"], ["ecommerce", "payments", "inventory"], false],
  ["WordPress", "wordpress.png", "E-commerce", "Publish your booking link and business hours to your website.", ["Bookings", "Business info"], ["ecommerce", "bookings"], false],
  ["Stripe", "stripe.png", "Payments", "Securely sync payments, refunds and transactions.", ["Payments", "Refunds", "Customers"], ["payments"], true],
  ["PayPal", "paypal.png", "Payments", "Import payments and manage customer transactions.", ["Payments", "Refunds", "Customers"], ["payments"], false],
  ["QuickBooks", "quickbooks.png", "Accounting", "Sync invoices, expenses, customers and chart of accounts.", ["Invoices", "Expenses", "Customers"], ["accounting", "inventory"], true],
  ["Zoho Books", "zoho.png", "Accounting", "Keep your accounting data accurate and up to date.", ["Invoices", "Expenses", "Customers"], ["accounting"], false],
  ["HubSpot", "hubspot.png", "CRM", "Sync leads, contacts and deals seamlessly.", ["Contacts", "Companies", "Deals"], ["crm", "marketing"], false],
  ["Mailchimp", "mailchimp.png", "Marketing", "Sync audiences and send smarter email campaigns.", ["Contacts", "Campaigns", "Audiences"], ["marketing"], false],
  ["Meta Business Suite", "meta.png", "Marketing", "Manage Facebook and Instagram business activity in one place.", ["Ads", "Messages", "Audiences"], ["marketing", "social", "analytics"], false],
  ["Canva", "canva.png", "Marketing", "Bring campaign artwork into Noxtill offers and social posts.", ["Designs", "Assets"], ["marketing", "other"], false],
  ["WhatsApp Business", "whatsapp.png", "Communication", "Connect WhatsApp and chat with customers in the unified inbox.", ["Messages", "Customers", "Templates"], ["communication", "social"], false],
  ["Email", "email.png", "Communication", "Send invoices, statements and scheduled reports by email.", ["Messages", "Reports", "Invoices"], ["communication"], false],
  ["SMS", "sms.png", "Communication", "Send reminders and balance notices by text message.", ["Messages", "Reminders"], ["communication"], false],
  ["Facebook Messenger", "messenger.png", "Communication", "Reply to messages and manage customers in one inbox.", ["Messages", "Customers", "Pages"], ["communication", "social"], false],
  ["Instagram", "instagram.png", "Social", "Manage messages, comments and customer conversations.", ["Messages", "Comments", "Mentions"], ["social", "communication"], false],
  ["LinkedIn", "linkedin.png", "Social", "Route LinkedIn enquiries into your shared inbox.", ["Messages", "Leads"], ["social", "communication"], false],
  ["TikTok", "tiktok.png", "Social", "Answer TikTok comments and direct messages.", ["Messages", "Comments"], ["social", "communication"], false],
  ["Twilio", "twilio.png", "Communication", "Use your own Twilio numbers for SMS and voice.", ["SMS", "Voice", "Numbers"], ["communication", "automation"], false],
  ["Google Business Profile", "gbp.png", "Business Listings", "Keep your business information accurate everywhere.", ["Listings", "Reviews", "Insights"], ["listings", "reputation", "analytics"], false],
  ["Apple Business Connect", "applebiz.png", "Business Listings", "Keep the Apple Maps card customers see accurate.", ["Listings", "Hours"], ["listings"], false],
  ["Bing Places", "bing.png", "Business Listings", "Publish verified business details to Bing Places and Maps.", ["Listings", "Hours"], ["listings"], false],
  ["Yellow Pages", "yellowpages.png", "Business Listings", "Keep your Yellow Pages entry in step with other listings.", ["Listings"], ["listings"], false],
  ["Google", "google.png", "Reviews", "Monitor Google reviews and reply with approved drafts.", ["Reviews", "Ratings"], ["reputation"], false],
  ["Yelp", "yelp.png", "Reviews", "Track Yelp ratings and respond from one workspace.", ["Reviews", "Ratings"], ["reputation", "listings"], false],
  ["Trustpilot", "trustpilot.png", "Reviews", "Send review invitations and monitor your score.", ["Reviews", "Invitations"], ["reputation"], false],
  ["BBB", "bbb.svg", "Reviews", "Watch BBB reviews and complaints alongside other sources.", ["Reviews", "Complaints"], ["reputation"], false],
  ["G2", "g2.png", "Reviews", "Follow G2 ratings and review volume.", ["Reviews", "Ratings"], ["reputation"], false],
  ["Capterra", "capterra.svg", "Reviews", "Follow Capterra reviews and ratings.", ["Reviews", "Ratings"], ["reputation"], false],
  ["Clutch", "clutch.png", "Reviews", "Track Clutch reviews in your reputation score.", ["Reviews", "Ratings"], ["reputation"], false],
  ["GoodFirms", "goodfirms.png", "Reviews", "Include GoodFirms feedback in sentiment reporting.", ["Reviews", "Ratings"], ["reputation"], false],
  ["Zapier", "zapier.png", "Automation", "Trigger workflows in thousands of apps from Noxtill events.", ["Workflows", "Triggers", "Actions"], ["automation", "analytics"], false],
  ["AWS", "aws.png", "Other", "Keep document storage and backups on your own AWS account.", ["Storage", "Backups"], ["other", "automation"], false],
];

export const INTEGRATIONS: IntegrationTool[] = CATALOG_RAW.map(([name, logo, categoryLabel, description, tags, categories, popular]) => ({
  name,
  slug: slugify(name),
  logo: `/brand/${logo}`,
  categoryLabel,
  description,
  tags,
  categories,
  popular,
}));

/** Curated popularity order for the default sort — not a release date. */
export const POPULAR_ORDER = [
  "Shopify", "WooCommerce", "Stripe", "PayPal", "QuickBooks", "Zoho Books", "HubSpot", "Mailchimp",
  "WhatsApp Business", "Instagram", "Google Business Profile", "Facebook Messenger", "Square", "Meta Business Suite",
  "Email", "SMS", "Twilio", "Google", "Yelp", "Trustpilot", "Zapier", "WordPress", "LinkedIn", "TikTok",
  "Apple Business Connect", "Bing Places", "G2", "Capterra", "Clutch", "BBB", "GoodFirms", "Yellow Pages", "Canva", "AWS",
];

export const INTEGRATIONS_HERO = {
  eyebrow: "Connect your business to everything",
  headlineLine1: "Business software integrations",
  headlineLine2: "that keep your data connected",
  body: "Noxtill connects the tools you already use so important information can move between systems instead of staying trapped in separate apps.",
  checklist: [
    "Connect the business tools you already use",
    "Sync data in real time",
    "Automate workflows and save hours",
    "AI-powered insights from connected data",
  ],
  syncModules: ["Orders", "Customers", "Payments", "Inventory", "Bookings", "Reports"],
  aiCallout: {
    title: "AI Insights & Automation",
    description: "Turn connected data into actionable business insights",
  },
};

export interface HeroToolIcon {
  name: string;
  logo: string;
}

export const HERO_TOP_ROW: HeroToolIcon[] = [
  { name: "Shopify", logo: "/brand/shopify.png" },
  { name: "WooCommerce", logo: "/brand/woocommerce.png" },
  { name: "Stripe", logo: "/brand/stripe.png" },
  { name: "QuickBooks", logo: "/brand/quickbooks.png" },
];

export const HERO_LEFT_COLUMN: HeroToolIcon[] = [
  { name: "PayPal", logo: "/brand/paypal.png" },
  { name: "WhatsApp", logo: "/brand/whatsapp.png" },
];

export const HERO_RIGHT_COLUMN: HeroToolIcon[] = [
  { name: "HubSpot", logo: "/brand/hubspot.png" },
  { name: "Mailchimp", logo: "/brand/mailchimp.png" },
];

export const HERO_BOTTOM_ROW: HeroToolIcon[] = [
  { name: "Google Business Profile", logo: "/brand/gbp.png" },
  { name: "Instagram", logo: "/brand/instagram.png" },
  { name: "Messenger", logo: "/brand/messenger.png" },
  { name: "Email", logo: "/brand/email.png" },
];

export interface FlowStep {
  title: string;
  description: string;
}

export const FLOW_EYEBROW = "How integrations work";
export const FLOW_HEADING = "Connect → Sync → Noxtill → AI → Insights / Actions";
export const FLOW_BODY = "Noxtill connects your favorite tools, keeps your data in sync, and turns it into actionable business insights.";

export const FLOW_STEPS: FlowStep[] = [
  { title: "Connect", description: "Connect the tools you already use in minutes." },
  { title: "Sync", description: "We securely sync your data in real time." },
  { title: "Noxtill", description: "All your data comes together in one connected system." },
  { title: "AI", description: "Noxtill AI analyzes your connected data." },
  { title: "Insights / Actions", description: "Get insights and take action to grow your business." },
];

export interface FlowTrustItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FLOW_TRUST_ITEMS: FlowTrustItem[] = [
  { icon: ShieldCheck, title: "Secure Connections", description: "Encrypted connections and controlled access." },
  { icon: RefreshCw, title: "Real-time Sync", description: "Your data stays updated across all systems." },
  { icon: SlidersHorizontal, title: "Granular Control", description: "Choose what data to sync and when." },
  { icon: Server, title: "Reliable & Scalable", description: "Built for businesses of all sizes." },
];

export const SYNC_OVERVIEW = {
  eyebrow: "One connection. All your data.",
  heading: "What You Can Connect & Sync",
  body: "Noxtill syncs the data that matters across your tools so everything stays accurate, up to date, and ready to power your business.",
  image: "/marketing/noxtill-integrations-sync-overview.webp",
  imageAlt: "Noxtill integrations overview: orders, customers, payments, inventory, bookings, marketing, communication and reviews syncing with the Noxtill dashboard",
};

export const FLOW_DIAGRAM = {
  image: "/marketing/noxtill-integrations-data-flow-diagram.webp",
  imageAlt: "Noxtill integrations data flow: connected tools sync into the Noxtill dashboard, AI analysis, and business insights and actions",
};

export interface InboxChannel {
  label: string;
  logo?: string;
  icon?: LucideIcon;
}

export const UNIFIED_INBOX = {
  eyebrow: "Communication",
  heading: "Every channel lands in one unified inbox",
  body: "Connect the channels your customers already use. Each conversation arrives with the customer record, order history and outstanding balance attached, so your team can answer and act without switching apps.",
  cta: { label: "See the unified inbox", href: "/product#inbox" },
  channels: [
    { label: "WhatsApp", logo: "/brand/whatsapp.png" },
    { label: "Email", logo: "/brand/email.png" },
    { label: "SMS", logo: "/brand/sms.png" },
    { label: "Facebook Messenger", logo: "/brand/messenger.png" },
    { label: "Instagram", logo: "/brand/instagram.png" },
    { label: "TikTok", logo: "/brand/tiktok.png" },
    { label: "LinkedIn", logo: "/brand/linkedin.png" },
    { label: "Website Chat", icon: MessageCircle },
    { label: "Phone", icon: Phone },
  ] satisfies InboxChannel[],
};

export const MULTI_LOCATION = {
  eyebrow: "Multi-location",
  heading: "One account. Every branch.",
  body: "Connect each location and keep branch-level sales, inventory, customers, bookings, staff and profit visible in one place — with a combined view across the whole business.",
  cta: { label: "See multi-location", href: "/product#multi-location" },
  branches: ["Branch A", "Branch B", "Branch C"],
  combinedViewTitle: "Combined business view",
  combinedViewTags: ["Sales", "Inventory", "Customers", "Bookings", "Staff", "Profit"],
};

export interface SolutionPill {
  label: string;
  href: string;
}

export const BUILT_FOR_BUSINESS = {
  heading: "Built for the way your business works",
  body: "Choose your business and see which integrations matter most for your daily workflow.",
  ctaLabel: "Explore solutions by business type",
  ctaHref: "/solutions",
  pills: [
    { label: "Salons & Barbershops", href: "/solutions#salons" },
    { label: "Restaurants & Cafés", href: "/solutions#restaurants" },
    { label: "Dental & Medical Clinics", href: "/solutions#clinics" },
    { label: "Gyms & Fitness Studios", href: "/solutions#gyms" },
    { label: "Retail & Shops", href: "/solutions#retail" },
    { label: "Auto Repair", href: "/solutions#auto" },
    { label: "Spas & Beauty", href: "/solutions#spas" },
    { label: "Bakeries", href: "/solutions#bakeries" },
    { label: "Pet Grooming", href: "/solutions#pet-grooming" },
    { label: "Tailors & Alterations", href: "/solutions#tailors" },
    { label: "Photographers", href: "/solutions#photographers" },
    { label: "Tutoring & Academies", href: "/solutions#tutoring" },
    { label: "Home Services", href: "/solutions#home-services" },
    { label: "Cleaning", href: "/solutions#cleaning" },
    { label: "Event Venues", href: "/solutions#venues" },
    { label: "Laundry & Dry Cleaning", href: "/solutions#laundry" },
  ] satisfies SolutionPill[],
};

export interface ProblemCard {
  title: string;
  description: string;
  href: string;
}

export const SOLVE_PROBLEMS = {
  heading: "Connect Noxtill to solve the problems that matter most",
  body: "Choose what you want to improve and see how connected data helps.",
  ctaLabel: "Explore solutions by need",
  ctaHref: "/solutions",
  cards: [
    { title: "Reduce no-shows", description: "Automated reminders help reduce missed appointments.", href: "/solutions#no-shows" },
    { title: "Collect more reviews", description: "Review requests go out after a completed visit.", href: "/solutions#more-reviews" },
    { title: "Track customer credit", description: "Know who owes you, and remind them politely.", href: "/solutions#track-credit" },
    { title: "Know your real profit", description: "Per item, per hour, per staff member.", href: "/solutions#real-profit" },
    { title: "Bring paper records in", description: "Photograph your register and digitise the information.", href: "/solutions#paper-records" },
    { title: "Run several locations", description: "One account, every branch, one roll-up.", href: "/solutions#several-locations" },
  ] satisfies ProblemCard[],
};

export const AUTOMATION_SECTION = {
  eyebrow: "Automate. Save time. Grow faster.",
  heading: "Automation With Integrations",
  body: "Noxtill connects your tools and automates workflows so your business runs smoothly — without manual work. A new Shopify order updates inventory, the customer record and your daily report, then notifies you on WhatsApp. A Stripe payment updates profit, the customer ledger and sends the confirmation instantly.",
};

export interface AutomationStep {
  title: string;
  description: string;
  logo?: string;
  icon?: LucideIcon;
}

export interface AutomationExample {
  label: string;
  steps: AutomationStep[];
}

export const AUTOMATION_EXAMPLES: AutomationExample[] = [
  {
    label: "Example 1",
    steps: [
      { title: "New Order", description: "Order placed on Shopify", icon: ShoppingBag },
      { title: "Inventory Update", description: "Stock levels updated in real time", icon: Package },
      { title: "Customer Update", description: "Customer profile updated", icon: Users },
      { title: "Report Generated", description: "Daily sales report created & synced", icon: FileBarChart },
      { title: "Notification", description: "Report sent to you on WhatsApp", logo: "/brand/whatsapp.png" },
    ],
  },
  {
    label: "Example 2",
    steps: [
      { title: "Payment Received", description: "Payment captured via Stripe", logo: "/brand/stripe.png" },
      { title: "Profit Updated", description: "Profit & loss updated instantly", icon: FileBarChart },
      { title: "Customer Ledger", description: "Customer ledger updated", icon: CreditCard },
      { title: "Notification Sent", description: "You & customer notified instantly", icon: Bell },
    ],
  },
];

export const AUTOMATION_DASHBOARD = {
  title: "Automation Dashboard",
  liveBadge: "Live",
  stats: [
    { label: "Active Workflows", value: "24", delta: "↑ 18%" },
    { label: "Tasks Executed Today", value: "1,842", delta: "↑ 24%" },
    { label: "Time Saved", value: "32.4 hrs", delta: "↑ 21%" },
  ],
  recent: [
    { label: "New Order → Inventory → Customer → Report", time: "2 mins ago" },
    { label: "Payment → Profit → Ledger → Notification", time: "5 mins ago" },
    { label: "New Booking → Reminder → Follow-up", time: "15 mins ago" },
    { label: "Low Stock → Purchase Order → Notification", time: "30 mins ago" },
  ],
  viewAllLabel: "View all workflows",
  viewAllHref: "/product",
};

export const SECURITY_SECTION = {
  badge: "Secure by design",
  heading: "Security You Can Trust",
  body: "Your data is protected with encrypted connections and strict access controls.",
  items: [
    { icon: Lock, title: "Encrypted Connections", description: "Your data is encrypted in transit and at rest using industry-standard protocols." },
    { icon: ShieldCheck, title: "Role-Based Permissions", description: "You control who can access what. Granular permissions for your team." },
    { icon: KeyRound, title: "Secure API Connections", description: "All integrations use secure, token-based authentication." },
    { icon: EyeOff, title: "Privacy First", description: "We never sell your data. Your business information stays private and safe." },
    { icon: RefreshCw, title: "Regular Security Audits", description: "We conduct regular security audits and vulnerability assessments." },
    { icon: SlidersHorizontal, title: "Continuous Monitoring", description: "Our systems are continuously monitored for suspicious activity." },
    { icon: Server, title: "Reliable Infrastructure", description: "We use reliable cloud infrastructure with redundancy and failover." },
  ] satisfies FlowTrustItem[],
};

export const REQUEST_SECTION = {
  badge: "Don't see your tool?",
  heading: "Request an Integration",
  body: "We're always adding new integrations. Tell us the tool you use, and we'll connect it to Noxtill.",
  fields: {
    tool: { label: "Tool / Platform Name", placeholder: "e.g., Xero, Zoho CRM, Square, etc." },
    website: { label: "Website", placeholder: "https://" },
    sync: { label: "What would you like to sync?", placeholder: "Orders, Customers, Payments, etc." },
    help: { label: "How will this integration help your business?", placeholder: "Tell us more..." },
  },
  submitLabel: "Submit Request",
  sideItems: [
    { icon: Sparkles, title: "We Build What You Need", description: "Your request helps us prioritize and build useful integrations." },
    { icon: Bell, title: "Get Notified", description: "We'll notify you when the integration is live." },
    { icon: Gift, title: "No Extra Cost", description: "We don't charge extra for standard integrations." },
  ] satisfies FlowTrustItem[],
  footerLabel: "Already requested something?",
  footerCtaLabel: "View your requests",
  footerCtaHref: "/resources",
};

export const INTEGRATIONS_FAQ = [
  {
    question: "What integrations does Noxtill support?",
    answer: "Noxtill supports connectors across e-commerce, payments, accounting, CRM, marketing, communication, business listings, reputation and automation. The directory above lists every connector available today, with what each one syncs.",
  },
  {
    question: "How do Noxtill integrations work?",
    answer: "You authorise the connection from Noxtill, choose what should sync, and Noxtill keeps the relevant business records updated. Most connections take a few minutes and need no technical knowledge.",
  },
  {
    question: "Can I connect multiple tools and locations?",
    answer: "Yes. You can connect several tools at once, and each location can be connected so branch-level data stays visible alongside a combined view.",
  },
  {
    question: "Can Noxtill sync customers, inventory and payments?",
    answer: "Where the connected service supports it, yes — customer records, product and stock levels, and payment activity can all stay in step. Each connector card lists the fields it actually syncs.",
  },
  {
    question: "Can Noxtill connect WhatsApp?",
    answer: "Yes. WhatsApp Business connects to the unified inbox, so customer conversations, receipts, reminders and reports can all run through the channel your customers already use.",
  },
  {
    question: "Can I disconnect an integration?",
    answer: "Yes. Any connection can be disconnected from Noxtill at any time, and you control what each connection is allowed to access while it is active.",
  },
  {
    question: "What happens if an integration stops working?",
    answer: "Noxtill flags the failed connection so you can reauthorise it. Your existing Noxtill data is unaffected while a connector is disconnected.",
  },
  {
    question: "Are integrations included in my plan?",
    answer: "Connectors are part of Noxtill — see the pricing page for what each plan includes, and start with the 14-day free trial.",
  },
];

export const INTEGRATIONS_FINAL_CTA = {
  heading: "Connect your business. Keep everything in sync.",
  body: "Bring the tools you already use into one connected business system with Noxtill.",
  primaryCta: { label: "Start 14-Day Free Trial", href: "/login" },
  secondaryCta: { label: "View All Integrations", href: "#directory" },
  trust: ["No credit card required", "14-day free trial", "Cancel anytime"],
};
