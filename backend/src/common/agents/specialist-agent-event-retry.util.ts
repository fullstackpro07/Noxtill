import { PrismaService } from '../../prisma/prisma.service';
import { specialistAgentIdempotencyHash } from './specialist-agent-run-idempotency.util';

export const SPECIALIST_AGENT_EVENT_ATTEMPT_LIMIT = 5;

export type SpecialistAgentEventAttempt = {
  shouldRun: boolean;
  idempotencyKey: string;
};

/**
 * Selects a stable, bounded idempotency key for a BullMQ specialist-event attempt.
 * Failed earlier attempts do not block a retry; completed or running attempts still
 * prevent duplicate work. Inactive or deleted businesses are never scheduled from a
 * stale queued event. Raw keys are only passed to the normal run service, which persists
 * their hashes rather than the keys themselves.
 */
export async function resolveSpecialistAgentEventAttempt(
  prisma: PrismaService,
  input: {
    businessId: string;
    agentKey: string;
    baseIdempotencyKey: string;
    attemptsMade: number;
  },
): Promise<SpecialistAgentEventAttempt> {
  const attemptsMade = Math.min(
    Math.max(0, Math.floor(input.attemptsMade || 0)),
    SPECIALIST_AGENT_EVENT_ATTEMPT_LIMIT - 1,
  );
  const attemptKeys = Array.from(
    { length: SPECIALIST_AGENT_EVENT_ATTEMPT_LIMIT },
    (_, index) =>
      index === 0
        ? input.baseIdempotencyKey
        : `${input.baseIdempotencyKey}:retry:${index}`,
  );
  const idempotencyKey = attemptKeys[attemptsMade] ?? input.baseIdempotencyKey;
  const business = await prisma.business.findFirst({
    where: { id: input.businessId, active: true },
    select: { id: true },
  });
  if (!business) return { shouldRun: false, idempotencyKey };

  const currentAttemptHash = specialistAgentIdempotencyHash(idempotencyKey);
  const existingRuns = await prisma.specialistAgentRun.findMany({
    where: {
      businessId: input.businessId,
      agentKey: input.agentKey,
      triggerType: 'event',
      idempotencyKeyHash: {
        in: attemptKeys.map(specialistAgentIdempotencyHash),
      },
    },
    select: { idempotencyKeyHash: true, status: true },
  });

  const shouldRun = !existingRuns.some(
    (run) =>
      run.status === 'completed' ||
      run.status === 'running' ||
      run.idempotencyKeyHash === currentAttemptHash,
  );

  return { shouldRun, idempotencyKey };
}
