import type { LucideIcon } from "lucide-react";
import {
  Scissors,
  UtensilsCrossed,
  Stethoscope,
  Dumbbell,
  Store,
  Wrench,
  Sparkles,
  Cookie,
  PawPrint,
  Shirt,
  Camera,
  GraduationCap,
  HardHat,
  SprayCan,
  PartyPopper,
  Droplets,
} from "lucide-react";
import type { FaqItem } from "@/lib/marketing/faq-jsonld";

/**
 * Full per-card copy for /solutions, ported from the design's Solutions.dc.html.
 * Business-type and need `slug`s MUST match SOLUTIONS_BUSINESS_TYPES / SOLUTIONS_MORE_BUSINESS_TYPES /
 * SOLUTIONS_NEEDS in nav-links.ts — the mega-menu links directly to `#slug` on this page.
 * `/product/[slug]/` module links point at the real anchors on the Product hub (nav-links.ts
 * PRODUCT_GROUPS). `/integrations/[slug]/` detail routes are out of scope this pass, so every
 * integration chip links to the `/integrations` hub instead of a per-integration anchor.
 */

export interface SolutionLink {
  name: string;
  href: string;
}

const MODULES = {
  pos: { name: "Fast Sale", href: "/product#fast-sale" },
  orders: { name: "Orders", href: "/product#orders" },
  bookings: { name: "Bookings", href: "/product#bookings" },
  credit: { name: "Customer Credit", href: "/product#credit" },
  products: { name: "Products & Services", href: "/product#catalogue" },
  inventory: { name: "Inventory", href: "/product#inventory" },
  pnl: { name: "Profit & Loss", href: "/product#pnl" },
  reports: { name: "Reports", href: "/product#reports" },
  staff: { name: "Staff & Commissions", href: "/product#staff" },
  reputation: { name: "Reviews & Reputation", href: "/product#reviews" },
  inbox: { name: "Unified Inbox", href: "/product#inbox" },
  marketing: { name: "Marketing & Campaigns", href: "/product#marketing" },
  assistant: { name: "Business Assistant", href: "/product#assistant" },
  reception: { name: "AI Phone Receptionist", href: "/product#ai-receptionist" },
  multi: { name: "Multi-location", href: "/product#multi-location" },
  analytics: { name: "Analytics", href: "/product#analytics" },
  digitizer: { name: "Photo Digitizer", href: "/product#photo-digitizer" },
  health: { name: "Business Health Score", href: "/product#health-score" },
  listings: { name: "Business Listings", href: "/product#listings" },
} satisfies Record<string, SolutionLink>;

const INTEGRATIONS = {
  whatsapp: { name: "WhatsApp", href: "/integrations-directory" },
  stripe: { name: "Stripe", href: "/integrations-directory" },
  square: { name: "Square", href: "/integrations-directory" },
  shopify: { name: "Shopify", href: "/integrations-directory" },
  woo: { name: "WooCommerce", href: "/integrations-directory" },
  qb: { name: "QuickBooks", href: "/integrations-directory" },
  gbp: { name: "Google Business Profile", href: "/integrations-directory" },
  instagram: { name: "Instagram", href: "/integrations-directory" },
  mailchimp: { name: "Mailchimp", href: "/integrations-directory" },
  twilio: { name: "Twilio", href: "/integrations-directory" },
} satisfies Record<string, SolutionLink>;

export interface BusinessTypeSolution {
  slug: string;
  name: string;
  icon: LucideIcon;
  tier: "Popular business type" | "More business types";
  problem: string;
  flow: string[];
  outcome: string;
  modules: SolutionLink[];
  integrations: SolutionLink[];
  cta: string;
  keywords: string;
}

