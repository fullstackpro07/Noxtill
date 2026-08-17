export const VIDEO_TESTIMONIAL_ERROR_CODES = {
  NOT_FOUND: 'video_testimonial.not_found',
  NOT_SUBMITTED: 'video_testimonial.not_submitted',
  ALREADY_RESPONDED: 'video_testimonial.already_responded',
} as const;

/** Same 30-day single-purpose-token expiry as the public review flow (`public-review.service.ts`). */
export const VIDEO_TESTIMONIAL_TOKEN_EXPIRY_DAYS = 30;

export const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
];
