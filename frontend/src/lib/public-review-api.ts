import { apiFetch } from "@/lib/api-client";

export interface PublicReviewBusiness {
  businessName: string;
  branding: Record<string, unknown>;
}

/** GET /r/:token — no auth; 404s if the token was already used or is older than 30 days. */
export function fetchPublicReview(token: string): Promise<PublicReviewBusiness> {
  return apiFetch<PublicReviewBusiness>(`/r/${token}`, {}, { skipAuth: true });
}

export type SubmitReviewResult = { redirect: string } | { thankYou: true };

/**
 * POST /r/:token — the business only decides "redirect to public listing" vs "thank-you" (private
 * mode / low rating) once the rating is actually submitted, so callers must submit first and
 * branch on the response, not guess the branch ahead of time.
 */
export function submitPublicReview(token: string, stars: number, message?: string): Promise<SubmitReviewResult> {
  return apiFetch<SubmitReviewResult>(
    `/r/${token}`,
    { method: "POST", body: JSON.stringify({ stars, message }) },
    { skipAuth: true },
  );
}

export interface PublicReviewWidgetReview {
  author: string | null;
  stars: number;
  text: string | null;
  createdAt: string;
  platform: string;
}

export interface PublicReviewWidget {
  businessName: string;
  branding: Record<string, unknown>;
  reviews: PublicReviewWidgetReview[];
}

/** GET /reviews/widget/:biz — public, cacheable embed data (4-5★ only, most recent first). */
export function fetchReviewWidget(slug: string): Promise<PublicReviewWidget> {
  return apiFetch<PublicReviewWidget>(`/reviews/widget/${slug}`, {}, { skipAuth: true });
}

/**
 * POST /reviews/qr/:slug — mints a fresh, anonymous, single-use review token for a QR scan (no
 * login). Rate-limited server-side (5/min/IP) — a 429 here means "scanned too many times too
 * fast", not a bug. From the returned token, the rest of the flow is the same `/r/:token` page.
 */
export function mintReviewQrLink(slug: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>(`/reviews/qr/${slug}`, { method: "POST" }, { skipAuth: true });
}
