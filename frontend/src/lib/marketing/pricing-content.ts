import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Sparkles,
  TrendingUp,
  Building2,
  Layers,
  Crown,
  ShieldCheck,
  RefreshCw,
  Headphones,
  Zap,
  BarChart3,
  Lock,
  CalendarCheck,
  Monitor,
  BookOpen,
} from "lucide-react";

export const PRICING_HERO = {
  headline: "Everything your business needs.",
  headlineAccent: "One connected",
  headlineEnd: "platform.",
  body: "Noxtill brings together POS, bookings, CRM, inventory, marketing, reputation, AI and more — so you can run, grow and scale your business with less effort.",
  trust: [
    { icon: BadgeCheck, title: "All-in-one", subtitle: "business platform" },
    { icon: Zap, title: "Automate work.", subtitle: "Save time." },
    { icon: BarChart3, title: "Real-time insights.", subtitle: "Better decisions." },
    { icon: Lock, title: "Secure, reliable", subtitle: "and always up." },
  ],
};

export interface PricingPlan {
  key: string;
  name: string;
  icon: LucideIcon;
  audience: string;
  monthly: number | null;
  annual: number | null;
  custom?: boolean;
  popular?: boolean;
  summaryLabel: string;
  summary: string[];
  ctaLabel: string;
  ctaHref: string;
  secondaryDemo?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    key: "starter",
    name: "Starter",
    icon: Sparkles,
    audience: "Everything you need to get started.",
    monthly: 49,
    annual: 39,
    summaryLabel: "Includes",
    summary: ["1 Location", "3 Users", "Core Features", "Basic Reports", "AI Assistant (200/month)", "Unified Inbox", "Core Integrations"],
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
  },
  {
    key: "growth",
    name: "Growth",
    icon: TrendingUp,
    audience: "For growing businesses that want more.",
    monthly: 79,
    annual: 63,
    popular: true,
    summaryLabel: "Everything in Starter, plus:",
    summary: ["2 Locations", "10 Users", "Advanced Bookings", "Marketing & Campaigns", "Advanced Reports", "AI Assistant (1,000/month)", "More Integrations", "Automations"],
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
  },
  {
    key: "business",
    name: "Business",
    icon: Building2,
    audience: "For established businesses that need more power.",
    monthly: 129,
    annual: 103,
    summaryLabel: "Everything in Growth, plus:",
    summary: ["5 Locations", "25 Users", "AI Receptionist", "Advanced Analytics", "Reputation Management", "Advanced Automations", "API Access", "AI Assistant (3,000/month)"],
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
  },
  {
    key: "scale",
    name: "Scale",
    icon: Layers,
    audience: "For multi-location businesses.",
    monthly: 199,
    annual: 159,
    summaryLabel: "Everything in Business, plus:",
    summary: ["10 Locations", "Unlimited Users", "Advanced Permissions", "Branch Performance", "Centralized Dashboard", "Priority Support", "AI Assistant (10,000/month)", "Advanced Integrations"],
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    icon: Crown,
    audience: "Custom solutions for large organizations.",
    monthly: null,
    annual: null,
    custom: true,
    summaryLabel: "Everything in Scale, plus:",
    summary: ["Unlimited Locations", "Custom Users", "Custom Integrations", "Dedicated Account Manager", "Custom Workflows", "Advanced Security", "SLA & Priority Support", "Custom AI Limits"],
    ctaLabel: "Contact Sales",
    ctaHref: "/contact",
    secondaryDemo: true,
  },
];

export const PRICING_TRUST_GRID = [
  { icon: ShieldCheck, title: "Secure & Reliable", desc: "Enterprise-grade security to keep your data safe." },
  { icon: RefreshCw, title: "Always Improving", desc: "Regular updates with new features and improvements." },
  { icon: Headphones, title: "Support You Can Count On", desc: "Expert support via chat, email and phone." },
  { icon: Zap, title: "Cancel Anytime", desc: "No long-term contracts. Cancel anytime." },
];

export type CompareCellValue = 1 | 0 | string;

export interface CompareCategory {
  category: string;
  rows: { label: string; values: CompareCellValue[] }[];
}

