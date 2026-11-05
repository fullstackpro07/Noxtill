import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../filters/app.exception';
import { POLICY_DEFS } from '../policies/policies.constants';
import { SPECIALIST_AGENT_REGISTRY } from './specialist-agent-registry';

const SHARED_AGENT_POLICIES = [
  'agents.maxMaterialActionsPerRun',
  'agents.specialistMaxProviderRequestsPerRun',
  'agents.specialistMaxOutputTokensPerRequest',
  'agents.specialistMaxInputBytesPerRequest',
] as const;

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

export function specialistAgentConfiguration(
  agentKey: string,
  businessConfiguration: unknown,
): Record<string, unknown> {
  const agent = SPECIALIST_AGENT_REGISTRY.find(
    (candidate) => candidate.agentKey === agentKey,
  );
  if (!agent) {
    throw new AppException(
      'SPECIALIST_AGENT_KEY_INVALID',
      'Configuration history is only available for registered specialist agents.',
      HttpStatus.BAD_REQUEST,
    );
  }
  const source =
    businessConfiguration &&
    typeof businessConfiguration === 'object' &&
    !Array.isArray(businessConfiguration)
      ? (businessConfiguration as Record<string, unknown>)
      : {};
  const hasBusinessSettings =
    Object.hasOwn(source, 'policies') ||
    Object.hasOwn(source, 'aiFeatureToggles') ||
    Object.hasOwn(source, 'aiMonthlyCostCapUsd');
  const policies = hasBusinessSettings
    ? source.policies &&
      typeof source.policies === 'object' &&
      !Array.isArray(source.policies)
      ? (source.policies as Record<string, unknown>)
      : {}
    : source;
  const featureToggles =
    source.aiFeatureToggles &&
    typeof source.aiFeatureToggles === 'object' &&
    !Array.isArray(source.aiFeatureToggles)
      ? (source.aiFeatureToggles as Record<string, unknown>)
      : {};
  const prefix = `agents.${agent.policyAgentKey}`;
  const keys = Object.keys(POLICY_DEFS)
    .filter(
      (key) =>
        key.startsWith(`${prefix}`) ||
        SHARED_AGENT_POLICIES.includes(
          key as (typeof SHARED_AGENT_POLICIES)[number],
        ) ||
        (agent.policyAgentKey === 'commerce' &&
          (key === 'commerce.autonomyLevel' ||
            key === 'commerce.agentAllowedWriteTools')),
    )
    .sort();

  const agentConfiguration = Object.fromEntries(
    keys.map((key) => [
      key,
      policies[key] === undefined
        ? POLICY_DEFS[key as keyof typeof POLICY_DEFS].default
        : policies[key],
    ]),
  );
  const rawCostCap = source.aiMonthlyCostCapUsd;
  const costCap =
    rawCostCap === null || rawCostCap === undefined
      ? null
      : rawCostCap instanceof Prisma.Decimal
        ? rawCostCap.toFixed()
        : typeof rawCostCap === 'string' || typeof rawCostCap === 'number'
          ? String(rawCostCap)
          : null;

  return {
    ...agentConfiguration,
    [`ai.featureToggles.${agent.featureToggleKey}`]:
      featureToggles[agent.featureToggleKey] !== false,
    'ai.monthlyCostCapUsd': costCap,
    'ai.rateLimitPerMinute': source.aiRateLimitPerMinute ?? null,
    'ai.queryQuota': source.aiQueryQuota ?? null,
  };
}

async function createVersionIfChanged(
  tx: Prisma.TransactionClient,
  businessId: string,
  agentKey: string,
  businessConfiguration: unknown,
  changedByUserId: string | null,
): Promise<number> {
  const configuration = specialistAgentConfiguration(
    agentKey,
    businessConfiguration,
  );
  const configHash = createHash('sha256')
    .update(stableJson(configuration))
    .digest('hex');
  const current = await tx.specialistAgentConfigVersion.findFirst({
    where: { businessId, agentKey },
    orderBy: { version: 'desc' },
    select: { version: true, configHash: true },
  });
  if (current?.configHash === configHash) return current.version;

  const version = (current?.version ?? 0) + 1;
  await tx.specialistAgentConfigVersion.create({
    data: {
      businessId,
      agentKey,
      version,
      configHash,
      configuration: configuration as Prisma.InputJsonValue,
      changedByUserId,
    },
  });
  return version;
}

/** Must be called while the Business row is locked by the surrounding transaction. */
export async function recordSpecialistAgentConfigVersions(
  tx: Prisma.TransactionClient,
  businessId: string,
  businessConfiguration: unknown,
  changedByUserId: string | null,
): Promise<void> {
  for (const agent of SPECIALIST_AGENT_REGISTRY) {
    await createVersionIfChanged(
      tx,
      businessId,
      agent.agentKey,
      businessConfiguration,
      changedByUserId,
    );
  }
}

/** Save or reuse the immutable settings snapshot that a new run must pin. */
export async function ensureSpecialistAgentConfigVersion(
  prisma: PrismaService,
  businessId: string,
  agentKey: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: {
        policies: true,
        aiFeatureToggles: true,
        aiMonthlyCostCapUsd: true,
        aiRateLimitPerMinute: true,
        aiQueryQuota: true,
      },
    });
    if (!business) {
      throw new AppException(
        'SPECIALIST_AGENT_BUSINESS_NOT_FOUND',
        'The business for this agent configuration could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return createVersionIfChanged(tx, businessId, agentKey, business, null);
  });
}
