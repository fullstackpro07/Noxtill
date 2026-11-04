import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_ACTION = 'specialist_agent.retention.purge';
const RETENTION_ENTITY = 'specialist_agent_run';
const RETENTION_MARKER = 'expired';
const RETENTION_BATCH_SIZE = 100;
const ORCHESTRATOR_AGENT_KEY = 'specialist_agent_orchestrator';
const FINISHED_RUN_STATUSES = [
  'completed',
  'partially_succeeded',
  'failed',
  'cancelled',
  'skipped',
] as const;

type RetentionRun = {
  id: string;
  status: string;
  finishedAt: Date | null;
};

@Injectable()
export class SpecialistAgentRetentionService {
  private readonly logger = new Logger(SpecialistAgentRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily background cleanup. Run and cost history remain; transient evidence and provider traces expire. */
  async runDue(
    now = new Date(),
  ): Promise<{ businesses: number; runsExpired: number }> {
    const businesses = await this.prisma.business.findMany({
      where: { active: true },
      select: { id: true, policies: true },
    });

    let checkedBusinesses = 0;
    let runsExpired = 0;
    for (const business of businesses) {
      const retentionDays = resolvePolicies(business).num(
        'agents.specialistRunRetentionDays',
      );
      if (retentionDays === null) continue;
      checkedBusinesses += 1;
      runsExpired += await this.expireBusinessRuns(
        business.id,
        retentionDays,
        now,
      );
    }
    return { businesses: checkedBusinesses, runsExpired };
  }

  private async expireBusinessRuns(
    businessId: string,
    retentionDays: number,
    now: Date,
  ): Promise<number> {
    const cutoff = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    let cursor: string | undefined;
    let expired = 0;

    for (;;) {
      const candidates = await this.prisma.specialistAgentRun.findMany({
        where: {
          businessId,
          agentKey: { not: ORCHESTRATOR_AGENT_KEY },
          status: { in: [...FINISHED_RUN_STATUSES] },
          finishedAt: { lt: cutoff },
          recommendations: { none: {} },
          actions: { none: {} },
          NOT: {
            output: {
              equals: { retentionStatus: RETENTION_MARKER },
            },
          },
        },
        orderBy: [{ finishedAt: 'asc' }, { id: 'asc' }],
        take: RETENTION_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          status: true,
          finishedAt: true,
        },
      });
      if (candidates.length === 0) break;

      for (const run of candidates) {
        if (await this.expireRun(businessId, run, retentionDays, cutoff, now)) {
          expired += 1;
        }
      }

      cursor = candidates.at(-1)?.id;
      if (!cursor || candidates.length < RETENTION_BATCH_SIZE) break;
    }
    if (expired > 0) {
      this.logger.log(
        `Expired transient details for ${expired} specialist run(s) in business ${businessId}`,
      );
    }
    return expired;
  }

  private async expireRun(
    businessId: string,
    run: RetentionRun,
    retentionDays: number,
    cutoff: Date,
    now: Date,
  ): Promise<boolean> {
    const candidate = run;
    const finishedAt = candidate.finishedAt;
    if (!finishedAt) return false;
    return this.prisma.$transaction(async (tx) => {
      // Conditional update is an atomic claim: concurrent workers can only expire a run once.
      // The terminal date and absence of proposals/actions are rechecked inside the transaction.
      const claimed = await tx.specialistAgentRun.updateMany({
        where: {
          id: candidate.id,
          businessId,
          agentKey: { not: ORCHESTRATOR_AGENT_KEY },
          status: { in: [...FINISHED_RUN_STATUSES] },
          finishedAt: { lt: cutoff },
          recommendations: { none: {} },
          actions: { none: {} },
          NOT: {
            output: {
              equals: { retentionStatus: RETENTION_MARKER },
            },
          },
        },
        data: {
          inputRefs: [],
          output: { retentionStatus: RETENTION_MARKER },
          policyResult: {},
          errorMessage: null,
        },
      });
      if (claimed.count === 0) return false;

      const evidence = await tx.specialistAgentEvidence.deleteMany({
        where: { businessId, runId: candidate.id, recommendationId: null },
      });
      // Provider tool results may contain source values; keep token/cost rows but clear the trace.
      const providerTraces = await tx.aiCallLog.updateMany({
        where: { businessId, specialistAgentRunId: candidate.id },
        data: { toolCalls: Prisma.DbNull },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId: null,
          action: RETENTION_ACTION,
          entity: RETENTION_ENTITY,
          entityId: candidate.id,
          before: {
            status: candidate.status,
            finishedAt: finishedAt.toISOString(),
            evidenceCount: evidence.count,
          },
          after: {
            retentionDays,
            expiredAt: now.toISOString(),
            cleared: [
              'inputRefs',
              'run output',
              'policyResult',
              'errorMessage',
            ],
            deletedUnlinkedEvidence: evidence.count,
            redactedProviderToolTraces: providerTraces.count,
            runAndUsageHistoryPreserved: true,
            proposalsAndActionsProtected: true,
          },
        },
      });
      return true;
    });
  }
}
