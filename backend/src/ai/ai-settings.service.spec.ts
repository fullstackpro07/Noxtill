import { PrismaService } from '../prisma/prisma.service';
import { AiSettingsService } from './ai-settings.service';

describe('AiSettingsService (UPD-BE-115)', () => {
  let prisma: PrismaService;
  let service: AiSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AiSettingsService(prisma);

    const business = await prisma.business.create({
      data: {
        name: 'AI Settings Test Biz',
        slug: `ai-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.aiCallLog.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('returns every toggle defaulted to enabled when nothing has been set', async () => {
    const settings = await service.getSettings(businessId);
    expect(settings.featureToggles).toEqual({
      voiceEntry: true,
      voiceQualityAssist: true,
      photoDigitizer: true,
      reviewReplies: true,
      campaignCopy: true,
      insights: true,
      whatIf: true,
      assistant: true,
      workflowAgents: true,
      inventoryAgent: true,
      financeAgent: true,
      customerAgent: true,
      seoAgent: true,
      commerceAgent: true,
      voiceMeetingSummary: true,
    });
    expect(settings.disclosureText).toContain('AI');
  });

  it('groups real AiCallLog rows into their feature bucket, with unmapped kinds under "other"', async () => {
    await prisma.aiCallLog.createMany({
      data: [
        {
          businessId,
          kind: 'review_reply',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.01,
        },
        {
          businessId,
          kind: 'review_reply',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.02,
        },
        {
          businessId,
          kind: 'ai_insights',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.03,
        },
        {
          businessId,
          kind: 'branch_advisor_unmapped',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.04,
        },
        {
          businessId,
          kind: 'workflow_agent',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.02,
        },
      ],
    });

    const settings = await service.getSettings(businessId);
    expect(settings.usageThisMonth.byFeature.reviewReplies.calls).toBe(2);
    expect(settings.usageThisMonth.byFeature.reviewReplies.costUsd).toBeCloseTo(
      0.03,
      4,
    );
    expect(settings.usageThisMonth.byFeature.insights.calls).toBe(1);
    expect(settings.usageThisMonth.byFeature.insights.costUsd).toBeCloseTo(
      0.03,
      4,
    );
    expect(settings.usageThisMonth.byFeature.workflowAgents.calls).toBe(1);
    expect(
      settings.usageThisMonth.byFeature.workflowAgents.costUsd,
    ).toBeCloseTo(0.02, 4);
    expect(settings.usageThisMonth.other.calls).toBe(1);
    expect(settings.usageThisMonth.other.costUsd).toBeCloseTo(0.04, 4);
    expect(settings.usageThisMonth.totalCostUsd).toBeCloseTo(0.12, 4);
    expect(settings.usageThisMonth.totalCalls).toBe(5);
    expect(settings.aiQueryQuota).toBe(500);
    expect(settings.usageThisMonth.queryQuotaUsedPercent).toBe(1);
    expect(new Date(settings.usageThisMonth.limitResetsAt).getUTCDate()).toBe(
      1,
    );
    expect(settings.queriesThisWeek).toHaveLength(7);
    expect(settings.queriesThisWeek.map((d) => d.day)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(settings.queriesThisWeek.reduce((sum, d) => sum + d.count, 0)).toBe(
      5,
    );
  });

  it('updates the cost cap, rate limit, and merges partial feature toggles without clobbering the rest', async () => {
    const updated = await service.updateSettings(businessId, {
      aiMonthlyCostCapUsd: 25,
      aiRateLimitPerMinute: 30,
      aiQueryQuota: 1000,
      featureToggles: { reviewReplies: false },
    });

    expect(updated.aiMonthlyCostCapUsd).toBe(25);
    expect(updated.aiRateLimitPerMinute).toBe(30);
    expect(updated.aiQueryQuota).toBe(1000);
    expect(updated.featureToggles.reviewReplies).toBe(false);
    expect(updated.featureToggles.insights).toBe(true);

    const again = await service.updateSettings(businessId, {
      featureToggles: { campaignCopy: false },
    });
    expect(again.featureToggles.reviewReplies).toBe(false);
    expect(again.featureToggles.campaignCopy).toBe(false);
    expect(again.aiMonthlyCostCapUsd).toBe(25);
  });

  it('reports tenant-scoped specialist run, latency, failure-code and linked AI usage metrics', async () => {
    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Specialist Operations Test Biz',
        slug: `ai-operations-other-${Date.now()}`,
      },
    });
    const now = new Date();
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.seoMaxRequestsPerMonth': 4,
          'agents.seoMaxSpendUsdPerMonth': 0.04,
          'agents.inventoryMaxRequestsPerMonth': null,
          'agents.inventoryMaxSpendUsdPerMonth': null,
        },
      },
    });
    const makeRun = (input: {
      businessId: string;
      agentKey: string;
      moduleId: string;
      status: string;
      triggerType: string;
      elapsedMs?: number;
      errorCode?: string;
      startedAt?: Date;
      workerStartedAt?: Date;
      createdAt?: Date;
      initiatedByUserId?: string;
    }) => {
      const startedAt =
        input.startedAt ??
        new Date(now.getTime() - (input.elapsedMs ?? 0) - 1000);
      return prisma.specialistAgentRun.create({
        data: {
          businessId: input.businessId,
          agentKey: input.agentKey,
          agentVersion: 'test-v1',
          moduleId: input.moduleId,
          triggerType: input.triggerType,
          status: input.status,
          errorCode: input.errorCode,
          initiatedByUserId: input.initiatedByUserId,
          startedAt,
          workerStartedAt: input.workerStartedAt,
          finishedAt:
            input.elapsedMs === undefined
              ? null
              : new Date(startedAt.getTime() + input.elapsedMs),
          createdAt: input.createdAt ?? now,
        },
      });
    };

    try {
      const seoFast = await makeRun({
        businessId,
        agentKey: 'seo_autopilot',
        moduleId: '28',
        status: 'completed',
        triggerType: 'manual',
        elapsedMs: 1000,
        initiatedByUserId: 'qa-operator-one',
      });
      const seoMiddle = await makeRun({
        businessId,
        agentKey: 'seo_autopilot',
        moduleId: '28',
        status: 'completed',
        triggerType: 'event',
        elapsedMs: 2000,
        initiatedByUserId: 'qa-operator-one',
      });
      await prisma.specialistAgentRecommendation.createMany({
        data: [
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            title: 'QA proposed recommendation',
            summary: 'Scoped test record only',
            classification: 'opportunity',
            confidenceMethod: 'unavailable',
            riskTier: 'low',
            status: 'proposed',
          },
          {
            businessId,
            runId: seoMiddle.id,
            agentKey: 'seo_autopilot',
            title: 'QA dismissed recommendation',
            summary: 'Scoped test record only',
            classification: 'opportunity',
            confidenceMethod: 'unavailable',
            riskTier: 'low',
            status: 'dismissed',
          },
        ],
      });
      await makeRun({
        businessId,
        agentKey: 'seo_autopilot',
        moduleId: '28',
        status: 'failed',
        triggerType: 'scheduled',
        elapsedMs: 3000,
        errorCode: 'SEO_TEST_ERROR',
        initiatedByUserId: 'qa-operator-two',
      });
      await makeRun({
        businessId,
        agentKey: 'inventory_intelligence',
        moduleId: '13',
        status: 'running',
        triggerType: 'manual',
        startedAt: new Date(now.getTime() - 60_000),
      });
      await makeRun({
        businessId,
        agentKey: 'inventory_intelligence',
        moduleId: '13',
        status: 'cancel_requested',
        triggerType: 'manual',
        startedAt: new Date(now.getTime() - 90_000),
      });
      await makeRun({
        businessId,
        agentKey: 'specialist_agent_orchestrator',
        moduleId: 'shared',
        status: 'completed',
        triggerType: 'manual',
        createdAt: new Date(now.getTime() - 5_000),
        workerStartedAt: new Date(now.getTime() - 4_500),
        startedAt: new Date(now.getTime() - 4_500),
        elapsedMs: 100,
      });
      await makeRun({
        businessId,
        agentKey: 'specialist_agent_orchestrator',
        moduleId: 'shared',
        status: 'completed',
        triggerType: 'manual',
        createdAt: new Date(now.getTime() - 7_000),
        workerStartedAt: new Date(now.getTime() - 5_000),
        startedAt: new Date(now.getTime() - 5_000),
        elapsedMs: 100,
      });
      await makeRun({
        businessId,
        agentKey: 'specialist_agent_orchestrator',
        moduleId: 'shared',
        status: 'running',
        triggerType: 'manual',
        createdAt: new Date(now.getTime() - 30_000),
        startedAt: new Date(now.getTime() - 30_000),
      });
      const otherBusinessRun = await makeRun({
        businessId: otherBusiness.id,
        agentKey: 'seo_autopilot',
        moduleId: '28',
        status: 'failed',
        triggerType: 'event',
        elapsedMs: 9000,
        errorCode: 'OTHER_TENANT_ERROR',
      });
      await prisma.specialistAgentToolCall.createMany({
        data: [
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'registered_read_example',
            sequence: 1,
            status: 'succeeded',
            inputSha256: 'a'.repeat(64),
            correlationId: 'qa-persisted-tool-call-1',
            durationMs: 17,
            createdAt: now,
          },
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'registered_read_example',
            sequence: 2,
            status: 'blocked',
            inputSha256: 'b'.repeat(64),
            correlationId: 'qa-persisted-tool-call-2',
            errorCode: 'TOOL_POLICY_BLOCKED',
            createdAt: now,
          },
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'registered_read_example',
            sequence: 3,
            status: 'failed',
            inputSha256: 'e'.repeat(64),
            correlationId: 'qa-persisted-tool-call-3',
            durationMs: 37,
            errorCode: 'TOOL_SOURCE_FAILED',
            createdAt: now,
          },
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'registered_read_example',
            sequence: 4,
            status: 'blocked',
            inputSha256: 'f'.repeat(64),
            correlationId: 'qa-persisted-tool-call-4',
            errorCode: 'TOOL_POLICY_BLOCKED',
            createdAt: now,
          },
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'registered_read_example',
            sequence: 5,
            status: 'blocked',
            inputSha256: '1'.repeat(64),
            correlationId: 'qa-persisted-tool-call-5',
            errorCode: 'TOOL_POLICY_BLOCKED',
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            runId: otherBusinessRun.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'foreign_registered_tool',
            sequence: 1,
            status: 'blocked',
            inputSha256: 'c'.repeat(64),
            correlationId: 'foreign-qa-persisted-tool-call',
            createdAt: now,
          },
          {
            businessId,
            runId: seoMiddle.id,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            toolKey: 'old_registered_tool',
            sequence: 1,
            status: 'refused',
            inputSha256: 'd'.repeat(64),
            correlationId: 'old-qa-persisted-tool-call',
            createdAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
          },
        ],
      });
      await makeRun({
        businessId: otherBusiness.id,
        agentKey: 'specialist_agent_orchestrator',
        moduleId: 'shared',
        status: 'completed',
        triggerType: 'manual',
        createdAt: new Date(now.getTime() - 10_000),
        workerStartedAt: new Date(now.getTime() - 9_000),
        startedAt: new Date(now.getTime() - 9_000),
        elapsedMs: 100,
      });
      await prisma.specialistAgentRecommendation.create({
        data: {
          businessId: otherBusiness.id,
          runId: otherBusinessRun.id,
          agentKey: 'seo_autopilot',
          title: 'Foreign tenant recommendation fixture',
          summary: 'Must not appear in this business metrics',
          classification: 'opportunity',
          confidenceMethod: 'unavailable',
          riskTier: 'low',
          status: 'approved',
        },
      });

      const proposedRecommendation =
        await prisma.specialistAgentRecommendation.findFirstOrThrow({
          where: {
            businessId,
            runId: seoFast.id,
            title: 'QA proposed recommendation',
          },
          select: { id: true },
        });
      const dismissedRecommendation =
        await prisma.specialistAgentRecommendation.findFirstOrThrow({
          where: {
            businessId,
            runId: seoMiddle.id,
            title: 'QA dismissed recommendation',
          },
          select: { id: true },
        });
      const makeAction = (input: {
        runId: string;
        recommendationId: string;
        state: string;
        attempts: number;
        key: number;
        actionType: string;
      }) =>
        prisma.specialistAgentAction.create({
          data: {
            businessId,
            runId: input.runId,
            recommendationId: input.recommendationId,
            agentKey: 'seo_autopilot',
            moduleId: '28',
            actionType: input.actionType,
            canonicalResourceType: 'customer_segment',
            canonicalResourceId: `qa-action-${input.key}`,
            expectedVersion: input.key,
            expectedPostcondition: { status: 'updated' },
            proposedPayload: { source: 'database-spec' },
            reason: 'Database fixture for real action lifecycle telemetry.',
            riskTier: 'low',
            requiredApproval: true,
            idempotencyKeyHash: String(input.key).padStart(64, '0'),
            correlationId: `qa-action-${input.key}`,
            executionAttemptCount: input.attempts,
            state: input.state,
            createdAt: now,
            updatedAt: now,
          },
        });
      const [verifiedAction, rejectedAction, failedVerificationAction] =
        await Promise.all([
          makeAction({
            runId: seoFast.id,
            recommendationId: proposedRecommendation.id,
            state: 'verified',
            attempts: 1,
            key: 1,
            actionType: 'segment_approval',
          }),
          makeAction({
            runId: seoMiddle.id,
            recommendationId: dismissedRecommendation.id,
            state: 'rejected',
            attempts: 0,
            key: 2,
            actionType: 'segment_approval',
          }),
          makeAction({
            runId: seoMiddle.id,
            recommendationId: dismissedRecommendation.id,
            state: 'verification_failed',
            attempts: 2,
            key: 3,
            actionType: 'segment_revision',
          }),
        ]);
      const revisionAction = await makeAction({
        runId: seoFast.id,
        recommendationId: proposedRecommendation.id,
        state: 'proposed',
        attempts: 0,
        key: 4,
        actionType: 'segment_draft',
      });
      const actionExecutionStartedAt = new Date(now.getTime() - 1000);
      const actionExecutionFinishedAt = new Date(now.getTime() - 400);
      await prisma.specialistAgentActionEvent.createMany({
        data: [
          {
            businessId,
            actionId: revisionAction.id,
            eventType: 'created',
            sequence: 1,
            toState: 'proposed',
            reason: 'Created proposal fixture.',
            createdAt: now,
          },
          {
            businessId,
            actionId: revisionAction.id,
            eventType: 'proposal_updated',
            sequence: 2,
            fromState: 'proposed',
            toState: 'proposed',
            reason: 'First proposal revision.',
            createdAt: now,
          },
          {
            businessId,
            actionId: revisionAction.id,
            eventType: 'proposal_updated',
            sequence: 3,
            fromState: 'proposed',
            toState: 'proposed',
            reason: 'Second proposal revision.',
            createdAt: now,
          },
          {
            businessId,
            actionId: verifiedAction.id,
            eventType: 'state_changed',
            sequence: 1,
            fromState: 'approval_required',
            toState: 'approved',
            reason: 'Approved in fixture.',
            createdAt: new Date(now.getTime() - 2500),
          },
          {
            businessId,
            actionId: verifiedAction.id,
            eventType: 'state_changed',
            sequence: 2,
            fromState: 'approved',
            toState: 'execution_queued',
            reason: 'Queued execution in fixture.',
            createdAt: new Date(now.getTime() - 1800),
          },
          {
            businessId,
            actionId: verifiedAction.id,
            eventType: 'state_changed',
            sequence: 3,
            fromState: 'execution_queued',
            toState: 'executing',
            reason: 'Started execution in fixture.',
            createdAt: actionExecutionStartedAt,
          },
          {
            businessId,
            actionId: verifiedAction.id,
            eventType: 'state_changed',
            sequence: 4,
            fromState: 'executing',
            toState: 'succeeded',
            reason: 'Finished execution in fixture.',
            createdAt: actionExecutionFinishedAt,
          },
          {
            businessId,
            actionId: verifiedAction.id,
            eventType: 'state_changed',
            sequence: 5,
            fromState: 'succeeded',
            toState: 'verification_pending',
            reason: 'Started verification in fixture.',
            createdAt: new Date(now.getTime() - 200),
          },
          {
            businessId,
            actionId: verifiedAction.id,
            eventType: 'state_changed',
            sequence: 6,
            fromState: 'verification_pending',
            toState: 'verified',
            reason: 'Verified in fixture.',
            createdAt: now,
          },
          {
            businessId,
            actionId: rejectedAction.id,
            eventType: 'state_changed',
            sequence: 1,
            fromState: 'approval_required',
            toState: 'rejected',
            reason: 'Rejected in fixture.',
            createdAt: now,
          },
          {
            businessId,
            actionId: failedVerificationAction.id,
            eventType: 'state_changed',
            sequence: 1,
            fromState: 'approval_required',
            toState: 'approved',
            reason: 'Approved in fixture.',
            createdAt: now,
          },
          {
            businessId,
            actionId: failedVerificationAction.id,
            eventType: 'state_changed',
            sequence: 2,
            fromState: 'verification_pending',
            toState: 'verification_failed',
            reason: 'Verification failed in fixture.',
            createdAt: now,
          },
        ],
      });
      const otherRecommendation =
        await prisma.specialistAgentRecommendation.findFirstOrThrow({
          where: {
            businessId: otherBusiness.id,
            title: 'Foreign tenant recommendation fixture',
          },
          select: { id: true, runId: true },
        });
      const otherAction = await prisma.specialistAgentAction.create({
        data: {
          businessId: otherBusiness.id,
          runId: otherRecommendation.runId,
          recommendationId: otherRecommendation.id,
          agentKey: 'seo_autopilot',
          moduleId: '28',
          actionType: 'foreign_qa_action',
          canonicalResourceType: 'customer_segment',
          canonicalResourceId: 'foreign-tenant-action',
          expectedPostcondition: { status: 'updated' },
          reason: 'Foreign tenant fixture should be excluded.',
          riskTier: 'low',
          requiredApproval: true,
          idempotencyKeyHash: 'f'.repeat(64),
          correlationId: 'foreign-tenant-action',
          executionAttemptCount: 9,
          state: 'failed',
          createdAt: now,
          updatedAt: now,
        },
      });
      await prisma.specialistAgentActionEvent.createMany({
        data: [
          {
            businessId: otherBusiness.id,
            actionId: otherAction.id,
            eventType: 'state_transition',
            sequence: 1,
            fromState: 'execution_queued',
            toState: 'executing',
            createdAt: new Date(now.getTime() - 9000),
          },
          {
            businessId: otherBusiness.id,
            actionId: otherAction.id,
            eventType: 'state_transition',
            sequence: 2,
            fromState: 'executing',
            toState: 'succeeded',
            createdAt: new Date(now.getTime() - 1000),
          },
        ],
      });

      await prisma.specialistAgentEvidence.createMany({
        data: [
          {
            businessId,
            runId: seoFast.id,
            recommendationId: proposedRecommendation.id,
            sourceType: 'seo_audit',
            resourceType: 'page',
            resourceId: 'qa-evidence-page',
            fieldRefs: ['titlePresent'],
            observedValues: { titlePresent: true },
            observedAt: new Date(now.getTime() - 1000),
            fetchedAt: now,
            freshness: 'fresh',
            calculation: 'Explicit DB fixture; no metric calculated.',
          },
          {
            businessId,
            runId: seoMiddle.id,
            recommendationId: dismissedRecommendation.id,
            sourceType: 'search_console',
            resourceType: 'keyword',
            resourceId: 'qa-evidence-keyword',
            fieldRefs: ['position'],
            observedValues: { position: 11 },
            observedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
            fetchedAt: new Date(now.getTime() - 60_000),
            freshness: 'stale',
            calculation: 'Explicit DB fixture; no metric calculated.',
          },
          {
            businessId: otherBusiness.id,
            runId: otherRecommendation.runId,
            recommendationId: otherRecommendation.id,
            sourceType: 'foreign_tenant_source',
            resourceType: 'page',
            resourceId: 'foreign-evidence-page',
            fieldRefs: ['secret'],
            observedValues: { secret: 'must not leak' },
            observedAt: now,
            fetchedAt: now,
            freshness: 'fresh',
            calculation: 'Foreign tenant fixture.',
          },
        ],
      });

      await prisma.aiCallLog.createMany({
        data: [
          {
            businessId,
            kind: 'seo_agent',
            inputTokens: 100,
            outputTokens: 10,
            estimatedCostUsd: 0.1,
            toolCalls: [{ tool: 'read_seo_workspace_queue', source: 'queue' }],
            specialistAgentRunId: seoFast.id,
            providerLatencyMs: 120,
            providerCallSucceeded: true,
            createdAt: now,
          },
          {
            businessId,
            kind: 'seo_agent',
            inputTokens: 20,
            outputTokens: 5,
            estimatedCostUsd: 0.03,
            toolCalls: [
              { tool: 'read_seo_workspace_queue', source: 'queue' },
              {
                tool: 'read_search_console_snapshot',
                source: 'search_console',
              },
            ],
            specialistAgentRunId: seoMiddle.id,
            providerLatencyMs: 800,
            providerCallSucceeded: true,
            createdAt: now,
          },
        ],
      });
      await prisma.aiCallLog.create({
        data: {
          businessId,
          kind: 'seo_agent',
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          specialistAgentRunId: seoMiddle.id,
          providerLatencyMs: 250,
          providerCallSucceeded: false,
          providerFailureCode: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
          createdAt: now,
        },
      });
      await prisma.aiCallLog.create({
        data: {
          businessId: otherBusiness.id,
          kind: 'seo_agent',
          inputTokens: 900,
          outputTokens: 90,
          estimatedCostUsd: 9,
          toolCalls: [
            { tool: 'foreign_tenant_tool', source: 'other_business' },
          ],
          providerLatencyMs: 9000,
          providerCallSucceeded: true,
          specialistAgentRunId: (
            await prisma.specialistAgentRun.findFirstOrThrow({
              where: {
                businessId: otherBusiness.id,
                agentKey: 'seo_autopilot',
              },
              select: { id: true },
            })
          ).id,
          createdAt: now,
        },
      });
      const thirtyOneDaysAgo = new Date(
        now.getTime() - 31 * 24 * 60 * 60 * 1000,
      );
      await prisma.commerceAgentToolRun.createMany({
        data: [
          {
            businessId,
            toolKey: 'get_order',
            riskClass: 'READ_ONLY',
            actorType: 'agent',
            autonomyLevel: 0,
            input: {},
            outcome: 'succeeded',
            correlationId: 'qa-commerce-tool-fast',
            durationMs: 100,
            createdAt: now,
          },
          {
            businessId,
            toolKey: 'get_order',
            riskClass: 'READ_ONLY',
            actorType: 'commerce_agent',
            autonomyLevel: 0,
            input: {},
            outcome: 'succeeded',
            correlationId: 'qa-commerce-tool-middle',
            durationMs: 300,
            createdAt: now,
          },
          {
            businessId,
            toolKey: 'get_order',
            riskClass: 'READ_ONLY',
            actorType: 'agent',
            autonomyLevel: 0,
            input: {},
            outcome: 'failed',
            correlationId: 'qa-commerce-tool-slow',
            durationMs: 900,
            createdAt: now,
          },
          {
            businessId,
            toolKey: 'get_order',
            riskClass: 'READ_ONLY',
            actorType: 'user',
            autonomyLevel: 0,
            input: {},
            outcome: 'succeeded',
            correlationId: 'qa-commerce-tool-user-only',
            durationMs: 5000,
            createdAt: now,
          },
          {
            businessId,
            toolKey: 'get_order',
            riskClass: 'READ_ONLY',
            actorType: 'agent',
            autonomyLevel: 0,
            input: {},
            outcome: 'succeeded',
            correlationId: 'qa-commerce-tool-outside-window',
            durationMs: 6000,
            createdAt: thirtyOneDaysAgo,
          },
          {
            businessId: otherBusiness.id,
            toolKey: 'get_order',
            riskClass: 'READ_ONLY',
            actorType: 'agent',
            autonomyLevel: 0,
            input: {},
            outcome: 'succeeded',
            correlationId: 'qa-commerce-tool-other-business',
            durationMs: 7000,
            createdAt: now,
          },
        ],
      });
      await prisma.specialistAgentAiRequest.createMany({
        data: [
          {
            businessId,
            runId: seoFast.id,
            agentKey: 'seo_autopilot',
            state: 'provider_completed',
            reservedCostUsd: 100,
            createdAt: now,
          },
          {
            businessId,
            runId: seoMiddle.id,
            agentKey: 'seo_autopilot',
            state: 'provider_failed',
            reservedCostUsd: 0.012,
            createdAt: now,
          },
          {
            businessId,
            agentKey: 'seo_autopilot',
            state: 'reserved',
            reservedCostUsd: 0.02,
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            agentKey: 'seo_autopilot',
            state: 'provider_failed',
            reservedCostUsd: 99,
            createdAt: now,
          },
        ],
      });
      await prisma.auditLog.createMany({
        data: [
          {
            businessId,
            actorUserId: 'qa-operations-owner',
            action: 'specialist_agent.orchestration_cross_tenant_access_denied',
            entity: 'SpecialistAgentRun',
            entityId: 'qa-audited-cross-tenant-probe',
            after: { operation: 'cancel', denied: true },
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            actorUserId: 'other-qa-owner',
            action: 'specialist_agent.orchestration_cross_tenant_access_denied',
            entity: 'SpecialistAgentRun',
            entityId: 'foreign-qa-audited-cross-tenant-probe',
            after: { operation: 'retry_failed', denied: true },
            createdAt: now,
          },
          {
            businessId,
            actorUserId: 'qa-operations-owner',
            action: 'commerce.agent_tool_call_blocked',
            entity: 'SpecialistAgentRun',
            entityId: 'qa-blocked-commerce-tool-call',
            after: {
              tool: 'unsupported_tool',
              reason: 'not_read_only_or_registered',
            },
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            actorUserId: 'other-qa-owner',
            action: 'commerce.agent_tool_call_blocked',
            entity: 'SpecialistAgentRun',
            entityId: 'foreign-qa-blocked-commerce-tool-call',
            after: {
              tool: 'unsupported_tool',
              reason: 'not_read_only_or_registered',
            },
            createdAt: now,
          },
          {
            businessId,
            actorUserId: 'qa-operations-owner',
            action: 'commerce.agent_tool_approval_refused',
            entity: 'CommerceAgentToolRun',
            entityId: 'qa-refused-commerce-approval',
            after: { reason: 'current policy no longer permits this action' },
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            actorUserId: 'other-qa-owner',
            action: 'commerce.agent_tool_approval_refused',
            entity: 'CommerceAgentToolRun',
            entityId: 'foreign-qa-refused-commerce-approval',
            after: { reason: 'current policy no longer permits this action' },
            createdAt: now,
          },
          {
            businessId,
            actorUserId: 'qa-operations-owner',
            action: 'customer_agent.message_draft_queue_refused',
            entity: 'MessageDraft',
            entityId: 'qa-customer-message-queue-refused',
            after: {
              reasonCode: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED',
              messageCreated: false,
              providerDeliveryConfirmed: false,
            },
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            actorUserId: 'other-qa-owner',
            action: 'customer_agent.message_draft_queue_refused',
            entity: 'MessageDraft',
            entityId: 'foreign-customer-message-queue-refused',
            after: {
              reasonCode: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED',
              messageCreated: false,
              providerDeliveryConfirmed: false,
            },
            createdAt: now,
          },
          {
            businessId,
            action: 'agent.budget.limit_reached',
            entity: 'SpecialistAgentBudget',
            entityId:
              'seo_autopilot:SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED:2026-11',
            after: {
              event_id: 'qa-budget-limit-event',
              event_name: 'agent.budget.limit_reached',
              source_module: '28',
              entity_id: 'qa-budget-limited-run',
              entity_version: '3',
              schema_version: 1,
              correlation_id: 'qa-budget-limited-run',
              agent_key: 'seo_autopilot',
              limit_code: 'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
              sensitivePrompt: 'must not be returned',
            },
            createdAt: now,
          },
          {
            businessId: otherBusiness.id,
            action: 'agent.budget.limit_reached',
            entity: 'SpecialistAgentBudget',
            entityId:
              'seo_autopilot:SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED:2026-11',
            after: {
              event_id: 'foreign-budget-limit-event',
              event_name: 'agent.budget.limit_reached',
              source_module: '28',
              entity_id: 'foreign-budget-limited-run',
              schema_version: 1,
              correlation_id: 'foreign-budget-limited-run',
              agent_key: 'seo_autopilot',
              limit_code: 'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
            },
            createdAt: now,
          },
        ],
      });

      const operations = await service.getSpecialistOperations(businessId);
      const actionAudit = await service.getSpecialistActionAudit(businessId);
      const seo = operations.agents.find(
        (agent) => agent.agentKey === 'seo_autopilot',
      );
      const inventory = operations.agents.find(
        (agent) => agent.agentKey === 'inventory_intelligence',
      );
      const commerce = operations.agents.find(
        (agent) => agent.agentKey === 'autonomous_commerce',
      );

      expect(operations.scope).toBe('current_business');
      expect(operations.windowDays).toBe(30);
      expect(operations.agents).toHaveLength(5);
      expect(commerce?.toolExecutionByKey).toEqual([
        {
          toolKey: 'get_order',
          p50Ms: 300,
          p95Ms: 900,
          sampleCount: 3,
          sampleLimit: 5000,
        },
      ]);
      expect(operations.orchestrationQueueWait).toMatchObject({
        p50Ms: 500,
        p95Ms: 2000,
        sampleCount: 2,
        sampleLimit: 5000,
        waitingCount: 1,
      });
      const oldestWaitingAgeMs =
        operations.orchestrationQueueWait.oldestWaitingAgeMs;
      expect(oldestWaitingAgeMs).toBeGreaterThanOrEqual(30_000);
      expect(oldestWaitingAgeMs).toBeLessThan(40_000);
      expect(operations.securityEvents).toEqual({
        auditedCrossTenantRunProbeDenials: 1,
        auditedCommerceToolCallBlocks: 1,
        persistedToolCallRefusals: 3,
        auditedCommerceApprovalRefusals: 1,
        auditedCustomerMessageQueueRefusals: 1,
      });
      expect(operations.securityDenials).toHaveLength(7);
      expect(operations.securityDenials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'audit_log',
            event: 'specialist_agent.orchestration_cross_tenant_access_denied',
            targetId: 'qa-audited-cross-tenant-probe',
            actorUserId: 'qa-operations-owner',
          }),
          expect.objectContaining({
            source: 'tool_call',
            event: 'blocked',
            agentKey: 'seo_autopilot',
            toolKey: 'registered_read_example',
            status: 'blocked',
            errorCode: 'TOOL_POLICY_BLOCKED',
          }),
        ]),
      );
      expect(JSON.stringify(operations.securityDenials)).not.toContain(
        'foreign-qa-',
      );
      expect(JSON.stringify(operations.securityDenials)).not.toContain('after');
      expect(operations.budgetLimitEvents).toHaveLength(1);
      expect(typeof operations.budgetLimitEvents[0]?.id).toBe('string');
      expect(operations.budgetLimitEvents[0]).toMatchObject({
        agentKey: 'seo_autopilot',
        event: 'agent.budget.limit_reached',
        occurredAt: now.toISOString(),
        targetId: 'qa-budget-limited-run',
        limitCode: 'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
      });
      expect(JSON.stringify(operations.budgetLimitEvents)).not.toContain(
        'sensitivePrompt',
      );
      expect(JSON.stringify(operations.budgetLimitEvents)).not.toContain(
        'foreign-budget',
      );
      expect(operations.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'cross_tenant_probe_denied',
            agentKey: 'security',
            severity: 'critical',
            observedValue: 1,
          }),
          expect.objectContaining({
            code: 'repeated_specialist_tool_denials',
            agentKey: 'security',
            severity: 'warning',
            observedValue: 3,
            thresholdValue: 3,
          }),
        ]),
      );
      expect(actionAudit.scope).toBe('current_business');
      expect(actionAudit.actions).toHaveLength(4);
      expect(actionAudit.actions.map((action) => action.id)).not.toContain(
        otherAction.id,
      );
      const verifiedAudit = actionAudit.actions.find(
        (action) => action.id === verifiedAction.id,
      );
      expect(verifiedAudit).toMatchObject({
        runId: seoFast.id,
        agentKey: 'seo_autopilot',
        actionType: 'segment_approval',
        canonicalResourceType: 'customer_segment',
        canonicalResourceId: 'qa-action-1',
        expectedVersion: 1,
        state: 'verified',
        requiredApproval: true,
      });
      expect(verifiedAudit?.events.map((event) => event.toState)).toEqual([
        'approved',
        'execution_queued',
        'executing',
        'succeeded',
        'verification_pending',
        'verified',
      ]);
      expect(verifiedAudit?.events[0]).toMatchObject({
        eventType: 'state_changed',
        fromState: 'approval_required',
        toState: 'approved',
        reason: 'Approved in fixture.',
      });
      expect(verifiedAudit).not.toHaveProperty('proposedPayload');
      expect(verifiedAudit).not.toHaveProperty('actualResult');
      expect(verifiedAudit).not.toHaveProperty('verificationResult');
      expect(seo).toMatchObject({
        moduleId: '28',
        totalRuns: 3,
        uniqueOperators: 2,
        totalRecommendations: 2,
        statusCounts: { completed: 2, failed: 1 },
        recommendationStatusCounts: { proposed: 1, dismissed: 1 },
        actionStateCounts: { verified: 1, rejected: 1, verification_failed: 1 },
        openActionAttention: { count: 1 },
        actionTypes: [
          {
            actionType: 'segment_approval',
            count: 2,
            stateCounts: { verified: 1, rejected: 1 },
            executionAttempts: 1,
            executionLatency: {
              p50Ms:
                actionExecutionFinishedAt.getTime() -
                actionExecutionStartedAt.getTime(),
              p95Ms:
                actionExecutionFinishedAt.getTime() -
                actionExecutionStartedAt.getTime(),
              sampleCount: 1,
              sampleLimit: 5000,
            },
          },
          {
            actionType: 'segment_draft',
            count: 1,
            stateCounts: { proposed: 1 },
            executionAttempts: 0,
          },
          {
            actionType: 'segment_revision',
            count: 1,
            stateCounts: { verification_failed: 1 },
            executionAttempts: 2,
          },
        ],
        actionExecutionAttempts: 3,
        proposalRevisionCount: 2,
        approvalDecisions: {
          approved: 2,
          rejected: 1,
          decisionEvents: 3,
          rejectedSharePercent: 33.3,
        },
        verificationOutcomes: {
          verified: 1,
          failed: 1,
          verificationEvents: 2,
          failedSharePercent: 50,
        },
        recordedToolCounts: {
          read_seo_workspace_queue: 2,
          read_search_console_snapshot: 1,
        },
        persistedToolCalls: {
          total: 5,
          statusCounts: { blocked: 3, failed: 1, succeeded: 1 },
        },
        registeredToolExecutionByKey: [
          {
            toolKey: 'registered_read_example',
            p50Ms: 17,
            p95Ms: 37,
            sampleCount: 2,
            sampleLimit: 5000,
          },
        ],
        triggerCounts: { manual: 1, event: 1, scheduled: 1 },
        failuresByCode: [{ code: 'SEO_TEST_ERROR', count: 1 }],
        aiUsage: {
          calls: 3,
          inputTokens: 120,
          outputTokens: 15,
          estimatedCostUsd: 0.13,
        },
        monthlyBudget: {
          requestsUsed: 3,
          requestLimit: 4,
          estimatedSpendUsd: 0.032195,
          spendLimitUsd: 0.04,
          reservedSpendUsd: 0.032,
        },
      });
      expect(seo?.evidence).toEqual({
        sampledRecords: 2,
        freshnessCounts: { fresh: 1, stale: 1 },
        sourceTypeCounts: { seo_audit: 1, search_console: 1 },
        latestFetchedAt: now.toISOString(),
        latestFetchObservedAt: new Date(now.getTime() - 1000).toISOString(),
        sampleLimit: 5000,
      });
      expect(seo?.finishedRunLatency).toMatchObject({
        p50Ms: 2000,
        p95Ms: 3000,
        sampleCount: 3,
        sampleLimit: 5000,
      });
      expect(seo?.providerLatency).toEqual({
        p50Ms: 120,
        p95Ms: 800,
        sampleCount: 2,
        sampleLimit: 5000,
      });
      expect(seo?.providerFailureLatency).toEqual({
        p50Ms: 250,
        p95Ms: 250,
        sampleCount: 1,
        sampleLimit: 5000,
      });
      expect(seo?.providerFailureCalls).toBe(1);
      expect(seo?.providerFailureCodes).toEqual([
        { code: 'AI_PROVIDER_INSUFFICIENT_CREDIT', count: 1 },
      ]);
      expect(operations.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'failed_runs',
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'runs',
          }),
          expect.objectContaining({
            code: 'provider_failures',
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'calls',
          }),
          expect.objectContaining({
            code: 'verification_failures',
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'events',
          }),
          expect.objectContaining({
            code: 'stale_or_missing_evidence',
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'records',
          }),
          expect.objectContaining({
            code: 'open_actions_awaiting_attention',
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'records',
          }),
          expect.objectContaining({
            code: 'monthly_request_budget',
            agentKey: 'seo_autopilot',
            severity: 'warning',
            observedValue: 3,
            thresholdValue: 4,
            unit: 'requests',
          }),
          expect.objectContaining({
            code: 'monthly_estimated_spend_budget',
            agentKey: 'seo_autopilot',
            severity: 'warning',
            observedValue: 0.032195,
            thresholdValue: 0.04,
            unit: 'USD',
          }),
        ]),
      );
      expect(
        operations.alerts.find(
          (alert) => alert.code === 'open_actions_awaiting_attention',
        )?.message,
      ).toContain('oldest last updated');
      expect(seo?.actionExecutionLatency).toEqual({
        p50Ms:
          actionExecutionFinishedAt.getTime() -
          actionExecutionStartedAt.getTime(),
        p95Ms:
          actionExecutionFinishedAt.getTime() -
          actionExecutionStartedAt.getTime(),
        sampleCount: 1,
        sampleLimit: 5000,
      });
      expect(
        seo?.openActionAttention.oldestUpdatedAgeMs,
      ).toBeGreaterThanOrEqual(0);
      expect(seo?.openActionAttention.oldestUpdatedAgeMs).toBeLessThan(120_000);
      expect(inventory).toMatchObject({
        totalRuns: 2,
        uniqueOperators: 0,
        statusCounts: { running: 1, cancel_requested: 1 },
        openActionAttention: { count: 0, oldestUpdatedAgeMs: null },
        activeRuns: { count: 2 },
        finishedRunLatency: {
          p50Ms: null,
          p95Ms: null,
          sampleCount: 0,
        },
        providerLatency: {
          p50Ms: null,
          p95Ms: null,
          sampleCount: 0,
        },
        providerFailureLatency: {
          p50Ms: null,
          p95Ms: null,
          sampleCount: 0,
        },
        providerFailureCalls: 0,
        providerFailureCodes: [],
        evidence: {
          sampledRecords: 0,
          freshnessCounts: {},
          sourceTypeCounts: {},
          latestFetchedAt: null,
          latestFetchObservedAt: null,
          sampleLimit: 5000,
        },
        aiUsage: {
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
        monthlyBudget: {
          requestsUsed: 0,
          requestLimit: null,
          estimatedSpendUsd: 0,
          spendLimitUsd: null,
          reservedSpendUsd: 0,
        },
      });
      expect(inventory?.activeRuns.oldestAgeMs).toBeGreaterThanOrEqual(60_000);
      expect(inventory?.activeRuns.oldestAgeMs).toBeLessThan(120_000);
      expect(operations.disclosures).toContain(
        'AI cost is the application estimate saved with each AI call, not a provider invoice.',
      );
      expect(operations.disclosures).toContain(
        'Monthly request and spend usage uses the current UTC month. Requests include reserved, failed and abandoned provider attempts; spend is a Haiku 4.5 application estimate from returned tokens plus the maximum reserved amount for pending or failed attempts, not a provider invoice.',
      );
      expect(operations.disclosures).toContain(
        'Cross-agent queue pickup is measured from the saved parent review row to its first persisted worker pickup, for up to the 5,000 most recent rows in this 30-day window. It is not a queue-depth monitor or an uptime target; waiting count and oldest age cover parent rows not yet picked up.',
      );
      expect(operations.disclosures).toContain(
        'Security counters include only audited denied cross-tenant run probes, Commerce unregistered/over-limit tool attempts, Commerce approval refusals after policy recheck, and Customer Agent message-queue refusals. They are not comprehensive security-event monitoring; other permission, stale-data, prompt-injection and policy blocks are not counted here.',
      );
      expect(operations.disclosures).toContain(
        'Operational alerts are deterministic signals over saved specialist runs, AI call logs, action verification events, open material actions, sampled evidence freshness and configured monthly AI request/spend limits. Budget bands are 70% and 90%; spend is an application estimate, not an invoice. This does not detect unusual cost spikes, external provider outages, or conditions outside the sampled 30-day evidence window.',
      );
      await prisma.business.update({
        where: { id: businessId },
        data: {
          policies: {
            'agents.seoMaxRequestsPerMonth': 3,
            'agents.seoMaxSpendUsdPerMonth': 0.03,
          },
        },
      });
      const criticalBudgetOperations =
        await service.getSpecialistOperations(businessId);
      expect(criticalBudgetOperations.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'monthly_request_budget',
            severity: 'critical',
            observedValue: 3,
            thresholdValue: 3,
          }),
          expect.objectContaining({
            code: 'monthly_estimated_spend_budget',
            severity: 'critical',
            observedValue: 0.032195,
            thresholdValue: 0.03,
          }),
        ]),
      );
      const criticalAlertIndex = criticalBudgetOperations.alerts.findIndex(
        (alert) => alert.severity === 'critical',
      );
      const warningAlertIndex = criticalBudgetOperations.alerts.findIndex(
        (alert) => alert.severity === 'warning',
      );
      expect(criticalAlertIndex).toBeGreaterThanOrEqual(0);
      expect(criticalAlertIndex).toBeLessThan(warningAlertIndex);
      const otherBusinessOperations = await service.getSpecialistOperations(
        otherBusiness.id,
      );
      expect(otherBusinessOperations.alerts.map((alert) => alert.code)).toEqual(
        [
          'cross_tenant_probe_denied',
          'failed_runs',
          'open_actions_awaiting_attention',
        ],
      );
      expect(otherBusinessOperations.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'cross_tenant_probe_denied',
            agentKey: 'security',
            severity: 'critical',
            observedValue: 1,
          }),
          expect.objectContaining({
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'runs',
          }),
          expect.objectContaining({
            agentKey: 'seo_autopilot',
            observedValue: 1,
            unit: 'records',
            code: 'open_actions_awaiting_attention',
          }),
        ]),
      );
      expect(JSON.stringify(operations)).not.toContain('OTHER_TENANT_ERROR');
    } finally {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: otherBusiness.id },
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: otherBusiness.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
  });
});
