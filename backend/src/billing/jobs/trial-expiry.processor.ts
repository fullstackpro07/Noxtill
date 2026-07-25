import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanAssignmentService } from '../plan-assignment.service';
import { TRIAL_EXPIRY_QUEUE, BASIC_PLAN_KEY } from '../billing.constants';

interface TrialExpiryJobData {
  /** ISO timestamp override, used only by tests to make "now" deterministic. */
  now?: string;
}

/**
 * `trial_expiry` (BE-065): a business whose 14-day trial has lapsed without
 * ever completing a Stripe checkout (no stripeSubscriptionId) is downgraded
 * to the Basic plan. Never touches a business that already has a paid
 * subscription, even if trialEndsAt is in the past (that field is simply
 * stale for them at that point).
 */
@Processor(TRIAL_EXPIRY_QUEUE)
export class TrialExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(TrialExpiryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planAssignment: PlanAssignmentService,
  ) {
    super();
  }

  async process(job: Job<TrialExpiryJobData>): Promise<void> {
    if (job.name !== 'tick') return;
    const now = job.data?.now ? new Date(job.data.now) : new Date();
    return this.runExpiry(now);
  }

  async runExpiry(now: Date = new Date()): Promise<void> {
    const basic = await this.prisma.plan.findUnique({
      where: { key: BASIC_PLAN_KEY },
    });

    const expired = await this.prisma.business.findMany({
      where: {
        trialEndsAt: { lte: now },
        stripeSubscriptionId: null,
        ...(basic ? { planId: { not: basic.id } } : {}),
      },
    });

    for (const business of expired) {
      await this.planAssignment.downgradeToBasic(business.id);
    }

    this.logger.debug(`Trial expiry downgraded ${expired.length} business(es)`);
  }
}
