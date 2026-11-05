import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { FINANCE_STATEMENT_IMPORTED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';

type FinanceStatementImportedEvent = {
  businessId: string;
  importId: string;
  importedAt: string;
};

@Injectable()
export class FinanceAgentStatementImportedEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: FinancialIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== FINANCE_STATEMENT_IMPORTED_EVENT_JOB) return;
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
      !policies.bool('agents.financeStatementImportedEventReviewEnabled')
    ) {
      return;
    }

    const importedAt = new Date(event.importedAt);
    const statement = await this.prisma.financeBankStatementImport.findFirst({
      where: {
        id: event.importId,
        businessId: event.businessId,
        createdAt: importedAt,
      },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        rowCount: true,
        createdAt: true,
      },
    });
    if (!statement) return;

    const month = statement.periodStart.toISOString().slice(0, 7);
    const eventId = `finance-statement-imported:${statement.id}`;
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
            entityType: 'FinanceBankStatementImport',
            entityId: statement.id,
            occurredAt: statement.createdAt,
            entityVersion: `${statement.periodStart.toISOString().slice(0, 10)}:${statement.periodEnd.toISOString().slice(0, 10)}:${statement.rowCount}`,
          }),
        },
      );
    });
  }

  private parseEvent(value: unknown): FinanceStatementImportedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('importId' in value) ||
      !('importedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.importId !== 'string' ||
      !value.importId.trim() ||
      typeof value.importedAt !== 'string' ||
      !Number.isFinite(new Date(value.importedAt).getTime())
    ) {
      throw new Error(
        'Invalid Finance statement-import specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      importId: value.importId,
      importedAt: value.importedAt,
    };
  }
}
