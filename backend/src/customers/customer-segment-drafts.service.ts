import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PoliciesService } from '../common/policies/policies.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';
import {
  createSpecialistAgentAction,
  specialistAgentActionIdempotencyHash,
  transitionSpecialistAgentActionForResource,
  type SpecialistAgentActionState,
} from '../common/agents/specialist-agent-action.util';
import { parseDisabled } from '../business-modules/business-modules.service';
import { SegmentsService } from './segments.service';
import {
  customerSegmentReviewHash,
  segmentApprovalState,
} from './segment-approval.util';
import {
  excludeErasedCustomers,
  rulesToWhere,
  type SegmentCondition,
  type SegmentRules,
} from './segment-rules.util';
import {
  UpdateCustomerSegmentDraftDto,
  RejectCustomerSegmentDraftDto,
  SubmitCustomerSegmentDraftDto,
  ApproveCustomerSegmentDraftDto,
} from './dto/customer-segment-draft.dto';

const AGENT = 'customer_intelligence';
const VALIDITY_MS = 86_400_000;
const MAX_VERSIONS = 50;
const ALLOWED_FIELDS = [
  'visitCount',
  'lastVisitAt',
  'createdAt',
  'consentMarketing',
  'optedOut',
];
type Client = Pick<
  TenantPrismaService['client'],
  | 'customer'
  | 'business'
  | 'specialistAgentRecommendation'
  | 'auditLog'
  | 'segment'
  | 'specialistAgentAction'
  | 'specialistAgentActionEvent'
  | '$queryRaw'
>;
type Revision = {
  version: number;
  name: string;
  rules: SegmentRules;
  reason: string;
  payloadHash: string;
  savedAt: string;
  actorUserId: string;
  countsAtSave?: {
    matched: number;
    inactive: number;
    optedOut: number;
    noConsent: number;
    flagsPass: number;
    observedAt: string;
    sendAuthorized: boolean;
  };
};
type Draft = {
  schemaVersion: 1;
  state: 'draft' | 'submitted' | 'applied' | 'rejected';
  expiresAt: string;
  versions: Revision[];
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  target?: { segmentId: string; version: number };
  submission?: {
    version: number;
    payloadHash: string;
    countsHash: string;
    at: string;
    by: string;
  };
  approvals?: Array<{
    version: number;
    payloadHash: string;
    countsHash: string;
    at: string;
    by: string;
    segmentId: string;
    segmentVersion: number;
  }>;
};

function invalid(message: string, code = 'CUSTOMER_SEGMENT_DRAFT_INVALID') {
  return new AppException(code, message, HttpStatus.CONFLICT);
}