export const SOLUTIONS_HERO = {
  eyebrow: "Built around your business",
  headlineLead: "Business software built for",
  headlineAccent: "the way you work",
  body: "Whether you run a salon, restaurant, clinic, shop, service business or several locations, Noxtill brings sales, customers, bookings, inventory, payments, communication and business intelligence into one connected system.",
  primaryCta: "Start 14-day free trial",
  secondaryCta: "Explore all solutions",
  trust: ["No credit card required", "14-day free trial", "Cancel anytime"],
};

export const BUSINESS_TYPES: BusinessTypeSolution[] = [
  {
    slug: "salons",
    name: "Salons & Barbershops",
    icon: Scissors,
    tier: "Popular business type",
    problem: "Empty chairs from no-shows, and commission worked out on paper at the end of the week.",
    flow: ["Booking", "Reminder", "Service", "Payment", "Staff commission", "Review request"],
    outcome: "Fewer gaps in the day, and commission that calculates itself from the sales.",
    modules: [MODULES.bookings, MODULES.pos, MODULES.staff, MODULES.reputation, MODULES.credit],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.gbp, INTEGRATIONS.instagram],
    cta: "Run your salon with Noxtill",
    keywords: "salon barbershop haircut beard colour blow-dry commission bookings",
  },
  {
    slug: "restaurants",
    name: "Restaurants & Cafés",
    icon: UtensilsCrossed,
    tier: "Popular business type",
    problem: "Dine-in, takeaway and delivery each land in a different place, and wastage never makes it into the numbers.",
    flow: ["Order", "Table or delivery", "Payment", "Stock deducted", "Profit updated", "Report"],
    outcome: "One profit figure across every channel, with wastage counted.",
    modules: [MODULES.pos, MODULES.orders, MODULES.inventory, MODULES.pnl, MODULES.health],
    integrations: [INTEGRATIONS.square, INTEGRATIONS.stripe, INTEGRATIONS.qb],
    cta: "Run your restaurant with Noxtill",
    keywords: "restaurant cafe dine-in takeaway delivery tables kitchen wastage menu",
  },
  {
    slug: "clinics",
    name: "Dental & Medical Clinics",
    icon: Stethoscope,
    tier: "Popular business type",
    problem: "Front desk buried in appointment calls, follow-ups and payment chasing.",
    flow: ["Appointment", "Reminder", "Visit", "Billing", "Follow-up", "Review request"],
    outcome:
      "A calmer front desk: reminders, billing and follow-ups handled without extra staff. Business operations only — Noxtill is not a clinical records system.",
    modules: [MODULES.bookings, MODULES.reception, MODULES.inbox, MODULES.credit, MODULES.reports],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.gbp, INTEGRATIONS.twilio],
    cta: "Run your clinic with Noxtill",
    keywords: "dental medical clinic patient appointments reminders billing front desk",
  },
  {
    slug: "gyms",
    name: "Gyms & Fitness Studios",
    icon: Dumbbell,
    tier: "Popular business type",
    problem: "Memberships lapse quietly and class attendance lives in a separate app.",
    flow: ["New member", "Membership payment", "Class booking", "Reminder", "Attendance", "Renewal"],
    outcome: "Renewals you can see coming, and attendance tied to the member record.",
    modules: [MODULES.bookings, MODULES.credit, MODULES.marketing, MODULES.analytics, MODULES.reports],
    integrations: [INTEGRATIONS.stripe, INTEGRATIONS.whatsapp, INTEGRATIONS.mailchimp],
    cta: "Run your gym with Noxtill",
    keywords: "gym fitness studio membership classes attendance renewal trainer",
  },
  {
    slug: "retail",
    name: "Retail & Shops",
    icon: Store,
    tier: "Popular business type",
    problem: "Stock counts drift from reality, and regulars who pay later are tracked in a notebook.",
    flow: ["Sale", "Payment or credit", "Stock update", "Customer record", "Margin", "Report"],
    outcome: "Stock you can trust and a credit ledger that remembers for you.",
    modules: [MODULES.pos, MODULES.inventory, MODULES.credit, MODULES.products, MODULES.pnl],
    integrations: [INTEGRATIONS.shopify, INTEGRATIONS.woo, INTEGRATIONS.square],
    cta: "Run your shop with Noxtill",
    keywords: "retail shop store pos stock inventory khata credit counter",
  },
  {
    slug: "auto",
    name: "Auto Repair",
    icon: Wrench,
    tier: "Popular business type",
    problem: "Jobs quoted verbally, parts bought without tracking, and payment collected whenever.",
    flow: ["Enquiry", "Job booked", "Parts used", "Job completed", "Invoice", "Payment or credit"],
    outcome: "Every job with its parts, labour and margin attached — and nothing invoiced twice.",
    modules: [MODULES.bookings, MODULES.orders, MODULES.inventory, MODULES.credit, MODULES.pnl],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.stripe, INTEGRATIONS.gbp],
    cta: "Run your workshop with Noxtill",
    keywords: "auto repair garage mechanic workshop jobs parts labour vehicle service",
  },
  {
    slug: "spas",
    name: "Spas & Beauty",
    icon: Sparkles,
    tier: "Popular business type",
    problem: "Packages and prepaid treatments are hard to track, and rebooking depends on memory.",
    flow: ["Booking", "Package or treatment", "Payment", "Balance tracked", "Rebooking prompt", "Review"],
    outcome: "Packages that count down accurately, and clients who come back on schedule.",
    modules: [MODULES.bookings, MODULES.products, MODULES.credit, MODULES.marketing, MODULES.reputation],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.instagram, INTEGRATIONS.stripe],
    cta: "Run your spa with Noxtill",
    keywords: "spa beauty treatment package facial massage rebooking prepaid",
  },
  {
    slug: "bakeries",
    name: "Bakeries",
    icon: Cookie,
    tier: "Popular business type",
    problem: "Custom orders on scraps of paper, and no idea which lines actually make money after waste.",
    flow: ["Custom order", "Deposit", "Production", "Collection", "Balance paid", "Waste recorded"],
    outcome: "Custom orders that never get lost, and true margin per product after waste.",
    modules: [MODULES.orders, MODULES.pos, MODULES.inventory, MODULES.products, MODULES.pnl],
    integrations: [INTEGRATIONS.square, INTEGRATIONS.stripe, INTEGRATIONS.whatsapp],
    cta: "Run your bakery with Noxtill",
    keywords: "bakery cakes pastry bread custom order deposit waste production",
  },
  {
    slug: "pet-grooming",
    name: "Pet Grooming",
    icon: PawPrint,
    tier: "More business types",
    problem: "Repeat clients whose pet details and preferences live only in someone's head.",
    flow: ["Appointment", "Reminder", "Grooming visit", "Payment", "History saved", "Rebooking"],
    outcome: "Every visit builds a history, so the next appointment starts informed.",
    modules: [MODULES.bookings, MODULES.pos, MODULES.inbox, MODULES.reputation],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.gbp, INTEGRATIONS.instagram],
    cta: "Run your grooming business with Noxtill",
    keywords: "pet grooming dog cat appointments groomer history",
  },
  {
    slug: "tailors",
    name: "Tailors & Alterations",
    icon: Shirt,
    tier: "More business types",
    problem: "Orders with due dates, part-payments and pickup promises scattered across notebooks.",
    flow: ["Order taken", "Deposit", "Due date set", "Ready notification", "Balance paid", "Collected"],
    outcome: "Nothing collected late, and no forgotten balances at handover.",
    modules: [MODULES.orders, MODULES.credit, MODULES.inbox, MODULES.pos, MODULES.reports],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.stripe],
    cta: "Run your tailoring business with Noxtill",
    keywords: "tailor alterations stitching measurements due date deposit garment",
  },
  {
    slug: "photographers",
    name: "Photographers",
    icon: Camera,
    tier: "More business types",
    problem: "Shoots booked months ahead with deposits and final balances easy to lose track of.",
    flow: ["Enquiry", "Booking & deposit", "Shoot", "Delivery", "Final balance", "Review request"],
    outcome: "Deposits and balances visible per booking, months in advance.",
    modules: [MODULES.bookings, MODULES.credit, MODULES.orders, MODULES.marketing, MODULES.reputation],
    integrations: [INTEGRATIONS.stripe, INTEGRATIONS.instagram, INTEGRATIONS.whatsapp],
    cta: "Run your studio with Noxtill",
    keywords: "photographer wedding portrait event shoot deposit package studio",
  },
  {
    slug: "tutoring",
    name: "Tutoring & Academies",
    icon: GraduationCap,
    tier: "More business types",
    problem: "Monthly fees collected inconsistently and class attendance tracked on paper.",
    flow: ["Enrolment", "Fee schedule", "Class booking", "Attendance", "Fee reminder", "Receipt"],
    outcome:
      "Fees collected on time without awkward conversations. Business operations only — not a full school management system.",
    modules: [MODULES.bookings, MODULES.credit, MODULES.inbox, MODULES.reports, MODULES.analytics],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.stripe],
    cta: "Run your academy with Noxtill",
    keywords: "tutoring academy classes students fees attendance enrolment",
  },
  {
    slug: "home-services",
    name: "Home Services",
    icon: HardHat,
    tier: "More business types",
    problem: "Leads lost between the call and the visit, and technicians dispatched by phone.",
    flow: ["Lead", "Quote", "Job scheduled", "Staff assigned", "Job done", "Invoice & review"],
    outcome: "Leads that convert because nothing sits unanswered, and jobs invoiced same day.",
    modules: [MODULES.bookings, MODULES.reception, MODULES.staff, MODULES.orders, MODULES.reputation],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.stripe, INTEGRATIONS.gbp],
    cta: "Run your service business with Noxtill",
    keywords: "home services plumbing electrical hvac handyman landscaping technician dispatch",
  },
  {
    slug: "cleaning",
    name: "Cleaning",
    icon: SprayCan,
    tier: "More business types",
    problem: "Recurring visits, changing schedules and staff rotas managed over messages.",
    flow: ["Lead", "Recurring booking", "Staff assigned", "Service", "Invoice", "Review"],
    outcome: "Recurring work that repeats itself, with the right cleaner assigned.",
    modules: [MODULES.bookings, MODULES.staff, MODULES.orders, MODULES.credit, MODULES.inbox],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.stripe, INTEGRATIONS.gbp],
    cta: "Run your cleaning business with Noxtill",
    keywords: "cleaning recurring housekeeping office rota schedule staff",
  },
  {
    slug: "venues",
    name: "Event Venues",
    icon: PartyPopper,
    tier: "More business types",
    problem: "Double-booking risk, staged payments and long lead times across a shared calendar.",
    flow: ["Enquiry", "Date held", "Deposit", "Event planning", "Final payment", "Event delivered"],
    outcome: "A calendar nobody can double-book and payments that arrive in stages.",
    modules: [MODULES.bookings, MODULES.credit, MODULES.orders, MODULES.staff, MODULES.reports],
    integrations: [INTEGRATIONS.stripe, INTEGRATIONS.whatsapp, INTEGRATIONS.gbp],
    cta: "Run your venue with Noxtill",
    keywords: "event venue hall wedding banquet calendar deposit booking",
  },
  {
    slug: "laundry",
    name: "Laundry & Dry Cleaning",
    icon: Droplets,
    tier: "More business types",
    problem: "Tickets, item counts and pickup status handled with paper tags.",
    flow: ["Order in", "Items counted", "Status updates", "Ready message", "Payment or credit", "Collected"],
    outcome: "Every ticket traceable, and customers told when their order is ready.",
    modules: [MODULES.orders, MODULES.pos, MODULES.credit, MODULES.inbox, MODULES.reports],
    integrations: [INTEGRATIONS.whatsapp, INTEGRATIONS.stripe],
    cta: "Run your laundry with Noxtill",
    keywords: "laundry dry cleaning tickets items pickup delivery status wash",
  },
];

