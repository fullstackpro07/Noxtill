import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  isSpecialistSourceModuleDisabledError,
  SpecialistAgentPolicyService,
} from '../common/agents/specialist-agent-policy.service';
import type { SpecialistAgentPersistedKey } from '../common/agents/specialist-agent-registry';
import {
  legacySpecialistAgentSourceModules,
  specialistAgentRunDetailsHiddenByModuleSelection,
} from '../common/agents/specialist-agent-module-selection.util';
import { CustomerSegmentDraftsService } from '../customers/customer-segment-drafts.service';
import { CustomerAgentActionsService } from '../customers/customer-agent-actions.service';
import { ProcurementService } from '../procurement/procurement.service';
import { CommerceRfqsService } from '../commerce/commerce-rfqs.service';
import { transitionSpecialistAgentAction } from '../common/agents/specialist-agent-action.util';
import type { SpecialistAgentActionState } from '../common/agents/specialist-agent-action.util';
import { DecideSpecialistAgentActionDto } from './dto/decide-specialist-agent-action.dto';
import { ListSpecialistAgentActionsDto } from './dto/list-specialist-agent-actions.dto';
import { SpecialistAgentActionExpiryService } from './specialist-agent-action-expiry.service';

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
  approvalExpiresAt: true,
  executedAt: true,
  verifiedAt: true,
  closedAt: true,
} satisfies Prisma.SpecialistAgentActionSelect;

function actionAuthorizationDenialCode(error: unknown): string | null {
  if (isSpecialistSourceModuleDisabledError(error)) {
    return 'BUSINESS_MODULE_DISABLED';
  }
  if (!(error instanceof AppException)) return null;
  const response = error.getResponse();
  if (
    typeof response !== 'object' ||
    response === null ||
    !('code' in response) ||
    typeof response.code !== 'string'
  ) {
    return null;
  }
  return [
    'SPECIALIST_ACTION_SOURCE_MODULE_DISABLED',
    'SPECIALIST_AGENT_DISABLED',
  ].includes(response.code)
    ? response.code
    : null;
}

