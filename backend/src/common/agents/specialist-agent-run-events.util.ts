import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

type RunCreatedEventSource = {
  id: string;
  businessId: string;
  agentKey: string;
  agentVersion: string;
  agentConfigVersion: number | null;
  moduleId: string;
  triggerType: string;
  initiatedByUserId: string | null;
  createdAt: Date;
};

/** Persist the run-created timeline event in the same transaction as its run row. */
export async function recordSpecialistAgentRunCreatedEvent(
  tx: object,
  run: RunCreatedEventSource,
) {
  await recordSpecialistAgentRunEvent(tx, run, 'agent.run.created', run.createdAt, {
    triggerType: run.triggerType,
  });
}

export type SpecialistAgentTerminalStatus =
  | 'completed'
  | 'partial'
  | 'partially_succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped';

const TERMINAL_EVENT_NAMES: Record<SpecialistAgentTerminalStatus, string> = {
  completed: 'agent.run.completed',
  partial: 'agent.run.partial',
  partially_succeeded: 'agent.run.partial',
  failed: 'agent.run.failed',
  cancelled: 'agent.run.cancelled',
  skipped: 'agent.run.skipped',
};

/** Persist a terminal outcome with its status update, without copying run output or errors. */
export async function recordSpecialistAgentRunTerminalEvent(
  tx: object,
  run: RunCreatedEventSource,
  status: SpecialistAgentTerminalStatus,
  occurredAt: Date,
) {
  await recordSpecialistAgentRunEvent(
    tx,
    run,
    TERMINAL_EVENT_NAMES[status],
    occurredAt,
    { status, triggerType: run.triggerType },
    status,
  );
}

async function recordSpecialistAgentRunEvent(
  tx: object,
  run: RunCreatedEventSource,
  eventName: string,
  occurredAt: Date,
  detail: Prisma.InputJsonObject,
  terminalStatus?: SpecialistAgentTerminalStatus,
) {
  const dedupeIdentity = terminalStatus
    ? `${eventName}:${terminalStatus}`
    : eventName;
  const dedupeKey = createHash('sha256')
    .update(`${run.businessId}:${run.id}:${dedupeIdentity}`)
    .digest('hex');

  // TenantPrismaService's client extension types transaction callbacks with an
  // extended client that is structurally equivalent at runtime but not assignable
  // to Prisma.TransactionClient's unextended generated type.
  const transactionClient = tx as Prisma.TransactionClient;
  await transactionClient.specialistAgentRunEvent.createMany({
    data: [
      {
        id: randomUUID(),
        dedupeKey,
        businessId: run.businessId,
        runId: run.id,
        eventName,
        occurredAt,
        sourceModule: run.moduleId,
        entityId: run.id,
        entityVersion: run.agentVersion,
        schemaVersion: 1,
        correlationId: run.id,
        actorUserId: run.initiatedByUserId,
        payload: {
          agentKey: run.agentKey,
          agentVersion: run.agentVersion,
          agentConfigVersion: run.agentConfigVersion,
          ...detail,
        },
      },
    ],
    skipDuplicates: true,
  });
}
