export interface DeepLink {
  label: string;
  href: string;
}

export interface AssistantAnswer {
  text: string;
  deepLinks?: DeepLink[];
}

export const QUICK_CHIPS = [
  "What's my revenue this month?",
  "Any low stock items?",
  "How's my average rating?",
  "Show today's bookings",
];

const KNOWN_ANSWERS: Record<string, AssistantAnswer> = {
  "what's my revenue this month?": {
    text: "Revenue this month is $18,420, up 12.4% versus last period. Cost of goods sold is $5,230 and expenses are $8,565, putting net profit at $4,625.",
    deepLinks: [{ label: "View P&L", href: "/profit" }],
  },
  "any low stock items?": {
    text: "Yes — Heat Protectant Spray is down to 1 unit and Argan Oil Shampoo is at 3, both below their reorder threshold of 5.",
    deepLinks: [{ label: "View inventory", href: "/inventory" }],
  },
  "how's my average rating?": {
    text: "Your average rating across Google, Facebook, and Yelp is 4.8, up slightly over the last 8 weeks.",
    deepLinks: [{ label: "View reviews", href: "/reviews" }],
  },
  "show today's bookings": {
    text: "You have 6 appointments today across your 3 stylists, including a 2-hour color appointment with Lena Fischer at 11:00 AM.",
    deepLinks: [{ label: "Open calendar", href: "/bookings" }],
  },
};

const FALLBACK_ANSWER: AssistantAnswer = {
  text: "I don't have live data access wired up yet, so I can't answer that specifically. I can help with revenue, stock levels, ratings, and today's bookings — try one of the suggestions above.",
};

/** Mock answer lookup — real assistant is a tool-calling loop over live data (BE-074), streamed via INT-011. */
export function getAssistantAnswer(question: string): AssistantAnswer {
  return KNOWN_ANSWERS[question.trim().toLowerCase()] ?? FALLBACK_ANSWER;
}
