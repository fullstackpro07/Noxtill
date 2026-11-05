import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import type { SpecialistAgentPersistedKey } from '../common/agents/specialist-agent-registry';
import { CustomerSegmentDraftsService } from '../customers/customer-segment-drafts.service';
import { CustomerAgentActionsService } from '../customers/customer-agent-actions.service';
import { ProcurementService } from '../procurement/procurement.service';
import { CommerceRfqsService } from '../commerce/commerce-rfqs.service';
import { transitionSpecialistAgentAction } from '../common/agents/specialist-agent-action.util';
import type { SpecialistAgentActionState } from '../common/agents/specialist-agent-action.util';
import { DecideSpecialistAgentActionDto } from './dto/decide-specialist-agent-action.dto';
import { ListSpecialistAgentActionsDto } from './dto/list-specialist-agent-actions.dto';

const SPECIALIST_ACTION_SAFE_SELECT = {
  id: true,
  runId: true,
  recommendationId: true,
  agentKey: true,
  moduleId: true,
  actionType: true,
  canonicalResourceType: true,
  canonicalResourceId: true,
  expectedVersion: true,
  riskTier: true,
  requiredApproval: true,
  requiredApproverRole: true,
  state: true,
  executionAttemptCount: true,
  canonicalOperationId: true,
  errorCode: true,
  correlationId: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  executedAt: true,
  verifiedAt: true,
  closedAt: true,
} satisfies Prisma.SpecialistAgentActionSelect;