export const PRICING_COMPARE_CATEGORIES: CompareCategory[] = [
  {
    category: "Core business",
    rows: [
      { label: "Dashboard", values: [1, 1, 1, 1, 1] },
      { label: "Sales / POS", values: [1, 1, 1, 1, 1] },
      { label: "Fast Sale", values: [1, 1, 1, 1, 1] },
      { label: "Orders", values: [1, 1, 1, 1, 1] },
      { label: "Products & Services", values: [1, 1, 1, 1, 1] },
      { label: "Bookings / Appointments", values: [1, 1, 1, 1, 1] },
      { label: "Customers / CRM", values: [1, 1, 1, 1, 1] },
      { label: "Payments", values: [1, 1, 1, 1, 1] },
      { label: "Invoices", values: [1, 1, 1, 1, 1] },
    ],
  },
  {
    category: "Finance & operations",
    rows: [
      { label: "Customer Credit / Khata", values: [1, 1, 1, 1, 1] },
      { label: "Profit & Loss", values: [1, 1, 1, 1, 1] },
      { label: "Inventory", values: [1, 1, 1, 1, 1] },
      { label: "Low Stock Alerts", values: [1, 1, 1, 1, 1] },
      { label: "Analytics", values: [1, 1, 1, 1, 1] },
      { label: "Reports", values: ["Basic", "Advanced", "Advanced", "Advanced", "Custom"] },
      { label: "Business Health Score", values: ["Basic", "Advanced", "Advanced", "Advanced", "Custom"] },
    ],
  },
  {
    category: "Team",
    rows: [
      { label: "Staff Management", values: [1, 1, 1, 1, 1] },
      { label: "Attendance", values: [1, 1, 1, 1, 1] },
      { label: "Sales Attribution", values: [1, 1, 1, 1, 1] },
      { label: "Staff Commissions", values: [0, 1, 1, 1, "Custom"] },
      { label: "Roles & Permissions", values: ["Basic", "Standard", "Advanced", "Advanced", "Custom"] },
    ],
  },
  {
    category: "Customer growth",
    rows: [
      { label: "Unified Inbox", values: [1, 1, 1, 1, 1] },
      { label: "WhatsApp", values: [1, 1, 1, 1, 1] },
      { label: "Email", values: [1, 1, 1, 1, 1] },
      { label: "Marketing & Campaigns", values: ["Basic", "Advanced", "Advanced", "Advanced", "Custom"] },
      { label: "Reviews & Reputation", values: [1, 1, 1, 1, 1] },
      { label: "Business Listings", values: [1, 1, 1, 1, 1] },
      { label: "Social & Advertising", values: [0, "Basic", "Advanced", "Advanced", "Custom"] },
    ],
  },
  {
    category: "AI",
    rows: [
      { label: "AI Business Assistant", values: ["Basic", 1, 1, 1, "Custom"] },
      { label: "AI Insights", values: ["Basic", 1, 1, 1, "Custom"] },
      { label: "Voice-Entry Sales", values: ["Limited", 1, "Higher usage", "Higher usage", "Custom"] },
      { label: "Photo Digitizer", values: ["Limited", 1, "Higher usage", "Higher usage", "Custom"] },
      { label: "AI Phone Receptionist", values: [0, 0, 1, 1, "Custom"] },
      { label: "AI Automations", values: ["Basic", 1, "Advanced", "Advanced", "Custom"] },
    ],
  },
  {
    category: "Business scale",
    rows: [
      { label: "Multi-location", values: [0, 1, 1, 1, "Custom"] },
      { label: "Connected Data", values: [0, 1, 1, 1, "Custom"] },
      { label: "Integrations", values: ["Core", "More", "Advanced", "Advanced", "Custom"] },
      { label: "Advanced Integrations", values: [0, "Limited", 1, 1, "Custom"] },
      { label: "API Access", values: [0, 0, 1, 1, "Custom"] },
      { label: "Advanced Reporting", values: [0, "Limited", 1, 1, "Custom"] },
      { label: "Advanced Permissions", values: [0, 0, 1, 1, "Custom"] },
    ],
  },
  {
    category: "Support",
    rows: [{ label: "Support", values: ["Email Support", "Priority Email", "Priority Support", "Priority + Phone", "Dedicated Account Manager"] }],
  },
];

export interface UsageRow {
  label: string;
  sub?: string;
  caps?: string;
  icon: LucideIcon;
  brandIcon?: string;
  highlight?: boolean;
  cells: (string | [string, string])[];
}

