import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { FINANCE_EXPENSE_RECORDED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type FinanceExpenseRecordedEvent = {
  businessId: string;
  expenseId: string;
};

@Injectable()
export class FinanceAgentExpenseEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: FinancialIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== FINANCE_EXPENSE_RECORDED_EVENT_JOB) return;
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
      !policies.bool('agents.financeExpenseEventReviewEnabled')
    ) {
      return;
    }

    const expense = await this.prisma.expense.findFirst({
      where: { id: event.expenseId, businessId: event.businessId },
      select: { id: true, incurredOn: true, createdAt: true, updatedAt: true },
    });
    if (!expense) return;

    const eventId = `finance-expense:${expense.id}`;
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
        {
          month: expense.incurredOn.toISOString().slice(0, 7),
          period: 'month',
        },
        attempt.idempotencyKey,
        {
          triggerType: 'event',
          includeAiSummary: false,
          triggerRef: createSpecialistAgentTriggerRef({
            eventId,
            sourceModule: 'expenses',
            entityType: 'Expense',
            entityId: expense.id,
            occurredAt: expense.createdAt,
            entityVersion: expense.updatedAt.toISOString(),
          }),
        },
      );
    });
  }

  private parseEvent(value: unknown): FinanceExpenseRecordedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('expenseId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.expenseId !== 'string' ||
      !value.expenseId.trim()
    ) {
      throw new Error('Invalid Finance expense specialist event payload');
    }
    return { businessId: value.businessId, expenseId: value.expenseId };
  }
}