export interface NeedSolution {
  slug: string;
  title: string;
  desc: string;
  flow: string[];
  modules: SolutionLink[];
  who: string;
  cta: string;
  keywords: string;
}

export const NEEDS: NeedSolution[] = [
  {
    slug: "no-shows",
    title: "Reduce no-shows",
    desc: "Automated reminders help reduce missed appointments, and a cancelled slot is offered to your waitlist instead of sitting empty.",
    flow: ["Booking", "Reminder", "Confirmation", "Appointment", "Gap offered to waitlist"],
    modules: [MODULES.bookings, MODULES.inbox, MODULES.reception, MODULES.reports],
    who: "Salons, clinics, spas, gyms, grooming",
    cta: "See how reminders work",
    keywords: "no-show missed appointment reminder waitlist confirmation",
  },
  {
    slug: "more-reviews",
    title: "Collect more reviews",
    desc: "A review request goes out after a completed visit or job, and new reviews arrive with a draft reply you approve before it posts.",
    flow: ["Visit completed", "Review request sent", "Feedback received", "Review monitored", "Reply approved"],
    modules: [MODULES.reputation, MODULES.inbox, MODULES.listings, MODULES.marketing],
    who: "Salons, restaurants, retail, home services",
    cta: "See how review collection works",
    keywords: "reviews reputation google yelp trustpilot rating feedback",
  },
  {
    slug: "track-credit",
    title: "Track customer credit",
    desc: "Know who owes you, how much, how long it has been outstanding and what they have already paid — with polite reminders on a schedule you set.",
    flow: ["Credit sale", "Ledger entry", "Reminder sent", "Payment received", "Balance updated"],
    modules: [MODULES.credit, MODULES.pos, MODULES.inbox, MODULES.reports],
    who: "Retail, tailors, laundry, workshops, academies",
    cta: "See how digital khata works",
    keywords: "credit khata udhaar owes balance ledger reminder outstanding",
  },
  {
    slug: "real-profit",
    title: "Know your real profit",
    desc: "Sales tell you how busy you were. Margin per item, per hour and per staff member tells you whether it was worth it.",
    flow: ["Sale", "Cost applied", "Margin calculated", "Staff attributed", "Profit reported"],
    modules: [MODULES.pnl, MODULES.products, MODULES.staff, MODULES.health, MODULES.analytics],
    who: "Restaurants, bakeries, retail, salons",
    cta: "See how profit tracking works",
    keywords: "profit margin cost item staff hourly gross performance",
  },
  {
    slug: "paper-records",
    title: "Bring paper records in",
    desc: "Photograph a paper register or ledger and Noxtill turns it into structured records you can search — customers, balances and products, without retyping.",
    flow: ["Photograph register", "Noxtill reads it", "You confirm the data", "Records created", "Searchable in Noxtill"],
    modules: [MODULES.digitizer, MODULES.credit, MODULES.products, MODULES.analytics],
    who: "Shops, tailors, workshops, laundries",
    cta: "See how the photo digitizer works",
    keywords: "paper records register ledger digitize photo ocr khata book",
  },
  {
    slug: "several-locations",
    title: "Run several locations",
    desc: "Each branch keeps its own detail — sales, stock, staff, bookings — while reporting rolls up into one combined business view.",
    flow: ["Branch activity", "Branch-level records", "Roll-up reporting", "Combined view", "Per-branch comparison"],
    modules: [MODULES.multi, MODULES.reports, MODULES.inventory, MODULES.analytics, MODULES.health],
    who: "Multi-branch retail, salon chains, restaurant groups",
    cta: "See how multi-location works",
    keywords: "multi location branch chain group roll-up combined outlets",
  },
];

