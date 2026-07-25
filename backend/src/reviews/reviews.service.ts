import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { ExternalReview, PrivateFeedback } from '../../generated/prisma';

const REVIEWS_ERROR_CODES = {
  REVIEW_NOT_FOUND: 'reviews.not_found',
};

/**
 * Unified reviews inbox (BE-047) merges ExternalReview (public platform
 * reviews, e.g. Google) and PrivateFeedback (1-3★ routed away from public
 * view, BE-046) into one list — they're different tables because they have
 * different lifecycles (platform-synced vs owner-triaged), not because the
 * inbox should treat them differently.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
    private readonly cls: ClsService,
  ) {}

  async list(query: QueryReviewsDto) {
    const ratingFilter = query.rating ? { stars: Number(query.rating) } : {};

    // `status` only applies to PrivateFeedback's triage workflow, `platform` only to
    // ExternalReview's source — requesting one implicitly excludes the other list.
    const wantsExternal =
      !query.status && (!query.platform || query.platform !== 'private');
    const wantsPrivate = !query.platform || query.platform === 'private';

    const [external, feedback]: [ExternalReview[], PrivateFeedback[]] =
      await Promise.all([
        wantsExternal
          ? this.tenantPrisma.client.externalReview.findMany({
              where: {
                ...ratingFilter,
                ...(query.platform ? { platform: query.platform } : {}),
              },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        wantsPrivate
          ? this.tenantPrisma.client.privateFeedback.findMany({
              where: {
                ...ratingFilter,
                ...(query.status ? { status: query.status } : {}),
              },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
      ]);

    const combined = [
      ...external.map((r) => ({ ...r, source: 'external' as const })),
      ...feedback.map((r) => ({ ...r, source: 'private' as const })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return combined;
  }

  async updateFeedback(id: string, dto: UpdateFeedbackDto) {
    const existing = await this.tenantPrisma.client.privateFeedback.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Feedback not found');
    }

    return this.tenantPrisma.client.privateFeedback.update({
      where: { id },
      data: {
        status: dto.status,
        assignedTo: dto.assignedTo,
        resolutionNote: dto.resolutionNote,
      },
    });
  }

  async reply(id: string, replyText: string) {
    const review = await this.tenantPrisma.client.externalReview.findUnique({
      where: { id },
    });
    if (!review) {
      throw new AppException(
        REVIEWS_ERROR_CODES.REVIEW_NOT_FOUND,
        'Review not found',
        HttpStatus.NOT_FOUND,
      );
    }

    // Queued: google-sync.processor (BE-049) picks up replyText/repliedAt=null and pushes it.
    return this.tenantPrisma.client.externalReview.update({
      where: { id },
      data: { replyText },
    });
  }

  async aiDraft(id: string) {
    const review = await this.tenantPrisma.client.externalReview.findUnique({
      where: { id },
    });
    if (!review) {
      throw new AppException(
        REVIEWS_ERROR_CODES.REVIEW_NOT_FOUND,
        'Review not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const prompt =
      `A customer left this ${review.stars}-star review: "${review.text ?? ''}". ` +
      'Write a short, warm, professional business-owner reply IN THE SAME LANGUAGE the review ' +
      'was written in. No preamble — return only the reply text.';

    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const draft = await this.aiInfra.complete(businessId, prompt);
    return { draft };
  }
}
