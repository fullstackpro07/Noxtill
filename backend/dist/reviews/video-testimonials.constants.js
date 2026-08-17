"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_VIDEO_MIME_TYPES = exports.MAX_VIDEO_SIZE_BYTES = exports.VIDEO_TESTIMONIAL_TOKEN_EXPIRY_DAYS = exports.VIDEO_TESTIMONIAL_ERROR_CODES = void 0;
exports.VIDEO_TESTIMONIAL_ERROR_CODES = {
    NOT_FOUND: 'video_testimonial.not_found',
    NOT_SUBMITTED: 'video_testimonial.not_submitted',
    ALREADY_RESPONDED: 'video_testimonial.already_responded',
};
exports.VIDEO_TESTIMONIAL_TOKEN_EXPIRY_DAYS = 30;
exports.MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
exports.ALLOWED_VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/quicktime',
    'video/webm',
];
//# sourceMappingURL=video-testimonials.constants.js.map