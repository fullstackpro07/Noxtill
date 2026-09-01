import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { SendGateService } from '../messaging/send-gate.service';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from '../digitizer/digitizer.constants';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { UpdateReviewSettingsDto } from './dto/update-review-settings.dto';
import {
  REVIEW_CONVERSION_WINDOW_DAYS,
  REVIEW_TOKEN_EXPIRY_DAYS,
} from './reviews.constants';
import {
  ExternalReview,
  Prisma,
  PrivateFeedback,
  ReviewRequestStatus,
} from '@prisma/client';

const REVIEWS_ERROR_CODES = {
  REVIEW_NOT_FOUND: 'reviews.not_found',
  NO_CUSTOMER_TO_REPLY_TO: 'reviews.no_customer_to_reply_to',
};

const SPARKLINE_WEEKS = 8;
const CONVERSION_WINDOW_DAYS = 30;

export type ReviewRequestEffectiveStatus =
  'sent' | 'opened' | 'rated' | 'no_response';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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
    private readonly sendGate: SendGateService,
    private readonly cls: ClsService,
    private readonly s3: S3Service,
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
    let draft: string;
    try {
      draft = await this.aiInfra.complete(
        businessId,
        prompt,
        0,
        'review_reply',
      );
    } catch (error) {
      if (error instanceof AppException) {
        throw error; // rate-limit / cost-cap errors from AiInfraService are already typed
      }
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { draft };
  }

  /** Sends a direct reply to the customer who left this private feedback (BE-047 inbox drawer). */
  async replyToFeedback(id: string, message: string) {
    const feedback = await this.tenantPrisma.client.privateFeedback.findUnique({
      where: { id },
    });
    if (!feedback) {
      throw new AppException(
        REVIEWS_ERROR_CODES.REVIEW_NOT_FOUND,
        'Feedback not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!feedback.customerId) {
      throw new AppException(
        REVIEWS_ERROR_CODES.NO_CUSTOMER_TO_REPLY_TO,
        'This feedback has no linked customer to reply to',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.sendGate.send({
      businessId: feedback.businessId,
      customerId: feedback.customerId,
      templateKey: 'feedback_reply',
      variables: { message },
    });
  }

  /** Powers the inbox summary panel and the dashboard's latest-review card — all computed from real data, nothing fabricated. */
  async getSummary() {
    const external = await this.tenantPrisma.client.externalReview.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const averageRating = external.length
      ? round2(external.reduce((sum, r) => sum + r.stars, 0) / external.length)
      : 0;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: external.filter((r) => r.stars === stars).length,
    }));
    const sparkline = this.buildWeeklySparkline(external);

    const since = new Date(
      Date.now() - CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [requested, received] = await Promise.all([
      this.tenantPrisma.client.reviewRequest.count({
        where: { createdAt: { gte: since } },
      }),
      this.tenantPrisma.client.reviewRequest.count({
        where: { createdAt: { gte: since }, respondedAt: { not: null } },
      }),
    ]);

    const latest = external[0];
    return {
      averageRating,
      distribution,
      sparkline,
      conversion: { requested, received },
      latestReview: latest
        ? {
            id: latest.id,
            platform: latest.platform,
            author: latest.author,
            stars: latest.stars,
            text: latest.text,
            createdAt: latest.createdAt,
          }
        : null,
    };
  }

  /** UPD-BE-101: the QR poster's own analytics — "visits" is every anonymous link mint (one per real
   * scan, since the QR always points at `/rq/:slug`, which mints on load), scoped to `source: 'qr'`
   * so it never mixes in requests sent after a sale. */
  async qrStats() {
    const since = new Date(
      Date.now() - REVIEW_CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [visits, ratingsSubmitted] = await Promise.all([
      this.tenantPrisma.client.reviewRequest.count({
        where: { source: 'qr', createdAt: { gte: since } },
      }),
      this.tenantPrisma.client.reviewRequest.count({
        where: {
          source: 'qr',
          createdAt: { gte: since },
          status: ReviewRequestStatus.rated,
        },
      }),
    ]);
    return {
      windowDays: REVIEW_CONVERSION_WINDOW_DAYS,
      visits,
      ratingsSubmitted,
      conversionRate:
        visits > 0 ? round2((ratingsSubmitted / visits) * 100) : 0,
    };
  }

  /** UPD-BE-100: every request with its real stored status, upgraded to `no_response` past the
   * token's own expiry window — mirrors `PublicReviewService.loadValid`'s expiry rule so the table
   * never shows a "sent"/"opened" row the customer can no longer actually act on. */
  async listRequests() {
    const requests = await this.tenantPrisma.client.reviewRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, phone: true } } },
    });
    const now = Date.now();
    return requests.map((request) => ({
      ...request,
      effectiveStatus: this.effectiveRequestStatus(request, now),
    }));
  }

  private effectiveRequestStatus(
    request: { status: ReviewRequestStatus; createdAt: Date },
    now: number,
  ): ReviewRequestEffectiveStatus {
    if (request.status === ReviewRequestStatus.rated) return 'rated';
    const ageDays = (now - request.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > REVIEW_TOKEN_EXPIRY_DAYS) return 'no_response';
    return request.status;
  }

  /** UPD-BE-100: conversion grouped by real `source` values (`order`, `qr`, or whatever else a
   * caller passes) — no hardcoded channel list, so a new source shows up automatically. */
  async conversionByChannel() {
    const since = new Date(
      Date.now() - REVIEW_CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const requests = await this.tenantPrisma.client.reviewRequest.findMany({
      where: { createdAt: { gte: since } },
      select: { source: true, status: true },
    });

    const bySource = new Map<string, { total: number; rated: number }>();
    for (const request of requests) {
      const entry = bySource.get(request.source) ?? { total: 0, rated: 0 };
      entry.total += 1;
      if (request.status === ReviewRequestStatus.rated) entry.rated += 1;
      bySource.set(request.source, entry);
    }

    return [...bySource.entries()]
      .map(([source, { total, rated }]) => ({
        source,
        total,
        rated,
        conversionRate: total > 0 ? round2((rated / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /** UPD-BE-104. `publicReviewUrl` is surfaced flat (it's a real dedicated `Business` column); everything else comes from the `reviewSettings` JSON blob. `logoKey` (the raw S3 object key) resolves to a fresh 24h-signed `logoUrl` on every read, same pattern as `VideoTestimonialsService.withVideoUrl`. */
  async getSettings(): Promise<
    { publicReviewUrl: string | null; logoUrl: string | null } & Record<
      string,
      unknown
    >
  > {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { publicReviewUrl: true, reviewSettings: true },
    });
    const settings = business.reviewSettings as Record<string, unknown>;
    const logoKey = settings.logoKey as string | undefined;
    return {
      publicReviewUrl: business.publicReviewUrl,
      ...settings,
      logoUrl: logoKey ? await this.s3.getSignedDownloadUrl(logoKey) : null,
    };
  }

  async updateSettings(dto: UpdateReviewSettingsDto) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const current = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { reviewSettings: true },
    });
    const existing = (current.reviewSettings as Record<string, unknown>) ?? {};
    const { publicReviewUrl, ...rest } = dto;
    const merged = { ...existing, ...rest };

    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: {
        ...(publicReviewUrl !== undefined ? { publicReviewUrl } : {}),
        reviewSettings: merged as Prisma.InputJsonValue,
      },
    });
    return this.getSettings();
  }

  /** UPD-FE-086's branding editor — actually rendered on the public rating page, the review
   * widget, and the QR poster (see `PublicReviewService`/`QrPosterService`), not just stored.
   * A previous logo is deleted from S3 once the new one is confirmed uploaded, never left orphaned. */
  async uploadLogo(file: { buffer: Buffer; size: number; mimetype: string }) {
    await validateUploadedFile(file, {
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
      maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
    });

    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const current = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { reviewSettings: true },
    });
    const existing = (current.reviewSettings as Record<string, unknown>) ?? {};
    const previousLogoKey = existing.logoKey as string | undefined;

    const extension =
      file.mimetype === 'image/png'
        ? 'png'
        : file.mimetype === 'image/webp'
          ? 'webp'
          : 'jpg';
    const logoKey = `review-branding/${businessId}/logo-${Date.now()}.${extension}`;
    await this.s3.upload(logoKey, file.buffer, file.mimetype);

    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: {
        reviewSettings: { ...existing, logoKey } as Prisma.InputJsonValue,
      },
    });

    if (previousLogoKey) {
      await this.s3.delete(previousLogoKey).catch(() => undefined);
    }

    return this.getSettings();
  }

  async removeLogo() {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const current = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { reviewSettings: true },
    });
    const existing = (current.reviewSettings as Record<string, unknown>) ?? {};
    const { logoKey, ...rest } = existing;

    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: { reviewSettings: rest as Prisma.InputJsonValue },
    });

    if (typeof logoKey === 'string') {
      await this.s3.delete(logoKey).catch(() => undefined);
    }

    return this.getSettings();
  }

  /** Only weeks that actually have a review are included — no fabricated zero-dips or interpolation for quiet weeks. */
  private buildWeeklySparkline(
    reviews: { stars: number; createdAt: Date }[],
  ): number[] {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const buckets = new Map<number, number[]>();

    for (const review of reviews) {
      const ageMs = now - review.createdAt.getTime();
      const weekIndex = SPARKLINE_WEEKS - 1 - Math.floor(ageMs / weekMs);
      if (weekIndex < 0 || weekIndex >= SPARKLINE_WEEKS) continue;
      const bucket = buckets.get(weekIndex) ?? [];
      bucket.push(review.stars);
      buckets.set(weekIndex, bucket);
    }

    return [...buckets.keys()]
      .sort((a, b) => a - b)
      .map((key) => {
        const bucket = buckets.get(key)!;
        return round2(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
      });
  }
}
