import { apiFetch } from "@/lib/api-client";

export interface PublicVideoTestimonialRequest {
  businessName: string;
  branding: Record<string, unknown>;
  caption: string | null;
}

/** GET /t/:token — no auth; 404s once uploaded or past its 30-day expiry (same shape as /r/:token). */
export function fetchPublicVideoTestimonial(token: string): Promise<PublicVideoTestimonialRequest> {
  return apiFetch<PublicVideoTestimonialRequest>(`/t/${token}`, {}, { skipAuth: true });
}

/** POST /t/:token — multipart video upload; rate-limited server-side (5/min/IP). */
export function uploadVideoTestimonial(token: string, file: File): Promise<{ thankYou: true }> {
  const formData = new FormData();
  formData.append("video", file);
  return apiFetch<{ thankYou: true }>(
    `/t/${token}`,
    { method: "POST", body: formData },
    { skipAuth: true },
  );
}
