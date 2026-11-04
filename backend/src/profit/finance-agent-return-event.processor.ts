import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { FINANCE_RETURN_APPROVED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type FinanceReturnApprovedEvent = {
  businessId: string;
  returnId: string;
  approvedAt: string;
};

@Injectable()
export class FinanceAgentReturnEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: FinancialIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== FINANCE_RETURN_APPROVED_EVENT_JOB) return;
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
      !policies.bool('agents.financeApprovedReturnEventReviewEnabled')
    ) {
      return;
    }

    const approvedAt = new Date(event.approvedAt);
    if (!Number.isFinite(approvedAt.getTime())) return;
    const returned = await this.prisma.return.findFirst({
      where: {
        id: event.returnId,
        businessId: event.businessId,
        status: 'approved',
        updatedAt: approvedAt,
      },
      select: { id: true },
    });
    if (!returned) return;

    // A busy returns desk produces one monthly-source review per UTC day, not one per return.
    const month = approvedAt.toISOString().slice(0, 7);
    const utcDay = approvedAt.toISOString().slice(0, 10);
    const eventId = `finance-approved-returns-daily:${event.businessId}:${month}:${utcDay}`;
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

  private parseEvent(value: unknown): FinanceReturnApprovedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('returnId' in value) ||
      !('approvedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.returnId !== 'string' ||
      !value.returnId.trim() ||
      typeof value.approvedAt !== 'string' ||
      !Number.isFinite(new Date(value.approvedAt).getTime())
    ) {
      throw new Error(
        'Invalid Finance approved-return specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      returnId: value.returnId,
      approvedAt: value.approvedAt,
    };
  }
}
