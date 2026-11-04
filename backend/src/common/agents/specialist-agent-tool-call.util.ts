import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export type SpecialistAgentToolCallStatus =
  'running' | 'succeeded' | 'refused' | 'blocked' | 'failed';
export type CompletedSpecialistAgentToolCallStatus = Exclude<
  SpecialistAgentToolCallStatus,
  'running'
>;

export interface RecordSpecialistAgentToolCallInput {
  businessId: string;
  runId: string;
  agentKey: string;
  moduleId: string;
  toolKey: string;
  toolVersion?: number;
  round?: number;
  sequence: number;
  status: SpecialistAgentToolCallStatus;
  input: unknown;
  outputResourceType?: string | null;
  outputResourceId?: string | null;
  durationMs?: number | null;
  retryable?: boolean;
  errorCode?: string | null;
  correlationId: string;
  finishedAt?: Date | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function summarizeInputFields(input: unknown): Prisma.InputJsonArray {
  if (!isRecord(input)) return [];
  return Object.keys(input)
    .filter((key) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 32);
}

/**
 * Persist a minimal, redacted record of one registered tool call. Input values and tool output
 * are intentionally excluded; the hash and field names are sufficient for diagnostics without
 * copying customer or commerce data into shared agent telemetry.
 */
export function specialistAgentToolCallUpsertArgs(
  input: RecordSpecialistAgentToolCallInput,
): Prisma.SpecialistAgentToolCallUpsertArgs {
  const serializedInput = JSON.stringify(canonicalize(input.input));
  const inputSha256 = createHash('sha256')
    .update(serializedInput ?? 'null')
    .digest('hex');
  const round = input.round ?? 1;
  const finishedAt =
    input.finishedAt === undefined ? new Date() : input.finishedAt;

  return {
    where: {
      runId_round_sequence: {
        runId: input.runId,
        round,
        sequence: input.sequence,
      },
    },
    create: {
      businessId: input.businessId,
      runId: input.runId,
      agentKey: input.agentKey,
      moduleId: input.moduleId,
      toolKey: input.toolKey,
      toolVersion: input.toolVersion ?? 1,
      round,
      sequence: input.sequence,
      status: input.status,
      inputSha256,
      inputFields: summarizeInputFields(input.input),
      outputResourceType: input.outputResourceType ?? null,
      outputResourceId: input.outputResourceId ?? null,
      durationMs: input.durationMs ?? null,
      retryable: input.retryable ?? false,
      errorCode: input.errorCode ?? null,
      correlationId: input.correlationId,
      finishedAt,
    },
    update: {
      toolKey: input.toolKey,
      toolVersion: input.toolVersion ?? 1,
      status: input.status,
      inputSha256,
      inputFields: summarizeInputFields(input.input),
      outputResourceType: input.outputResourceType ?? null,
      outputResourceId: input.outputResourceId ?? null,
      durationMs: input.durationMs ?? null,
      retryable: input.retryable ?? false,
      errorCode: input.errorCode ?? null,
      correlationId: input.correlationId,
      finishedAt,
    },
  };
}
