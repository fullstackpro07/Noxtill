import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { transitionSpecialistAgentAction } from '../common/agents/specialist-agent-action.util';

const BATCH_SIZE = 100;
const DEFAULT_STALE_EXECUTION_MINUTES = 60;
const DEFAULT_STALE_VERIFICATION_MINUTES = 60;
const EXPIRY_REASON =
  'The specialist action approval expired after the business-configured review period.';
const STALE_EXECUTION_REASON =
  'The canonical action remained in progress beyond the configured review interval. Its outcome is unknown; no automatic retry was performed. Reconcile the canonical resource before deciding whether to retry.';
const STALE_VERIFICATION_REASON =
  'The canonical action remained unverified beyond the configured review interval. Verification is unknown; no automatic retry was performed. Reconcile the canonical resource before deciding whether to retry.';

@Injectable()
export class SpecialistAgentActionExpiryService {
  private readonly logger = new Logger(SpecialistAgentActionExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runDue(now = new Date()): Promise<number> {
    let expiredCount = 0;
    for (;;) {
      const due = await this.prisma.specialistAgentAction.findMany({
        where: {
          state: 'approval_required',
          approvalExpiresAt: { lte: now },
        },
        orderBy: [{ approvalExpiresAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        select: { id: true, businessId: true },
      });
      if (due.length === 0) break;

      for (const action of due) {
        if (await this.expireOneIfDue(action.businessId, action.id, now)) {
          expiredCount += 1;
        }
      }
      if (due.length < BATCH_SIZE) break;
    }
    const movedToReview = await this.moveStaleActionsToReview(now);
    if (movedToReview > 0) {
      // Do not log customer/provider payloads. The count is enough for worker operations.
      this.logger.log(
        `Moved ${movedToReview} unresolved specialist action(s) to human review`,
      );
    }
    return expiredCount;
  }

  private async moveStaleActionsToReview(now: Date): Promise<number> {
    const businesses = await this.prisma.business.findMany({
      where: { active: true },
      select: { id: true, policies: true },
      orderBy: { id: 'asc' },
    });
    let moved = 0;

    for (const business of businesses) {
      const policies = resolvePolicies(business);
      const staleExecutionMinutes =
        policies.num('agents.specialistActionStaleExecutionMinutes') ??
        DEFAULT_STALE_EXECUTION_MINUTES;
      const staleVerificationMinutes =
        policies.num('agents.specialistActionStaleVerificationMinutes') ??
        DEFAULT_STALE_VERIFICATION_MINUTES;
      moved += await this.reconcileStaleBusinessExecutions(
        business.id,
        staleExecutionMinutes,
        now,
      );
      moved += await this.reconcileStaleBusinessVerifications(
        business.id,
        staleVerificationMinutes,
        now,
      );
    }
    return moved;
  }

  async reconcileStaleBusinessVerifications(
    businessId: string,
    staleMinutes: number,
    now = new Date(),
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000);
    let moved = 0;

    for (;;) {
      const due = await this.prisma.specialistAgentAction.findMany({
        where: {
          businessId,
          state: 'verification_pending',
          updatedAt: { lte: cutoff },
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (due.length === 0) break;

      let movedInBatch = 0;
      for (const action of due) {
        if (
          await this.moveOneStaleVerificationToReview(
            businessId,
            action.id,
            cutoff,
            now,
          )
        ) {
          moved += 1;
          movedInBatch += 1;
        }
      }
      // If every candidate changed concurrently, don't spin on the same stale rows.
      if (movedInBatch === 0 || due.length < BATCH_SIZE) break;
    }
    return moved;
  }

  private async moveOneStaleVerificationToReview(
    businessId: string,
    actionId: string,
    cutoff: Date,
    now: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'verification_pending',
          toState: 'needs_review',
          eventType: 'verification_outcome_unknown',
          reason: STALE_VERIFICATION_REASON,
          metadata: {
            staleCutoff: cutoff.toISOString(),
            providerConfirmed: false,
          },
          updatedAtLte: cutoff,
          update: {
            errorCode: 'SPECIALIST_ACTION_VERIFICATION_OUTCOME_UNKNOWN',
            errorMessage: STALE_VERIFICATION_REASON,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId: null,
            action: 'specialist_agent.action.verification_outcome_unknown',
            entity: 'specialist_agent_action',
            entityId: actionId,
            after: {
              state: 'needs_review',
              reasonCode: 'stale_verification_outcome_unknown',
              providerConfirmed: false,
              reconciledAt: now.toISOString(),
            },
          },
        });
      });
      return true;
    } catch (error) {
      const response =
        error instanceof AppException ? error.getResponse() : null;
      if (
        response &&
        typeof response === 'object' &&
        'code' in response &&
        response.code === 'SPECIALIST_ACTION_STATE_CHANGED'
      ) {
        return false;
      }
      throw error;
    }
  }

