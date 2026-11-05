import { Prisma, Role } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { PoliciesService } from '../common/policies/policies.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SegmentsService } from './segments.service';
import { CustomerSegmentDraftsService } from './customer-segment-drafts.service';
import { ActionCenterService } from '../dashboard/action-center.service';
import { StockTransfersService } from '../branches/stock-transfers.service';
import { ProcurementService } from '../procurement/procurement.service';
import { segmentApprovalState } from './segment-approval.util';

class FakeCls {
  data: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.data[key] as T;
  }
  set(key: string, value: unknown) {
    this.data[key] = value;
  }
}

describe('Customer segment recommendation drafts (MySQL)', () => {
  const cls = new FakeCls();
  let prisma: PrismaService;
  let drafts: CustomerSegmentDraftsService;
  let segments: SegmentsService;
  let actions: ActionCenterService;
  let businessId: string;
  let foreignBusinessId: string;
  let userId: string;
  const rules = {
    combinator: 'AND' as const,
    conditions: [
      { field: 'visitCount' as const, operator: 'gt' as const, value: 1 },
    ],
  };
  async function source(business = businessId, scope = 'current_business') {
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: business,
        agentKey: 'customer_intelligence',
        agentVersion: '1.0.0',
        moduleId: '7',
        status: 'completed',
        inputRefs: [{ scope }],
      },
    });
    return prisma.specialistAgentRecommendation.create({
      data: {
        businessId: business,
        runId: run.id,
        agentKey: 'customer_intelligence',
        title: 'Repeat visitor draft',
        summary: 'Review a deterministic rule only.',
        classification: 'recommendation',
        confidenceMethod: 'not_available',
        riskTier: 'low',
        details: {
          proposedSegment: {
            name: 'Repeat visitors',
            rules,
            matchedCount: scope === 'current_business' ? 5 : null,
            state: 'draft_only',
          },
        },
      },
    });
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = Date.now();
    businessId = (
      await prisma.business.create({
        data: { name: 'QA Segment Draft', slug: `qa-segment-draft-${stamp}` },
      })
    ).id;
    foreignBusinessId = (
      await prisma.business.create({
        data: {
          name: 'QA Foreign Segment Draft',
          slug: `qa-segment-draft-foreign-${stamp}`,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'QA Draft Manager',
          email: `qa-draft-manager-${stamp}@example.test`,
          passwordHash: 'unused-test-password',
        },
      })
    ).id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: Role.manager },
    });
    await prisma.customer.createMany({
      data: [
        {
          businessId,
          name: 'PRIVATE ELIGIBLE',
          phone: '+15559000001',
          email: 'private-segment@example.test',
          visitCount: 3,
          consentMarketing: true,
        },
        {
          businessId,
          name: 'PRIVATE OPTOUT',
          phone: '+15559000002',
          visitCount: 3,
          consentMarketing: true,
          optedOut: true,
        },
        {
          businessId,
          name: 'PRIVATE NO CONSENT',
          phone: '+15559000003',
          visitCount: 3,
          consentMarketing: false,
        },
        {
          businessId,
          name: 'PRIVATE INACTIVE',
          phone: '+15559000004',
          visitCount: 3,
          status: 'inactive',
          consentMarketing: true,
        },
        {
          businessId,
          name: 'Erased Customer',
          phone: 'erased-draft-fixture',
          visitCount: 3,
          consentMarketing: false,
        },
        {
          businessId,
          name: 'PRIVATE NO VISITS',
          phone: '+15559000005',
          visitCount: 0,
          consentMarketing: true,
        },
        {
          businessId: foreignBusinessId,
          name: 'FOREIGN PRIVATE',
          phone: '+15559000006',
          visitCount: 99,
        },
      ],
    });
    const scoped = cls as unknown as ClsService;
    const tenant = new TenantPrismaService(prisma, scoped);
    const policies = new PoliciesService(
      prisma,
      scoped,
      new CapabilitiesService(prisma),
    );
    segments = new SegmentsService(tenant, {} as AiInfraService);
    actions = new ActionCenterService(
      tenant,
      new ProcurementService(tenant, policies),
      new StockTransfersService(prisma),
    );
    drafts = new CustomerSegmentDraftsService(
      tenant,
      policies,
      new SpecialistAgentPolicyService(prisma, scoped),
      segments,
    );
  });
  beforeEach(async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_ROLE, Role.manager);
    cls.set(CLS_KEY_USER_ID, userId);
    await prisma.roleCapabilityOverride.deleteMany({ where: { businessId } });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {}, disabledModules: [] },
    });
  });
  afterAll(async () => {
    const where = { businessId: { in: [businessId, foreignBusinessId] } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.segment.deleteMany({ where });
    await prisma.specialistAgentRun.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.roleCapabilityOverride.deleteMany({ where });
    await prisma.businessUser.deleteMany({ where });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, foreignBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('prepares one versioned draft under retries, shows disjoint consent exclusions and never creates a targetable Segment or message', async () => {
    const row = await source();
    const [a, b] = await Promise.all([
      drafts.prepare(userId, row.id),
      drafts.prepare(userId, row.id),
    ]);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({
      state: 'draft',
      actionHistory: [
        {
          actionType: 'customer_segment_draft_v1',
          state: 'proposed',
          expectedVersion: 1,
          events: [{ eventType: 'created', toState: 'proposed' }],
        },
      ],
      current: { version: 1, rules, countsAtSave: { matched: 4 } },
      counts: {
        matched: 4,
        inactive: 1,
        optedOut: 1,
        noConsent: 1,
        flagsPass: 1,
        sendAuthorized: false,
      },
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: row.id,
          action: 'customer_agent.segment_draft_prepared',
        },
      }),
    ).toBe(1);
    const payload = JSON.stringify(a);
    for (const secret of [
      'PRIVATE ELIGIBLE',
      '+15559000001',
      'private-segment@',
      'FOREIGN PRIVATE',
    ])
      expect(payload).not.toContain(secret);
    expect(await prisma.segment.count({ where: { businessId } })).toBe(0);
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(await prisma.campaign.count({ where: { businessId } })).toBe(0);
  });

  it('appends an immutable normalized revision, recalculates counts and refuses stale edits', async () => {
    const row = await source();
    const first = await drafts.prepare(userId, row.id);
    const second = await drafts.update(userId, row.id, {
      expectedVersion: 1,
      name: 'Consent-aware repeat visits',
      reason: 'Exclude opted out profiles in rule preview',
      rules: {
        combinator: 'AND',
        conditions: [
          ...rules.conditions,
          { field: 'optedOut', operator: 'eq', value: 'false' },
        ],
      },
    });
    expect(second.current.version).toBe(2);
    expect(second.current.rules.conditions[1].value).toBe(false);
    expect(second.counts).toMatchObject({
      matched: 3,
      optedOut: 0,
      noConsent: 1,
      flagsPass: 1,
    });
    expect(second.versions[0]).toEqual(first.versions[0]);
    expect(second.current.payloadHash).not.toBe(first.current.payloadHash);
    expect(second.actionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: 'customer_segment_draft_v1',
          state: 'cancelled',
        }),
        expect.objectContaining({
          actionType: 'customer_segment_draft_v2',
          state: 'proposed',
        }),
      ]),
    );
    await expect(
      drafts.update(userId, row.id, {
        expectedVersion: 1,
        name: 'Stale editor',
        rules,
        reason: 'Old version',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_CONFLICT' },
    });
  });

  it('accepts only one concurrent edit of the same revision', async () => {
    const row = await source();
    await drafts.prepare(userId, row.id);
    const outcomes = await Promise.allSettled(
      ['A', 'B'].map((name) =>
        drafts.update(userId, row.id, {
          expectedVersion: 1,
          name,
          rules,
          reason: 'Concurrent QA edit',
        }),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await drafts.get(row.id)).versions).toHaveLength(2);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: row.id,
          action: 'customer_agent.segment_draft_revised',
        },
      }),
    ).toBe(1);
  });

  it('rejects unsupported personal/financial rules, invalid values and blank reasons before changing the draft', async () => {
    const row = await source();
    await drafts.prepare(userId, row.id);
    for (const condition of [
      { field: 'lifetimeSpend', operator: 'gt', value: 1 },
      { field: 'email', operator: 'contains', value: 'private' },
      { field: 'tags', operator: 'contains', value: 'inferred health' },
      { field: 'visitCount', operator: 'contains', value: '5' },
      { field: 'visitCount', operator: 'gt', value: '' },
      { field: 'lastVisitAt', operator: 'lt', value: '2026-02-31' },
      { field: 'optedOut', operator: 'eq', value: 'anything' },
    ])
      await expect(
        drafts.update(userId, row.id, {
          expectedVersion: 1,
          name: 'Invalid draft',
          reason: 'Invalid QA',
          rules: { combinator: 'AND', conditions: [condition] },
        } as Parameters<typeof drafts.update>[2]),
      ).rejects.toMatchObject({
        response: { code: 'CUSTOMER_SEGMENT_DRAFT_INVALID' },
      });
    await expect(
      drafts.update(userId, row.id, {
        expectedVersion: 1,
        name: 'Blank reason',
        rules,
        reason: ' ',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_INVALID' },
    });
    expect((await drafts.get(row.id)).current.version).toBe(1);
  });

  it('refreshes membership counts without storing member identities or treating flags as send permission', async () => {
    const row = await source();
    const initial = await drafts.prepare(userId, row.id);
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'NEW PRIVATE MEMBER',
        phone: '+15559000008',
        visitCount: 2,
        consentMarketing: false,
      },
    });
    try {
      const fresh = await drafts.get(row.id);
      expect(fresh.counts.matched).toBe(initial.counts.matched + 1);
      expect(fresh.current.countsAtSave?.matched).toBe(initial.counts.matched);
      expect(fresh.counts.sendAuthorized).toBe(false);
      expect(JSON.stringify(fresh)).not.toContain(customer.id);
    } finally {
      await prisma.customer.delete({ where: { id: customer.id } });
    }
  });

  it('blocks disabled/revoked/foreign writes and unsupported branch aggregates', async () => {
    const row = await source();
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.customerEnabled': false } },
    });
    await expect(drafts.prepare(userId, row.id)).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_DISABLED' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {}, disabledModules: ['customers'] },
    });
    await expect(drafts.prepare(userId, row.id)).rejects.toMatchObject({
      response: { code: 'BUSINESS_MODULE_DISABLED' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: [] },
    });
    const branch = await source(businessId, 'selected_branch');
    await expect(drafts.prepare(userId, branch.id)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_INVALID' },
    });
    const foreign = await source(foreignBusinessId);
    await expect(drafts.prepare(userId, foreign.id)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_NOT_FOUND' },
    });
    await prisma.roleCapabilityOverride.create({
      data: {
        businessId,
        role: Role.manager,
        capabilities: [CAPABILITIES.CUSTOMER_AGENT_RUN],
      },
    });
    await expect(drafts.prepare(userId, row.id)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_FORBIDDEN' },
    });
  });

  it('expires with the original recommendation and allows reasoned rejection after kill switch or expiry', async () => {
    const old = await source();
    await prisma.specialistAgentRecommendation.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 2 * 86_400_000) },
    });
    await expect(drafts.prepare(userId, old.id)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_EXPIRED' },
    });
    const row = await source();
    await drafts.prepare(userId, row.id);
    const saved = await prisma.specialistAgentRecommendation.findUniqueOrThrow({
      where: { id: row.id },
    });
    const details = saved.details as Prisma.JsonObject;
    await prisma.specialistAgentRecommendation.update({
      where: { id: row.id },
      data: {
        details: {
          ...details,
          segmentReview: {
            ...(details.segmentReview as Prisma.JsonObject),
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      },
    });
    await expect(
      drafts.update(userId, row.id, {
        expectedVersion: 1,
        name: 'Late draft',
        rules,
        reason: 'Too late',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_EXPIRED' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.customerEnabled': false } },
    });
    await expect(
      drafts.reject(userId, row.id, { expectedVersion: 1, reason: ' ' }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_INVALID' },
    });
    const rejected = await drafts.reject(userId, row.id, {
      expectedVersion: 1,
      reason: 'Expired; fresh review required',
    });
    expect(rejected).toMatchObject({
      state: 'rejected',
      expired: true,
      rejectionReason: 'Expired; fresh review required',
    });
    expect(rejected.actionHistory[0]).toMatchObject({
      state: 'rejected',
      rejectionReason: 'Expired; fresh review required',
    });
  });
  function preview(
    draft: Awaited<ReturnType<CustomerSegmentDraftsService['get']>>,
  ) {
    return {
      expectedVersion: draft.current.version,
      expectedPayloadHash: draft.current.payloadHash,
      expectedCountsHash: draft.countsHash,
    };
  }
  async function submitted() {
    const row = await source();
    const prepared = await drafts.prepare(userId, row.id);
    return drafts.submit(userId, row.id, preview(prepared));
  }

  it('reconciles a saved legacy draft before submit and keeps it approvable', async () => {
    const row = await source();
    const prepared = await drafts.prepare(userId, row.id);
    const oldActions = await prisma.specialistAgentAction.findMany({
      where: { businessId, recommendationId: row.id },
      select: { id: true },
    });
    await prisma.specialistAgentActionEvent.deleteMany({
      where: { actionId: { in: oldActions.map((action) => action.id) } },
    });
    await prisma.specialistAgentAction.deleteMany({
      where: { id: { in: oldActions.map((action) => action.id) } },
    });

    const pending = await drafts.submit(userId, row.id, preview(prepared));
    expect(pending.state).toBe('submitted');
    expect(pending.actionHistoryComplete).toBe(true);
    expect(pending.actionHistory[0]?.state).toBe('approval_required');
    const legacyEvents = pending.actionHistory[0]?.events ?? [];
    expect(legacyEvents.map((event) => event.eventType)).toContain(
      'legacy_state_reconciled',
    );
    expect(legacyEvents.map((event) => event.toState)).toContain('proposed');
    expect(legacyEvents.map((event) => event.toState)).toContain(
      'approval_required',
    );
    const approved = await drafts.approve(userId, row.id, preview(pending));
    expect(approved.state).toBe('applied');
    expect(approved.verification).toBe('verified');
    expect(approved.actionHistoryComplete).toBe(true);
    expect(approved.actionHistory[0]?.state).toBe('verified');
  });

  it('submits an exact preview to Action Center and applies it once under concurrent approval retries', async () => {
    const draft = await submitted();
    expect(draft.state).toBe('submitted');
    expect(draft.actionHistory[0]?.state).toBe('approval_required');
    expect(
      draft.actionHistory[0]?.events.map((event) => event.toState),
    ).toContain('approval_required');
    const inbox = await actions.list(businessId, Role.manager, null, {
      type: 'customer_segment',
    });
    expect(inbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `customer_segment:${draft.id}`,
          deepLink: `/customers/segments#segment-draft-${draft.id}`,
        }),
      ]),
    );
    for (const operation of ['complete', 'dismiss'] as const)
      await expect(
        actions[operation](businessId, `customer_segment:${draft.id}`),
      ).rejects.toMatchObject({
        response: { code: 'CUSTOMER_SEGMENT_ACTION_REQUIRES_DECISION' },
      });
    await expect(
      actions.snooze(businessId, `customer_segment:${draft.id}`, {
        duration: '1h',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_ACTION_REQUIRES_DECISION' },
    });
    const input = preview(draft);
    const [a, b] = await Promise.all([
      drafts.approve(userId, draft.id, input),
      drafts.approve(userId, draft.id, input),
    ]);
    expect(a.canonicalSegment?.id).toBe(b.canonicalSegment?.id);
    expect(a).toMatchObject({
      state: 'applied',
      verification: 'verified',
      canonicalSegment: { version: 1, approvalState: 'approved' },
      approvals: [{ version: 1, by: userId }],
      actionHistory: [
        {
          state: 'verified',
          executionAttemptCount: 1,
          canonicalOperationId: a.canonicalSegment?.id,
          actualResult: {
            segmentId: a.canonicalSegment?.id,
            segmentVersion: 1,
          },
          verificationResult: {
            status: 'verified',
            approvalState: 'approved',
            definitionMatches: true,
          },
        },
      ],
    });
    const eventStates = a.actionHistory[0]?.events.map((event) => event.toState);
    expect(eventStates).toEqual(
      expect.arrayContaining([
        'approved',
        'execution_queued',
        'executing',
        'succeeded',
        'verification_pending',
        'verified',
      ]),
    );
    expect(
      await prisma.segment.count({
        where: { businessId, sourceAgentRecommendationId: draft.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: a.canonicalSegment!.id,
          action: 'customer_agent.segment_approved_applied',
        },
      }),
    ).toBe(1);
    expect(
      (
        await actions.list(businessId, Role.manager, null, {
          type: 'customer_segment',
        })
      ).items.some((item) => item.id === `customer_segment:${draft.id}`),
    ).toBe(false);
    expect((await segments.getSegment(a.canonicalSegment!.id)).count).toBe(
      draft.counts.matched,
    );
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(await prisma.campaign.count({ where: { businessId } })).toBe(0);
  });

  it('refuses unsubmitted approval, stale hashes, changed counts and submitted edits; reasoned withdrawal permits resubmission', async () => {
    const row = await source();
    const prepared = await drafts.prepare(userId, row.id);
    await expect(
      drafts.approve(userId, row.id, preview(prepared)),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_CONFLICT' },
    });
    await expect(
      drafts.submit(userId, row.id, {
        ...preview(prepared),
        expectedPayloadHash: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_CONFLICT' },
    });
    const pending = await drafts.submit(userId, row.id, preview(prepared));
    await expect(
      drafts.update(userId, row.id, {
        expectedVersion: 1,
        name: 'Pending edit forbidden',
        rules,
        reason: 'Cannot silently change submitted payload',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_CONFLICT' },
    });
    const extra = await prisma.customer.create({
      data: {
        businessId,
        name: 'QA New matching member',
        phone: '+15559000991',
        visitCount: 2,
      },
    });
    try {
      await expect(
        drafts.approve(userId, row.id, preview(pending)),
      ).rejects.toMatchObject({
        response: { code: 'CUSTOMER_SEGMENT_AUDIENCE_CHANGED' },
      });
      await expect(
        drafts.withdraw(userId, row.id, { expectedVersion: 1, reason: ' ' }),
      ).rejects.toMatchObject({
        response: { code: 'CUSTOMER_SEGMENT_DRAFT_INVALID' },
      });
      const withdrawn = await drafts.withdraw(userId, row.id, {
        expectedVersion: 1,
        reason: 'Review live consent exclusions again',
      });
      expect(withdrawn.actionHistory[0]?.state).toBe('proposed');
      expect(
        withdrawn.actionHistory[0]?.events.map((event) => event.eventType),
      ).toContain('approval_withdrawn');
      const resubmitted = await drafts.submit(
        userId,
        row.id,
        preview(withdrawn),
      );
      expect(
        (await drafts.approve(userId, row.id, preview(resubmitted)))
          .verification,
      ).toBe('verified');
    } finally {
      await prisma.customer.delete({ where: { id: extra.id } });
    }
  });

  it('invalidates audience resolution after canonical edits and reapproves a fresh version on the same Segment', async () => {
    const draft = await submitted();
    const applied = await drafts.approve(userId, draft.id, preview(draft));
    const id = applied.canonicalSegment!.id;
    await segments.update(
      id,
      {
        name: 'QA canonical editor changed rules',
        rules: {
          combinator: 'AND',
          conditions: [{ field: 'visitCount', operator: 'gt', value: 0 }],
        },
      },
      userId,
    );
    const changed = await drafts.get(draft.id);
    expect(changed.verification).toBe('changed');
    expect(
      (await segments.list()).find((item) => item.id === id)
        ?.agentApprovalState,
    ).toBe('changed');
    await expect(segments.getSegment(id)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_APPROVAL_INVALIDATED' },
    });
    await expect(
      drafts.approve(userId, draft.id, preview(draft)),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_TARGET_CHANGED' },
    });
    const fresh = await drafts.reopen(userId, draft.id, {
      expectedVersion: 1,
      reason: 'Inspect the current canonical editor change',
    });
    expect(fresh.current).toMatchObject({
      version: 2,
      name: 'QA canonical editor changed rules',
    });
    expect(fresh.versions[0]).toEqual(draft.versions[0]);
    const next = await drafts.submit(userId, draft.id, preview(fresh));
    const reviewed = await drafts.approve(userId, draft.id, preview(next));
    expect(reviewed).toMatchObject({
      verification: 'verified',
      canonicalSegment: { id, version: 3 },
    });
    expect(reviewed.actionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: 'customer_segment_draft_v1',
          state: 'verified',
        }),
        expect.objectContaining({
          actionType: 'customer_segment_draft_v2',
          state: 'verified',
        }),
      ]),
    );
    expect(reviewed.approvals).toHaveLength(2);
    expect((await segments.getSegment(id)).count).toBeGreaterThan(0);
    expect(
      await prisma.segment.count({
        where: { sourceAgentRecommendationId: draft.id },
      }),
    ).toBe(1);
  });

  it('pins the canonical target version and refuses a racing edit after reopen', async () => {
    const draft = await submitted();
    const applied = await drafts.approve(userId, draft.id, preview(draft));
    const id = applied.canonicalSegment!.id;
    const fresh = await drafts.reopen(userId, draft.id, {
      expectedVersion: 1,
      reason: 'QA new review',
    });
    const pending = await drafts.submit(userId, draft.id, preview(fresh));
    await segments.update(id, { name: 'Concurrent canonical change' }, userId);
    await expect(
      drafts.approve(userId, draft.id, preview(pending)),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_TARGET_CHANGED' },
    });
    expect(
      (await prisma.segment.findUniqueOrThrow({ where: { id } })).name,
    ).toBe('Concurrent canonical change');
    await drafts.withdraw(userId, draft.id, {
      expectedVersion: 2,
      reason: 'Target changed while pending',
    });
    const rebased = await drafts.reopen(userId, draft.id, {
      expectedVersion: 2,
      reason: 'Read current canonical target again',
    });
    expect(rebased.current).toMatchObject({
      version: 3,
      name: 'Concurrent canonical change',
    });
    await drafts.submit(userId, draft.id, preview(rebased));
    expect(
      (await drafts.approve(userId, draft.id, preview(rebased))).verification,
    ).toBe('verified');
  });

  it('never silently recreates a deleted applied Segment', async () => {
    const draft = await submitted();
    const applied = await drafts.approve(userId, draft.id, preview(draft));
    await segments.remove(applied.canonicalSegment!.id);
    expect((await drafts.get(draft.id)).verification).toBe('missing');
    await expect(
      drafts.approve(userId, draft.id, preview(draft)),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_TARGET_CHANGED' },
    });
    await expect(
      drafts.reopen(userId, draft.id, {
        expectedVersion: 1,
        reason: 'Deleted canonical record',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_TARGET_CHANGED' },
    });
    expect(
      await prisma.segment.count({
        where: { sourceAgentRecommendationId: draft.id },
      }),
    ).toBe(0);
  });

  it('rechecks permissions, module switches, agent switches and expiry at approval time', async () => {
    const draft = await submitted();
    const input = preview(draft);
    await prisma.roleCapabilityOverride.create({
      data: {
        businessId,
        role: Role.manager,
        capabilities: [CAPABILITIES.CUSTOMER_AGENT_RUN],
      },
    });
    await expect(drafts.approve(userId, draft.id, input)).rejects.toMatchObject(
      { response: { code: 'CUSTOMER_SEGMENT_DRAFT_FORBIDDEN' } },
    );
    await prisma.roleCapabilityOverride.deleteMany({ where: { businessId } });
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: ['customers'] },
    });
    await expect(drafts.approve(userId, draft.id, input)).rejects.toMatchObject(
      { response: { code: 'BUSINESS_MODULE_DISABLED' } },
    );
    await prisma.business.update({
      where: { id: businessId },
      data: {
        disabledModules: [],
        policies: { 'agents.customerEnabled': false },
      },
    });
    await expect(drafts.approve(userId, draft.id, input)).rejects.toMatchObject(
      { response: { code: 'SPECIALIST_AGENT_DISABLED' } },
    );
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    const row = await prisma.specialistAgentRecommendation.findUniqueOrThrow({
      where: { id: draft.id },
    });
    const details = row.details as Prisma.JsonObject;
    await prisma.specialistAgentRecommendation.update({
      where: { id: draft.id },
      data: {
        details: {
          ...details,
          segmentReview: {
            ...(details.segmentReview as Prisma.JsonObject),
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      },
    });
    await expect(drafts.approve(userId, draft.id, input)).rejects.toMatchObject(
      { response: { code: 'CUSTOMER_SEGMENT_DRAFT_EXPIRED' } },
    );
    expect(
      (
        await drafts.reject(userId, draft.id, {
          expectedVersion: 1,
          reason: 'Expired pending proposal',
        })
      ).state,
    ).toBe('rejected');
    expect(
      await prisma.segment.count({
        where: { sourceAgentRecommendationId: draft.id },
      }),
    ).toBe(0);
  });

  it('cannot read or approve a foreign proposal and keeps manual Segments backwards compatible', async () => {
    const foreign = await source(foreignBusinessId);
    await expect(
      drafts.approve(userId, foreign.id, {
        expectedVersion: 1,
        expectedPayloadHash: '0'.repeat(64),
        expectedCountsHash: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_SEGMENT_DRAFT_NOT_FOUND' },
    });
    const manual = await segments.create(businessId, {
      name: 'QA Manual unaffected',
      rules,
    });
    await segments.update(manual.id, { name: 'QA Manual edited' }, userId);
    expect(
      segmentApprovalState(
        await prisma.segment.findUniqueOrThrow({ where: { id: manual.id } }),
      ),
    ).toBe('manual');
    expect((await segments.getSegment(manual.id)).count).toBeGreaterThan(0);
    expect(
      (
        await actions.list(businessId, Role.staff, null, {
          type: 'customer_segment',
        })
      ).items,
    ).toEqual([]);
  });

  it('has the real migration FK and a unique source link in MySQL', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ CONSTRAINT_NAME: string; REFERENCED_TABLE_NAME: string }>
    >`SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'segments' AND COLUMN_NAME = 'source_agent_recommendation_id' AND REFERENCED_TABLE_NAME IS NOT NULL`;
    expect(rows).toEqual([
      {
        CONSTRAINT_NAME: 'segments_source_agent_recommendation_id_fkey',
        REFERENCED_TABLE_NAME: 'specialist_agent_recommendations',
      },
    ]);
  });
});
