import type { LucideIcon } from "lucide-react";
import {
  Star,
  CalendarClock,
  Receipt,
  Wallet,
  Package,
  BarChart3,
  Users,
  UserCog,
  Megaphone,
  Building2,
  Search,
  MessageCircle,
  Moon,
  Smartphone,
  FileText,
  Globe,
  CalendarCheck,
  ShoppingBag,
  Globe2,
  Download,
  WifiOff,
  Languages,
  ShieldCheck,
  BellRing,
} from "lucide-react";

export const HERO = {
  eyebrow: "",
  headlineLine1: "Your whole business,",
  headlineLine2: "one system.",
  subheadline: "Close your day in one tap.",
  body: "Reviews, bookings, sales, billing, customer credit, inventory, profit, and staff — unified. Every night at 10 PM your Nightly Close arrives: your whole day in one message, whatever channel you prefer.",
  primaryCta: "Get your first Nightly Close tonight",
  secondaryCta: "See it in action",
  trust: ["14-day free trial", "No card required", "Cancel anytime"],
};

export const STATS = [
  { value: "2,400+", label: "businesses on Noxtill" },
  { value: "14", label: "countries active" },
  { value: "4.9 ★", label: "avg customer rating earned" },
  { value: "$3.2M+", label: "credit recovered for owners" },
];

export interface HowItWorksStep {
  icon: LucideIcon;
  step: string;
  title: string;
  description: string;
}

export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    icon: CalendarCheck,
    step: "01",
    title: "Customer books",
    description:
      "They pick a service, staff member, and time slot. A confirmation goes out instantly. Reminders fire at 24h and 2h — automatic, in their language.",
  },
  {
    icon: ShoppingBag,
    step: "02",
    title: "Sale completed",
    description:
      "One-tap billing at the counter. Stock decrements. The customer record updates. Profit flows into your P&L. All at once, zero effort.",
  },
  {
    icon: Star,
    step: "03",
    title: "Review requested",
    description:
      "Two hours after completion a review request goes out. Five-star customers go to Google. Complaints stay private and become support tickets.",
  },
  {
    icon: Moon,
    step: "04",
    title: "Nightly Close arrives",
    description:
      "At 10 PM local time: sales, profit, new reviews, tomorrow's bookings, credit recovered, low-stock alerts. One tap for the full report.",
  },
];

