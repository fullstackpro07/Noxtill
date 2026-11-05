import { createHash } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../filters/app.exception';
import { assertSpecialistAgentRunContract } from './specialist-agent-registry';

export const SPECIALIST_AGENT_RUN_DETAILS_INCLUDE = {
  recommendations: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
    },
  },
  aiCallLogs: {
    select: {
      id: true,
      kind: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostUsd: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.SpecialistAgentRunInclude;

type SpecialistRunIdentity = {
  id: string;
  businessId: string;
  agentKey: string;
  initiatedByUserId: string | null;
  idempotencyRequestHash: string | null;
  status: string;
};

type CreateRun<T extends SpecialistRunIdentity> = (
  data: Prisma.SpecialistAgentRunUncheckedCreateInput,
) => Promise<T>;

type FindRunByKey<T extends SpecialistRunIdentity> = (
  businessId: string,
  agentKey: string,
  idempotencyKeyHash: string,
) => Promise<T | null>;
type ResolveAgentConfigVersion = (
  businessId: string,
  agentKey: string,
) => Promise<number>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

export function specialistAgentIdempotencyHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function conflict(): AppException {
  return new AppException(
    'SPECIALIST_AGENT_IDEMPOTENCY_CONFLICT',
    'This run request key was already used for a different request or user. Start a new run with a new key.',
    HttpStatus.CONFLICT,
  );
}

/**
 * Atomically deduplicates specialist run creation through the database unique key. Only a hash
 * of the client key is stored; the normalized input hash and initiating user prevent accidental
 * or cross-user reuse from returning another request's run.
 */
export async function createOrReuseSpecialistAgentRun<
  T extends SpecialistRunIdentity,
>(
  create: CreateRun<T>,
  findByKey: FindRunByKey<T>,
  data: Prisma.SpecialistAgentRunUncheckedCreateInput,
  idempotencyKey: string | undefined,
  requestScope: unknown,
  resolveAgentConfigVersion?: ResolveAgentConfigVersion,
): Promise<{ run: T; reused: boolean }> {
  assertSpecialistAgentRunContract(
    data.agentKey,
    data.moduleId,
    data.triggerType,
  );
  const key = idempotencyKey?.trim();
  if (key && (key.length < 8 || key.length > 200 || /[^\x21-\x7e]/.test(key))) {
    throw new AppException(
      'SPECIALIST_AGENT_IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must contain 8–200 printable ASCII characters with no spaces.',
      HttpStatus.BAD_REQUEST,
    );
  }

  const agentConfigVersion = resolveAgentConfigVersion
    ? await resolveAgentConfigVersion(
        String(data.businessId),
        String(data.agentKey),
      )
    : null;
  const runData =
    agentConfigVersion === null ? data : { ...data, agentConfigVersion };
  if (!key) return { run: await create(runData), reused: false };
  const idempotencyKeyHash = specialistAgentIdempotencyHash(key);
  const idempotencyRequestHash = specialistAgentIdempotencyHash(
    stableJson(requestScope),
  );
  try {
    const run = await create({
      ...runData,
      idempotencyKeyHash,
      idempotencyRequestHash,
    });
    return { run, reused: false };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error;
    }

    const existing = await findByKey(
      String(data.businessId),
      String(data.agentKey),
      idempotencyKeyHash,
    );
    if (!existing) throw error;
    if (
      existing.initiatedByUserId !== (data.initiatedByUserId ?? null) ||
      existing.idempotencyRequestHash !== idempotencyRequestHash
    ) {
      throw conflict();
    }
    if (existing.status === 'failed') {
      throw new AppException(
        'SPECIALIST_AGENT_PREVIOUS_RUN_FAILED',
        'The matching run already failed. Start a new run to retry it; the same request key will not repeat work.',
        HttpStatus.CONFLICT,
      );
    }
    return { run: existing, reused: true };
  }
}
