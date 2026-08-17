import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';
import { S3Service } from '../common/storage/s3.service';
import { generateReviewToken } from './review-token.util';
import { RequestVideoTestimonialDto } from './dto/request-video-testimonial.dto';
import { RejectVideoTestimonialDto } from './dto/reject-video-testimonial.dto';
import { VIDEO_TESTIMONIAL_ERROR_CODES } from './video-testimonials.constants';
import { VideoTestimonialStatus } from '../../generated/prisma';

/**
 * Video Testimonials (UPD-BE-027) — authenticated (staff-facing) half of the flow: request a
 * testimonial from a real customer, list/approve/reject submissions. The customer-facing upload
 * itself happens through `PublicVideoTestimonialService`'s public, token-based endpoint (same
 * `loadValid(token)` pattern as `public-review.service.ts`), not here.
 */
@Injectable()
export class VideoTestimonialsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
    private readonly activity: ActivityService,
    private readonly s3: S3Service,
  ) {}

  async request(businessId: string, dto: RequestVideoTestimonialDto) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const token = generateReviewToken();
    const testimonial = await this.tenantPrisma.client.videoTestimonial.create({
      data: {
        businessId,
        customerId: dto.customerId,
        token,
        caption: dto.caption,
      },
    });

    // Best-effort, same fire-and-forget convention as ReviewRequestsService.scheduleSend.
    await this.sendGate
      .send({
        businessId,
        customerId: dto.customerId,
        templateKey: 'video_testimonial_request',
        variables: { uploadUrl: `/t/${token}` },
      })
      .catch(() => undefined);

    return testimonial;
  }

  async list(status?: VideoTestimonialStatus) {
    const rows = await this.tenantPrisma.client.videoTestimonial.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: { customer: true },
    });
    return Promise.all(rows.map((row) => this.withVideoUrl(row)));
  }

  async findOne(id: string) {
    const row = await this.findRow(id);
    return this.withVideoUrl(row);
  }

  async approve(id: string, actorUserId?: string) {
    const testimonial = await this.findRow(id);
    if (testimonial.status !== VideoTestimonialStatus.submitted) {
      throw new AppException(
        VIDEO_TESTIMONIAL_ERROR_CODES.NOT_SUBMITTED,
        `Testimonial is "${testimonial.status}", expected "submitted"`,
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.tenantPrisma.client.videoTestimonial.update({
      where: { id },
      data: {
        status: VideoTestimonialStatus.approved,
        approvedByUserId: actorUserId,
      },
    });

    await this.activity.record(testimonial.businessId, {
      type: 'review',
      description: `Video testimonial approved${testimonial.customerId ? '' : ' (anonymous)'}`,
      entityType: 'VideoTestimonial',
      entityId: id,
      actorUserId,
    });

    return this.withVideoUrl(updated);
  }

  async reject(
    id: string,
    dto: RejectVideoTestimonialDto,
    actorUserId?: string,
  ) {
    const testimonial = await this.findRow(id);
    if (testimonial.status !== VideoTestimonialStatus.submitted) {
      throw new AppException(
        VIDEO_TESTIMONIAL_ERROR_CODES.NOT_SUBMITTED,
        `Testimonial is "${testimonial.status}", expected "submitted"`,
        HttpStatus.CONFLICT,
      );
    }

    return this.tenantPrisma.client.videoTestimonial.update({
      where: { id },
      data: {
        status: VideoTestimonialStatus.rejected,
        approvedByUserId: actorUserId,
        caption: dto.reason
          ? `${testimonial.caption ?? ''}\n\nRejected: ${dto.reason}`.trim()
          : testimonial.caption,
      },
    });
  }

  private async withVideoUrl<T extends { videoKey: string | null }>(
    row: T,
  ): Promise<T & { videoUrl: string | null }> {
    const videoUrl = row.videoKey
      ? await this.s3.getSignedDownloadUrl(row.videoKey)
      : null;
    return { ...row, videoUrl };
  }

  private async findRow(id: string) {
    const testimonial =
      await this.tenantPrisma.client.videoTestimonial.findUnique({
        where: { id },
      });
    if (!testimonial) {
      throw new AppException(
        VIDEO_TESTIMONIAL_ERROR_CODES.NOT_FOUND,
        'Video testimonial not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return testimonial;
  }
}
