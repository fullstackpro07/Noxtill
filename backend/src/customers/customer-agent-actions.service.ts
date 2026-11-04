import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { describeAiProviderFailure } from '../ai/ai-provider-error.util';
import { SendGateService } from '../messaging/send-gate.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PoliciesService } from '../common/policies/policies.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import {
  createSpecialistAgentAction,
  specialistAgentActionIdempotencyHash,
} from '../common/agents/specialist-agent-action.util';
import { recordSpecialistAgentRunCreatedEvent } from '../common/agents/specialist-agent-run-events.util';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';
import { parseDisabled } from '../business-modules/business-modules.service';
import { createOrReuseSpecialistAgentRun } from '../common/agents/specialist-agent-run-idempotency.util';
import { recordSpecialistAgentRunTerminalEvent } from '../common/agents/specialist-agent-run-events.util';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';
import { LAPSED_DAYS } from './jobs/crm-jobs.constants';
import {
  CUSTOMER_FOLLOW_UP_OUTCOMES,
  CreateCustomerFollowUpTaskDto,
  CustomerFollowUpOutcome,
  CreateCustomerMessageDraftDto,
  GenerateCustomerMessageDraftDto,
  UpdateCustomerMessageDraftDto,
} from './dto/customer-agent-actions.dto';

const MESSAGE_DRAFT_PREFIX = 'customer_agent:';
const MESSAGE_SEND_IDEMPOTENCY_PREFIX = 'customer-agent-draft:';
const CUSTOMER_AGENT_KEY = 'customer_intelligence';
const CUSTOMER_AGENT_VERSION = '1.0.0';
const CUSTOMER_EVENT_FOLLOW_UP_SOURCES = {
  delivery_contact_context: {
    sourceModule: 'delivery',
    entityType: 'Delivery',
    title: 'Follow up on failed delivery',
    reason:
      'A delivery was recorded as failed. Review the current delivery and confirm the appropriate next step. Check channel-specific permission before contacting the customer. No message has been drafted or sent.',
    idempotencyPrefix: 'customer-agent-delivery-failed',
    auditSource: 'customer_intelligence_failed_delivery_review',
  },
  appointment_no_show_contact_context: {
    sourceModule: 'bookings',
    entityType: 'Appointment',
    title: 'Review follow-up after appointment no-show',
    reason:
      'An appointment was recorded as a no-show. Review the current customer context and decide whether a person should follow up. No reason is inferred. Check channel-specific permission before contact. No message has been drafted or sent.',
    idempotencyPrefix: 'customer-agent-appointment-no-show',
    auditSource: 'customer_intelligence_appointment_no_show_review',
  },
  appointment_cancellation_contact_context: {
    sourceModule: 'bookings',
    entityType: 'Appointment',
    title: 'Review follow-up after appointment cancellation',
    reason:
      'An appointment was recorded as cancelled. Review the current customer context and decide whether a person should follow up. No cancellation reason is inferred. Check channel-specific permission before contact. No message has been drafted or sent.',
    idempotencyPrefix: 'customer-agent-appointment-cancelled',
    auditSource: 'customer_intelligence_appointment_cancelled_review',
  },
} as const;

export type CustomerFollowUpOutcomeSummary = {
  windowDays: number;
  from: string;
  observedAt: string;
  completedCount: number;
  recordedCount: number;
  notRecordedCount: number;
  outcomes: Record<CustomerFollowUpOutcome, number>;
  note: string;
};

export type CustomerFollowUpMessageDeliverySummary = {
  windowDays: number;
  from: string;
  observedAt: string;
  linkedDraftCount: number;
  canonicalMessageCount: number;
  providerConfirmedDeliveredOrReadCount: number;
  providerReportedFailedCount: number;
  queuedOrSentUnconfirmedCount: number;
  noCanonicalMessageCount: number;
  otherCanonicalStatusCount: number;
  note: string;
};

