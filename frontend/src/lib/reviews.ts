export type ReviewPlatform = "google" | "facebook" | "yelp" | "whatsapp";
export type ReviewStatus = "new" | "replied";
export type ComplaintStatus = "open" | "resolved";

export interface ExternalReview {
  kind: "review";
  id: string;
  platform: ReviewPlatform;
  author: string;
  rating: number;
  text: string;
  date: string;
  status: ReviewStatus;
  language: string;
  aiDraftReply: string;
}

export interface PrivateFeedback {
  kind: "complaint";
  id: string;
  customerId?: string;
  customerName: string;
  rating: number;
  text: string;
  date: string;
  status: ComplaintStatus;
  assignee?: string;
  resolutionNote?: string;
}

export type InboxEntry = ExternalReview | PrivateFeedback;

export const PLATFORM_LABELS: Record<ReviewPlatform, string> = {
  google: "Google",
  facebook: "Facebook",
  yelp: "Yelp",
  whatsapp: "WhatsApp",
};

/** Mock unified inbox — real GET /reviews merges external_reviews + private_feedback (BE-047). */
export const EXTERNAL_REVIEWS: ExternalReview[] = [
  {
    kind: "review",
    id: "rv1",
    platform: "google",
    author: "Priya N.",
    rating: 5,
    text: "Best haircut in town! Amara really listens to what you want.",
    date: "2026-07-24",
    status: "new",
    language: "en",
    aiDraftReply: "Thank you so much, Priya! We're thrilled Amara nailed your look — see you again soon!",
  },
  {
    kind: "review",
    id: "rv2",
    platform: "facebook",
    author: "Tariq M.",
    rating: 4,
    text: "Quick and friendly service, would come back.",
    date: "2026-07-15",
    status: "replied",
    language: "en",
    aiDraftReply: "Thanks for the kind words, Tariq — looking forward to your next visit!",
  },
  {
    kind: "review",
    id: "rv3",
    platform: "yelp",
    author: "Sofia R.",
    rating: 5,
    text: "Loved the color treatment, exactly what I asked for.",
    date: "2026-07-08",
    status: "new",
    language: "en",
    aiDraftReply: "So glad you love the color, Sofia! Thank you for trusting us with it.",
  },
  {
    kind: "review",
    id: "rv4",
    platform: "google",
    author: "Marcus W.",
    rating: 3,
    text: "Good haircut but I waited 20 minutes past my appointment time.",
    date: "2026-06-30",
    status: "new",
    language: "en",
    aiDraftReply: "Thank you for the feedback, Marcus — we're sorry about the wait and are working on timing between bookings.",
  },
];

export const PRIVATE_FEEDBACK: PrivateFeedback[] = [
  {
    kind: "complaint",
    id: "pf1",
    customerId: "c3",
    customerName: "Casey Nolan",
    rating: 2,
    text: "Service was slow at checkout — waited almost 15 minutes just to pay after my appointment.",
    date: "2026-07-20",
    status: "open",
  },
  {
    kind: "complaint",
    id: "pf2",
    customerId: "c6",
    customerName: "Marcus Webb",
    rating: 1,
    text: "The stylist seemed rushed and the result didn't match what I asked for at all.",
    date: "2026-06-02",
    status: "open",
  },
  {
    kind: "complaint",
    id: "pf3",
    customerName: "Anonymous",
    rating: 2,
    text: "Front desk was a bit unfriendly when I asked to reschedule.",
    date: "2026-05-18",
    status: "resolved",
    assignee: "Amara Osei",
    resolutionNote: "Spoke with front desk team about tone during reschedules; customer was offered a discount on next visit.",
  },
];

export function unifiedInbox(): InboxEntry[] {
  return [...EXTERNAL_REVIEWS, ...PRIVATE_FEEDBACK].sort((a, b) => b.date.localeCompare(a.date));
}

export function averageRating(reviews: ExternalReview[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

export function ratingDistribution(reviews: ExternalReview[]): { stars: number; count: number }[] {
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((r) => r.rating === stars).length }));
}

/** Mock weekly average-rating trend for the sparkline — real series comes from GET /reviews (aggregated). */
export const RATING_SPARKLINE = [4.2, 4.4, 4.3, 4.6, 4.5, 4.7, 4.6, 4.8];

/** Mock: review requests sent vs. reviews actually received, last 30 days. */
export const CONVERSION = { requested: 62, received: 27 };
