import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { RecordSpecialistAgentToolCallInput } from './specialist-agent-tool-call.util';

type RunCreatedEventSource = {
  id: string;
  businessId: string;
  agentKey: string;
  agentVersion: string;
  agentConfigVersion: number | null;
  moduleId: string;
  triggerType: string;
  initiatedByUserId: string | null;
  startedAt?: Date;
  createdAt: Date;
};

/** Persist the run-created timeline event in the same transaction as its run row. */
export async function recordSpecialistAgentRunCreatedEvent(
  tx: object,
  run: RunCreatedEventSource,
) {
  await recordSpecialistAgentRunEvent(
    tx,
    run,
    'agent.run.created',
    run.createdAt,
    { triggerType: run.triggerType },
  );
}

/** Persist the point at which a directly executed specialist begins its review. */
export async function recordSpecialistAgentRunStartedEvent(
  tx: object,
  run: RunCreatedEventSource,
  occurredAt = new Date(),
) {
  await recordSpecialistAgentRunEvent(
    tx,
    run,
    'agent.run.started',
    run.startedAt ?? occurredAt,
    { status: 'running', triggerType: run.triggerType },
  );
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

const TOOL_EVENT_NAMES: Record<string, string> = {
  running: 'agent.tool.started',
  succeeded: 'agent.tool.succeeded',
  refused: 'agent.tool.refused',
  blocked: 'agent.tool.blocked',
  failed: 'agent.tool.failed',
};

/** Persist a metadata-only tool lifecycle event alongside its redacted tool-call record. */
export async function recordSpecialistAgentToolEvent(
  tx: object,
  input: RecordSpecialistAgentToolCallInput,
  occurredAt = new Date(),
) {
  const eventName = TOOL_EVENT_NAMES[input.status];
  const round = input.round ?? 1;
  const sequence = input.sequence;
  const dedupeKey = createHash('sha256')
    .update(
      `${input.businessId}:${input.runId}:${input.agentKey}:${round}:${sequence}:${input.status}`,
    )
    .digest('hex');
  const safeErrorCode =
    input.errorCode && /^[A-Z0-9_]{1,64}$/.test(input.errorCode)
      ? input.errorCode
      : null;

  // Tool inputs, output values, and resource identifiers stay in canonical module
  // storage (or the redacted tool-call ledger), never in this shared timeline.
  const transactionClient = tx as Prisma.TransactionClient;
  await transactionClient.specialistAgentRunEvent.createMany({
    data: [
      {
        id: randomUUID(),
        dedupeKey,
        businessId: input.businessId,
        runId: input.runId,
        eventName,
        occurredAt,
        sourceModule: input.moduleId,
        entityId: `tool:${round}:${sequence}`,
        entityVersion: String(input.toolVersion ?? 1),
        schemaVersion: 1,
        correlationId: input.correlationId,
        actorUserId: input.actorUserId ?? null,
        payload: {
          agentKey: input.agentKey,
          toolKey: input.toolKey,
          toolVersion: input.toolVersion ?? 1,
          round,
          sequence,
          status: input.status,
          durationMs: input.durationMs ?? null,
          errorCode: safeErrorCode,
        },
      },
    ],
    skipDuplicates: true,
  });
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
