import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SpecialistAgentRunsService } from './specialist-agent-runs.service';
import { SpecialistAgentRetentionService } from './specialist-agent-retention.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

jest.setTimeout(30_000);

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SpecialistAgentRetentionService (real MySQL)', () => {
  let prisma: PrismaService;
  let retention: SpecialistAgentRetentionService;
  let runs: SpecialistAgentRunsService;
  let businessId: string;
  let otherBusinessId: string;
  let cls: FakeClsService;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    retention = new SpecialistAgentRetentionService(prisma);
    cls = new FakeClsService();
    runs = new SpecialistAgentRunsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
    const staleFixtures = await prisma.business.findMany({
      where: {
        name: {
          in: ['Specialist Retention QA', 'Specialist Retention Other QA'],
        },
        slug: { startsWith: 'specialist-retention-' },
      },
      select: { id: true },
    });
    const staleBusinessIds = staleFixtures.map(({ id }) => id);
    if (staleBusinessIds.length) {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: { in: staleBusinessIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { businessId: { in: staleBusinessIds } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: staleBusinessIds } },
      });
    }
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Retention QA',
          slug: `specialist-retention-${stamp}`,
          policies: { 'agents.specialistRunRetentionDays': 30 },
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Retention Other QA',
          slug: `specialist-retention-other-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('expires old transient run details once, while preserving proposals, active/recent runs, tenant isolation and cost ledger', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z');
    const oldFinishedAt = new Date('2026-09-20T12:00:00.000Z');
    const recentFinishedAt = new Date('2026-10-20T12:00:00.000Z');

    const oldRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
        finishedAt: oldFinishedAt,
        startedAt: oldFinishedAt,
        inputRefs: [{ source: 'qa', private: 'old context' }],
        output: { summary: 'old generated summary' },
        policyResult: { private: 'old policy context' },
        errorMessage: 'old diagnostic content',
      },
    });
    await prisma.specialistAgentEvidence.create({
      data: {
        businessId,
        runId: oldRun.id,
        sourceType: 'inventory',
        resourceType: 'product',
        resourceId: 'qa-product-1',
        fieldRefs: ['stockQty'],
        observedValues: { stockQty: 7 },
        observedAt: oldFinishedAt,
        freshness: 'fresh',
      },
    });
    const aiLog = await prisma.aiCallLog.create({
      data: {
        businessId,
        kind: 'inventory_agent',
        inputTokens: 100,
        outputTokens: 20,
        estimatedCostUsd: 0.0123,
        specialistAgentRunId: oldRun.id,
        toolCalls: [
          { tool: 'get_stock_summary', result: { private: 'trace' } },
        ],
      },
    });

    const protectedRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'financial_intelligence',
        agentVersion: '1.0.0',
        moduleId: '17',
        triggerType: 'manual',
        status: 'completed',
        finishedAt: oldFinishedAt,
        startedAt: oldFinishedAt,
        output: { summary: 'proposal-backed run is retained' },
      },
    });
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId,
        runId: protectedRun.id,
        agentKey: protectedRun.agentKey,
        title: 'Review proposal retention',
        summary: 'Keep this proposal available for review.',
        classification: 'review',
        confidenceMethod: 'not_calibrated',
        riskTier: 'low',
      },
    });
    await prisma.specialistAgentEvidence.create({
      data: {
        businessId,
        runId: protectedRun.id,
        recommendationId: recommendation.id,
        sourceType: 'finance',
        resourceType: 'ledger',
        resourceId: 'qa-ledger-1',
        fieldRefs: ['amount'],
        observedValues: { amount: 99 },
        observedAt: oldFinishedAt,
        freshness: 'fresh',
      },
    });

    const recentRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'seo_autopilot',
        agentVersion: '1.0.0',
        moduleId: '7',
        triggerType: 'manual',
        status: 'completed',
        finishedAt: recentFinishedAt,
        startedAt: recentFinishedAt,
        output: { summary: 'recent details remain' },
      },
    });
    const activeRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'customer_intelligence',
        agentVersion: '1.0.0',
        moduleId: '8',
        triggerType: 'manual',
        status: 'running',
        startedAt: oldFinishedAt,
        // A stale timestamp alone must not make an active run eligible for cleanup.
        finishedAt: oldFinishedAt,
        inputRefs: [{ source: 'qa', private: 'active context' }],
        output: { summary: 'active work must remain intact' },
      },
    });
    const foreignRun = await prisma.specialistAgentRun.create({
      data: {
        businessId: otherBusinessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
        finishedAt: oldFinishedAt,
        startedAt: oldFinishedAt,
        output: { summary: 'other tenant details remain' },
      },
    });
    for (const runId of [recentRun.id, activeRun.id, foreignRun.id]) {
      await prisma.specialistAgentEvidence.create({
        data: {
          businessId: runId === foreignRun.id ? otherBusinessId : businessId,
          runId,
          sourceType: 'qa',
          resourceType: 'record',
          resourceId: `qa-${runId}`,
          fieldRefs: ['status'],
          observedValues: { status: 'kept' },
          observedAt: oldFinishedAt,
          freshness: 'fresh',
        },
      });
    }

    const firstCleanup = await retention.runDue(now);
    expect(firstCleanup.businesses).toBeGreaterThanOrEqual(1);
    expect(firstCleanup.runsExpired).toBe(1);

    const expired = await prisma.specialistAgentRun.findUniqueOrThrow({
      where: { id: oldRun.id },
    });
    expect(expired).toMatchObject({
      status: 'completed',
      startedAt: oldFinishedAt,
      finishedAt: oldFinishedAt,
      inputRefs: [],
      output: {
        retentionStatus: 'expired',
      },
      policyResult: {},
      errorMessage: null,
    });
    expect(
      await prisma.specialistAgentEvidence.count({
        where: { runId: oldRun.id },
      }),
    ).toBe(0);
    const preservedUsage = await prisma.aiCallLog.findUniqueOrThrow({
      where: { id: aiLog.id },
    });
    expect(preservedUsage).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      toolCalls: null,
    });
    expect(Number(preservedUsage.estimatedCostUsd)).toBeCloseTo(0.0123, 6);

    expect(
      await prisma.specialistAgentEvidence.count({
        where: { runId: protectedRun.id },
      }),
    ).toBe(1);
    expect(
      await prisma.specialistAgentEvidence.count({
        where: { runId: recentRun.id },
      }),
    ).toBe(1);
    expect(
      await prisma.specialistAgentEvidence.count({
        where: { runId: activeRun.id },
      }),
    ).toBe(1);
    const preservedActiveRun =
      await prisma.specialistAgentRun.findUniqueOrThrow({
        where: { id: activeRun.id },
      });
    expect(preservedActiveRun).toMatchObject({
      status: 'running',
      inputRefs: [{ source: 'qa', private: 'active context' }],
      output: { summary: 'active work must remain intact' },
    });
    expect(
      await prisma.specialistAgentEvidence.count({
        where: { runId: foreignRun.id },
      }),
    ).toBe(1);

    const listed = await runs.get(businessId, oldRun.id);
    expect(listed).toMatchObject({
      detailsExpired: true,
      outputRedacted: true,
    });
    expect(listed).not.toHaveProperty('output');
    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        action: 'specialist_agent.retention.purge',
        entity: 'specialist_agent_run',
        entityId: oldRun.id,
      },
    });
    expect(audit?.after).toMatchObject({
      retentionDays: 30,
      deletedUnlinkedEvidence: 1,
      redactedProviderToolTraces: 1,
      runAndUsageHistoryPreserved: true,
    });

    const secondCleanup = await retention.runDue(now);
    expect(secondCleanup.businesses).toBeGreaterThanOrEqual(1);
    expect(secondCleanup.runsExpired).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          action: 'specialist_agent.retention.purge',
          entityId: oldRun.id,
        },
      }),
    ).toBe(1);
  });
});