export const PRICING_USAGE_ROWS: UsageRow[] = [
  { label: "AI Assistant", icon: Sparkles, cells: ["200 / month", "1,000 / month", "3,000 / month", "10,000 / month", "Custom"] },
  {
    label: "AI Receptionist",
    sub: "Calls handling",
    icon: Headphones,
    cells: [["Limited", "(Add-on)"], ["500 mins / month", "Included"], ["1,500 mins / month", "Included"], ["3,000 mins / month", "Included"], "Custom"],
  },
  { label: "AI Insights", icon: BarChart3, cells: ["Basic", "Advanced", "Advanced", "Advanced", "Custom"] },
  { label: "Voice-Entry Sales", icon: Monitor, cells: [["Limited", "(100 entries)"], "500 entries / month", "1,500 entries / month", "5,000 entries / month", "Custom"] },
  { label: "Photo Digitizer", icon: Layers, cells: [["Limited", "(100 images)"], "500 images / month", "1,500 images / month", "5,000 images / month", "Custom"] },
  { label: "AI Automations / Actions", icon: Zap, cells: [["Basic", "(10 / month)"], "100 / month", "300 / month", "1,000 / month", "Custom"] },
  { label: "Messages", sub: "Unified Inbox", icon: BadgeCheck, cells: ["1,000 / month", "5,000 / month", "20,000 / month", "50,000 / month", "Custom"] },
  {
    label: "WhatsApp Messaging",
    sub: "Business API",
    icon: BadgeCheck,
    brandIcon: "/brand/whatsapp.png",
    highlight: true,
    caps: "Incoming messages · Outgoing messages · Templates · Customer conversations · Delivery status & analytics",
    cells: ["1,000 / month", "5,000 / month", "20,000 / month", "50,000 / month", "Custom"],
  },
  { label: "Calls / Minutes", sub: "Click-to-call", icon: Headphones, cells: ["100 mins / month", "500 mins / month", "1,500 mins / month", "3,000 mins / month", "Custom"] },
  {
    label: "Reports",
    icon: BarChart3,
    cells: ["Basic", ["Advanced", "(Scheduled reports)"], ["Advanced", "(Custom reports)"], ["Advanced", "(Custom dashboards)"], "Custom"],
  },
  { label: "Users", icon: BadgeCheck, cells: ["3 Users", "10 Users", "25 Users", ["Custom", "(High scale)"], "Custom"] },
  { label: "Locations / Business Units", icon: Building2, cells: ["1 Location", "2 Locations", "5 Locations", "10 Locations", "Custom"] },
  { label: "Integrations", icon: Layers, cells: ["Core Integrations", "More Integrations", "Advanced Integrations", "Advanced Integrations", "Custom"] },
  { label: "API Access", icon: Zap, cells: ["—", "—", ["Included", "(Rate limited)"], ["Included", "(Higher limits)"], "Custom"] },
  { label: "Data Storage", icon: BarChart3, cells: ["5 GB", "20 GB", "100 GB", "250 GB", "Custom"] },
  { label: "File Storage", icon: Layers, cells: ["2 GB", "10 GB", "50 GB", "100 GB", "Custom"] },
];

export const PRICING_USAGE_HELP_TILES = [
  { icon: Zap, title: "Need more capacity?", desc: "Upgrade your plan or add usage as your business grows." },
  { icon: BarChart3, title: "Real-time visibility", desc: "Track your AI, messages, calls and usage from your dashboard." },
  { icon: BadgeCheck, title: "Limit notifications", desc: "We notify you before you reach your limits." },
  { icon: RefreshCw, title: "Monthly allowance", desc: "Usage allowances reset every billing cycle." },
];

export interface UniversalFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export const PRICING_UNIVERSAL_FEATURES: UniversalFeature[] = [
  { icon: CalendarCheck, title: "14-Day Free Trial", desc: "Explore Noxtill with your own business data before choosing a plan. No credit card required." },
  { icon: ShieldCheck, title: "Secure & Protected", desc: "Encrypted connections, role-based access and controls over what each connected tool can reach." },
  { icon: Headphones, title: "Reliable Support", desc: "Every plan includes support, with faster response levels as you move up the plans." },
  { icon: RefreshCw, title: "Regular Product Updates", desc: "New features and improvements are released continuously — at no extra cost." },
  { icon: Monitor, title: "Access Your Business Anywhere", desc: "Use Noxtill from the web on desktop, and from your phone or tablet browser." },
  { icon: BookOpen, title: "Help Center & Resources", desc: "Documentation, setup guides and learning resources for you and your team." },
  { icon: Lock, title: "Data Privacy", desc: "Your business data is yours. We never sell it, in line with our privacy policy." },
];