@Injectable()
export class SpecialistAgentActionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly procurement: ProcurementService,
    private readonly commerceRfqs: CommerceRfqsService,
    private readonly customerSegments: CustomerSegmentDraftsService,
    private readonly customerActions: CustomerAgentActionsService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly actionExpiry: SpecialistAgentActionExpiryService,
  ) {}

  private actionDetailsHidden(
    agentKey: string,
    output: Prisma.JsonValue,
    disabledModules: ReadonlySet<string>,
  ) {
    const legacySources = legacySpecialistAgentSourceModules(agentKey);
    return (
      !legacySources ||
      specialistAgentRunDetailsHiddenByModuleSelection(
        output,
        disabledModules,
        legacySources,
      )
    );
  }

  private async auditCrossTenantActionProbe(
    businessId: string,
    actionId: string,
    actorUserId: string,
    operation:
      | 'get'
      | 'approve'
      | 'reject'
      | 'execute'
      | 'source_rfq'
      | 'cancel'
      | 'resolve',
  ) {
    const foreignAction =
      await this.tenantPrisma.unscoped.specialistAgentAction.findFirst({
        where: { id: actionId, businessId: { not: businessId } },
        select: { id: true },
      });
    if (!foreignAction) return;
    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId,
        actorUserId,
        action: 'specialist_agent.action_cross_tenant_access_denied',
        entity: 'SpecialistAgentAction',
        entityId: actionId,
        after: { operation, denied: true },
      },
    });
  }

  private async actionForDecision(
    businessId: string,
    actionId: string,
    actorUserId: string,
    operation:
      | 'approve'
      | 'reject'
      | 'execute'
      | 'source_rfq'
      | 'cancel'
      | 'resolve',
  ) {
    const action =
      await this.tenantPrisma.client.specialistAgentAction.findFirst({
        where: { businessId, id: actionId },
        select: {
          id: true,
          runId: true,
          agentKey: true,
          actionType: true,
          expectedVersion: true,
          canonicalResourceType: true,
          canonicalResourceId: true,
          canonicalOperationId: true,
          state: true,
          approvalExpiresAt: true,
          errorCode: true,
          businessId: true,
        },
      });
    if (!action) {
      await this.auditCrossTenantActionProbe(
        businessId,
        actionId,
        actorUserId,
        operation,
      );
      throw new AppException(
        'SPECIALIST_ACTION_NOT_FOUND',
        'The specialist action is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.actionExpiry.assertActionApprovalNotExpired(action);
    return action;
  }

  private async assertActionSourceModulesEnabled(
    businessId: string,
    action: { runId: string; agentKey: string },
  ) {
    const legacySources = legacySpecialistAgentSourceModules(action.agentKey);
    if (!legacySources) {
      throw new AppException(
        'SPECIALIST_ACTION_SOURCE_CONTEXT_UNAVAILABLE',
        'This action does not have a registered source-module policy and cannot be approved or executed.',
        HttpStatus.CONFLICT,
      );
    }
    const run = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        id: action.runId,
        businessId,
        agentKey: action.agentKey,
      },
      select: { output: true },
    });
    if (!run) {
      throw new AppException(
        'SPECIALIST_ACTION_SOURCE_CONTEXT_UNAVAILABLE',
        'The review behind this action is no longer available, so the action cannot be approved or executed.',
        HttpStatus.CONFLICT,
      );
    }
    const disabledModules = new Set(
      await this.agentPolicy.disabledModulesForBusiness(businessId),
    );
    if (
      specialistAgentRunDetailsHiddenByModuleSelection(
        run.output,
        disabledModules,
        legacySources,
      )
    ) {
      throw new AppException(
        'SPECIALIST_ACTION_SOURCE_MODULE_DISABLED',
        'A source module used by this action is disabled. Enable the required module and review a fresh agent run before approving or executing it.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async assertActionModulesEnabled(
    businessId: string,
    actorUserId: string,
    action: {
      id: string;
      runId: string;
      agentKey: string;
      actionType: string;
    },
  ) {
    try {
      await this.agentPolicy.assertAgentEnabled(
        businessId,
        action.agentKey as SpecialistAgentPersistedKey,
      );
      await this.assertActionSourceModulesEnabled(businessId, action);
    } catch (error) {
      const denialCode = actionAuthorizationDenialCode(error);
      if (!denialCode) throw error;
      await this.tenantPrisma.client.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'specialist_agent.action.authorization_denied',
          entity: 'SpecialistAgentAction',
          entityId: action.id,
          after: {
            agentKey: action.agentKey,
            actionType: action.actionType,
            denied: true,
            reasonCode: denialCode,
          },
        },
      });
      throw error;
    }
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
    fromState: 'approval_required' | 'approved';
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
    return this.get(input.businessId, input.actionId, input.actorUserId);
  }

  private async executeCustomerFollowUpAction(input: {
    businessId: string;
    actorUserId: string;
    actionId: string;
    recommendationId: string;
    fromState: 'approved' | 'failed';
  }) {
    await this.tenantPrisma.client.$transaction(async (tx) => {
      await transitionSpecialistAgentAction(tx, {
        businessId: input.businessId,
        actionId: input.actionId,
        fromState: input.fromState,
        toState: 'execution_queued',
        actorUserId: input.actorUserId,
        eventType:
          input.fromState === 'failed'
            ? 'execution_retry_queued'
            : 'execution_queued',
        reason:
          input.fromState === 'failed'
            ? 'Owner retried the failed internal CRM task action.'
            : 'Owner approved creation of the internal CRM follow-up task.',
        update: {
          executionAttemptCount: { increment: 1 },
          errorCode: null,
          errorMessage: null,
        },
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
    });

    try {
      // Claim execution before calling the canonical CRM service. This makes cancel and execute
      // mutually exclusive; the CRM service's idempotency key makes retries safe after a lost
      // response or a failed verification transaction.
      const task = await this.customerActions.createTaskFromRecommendation(
        input.businessId,
        input.actorUserId,
        input.recommendationId,
      );

      await this.tenantPrisma.client.$transaction(async (tx) => {
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
    } catch (error) {
      const response =
        error instanceof AppException ? error.getResponse() : null;
      const errorCode =
        response &&
        typeof response === 'object' &&
        'code' in response &&
        typeof response.code === 'string'
          ? response.code
          : 'CUSTOMER_AGENT_TASK_CREATION_FAILED';
      const current =
        await this.tenantPrisma.client.specialistAgentAction.findFirst({
          where: { id: input.actionId, businessId: input.businessId },
          select: { state: true },
        });
      if (current?.state === 'executing') {
        await this.tenantPrisma.client.$transaction(async (tx) => {
          await transitionSpecialistAgentAction(tx, {
            businessId: input.businessId,
            actionId: input.actionId,
            fromState: 'executing',
            toState: 'failed',
            actorUserId: input.actorUserId,
            eventType: 'execution_failed',
            reason:
              'The canonical Customer CRM task could not be confirmed. The owner can safely retry after reviewing the action.',
            update: { errorCode, errorMessage: null },
          });
        });
      }
      throw error;
    }
  }

  async approve(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(
      businessId,
      actionId,
      actorUserId,
      'approve',
    );
    this.requireActionState(action, 'approval_required');
    await this.assertActionModulesEnabled(businessId, actorUserId, action);

    if (
      action.actionType === 'inventory_reorder_request' &&
      action.canonicalResourceType === 'ProcurementRequest'
    ) {
      this.requireInventoryActionVersion(action, input.expectedVersion);
      await this.assertActionModulesEnabled(businessId, actorUserId, action);
      return this.procurement.decideRequest(
        businessId,
        actorUserId,
        action.canonicalResourceId,
        { decision: 'approve', expectedVersion: input.expectedVersion },
      );
    }

    if (this.isCustomerFollowUpAction(action)) {
      this.requireCustomerFollowUpActionVersion(action, input.expectedVersion);
      await this.assertActionModulesEnabled(businessId, actorUserId, action);
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
      await this.assertActionModulesEnabled(businessId, actorUserId, action);
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
    const action = await this.actionForDecision(
      businessId,
      actionId,
      actorUserId,
      'reject',
    );
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
    const action = await this.actionForDecision(
      businessId,
      actionId,
      actorUserId,
      'execute',
    );
    await this.assertActionModulesEnabled(businessId, actorUserId, action);
    if (this.isCustomerFollowUpAction(action)) {
      this.requireCustomerFollowUpActionVersion(action, input.expectedVersion);
      const fromState = action.state === 'failed' ? 'failed' : 'approved';
      this.requireActionState(action, fromState);
      await this.assertActionModulesEnabled(businessId, actorUserId, action);
      return this.executeCustomerFollowUpAction({
        businessId,
        actorUserId,
        actionId,
        recommendationId: action.canonicalResourceId,
        fromState,
      });
    }

    this.requireActionState(action, 'approved');
    if (
      action.actionType === 'inventory_reorder_request' &&
      action.canonicalResourceType === 'ProcurementRequest'
    ) {
      this.requireInventoryActionVersion(action, input.expectedVersion);
      await this.assertActionModulesEnabled(businessId, actorUserId, action);
      return this.procurement.convertRequestToPurchaseOrder(
        businessId,
        actorUserId,
        action.canonicalResourceId,
        input.expectedVersion,
      );
    }

    throw this.unsupportedAction(action.actionType);
  }

  async sourceRfq(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(
      businessId,
      actionId,
      actorUserId,
      'source_rfq',
    );
    if (
      action.agentKey !== 'inventory_intelligence' ||
      action.actionType !== 'inventory_reorder_request' ||
      action.canonicalResourceType !== 'ProcurementRequest'
    ) {
      throw this.unsupportedAction(action.actionType);
    }
    this.requireInventoryActionVersion(action, input.expectedVersion);
    await this.assertActionModulesEnabled(businessId, actorUserId, action);

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
          // The source may have been disabled after the action was queued. Check
          // again at the boundary immediately before the canonical RFQ write.
          await this.assertActionModulesEnabled(businessId, actorUserId, action);
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
    const action = await this.actionForDecision(
      businessId,
      actionId,
      actorUserId,
      'cancel',
    );
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
      if (action.state === 'approved') {
        return this.procurement.cancelApprovedRequest(
          businessId,
          actorUserId,
          action.canonicalResourceId,
          true,
          reason,
          input.expectedVersion!,
        );
      }
      this.requireActionState(action, 'approval_required');
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
      if (action.state === 'approved') {
        if (action.canonicalOperationId) {
          throw new AppException(
            'SPECIALIST_ACTION_STATE_CONFLICT',
            'This follow-up task has already been created and can no longer be cancelled from the action review.',
            HttpStatus.CONFLICT,
          );
        }
        return this.decideCustomerFollowUpAction({
          businessId,
          actorUserId,
          actionId,
          fromState: 'approved',
          toState: 'cancelled',
          reason,
          eventType: 'cancellation_recorded',
          update: { closedAt: new Date() },
        });
      }
      this.requireActionState(action, 'approval_required');
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

    this.requireActionState(action, 'approval_required');

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

  async resolveUnknownOutcome(
    businessId: string,
    actorUserId: string,
    actionId: string,
    input: DecideSpecialistAgentActionDto,
  ) {
    const action = await this.actionForDecision(
      businessId,
      actionId,
      actorUserId,
      'resolve',
    );
    this.requireActionState(action, 'needs_review');
    const verificationOutcomeUnknown =
      action.errorCode ===
      'SPECIALIST_ACTION_VERIFICATION_OUTCOME_UNKNOWN';
    const executionOutcomeUnknown =
      action.errorCode === 'SPECIALIST_ACTION_OUTCOME_UNKNOWN';
    if (!verificationOutcomeUnknown && !executionOutcomeUnknown) {
      throw new AppException(
        'SPECIALIST_ACTION_RESOLUTION_UNAVAILABLE',
        'This action is not waiting for an unknown execution or verification outcome review.',
        HttpStatus.CONFLICT,
      );
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new AppException(
        'SPECIALIST_ACTION_DECISION_REASON_REQUIRED',
        'Record what you found when checking the canonical resource before closing this review. Closing does not mark the action successful or verified.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      await transitionSpecialistAgentAction(tx, {
        businessId,
        actionId,
        fromState: 'needs_review',
        toState: 'closed',
        actorUserId,
        eventType: verificationOutcomeUnknown
          ? 'verification_outcome_reconciled_closed'
          : 'execution_outcome_reconciled_closed',
        reason,
        metadata: {
          outcome: verificationOutcomeUnknown
            ? 'verification_unknown_closed_by_owner'
            : 'execution_unknown_closed_by_owner',
          providerConfirmed: false,
          verificationConfirmed: false,
        },
        update: { closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: verificationOutcomeUnknown
            ? 'specialist_agent.action.verification_outcome_reconciled'
            : 'specialist_agent.action.execution_outcome_reconciled',
          entity: 'specialist_agent_action',
          entityId: actionId,
          after: {
            state: 'closed',
            outcome: verificationOutcomeUnknown
              ? 'verification_unknown_closed_by_owner'
              : 'execution_unknown_closed_by_owner',
            providerConfirmed: false,
            verificationConfirmed: false,
          },
        },
      });
    });
    return this.get(businessId, actionId, actorUserId);
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

  async get(businessId: string, actionId: string, actorUserId: string) {
    await this.actionExpiry.expireBusinessApprovals(businessId);
    const action =
      await this.tenantPrisma.client.specialistAgentAction.findFirst({
        where: { businessId, id: actionId },
        select: {
          ...SPECIALIST_ACTION_SAFE_SELECT,
          run: { select: { output: true } },
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
      await this.auditCrossTenantActionProbe(
        businessId,
        actionId,
        actorUserId,
        'get',
      );
      throw new AppException(
        'SPECIALIST_ACTION_NOT_FOUND',
        'The specialist action is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    const disabledModules = new Set(
      await this.agentPolicy.disabledModulesForBusiness(businessId),
    );
    const detailsRedacted = this.actionDetailsHidden(
      action.agentKey,
      action.run.output,
      disabledModules,
    );
    const events = action.events;
    const safeAction = Object.fromEntries(
      Object.entries(action).filter(
        ([key]) => key !== 'run' && key !== 'events',
      ),
    ) as Omit<typeof action, 'run' | 'events'>;
    if (detailsRedacted) {
      return {
        ...safeAction,
        canonicalResourceId: null,
        canonicalOperationId: null,
        eventHistory: [],
        detailsRedacted: true,
        detailsRedactionMessage:
          'Enable the source module and review a fresh agent run to access action details.',
      };
    }
    return {
      ...safeAction,
      eventHistory: events,
      detailsRedacted: false,
    };
  }

  async list(businessId: string, query: ListSpecialistAgentActionsDto) {
    await this.actionExpiry.expireBusinessApprovals(businessId);
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
      select: {
        ...SPECIALIST_ACTION_SAFE_SELECT,
        run: { select: { output: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const disabledModules = new Set(
      await this.agentPolicy.disabledModulesForBusiness(businessId),
    );
    const safeItems = items.map(({ run, ...action }) => {
      const detailsRedacted = this.actionDetailsHidden(
        action.agentKey,
        run.output,
        disabledModules,
      );
      return detailsRedacted
        ? {
            ...action,
            canonicalResourceId: null,
            canonicalOperationId: null,
            detailsRedacted: true,
            detailsRedactionMessage:
              'Enable the source module and review a fresh agent run to access action details.',
          }
        : { ...action, detailsRedacted: false };
    });

    return {
      items: safeItems,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      pageSize: limit,
    };
  }
}
