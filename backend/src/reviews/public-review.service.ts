import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { generateReviewToken } from './review-token.util';
import { ReviewRoute, Role } from '../../generated/prisma';

const TOKEN_EXPIRY_DAYS = 30;
/** Defense-in-depth against a distributed (multi-IP) abuser — the per-IP throttle on the mint endpoint can't catch this alone. */
const QR_DAILY_CAP_PER_BUSINESS = 200;

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
  ) {}

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

  /** BE-050: public, cacheable embed of a business's best reviews (4-5★, most recent first). */
  async getWidget(slug: string) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const reviews = await this.prisma.externalReview.findMany({
      where: { businessId: business.id, stars: { gte: 4 } },
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
      reviews,
    };
  }

  async getByToken(token: string) {
    const reviewRequest = await this.loadValid(token);
    return {
      businessName: reviewRequest.business.name,
      branding: reviewRequest.business.branding,
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

    // 4-5 stars: send them on to the public listing if one is configured; otherwise private mode.
    if (reviewRequest.business.publicReviewUrl) {
      return { redirect: reviewRequest.business.publicReviewUrl };
    }
    return { thankYou: true };
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
    if (reviewRequest.respondedAt || ageDays > TOKEN_EXPIRY_DAYS) {
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
