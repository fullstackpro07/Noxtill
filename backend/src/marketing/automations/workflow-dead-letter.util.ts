import {
  Prisma,
  Role,
  WorkflowDeadLetterDecisionAction,
  WorkflowDeadLetterNextAction,
  WorkflowDeadLetterStatus,
} from '@prisma/client';
import { MAX_WORKFLOW_RETRIES } from './workflows.constants';

const MAX_ERROR_LENGTH = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeError(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /\b(?:sk-(?:ant|proj|live)-|re_)[A-Za-z0-9_-]{8,}\b/gi,
      '[REDACTED]',
    )
    .replace(/\bAC[a-f0-9]{32}\b/gi, '[REDACTED]')
    .slice(0, MAX_ERROR_LENGTH);
}

function failureEvidence(
  result: unknown,
  error: string | null,
): {
  failedActions: Array<{
    actionIndex: number | null;
    type: string | null;
    retryable: boolean;
    error: string | null;
  }>;
  hasSafeRetry: boolean;
  failureCode: string;
  error: string | null;
} {
  const actionResults = Array.isArray(result) ? result : [];
  const failedActions = actionResults.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (item.queued !== false && item.completed !== false) return [];
    return [
      {
        actionIndex:
          typeof item.actionIndex === 'number' &&
          Number.isInteger(item.actionIndex)
            ? item.actionIndex
            : null,
        type: typeof item.type === 'string' ? item.type.slice(0, 100) : null,
        retryable: item.retryable !== false,
        error: safeError(item.error),
      },
    ];
  });
  const hasSafeRetry = failedActions.some((action) => action.retryable);
  const failureCode =
    failedActions.length === 0
      ? 'runtime_failure_no_action_evidence'
      : hasSafeRetry
        ? 'retry_budget_exhausted'
        : 'non_retryable_action_failure';

  return {
    failedActions,
    hasSafeRetry,
    failureCode,
    error: safeError(error),
  };
}

function auditSnapshot(input: {
  status: WorkflowDeadLetterStatus;
  nextAction: WorkflowDeadLetterNextAction;
  ownerUserId: string | null;
  failureCode: string;
  workflowRunId: string;
}) {
  return {
    status: input.status,
    nextAction: input.nextAction,
    ownerUserId: input.ownerUserId,
    failureCode: input.failureCode,
    workflowRunId: input.workflowRunId,
  } satisfies Prisma.InputJsonObject;
}

async function writeSystemDecision(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    deadLetterId: string;
    action: WorkflowDeadLetterDecisionAction;
    reason: string;
    before?: Prisma.InputJsonObject;
    after: Prisma.InputJsonObject;
  },
) {
  await tx.workflowDeadLetterDecision.create({
    data: {
      businessId: input.businessId,
      deadLetterId: input.deadLetterId,
      action: input.action,
      reason: input.reason,
      before: input.before,
      after: input.after,
    },
  });
  await tx.auditLog.create({
    data: {
      businessId: input.businessId,
      action: `workflow_dead_letter.${input.action}`,
      entity: 'workflow-dead-letter',
      entityId: input.deadLetterId,
      before: input.before,
      after: input.after,
    },
  });
}

/**
 * Atomically retains unretryable/exhausted failures beside the terminal WorkflowRun update.
 * Trigger payloads are deliberately not copied into evidence; detailed canonical evidence stays
 * on the tenant-scoped workflow run and its immutable attempt rows.
 */
export async function captureWorkflowDeadLetter(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    workflowId: string;
    workflowRunId: string;
    workflowVersion: number;
    retryCount: number;
    attemptNumber: number;
    result: unknown;
    error: string | null;
  },
): Promise<void> {
  const failure = failureEvidence(input.result, input.error);
  const exhausted = input.retryCount >= MAX_WORKFLOW_RETRIES;
  if (failure.hasSafeRetry && !exhausted) return;

  const existing = await tx.workflowDeadLetter.findUnique({
    where: { workflowRunId: input.workflowRunId },
  });
  if (existing && existing.status !== WorkflowDeadLetterStatus.open) return;

  const owner = await tx.businessUser.findFirst({
    where: { businessId: input.businessId, role: Role.owner, active: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { userId: true },
  });
  const ownerUserId = existing?.ownerUserId ?? owner?.userId ?? null;
  const retryInProgress =
    existing?.status === WorkflowDeadLetterStatus.open &&
    existing.operatorRetryCount > 0 &&
    existing.nextAction === WorkflowDeadLetterNextAction.retry;
  const nextAction = retryInProgress
    ? existing.nextAction
    : failure.hasSafeRetry && (existing?.operatorRetryCount ?? 0) === 0
      ? WorkflowDeadLetterNextAction.retry
      : WorkflowDeadLetterNextAction.manual_review;
  const evidence = {
    schemaVersion: 1,
    workflowRunId: input.workflowRunId,
    workflowVersion: input.workflowVersion,
    retryCount: input.retryCount,
    attemptNumber: input.attemptNumber,
    failureCode: failure.failureCode,
    error: failure.error,
    failedActions: failure.failedActions,
  } satisfies Prisma.InputJsonObject;

  if (existing) {
    const before = auditSnapshot({
      status: existing.status,
      nextAction: existing.nextAction,
      ownerUserId: existing.ownerUserId,
      failureCode: existing.failureCode,
      workflowRunId: input.workflowRunId,
    });
    const updated = await tx.workflowDeadLetter.update({
      where: { id: existing.id },
      data: { evidence, failureCode: failure.failureCode, nextAction },
    });
    await writeSystemDecision(tx, {
      businessId: input.businessId,
      deadLetterId: updated.id,
      action: WorkflowDeadLetterDecisionAction.refreshed,
      reason: `Terminal failure evidence refreshed: ${failure.failureCode}`,
      before,
      after: auditSnapshot({
        status: updated.status,
        nextAction: updated.nextAction,
        ownerUserId: updated.ownerUserId,
        failureCode: updated.failureCode,
        workflowRunId: input.workflowRunId,
      }),
    });
    return;
  }

  const created = await tx.workflowDeadLetter.create({
    data: {
      businessId: input.businessId,
      workflowId: input.workflowId,
      workflowRunId: input.workflowRunId,
      ownerUserId,
      ownerRole: Role.owner,
      nextAction,
      failureCode: failure.failureCode,
      evidence,
    },
  });
  await writeSystemDecision(tx, {
    businessId: input.businessId,
    deadLetterId: created.id,
    action: WorkflowDeadLetterDecisionAction.created,
    reason: `Terminal workflow failure retained: ${failure.failureCode}`,
    after: auditSnapshot({
      status: created.status,
      nextAction: created.nextAction,
      ownerUserId: created.ownerUserId,
      failureCode: created.failureCode,
      workflowRunId: input.workflowRunId,
    }),
  });
}