export const FLOW_STEPS = [
  "Booked or sold",
  "Paid (or put on credit)",
  "Stock & margin update",
  "Customer record updates",
  "Message or review request",
];
export const FLOW_FINAL_STEP = "Nightly close";

export const FLOW_PANEL = {
  title: "How Noxtill fits, whatever you run",
  body: "Every trade above follows the same shape: something is booked or sold, money changes hands, a record updates, someone gets a message, and at the end of the day the numbers have to add up. Noxtill is one system for that shape — so the till, the diary, the ledger, the stockroom and the reports never disagree.",
};

export const CROSS_LINKS = {
  ask: {
    title: "Ask instead of hunting",
    body: "Whatever trade you're in, the questions are the same at the end of a shift. The AI Business Assistant answers them from your own records — and says so plainly when the data isn't there.",
    linkLabel: "AI Business Assistant",
    linkHref: "/product#assistant",
    examples: [
      "How did today go compared to last Friday?",
      "Which staff member sold the most this week?",
      "Who still owes me money from last month?",
    ],
  },
  connect: {
    title: "Connect what you already use",
    body: "You don't have to abandon your online store, your card reader or your accountant's software. See",
    linkLabel: "business software integrations",
    linkHref: "/integrations-directory",
    chips: [
      INTEGRATIONS.shopify,
      INTEGRATIONS.stripe,
      INTEGRATIONS.square,
      INTEGRATIONS.qb,
      INTEGRATIONS.whatsapp,
      INTEGRATIONS.gbp,
    ],
  },
};

