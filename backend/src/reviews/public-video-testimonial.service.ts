import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  VIDEO_TESTIMONIAL_TOKEN_EXPIRY_DAYS,
} from './video-testimonials.constants';
import { VideoTestimonialStatus } from '@prisma/client';

const EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/**
 * Public video-testimonial upload (UPD-BE-027) — no auth, resolved entirely by the token, same
 * shape as `PublicReviewService`. Single-purpose: once uploaded (or once 30 days old), the token
 * 404s — a customer can't re-upload over an existing submission via the same link.
 */
@Injectable()
export class PublicVideoTestimonialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async getByToken(token: string) {
    const testimonial = await this.loadValid(token);
    return {
      businessName: testimonial.business.name,
      branding: testimonial.business.branding,
      caption: testimonial.caption,
    };
  }

  async upload(
    token: string,
    file: { buffer: Buffer; size: number; mimetype: string },
  ) {
    const testimonial = await this.loadValid(token);
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_VIDEO_MIME_TYPES,
      maxSizeBytes: MAX_VIDEO_SIZE_BYTES,
    });

    const ext = EXTENSION_BY_MIME[file.mimetype] ?? 'mp4';
    const key = `video-testimonials/${testimonial.businessId}/${token}.${ext}`;
    await this.s3.upload(key, file.buffer, file.mimetype);

    await this.prisma.videoTestimonial.update({
      where: { id: testimonial.id },
      data: { videoKey: key, status: VideoTestimonialStatus.submitted },
    });

    return { thankYou: true };
  }

  private async loadValid(token: string) {
    const testimonial = await this.prisma.videoTestimonial.findUnique({
      where: { token },
      include: { business: true },
    });
    if (!testimonial) {
      throw new NotFoundException();
    }
    if (testimonial.status !== VideoTestimonialStatus.requested) {
      throw new NotFoundException();
    }

    const ageDays =
      (Date.now() - testimonial.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > VIDEO_TESTIMONIAL_TOKEN_EXPIRY_DAYS) {
      throw new NotFoundException();
    }

    return testimonial;
  }
}