export interface ModuleCard {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const MODULES: ModuleCard[] = [
  { icon: Star, title: "Reviews & Reputation", description: "Unified inbox, auto-requests, Google routing, QR code, reply AI, widget." },
  { icon: CalendarClock, title: "Bookings & Appointments", description: "Public booking link, staff calendar, reminders, one-tap reschedule." },
  { icon: Receipt, title: "Orders & Billing", description: "Fast POS, invoices, quotations, online orders, table QR, receipt printing." },
  { icon: Wallet, title: "Customer Credit Ledger", description: "Digital udhaar/Record Book/tab. Balances, statements, automated polite reminders." },
  { icon: Package, title: "Inventory", description: "Auto-decrement on sale, low-stock alerts, wastage tracking, supplier costs." },
  { icon: BarChart3, title: "Profit & Loss Engine", description: "True P&L, hourly patterns, best sellers, dead stock, AI what-if calculator." },
  { icon: Users, title: "Customer CRM", description: "Full history, auto-tags, birthday greetings, segments, one-tap campaigns." },
  { icon: UserCog, title: "Staff Management", description: "Attendance, commission rules, performance reports, task assignment." },
  { icon: Megaphone, title: "Marketing & Growth", description: "Broadcasts, review-to-social posts, referral codes, competitor tracking." },
  { icon: Building2, title: "Multi-location", description: "All branches, one login. Roll-up dashboards, comparisons, branch AI." },
  { icon: Search, title: "Deep Search", description: "Type 3 characters, find anything — customers, orders, reviews, settings." },
  { icon: MessageCircle, title: "AI Business Assistant", description: "Ask your own data “Today's sales?” “What's this customer's balance?”" },
  { icon: Moon, title: "Nightly Close", description: "Your whole day in one message, every night at 10 PM in your timezone." },
  { icon: Smartphone, title: "Mobile App + Offline", description: "React Native iOS & Android. Sales queue offline and sync when you're back." },
  { icon: FileText, title: "Reports & Exports", description: "Branded PDFs, Excel exports, accountant-ready P&L, full account zip." },
  { icon: Globe, title: "Multi-language & RTL", description: "English, Spanish, Arabic, Urdu, Hindi + more. Full right-to-left support." },
];

export const CREDIT_MODULE = {
  eyebrow: "Credit Ledger",
  headline: "The tab, digitized. Politely collected.",
  body: "Every small business extends credit to regulars. Record Bookbook calls it Record Book. Argentinian shops say fiado. Noxtill digitizes every debt, tracks every payment, and sends one-tap polite reminders — recovering money owners forget to chase, without a single awkward conversation.",
  stats: [
    { value: "$3.2M+", label: "recovered by businesses" },
    { value: "91%", label: "collection rate with reminders" },
    { value: "0", label: "awkward conversations" },
    { value: "∞", label: "customer relationships kept" },
  ],
  debtors: [
    { initials: "IM", name: "Ibrahim Al-Mansoori", days: "12 days outstanding", amount: "AED 1,240" },
    { initials: "FQ", name: "Fatima Qureshi", days: "7 days outstanding", amount: "AED 680" },
    { initials: "CM", name: "Carlos Mendez", days: "21 days outstanding", amount: "AED 920" },
    { initials: "PS", name: "Priya Sharma", days: "4 days outstanding", amount: "AED 460" },
  ],
  outstandingTotal: "AED 4,820 outstanding",
};

export const ASSISTANT_MODULE = {
  eyebrow: "AI Business Assistant",
  headline: "Ask your business anything.",
  body: "The AI Business Assistant answers questions about your own data — sales, staff, stock, customers, credit — using Claude tool calls scoped strictly to your business. It never invents a number, never guesses, never shares your data with anyone.",
  checks: [
    "Works in your language, answers in your language",
    "Every number sourced from a live tool result — never fabricated",
    "Read-only in v1 — it asks before it ever changes anything",
    "Coming soon: ask over WhatsApp without logging in",
  ],
  conversation: [
    { role: "user" as const, text: "What sold most today?" },
    {
      role: "assistant" as const,
      text: "Your top seller today is the Cardamom Latte — 47 cups, AED 517 revenue, AED 191 profit. Second is the Croissant at 31 units. You're on track for your best Monday in six weeks.",
    },
    { role: "user" as const, text: "Which staff led on sales?" },
    {
      role: "assistant" as const,
      text: "Mariam led today with AED 1,240 across 34 transactions. Ahmed is close behind at AED 980. Both are above their weekly average — good.",
    },
  ],
};

export interface LandingBusinessType {
  key: string;
  label: string;
  preview: string;
}

export const BUSINESS_TYPES: LandingBusinessType[] = [
  { key: "restaurant", label: "Restaurant", preview: "Table orders, delivery, POS, inventory (food cost), credit ledger, staff commissions, Nightly Close" },
  { key: "cafe", label: "Café", preview: "Reviews, bookings, POS, inventory (coffee stock), credit ledger, staff commissions, Nightly Close" },
  { key: "bakery", label: "Bakery", preview: "POS, inventory (ingredient stock, wastage tracking), pre-orders, credit ledger, Nightly Close" },
  { key: "barbershop", label: "Barbershop", preview: "Bookings, staff calendar, POS, reviews, customer credit, Nightly Close" },
  { key: "hair_salon", label: "Hair Salon", preview: "Bookings, staff commissions, retail inventory, reviews, credit ledger, Nightly Close" },
  { key: "nail_salon", label: "Nail Salon", preview: "Bookings, service menu, staff calendar, reviews, Nightly Close" },
  { key: "spa", label: "Spa", preview: "Bookings, packages, staff commissions, reviews, credit ledger, Nightly Close" },
  { key: "gym", label: "Gym", preview: "Class bookings, member credit, staff management, referral codes, Nightly Close" },
  { key: "yoga_studio", label: "Yoga Studio", preview: "Class bookings, instructor calendar, membership credit, reviews, Nightly Close" },
  { key: "pilates_studio", label: "Pilates Studio", preview: "Class bookings, instructor calendar, membership credit, reviews, Nightly Close" },
  { key: "clinic", label: "Clinic", preview: "Appointment bookings, patient records, billing, reminders, Nightly Close" },
  { key: "dental", label: "Dental Practice", preview: "Appointment bookings, patient credit ledger, staff calendar, reminders, Nightly Close" },
  { key: "pharmacy", label: "Pharmacy", preview: "POS, inventory (batch/expiry tracking), customer credit, low-stock alerts, Nightly Close" },
  { key: "vet_clinic", label: "Vet Clinic", preview: "Appointment bookings, patient records, billing, reminders, Nightly Close" },
  { key: "law_firm", label: "Law Firm", preview: "Client bookings, billing & invoices, customer credit ledger, staff management, Nightly Close" },
  { key: "accountancy", label: "Accountancy", preview: "Client bookings, billing & invoices, deep search, staff management, Nightly Close" },
  { key: "plumber", label: "Plumber", preview: "Job bookings, quotations, mobile app + offline, customer credit, Nightly Close" },
  { key: "electrician", label: "Electrician", preview: "Job bookings, quotations, mobile app + offline, customer credit, Nightly Close" },
  { key: "hotel", label: "Hotel", preview: "Bookings, POS, multi-location, staff management, reviews, Nightly Close" },
  { key: "guesthouse", label: "Guesthouse", preview: "Bookings, customer credit ledger, reviews, Nightly Close" },
  { key: "photography_studio", label: "Photography Studio", preview: "Bookings, quotations, customer credit ledger, portfolio-ready reviews, Nightly Close" },
  { key: "agency", label: "Agency", preview: "Client bookings, billing & invoices, staff management, deep search, Nightly Close" },
  { key: "ecommerce", label: "E-commerce", preview: "Online orders, inventory, customer CRM, marketing & growth, Nightly Close" },
  { key: "retail_shop", label: "Retail Shop", preview: "POS, inventory, low-stock alerts, customer credit ledger, Nightly Close" },
  { key: "wholesaler", label: "Wholesaler", preview: "Bulk orders, inventory, customer credit ledger, supplier costs, Nightly Close" },
  { key: "florist", label: "Florist", preview: "POS, orders, inventory (perishable tracking), reviews, Nightly Close" },
  { key: "tailor", label: "Tailor", preview: "Job bookings, quotations, customer credit ledger, staff management, Nightly Close" },
  { key: "bookshop", label: "Bookshop", preview: "POS, inventory, customer CRM, reviews, Nightly Close" },
  { key: "car_workshop", label: "Car Workshop", preview: "Job bookings, quotations, parts inventory, customer credit ledger, Nightly Close" },
  { key: "school", label: "School", preview: "Enrollment bookings, billing & invoices, customer credit ledger, staff management, Nightly Close" },
];

export interface LandingPlan {
  key: string;
  name: string;
  eyebrow: string;
  price: string;
  priceSuffix: string;
  description?: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

/** Marketing-site pricing display — intentionally separate from the internal PLANS/quota data used by the app itself. */
export const LANDING_PLANS: LandingPlan[] = [
  {
    key: "basic",
    name: "Basic",
    eyebrow: "BASIC",
    price: "$10",
    priceSuffix: "/mo · 1 business",
    features: [
      "Review inbox & unified inbox",
      "Auto review requests",
      "Google / Facebook routing",
      "AI reply drafts",
      "QR code & review widget",
      "150 messages / mo",
      "1 user",
    ],
    cta: "Start free",
  },
  {
    key: "growth",
    name: "Growth",
    eyebrow: "GROWTH",
    price: "$25",
    priceSuffix: "/mo · 1 business",
    description: "The complete commerce loop.",
    features: [
      "Everything in Basic",
      "Bookings & appointments",
      "Orders, billing & invoices",
      "Customer credit ledger",
      "CRM & segment campaigns",
      "600 messages / mo, 3 users",
    ],
    cta: "Start free",
    featured: true,
  },
  {
    key: "business",
    name: "Business",
    eyebrow: "BUSINESS",
    price: "$50",
    priceSuffix: "/mo · 1 business",
    features: [
      "Everything in Growth",
      "Profit & Loss engine",
      "AI what-if calculator",
      "Inventory management",
      "Staff & commissions",
      "AI Business Assistant",
      "Analytics & exports",
      "2,000 messages / mo, 10 users",
    ],
    cta: "Start free",
  },
  {
    key: "enterprise",
    name: "from $100",
    eyebrow: "ENTERPRISE",
    price: "from $100",
    priceSuffix: "/mo · unlimited locations",
    features: [
      "Everything in Business",
      "Multi-location dashboard",
      "Branch AI advisor",
      "Unlimited users",
      "Custom message limits",
      "Priority support & SLA",
      "Custom onboarding",
    ],
    cta: "Contact us",
  },
];

export interface TrustItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const TRUST_ITEMS: TrustItem[] = [
  {
    icon: Globe2,
    title: "Your data, yours alone",
    description: "Strict multi-tenant isolation at every layer — database, search indexes, AI tool calls. Cross-tenant access is architecturally impossible.",
  },
  {
    icon: Download,
    title: "Full export, always",
    description: "Settings → Export → done. Your entire account as a zip file, any time, in one click. Your data is never hostage.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    description: "Sales entered without connectivity queue locally and sync when you're back. Built for markets with unreliable power and internet.",
  },
  {
    icon: Languages,
    title: "Speaks your language",
    description: "English, Spanish, Portuguese, French, Arabic, Urdu, Hindi — and growing. Full RTL support. AI matches the owner's language automatically.",
  },
  {
    icon: ShieldCheck,
    title: "Daily automated backups",
    description: "Automated backups every 24 hours with tested restores. Your records are safe regardless of what happens on our end.",
  },
  {
    icon: BellRing,
    title: "Immutable audit log",
    description: "Every financially significant action — sale, payment, refund, deletion — is permanently logged with actor, values, and timestamp.",
  },
];

export const FINAL_CTA = {
  headlineLine1: "Get your first Nightly Close",
  headlineLine2: "tonight.",
  body: "Set up in ten minutes. One system for your whole business. Every night at 10 PM, your whole day in one message.",
  cta: "Start free — no card required",
  trust: ["14-day free trial", "Works in 14 countries", "Cancel anytime"],
};

export const FOOTER_LINKS = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Business types", href: "#business-types" },
    { label: "Deep Search", href: "#features" },
    { label: "AI Assistant", href: "#features" },
    { label: "Mobile app", href: "#features" },
    { label: "Changelog", href: "#" },
  ],
  resources: [
    { label: "Documentation", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Help center", href: "#" },
    { label: "Status page", href: "#" },
    { label: "API", href: "#" },
  ],
  company: [
    { label: "About", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
    { label: "Contact", href: "#" },
    { label: "Data export", href: "#" },
  ],
};
