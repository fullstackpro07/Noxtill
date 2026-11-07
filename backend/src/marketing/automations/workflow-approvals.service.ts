import { HttpStatus, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, Role, WorkflowApprovalStatus } from '@prisma/client';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AppException } from '../../common/filters/app.exception';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowAction } from './workflow-action.util';
import {
  buildWorkflowApprovalSnapshot,
  WorkflowApprovalBinding,
  hashWorkflowApprovalBinding,
} from './workflow-approval.util';
import { WORKFLOW_ERROR_CODES } from './workflows.constants';
import { parseWorkflowGraphExecutionPlan } from './workflow-graph.util';

@Injectable()
export class WorkflowApprovalsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly workflowTrigger: WorkflowTriggerService,
  ) {}

  list(businessId: string, status: WorkflowApprovalStatus = 'pending') {
    if (!Object.values(WorkflowApprovalStatus).includes(status)) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_DEFINITION,
        'Unsupported workflow approval status.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenantPrisma.client.workflowApproval.findMany({
      where: {
        businessId,
        status,
        ...(status === 'pending'
          ? { workflowRun: { status: 'waiting', waitingUntil: null } }
          : {}),
      },
      include: {
        workflow: { select: { name: true } },
        workflowRun: { select: { createdAt: true } },
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }

  async decide(
    user: AuthenticatedUser,
    approvalId: string,
    decision: 'approve' | 'reject',
    comment?: string,
  ) {
    if (user.role !== Role.owner && user.role !== Role.manager) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_ROLE_REQUIRED,
        'Only an owner or manager can decide a workflow approval.',
        HttpStatus.FORBIDDEN,
      );
    }

    const approval = await this.tenantPrisma.client.workflowApproval.findFirst({
      where: { id: approvalId, businessId: user.businessId },
      include: {
        workflowRun: {
          select: {
            status: true,
            waitingUntil: true,
            nextActionIndex: true,
            executionPlan: true,
            workflowVersion: true,
            context: true,
          },
        },
      },
    });
    if (!approval) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_NOT_FOUND,
        'Workflow approval not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (approval.status === WorkflowApprovalStatus.pending) {
      this.assertApprovalRunWaiting(approval);
      if (decision === 'approve') await this.assertPayloadUnchanged(approval);
      const updated =
        await this.tenantPrisma.client.workflowApproval.updateMany({
          where: {
            id: approval.id,
            businessId: user.businessId,
            status: WorkflowApprovalStatus.pending,
          },
          data: {
            status:
              decision === 'approve'
                ? WorkflowApprovalStatus.approved
                : WorkflowApprovalStatus.rejected,
            decidedByUserId: user.sub,
            decisionComment: comment?.trim() || null,
            decidedAt: new Date(),
          },
        });
      if (updated.count !== 1) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.APPROVAL_DECISION_NOT_ALLOWED,
          'This approval has already been decided.',
          HttpStatus.CONFLICT,
        );
      }
    } else if (
      (decision === 'approve' && approval.status !== 'approved') ||
      (decision === 'reject' && approval.status !== 'rejected')
    ) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_DECISION_NOT_ALLOWED,
        'This approval has already been decided differently.',
        HttpStatus.CONFLICT,
      );
    }

    if (decision === 'approve') {
      await this.workflowTrigger.resumeWaitingRun(
        user.businessId,
        approval.workflowId,
        approval.workflowRunId,
        new Date(),
        approval.id,
      );
    } else {
      await this.workflowTrigger.rejectApprovalRun(
        user.businessId,
        approval.workflowId,
        approval.workflowRunId,
        approval.id,
        comment?.trim() || null,
      );
    }

    return this.tenantPrisma.client.workflowApproval.findFirst({
      where: { id: approval.id, businessId: user.businessId },
      include: { workflow: { select: { name: true } } },
    });
  }

  private async assertPayloadUnchanged(approval: {
    businessId: string;
    workflowId: string;
    workflowRunId: string;
    actionIndex: number;
    payloadHash: string;
    payload: Prisma.JsonValue;
    workflowRun: {
      status: string;
      waitingUntil: Date | null;
      nextActionIndex: number | null;
      executionPlan: Prisma.JsonValue | null;
      workflowVersion: number;
      context: Prisma.JsonValue;
    };
  }) {
    const run = approval.workflowRun;
    const version = await this.tenantPrisma.client.workflowVersion.findUnique({
      where: {
        workflowId_version: {
          workflowId: approval.workflowId,
          version: run.workflowVersion,
        },
      },
      select: { actions: true, triggerKey: true },
    });
    if (!version || !Array.isArray(version.actions)) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_PAYLOAD_CHANGED,
        'The pinned workflow version is unavailable; approval cannot continue.',
        HttpStatus.CONFLICT,
      );
    }
    const actions = version.actions as unknown as WorkflowAction[];
    const executionPlan = approval.workflowRun.executionPlan
      ? parseWorkflowGraphExecutionPlan(
          approval.workflowRun.executionPlan,
          actions.length,
        )
      : null;
    if (approval.workflowRun.executionPlan && !executionPlan) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_PAYLOAD_CHANGED,
        'The saved execution path is invalid; approval cannot continue.',
        HttpStatus.CONFLICT,
      );
    }
    const actionIndexes = executionPlan
      ? executionPlan.actionIndexes
      : actions.map((_, index) => index);
    const approvalPosition = actionIndexes.indexOf(approval.actionIndex);
    const approvalAction = actions[approval.actionIndex];
    if (approvalAction?.type !== 'request_approval' || approvalPosition < 0) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_PAYLOAD_CHANGED,
        'The approval action no longer matches the pinned workflow version.',
        HttpStatus.CONFLICT,
      );
    }
    const binding: WorkflowApprovalBinding = {
      businessId: approval.businessId,
      workflowId: approval.workflowId,
      workflowRunId: approval.workflowRunId,
      workflowVersion: run.workflowVersion,
      triggerKey: version.triggerKey,
      actionIndex: approval.actionIndex,
      approvalAction,
      downstreamActions: actionIndexes
        .slice(approvalPosition + 1)
        .map((index) => actions[index]),
      context: run.context as Record<string, unknown>,
    };
    const expectedSnapshot = buildWorkflowApprovalSnapshot(binding);
    if (
      hashWorkflowApprovalBinding(binding) !== approval.payloadHash ||
      !isDeepStrictEqual(approval.payload, expectedSnapshot)
    ) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_PAYLOAD_CHANGED,
        'The approval payload has changed; the waiting actions will not run.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private assertApprovalRunWaiting(approval: {
    actionIndex: number;
    workflowRun: {
      status: string;
      waitingUntil: Date | null;
      nextActionIndex: number | null;
    };
  }) {
    const run = approval.workflowRun;
    if (
      run.status !== 'waiting' ||
      run.waitingUntil !== null ||
      run.nextActionIndex !== approval.actionIndex + 1
    ) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.APPROVAL_DECISION_NOT_ALLOWED,
        'The workflow run is no longer waiting at this approval.',
        HttpStatus.CONFLICT,
      );
    }
  }
}
