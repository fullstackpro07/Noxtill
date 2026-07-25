import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BASIC_PLAN_KEY } from './billing.constants';

/**
 * The single place that moves a business onto a different plan (BE-065).
 * Always syncs `Business.msgQuota` to the new plan's allowance — that's
 * what makes a downgrade actually bite: SendGateService already refuses to
 * send once `msgUsed >= msgQuota` (BE-015), so dropping quota to the Basic
 * plan's allowance is what makes an expired trial "read-only beyond limits"
 * without needing a separate feature-gate mechanism.
 */
@Injectable()
export class PlanAssignmentService {
  private readonly logger = new Logger(PlanAssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assignByStripePriceId(
    businessId: string,
    stripePriceId: string,
  ): Promise<void> {
    const plan = await this.prisma.plan.findUnique({
      where: { stripePriceId },
    });
    if (!plan) {
      this.logger.warn(
        `No plan matches Stripe price ${stripePriceId} — leaving business as-is`,
      );
      return;
    }
    await this.prisma.business.update({
      where: { id: businessId },
      data: { planId: plan.id, msgQuota: plan.msgQuota },
    });
  }

  async downgradeToBasic(businessId: string): Promise<void> {
    const basic = await this.prisma.plan.findUnique({
      where: { key: BASIC_PLAN_KEY },
    });
    if (!basic) {
      this.logger.error(
        `Basic plan (key="${BASIC_PLAN_KEY}") is not seeded — cannot downgrade`,
      );
      return;
    }
    await this.prisma.business.update({
      where: { id: businessId },
      data: { planId: basic.id, msgQuota: basic.msgQuota },
    });
  }
}