@Injectable()
export class SpecialistAgentActionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly procurement: ProcurementService,
    private readonly commerceRfqs: CommerceRfqsService,
    private readonly customerSegments: CustomerSegmentDraftsService,
    private readonly customerActions: CustomerAgentActionsService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

  private async actionForDecision(businessId: string, actionId: string) {
    const action =
      await this.tenantPrisma.client.specialistAgentAction.findFirst({
        where: { businessId, id: actionId },
        select: {
          id: true,
          agentKey: true,
          actionType: true,
          expectedVersion: true,
          canonicalResourceType: true,
          canonicalResourceId: true,
          canonicalOperationId: true,
          state: true,
        },
      });
    if (!action) {
      throw new AppException(
        'SPECIALIST_ACTION_NOT_FOUND',
        'The specialist action is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    return action;
  }

  private requireActionState(action: { state: string }, state: string) {
    if (action.state !== state) {
      throw new AppException(
        'SPECIALIST_ACTION_STATE_CONFLICT',
        `This action is ${action.state} and cannot be used for this operation. Refresh the action and review its current state.`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private requireInventoryActionVersion(
    action: {
      actionType: string;
      expectedVersion: number | null;
    },
    suppliedVersion: number | undefined,
  ) {
    if (
      action.actionType !== 'inventory_reorder_request' ||
      action.expectedVersion === null ||
      suppliedVersion !== action.expectedVersion
    ) {
      throw new AppException(
        'SPECIALIST_ACTION_VERSION_CONFLICT',
        'This Inventory action must be decided against its exact current proposal version. Refresh the action and review the Procurement request again.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private isCustomerFollowUpAction(action: {
    agentKey: string;
    actionType: string;
    canonicalResourceType: string;
  }) {
    return (
      action.agentKey === 'customer_intelligence' &&
      action.actionType === 'customer_follow_up_task' &&
      action.canonicalResourceType === 'specialist_agent_recommendation'
    );
  }

  private requireCustomerFollowUpActionVersion(
    action: { expectedVersion: number | null },
    suppliedVersion: number | undefined,
  ) {
    if (
      action.expectedVersion === null ||
      suppliedVersion !== action.expectedVersion
    ) {
      throw new AppException(
        'SPECIALIST_ACTION_VERSION_CONFLICT',
        'This Customer follow-up task must be decided against the exact proposal version shown in the review.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async decideCustomerFollowUpAction(input: {
    businessId: string;
    actorUserId: string;
    actionId: string;
    fromState: 'approval_required';
    toState: 'approved' | 'rejected' | 'cancelled';
    reason: string;
    update: Prisma.SpecialistAgentActionUpdateManyMutationInput;
    eventType: string;
  }) {
    await this.tenantPrisma.client.$transaction(async (tx) => {
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: input.fromState,
        toState: input.toState,
        actorUserId: input.actorUserId,
        reason: input.reason,
        eventType: input.eventType,
        update: input.update,
      });
    });
    return this.get(input.businessId, input.actionId);
  }

  private async executeCustomerFollowUpAction(input: {
    businessId: string;
    actorUserId: string;
    actionId: string;
    recommendationId: string;
  }) {
    // The canonical CRM service rechecks the source version, customer status, agent policy and
    // idempotency key before creating the internal task. A retry after a lost response returns
    // the same task instead of creating a duplicate.
    const task = await this.customerActions.createTaskFromRecommendation(
      input.businessId,
      input.actorUserId,
      input.recommendationId,
    );

    await this.tenantPrisma.client.$transaction(async (tx) => {
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: 'approved',
        toState: 'execution_queued',
        actorUserId: input.actorUserId,
        eventType: 'execution_queued',
        reason: 'Owner approved creation of the internal CRM follow-up task.',
        update: { executionAttemptCount: { increment: 1 } },
      });
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: 'execution_queued',
        toState: 'executing',
        actorUserId: input.actorUserId,
        eventType: 'execution_started',
        reason:
          'Delegated task creation to the canonical Customer CRM service.',
        update: { executedByUserId: input.actorUserId },
      });
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: 'executing',
        toState: 'succeeded',
        actorUserId: input.actorUserId,
        eventType: 'execution_succeeded',
        reason: 'The Customer CRM service returned the saved task.',
        update: {
          canonicalOperationId: task.id,
          actualResult: {
            taskStatus: task.status,
            sendsMessage: false,
            providerConfirmed: false,
          },
          executedAt: new Date(),
        },
      });
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: 'succeeded',
        toState: 'verification_pending',
        actorUserId: input.actorUserId,
        eventType: 'verification_started',
        reason: 'Re-reading the canonical CRM task before marking it verified.',
      });
      const verifiedTask = await tx.customerFollowUpTask.findFirst({
        where: { id: task.id, businessId: input.businessId },
        select: { id: true, status: true },
      });
      if (!verifiedTask) {
        throw new AppException(
          'SPECIALIST_ACTION_VERIFICATION_FAILED',
          'The CRM task was returned by the canonical service but could not be found during verification.',
          HttpStatus.CONFLICT,
        );
      }
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: 'verification_pending',
        toState: 'verified',
        actorUserId: input.actorUserId,
        eventType: 'verification_succeeded',
        reason: 'The canonical CRM task exists in this business.',
        update: {
          verifiedAt: new Date(),
          verificationResult: {
            exists: true,
            taskStatus: verifiedTask.status,
            sendsMessage: false,
          },
        },
      });
    });

    return {
      actionId: input.actionId,
      state: 'verified',
      canonicalOperationId: task.id,
      taskStatus: task.status,
      sendsMessage: false,
      providerConfirmed: false,
    };
  }

  async approve(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(businessId, actionId);
    this.requireActionState(action, 'approval_required');
    await this.agentPolicy.assertAgentEnabled(
      businessId,
      action.agentKey as SpecialistAgentPersistedKey,
    );

    if (
      action.actionType === 'inventory_reorder_request' &&
      action.canonicalResourceType === 'ProcurementRequest'
    ) {
      this.requireInventoryActionVersion(action, input.expectedVersion);
      return this.procurement.decideRequest(
        businessId,
        actorUserId,
        action.canonicalResourceId,
        { decision: 'approve', expectedVersion: input.expectedVersion },
      );
    }

    if (this.isCustomerFollowUpAction(action)) {
      this.requireCustomerFollowUpActionVersion(action, input.expectedVersion);
      return this.decideCustomerFollowUpAction({
        businessId,
        actorUserId,
        actionId,
        fromState: 'approval_required',
        toState: 'approved',
        reason:
          input.reason?.trim() || 'Owner approved the exact CRM task proposal.',
        eventType: 'approval_recorded',
        update: {
          approvedByUserId: actorUserId,
          approvedAt: new Date(),
          approvalReason: input.reason?.trim() ?? null,
        },
      });
    }

    const customerVersion = this.customerSegmentVersion(action);
    if (customerVersion !== null) {
      if (
        input.expectedVersion !== customerVersion ||
        !input.expectedPayloadHash ||
        !input.expectedCountsHash
      ) {
        throw new AppException(
          'SPECIALIST_ACTION_APPROVAL_EVIDENCE_REQUIRED',
          'Customer segment approval requires the exact version, preview hash and audience-count hash shown by the Customers review screen.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.customerSegments.approve(
        actorUserId,
        action.canonicalResourceId,
        {
          expectedVersion: input.expectedVersion,
          expectedPayloadHash: input.expectedPayloadHash,
          expectedCountsHash: input.expectedCountsHash,
        },
      );
    }

    throw this.unsupportedAction(action.actionType);
  }

  async reject(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(businessId, actionId);
    this.requireActionState(action, 'approval_required');
    const reason = input.reason?.trim();
    if (!reason) {
      throw new AppException(
        'SPECIALIST_ACTION_DECISION_REASON_REQUIRED',
        'Enter a reason to reject this specialist action.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      action.actionType === 'inventory_reorder_request' &&
      action.canonicalResourceType === 'ProcurementRequest'
    ) {
      this.requireInventoryActionVersion(action, input.expectedVersion);
      return this.procurement.decideRequest(
        businessId,
        actorUserId,
        action.canonicalResourceId,
        {
          decision: 'reject',
          reason,
          expectedVersion: input.expectedVersion,
        },
      );
    }

    if (this.isCustomerFollowUpAction(action)) {
      this.requireCustomerFollowUpActionVersion(action, input.expectedVersion);
      return this.decideCustomerFollowUpAction({
        businessId,
        actorUserId,
        actionId,
        fromState: 'approval_required',
        toState: 'rejected',
        reason,
        eventType: 'rejection_recorded',
        update: { rejectionReason: reason, closedAt: new Date() },
      });
    }

    const customerVersion = this.customerSegmentVersion(action);
    if (customerVersion !== null) {
      if (input.expectedVersion !== customerVersion) {
        throw new AppException(
          'SPECIALIST_ACTION_VERSION_REQUIRED',
          'Customer segment rejection must name the exact proposal version being reviewed.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.customerSegments.reject(
        actorUserId,
        action.canonicalResourceId,
        {
          expectedVersion: input.expectedVersion,
          reason,
        },
      );
    }

    throw this.unsupportedAction(action.actionType);
  }

  async execute(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(businessId, actionId);
    this.requireActionState(action, 'approved');
    await this.agentPolicy.assertAgentEnabled(
      businessId,
      action.agentKey as SpecialistAgentPersistedKey,
    );
    if (
      action.actionType === 'inventory_reorder_request' &&
      action.canonicalResourceType === 'ProcurementRequest'
    ) {
      this.requireInventoryActionVersion(action, input.expectedVersion);
      return this.procurement.convertRequestToPurchaseOrder(
        businessId,
        actorUserId,
        action.canonicalResourceId,
        input.expectedVersion,
      );
    }

    if (this.isCustomerFollowUpAction(action)) {
      this.requireCustomerFollowUpActionVersion(action, input.expectedVersion);
      return this.executeCustomerFollowUpAction({
        businessId,
        actorUserId,
        actionId,
        recommendationId: action.canonicalResourceId,
      });
    }
    throw this.unsupportedAction(action.actionType);
  }

  async sourceRfq(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(businessId, actionId);
    if (
      action.agentKey !== 'inventory_intelligence' ||
      action.actionType !== 'inventory_reorder_request' ||
      action.canonicalResourceType !== 'ProcurementRequest'
    ) {
      throw this.unsupportedAction(action.actionType);
    }
    this.requireInventoryActionVersion(action, input.expectedVersion);
    await this.agentPolicy.assertAgentEnabled(businessId, action.agentKey);

    if (action.state === 'verified') {
      if (!action.canonicalOperationId) {
        throw new AppException(
          'SPECIALIST_ACTION_VERIFICATION_FAILED',
          'The verified action has no recorded shared RFQ. Review the Procurement request and RFQ history.',
          HttpStatus.CONFLICT,
        );
      }
      const existing = await this.tenantPrisma.client.commerceRfq.findFirst({
        where: {
          id: action.canonicalOperationId,
          businessId,
          sourceProcurementRequestId: action.canonicalResourceId,
          status: { in: ['draft', 'open'] },
        },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new AppException(
          'SPECIALIST_ACTION_VERIFICATION_FAILED',
          'The verified shared RFQ is no longer available. Review the Procurement request and RFQ history.',
          HttpStatus.CONFLICT,
        );
      }
      return {
        actionId,
        state: 'verified',
        canonicalOperationId: existing.id,
        rfqStatus: existing.status,
        supplierContacted: false,
        purchaseOrderCreated: false,
      };
    }

    if (
      ![
        'approved',
        'failed',
        'execution_queued',
        'executing',
        'succeeded',
        'verification_pending',
      ].includes(action.state)
    ) {
      this.requireActionState(action, 'approved');
    }

    const sourcePostcondition = {
      requestStatus: 'sourcing',
      linkedResourceType: 'CommerceRfq',
      linkedFromRequestId: action.canonicalResourceId,
      rfqStatus: 'draft',
    } satisfies Prisma.InputJsonObject;

    let state = action.state as SpecialistAgentActionState;
    if (
      state === 'approved' ||
      state === 'failed' ||
      state === 'execution_queued'
    ) {
      await this.tenantPrisma.client.$transaction(async (tx) => {
        if (state === 'approved' || state === 'failed') {
          await transitionSpecialistAgentAction(tx, {
            businessId,
            actionId,
            fromState: state,
            toState: 'execution_queued',
            actorUserId,
            eventType:
              state === 'failed'
                ? 'execution_retry_queued'
                : 'execution_queued',
            reason:
              'Owner chose the shared RFQ sourcing path for the approved request.',
            update: {
              executionAttemptCount: { increment: 1 },
              expectedPostcondition: sourcePostcondition,
              errorCode: null,
              errorMessage: null,
            },
          });
        }
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'execution_queued',
          toState: 'executing',
          actorUserId,
          eventType: 'execution_started',
          reason:
            'Delegated shared RFQ creation to the canonical Commerce RFQ service.',
        });
      });
      state = 'executing';
    }

    let rfq: { id: string; status: string } | null = null;
    if (state === 'executing') {
      const alreadyCreated =
        await this.tenantPrisma.client.commerceRfq.findFirst({
          where: {
            businessId,
            sourceProcurementRequestId: action.canonicalResourceId,
            status: { in: ['draft', 'open'] },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: { id: true, status: true },
        });
      if (alreadyCreated) {
        rfq = alreadyCreated;
      } else {
        try {
          const created = await this.commerceRfqs.createFromProcurementRequest(
            businessId,
            actorUserId,
            action.canonicalResourceId,
          );
          rfq = { id: created.id, status: created.status };
        } catch (error) {
          const response =
            error instanceof AppException ? error.getResponse() : null;
          const errorCode =
            response &&
            typeof response === 'object' &&
            'code' in response &&
            typeof response.code === 'string'
              ? response.code
              : 'SPECIALIST_ACTION_EXECUTION_FAILED';
          await this.tenantPrisma.client.$transaction(async (tx) => {
            await transitionSpecialistAgentAction(tx, {
              businessId,
              actionId,
              fromState: 'executing',
              toState: 'failed',
              actorUserId,
              eventType: 'execution_failed',
              reason:
                'The canonical Commerce RFQ service refused to create the shared RFQ.',
              update: { errorCode, errorMessage: null },
            });
          });
          throw error;
        }
      }
    } else {
      rfq = await this.tenantPrisma.client.commerceRfq.findFirst({
        where: {
          businessId,
          sourceProcurementRequestId: action.canonicalResourceId,
          status: { in: ['draft', 'open'] },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true },
      });
    }

    if (!rfq) {
      throw new AppException(
        'SPECIALIST_ACTION_EXECUTION_IN_PROGRESS',
        'The action is already executing. Refresh the action audit before retrying.',
        HttpStatus.CONFLICT,
      );
    }

    let verificationFailed = false;
    await this.tenantPrisma.client.$transaction(async (tx) => {
      const current = await tx.specialistAgentAction.findFirst({
        where: { businessId, id: actionId },
        select: { state: true },
      });
      if (!current) {
        throw new AppException(
          'SPECIALIST_ACTION_NOT_FOUND',
          'The specialist action is not available in this business.',
          HttpStatus.NOT_FOUND,
        );
      }
      let currentState = current.state as SpecialistAgentActionState;
      if (currentState === 'executing') {
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'executing',
          toState: 'succeeded',
          actorUserId,
          eventType: 'execution_succeeded',
          reason: 'The canonical Commerce RFQ service returned a shared RFQ.',
          update: {
            canonicalOperationId: rfq!.id,
            actualResult: {
              rfqStatus: rfq!.status,
              supplierContacted: false,
              purchaseOrderCreated: false,
            },
            executedAt: new Date(),
          },
        });
        currentState = 'succeeded';
      }
      if (currentState === 'succeeded') {
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'succeeded',
          toState: 'verification_pending',
          actorUserId,
          eventType: 'verification_started',
          reason: 'Re-reading the canonical Commerce RFQ and source request.',
        });
        currentState = 'verification_pending';
      }
      if (currentState !== 'verification_pending') {
        if (currentState === 'verified') return;
        throw new AppException(
          'SPECIALIST_ACTION_STATE_CONFLICT',
          `This action is ${currentState} and cannot finish RFQ verification. Refresh the action audit.`,
          HttpStatus.CONFLICT,
        );
      }
      const verifiedRfq = await tx.commerceRfq.findFirst({
        where: {
          id: rfq!.id,
          businessId,
          sourceProcurementRequestId: action.canonicalResourceId,
          status: { in: ['draft', 'open'] },
        },
        select: { id: true, status: true },
      });
      if (!verifiedRfq) {
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'verification_pending',
          toState: 'verification_failed',
          actorUserId,
          eventType: 'verification_failed',
          reason:
            'The shared RFQ could not be re-read with the expected source link.',
          update: { errorCode: 'SPECIALIST_ACTION_VERIFICATION_FAILED' },
        });
        verificationFailed = true;
        return;
      }
      await transitionSpecialistAgentAction(tx, {
        businessId,
        actionId,
        fromState: 'verification_pending',
        toState: 'verified',
        actorUserId,
        eventType: 'verification_succeeded',
        reason:
          'The shared RFQ exists and links to the approved Procurement request.',
        update: {
          verifiedAt: new Date(),
          actualResult: {
            rfqStatus: verifiedRfq.status,
            supplierContacted: false,
            purchaseOrderCreated: false,
          },
          verificationResult: {
            exists: true,
            sourceProcurementRequestId: action.canonicalResourceId,
            rfqStatus: verifiedRfq.status,
            supplierContacted: false,
            purchaseOrderCreated: false,
          },
        },
      });
      rfq = verifiedRfq;
    });

    if (verificationFailed) {
      throw new AppException(
        'SPECIALIST_ACTION_VERIFICATION_FAILED',
        'The shared RFQ was created but failed its source-link verification. Review Procurement and RFQ history before retrying.',
        HttpStatus.CONFLICT,
      );
    }
    return {
      actionId,
      state: 'verified',
      canonicalOperationId: rfq.id,
      rfqStatus: rfq.status,
      supplierContacted: false,
      purchaseOrderCreated: false,
    };
  }

  async cancel(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(businessId, actionId);
    this.requireActionState(action, 'approval_required');
    const reason = input.reason?.trim();
    if (!reason) {
      throw new AppException(
        'SPECIALIST_ACTION_DECISION_REASON_REQUIRED',
        'Enter a reason to cancel this specialist action.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      action.actionType === 'inventory_reorder_request' &&
      action.canonicalResourceType === 'ProcurementRequest'
    ) {
      this.requireInventoryActionVersion(action, input.expectedVersion);
      return this.procurement.withdrawRequest(
        businessId,
        actorUserId,
        action.canonicalResourceId,
        true,
        reason,
        input.expectedVersion,
      );
    }

    if (this.isCustomerFollowUpAction(action)) {
      this.requireCustomerFollowUpActionVersion(action, input.expectedVersion);
      return this.decideCustomerFollowUpAction({
        businessId,
        actorUserId,
        actionId,
        fromState: 'approval_required',
        toState: 'cancelled',
        reason,
        eventType: 'cancellation_recorded',
        update: { closedAt: new Date() },
      });
    }

    const customerVersion = this.customerSegmentVersion(action);
    if (customerVersion !== null) {
      if (input.expectedVersion !== customerVersion) {
        throw new AppException(
          'SPECIALIST_ACTION_VERSION_REQUIRED',
          'Customer segment cancellation must name the exact proposal version being reviewed.',
          HttpStatus.BAD_REQUEST,
        );
      }
      // Withdrawing approval returns the canonical proposal to editable draft state;
      // it does not delete the recommendation or the segment definition.
      return this.customerSegments.withdraw(
        actorUserId,
        action.canonicalResourceId,
        { expectedVersion: customerVersion, reason },
      );
    }
    throw this.unsupportedAction(action.actionType);
  }

  private customerSegmentVersion(action: {
    agentKey: string;
    actionType: string;
    canonicalResourceType: string;
  }) {
    if (
      action.agentKey !== 'customer_intelligence' ||
      action.canonicalResourceType !== 'specialist_agent_recommendation'
    )
      return null;
    const match = /^customer_segment_draft_v([1-9]\d*)$/.exec(
      action.actionType,
    );
    if (!match) return null;
    const version = Number(match[1]);
    return Number.isSafeInteger(version) ? version : null;
  }

  private unsupportedAction(actionType: string) {
    return new AppException(
      'SPECIALIST_ACTION_CANONICAL_FLOW_REQUIRED',
      `The ${actionType} action must be handled by its owning module; no shared decision adapter is registered for it.`,
      HttpStatus.CONFLICT,
    );
  }

  async get(businessId: string, actionId: string) {
    const action =
      await this.tenantPrisma.client.specialistAgentAction.findFirst({
        where: { businessId, id: actionId },
        select: {
          ...SPECIALIST_ACTION_SAFE_SELECT,
          events: {
            orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              eventType: true,
              sequence: true,
              fromState: true,
              toState: true,
              actorUserId: true,
              createdAt: true,
            },
          },
        },
      });
    if (!action) {
      throw new AppException(
        'SPECIALIST_ACTION_NOT_FOUND',
        'The specialist action is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { events, ...safeAction } = action;
    return {
      ...safeAction,
      eventHistory: events,
    };
  }

  async list(businessId: string, query: ListSpecialistAgentActionsDto) {
    const limit = query.limit ?? 25;
    const where: Prisma.SpecialistAgentActionWhereInput = {
      businessId,
      ...(query.agentKey ? { agentKey: query.agentKey } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.moduleId ? { moduleId: query.moduleId } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
    };

    if (query.cursor) {
      const cursor =
        await this.tenantPrisma.client.specialistAgentAction.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        });
      if (!cursor) {
        throw new AppException(
          'SPECIALIST_ACTION_CURSOR_INVALID',
          'The action cursor is no longer available in this business and filter scope. Refresh the list.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const rows = await this.tenantPrisma.client.specialistAgentAction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: SPECIALIST_ACTION_SAFE_SELECT,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      pageSize: limit,
    };
  }
}
