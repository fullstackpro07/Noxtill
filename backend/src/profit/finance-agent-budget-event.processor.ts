import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { FINANCE_BUDGET_APPROVED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type FinanceBudgetApprovedEvent = {
  businessId: string;
  budgetId: string;
  version: number;
  approvedAt: string;
};

@Injectable()
export class FinanceAgentBudgetEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: FinancialIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== FINANCE_BUDGET_APPROVED_EVENT_JOB) return;
    const event = this.parseEvent(job.data);
    const attemptsMade = job.attemptsMade ?? 0;
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
      !policies.bool('agents.financeApprovedBudgetEventReviewEnabled')
    ) {
      return;
    }

    const approvedAt = new Date(event.approvedAt);
    const budget = await this.prisma.financeBudget.findFirst({
      where: {
        id: event.budgetId,
        businessId: event.businessId,
        status: 'approved',
        version: event.version,
        reviewedAt: approvedAt,
      },
      select: { id: true, version: true, monthStart: true },
    });
    if (!budget) return;

    const month = budget.monthStart.toISOString().slice(0, 7);
    const eventId = `finance-approved-budget:${budget.id}:v${budget.version}`;
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
            sourceModule: 'finance',
            entityType: 'FinanceBudget',
            entityId: budget.id,
            occurredAt: approvedAt,
            entityVersion: `${month}:v${budget.version}`,
          }),
        },
      );
    });
  }

  private parseEvent(value: unknown): FinanceBudgetApprovedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('budgetId' in value) ||
      !('version' in value) ||
      !('approvedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.budgetId !== 'string' ||
      !value.budgetId.trim() ||
      typeof value.version !== 'number' ||
      !Number.isInteger(value.version) ||
      value.version < 1 ||
      typeof value.approvedAt !== 'string' ||
      !Number.isFinite(new Date(value.approvedAt).getTime())
    ) {
      throw new Error(
        'Invalid Finance approved-budget specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      budgetId: value.budgetId,
      version: value.version,
      approvedAt: value.approvedAt,
    };
  }
}
