import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { FINANCE_JOURNAL_POSTED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';

type FinanceJournalPostedEvent = {
  businessId: string;
  journalId: string;
  postedAt: string;
};

@Injectable()
export class FinanceAgentJournalEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: FinancialIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== FINANCE_JOURNAL_POSTED_EVENT_JOB) return;
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
      !policies.bool('agents.financePostedJournalEventReviewEnabled')
    ) {
      return;
    }

    const postedAt = new Date(event.postedAt);
    const journal = await this.prisma.financeJournalEntry.findFirst({
      where: {
        id: event.journalId,
        businessId: event.businessId,
        status: 'posted',
        postedAt,
      },
      select: { id: true, entryDate: true, postedAt: true },
    });
    const confirmedPostedAt = journal?.postedAt;
    if (!journal || !confirmedPostedAt) return;

    const month = journal.entryDate.toISOString().slice(0, 7);
    const eventId = `finance-posted-journal:${journal.id}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'financial_intelligence',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade: job.attemptsMade ?? 0,
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
            entityType: 'FinanceJournalEntry',
            entityId: journal.id,
            occurredAt: confirmedPostedAt,
            entityVersion: `${journal.entryDate.toISOString().slice(0, 10)}:posted:${confirmedPostedAt.toISOString()}`,
          }),
        },
      );
    });
  }

  private parseEvent(value: unknown): FinanceJournalPostedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('journalId' in value) ||
      !('postedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.journalId !== 'string' ||
      !value.journalId.trim() ||
      typeof value.postedAt !== 'string' ||
      !Number.isFinite(new Date(value.postedAt).getTime())
    ) {
      throw new Error(
        'Invalid Finance posted-journal specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      journalId: value.journalId,
      postedAt: value.postedAt,
    };
  }
}
