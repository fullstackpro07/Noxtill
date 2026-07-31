export interface BusinessTypePage {
  slug: string;
  name: string;
  categoryLabel: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  testimonial: { quote: string; author: string; place: string };
  faqs: { question: string; answer: string }[];
}

/**
 * Seed set for the programmatic type-page template (FE-037) — the real system generates
 * one page per business_types row via an SSG build hook (BE-080); this seed proves the
 * template renders correctly across genuinely varied copy, not just one happy path.
 */
export const BUSINESS_TYPE_PAGES: BusinessTypePage[] = [
  {
    slug: "hair-salons",
    name: "Hair Salons",
    categoryLabel: "Health & Beauty",
    headline: "Run your hair salon on WhatsApp, not spreadsheets.",
    subheadline: "Bookings, credit tabs, reviews, and a POS built for how salons actually work.",
    painPoints: [
      "Clients rescheduling over 6 different group chats",
      "No-shows eating into a stylist's whole afternoon",
      "Retail restocks always a surprise",
    ],
    testimonial: {
      quote: "We stopped losing appointments to double-booked group chats within a week.",
      author: "Amara Osei",
      place: "Sunset Hair Studio",
    },
    faqs: [
      { question: "Can clients book without downloading an app?", answer: "Yes — booking happens over WhatsApp or a shareable link, no app install required." },
      { question: "Does it track staff commissions?", answer: "Yes, per-stylist commission rules (percent or per-service) with a monthly report." },
      { question: "What about product inventory?", answer: "Retail stock, purchases, and wastage are tracked alongside your service bookings." },
    ],
  },
  {
    slug: "restaurants",
    name: "Restaurants",
    categoryLabel: "Food & Beverage",
    headline: "Table orders, delivery, and reviews — one system for your restaurant.",
    subheadline: "A POS that handles dine-in tables, quick sales, and credit tabs for regulars.",
    painPoints: [
      "Servers juggling paper tickets during rush",
      "No visibility into which dishes are actually profitable",
      "Reviews scattered across three different platforms",
    ],
    testimonial: {
      quote: "Nightly close used to take 40 minutes. Now it's waiting in WhatsApp when I lock up.",
      author: "Devon Marsh",
      place: "Riverside Bistro",
    },
    faqs: [
      { question: "Does it handle table management?", answer: "Yes — a floor grid shows free, occupied, and reserved tables in real time." },
      { question: "Can I track food cost margins?", answer: "Every dish's margin is flagged automatically if it drops below a healthy threshold." },
      { question: "What about delivery orders?", answer: "Orders move through a Kanban board from pending to ready to completed." },
    ],
  },
  {
    slug: "auto-repair-shops",
    name: "Auto Repair Shops",
    categoryLabel: "Automotive",
    headline: "Keep every customer's repair history one search away.",
    subheadline: "Quotations, parts inventory, and follow-up reminders for a shop that never loses a job.",
    painPoints: [
      "Quotes that never get followed up on",
      "Parts inventory nobody trusts",
      "Customers who ghost after a quote and come back a year later",
    ],
    testimonial: {
      quote: "The credit ledger alone paid for itself — we finally know who actually owes us.",
      author: "Marcus Webb",
      place: "Webb's Auto Care",
    },
    faqs: [
      { question: "Can I turn a quote into a job?", answer: "Yes — one tap converts a quotation into a live order with the same line items." },
      { question: "Does it track parts stock?", answer: "Purchases, wastage, and low-stock alerts work the same as retail inventory." },
      { question: "What about repeat customers?", answer: "Every customer's full service history is searchable in one place." },
    ],
  },
  {
    slug: "fitness-studios",
    name: "Fitness Studios",
    categoryLabel: "Fitness & Wellness",
    headline: "Class bookings and member credit, without a separate gym app.",
    subheadline: "Let members book classes over WhatsApp and keep package credit in one ledger.",
    painPoints: [
      "Members unsure how many classes they have left",
      "Instructor schedules living in someone's head",
      "No easy way to reward loyal members",
    ],
    testimonial: {
      quote: "Referral tracking got us 18 new members without spending a cent on ads.",
      author: "Priya Nair",
      place: "Flow Studio",
    },
    faqs: [
      { question: "Can members see their remaining credit?", answer: "Yes — their balance is visible whenever they message to book." },
      { question: "Does it support multiple instructors?", answer: "Each instructor gets their own calendar column with color-coded bookings." },
      { question: "Is there a referral program?", answer: "Built-in — configure a reward and track conversions from the Marketing tab." },
    ],
  },
];

export function findBusinessTypePage(slug: string): BusinessTypePage | undefined {
  return BUSINESS_TYPE_PAGES.find((p) => p.slug === slug);
}