  async reconcileStaleBusinessExecutions(
    businessId: string,
    staleMinutes: number,
    now = new Date(),
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000);
    let moved = 0;

    for (;;) {
      const due = await this.prisma.specialistAgentAction.findMany({
        where: {
          businessId,
          state: 'executing',
          updatedAt: { lte: cutoff },
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (due.length === 0) break;

      let movedInBatch = 0;
      for (const action of due) {
        if (
          await this.moveOneStaleExecutionToReview(
            businessId,
            action.id,
            cutoff,
            now,
          )
        ) {
          moved += 1;
          movedInBatch += 1;
        }
      }
      // If every candidate lost a concurrent claim but remains eligible, avoid spinning forever.
      if (movedInBatch === 0 || due.length < BATCH_SIZE) break;
    }
    return moved;
  }

  private async moveOneStaleExecutionToReview(
    businessId: string,
    actionId: string,
    cutoff: Date,
    now: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'executing',
          toState: 'needs_review',
          eventType: 'execution_outcome_unknown',
          reason: STALE_EXECUTION_REASON,
          metadata: { staleCutoff: cutoff.toISOString() },
          updatedAtLte: cutoff,
          update: {
            errorCode: 'SPECIALIST_ACTION_OUTCOME_UNKNOWN',
            errorMessage: STALE_EXECUTION_REASON,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId: null,
            action: 'specialist_agent.action.execution_outcome_unknown',
            entity: 'specialist_agent_action',
            entityId: actionId,
            after: {
              state: 'needs_review',
              reasonCode: 'stale_execution_outcome_unknown',
              reconciledAt: now.toISOString(),
            },
          },
        });
      });
      return true;
    } catch (error) {
      const response =
        error instanceof AppException ? error.getResponse() : null;
      if (
        response &&
        typeof response === 'object' &&
        'code' in response &&
        response.code === 'SPECIALIST_ACTION_STATE_CHANGED'
      ) {
        return false;
      }
      throw error;
    }
  }

  async expireBusinessApprovals(businessId: string, now = new Date()) {
    let expiredCount = 0;
    for (;;) {
      const due = await this.prisma.specialistAgentAction.findMany({
        where: {
          businessId,
          state: 'approval_required',
          approvalExpiresAt: { lte: now },
        },
        orderBy: [{ approvalExpiresAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (due.length === 0) break;

      for (const action of due) {
        if (await this.expireOneIfDue(businessId, action.id, now)) {
          expiredCount += 1;
        }
      }
      if (due.length < BATCH_SIZE) break;
    }
    return expiredCount;
  }

  async expireOneIfDue(businessId: string, actionId: string, now = new Date()) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await transitionSpecialistAgentAction(tx, {
          businessId,
          actionId,
          fromState: 'approval_required',
          toState: 'expired',
          eventType: 'approval_expired',
          reason: EXPIRY_REASON,
          approvalExpiresAtLte: now,
          update: { closedAt: now },
        });
      });
      return true;
    } catch (error) {
      const response =
        error instanceof AppException ? error.getResponse() : null;
      if (
        response &&
        typeof response === 'object' &&
        'code' in response &&
        response.code === 'SPECIALIST_ACTION_STATE_CHANGED'
      ) {
        return false;
      }
      throw error;
    }
  }

  async assertActionApprovalNotExpired(action: {
    businessId: string;
    id: string;
    state: string;
    approvalExpiresAt: Date | null;
  }) {
    if (
      action.state !== 'approval_required' ||
      !action.approvalExpiresAt ||
      action.approvalExpiresAt.getTime() > Date.now()
    ) {
      return;
    }

    await this.expireOneIfDue(action.businessId, action.id);
    const current = await this.prisma.specialistAgentAction.findFirst({
      where: { businessId: action.businessId, id: action.id },
      select: { state: true },
    });
    if (!current) {
      throw new AppException(
        'SPECIALIST_ACTION_NOT_FOUND',
        'The specialist action is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (current.state === 'expired') {
      throw new AppException(
        'SPECIALIST_ACTION_APPROVAL_EXPIRED',
        'This approval expired. Refresh the proposal and request a new review before continuing.',
        HttpStatus.CONFLICT,
      );
    }
  }
}