export const PRICING_FAQS = [
  { question: "How does the 14-day free trial work?", answer: "You get full access to your chosen plan for 14 days. Set up your business, connect your tools and use Noxtill with your real data. At the end of the trial you choose a plan to continue." },
  { question: "Do I need a credit card to start?", answer: "No. You can start the 14-day trial without entering card details. You only add a payment method when you choose a plan." },
  { question: "How does billing work?", answer: "Plans are billed monthly or annually. Annual billing is charged once for the year at the discounted monthly-equivalent rate, which works out to 20% less than paying monthly." },
  { question: "Can I cancel my plan anytime?", answer: "Yes. There are no long-term contracts. Cancel from your account settings and your plan runs to the end of the period you have already paid for." },
  { question: "Can I upgrade or downgrade my plan?", answer: "Yes, at any time. Upgrades apply immediately with a prorated charge for the rest of the cycle; downgrades take effect at the start of your next billing cycle." },
  { question: "Can I switch between monthly and yearly billing?", answer: "Yes. Switch to yearly at any time to move onto the discounted rate. Switching back to monthly takes effect at your next renewal." },
  { question: "What happens if I reach my usage limits?", answer: "You are notified before you reach a limit so nothing stops unexpectedly. From there you can add usage for the current cycle or move to a plan with a higher allowance." },
  { question: "What are add-ons?", answer: "Add-ons give you extra capacity — more AI usage, receptionist minutes, messages or storage — without changing your plan. They are billed alongside your subscription." },
  { question: "Can I add more users?", answer: "Yes. Each plan includes a number of users, and you can add more as your team grows. Enterprise plans are configured to your team size." },
  { question: "Can I add more locations?", answer: "Yes. Starter covers one location, and Growth, Business and Scale support 2, 5 and 10 locations respectively. Beyond that, Enterprise is tailored to your business." },
  { question: "How does AI usage work?", answer: "Every question you ask the AI Business Assistant counts as one AI action against your monthly allowance. Allowances reset at the start of each billing cycle." },
  { question: "How does AI Receptionist usage work?", answer: "Receptionist usage is measured in call minutes per month. Growth, Business and Scale include an allowance; on Starter it is available as an add-on." },
  { question: "Are WhatsApp messages included?", answer: "Yes. Each plan includes a monthly WhatsApp Business API allowance covering incoming and outgoing messages, templates and customer conversations, with delivery status and analytics." },
  { question: "Are phone calls included?", answer: "Each plan includes a monthly click-to-call minute allowance. AI Receptionist minutes are counted separately from your own outbound calls." },
  { question: "What happens to unused monthly usage?", answer: "Allowances are monthly and reset at the start of each billing cycle. Unused usage does not carry over to the following month." },
  { question: "Can I add more integrations?", answer: "Yes. Every plan includes core integrations, and higher plans unlock more and advanced connectors. You can also request a connector we do not support yet." },
  { question: "Can I access the API?", answer: "API access is included from the Business plan, rate limited on Business and with higher limits on Scale. Enterprise limits are set to your requirements." },
  { question: "What payment methods do you accept?", answer: "We accept major credit and debit cards. Enterprise customers can arrange invoiced billing with their account contact." },
  { question: "What happens if I upgrade during a billing cycle?", answer: "The new plan applies straight away and you are charged the prorated difference for the remainder of the current cycle. Your renewal date does not change." },
  { question: "Is my business data secure?", answer: "Your data travels over encrypted connections and is stored with strict access controls. You decide who on your team can see what, and what each connected tool can access." },
  { question: "How do I contact support?", answer: "Support is available from inside Noxtill and from the contact page. Response priority depends on your plan, and Enterprise customers get a dedicated account manager." },
];

export const PRICING_FINAL_CTA = {
  headline: "Choose the plan that fits your business",
  body: "Start with the tools you need today and scale as your business grows.",
  primaryCta: "Start 14-Day Free Trial",
  primaryHref: "/signup",
  secondaryCta: "Contact Sales",
  secondaryHref: "/contact",
  tertiaryCta: "Book a Demo",
  tertiaryHref: "/demo",
  trust: ["No credit card required", "14-day free trial", "Cancel anytime"],
};
