import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../filters/app.exception';
import { resolvePolicies } from '../policies/policies.service';
import type { TenantPrismaService } from '../tenancy/tenant-prisma.service';

type SpecialistAgentActionClient = Pick<
  TenantPrismaService['client'],
  | 'business'
  | 'specialistAgentAction'
  | 'specialistAgentActionEvent'
  | '$queryRaw'
>;

async function nextActionEventSequence(
  tx: SpecialistAgentActionClient,
  actionId: string,
) {
  const lastEvent = await tx.specialistAgentActionEvent.findFirst({
    where: { actionId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  return (lastEvent?.sequence ?? 0) + 1;
}

export const SPECIALIST_AGENT_ACTION_STATES = {
  proposed: ['approval_required', 'rejected', 'cancelled', 'expired'],
  approval_required: ['proposed', 'approved', 'rejected', 'cancelled', 'expired'],
  approved: ['execution_queued', 'needs_review', 'cancelled'],
  execution_queued: ['executing', 'cancelled', 'needs_review'],
  executing: ['succeeded', 'failed', 'partially_succeeded', 'needs_review'],
  succeeded: ['verification_pending'],
  partially_succeeded: ['verification_pending', 'needs_review'],
  verification_pending: ['verified', 'verification_failed', 'needs_review'],
  verification_failed: ['execution_queued', 'needs_review', 'closed'],
  verified: ['outcome_monitoring', 'closed'],
  outcome_monitoring: ['outcome_measured', 'outcome_inconclusive', 'closed'],
  outcome_measured: ['closed'],
  outcome_inconclusive: ['closed'],
  failed: ['execution_queued', 'needs_review', 'closed'],
  rejected: ['closed'],
  expired: ['closed'],
  cancelled: ['closed'],
  needs_review: ['execution_queued', 'closed'],
  closed: [],
} as const satisfies Record<string, readonly string[]>;

export type SpecialistAgentActionState = keyof typeof SPECIALIST_AGENT_ACTION_STATES;

export function specialistAgentActionIdempotencyHash(input: {
  businessId: string;
  agentKey: string;
  actionType: string;
  recommendationId: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.businessId}:${input.agentKey}:${input.actionType}:${input.recommendationId}`,
    )
    .digest('hex');
}

export async function createSpecialistAgentAction(
  tx: SpecialistAgentActionClient,
  input: {
    data: Prisma.SpecialistAgentActionUncheckedCreateInput;
    actorUserId: string;
    reason: string;
    eventType?: string;
  },
) {
  // Serialize action proposals for this run so concurrent workers cannot both pass the cap.
  const lockedRuns = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM specialist_agent_runs WHERE id = ${input.data.runId} AND business_id = ${input.data.businessId} FOR UPDATE`,
  );
  if (!lockedRuns.length) {
    throw new AppException(
      'SPECIALIST_AGENT_RUN_NOT_FOUND',
      'The specialist run is not available in this business.',
      HttpStatus.NOT_FOUND,
    );
  }

  const existing = await tx.specialistAgentAction.findFirst({
    where: {
      businessId: input.data.businessId,
      idempotencyKeyHash: input.data.idempotencyKeyHash,
    },
  });
  if (existing) {
    if (
      existing.canonicalResourceType !== input.data.canonicalResourceType ||
      existing.canonicalResourceId !== input.data.canonicalResourceId
    ) {
      throw new AppException(
        'SPECIALIST_ACTION_IDEMPOTENCY_CONFLICT',
        'This action idempotency key is already linked to a different canonical resource.',
        HttpStatus.CONFLICT,
      );
    }
    return existing;
  }

  const business = await tx.business.findUnique({
    where: { id: input.data.businessId },
    select: { policies: true },
  });
  const maxActionsPerRun =
    resolvePolicies(business).num('agents.maxMaterialActionsPerRun') ?? 10;
  const existingCount = await tx.specialistAgentAction.count({
    where: {
      businessId: input.data.businessId,
      runId: input.data.runId,
    },
  });
  if (existingCount >= maxActionsPerRun) {
    throw new AppException(
      'SPECIALIST_AGENT_ACTION_RUN_LIMIT_REACHED',
      `This specialist run reached its material-action limit (${maxActionsPerRun}). Review existing proposals before starting another run.`,
      HttpStatus.CONFLICT,
    );
  }

  const action = await tx.specialistAgentAction.create({ data: input.data });
  await tx.specialistAgentActionEvent.create({
    data: {
      businessId: action.businessId,
      actionId: action.id,
      eventType: input.eventType ?? 'created',
      sequence: await nextActionEventSequence(tx, action.id),
      fromState: null,
      toState: action.state,
      actorUserId: input.actorUserId,
      reason: input.reason,
      metadata: {
        actionType: action.actionType,
        canonicalResourceType: action.canonicalResourceType,
        canonicalResourceId: action.canonicalResourceId,
        maxActionsPerRun,
        actionCountForRun: existingCount + 1,
      },
    },
  });
  return action;
}

export async function transitionSpecialistAgentAction(
  tx: SpecialistAgentActionClient,
  input: {
    businessId: string;
    actionId: string;
    fromState: SpecialistAgentActionState;
    toState: SpecialistAgentActionState;
    actorUserId?: string | null;
    eventType?: string;
    reason?: string;
    metadata?: Prisma.InputJsonObject;
    update?: Prisma.SpecialistAgentActionUpdateManyMutationInput;
  },
) {
  if (!SPECIALIST_AGENT_ACTION_STATES[input.fromState].includes(input.toState as never)) {
    throw new AppException(
      'SPECIALIST_ACTION_INVALID_TRANSITION',
      `A specialist action cannot move from ${input.fromState} to ${input.toState}.`,
      HttpStatus.CONFLICT,
    );
  }

  const updated = await tx.specialistAgentAction.updateMany({
    where: {
      id: input.actionId,
      businessId: input.businessId,
      state: input.fromState,
    },
    data: { ...input.update, state: input.toState },
  });
  if (updated.count !== 1) {
    throw new AppException(
      'SPECIALIST_ACTION_STATE_CHANGED',
      'This specialist action changed before the requested decision was saved. Refresh and try again.',
      HttpStatus.CONFLICT,
    );
  }

  await tx.specialistAgentActionEvent.create({
    data: {
      businessId: input.businessId,
      actionId: input.actionId,
      eventType: input.eventType ?? 'state_transition',
      sequence: await nextActionEventSequence(tx, input.actionId),
      fromState: input.fromState,
      toState: input.toState,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      metadata: input.metadata ?? {},
    },
  });
}

export async function recordSpecialistAgentActionProposalRevision(
  tx: SpecialistAgentActionClient,
  input: {
    businessId: string;
    actionId: string;
    actorUserId: string;
    expectedVersion: number;
    proposedPayload: Prisma.InputJsonObject;
    reason: string;
  },
) {
  const updated = await tx.specialistAgentAction.updateMany({
    where: {
      id: input.actionId,
      businessId: input.businessId,
      state: 'proposed',
    },
    data: {
      expectedVersion: input.expectedVersion,
      proposedPayload: input.proposedPayload,
    },
  });
  if (updated.count !== 1) {
    throw new AppException(
      'SPECIALIST_ACTION_STATE_CHANGED',
      'The linked action is no longer an editable proposal.',
      HttpStatus.CONFLICT,
    );
  }
  await tx.specialistAgentActionEvent.create({
    data: {
      businessId: input.businessId,
      actionId: input.actionId,
      eventType: 'proposal_updated',
      sequence: await nextActionEventSequence(tx, input.actionId),
      fromState: 'proposed',
      toState: 'proposed',
      actorUserId: input.actorUserId,
      reason: input.reason,
      metadata: { expectedVersion: input.expectedVersion },
    },
  });
}

export async function transitionSpecialistAgentActionForResource(
  tx: SpecialistAgentActionClient,
  input: {
    businessId: string;
    actionType: string;
    canonicalResourceType: string;
    canonicalResourceId: string;
    fromState: SpecialistAgentActionState;
    toState: SpecialistAgentActionState;
    actorUserId: string;
    eventType?: string;
    reason?: string;
    update?: Prisma.SpecialistAgentActionUpdateManyMutationInput;
    required?: boolean;
  },
) {
  const action = await tx.specialistAgentAction.findFirst({
    where: {
      businessId: input.businessId,
      actionType: input.actionType,
      canonicalResourceType: input.canonicalResourceType,
      canonicalResourceId: input.canonicalResourceId,
    },
    select: { id: true },
  });
  if (!action) {
    if (!input.required) return false;
    throw new AppException(
      'SPECIALIST_ACTION_NOT_FOUND',
      'The specialist action record is missing for this canonical resource.',
      HttpStatus.CONFLICT,
    );
  }
  await transitionSpecialistAgentAction(tx, {
    businessId: input.businessId,
    actionId: action.id,
    fromState: input.fromState,
    toState: input.toState,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    reason: input.reason,
    update: input.update,
  });
  return true;
}
