import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkflowDeadLetterDecisionAction,
  WorkflowDeadLetterNextAction,
  WorkflowDeadLetterStatus,
  WorkflowRunStatus,
} from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { DecideWorkflowDeadLetterDto } from './dto/decide-workflow-dead-letter.dto';
import { WorkflowTriggerService } from './workflow-trigger.service';
import {
  MAX_DEAD_LETTER_OPERATOR_RETRIES,
  WORKFLOW_ERROR_CODES,
} from './workflows.constants';

function decisionSnapshot(input: {
  status: WorkflowDeadLetterStatus;
  nextAction: WorkflowDeadLetterNextAction;
  ownerUserId: string | null;
  workflowRunId: string;
  operatorRetryCount: number;
}) {
  return {
    status: input.status,
    nextAction: input.nextAction,
    ownerUserId: input.ownerUserId,
    workflowRunId: input.workflowRunId,
    operatorRetryCount: input.operatorRetryCount,
  } satisfies Prisma.InputJsonObject;
}

function normalizedReason(dto: DecideWorkflowDeadLetterDto): string {
  const reason = dto.reason.trim();
  if (reason.length === 0) {
    throw new AppException(
      WORKFLOW_ERROR_CODES.DEAD_LETTER_DECISION_NOT_ALLOWED,
      'Enter a reason before recording this recovery decision.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return reason;
}

@Injectable()
export class WorkflowDeadLettersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly workflowTrigger: WorkflowTriggerService,
  ) {}

  async list(
    businessId: string,
    status: WorkflowDeadLetterStatus = WorkflowDeadLetterStatus.open,
  ) {
    if (!Object.values(WorkflowDeadLetterStatus).includes(status)) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.DEAD_LETTER_DECISION_NOT_ALLOWED,
        'Unsupported dead-letter status filter.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenantPrisma.client.workflowDeadLetter.findMany({
      where: { businessId, status },
      include: {
        workflow: { select: { id: true, name: true, triggerKey: true } },
        workflowRun: {
          select: {
            id: true,
            status: true,
            workflowVersion: true,
            retryCount: true,
            attempts: {
              orderBy: [{ attemptNumber: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                attemptNumber: true,
                status: true,
                startedAt: true,
                finishedAt: true,
              },
            },
          },
        },
        ownerUser: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }

  async findOne(businessId: string, id: string) {
    const deadLetter =
      await this.tenantPrisma.client.workflowDeadLetter.findFirst({
        where: { id, businessId },
        include: {
          workflow: { select: { id: true, name: true, triggerKey: true } },
          workflowRun: {
            select: {
              id: true,
              status: true,
              workflowVersion: true,
              retryCount: true,
              attempts: {
                orderBy: [{ attemptNumber: 'asc' }, { id: 'asc' }],
                select: {
                  id: true,
                  attemptNumber: true,
                  status: true,
                  startedAt: true,
                  finishedAt: true,
                },
              },
            },
          },
          ownerUser: { select: { id: true, name: true } },
          decisions: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 50,
            include: { actorUser: { select: { id: true, name: true } } },
          },
        },
      });
    if (!deadLetter) throw this.notFound();
    return deadLetter;
  }

  async retry(
    user: AuthenticatedUser,
    id: string,
    dto: DecideWorkflowDeadLetterDto,
  ) {
    const reason = normalizedReason(dto);
    const current = await this.findOne(user.businessId, id);
    if (
      current.status !== WorkflowDeadLetterStatus.open ||
      current.nextAction !== WorkflowDeadLetterNextAction.retry ||
      current.operatorRetryCount >= MAX_DEAD_LETTER_OPERATOR_RETRIES
    ) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.DEAD_LETTER_RETRY_NOT_ALLOWED,
        'This dead letter is not eligible for another safe retry. Resolve or dismiss it after review.',
        HttpStatus.CONFLICT,
      );
    }

    const reserved = await this.tenantPrisma.client.$transaction(async (tx) => {
      const claim = await tx.workflowDeadLetter.updateMany({
        where: {
          id,
          businessId: user.businessId,
          status: WorkflowDeadLetterStatus.open,
          nextAction: WorkflowDeadLetterNextAction.retry,
          operatorRetryCount: { lt: MAX_DEAD_LETTER_OPERATOR_RETRIES },
        },
        data: {
          operatorRetryCount: { increment: 1 },
        },
      });
      if (claim.count !== 1) throw this.decisionConflict();
      const updated = await tx.workflowDeadLetter.findFirstOrThrow({
        where: { id, businessId: user.businessId },
      });
      const before = decisionSnapshot({
        ...current,
        status: current.status,
        operatorRetryCount: current.operatorRetryCount,
      });
      const after = decisionSnapshot({
        ...updated,
        status: updated.status,
        operatorRetryCount: updated.operatorRetryCount,
      });
      await this.writeDecision(tx as unknown as Prisma.TransactionClient, {
        businessId: user.businessId,
        deadLetterId: id,
        actorUserId: user.sub,
        action: WorkflowDeadLetterDecisionAction.retry_started,
        reason,
        before,
        after,
      });
      return updated;
    });

    let run: { status: WorkflowRunStatus };
    try {
      run = await this.workflowTrigger.retryFailedRun(
        user.businessId,
        reserved.workflowId,
        reserved.workflowRunId,
        { allowExhausted: true },
      );
    } catch (error) {
      await this.tenantPrisma.client.$transaction(async (tx) => {
        const before = await tx.workflowDeadLetter.findFirst({
          where: { id, businessId: user.businessId },
        });
        if (!before) return;
        const claim = await tx.workflowDeadLetter.updateMany({
          where: {
            id,
            businessId: user.businessId,
            status: WorkflowDeadLetterStatus.open,
            nextAction: WorkflowDeadLetterNextAction.retry,
            operatorRetryCount: reserved.operatorRetryCount,
          },
          data: {
            status: WorkflowDeadLetterStatus.open,
            nextAction: WorkflowDeadLetterNextAction.manual_review,
          },
        });
        if (claim.count !== 1) return;
        const after = await tx.workflowDeadLetter.findFirstOrThrow({
          where: { id, businessId: user.businessId },
        });
        await this.writeDecision(tx as unknown as Prisma.TransactionClient, {
          businessId: user.businessId,
          deadLetterId: id,
          actorUserId: user.sub,
          action: WorkflowDeadLetterDecisionAction.retry_failed,
          reason,
          before: decisionSnapshot({ ...before, status: before.status }),
          after: decisionSnapshot({ ...after, status: after.status }),
        });
      });
      throw error;
    }

    const recovered = run.status === WorkflowRunStatus.success;
    const finishedAt = new Date();
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const claim = await tx.workflowDeadLetter.updateMany({
        where: {
          id,
          businessId: user.businessId,
          status: WorkflowDeadLetterStatus.open,
          nextAction: WorkflowDeadLetterNextAction.retry,
          operatorRetryCount: reserved.operatorRetryCount,
        },
        data: {
          status: recovered
            ? WorkflowDeadLetterStatus.resolved
            : WorkflowDeadLetterStatus.open,
          nextAction: WorkflowDeadLetterNextAction.manual_review,
          ...(recovered
            ? { resolutionReason: reason, resolvedAt: finishedAt }
            : {}),
        },
      });
      if (claim.count !== 1) throw this.decisionConflict();
      const updated = await tx.workflowDeadLetter.findFirstOrThrow({
        where: { id, businessId: user.businessId },
      });
      const action = recovered
        ? WorkflowDeadLetterDecisionAction.retry_succeeded
        : WorkflowDeadLetterDecisionAction.retry_failed;
      await this.writeDecision(tx as unknown as Prisma.TransactionClient, {
        businessId: user.businessId,
        deadLetterId: id,
        actorUserId: user.sub,
        action,
        reason,
        before: decisionSnapshot({ ...reserved, status: reserved.status }),
        after: decisionSnapshot({ ...updated, status: updated.status }),
      });
      return updated;
    });
  }

  async resolve(
    user: AuthenticatedUser,
    id: string,
    dto: DecideWorkflowDeadLetterDto,
  ) {
    return this.close(
      user,
      id,
      WorkflowDeadLetterStatus.resolved,
      WorkflowDeadLetterDecisionAction.resolved,
      normalizedReason(dto),
    );
  }

  async dismiss(
    user: AuthenticatedUser,
    id: string,
    dto: DecideWorkflowDeadLetterDto,
  ) {
    return this.close(
      user,
      id,
      WorkflowDeadLetterStatus.dismissed,
      WorkflowDeadLetterDecisionAction.dismissed,
      normalizedReason(dto),
    );
  }

  private async close(
    user: AuthenticatedUser,
    id: string,
    status: Extract<WorkflowDeadLetterStatus, 'resolved' | 'dismissed'>,
    action: Extract<WorkflowDeadLetterDecisionAction, 'resolved' | 'dismissed'>,
    reason: string,
  ) {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const before = await tx.workflowDeadLetter.findFirst({
        where: { id, businessId: user.businessId },
      });
      if (!before) throw this.notFound();
      if (
        before.status !== WorkflowDeadLetterStatus.open ||
        (before.operatorRetryCount > 0 &&
          before.nextAction === WorkflowDeadLetterNextAction.retry)
      ) {
        throw this.decisionConflict();
      }
      const updated = await tx.workflowDeadLetter.updateMany({
        where: {
          id,
          businessId: user.businessId,
          status: WorkflowDeadLetterStatus.open,
          nextAction: before.nextAction,
          operatorRetryCount: before.operatorRetryCount,
        },
        data: {
          status,
          nextAction: WorkflowDeadLetterNextAction.manual_review,
          resolutionReason: reason,
          ...(status === WorkflowDeadLetterStatus.resolved
            ? { resolvedAt: new Date() }
            : { dismissedAt: new Date() }),
        },
      });
      if (updated.count !== 1) throw this.decisionConflict();
      const after = await tx.workflowDeadLetter.findFirstOrThrow({
        where: { id, businessId: user.businessId },
      });
      await this.writeDecision(tx as unknown as Prisma.TransactionClient, {
        businessId: user.businessId,
        deadLetterId: id,
        actorUserId: user.sub,
        action,
        reason,
        before: decisionSnapshot({ ...before, status: before.status }),
        after: decisionSnapshot({ ...after, status: after.status }),
      });
      return after;
    });
  }

  private writeDecision(
    tx: Prisma.TransactionClient,
    input: {
      businessId: string;
      deadLetterId: string;
      actorUserId: string | null;
      action: WorkflowDeadLetterDecisionAction;
      reason: string;
      before: Prisma.InputJsonObject;
      after: Prisma.InputJsonObject;
    },
  ) {
    const auditAfter = {
      ...input.after,
      reason: input.reason,
    } satisfies Prisma.InputJsonObject;
    return Promise.all([
      tx.workflowDeadLetterDecision.create({ data: input }),
      tx.auditLog.create({
        data: {
          businessId: input.businessId,
          actorUserId: input.actorUserId,
          action: `workflow_dead_letter.${input.action}`,
          entity: 'workflow-dead-letter',
          entityId: input.deadLetterId,
          before: input.before,
          after: auditAfter,
        },
      }),
    ]);
  }

  private notFound() {
    return new AppException(
      WORKFLOW_ERROR_CODES.DEAD_LETTER_NOT_FOUND,
      'Dead-letter record not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private decisionConflict() {
    return new AppException(
      WORKFLOW_ERROR_CODES.DEAD_LETTER_DECISION_NOT_ALLOWED,
      'This dead-letter record has already changed. Refresh before deciding.',
      HttpStatus.CONFLICT,
    );
  }
}