export const SOLUTIONS_FAQS: FaqItem[] = [
  {
    question: "Is Noxtill built for my kind of business?",
    answer:
      "It is built for businesses that sell or book, take payment, keep stock or customer records and need to know their numbers — shops, salons, restaurants, clinics, workshops, studios and service businesses. Pick the closest type above; if none fit, the daily shape is usually the same and the trial will tell you quickly.",
  },
  {
    question: "What software does a salon need?",
    answer:
      "A booking diary with reminders, a till that records the service and the product sold, staff commission worked out from those sales, a customer history, and review requests after the visit. Noxtill covers all of it in one account.",
  },
  {
    question: "Can restaurant sales update inventory automatically?",
    answer: "Yes. A sale at the till deducts the stock behind it, so wastage and margin appear in the same report as takings.",
  },
  {
    question: "Can a retail shop track customers who pay later?",
    answer:
      "Yes — that is the customer credit ledger, or digital khata. Put a sale on credit in one tap and the balance, its age and payments received are tracked, with WhatsApp reminders on your schedule.",
  },
  {
    question: "How do automated appointment reminders work?",
    answer:
      "Noxtill sends a reminder the day before and a second one closer to the appointment, over WhatsApp or SMS. If someone cancels, the slot is offered to your waitlist.",
  },
  {
    question: "How does Noxtill work out profit?",
    answer:
      "Each product or service carries its cost. When a sale happens, margin is calculated from that cost, attributed to the staff member, and rolled into the profit and loss report — per item, per hour and per person.",
  },
  {
    question: "Can several branches share one account?",
    answer:
      "Yes. Each location keeps its own sales, stock, staff and bookings while reporting rolls up into a combined business view you can compare branch by branch.",
  },
  {
    question: "Do I have to replace the tools I already use?",
    answer: "No. Connect your online store, card reader, accounting software and messaging channels — see integrations. Noxtill becomes the place they all agree.",
  },
];

export const SOLUTIONS_FINAL_CTA = {
  title: "Run your business with one connected system",
  body: "Noxtill brings sales, customers, bookings, inventory, payments, communication and business intelligence together so your team spends less time switching between tools.",
  primaryCta: "Start 14-day free trial",
  secondaryCta: "See how Noxtill works",
  trust: ["No credit card required", "14-day free trial", "Cancel anytime"],
};
