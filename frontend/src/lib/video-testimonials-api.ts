import { apiFetch } from "@/lib/api-client";

export type VideoTestimonialStatus = "requested" | "submitted" | "approved" | "rejected";

export interface VideoTestimonial {
  id: string;
  customerId: string | null;
  customer: { id: string; name: string; phone: string } | null;
  token: string;
  status: VideoTestimonialStatus;
  videoKey: string | null;
  videoUrl: string | null;
  caption: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /video-testimonials/request — messages the customer a real upload link (`/t/:token`), 2h-delayed same as review requests. */
export function requestVideoTestimonial(customerId: string, caption?: string): Promise<VideoTestimonial> {
  return apiFetch<VideoTestimonial>("/video-testimonials/request", {
    method: "POST",
    body: JSON.stringify({ customerId, caption }),
  });
}

export function fetchVideoTestimonials(status?: VideoTestimonialStatus): Promise<VideoTestimonial[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<VideoTestimonial[]>(`/video-testimonials${query}`);
}

export function fetchVideoTestimonial(id: string): Promise<VideoTestimonial> {
  return apiFetch<VideoTestimonial>(`/video-testimonials/${id}`);
}

/** Requires the video_testimonials.moderate capability — owner/manager by default. */
export function approveVideoTestimonial(id: string): Promise<VideoTestimonial> {
  return apiFetch<VideoTestimonial>(`/video-testimonials/${id}/approve`, { method: "PATCH" });
}

export function rejectVideoTestimonial(id: string, reason?: string): Promise<VideoTestimonial> {
  return apiFetch<VideoTestimonial>(`/video-testimonials/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}