/** Versioned proposals stay on the recommendation; only an exact human approval applies them. */
@Injectable()
export class CustomerSegmentDraftsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly policies: PoliciesService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly segments: SegmentsService,
  ) {}

  private async permission() {
    if (
      !(await this.policies.actorCan(CAPABILITIES.CUSTOMER_AGENT_RUN)) ||
      !(await this.policies.actorCan(CAPABILITIES.CUSTOMERS_MANAGE))
    ) {
      throw new AppException(
        'CUSTOMER_SEGMENT_DRAFT_FORBIDDEN',
        'Customer Intelligence and Customers management permissions are required.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async enabled(businessId: string) {
    await this.permission();
    await this.agentPolicy.assertEnabled(businessId, 'customer');
    const business = await this.tenant.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    if (
      parseDisabled(
        business.parentId
          ? business.parent?.disabledModules
          : business.disabledModules,
      ).includes('customers')
    ) {
      throw invalid(
        'Customers is disabled for this business.',
        'BUSINESS_MODULE_DISABLED',
      );
    }
  }

  private actionType(version: number) {
    return `customer_segment_draft_v${version}`;
  }

  private async createAction(
    tx: Client,
    row: {
      id: string;
      businessId: string;
      runId: string;
      riskTier: string;
      confidenceValue: number | null;
    },
    revision: Revision,
    actorUserId: string,
    options: {
      state?: SpecialistAgentActionState;
      rejectionReason?: string;
      approvedAt?: Date;
      canonicalOperationId?: string;
      executionAttemptCount?: number;
      actualResult?: Prisma.InputJsonValue;
      verifiedAt?: Date;
      verificationResult?: Prisma.InputJsonValue;
      eventType?: string;
      eventReason?: string;
    } = {},
  ) {
    const actionType = this.actionType(revision.version);
    return createSpecialistAgentAction(tx, {
      actorUserId,
      reason: options.eventReason ?? revision.reason,
      eventType: options.eventType,
      data: {
        businessId: row.businessId,
        runId: row.runId,
        recommendationId: row.id,
        agentKey: AGENT,
        moduleId: '7',
        actionType,
        canonicalResourceType: 'specialist_agent_recommendation',
        canonicalResourceId: row.id,
        expectedVersion: revision.version,
        expectedPostcondition: {
          segmentName: revision.name,
          proposalHash: revision.payloadHash,
          approvalRequired: true,
          sendsMessages: false,
        },
        proposedPayload: {
          version: revision.version,
          name: revision.name,
          rules: revision.rules as unknown as Prisma.InputJsonObject,
          payloadHash: revision.payloadHash,
        },
        reason: revision.reason,
        evidenceRefs: [
          {
            sourceType: 'specialist_agent_recommendation',
            resourceId: row.id,
          },
        ],
        confidenceValue: row.confidenceValue,
        riskTier: row.riskTier,
        riskDescription:
          'This proposal changes a CRM audience definition only after exact human approval. It does not send messages.',
        policyResult: { approvalRequired: true, agentEnabled: true },
        permissionResult: {
          customerAgentRun: true,
          customersManage: true,
        },
        requiredApproval: true,
        requiredApproverRole: 'owner_or_customer_manager',
        idempotencyKeyHash: specialistAgentActionIdempotencyHash({
          businessId: row.businessId,
          agentKey: AGENT,
          actionType,
          recommendationId: row.id,
        }),
        correlationId: row.runId,
        state: options.state ?? 'proposed',
        createdByUserId: actorUserId,
        rejectionReason: options.rejectionReason,
        approvedAt: options.approvedAt,
        canonicalOperationId: options.canonicalOperationId,
        executionAttemptCount: options.executionAttemptCount ?? 0,
        actualResult: options.actualResult,
        verifiedAt: options.verifiedAt,
        verificationResult: options.verificationResult,
      },
    });
  }

  /**
   * Older saved drafts predate SpecialistAgentAction. Reconcile them under the
   * recommendation lock before a mutation, preserving saved state while making
   * no claim of verification unless the current canonical Segment still
   * matches the saved approval.
   */
  private async ensureActionHistory(
    tx: Client,
    row: {
      id: string;
      businessId: string;
      runId: string;
      riskTier: string;
      confidenceValue: number | null;
    },
    draft: Draft,
    actorUserId: string,
  ) {
    const existing = await tx.specialistAgentAction.findMany({
      where: {
        businessId: row.businessId,
        recommendationId: row.id,
        agentKey: AGENT,
      },
      select: { actionType: true },
    });
    const existingTypes = new Set(existing.map((action) => action.actionType));
    const missing = draft.versions.filter(
      (revision) => !existingTypes.has(this.actionType(revision.version)),
    );
    if (missing.length === 0) return;

    const canonical = await tx.segment.findUnique({
      where: {
        sourceAgentRecommendationId: row.id,
        businessId: row.businessId,
      },
    });
    const current = draft.versions[draft.versions.length - 1];
    for (const revision of missing) {
      const approval = draft.approvals?.find(
        (item) =>
          item.version === revision.version &&
          item.payloadHash === revision.payloadHash,
      );
      const isCurrent = revision.version === current.version;
      const canonicalMatches = Boolean(
        approval &&
          canonical &&
          canonical.id === approval.segmentId &&
          canonical.version === approval.segmentVersion &&
          segmentApprovalState(canonical) === 'approved' &&
          canonical.name === revision.name &&
          customerSegmentReviewHash(canonical.rules) ===
            customerSegmentReviewHash(revision.rules),
      );
      let state: SpecialistAgentActionState;
      if (approval) {
        state = canonicalMatches ? 'verified' : 'needs_review';
      } else if (!isCurrent) {
        state = 'cancelled';
      } else if (
        draft.state === 'submitted' &&
        draft.submission?.version === revision.version
      ) {
        state = 'approval_required';
      } else if (draft.state === 'rejected') {
        state = 'rejected';
      } else {
        state = 'proposed';
      }

      const reason = canonicalMatches
        ? 'Legacy approval was reconciled and the current canonical Segment still matches the saved approved version.'
        : approval
          ? 'A legacy approval record exists, but the current canonical Segment cannot verify that historical result.'
          : 'Legacy proposal state was reconstructed from the saved Customer Intelligence draft.';
      const approvedAt = approval ? new Date(approval.at) : undefined;
      await this.createAction(tx, row, revision, actorUserId, {
        state,
        rejectionReason:
          isCurrent && draft.state === 'rejected'
            ? draft.rejectionReason
            : undefined,
        approvedAt,
        canonicalOperationId: approval?.segmentId,
        executionAttemptCount: approval ? 1 : 0,
        actualResult: approval
          ? {
              segmentId: approval.segmentId,
              segmentVersion: approval.segmentVersion,
            }
          : undefined,
        verifiedAt:
          canonicalMatches && approvedAt ? approvedAt : undefined,
        verificationResult: approval
          ? {
              status: canonicalMatches ? 'verified' : 'needs_review',
              segmentId: approval.segmentId,
              segmentVersion: approval.segmentVersion,
              currentCanonicalMatches: canonicalMatches,
            }
          : undefined,
        eventType: 'legacy_state_reconciled',
        eventReason: reason,
      });
    }
  }

  private async transitionAction(
    tx: Client,
    input: {
      businessId: string;
      recommendationId: string;
      version: number;
      fromState: SpecialistAgentActionState;
      toState: SpecialistAgentActionState;
      actorUserId: string;
      reason?: string;
      eventType?: string;
      update?: Prisma.SpecialistAgentActionUpdateManyMutationInput;
    },
  ) {
    await transitionSpecialistAgentActionForResource(tx, {
      businessId: input.businessId,
      actionType: this.actionType(input.version),
      canonicalResourceType: 'specialist_agent_recommendation',
      canonicalResourceId: input.recommendationId,
      fromState: input.fromState,
      toState: input.toState,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      reason: input.reason,
      update: input.update,
      required: true,
    });
  }

  private rules(value: unknown): SegmentRules {
    const rules = value as SegmentRules | null;
    if (
      !rules ||
      !['AND', 'OR'].includes(rules.combinator) ||
      !Array.isArray(rules.conditions) ||
      rules.conditions.length < 1 ||
      rules.conditions.length > 12
    )
      throw invalid('Use between 1 and 12 inspectable rule conditions.');
    const conditions = rules.conditions.map((condition): SegmentCondition => {
      if (!condition || !ALLOWED_FIELDS.includes(condition.field))
        throw invalid(
          'This agent draft supports visit count, visit/signup dates, consent and opt-out only. Personal identifiers, tags and financial targeting are not supported.',
        );
      const { field, operator } = condition;
      if (field === 'consentMarketing' || field === 'optedOut') {
        if (
          !['eq', 'neq'].includes(operator) ||
          ![true, false, 'true', 'false'].some(
            (value) => value === condition.value,
          )
        )
          throw invalid(
            'Consent and opt-out rules require is/is not and true/false.',
          );
        return {
          field,
          operator,
          value: condition.value === true || condition.value === 'true',
        };
      }
      if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(operator))
        throw invalid('Use a comparison operator for visit counts and dates.');
      if (field === 'visitCount') {
        if (
          typeof condition.value === 'boolean' ||
          String(condition.value).trim() === ''
        )
          throw invalid('Visit count must be a non-negative whole number.');
        const number = Number(condition.value);
        if (!Number.isInteger(number) || number < 0 || number > 1_000_000_000)
          throw invalid('Visit count must be a non-negative whole number.');
        return { field, operator, value: number };
      }
      if (
        typeof condition.value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(condition.value)
      )
        throw invalid('Use an ISO calendar date for a date rule.');
      const date = new Date(condition.value);
      const calendar = condition.value.slice(0, 10);
      const calendarDate = new Date(`${calendar}T00:00:00.000Z`);
      if (
        !Number.isFinite(date.getTime()) ||
        !Number.isFinite(calendarDate.getTime()) ||
        calendarDate.toISOString().slice(0, 10) !== calendar ||
        date.getUTCFullYear() < 1970 ||
        date.getUTCFullYear() > 2100
      )
        throw invalid('Use a valid date between 1970 and 2100.');
      return { field, operator, value: date.toISOString() };
    });
    return { combinator: rules.combinator, conditions };
  }

  private revision(
    version: number,
    name: string,
    rules: unknown,
    actorUserId: string,
    reason: string,
  ): Revision {
    const label = typeof name === 'string' ? name.trim() : '';
    if (
      !label ||
      label.length > 80 ||
      !reason?.trim() ||
      reason.trim().length > 500
    )
      throw invalid(
        'Provide a name (up to 80 characters) and a reason (up to 500 characters).',
      );
    const normalized = this.rules(rules);
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ version, name: label, rules: normalized }))
      .digest('hex');
    return {
      version,
      name: label,
      rules: normalized,
      reason: reason.trim(),
      payloadHash,
      savedAt: new Date().toISOString(),
      actorUserId,
    };
  }

  private read(value: Prisma.JsonValue): Draft {
    const draft = (value as Prisma.JsonObject)?.segmentReview as unknown as
      Draft | undefined;
    if (
      !draft ||
      draft.schemaVersion !== 1 ||
      !['draft', 'submitted', 'applied', 'rejected'].includes(draft.state) ||
      !Array.isArray(draft.versions) ||
      draft.versions.length < 1 ||
      draft.versions.length > MAX_VERSIONS ||
      !Number.isFinite(Date.parse(draft.expiresAt))
    )
      throw invalid(
        'The saved segment draft is invalid. Prepare a fresh Customer review.',
      );
    draft.versions.forEach((revision, index) => {
      if (
        revision.version !== index + 1 ||
        !revision.name ||
        !/^[a-f0-9]{64}$/.test(revision.payloadHash)
      )
        throw invalid('The draft revision history is invalid.');
      const rules = this.rules(revision.rules);
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            version: revision.version,
            name: revision.name,
            rules,
          }),
        )
        .digest('hex');
      if (hash !== revision.payloadHash)
        throw invalid(
          'The saved rule preview changed without a valid revision.',
        );
    });
    return draft;
  }

  private async find(id: string, client: Client = this.tenant.client) {
    const row = await client.specialistAgentRecommendation.findFirst({
      where: { id, agentKey: AGENT },
      include: { run: { select: { status: true, inputRefs: true } } },
    });
    if (!row)
      throw new AppException(
        'CUSTOMER_SEGMENT_DRAFT_NOT_FOUND',
        'Customer recommendation not found.',
        HttpStatus.NOT_FOUND,
      );
    return row;
  }

  private async counts(
    rules: SegmentRules,
    client: Client = this.tenant.client,
  ) {
    const where = excludeErasedCustomers(rulesToWhere(rules));
    const active = {
      AND: [where, { status: 'active' as const }],
    };
    const [matched, inactive, optedOut, noConsent, flagsPass] =
      await Promise.all([
        this.segments.previewCount(rules, client),
        client.customer.count({
          where: { AND: [where, { status: { not: 'active' } }] },
        }),
        client.customer.count({ where: { AND: [active, { optedOut: true }] } }),
        client.customer.count({
          where: {
            AND: [active, { optedOut: false, consentMarketing: false }],
          },
        }),
        client.customer.count({
          where: { AND: [active, { optedOut: false, consentMarketing: true }] },
        }),
      ]);
    return {
      matched: matched.count,
      inactive,
      optedOut,
      noConsent,
      flagsPass,
      observedAt: new Date().toISOString(),
      sendAuthorized: false,
    };
  }

  async list() {
    await this.permission();
    const rows =
      await this.tenant.client.specialistAgentRecommendation.findMany({
        where: {
          agentKey: AGENT,
          status: {
            in: [
              'segment_draft',
              'segment_submitted',
              'segment_applied',
              'segment_rejected',
            ],
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      });
    return Promise.all(
      rows.map(async (row) => {
        return this.project(row);
      }),
    );
  }

  async prepare(actorUserId: string, id: string) {
    await this.permission();
    const source = await this.find(id);
    await this.enabled(source.businessId);
    await this.tenant.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
      const row = await this.find(id, tx);
      const details = row.details as Prisma.JsonObject;
      if (details.segmentReview) {
        const existingDraft = this.read(row.details);
        await this.ensureActionHistory(tx, row, existingDraft, actorUserId);
        return;
      }
      const proposal = details.proposedSegment as Prisma.JsonObject | undefined;
      const refs = row.run.inputRefs as Prisma.JsonArray;
      if (
        row.run.status !== 'completed' ||
        !proposal ||
        proposal.matchedCount === null ||
        !refs.some(
          (ref) => (ref as Prisma.JsonObject)?.scope === 'current_business',
        )
      )
        throw invalid(
          'Prepare a completed current-business Customer review before drafting a segment. Selected-branch aggregate proposals are not supported.',
        );
      const expiresAt = new Date(
        row.createdAt.getTime() + VALIDITY_MS,
      ).toISOString();
      if (Date.parse(expiresAt) <= Date.now())
        throw invalid(
          'This recommendation expired. Run a fresh review.',
          'CUSTOMER_SEGMENT_DRAFT_EXPIRED',
        );
      const revision = this.revision(
        1,
        typeof proposal.name === 'string' ? proposal.name : '',
        proposal.rules,
        actorUserId,
        'Prepared from the saved Customer Intelligence recommendation.',
      );
      const draft: Draft = {
        schemaVersion: 1,
        state: 'draft',
        expiresAt,
        versions: [revision],
      };
      revision.countsAtSave = await this.counts(revision.rules, tx);
      await tx.specialistAgentRecommendation.update({
        where: { id },
        data: {
          details: {
            ...details,
            segmentReview: draft,
          } as unknown as Prisma.InputJsonValue,
          status: 'segment_draft',
          approvalRequired: true,
        },
      });
      await this.audit(
        tx,
        row.businessId,
        actorUserId,
        id,
        'prepared',
        revision,
      );
      await this.createAction(tx, row, revision, actorUserId);
    });
    return this.get(id);
  }

  async get(id: string) {
    await this.permission();
    const row = await this.find(id);
    return this.project(row);
  }

  private countHash(
    counts: Awaited<ReturnType<CustomerSegmentDraftsService['counts']>>,
  ) {
    return customerSegmentReviewHash({
      matched: counts.matched,
      inactive: counts.inactive,
      optedOut: counts.optedOut,
      noConsent: counts.noConsent,
      flagsPass: counts.flagsPass,
    });
  }

  private async project(row: {
    id: string;
    businessId: string;
    details: Prisma.JsonValue;
    createdAt: Date;
  }) {
    const draft = this.read(row.details);
    const current = draft.versions[draft.versions.length - 1];
    const [counts, canonical, actions] = await Promise.all([
      this.counts(current.rules),
      this.tenant.client.segment.findUnique({
        where: {
          sourceAgentRecommendationId: row.id,
          businessId: row.businessId,
        },
      }),
      this.tenant.client.specialistAgentAction.findMany({
        where: {
          businessId: row.businessId,
          recommendationId: row.id,
          agentKey: AGENT,
        },
        include: { events: { orderBy: { sequence: 'asc' } } },
        orderBy: [{ expectedVersion: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      id: row.id,
      createdAt: row.createdAt,
      ...draft,
      current,
      expired: Date.parse(draft.expiresAt) <= Date.now(),
      counts,
      countsHash: this.countHash(counts),
      actionHistoryComplete: draft.versions.every((revision) =>
        actions.some(
          (action) => action.actionType === this.actionType(revision.version),
        ),
      ),
      canonicalSegment: canonical
        ? {
            id: canonical.id,
            name: canonical.name,
            version: canonical.version,
            approvalState: segmentApprovalState(canonical),
          }
        : null,
      actionHistory: actions.map((action) => ({
        id: action.id,
        actionType: action.actionType,
        state: action.state,
        expectedVersion: action.expectedVersion,
        correlationId: action.correlationId,
        executionAttemptCount: action.executionAttemptCount,
        rejectionReason: action.rejectionReason,
        canonicalOperationId: action.canonicalOperationId,
        approvedAt: action.approvedAt,
        executedAt: action.executedAt,
        verifiedAt: action.verifiedAt,
        actualResult: action.actualResult,
        verificationResult: action.verificationResult,
        events: action.events.map((event) => ({
          eventType: event.eventType,
          fromState: event.fromState,
          toState: event.toState,
          reason: event.reason,
          createdAt: event.createdAt,
        })),
      })),
      verification:
        draft.state === 'applied'
          ? canonical
            ? segmentApprovalState(canonical) === 'approved'
              ? 'verified'
              : 'changed'
            : 'missing'
          : 'not_applied',
    };
  }

  async submit(
    actorUserId: string,
    id: string,
    input: SubmitCustomerSegmentDraftDto,
  ) {
    await this.permission();
    const source = await this.find(id);
    await this.enabled(source.businessId);
    await this.tenant.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
      const row = await this.find(id, tx);
      const draft = this.read(row.details);
      await this.ensureActionHistory(tx, row, draft, actorUserId);
      const current = draft.versions[draft.versions.length - 1];
      if (draft.state !== 'draft')
        throw invalid(
          'Withdraw the pending review before changing or submitting it again.',
          'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
        );
      await this.assertPreview(tx, row.businessId, draft, input);
      draft.submission = {
        version: current.version,
        payloadHash: current.payloadHash,
        countsHash: input.expectedCountsHash,
        at: new Date().toISOString(),
        by: actorUserId,
      };
      draft.state = 'submitted';
      await tx.specialistAgentRecommendation.update({
        where: { id },
        data: {
          status: 'segment_submitted',
          details: {
            ...(row.details as Prisma.JsonObject),
            segmentReview: draft,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit(
        tx,
        row.businessId,
        actorUserId,
        id,
        'submitted',
        current,
      );
      await this.transitionAction(tx, {
        businessId: row.businessId,
        recommendationId: row.id,
        version: current.version,
        fromState: 'proposed',
        toState: 'approval_required',
        actorUserId,
        reason: 'The exact saved segment proposal was submitted for human approval.',
      });
    });
    return this.get(id);
  }

  private async assertPreview(
    client: Client,
    businessId: string,
    draft: Draft,
    input: SubmitCustomerSegmentDraftDto,
  ) {
    const current = draft.versions[draft.versions.length - 1];
    if (Date.parse(draft.expiresAt) <= Date.now())
      throw invalid(
        'The proposal expired. Refresh its source review before approval.',
        'CUSTOMER_SEGMENT_DRAFT_EXPIRED',
      );
    if (
      current.version !== input.expectedVersion ||
      current.payloadHash !== input.expectedPayloadHash
    )
      throw invalid(
        'The exact draft version or rule payload changed. Reload its preview.',
        'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
      );
    if (
      this.countHash(await this.counts(current.rules, client)) !==
      input.expectedCountsHash
    )
      throw invalid(
        'Matching counts or consent exclusions changed. Refresh and review the audience context again.',
        'CUSTOMER_SEGMENT_AUDIENCE_CHANGED',
      );
    if (draft.target) {
      const target = await client.segment.findFirst({
        where: { id: draft.target.segmentId, businessId },
      });
      if (!target || target.version !== draft.target.version)
        throw invalid(
          'The target Segment changed or was deleted. Reopen from its current definition.',
          'CUSTOMER_SEGMENT_TARGET_CHANGED',
        );
    }
  }

  async approve(
    actorUserId: string,
    id: string,
    input: ApproveCustomerSegmentDraftDto,
  ) {
    await this.permission();
    const source = await this.find(id);
    await this.enabled(source.businessId);
    await this.tenant.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
        const row = await this.find(id, tx);
        const draft = this.read(row.details);
        await this.ensureActionHistory(tx, row, draft, actorUserId);
        const current = draft.versions[draft.versions.length - 1];
        const last = draft.approvals?.[draft.approvals.length - 1];
        if (
          draft.state === 'applied' &&
          last &&
          last.version === input.expectedVersion &&
          last.payloadHash === input.expectedPayloadHash &&
          last.countsHash === input.expectedCountsHash
        ) {
          const existing = await tx.segment.findFirst({
            where: {
              id: last.segmentId,
              businessId: row.businessId,
              sourceAgentRecommendationId: id,
            },
          });
          if (
            !existing ||
            segmentApprovalState(existing) !== 'approved' ||
            existing.version !== last.segmentVersion
          )
            throw invalid(
              'The previously applied Segment changed or was deleted. It will not be silently recreated.',
              'CUSTOMER_SEGMENT_TARGET_CHANGED',
            );
          return;
        }
        if (
          draft.state !== 'submitted' ||
          !draft.submission ||
          draft.submission.version !== input.expectedVersion ||
          draft.submission.payloadHash !== input.expectedPayloadHash ||
          draft.submission.countsHash !== input.expectedCountsHash
        )
          throw invalid(
            'Approve only the exact submitted preview. Withdraw and re-submit if it changed.',
            'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
          );
        await this.assertPreview(tx, row.businessId, draft, input);
        await this.enabled(row.businessId);
        const dto = { name: current.name, rules: this.rules(current.rules) };
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: current.version,
          fromState: 'approval_required',
          toState: 'approved',
          actorUserId,
          reason: 'The exact submitted segment definition passed approval checks.',
          update: { approvedByUserId: actorUserId, approvedAt: new Date() },
        });
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: current.version,
          fromState: 'approved',
          toState: 'execution_queued',
          actorUserId,
          reason: 'The canonical CRM Segment write is starting in this transaction.',
        });
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: current.version,
          fromState: 'execution_queued',
          toState: 'executing',
          actorUserId,
          reason: 'Applying the approved definition through SegmentsService.',
          update: { executionAttemptCount: { increment: 1 } },
        });
        const expectedSegmentVersion = draft.target
          ? draft.target.version + 1
          : 1;
        const segment = draft.target
          ? await this.segments.applyApprovedDefinition(
              draft.target.segmentId,
              row.businessId,
              draft.target.version,
              dto,
              tx,
            )
          : await this.segments.create(row.businessId, dto, tx, id);
        const persistedSegment = await tx.segment.findFirst({
          where: { id: segment.id, businessId: row.businessId },
        });
        if (
          !persistedSegment ||
          segmentApprovalState(persistedSegment) !== 'approved' ||
          persistedSegment.version !== expectedSegmentVersion ||
          persistedSegment.name !== current.name ||
          customerSegmentReviewHash(persistedSegment.rules) !==
            customerSegmentReviewHash(dto.rules)
        )
          throw invalid(
            'The saved canonical Segment did not match the approved definition on readback.',
            'CUSTOMER_SEGMENT_VERIFICATION_FAILED',
          );
        const approval = {
          version: current.version,
          payloadHash: current.payloadHash,
          countsHash: input.expectedCountsHash,
          at: new Date().toISOString(),
          by: actorUserId,
          segmentId: persistedSegment.id,
          segmentVersion: persistedSegment.version,
        };
        draft.approvals = [...(draft.approvals ?? []), approval];
        draft.state = 'applied';
        await tx.specialistAgentRecommendation.update({
          where: { id },
          data: {
            status: 'segment_applied',
            details: {
              ...(row.details as Prisma.JsonObject),
              segmentReview: draft,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId: row.businessId,
            actorUserId,
            entity: 'Segment',
            entityId: persistedSegment.id,
            action: 'customer_agent.segment_approved_applied',
            after: {
              recommendationId: id,
              ...approval,
              canonicalDefinitionHash:
                persistedSegment.agentApprovedDefinitionHash,
              sendsMessages: false,
            },
          },
        });
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: current.version,
          fromState: 'executing',
          toState: 'succeeded',
          actorUserId,
          reason: 'SegmentsService saved the canonical Segment.',
          update: {
            canonicalOperationId: persistedSegment.id,
            executedByUserId: actorUserId,
            executedAt: new Date(),
            actualResult: {
              segmentId: persistedSegment.id,
              segmentVersion: persistedSegment.version,
              name: persistedSegment.name,
            },
          },
        });
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: current.version,
          fromState: 'succeeded',
          toState: 'verification_pending',
          actorUserId,
          reason: 'The saved canonical state was read back for verification.',
        });
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: current.version,
          fromState: 'verification_pending',
          toState: 'verified',
          actorUserId,
          reason: 'Canonical name, rules, version and approval hash match the proposal.',
          update: {
            verifiedAt: new Date(),
            verificationResult: {
              status: 'verified',
              segmentId: persistedSegment.id,
              segmentVersion: persistedSegment.version,
              approvalState: 'approved',
              definitionMatches: true,
            },
          },
        });
      },
      { timeout: 15_000 },
    );
    return this.get(id);
  }

  async withdraw(
    actorUserId: string,
    id: string,
    input: RejectCustomerSegmentDraftDto,
  ) {
    await this.permission();
    const source = await this.find(id);
    if (!input.reason?.trim())
      throw invalid('A withdrawal reason is required.');
    await this.tenant.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
      const row = await this.find(id, tx);
      const draft = this.read(row.details);
      await this.ensureActionHistory(tx, row, draft, actorUserId);
      if (
        draft.state !== 'submitted' ||
        draft.versions.length !== input.expectedVersion
      )
        throw invalid(
          'The pending proposal changed.',
          'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
        );
      draft.state = 'draft';
      delete draft.submission;
      await tx.specialistAgentRecommendation.update({
        where: { id },
        data: {
          status: 'segment_draft',
          details: {
            ...(row.details as Prisma.JsonObject),
            segmentReview: draft,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit(
        tx,
        row.businessId,
        actorUserId,
        id,
        'withdrawn',
        draft.versions[draft.versions.length - 1],
        input.reason.trim(),
      );
      await this.transitionAction(tx, {
        businessId: row.businessId,
        recommendationId: row.id,
        version: input.expectedVersion,
        fromState: 'approval_required',
        toState: 'proposed',
        actorUserId,
        reason: input.reason.trim(),
        eventType: 'approval_withdrawn',
      });
    });
    return this.get(id);
  }

  async reopen(
    actorUserId: string,
    id: string,
    input: RejectCustomerSegmentDraftDto,
  ) {
    await this.permission();
    const source = await this.find(id);
    await this.enabled(source.businessId);
    if (!input.reason?.trim())
      throw invalid('A fresh review reason is required.');
    await this.tenant.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
      const row = await this.find(id, tx);
      const draft = this.read(row.details);
      await this.ensureActionHistory(tx, row, draft, actorUserId);
      if (
        !(
          draft.state === 'applied' ||
          (draft.state === 'draft' && draft.target)
        ) ||
        draft.versions.length !== input.expectedVersion ||
        draft.versions.length >= MAX_VERSIONS
      )
        throw invalid(
          'Only an applied proposal or a withdrawn canonical revision can start a fresh review.',
          'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
        );
      const previousState = draft.state;
      const segment = await tx.segment.findUnique({
        where: { sourceAgentRecommendationId: id, businessId: row.businessId },
      });
      if (!segment)
        throw invalid(
          'The canonical Segment was deleted. Run a fresh review rather than recreating it.',
          'CUSTOMER_SEGMENT_TARGET_CHANGED',
        );
      const revision = this.revision(
        draft.versions.length + 1,
        segment.name,
        segment.rules,
        actorUserId,
        input.reason,
      );
      revision.countsAtSave = await this.counts(revision.rules, tx);
      draft.versions.push(revision);
      draft.target = { segmentId: segment.id, version: segment.version };
      draft.expiresAt = new Date(Date.now() + VALIDITY_MS).toISOString();
      draft.state = 'draft';
      delete draft.submission;
      await tx.specialistAgentRecommendation.update({
        where: { id },
        data: {
          status: 'segment_draft',
          details: {
            ...(row.details as Prisma.JsonObject),
            segmentReview: draft,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit(
        tx,
        row.businessId,
        actorUserId,
        id,
        'canonical_review_refreshed',
        revision,
        input.reason.trim(),
      );
      if (previousState === 'draft') {
        await this.transitionAction(tx, {
          businessId: row.businessId,
          recommendationId: row.id,
          version: revision.version - 1,
          fromState: 'proposed',
          toState: 'cancelled',
          actorUserId,
          reason: `Superseded by proposal version ${revision.version}. ${input.reason.trim()}`,
          eventType: 'proposal_superseded',
        });
      }
      await this.createAction(tx, row, revision, actorUserId);
    });
    return this.get(id);
  }

  async update(
    actorUserId: string,
    id: string,
    input: UpdateCustomerSegmentDraftDto,
  ) {
    await this.permission();
    const source = await this.find(id);
    await this.enabled(source.businessId);
    await this.tenant.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
      const row = await this.find(id, tx);
      const draft = this.read(row.details);
      await this.ensureActionHistory(tx, row, draft, actorUserId);
      if (
        draft.state !== 'draft' ||
        input.expectedVersion !== draft.versions.length
      )
        throw invalid(
          'The draft changed or is already closed. Reload before editing.',
          'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
        );
      if (Date.parse(draft.expiresAt) <= Date.now())
        throw invalid(
          'This proposal expired. Run a fresh review.',
          'CUSTOMER_SEGMENT_DRAFT_EXPIRED',
        );
      if (draft.versions.length >= MAX_VERSIONS)
        throw invalid(
          'This draft reached its revision limit. Run a fresh review.',
        );
      const revision = this.revision(
        draft.versions.length + 1,
        input.name,
        input.rules,
        actorUserId,
        input.reason,
      );
      draft.versions.push(revision);
      revision.countsAtSave = await this.counts(revision.rules, tx);
      await tx.specialistAgentRecommendation.update({
        where: { id },
        data: {
          details: {
            ...(row.details as Prisma.JsonObject),
            segmentReview: draft,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit(
        tx,
        row.businessId,
        actorUserId,
        id,
        'revised',
        revision,
      );
      await this.transitionAction(tx, {
        businessId: row.businessId,
        recommendationId: row.id,
        version: revision.version - 1,
        fromState: 'proposed',
        toState: 'cancelled',
        actorUserId,
        reason: `Superseded by proposal version ${revision.version}. ${input.reason.trim()}`,
        eventType: 'proposal_superseded',
      });
      await this.createAction(tx, row, revision, actorUserId);
    });
    return this.get(id);
  }

  async reject(
    actorUserId: string,
    id: string,
    input: RejectCustomerSegmentDraftDto,
  ) {
    await this.permission();
    const source = await this.find(id);
    if (!input.reason?.trim() || input.reason.trim().length > 500)
      throw invalid('A rejection reason is required (up to 500 characters).');
    await this.tenant.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${id} AND business_id = ${source.businessId} FOR UPDATE`;
      const row = await this.find(id, tx);
      const draft = this.read(row.details);
      await this.ensureActionHistory(tx, row, draft, actorUserId);
      if (
        !['draft', 'submitted'].includes(draft.state) ||
        input.expectedVersion !== draft.versions.length
      )
        throw invalid(
          'The draft changed or is already closed.',
          'CUSTOMER_SEGMENT_DRAFT_CONFLICT',
        );
      const previousState = draft.state;
      Object.assign(draft, {
        state: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedBy: actorUserId,
        rejectionReason: input.reason.trim(),
      });
      await tx.specialistAgentRecommendation.update({
        where: { id },
        data: {
          details: {
            ...(row.details as Prisma.JsonObject),
            segmentReview: draft,
          } as unknown as Prisma.InputJsonValue,
          status: 'segment_rejected',
        },
      });
      await this.audit(
        tx,
        row.businessId,
        actorUserId,
        id,
        'rejected',
        draft.versions[draft.versions.length - 1],
        input.reason.trim(),
      );
      await this.transitionAction(tx, {
        businessId: row.businessId,
        recommendationId: row.id,
        version: input.expectedVersion,
        fromState:
          previousState === 'submitted' ? 'approval_required' : 'proposed',
        toState: 'rejected',
        actorUserId,
        reason: input.reason.trim(),
        update: { rejectionReason: input.reason.trim() },
      });
    });
    return this.get(id);
  }

  private async audit(
    client: Client,
    businessId: string,
    actorUserId: string,
    id: string,
    action: string,
    revision: Revision,
    reason?: string,
  ) {
    await client.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'SpecialistAgentRecommendation',
        entityId: id,
        action: `customer_agent.segment_draft_${action}`,
        after: {
          version: revision.version,
          payloadHash: revision.payloadHash,
          canonicalSegmentCreated: false,
          sendsMessages: false,
          ...(reason ? { reason } : {}),
        },
      },
    });
  }
}