function invalid(code: string, message: string, status = HttpStatus.CONFLICT) {
  return new AppException(code, message, status);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function messageDraftView(
  draft: {
    id: string;
    body: string;
    status: string;
    createdAt: Date;
    sourceKey: string;
    customerFollowUpTaskId?: string | null;
  },
  messageStatus: string | null = null,
) {
  return {
    id: draft.id,
    body: draft.body,
    status: draft.status,
    createdAt: draft.createdAt,
    generatedByAgent: draft.sourceKey.includes(':ai:'),
    messageStatus,
    followUpTaskId: draft.customerFollowUpTaskId ?? null,
  };
}

type LockedCustomer = {
  id: string;
  phone: string;
  status: string;
  consentMarketing: boolean | number;
  optedOut: boolean | number;
};

@Injectable()
export class CustomerAgentActionsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly policies: PoliciesService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly aiInfra: AiInfraService,
    private readonly sendGate: SendGateService,
  ) {}

  private async enabled(businessId: string, requireManagement = false) {
    const canRunAgent = await this.policies.actorCan(
      CAPABILITIES.CUSTOMER_AGENT_RUN,
    );
    const canManage = requireManagement
      ? await this.policies.actorCan(CAPABILITIES.CUSTOMERS_MANAGE)
      : true;
    if (!canRunAgent || !canManage) {
      throw invalid(
        'CUSTOMER_AGENT_ACTION_FORBIDDEN',
        'Customer Intelligence and Customers management permissions are required.',
        HttpStatus.FORBIDDEN,
      );
    }
    const client = this.tenant.client;
    await this.agentPolicy.assertEnabled(businessId, 'customer');
    const business = await client.business.findUniqueOrThrow({
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
        'BUSINESS_MODULE_DISABLED',
        'Customers is disabled for this business.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async customer(customerId: string) {
    const customer = await this.tenant.client.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        businessId: true,
        phone: true,
        status: true,
        consentMarketing: true,
        optedOut: true,
        createdAt: true,
        lastVisitAt: true,
      },
    });
    if (!customer)
      throw invalid(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );
    if (customer.phone === `erased-${customer.id}`)
      throw invalid(
        'CUSTOMER_AGENT_ERASED',
        'Customer follow-up actions are unavailable for an erased customer.',
        HttpStatus.GONE,
      );
    return customer;
  }

  /** Serialize agent writes against GDPR erasure, which locks the same customer row. */
  private async lockCustomerForWrite(
    tx: Prisma.TransactionClient,
    businessId: string,
    customerId: string,
    kind: 'task' | 'message',
  ) {
    const rows = await tx.$queryRaw<LockedCustomer[]>`
      SELECT id, phone, status,
        consent_marketing AS consentMarketing,
        opted_out AS optedOut
      FROM customers
      WHERE id = ${customerId} AND business_id = ${businessId}
      FOR UPDATE
    `;
    const customer = rows[0];
    if (!customer)
      throw invalid(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );
    if (customer.phone === `erased-${customer.id}`)
      throw invalid(
        'CUSTOMER_AGENT_ERASED',
        'Customer follow-up actions are unavailable for an erased customer.',
        HttpStatus.GONE,
      );

    if (customer.status !== 'active')
      throw invalid(
        kind === 'task'
          ? 'CUSTOMER_FOLLOW_UP_INACTIVE'
          : 'CUSTOMER_MESSAGE_DRAFT_INACTIVE',
        kind === 'task'
          ? 'A follow-up task cannot be created for an inactive customer.'
          : 'A message draft cannot be created for an inactive customer.',
      );

    const consentMarketing = Boolean(customer.consentMarketing);
    const optedOut = Boolean(customer.optedOut);
    if (kind === 'message' && (!consentMarketing || optedOut))
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED',
        'Marketing consent is missing or the customer opted out. No message draft was saved.',
        HttpStatus.FORBIDDEN,
      );
    return { consentMarketing, optedOut };
  }

  async listTasks(customerId: string) {
    const customer = await this.customer(customerId);
    await this.enabled(customer.businessId);
    const tasks = await this.tenant.client.customerFollowUpTask.findMany({
      where: { businessId: customer.businessId, customerId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        reason: true,
        priority: true,
        status: true,
        dueAt: true,
        assigneeStaffId: true,
        createdByUserId: true,
        completedByUserId: true,
        completedAt: true,
        createdAt: true,
        messageDrafts: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, status: true, createdAt: true },
        },
      },
    });
    const messageKeys = tasks.flatMap((task) =>
      task.messageDrafts.map(
        (draft) => `${MESSAGE_SEND_IDEMPOTENCY_PREFIX}${draft.id}`,
      ),
    );
    const messages = messageKeys.length
      ? await this.tenant.client.message.findMany({
          where: {
            businessId: customer.businessId,
            idempotencyKey: { in: messageKeys },
          },
          select: { idempotencyKey: true, status: true },
        })
      : [];
    const statusByKey = new Map(
      messages.map((message) => [message.idempotencyKey, message.status]),
    );
    return tasks.map(({ messageDrafts, ...task }) => ({
      ...task,
      linkedMessages: messageDrafts.map((draft) => {
        const messageStatus =
          statusByKey.get(`${MESSAGE_SEND_IDEMPOTENCY_PREFIX}${draft.id}`) ??
          null;
        return {
          messageDraftId: draft.id,
          draftStatus: draft.status,
          messageStatus,
          createdAt: draft.createdAt,
          providerDeliveryConfirmed:
            messageStatus === 'delivered' || messageStatus === 'read',
        };
      }),
    }));
  }

  /**
   * Turn one current, event-triggered customer review into a human CRM task.
   * This is an explicit manager action: it never drafts or sends a message.
   */
  private async followUpTaskContext(
    businessId: string,
    recommendationId: string,
  ) {
    const recommendation =
      await this.tenant.client.specialistAgentRecommendation.findFirst({
        where: {
          id: recommendationId,
          businessId,
          agentKey: CUSTOMER_AGENT_KEY,
        },
        select: {
          id: true,
          runId: true,
          run: {
            select: {
              businessId: true,
              agentKey: true,
              triggerType: true,
              inputRefs: true,
            },
          },
          evidence: {
            where: {
              sourceType: 'canonical_service',
              resourceType: {
                in: Object.keys(CUSTOMER_EVENT_FOLLOW_UP_SOURCES),
              },
            },
            select: { id: true, resourceType: true, resourceId: true },
            orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
            take: 1,
          },
        },
      });
    const source = recommendation?.evidence[0];
    const sourceContract = source
      ? CUSTOMER_EVENT_FOLLOW_UP_SOURCES[
          source.resourceType as keyof typeof CUSTOMER_EVENT_FOLLOW_UP_SOURCES
        ]
      : undefined;
    if (
      !recommendation ||
      recommendation.run.businessId !== businessId ||
      recommendation.run.agentKey !== CUSTOMER_AGENT_KEY ||
      recommendation.run.triggerType !== 'event' ||
      !source ||
      !sourceContract
    ) {
      throw invalid(
        'CUSTOMER_AGENT_FOLLOW_UP_SOURCE_INVALID',
        'This recommendation does not reference a supported current customer event in this business.',
        HttpStatus.NOT_FOUND,
      );
    }

    const triggerRefs = Array.isArray(recommendation.run.inputRefs)
      ? recommendation.run.inputRefs
      : [];
    const trigger = triggerRefs.find((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
      const ref = value as Record<string, unknown>;
      return (
        ref.sourceModule === sourceContract.sourceModule &&
        ref.entityType === sourceContract.entityType &&
        ref.entityId === source.resourceId
      );
    }) as Record<string, unknown> | undefined;
    const sourceVersion =
      typeof trigger?.entityVersion === 'string'
        ? new Date(trigger.entityVersion)
        : null;
    if (!sourceVersion || !Number.isFinite(sourceVersion.getTime())) {
      throw invalid(
        'CUSTOMER_AGENT_FOLLOW_UP_SOURCE_STALE',
        'The customer event source version is unavailable. Review the current source before creating a task.',
      );
    }

    let sourceIsCurrent = false;
    let customer:
      { id: string; status: string; phone: string } | null | undefined;
    if (source.resourceType === 'delivery_contact_context') {
      const delivery = await this.tenant.client.delivery.findFirst({
        where: {
          id: source.resourceId,
          businessId,
          status: 'failed',
          updatedAt: sourceVersion,
        },
        select: {
          order: {
            select: {
              customer: {
                select: { id: true, status: true, phone: true },
              },
            },
          },
        },
      });
      sourceIsCurrent = Boolean(delivery);
      customer = delivery?.order.customer;
    } else {
      const status =
        source.resourceType === 'appointment_no_show_contact_context'
          ? 'no_show'
          : 'cancelled';
      const appointment = await this.tenant.client.appointment.findFirst({
        where: {
          id: source.resourceId,
          businessId,
          status,
          updatedAt: sourceVersion,
        },
        select: {
          customer: {
            select: { id: true, status: true, phone: true },
          },
        },
      });
      sourceIsCurrent = Boolean(appointment);
      customer = appointment?.customer;
    }
    if (
      !sourceIsCurrent ||
      !customer ||
      customer.status !== 'active' ||
      customer.phone === `erased-${customer.id}`
    ) {
      throw invalid(
        'CUSTOMER_AGENT_FOLLOW_UP_SOURCE_STALE',
        'The source event or customer changed after this review. Refresh the review before creating a task.',
      );
    }

    const sourceVersionKey = sourceVersion.getTime();
    return {
      recommendationId: recommendation.id,
      runId: recommendation.runId,
      customerId: customer.id,
      title: sourceContract.title,
      reason: sourceContract.reason,
      idempotencyKey: `${sourceContract.idempotencyPrefix}:${source.resourceId}:${sourceVersionKey}`,
      sourceType: source.resourceType,
      sourceId: source.resourceId,
      sourceEvidenceId: recommendation.evidence[0].id,
      sourceVersion: sourceVersion.toISOString(),
      auditSource: sourceContract.auditSource,
    };
  }

  /**
   * Save an owner-reviewable action for an internal task. The proposal contains no customer
   * identifiers and cannot draft or send a message; source freshness is checked again at execute.
   */
  async proposeTaskFromRecommendation(
    businessId: string,
    actorUserId: string,
    recommendationId: string,
  ) {
    await this.enabled(businessId, true);
    const context = await this.followUpTaskContext(
      businessId,
      recommendationId,
    );
    const action = await this.tenant.client.$transaction((tx) =>
      createSpecialistAgentAction(tx, {
        actorUserId,
        reason: context.reason,
        eventType: 'customer_follow_up_task_proposed',
        data: {
          businessId,
          runId: context.runId,
          recommendationId: context.recommendationId,
          agentKey: CUSTOMER_AGENT_KEY,
          moduleId: '7',
          actionType: 'customer_follow_up_task',
          canonicalResourceType: 'specialist_agent_recommendation',
          canonicalResourceId: context.recommendationId,
          expectedVersion: 1,
          expectedPostcondition: {
            canonicalResourceType: 'CustomerFollowUpTask',
            taskStatus: 'open',
            sourceVersion: context.sourceVersion,
            sendsMessage: false,
          },
          proposedPayload: {
            title: context.title,
            reason: context.reason,
            priority: 'normal',
            dueAt: null,
            sendsMessage: false,
          },
          reason: context.reason,
          evidenceRefs: [
            {
              sourceType: 'canonical_service',
              evidenceId: context.sourceEvidenceId,
              resourceType: context.sourceType,
              resourceId: context.sourceId,
              sourceVersion: context.sourceVersion,
            },
          ],
          assumptions: [],
          riskTier: 'low',
          riskDescription:
            'Creates one internal CRM task after owner approval. It does not contact the customer.',
          policyResult: {
            approvalRequired: true,
            agentEnabled: true,
            eventSourceCurrent: true,
            sendsMessage: false,
          },
          permissionResult: {
            customerAgentRun: true,
            customersManage: true,
          },
          requiredApproval: true,
          requiredApproverRole: 'owner',
          idempotencyKeyHash: specialistAgentActionIdempotencyHash({
            businessId,
            agentKey: CUSTOMER_AGENT_KEY,
            actionType: 'customer_follow_up_task',
            recommendationId: context.recommendationId,
          }),
          correlationId: `customer-follow-up:${context.recommendationId}`,
          state: 'approval_required',
          createdByUserId: actorUserId,
        },
      }),
    );
    return {
      id: action.id,
      actionType: action.actionType,
      state: action.state,
      expectedVersion: action.expectedVersion,
      createdAt: action.createdAt,
    };
  }

  async createTaskFromRecommendation(
    businessId: string,
    actorUserId: string,
    recommendationId: string,
  ) {
    await this.enabled(businessId, true);
    const context = await this.followUpTaskContext(
      businessId,
      recommendationId,
    );
    return this.createTask(
      businessId,
      actorUserId,
      context.customerId,
      {
        title: context.title,
        reason: context.reason,
        priority: 'normal',
        idempotencyKey: context.idempotencyKey,
      },
      {
        source: context.auditSource,
        recommendationId: context.recommendationId,
      },
    );
  }

  async createTask(
    businessId: string,
    actorUserId: string,
    customerId: string,
    input: CreateCustomerFollowUpTaskDto,
    auditContext: {
      source?: string;
      recommendationId?: string;
    } = {},
  ) {
    await this.enabled(businessId, true);
    const customer = await this.customer(customerId);
    if (customer.businessId !== businessId)
      throw invalid(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );
    if (customer.status !== 'active')
      throw invalid(
        'CUSTOMER_FOLLOW_UP_INACTIVE',
        'A follow-up task cannot be created for an inactive customer.',
      );
    const title = input.title.trim();
    const reason = input.reason.trim();
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (!title || !reason || (dueAt && Number.isNaN(dueAt.getTime())))
      throw invalid(
        'CUSTOMER_FOLLOW_UP_INVALID',
        'Enter a task title, a reason and a valid optional due date.',
        HttpStatus.BAD_REQUEST,
      );
    if (input.assigneeStaffId) {
      const assignee = await this.tenant.client.businessUser.findFirst({
        where: {
          id: input.assigneeStaffId,
          businessId,
          active: true,
        },
        select: { id: true },
      });
      if (!assignee)
        throw invalid(
          'CUSTOMER_FOLLOW_UP_ASSIGNEE_INVALID',
          'Choose an active team member in this business.',
          HttpStatus.BAD_REQUEST,
        );
    }
    const priority = input.priority ?? 'normal';
    const normalized = {
      customerId,
      title,
      reason,
      priority,
      dueAt: dueAt?.toISOString() ?? null,
      assigneeStaffId: input.assigneeStaffId ?? null,
    };
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    const unique = {
      businessId_idempotencyKey: {
        businessId,
        idempotencyKey: input.idempotencyKey,
      },
    };
    try {
      return await this.tenant.client.$transaction(async (tx) => {
        await this.lockCustomerForWrite(
          tx as unknown as Prisma.TransactionClient,
          businessId,
          customerId,
          'task',
        );
        const existing = await tx.customerFollowUpTask.findUnique({
          where: unique,
        });
        if (existing) {
          if (existing.payloadHash !== payloadHash)
            throw invalid(
              'CUSTOMER_FOLLOW_UP_IDEMPOTENCY_CONFLICT',
              'This idempotency key was already used for a different task.',
            );
          return existing;
        }
        const task = await tx.customerFollowUpTask.create({
          data: {
            businessId,
            customerId,
            title,
            reason,
            priority,
            dueAt,
            assigneeStaffId: input.assigneeStaffId ?? null,
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            createdByUserId: actorUserId,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'customer_agent.follow_up_task_created',
            entity: 'CustomerFollowUpTask',
            entityId: task.id,
            after: {
              customerId,
              priority,
              dueAt: dueAt?.toISOString() ?? null,
              assigneeStaffId: input.assigneeStaffId ?? null,
              source: auditContext.source ?? 'customer_profile_intelligence',
              ...(auditContext.recommendationId
                ? { sourceRecommendationId: auditContext.recommendationId }
                : {}),
              containsMessageContent: false,
            },
          },
        });
        return task;
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await this.tenant.client.customerFollowUpTask.findUnique({
        where: unique,
      });
      if (!raced || raced.payloadHash !== payloadHash)
        throw invalid(
          'CUSTOMER_FOLLOW_UP_IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different task.',
        );
      return raced;
    }
  }

  async listMessageDrafts(customerId: string) {
    const customer = await this.customer(customerId);
    await this.enabled(customer.businessId);
    const drafts = await this.tenant.client.messageDraft.findMany({
      where: {
        businessId: customer.businessId,
        customerId,
        sourceKey: { startsWith: `${MESSAGE_DRAFT_PREFIX}${customerId}:` },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        body: true,
        status: true,
        createdAt: true,
        sourceKey: true,
        customerFollowUpTaskId: true,
      },
    });
    if (drafts.length === 0) return [];
    const messageKeys = drafts.map(
      (draft) => `${MESSAGE_SEND_IDEMPOTENCY_PREFIX}${draft.id}`,
    );
    const messages = await this.tenant.client.message.findMany({
      where: {
        businessId: customer.businessId,
        idempotencyKey: { in: messageKeys },
      },
      select: { idempotencyKey: true, status: true },
    });
    const statusByKey = new Map(
      messages.map((message) => [message.idempotencyKey, message.status]),
    );
    return drafts.map((draft) =>
      messageDraftView(
        draft,
        statusByKey.get(`${MESSAGE_SEND_IDEMPOTENCY_PREFIX}${draft.id}`) ??
          null,
      ),
    );
  }

  async previewMessageDraft(
    businessId: string,
    customerId: string,
    draftId: string,
  ) {
    await this.assertMessageDraftEligible(businessId, customerId);
    const draft = await this.tenant.client.messageDraft.findFirst({
      where: {
        id: draftId,
        businessId,
        customerId,
        sourceKey: { startsWith: `${MESSAGE_DRAFT_PREFIX}${customerId}:` },
        status: 'draft',
      },
    });
    if (!draft)
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_NOT_EDITABLE',
        'This customer message draft is unavailable or has already been queued.',
        HttpStatus.NOT_FOUND,
      );

    const preview = await this.sendGate.preview({
      businessId,
      customerId,
      templateKey: 'campaign',
      variables: { body: draft.body },
      customBody: draft.body,
      requireChannelConsent: true,
    });
    return {
      ...preview,
      deliveryState: 'not_queued' as const,
      disclosure:
        'This preview does not create a message. Send eligibility is checked again when you explicitly queue it; provider delivery is reported separately.',
    };
  }

  async queueMessageDraft(
    businessId: string,
    actorUserId: string,
    customerId: string,
    draftId: string,
  ) {
    const customer = await this.customer(customerId);
    await this.enabled(businessId, true);
    if (customer.businessId !== businessId)
      throw invalid(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );

    const draft = await this.tenant.client.messageDraft.findFirst({
      where: {
        id: draftId,
        businessId,
        customerId,
        sourceKey: { startsWith: `${MESSAGE_DRAFT_PREFIX}${customerId}:` },
        status: { in: ['draft', 'queued'] },
      },
    });
    if (!draft)
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_NOT_EDITABLE',
        'This customer message draft is unavailable or cannot be queued.',
        HttpStatus.NOT_FOUND,
      );

    const idempotencyKey = `${MESSAGE_SEND_IDEMPOTENCY_PREFIX}${draft.id}`;
    if (draft.status === 'queued') {
      const existing = await this.tenant.client.message.findFirst({
        where: { businessId, idempotencyKey },
        select: { id: true, status: true },
      });
      if (existing)
        return {
          draftId: draft.id,
          messageId: existing.id,
          messageStatus: existing.status,
          queued: existing.status === 'queued',
        };
    }

    try {
      await this.assertMessageDraftEligible(businessId, customerId);
      const message = await this.sendGate.send({
        businessId,
        customerId,
        templateKey: 'campaign',
        variables: { body: draft.body },
        customBody: draft.body,
        idempotencyKey,
        requireChannelConsent: true,
      });
      await this.tenant.client.$transaction(async (tx) => {
        const changed = await tx.messageDraft.updateMany({
          where: {
            id: draft.id,
            businessId,
            customerId,
            status: 'draft',
          },
          data: { status: 'queued' },
        });
        if (changed.count > 0) {
          await tx.auditLog.create({
            data: {
              businessId,
              actorUserId,
              action: 'customer_agent.message_draft_queued',
              entity: 'MessageDraft',
              entityId: draft.id,
              before: { status: 'draft' },
              after: {
                status: 'queued',
                messageId: message.id,
                messageStatus: message.status,
                channel: message.channel,
                templateKey: message.templateKey,
                explicitHumanQueueAction: true,
                providerDeliveryConfirmed: false,
              },
            },
          });
        }
      });
      return {
        draftId: draft.id,
        messageId: message.id,
        messageStatus: message.status,
        queued: message.status === 'queued',
      };
    } catch (error) {
      const response =
        error instanceof AppException ? error.getResponse() : undefined;
      const code =
        response && typeof response === 'object' && 'code' in response
          ? (response as { code?: unknown }).code
          : 'MESSAGE_QUEUE_FAILED';
      const persistedMessage = await this.tenant.client.message
        .findFirst({
          where: { businessId, idempotencyKey },
          select: { status: true },
        })
        .catch(() => null);
      await this.tenant.client.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'customer_agent.message_draft_queue_refused',
          entity: 'MessageDraft',
          entityId: draft.id,
          after: {
            reasonCode:
              typeof code === 'string'
                ? code.slice(0, 64)
                : 'MESSAGE_QUEUE_FAILED',
            messageCreated: persistedMessage !== null,
            messageStatus: persistedMessage?.status ?? null,
            providerDeliveryConfirmed: false,
          },
        },
      });
      throw error;
    }
  }

  async createMessageDraft(
    businessId: string,
    actorUserId: string,
    customerId: string,
    input: CreateCustomerMessageDraftDto,
  ) {
    await this.assertMessageDraftEligible(businessId, customerId);

    const body = input.body.trim();
    const followUpTaskId = input.followUpTaskId?.trim() || null;
    if (!body)
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_INVALID',
        'Enter message text before saving the draft.',
        HttpStatus.BAD_REQUEST,
      );
    const sourceKey = `${MESSAGE_DRAFT_PREFIX}${customerId}:manual:${input.idempotencyKey}`;
    try {
      return await this.tenant.client.$transaction(async (tx) => {
        const locked = await this.lockCustomerForWrite(
          tx as unknown as Prisma.TransactionClient,
          businessId,
          customerId,
          'message',
        );
        const existing = await tx.messageDraft.findUnique({
          where: { businessId_sourceKey: { businessId, sourceKey } },
        });
        if (existing) {
          if (
            existing.body !== body ||
            existing.customerId !== customerId ||
            existing.customerFollowUpTaskId !== followUpTaskId
          )
            throw invalid(
              'CUSTOMER_MESSAGE_DRAFT_IDEMPOTENCY_CONFLICT',
              'This idempotency key was already used for different draft text.',
            );
          return messageDraftView(existing);
        }
        await this.lockOpenFollowUpTask(
          tx as unknown as Prisma.TransactionClient,
          businessId,
          customerId,
          followUpTaskId,
        );
        const draft = await tx.messageDraft.create({
          data: {
            businessId,
            customerId,
            sourceKey,
            body,
            status: 'draft',
            customerFollowUpTaskId: followUpTaskId,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'customer_agent.message_draft_created',
            entity: 'MessageDraft',
            entityId: draft.id,
            after: {
              customerId,
              followUpTaskId,
              status: draft.status,
              bodyLength: body.length,
              sent: false,
              marketingConsentAtSave: locked.consentMarketing,
              optedOutAtSave: locked.optedOut,
            },
          },
        });
        return messageDraftView(draft);
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await this.tenant.client.messageDraft.findUnique({
        where: { businessId_sourceKey: { businessId, sourceKey } },
      });
      if (
        !raced ||
        raced.body !== body ||
        raced.customerId !== customerId ||
        raced.customerFollowUpTaskId !== followUpTaskId
      )
        throw invalid(
          'CUSTOMER_MESSAGE_DRAFT_IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for different draft text.',
        );
      return messageDraftView(raced);
    }
  }

  private async lockOpenFollowUpTask(
    tx: Prisma.TransactionClient,
    businessId: string,
    customerId: string,
    followUpTaskId: string | null,
  ) {
    if (!followUpTaskId) return;
    const tasks = await tx.$queryRaw<
      Array<{ id: string; status: string; customerId: string }>
    >`
      SELECT id, status, customer_id AS customerId
      FROM customer_follow_up_tasks
      WHERE id = ${followUpTaskId}
        AND business_id = ${businessId}
        AND customer_id = ${customerId}
      FOR UPDATE
    `;
    const task = tasks[0];
    if (!task)
      throw invalid(
        'CUSTOMER_FOLLOW_UP_NOT_FOUND',
        'Choose an open follow-up task for this customer.',
        HttpStatus.NOT_FOUND,
      );
    if (task.status !== 'open')
      throw invalid(
        'CUSTOMER_FOLLOW_UP_NOT_OPEN',
        'A message draft can only be linked to an open follow-up task.',
      );
  }

  private async assertMessageDraftEligible(
    businessId: string,
    customerId: string,
  ) {
    await this.enabled(businessId, true);
    const customer = await this.customer(customerId);
    if (customer.businessId !== businessId)
      throw invalid(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );
    if (customer.status !== 'active')
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_INACTIVE',
        'A message draft cannot be created for an inactive customer.',
      );
    if (!customer.consentMarketing || customer.optedOut)
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED',
        'Marketing consent is missing or the customer opted out. No message draft was saved.',
        HttpStatus.FORBIDDEN,
      );
    const business = await this.tenant.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business.parentId
        ? business.parent?.disabledModules
        : business.disabledModules,
    );
    if (disabled.includes('unified-inbox'))
      throw invalid(
        'BUSINESS_MODULE_DISABLED',
        'Unified Inbox is disabled for this business.',
        HttpStatus.FORBIDDEN,
      );
    return customer;
  }

  async generateMessageDraft(
    businessId: string,
    actorUserId: string,
    customerId: string,
    input: GenerateCustomerMessageDraftDto,
  ) {
    const customer = await this.assertMessageDraftEligible(
      businessId,
      customerId,
    );
    if (input.purpose === 'winback_follow_up') {
      const lapsedSince = customer.lastVisitAt ?? customer.createdAt;
      const lapsedCutoff = new Date(
        Date.now() - LAPSED_DAYS * 24 * 60 * 60 * 1000,
      );
      if (lapsedSince >= lapsedCutoff)
        throw invalid(
          'CUSTOMER_WINBACK_NOT_LAPSED',
          `A win-back draft requires at least ${LAPSED_DAYS} days without a recorded visit. No draft was generated.`,
          HttpStatus.CONFLICT,
        );
    }
    const sourceKey = `${MESSAGE_DRAFT_PREFIX}${customerId}:ai:${input.idempotencyKey}`;
    const followUpTaskId = input.followUpTaskId?.trim() || null;
    const existing = await this.tenant.client.$transaction(async (tx) => {
      await this.lockCustomerForWrite(
        tx as unknown as Prisma.TransactionClient,
        businessId,
        customerId,
        'message',
      );
      const existingDraft = await tx.messageDraft.findUnique({
        where: { businessId_sourceKey: { businessId, sourceKey } },
      });
      if (existingDraft) {
        if (existingDraft.customerFollowUpTaskId !== followUpTaskId)
          throw invalid(
            'CUSTOMER_MESSAGE_DRAFT_IDEMPOTENCY_CONFLICT',
            'This idempotency key was already used for a different follow-up task.',
          );
        return existingDraft;
      }
      await this.lockOpenFollowUpTask(
        tx as unknown as Prisma.TransactionClient,
        businessId,
        customerId,
        followUpTaskId,
      );
      return null;
    });
    if (existing) return messageDraftView(existing);

    const startedAt = new Date();
    const runReservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenant.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenant.client.specialistAgentRun.findFirst({
          where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
          select: {
            id: true,
            businessId: true,
            agentKey: true,
            agentVersion: true,
            agentConfigVersion: true,
            moduleId: true,
            triggerType: true,
            createdAt: true,
            initiatedByUserId: true,
            idempotencyRequestHash: true,
            status: true,
          },
        }),
      {
        businessId,
        agentKey: CUSTOMER_AGENT_KEY,
        agentVersion: CUSTOMER_AGENT_VERSION,
        moduleId: '7',
        triggerType: 'manual',
        status: 'running',
        initiatedByUserId: actorUserId,
        inputRefs: [
          {
            source: 'Customer Agent message-draft request',
            purpose: input.purpose,
            containsCustomerIdentifier: false,
            containsMessageContent: false,
            sendsMessage: false,
            hasFollowUpTaskLink: followUpTaskId !== null,
          },
        ],
        output: {},
        policyResult: {
          autonomyLevel: 'L0',
          riskTier: 'low',
          createsDraftOnly: true,
          approvalRequiredBeforeSend: true,
          sendsMessages: false,
          includesCustomerIdentifiers: false,
        },
        startedAt,
      },
      input.idempotencyKey,
      {
        customerId,
        purpose: input.purpose,
        actorUserId,
        followUpTaskId,
      },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.tenant.unscoped,
          configBusinessId,
          agentKey,
        ),
    );
    const run = runReservation.run;
    if (runReservation.reused) {
      const replayDraft = await this.tenant.client.messageDraft.findUnique({
        where: { businessId_sourceKey: { businessId, sourceKey } },
      });
      if (replayDraft) return messageDraftView(replayDraft);
      if (run.status === 'running') {
        throw invalid(
          'CUSTOMER_AGENT_DRAFT_GENERATION_IN_PROGRESS',
          'This AI draft request is already running. Wait for it to finish before retrying.',
          HttpStatus.CONFLICT,
        );
      }
      throw invalid(
        'CUSTOMER_AGENT_DRAFT_RUN_INCOMPLETE',
        'The matching AI draft run has no saved draft. Start a new request with a new key.',
        HttpStatus.CONFLICT,
      );
    }

    const failRun = async (code: string, message: string) => {
      const finishedAt = new Date();
      await this.tenant.client.$transaction(async (tx) => {
        await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            errorCode: code,
            errorMessage: message,
            finishedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'failed',
          finishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'customer_agent.message_draft_run_failed',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: {
              agentKey: CUSTOMER_AGENT_KEY,
              status: 'failed',
              errorCode: code,
              sendsMessages: false,
              includesCustomerIdentifiers: false,
            },
          },
        });
      });
    };

    const purposeInstructions = {
      booking_follow_up:
        'Write a brief, polite message inviting the person to reply if they need help with a booking. Do not mention a date, time, service or booking status.',
      order_follow_up:
        'Write a brief, polite check-in about an order. Do not claim shipping, delivery, payment or order status.',
      support_follow_up:
        'Write a brief, empathetic check-in asking whether the person still needs help. Do not claim a support issue was resolved.',
      winback_follow_up:
        'Write a brief, respectful reactivation message inviting the person to return if they wish. Do not claim knowledge of why they have been away, create urgency, or offer a discount or reward.',
      feedback_request:
        'Write a brief, optional request for feedback. Do not offer a discount, reward or incentive.',
      general_follow_up:
        'Write a brief, polite general follow-up inviting the person to reply if they need help.',
    } satisfies Record<GenerateCustomerMessageDraftDto['purpose'], string>;

    let body: string;
    try {
      const result = await this.aiInfra.createMessage(
        businessId,
        'customer_agent',
        {
          system:
            'Write one concise customer message draft in plain text. It is only a draft for staff review and will not be sent by you. No customer name, contact details, order data, notes, business data or conversation history is provided. Never invent a discount, appointment, delivery, resolution, policy or other fact. Do not include placeholders or markdown. Keep it under 80 words.',
          messages: [
            {
              role: 'user',
              content: purposeInstructions[input.purpose],
            },
          ],
          temperature: 0.2,
          maxTokens: 160,
        },
        undefined,
        undefined,
        run.id,
      );
      body = (
        result.content.find((block) => block.type === 'text')?.text ?? ''
      ).trim();
    } catch (error) {
      const response =
        error instanceof AppException ? error.getResponse() : null;
      const appErrorCode =
        typeof response === 'object' && response !== null && 'code' in response
          ? String(response.code)
          : null;
      const failure = describeAiProviderFailure(error);
      const errorCode = appErrorCode ?? failure.code;
      const failureMessage =
        error instanceof AppException
          ? 'AI draft generation failed. No message draft was saved or sent.'
          : `${failure.message} No message was saved or sent.`;
      await failRun(errorCode, failureMessage).catch(() => undefined);
      if (error instanceof AppException) throw error;
      throw invalid(errorCode, failureMessage, HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!body || body.length > 2000) {
      await failRun(
        'CUSTOMER_AGENT_AI_EMPTY_RESPONSE',
        'AI did not return a usable draft. No message draft was saved or sent.',
      );
      throw invalid(
        'CUSTOMER_AGENT_AI_EMPTY_RESPONSE',
        'AI did not return a usable draft. No message was saved or sent.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      return await this.tenant.client.$transaction(async (tx) => {
        await this.lockCustomerForWrite(
          tx as unknown as Prisma.TransactionClient,
          businessId,
          customerId,
          'message',
        );
        const existing = await tx.messageDraft.findUnique({
          where: { businessId_sourceKey: { businessId, sourceKey } },
        });
        if (existing) {
          if (existing.customerFollowUpTaskId !== followUpTaskId)
            throw invalid(
              'CUSTOMER_MESSAGE_DRAFT_IDEMPOTENCY_CONFLICT',
              'This idempotency key was already used for a different follow-up task.',
            );
          return messageDraftView(existing);
        }
        await this.lockOpenFollowUpTask(
          tx as unknown as Prisma.TransactionClient,
          businessId,
          customerId,
          followUpTaskId,
        );
        const draft = await tx.messageDraft.create({
          data: {
            businessId,
            customerId,
            sourceKey,
            body,
            status: 'draft',
            customerFollowUpTaskId: followUpTaskId,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'customer_agent.ai_message_draft_created',
            entity: 'MessageDraft',
            entityId: draft.id,
            after: {
              customerId,
              status: draft.status,
              purpose: input.purpose,
              followUpTaskId,
              bodyLength: body.length,
              providerInputContainsCustomerData: false,
              sent: false,
            },
          },
        });
        const runFinishedAt = new Date();
        await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            output: {
              action: 'customer_message_draft_created',
              messageDraftId: draft.id,
              purpose: input.purpose,
              followUpTaskId,
              draftBodyLength: body.length,
              sent: false,
              providerInputContainsCustomerData: false,
            },
            finishedAt: runFinishedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'completed',
          runFinishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'customer_agent.message_draft_run_completed',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: {
              agentKey: CUSTOMER_AGENT_KEY,
              status: 'completed',
              messageDraftId: draft.id,
              draftBodyLength: body.length,
              sent: false,
              includesCustomerIdentifiers: false,
            },
          },
        });
        return messageDraftView(draft);
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        await failRun(
          'CUSTOMER_AGENT_DRAFT_SAVE_FAILED',
          'The AI response could not be saved as a customer draft. No message was sent.',
        ).catch(() => undefined);
        throw error;
      }
      const raced = await this.tenant.client.messageDraft.findUnique({
        where: { businessId_sourceKey: { businessId, sourceKey } },
      });
      if (raced) {
        await this.assertMessageDraftEligible(businessId, customerId);
        const completedAt = new Date();
        await this.tenant.client.$transaction(async (tx) => {
          await tx.specialistAgentRun.update({
            where: { id: run.id },
            data: {
              status: 'completed',
              output: {
                action: 'customer_message_draft_created',
                messageDraftId: raced.id,
                purpose: input.purpose,
                followUpTaskId,
                draftBodyLength: raced.body.length,
                sent: false,
                providerInputContainsCustomerData: false,
              },
              finishedAt: completedAt,
            },
          });
          await recordSpecialistAgentRunTerminalEvent(
            tx,
            run,
            'completed',
            completedAt,
          );
          await tx.auditLog.create({
            data: {
              businessId,
              actorUserId,
              action: 'customer_agent.message_draft_run_completed',
              entity: 'SpecialistAgentRun',
              entityId: run.id,
              after: {
                agentKey: CUSTOMER_AGENT_KEY,
                status: 'completed',
                messageDraftId: raced.id,
                draftBodyLength: raced.body.length,
                sent: false,
                includesCustomerIdentifiers: false,
              },
            },
          });
        });
        return messageDraftView(raced);
      }
      await failRun(
        'CUSTOMER_AGENT_DRAFT_SAVE_FAILED',
        'The AI response could not be saved as a customer draft. No message was sent.',
      ).catch(() => undefined);
      throw error;
    }
  }

  async updateMessageDraft(
    businessId: string,
    actorUserId: string,
    customerId: string,
    draftId: string,
    input: UpdateCustomerMessageDraftDto,
  ) {
    await this.assertMessageDraftEligible(businessId, customerId);
    const draft = await this.tenant.client.messageDraft.findFirst({
      where: {
        id: draftId,
        businessId,
        customerId,
        sourceKey: { startsWith: `${MESSAGE_DRAFT_PREFIX}${customerId}:` },
        status: 'draft',
      },
    });
    if (!draft)
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_NOT_EDITABLE',
        'This customer message draft is unavailable or no longer editable.',
        HttpStatus.NOT_FOUND,
      );
    const body = input.body.trim();
    if (!body)
      throw invalid(
        'CUSTOMER_MESSAGE_DRAFT_INVALID',
        'Enter message text before saving the reviewed draft.',
        HttpStatus.BAD_REQUEST,
      );

    const updated = await this.tenant.client.$transaction(async (tx) => {
      const saved = await tx.messageDraft.update({
        where: { id: draft.id },
        data: { body },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'customer_agent.message_draft_updated',
          entity: 'MessageDraft',
          entityId: draft.id,
          before: {
            status: draft.status,
            bodyLength: draft.body.length,
          },
          after: {
            status: saved.status,
            bodyLength: body.length,
            generatedByAgent: draft.sourceKey.includes(':ai:'),
            sent: false,
          },
        },
      });
      return saved;
    });
    return messageDraftView(updated);
  }

  async completeTask(
    businessId: string,
    actorUserId: string,
    taskId: string,
    inputOutcome?: CustomerFollowUpOutcome,
  ) {
    const task = await this.tenant.client.customerFollowUpTask.findFirst({
      where: { id: taskId, businessId },
    });
    if (!task)
      throw invalid(
        'CUSTOMER_FOLLOW_UP_NOT_FOUND',
        'Customer follow-up task not found.',
        HttpStatus.NOT_FOUND,
      );
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
    )
      throw invalid(
        'BUSINESS_MODULE_DISABLED',
        'Customers is disabled for this business.',
        HttpStatus.FORBIDDEN,
      );
    const canManage = await this.policies.actorCan(
      CAPABILITIES.CUSTOMERS_MANAGE,
    );
    const role = this.policies.actorRole();
    let assignedStaffCanComplete = false;
    if (!canManage && role === Role.staff && task.assigneeStaffId) {
      const membership = await this.tenant.client.businessUser.findFirst({
        where: { businessId, userId: actorUserId, active: true },
        select: { id: true },
      });
      assignedStaffCanComplete = membership?.id === task.assigneeStaffId;
    }
    if (!canManage && !assignedStaffCanComplete)
      throw invalid(
        'CUSTOMER_FOLLOW_UP_FORBIDDEN',
        'Only a Customers manager or the assigned staff member can complete this task.',
        HttpStatus.FORBIDDEN,
      );
    if (task.status === 'completed') {
      if (!inputOutcome || task.completionOutcome === inputOutcome) return task;
      if (task.completionOutcome) {
        throw invalid(
          'CUSTOMER_FOLLOW_UP_OUTCOME_ALREADY_RECORDED',
          'A follow-up outcome is already recorded and cannot be overwritten.',
        );
      }
      return this.tenant.client.$transaction(async (tx) => {
        const updated = await tx.customerFollowUpTask.update({
          where: { id: task.id },
          data: { completionOutcome: inputOutcome },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'customer_agent.follow_up_outcome_recorded',
            entity: 'CustomerFollowUpTask',
            entityId: task.id,
            before: { completionOutcome: null },
            after: {
              completionOutcome: inputOutcome,
              customerId: task.customerId,
              providerConfirmed: false,
            },
          },
        });
        return updated;
      });
    }
    if (task.status !== 'open')
      throw invalid(
        'CUSTOMER_FOLLOW_UP_NOT_OPEN',
        'Only an open customer follow-up task can be completed.',
      );
    return this.tenant.client.$transaction(async (tx) => {
      const updated = await tx.customerFollowUpTask.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          completedByUserId: actorUserId,
          completedAt: new Date(),
          completionOutcome: inputOutcome ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'customer_agent.follow_up_task_completed',
          entity: 'CustomerFollowUpTask',
          entityId: task.id,
          before: { status: task.status },
          after: {
            status: updated.status,
            customerId: task.customerId,
            completionOutcome: inputOutcome ?? null,
            providerConfirmed: false,
          },
        },
      });
      return updated;
    });
  }

  async followUpOutcomeSummary(businessId: string) {
    await this.enabled(businessId);
    return this.readFollowUpOutcomeSummary(businessId);
  }

  /** Internal read for the already-authorized Customer Agent review path. */
  async followUpOutcomeSummaryForAgent(
    businessId: string,
  ): Promise<CustomerFollowUpOutcomeSummary> {
    return this.readFollowUpOutcomeSummary(businessId);
  }

  /** Aggregate canonical Message states for recent CRM-linked follow-up drafts. */
  async followUpMessageDeliverySummaryForAgent(
    businessId: string,
  ): Promise<CustomerFollowUpMessageDeliverySummary> {
    const observedAt = new Date();
    const from = new Date(observedAt.getTime() - 90 * 86_400_000);
    const drafts = await this.tenant.client.messageDraft.findMany({
      where: {
        businessId,
        customerFollowUpTaskId: { not: null },
        createdAt: { gte: from, lte: observedAt },
        customerFollowUpTask: { is: { businessId } },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const idempotencyKeys = drafts.map(
      (draft) => `${MESSAGE_SEND_IDEMPOTENCY_PREFIX}${draft.id}`,
    );
    const messages = idempotencyKeys.length
      ? await this.tenant.client.message.findMany({
          where: { businessId, idempotencyKey: { in: idempotencyKeys } },
          select: { idempotencyKey: true, status: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      : [];
    const statusByKey = new Map(
      messages.map((message) => [message.idempotencyKey, message.status]),
    );
    let providerConfirmedDeliveredOrReadCount = 0;
    let providerReportedFailedCount = 0;
    let queuedOrSentUnconfirmedCount = 0;
    let noCanonicalMessageCount = 0;
    let otherCanonicalStatusCount = 0;
    for (const key of idempotencyKeys) {
      const status = statusByKey.get(key);
      if (!status) {
        noCanonicalMessageCount += 1;
      } else if (status === 'delivered' || status === 'read') {
        providerConfirmedDeliveredOrReadCount += 1;
      } else if (status === 'failed') {
        providerReportedFailedCount += 1;
      } else if (status === 'queued' || status === 'sent') {
        queuedOrSentUnconfirmedCount += 1;
      } else {
        otherCanonicalStatusCount += 1;
      }
    }
    return {
      windowDays: 90,
      from: from.toISOString(),
      observedAt: observedAt.toISOString(),
      linkedDraftCount: drafts.length,
      canonicalMessageCount: messages.length,
      providerConfirmedDeliveredOrReadCount,
      providerReportedFailedCount,
      queuedOrSentUnconfirmedCount,
      noCanonicalMessageCount,
      otherCanonicalStatusCount,
      note: 'Counts use CRM-linked message drafts created in this window and the current canonical Message status. Delivered/read are provider-confirmed; queued/sent are not confirmed delivery, and staff task outcomes are reported separately.',
    };
  }

  private async readFollowUpOutcomeSummary(
    businessId: string,
  ): Promise<CustomerFollowUpOutcomeSummary> {
    const observedAt = new Date();
    const from = new Date(observedAt.getTime() - 90 * 86_400_000);
    const where = {
      businessId,
      status: 'completed',
      completedAt: { gte: from, lte: observedAt },
    };
    const [completedCount, grouped] = await Promise.all([
      this.tenant.client.customerFollowUpTask.count({ where }),
      this.tenant.client.customerFollowUpTask.groupBy({
        by: ['completionOutcome'],
        where,
        _count: { _all: true },
      }),
    ]);
    const outcomes = Object.fromEntries(
      CUSTOMER_FOLLOW_UP_OUTCOMES.map((outcome) => [outcome, 0]),
    ) as Record<CustomerFollowUpOutcome, number>;
    let recordedCount = 0;
    for (const row of grouped) {
      if (!row.completionOutcome) continue;
      outcomes[row.completionOutcome as CustomerFollowUpOutcome] =
        row._count._all;
      recordedCount += row._count._all;
    }
    return {
      windowDays: 90,
      from: from.toISOString(),
      observedAt: observedAt.toISOString(),
      completedCount,
      recordedCount,
      notRecordedCount: completedCount - recordedCount,
      outcomes,
      note: 'Outcomes are staff-recorded and are not provider-confirmed message delivery or independently verified customer contact.',
    };
  }
}
