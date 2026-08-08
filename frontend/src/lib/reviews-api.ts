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
