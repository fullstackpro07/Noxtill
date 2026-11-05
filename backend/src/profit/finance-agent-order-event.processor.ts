import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { FINANCE_ORDER_COMPLETED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type FinanceOrderCompletedEvent = {
  businessId: string;
  orderId: string;
  completedAt: string;
};

@Injectable()
export class FinanceAgentOrderEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: FinancialIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== FINANCE_ORDER_COMPLETED_EVENT_JOB) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const event = this.parseEvent(job.data);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'finance',
      ))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.financeEnabled') ||
      !policies.bool('agents.financeCompletedOrderEventReviewEnabled')
    ) {
      return;
    }

    const completedAt = new Date(event.completedAt);
    if (!Number.isFinite(completedAt.getTime())) return;
    const order = await this.prisma.order.findFirst({
      where: {
        id: event.orderId,
        businessId: event.businessId,
        status: 'completed',
        isQuotation: false,
        updatedAt: completedAt,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    if (!order) return;

    // One review per business/source month/UTC completion day prevents a busy POS from producing
    // a run for every sale. The saved trigger reference points to this aggregate, not the first
    // order that happened to enqueue the day's review.
    const month = order.createdAt.toISOString().slice(0, 7);
    const utcDay = completedAt.toISOString().slice(0, 10);
    const eventId = `finance-completed-orders-daily:${event.businessId}:${month}:${utcDay}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'financial_intelligence',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(
        event.businessId,
        null,
        { month, period: 'month' },
        attempt.idempotencyKey,
        {
          triggerType: 'event',
          includeAiSummary: false,
          triggerRef: createSpecialistAgentTriggerRef({
            eventId,
            sourceModule: 'orders',
            entityType: 'Business',
            entityId: event.businessId,
            occurredAt: new Date(`${utcDay}T00:00:00.000Z`),
            entityVersion: `${month}:${utcDay}`,
          }),
        },
      );
    });
  }

  private parseEvent(value: unknown): FinanceOrderCompletedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('orderId' in value) ||
      !('completedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.orderId !== 'string' ||
      !value.orderId.trim() ||
      typeof value.completedAt !== 'string' ||
      !Number.isFinite(new Date(value.completedAt).getTime())
    ) {
      throw new Error(
        'Invalid Finance completed-order specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      orderId: value.orderId,
      completedAt: value.completedAt,
    };
  }
}
