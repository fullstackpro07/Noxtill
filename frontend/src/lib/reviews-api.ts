import { apiFetch } from "@/lib/api-client";

export interface LiveExternalReview {
  source: "external";
  id: string;
  platform: string;
  author: string | null;
  stars: number;
  text: string | null;
  replyText: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export type FeedbackStatus = "open" | "assigned" | "resolved";

export interface LivePrivateFeedback {
  source: "private";
  id: string;
  customerId: string | null;
  stars: number;
  message: string | null;
  status: FeedbackStatus;
  assignedTo: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export type LiveInboxEntry = LiveExternalReview | LivePrivateFeedback;

/** GET /reviews — unfiltered; the inbox filters client-side same as every other list screen in the app. */
export function fetchReviews(): Promise<LiveInboxEntry[]> {
  return apiFetch<LiveInboxEntry[]>("/reviews");
}

export interface ReviewsSummary {
  averageRating: number;
  distribution: { stars: number; count: number }[];
  /** Weekly average for whichever of the last 8 weeks actually had a review — no fabricated zero-dips for quiet weeks. */
  sparkline: number[];
  conversion: { requested: number; received: number };
  latestReview: {
    id: string;
    platform: string;
    author: string | null;
    stars: number;
    text: string | null;
    createdAt: string;
  } | null;
}

export function fetchReviewsSummary(): Promise<ReviewsSummary> {
  return apiFetch<ReviewsSummary>("/reviews/summary");
}

/** POST /reviews/:id/reply — saves the reply text; actually reaching the platform depends on the GMB connector (not yet built). */
export function replyToReview(id: string, replyText: string): Promise<LiveExternalReview> {
  return apiFetch<LiveExternalReview>(`/reviews/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ replyText }),
  });
}

export function aiDraftReply(id: string): Promise<{ draft: string }> {
  return apiFetch<{ draft: string }>(`/reviews/${id}/ai-draft`, { method: "POST" });
}

export interface UpdateFeedbackInput {
  status?: FeedbackStatus;
  assignedTo?: string;
  resolutionNote?: string;
}

export function updateFeedback(id: string, input: UpdateFeedbackInput): Promise<LivePrivateFeedback> {
  return apiFetch<LivePrivateFeedback>(`/feedback/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** POST /feedback/:id/reply — sends a real message to the customer via the utility "feedback_reply" template (never blocked by marketing opt-out). */
export function replyToFeedback(id: string, message: string): Promise<unknown> {
  return apiFetch(`/feedback/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export type QrPosterFormat = "a5" | "a4" | "sticker";
export type QrPosterFileType = "png" | "pdf";

export interface GenerateQrPosterInput {
  format: QrPosterFormat;
  fileType: QrPosterFileType;
  targetUrl: string;
}

/** POST /reviews/qr-poster — authenticated; renders server-side (Puppeteer) and returns a 24h signed S3 URL, same pattern as invoices/statements. */
export function generateQrPoster(input: GenerateQrPosterInput): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/reviews/qr-poster", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ReviewRequestEffectiveStatus = "sent" | "opened" | "rated" | "no_response";

export interface LiveReviewRequest {
  id: string;
  customerId: string | null;
  customer: { name: string; phone: string } | null;
  source: string;
  stars: number | null;
  status: "sent" | "opened" | "rated";
  effectiveStatus: ReviewRequestEffectiveStatus;
  openedAt: string | null;
  respondedAt: string | null;
  reminderCount: number;
  createdAt: string;
}

/** GET /reviews/requests — every request with its real, possibly-expired-to-no_response status (UPD-BE-100). */
export function fetchReviewRequests(): Promise<LiveReviewRequest[]> {
  return apiFetch<LiveReviewRequest[]>("/reviews/requests");
}

export interface ReviewRequestChannelConversion {
  source: string;
  total: number;
  rated: number;
  conversionRate: number;
}

export function fetchReviewRequestsConversion(): Promise<ReviewRequestChannelConversion[]> {
  return apiFetch<ReviewRequestChannelConversion[]>("/reviews/requests/conversion");
}

/** POST /reviews/requests/bulk — quota-checked atomically; a 403 CAMPAIGN-style quota error means the whole batch was blocked, nothing partially sent. */
export function bulkSendReviewRequests(customerIds: string[], source = "manual"): Promise<{ requested: number; sent: number }> {
  return apiFetch<{ requested: number; sent: number }>("/reviews/requests/bulk", {
    method: "POST",
    body: JSON.stringify({ customerIds, source }),
  });
}

export interface QrStats {
  windowDays: number;
  visits: number;
  ratingsSubmitted: number;
  conversionRate: number;
}

export function fetchQrStats(): Promise<QrStats> {
  return apiFetch<QrStats>("/reviews/qr-stats");
}

export interface ReputationScoreComponents {
  rating: number;
  volume: number;
  recency: number;
  responseRate: number;
}

export interface ReputationScoreResult {
  score: number;
  components: ReputationScoreComponents;
  weights: ReputationScoreComponents;
  trend: { weekEnding: string; totalScore: number }[];
}

export function fetchReputationScore(): Promise<ReputationScoreResult> {
  return apiFetch<ReputationScoreResult>("/reviews/reputation-score");
}

export interface ReviewSettings {
  publicReviewUrl: string | null;
  publicReviewPlatform?: string;
  reminderDayOffsets?: number[];
  replyTemplates?: Record<string, string>;
  /** Actually rendered on the public rating page, the review widget, and the QR poster — not just stored. */
  brandColor?: string;
  logoUrl: string | null;
}

export function fetchReviewSettings(): Promise<ReviewSettings> {
  return apiFetch<ReviewSettings>("/reviews/settings");
}

export function updateReviewSettings(
  input: Partial<Omit<ReviewSettings, "publicReviewUrl" | "logoUrl">> & { publicReviewUrl?: string },
): Promise<ReviewSettings> {
  return apiFetch<ReviewSettings>("/reviews/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** POST /reviews/settings/logo — real multipart upload to S3; the previous logo (if any) is deleted server-side, not left orphaned. */
export function uploadReviewLogo(file: File): Promise<ReviewSettings> {
  const formData = new FormData();
  formData.append("logo", file);
  return apiFetch<ReviewSettings>("/reviews/settings/logo", { method: "POST", body: formData });
}

export function removeReviewLogo(): Promise<ReviewSettings> {
  return apiFetch<ReviewSettings>("/reviews/settings/logo", { method: "DELETE" });
}

export interface ReviewSentimentTheme {
  id: string;
  theme: string;
  sentiment: string;
  exampleQuote: string;
  reviewCount: number;
  generatedAt: string;
}

/** GET /reviews/sentiment — real AI-clustered themes over recent review text (UPD-FE-084). */
export function fetchReviewSentiment(): Promise<ReviewSentimentTheme[]> {
  return apiFetch<ReviewSentimentTheme[]>("/reviews/sentiment");
}
