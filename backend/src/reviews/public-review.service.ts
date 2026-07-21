import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { ReviewRoute, Role } from '../../generated/prisma';

const TOKEN_EXPIRY_DAYS = 30;

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
  ) {}

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
      await this.prisma.privateFeedback.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: reviewRequest.id,
          customerId: reviewRequest.customerId,
          stars: dto.stars,
          message: dto.message,
        },
      });

      await this.alertOwner(reviewRequest.businessId, dto.stars, dto.message);
      return { thankYou: true };
    }

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
