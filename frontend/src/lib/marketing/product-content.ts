import type { LucideIcon } from "lucide-react";
import {
  Moon,
  Zap,
  ClipboardList,
  CalendarClock,
  Wallet,
  Package,
  BarChart3,
  Boxes,
  LineChart,
  FileText,
  Gauge,
  UserCog,
  Star,
  MessageCircle,
  Megaphone,
  MapPin,
  Share2,
  Building2,
  Mic,
  Camera,
  Bot,
  Lightbulb,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";

/**
 * Product page content. Group titles/order and every item's slug/label match
 * `PRODUCT_GROUPS` in `@/lib/marketing/nav-links.ts` exactly — those slugs are the anchor-ID
 * contract the mega-menu's `/product#<slug>` links depend on. Descriptions here are the
 * fuller per-card copy from the source design (Product.dc.html); nav-links.ts keeps the
 * shorter versions used in the mega-menu panel.
 */

export interface ProductFeature {
  slug: string;
  name: string;
  icon: LucideIcon;
  description: string;
}

export interface ProductGroup {
  title: string;
  intro: string;
  items: ProductFeature[];
}

export const PRODUCT_HERO = {
  eyebrow: "The product",
  headlineLead: "One connected business",
  headlineHighlight: "operating system",
  body: "Noxtill is not a set of separate apps bolted together. The till, the diary, the credit ledger, the stockroom and the reports are one system — so one sale updates every number you rely on, and the nightly close tells you how the day actually went.",
  subBody: "Every feature below is part of the same account. Start with the one that hurts most today; the rest are already connected when you need them.",
  primaryCta: "Start your 14-day free trial",
  secondaryCta: "Book a demo",
};

export const PRODUCT_GROUPS_CONTENT: ProductGroup[] = [
  {
    title: "Run your day",
    intro: "The work that happens between opening and closing — taking money, serving customers, keeping the diary straight.",
    items: [
      {
        slug: "nightly-close",
        name: "Nightly Close",
        icon: Moon,
        description: "Your whole day in one clear message: sales, profit, tomorrow's bookings, outstanding credit and what needs attention.",
      },
      {
        slug: "fast-sale",
        name: "Fast Sale",
        icon: Zap,
        description: "Take payment in seconds while stock, profit, the customer record, the receipt and staff commission all update from the same sale.",
      },
      {
        slug: "orders",
        name: "Orders",
        icon: ClipboardList,
        description: "Manage orders, payments, fulfilment status and customer details in one workflow instead of three.",
      },
      {
        slug: "bookings",
        name: "Bookings",
        icon: CalendarClock,
        description: "Appointments, staff availability, automatic reminders and waitlist fills — connected to the till and the customer record.",
      },
      {
        slug: "credit",
        name: "Customer Credit",
        icon: Wallet,
        description: "A searchable digital khata: who owes what, how old the balance is, what they've paid and when reminders go out.",
      },
      {
        slug: "catalogue",
        name: "Products & Services",
        icon: Package,
        description: "Prices, costs and real margins per item, so you know which lines are actually worth selling.",
      },
    ],
  },
  {
    title: "Know your numbers",
    intro: "Reporting that comes from the day's real activity, not from a spreadsheet you have to keep up to date.",
    items: [
      {
        slug: "pnl",
        name: "Profit & Loss",
        icon: BarChart3,
        description: "Sales, costs, gross profit and item-level margin — the difference between busy and profitable.",
      },
      {
        slug: "inventory",
        name: "Inventory",
        icon: Boxes,
        description: "Stock levels, purchases, wastage and low-stock alerts, kept in step with every sale.",
      },
      {
        slug: "analytics",
        name: "Analytics",
        icon: LineChart,
        description: "Retention, repeat customers, revenue sources and performance over time.",
      },
      {
        slug: "reports",
        name: "Reports",
        icon: FileText,
        description: "Business reports as PDF or Excel, delivered to WhatsApp or email on the schedule you set.",
      },
      {
        slug: "health-score",
        name: "Business Health Score",
        icon: Gauge,
        description: "One score built from sales, profit, customers, inventory and bookings — with the reasons behind it.",
      },
      {
        slug: "staff",
        name: "Staff & Commissions",
        icon: UserCog,
        description: "Attendance, sales attribution and commission owed, calculated from the sales themselves.",
      },
    ],
  },
  {
    title: "Grow",
    intro: "Getting customers back through the door, and being easy to find and easy to answer.",
    items: [
      {
        slug: "reviews",
        name: "Reviews & Reputation",
        icon: Star,
        description: "Monitor reviews across supported platforms, understand sentiment and respond with drafts you approve.",
      },
      {
        slug: "inbox",
        name: "Unified Inbox",
        icon: MessageCircle,
        description: "WhatsApp, email, voice, website chat and social messages in one inbox, each with full customer context.",
      },
      {
        slug: "marketing",
        name: "Marketing & Campaigns",
        icon: Megaphone,
        description: "Segment on real purchase behaviour, run campaigns and see which ones produced sales.",
      },
      {
        slug: "listings",
        name: "Business Listings",
        icon: MapPin,
        description: "Hours, contact details and services kept accurate across supported listings and profiles.",
      },
      {
        slug: "social",
        name: "Social & Advertising",
        icon: Share2,
        description: "Plan, publish and measure social content and ads using connected business data.",
      },
      {
        slug: "multi-location",
        name: "Multi-location",
        icon: Building2,
        description: "Branches, staff, stock, bookings and reporting across locations in one account.",
      },
    ],
  },
  {
    title: "Powered by AI",
    intro: "AI that reads your actual business records — and tells you when it does not have the answer.",
    items: [
      {
        slug: "voice-sales",
        name: "Voice-Entry Sales",
        icon: Mic,
        description: "Say the sale out loud, confirm the details, and Noxtill creates the transaction — no typing every line.",
      },
      {
        slug: "photo-digitizer",
        name: "Photo Digitizer",
        icon: Camera,
        description: "Photograph a paper register and turn it into structured, searchable business data.",
      },
      {
        slug: "assistant",
        name: "Business Assistant",
        icon: Bot,
        description: "Ask about sales, profit, stock or who owes money and get an answer from your connected data in seconds.",
      },
      {
        slug: "ai-insights",
        name: "AI Insights",
        icon: Lightbulb,
        description: "What changed in the business, why it changed, and what is worth doing about it.",
      },
      {
        slug: "ai-receptionist",
        name: "AI Phone Receptionist",
        icon: PhoneCall,
        description: "Answers calls, understands intent, gives approved information, captures leads and books appointments.",
      },
      {
        slug: "ai-promise",
        name: "What Our AI Never Does",
        icon: ShieldCheck,
        description: "No invented numbers, honest uncertainty, and human approval before anything sensitive happens.",
      },
    ],
  },
];

export const PRODUCT_CALLOUT = {
  title: "How the pieces fit together",
  body: "A booking becomes a sale at the till. That sale drops stock, records the margin, credits the staff member and — if the customer pays later — opens a line in the credit ledger. Two hours after the appointment a review request goes out. At the close time you chose, all of it arrives as one message. Ask the assistant a follow-up question and it reads the same records, not a copy.",
  links: [
    { label: "Business software integrations", href: "/integrations-directory" },
    { label: "Pricing & plans", href: "/pricing" },
    { label: "Solutions by business type", href: "/solutions" },
    { label: "What our AI never does", href: "/product#ai-promise" },
  ],
};
