import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import {
  SEO_AUDIT_COMPLETED_EVENT_JOB,
  SPECIALIST_AGENT_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import { SeoSpecialistAgentService } from './seo-specialist-agent.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type SeoAuditCompletedEvent = {
  businessId: string;
  auditRunId: string;
};

@Processor(SPECIALIST_AGENT_EVENTS_QUEUE)
@Injectable()
export class SeoAuditAgentEventProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: SeoSpecialistAgentService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== SEO_AUDIT_COMPLETED_EVENT_JOB) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const event = this.parseEvent(job.data);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (!(await this.agentPolicy.isModuleEnabled(event.businessId, 'seo'))) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.seoEnabled') ||
      !policies.bool('agents.seoAuditEventReviewEnabled')
    ) {
      return;
    }

    const audit = await this.prisma.seoAuditRun.findFirst({
      where: {
        id: event.auditRunId,
        businessId: event.businessId,
        status: { in: ['completed', 'partial'] },
      },
      select: { id: true, startedAt: true, finishedAt: true },
    });
    if (!audit) return;

    const eventId = `seo-audit-completed:${audit.id}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'seo_autopilot',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(event.businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'marketing',
          entityType: 'SeoAuditRun',
          entityId: audit.id,
          occurredAt: audit.finishedAt ?? audit.startedAt,
          entityVersion: (audit.finishedAt ?? audit.startedAt).toISOString(),
        }),
      });
    });
  }

  private parseEvent(value: unknown): SeoAuditCompletedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('auditRunId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.auditRunId !== 'string' ||
      !value.auditRunId.trim()
    ) {
      throw new Error('Invalid SEO audit completed event payload');
    }
    return { businessId: value.businessId, auditRunId: value.auditRunId };
  }
}
