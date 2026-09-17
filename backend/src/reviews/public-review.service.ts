import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { generateReviewToken } from './review-token.util';
import { ReviewRequestStatus, ReviewRoute, Role } from '@prisma/client';
import { REVIEW_TOKEN_EXPIRY_DAYS } from './reviews.constants';
import { VideoTestimonialsService } from './video-testimonials.service';

/** Defense-in-depth against a distributed (multi-IP) abuser — the per-IP throttle on the mint endpoint can't catch this alone. */
const QR_DAILY_CAP_PER_BUSINESS = 200;

interface ResolvedBranding {
  brandColor: string | null;
  logoUrl: string | null;
}

/**
 * Public rating page (BE-046) — no auth, resolved entirely by the token.
 * Tokens are single-purpose: once responded to, or once 30 days old,
 * the token 404s (spec §6: "no enumeration", "single-purpose" tokens).
 */
@Injectable()
export class PublicReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
    private readonly activity: ActivityService,
    private readonly s3: S3Service,
    private readonly videoTestimonials: VideoTestimonialsService,
  ) {}

  /** UPD-FE-086: resolves the real `reviewSettings.brandColor`/`logoKey` into what the 3 public
   * consumers (rating page, widget, QR poster) actually render — a fresh signed URL every call,
   * same as `logoKey` resolution on the authenticated settings endpoint. */
  private async resolveBranding(
    reviewSettings: unknown,
  ): Promise<ResolvedBranding> {
    const settings = (reviewSettings as Record<string, unknown>) ?? {};
    const logoKey = settings.logoKey as string | undefined;
    return {
      brandColor: (settings.brandColor as string | undefined) ?? null,
      logoUrl: logoKey ? await this.s3.getSignedDownloadUrl(logoKey) : null,
    };
  }

  /**
   * Mints a fresh, anonymous, single-use review-request token for a QR-scan/no-login entry point
   * (no customerId — unlike every other review request, which is tied to a real customer after a
   * real sale). From here on the customer is on the exact same `/r/:token` flow as everyone else;
   * this method's only job is issuing that token safely. Rate-limited at the controller
   * (`@Throttle`, 5/min/IP) plus a per-business daily cap here as defense-in-depth against a
   * distributed abuser the per-IP limit alone can't stop.
   */
  async mintAnonymousLink(slug: string): Promise<{ token: string }> {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentQrCount = await this.prisma.reviewRequest.count({
      where: {
        businessId: business.id,
        source: 'qr',
        createdAt: { gte: since },
      },
    });
    if (recentQrCount >= QR_DAILY_CAP_PER_BUSINESS) {
      throw new AppException(
        'REVIEW_QR_DAILY_CAP_REACHED',
        'Too many review links have been requested today — please try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = generateReviewToken();
    await this.prisma.reviewRequest.create({
      data: { businessId: business.id, token, source: 'qr' },
    });

    return { token };
  }

  /** BE-050: public, cacheable embed of a business's best reviews, most recent first. `minRating`
   * defaults to 4 (UPD-BE-102's min-rating control) — clamped to 1-5 so a bad query param can't
   * turn this into "show every review including 1-stars" by accident. */
  async getWidget(slug: string, minRating = 4) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    const threshold = Math.min(5, Math.max(1, Math.round(minRating)));

    const reviews = await this.prisma.externalReview.findMany({
      where: { businessId: business.id, stars: { gte: threshold } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        author: true,
        stars: true,
        text: true,
        createdAt: true,
        platform: true,
      },
    });

    return {
      businessName: business.name,
      branding: business.branding,
      ...(await this.resolveBranding(business.reviewSettings)),
      reviews,
    };
  }

  /** Video Testimonials depth fix (UPD-INT-008) — the real public gallery of approved testimonials. Signs a fresh, short-lived video URL per request instead of persisting one, since a stored signed URL would eventually expire and 403. */
  async getVideoGallery(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const testimonials = await this.prisma.videoTestimonial.findMany({
      where: {
        businessId: business.id,
        status: 'approved',
        videoKey: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { customer: true },
    });

    const items = await Promise.all(
      testimonials.map(async (t) => ({
        id: t.id,
        caption: t.caption,
        customerName: t.customer?.name ?? null,
        videoUrl: await this.s3.getSignedDownloadUrl(t.videoKey!),
      })),
    );

    return {
      businessName: business.name,
      branding: business.branding,
      testimonials: items,
    };
  }

  /** UPD-BE-100: first real open of the link — only advances `sent` -> `opened`, never regresses an already-`rated` request. */
  async getByToken(token: string) {
    const reviewRequest = await this.loadValid(token);
    if (reviewRequest.status === ReviewRequestStatus.sent) {
      await this.prisma.reviewRequest.update({
        where: { id: reviewRequest.id },
        data: { status: ReviewRequestStatus.opened, openedAt: new Date() },
      });
    }
    return {
      businessName: reviewRequest.business.name,
      branding: reviewRequest.business.branding,
      ...(await this.resolveBranding(reviewRequest.business.reviewSettings)),
    };
  }

  async submit(token: string, dto: SubmitReviewDto) {
    const reviewRequest = await this.loadValid(token);
    const routedTo: ReviewRoute =
      dto.stars >= 4 ? ReviewRoute.public : ReviewRoute.private;

    await this.prisma.reviewRequest.update({
      where: { id: reviewRequest.id },
      data: {
        stars: dto.stars,
        message: dto.message,
        routedTo,
        respondedAt: new Date(),
        status: ReviewRequestStatus.rated,
      },
    });

    if (routedTo === ReviewRoute.private) {
      const feedback = await this.prisma.privateFeedback.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: reviewRequest.id,
          customerId: reviewRequest.customerId,
          stars: dto.stars,
          message: dto.message,
        },
      });

      // Recorded before alertOwner(): activity recording is fast and fail-fast by design and must
      // not be gated behind sendGate.send()'s queue add (alertOwner's `.catch()` only guards
      // against rejection, not a pending add() that never resolves — see orders.service.ts).
      await this.activity.record(reviewRequest.businessId, {
        type: 'review',
        description: `${dto.stars}★ review received`,
        entityType: 'ReviewRequest',
        entityId: reviewRequest.id,
      });
      await this.activity.record(reviewRequest.businessId, {
        type: 'complaint',
        description: `New ${dto.stars}★ private feedback`,
        entityType: 'PrivateFeedback',
        entityId: feedback.id,
      });
      await this.alertOwner(reviewRequest.businessId, dto.stars, dto.message);
      return { thankYou: true };
    }

    await this.activity.record(reviewRequest.businessId, {
      type: 'review',
      description: `${dto.stars}★ review received`,
      entityType: 'ReviewRequest',
      entityId: reviewRequest.id,
    });

    await this.maybeTriggerVideoRequest(
      reviewRequest.businessId,
      reviewRequest.customerId,
      dto.stars,
    );

    // 4-5 stars: send them on to whichever real public listing(s) are configured — the primary
    // `publicReviewUrl` plus every `ReviewPlatformDestination` (UPD-BE-M31). A single destination
    // keeps the original auto-redirect behavior; two or more offer a real choice instead of
    // picking one arbitrarily.
    const destinations = await this.resolvePlatformDestinations(
      reviewRequest.businessId,
      reviewRequest.business.publicReviewUrl,
    );
    if (destinations.length === 1) {
      return { redirect: destinations[0].url };
    }
    if (destinations.length > 1) {
      return { redirects: destinations };
    }
    return { thankYou: true };
  }

  private async resolvePlatformDestinations(
    businessId: string,
    primaryUrl: string | null,
  ): Promise<{ platform: string; url: string }[]> {
    const extra = await this.prisma.reviewPlatformDestination.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    const destinations: { platform: string; url: string }[] = [];
    if (primaryUrl) {
      destinations.push({ platform: 'primary', url: primaryUrl });
    }
    for (const row of extra) {
      destinations.push({ platform: row.platform, url: row.url });
    }
    return destinations;
  }

  /** UPD-BE-M31: real automatic video-testimonial request — 'manual' (the default) never fires
   * this. Best-effort and non-blocking, same convention as `alertOwner`; skipped entirely for an
   * anonymous QR-sourced rating (no `customerId` to message). */
  private async maybeTriggerVideoRequest(
    businessId: string,
    customerId: string | null,
    stars: number,
  ): Promise<void> {
    if (!customerId) return;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { reviewSettings: true },
    });
    const trigger = (business?.reviewSettings as Record<string, unknown> | null)
      ?.videoTestimonialTrigger as string | undefined;
    const shouldTrigger =
      trigger === 'five_star'
        ? stars === 5
        : trigger === 'four_star_plus'
          ? stars >= 4
          : false;
    if (!shouldTrigger) return;

    // Never request twice for the same customer while a prior request is still outstanding.
    const alreadyRequested = await this.prisma.videoTestimonial.findFirst({
      where: { businessId, customerId, status: 'requested' },
    });
    if (alreadyRequested) return;

    await this.videoTestimonials
      .request(businessId, { customerId })
      .catch(() => undefined);
  }

  private async loadValid(token: string) {
    const reviewRequest = await this.prisma.reviewRequest.findUnique({
      where: { token },
      include: { business: true },
    });
    if (!reviewRequest) {
      throw new NotFoundException();
    }

    const ageDays =
      (Date.now() - reviewRequest.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (reviewRequest.respondedAt || ageDays > REVIEW_TOKEN_EXPIRY_DAYS) {
      throw new NotFoundException();
    }

    return reviewRequest;
  }

  private async alertOwner(
    businessId: string,
    stars: number,
    message?: string,
  ): Promise<void> {
    const owner = await this.prisma.businessUser.findFirst({
      where: { businessId, role: Role.owner },
      include: { user: true },
    });
    if (!owner) return;

    await this.sendGate
      .send({
        businessId,
        to: {
          phone: owner.user.phone ?? undefined,
          email: owner.user.email ?? undefined,
        },
        templateKey: 'owner_alert',
        variables: {
          alertTitle: 'New private feedback',
          alertBody: `${stars}★ — ${message ?? 'no comment left'}`,
        },
      })
      .catch(() => undefined);
  }
}
