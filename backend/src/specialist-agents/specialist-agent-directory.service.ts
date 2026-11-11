import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { AppException } from '../common/filters/app.exception';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { SPECIALIST_AGENT_REGISTRY } from '../common/agents/specialist-agent-registry';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { PoliciesService } from '../common/policies/policies.service';
import { POLICY_DEFS } from '../common/policies/policies.constants';
import {
  recordSpecialistAgentConfigVersion,
  specialistAgentConfiguration,
} from '../common/agents/specialist-agent-config.util';

type AgentConfigBusiness = {
  policies: Prisma.JsonValue | null;
  aiFeatureToggles: Prisma.JsonValue | null;
  aiMonthlyCostCapUsd: Prisma.Decimal;
  aiRateLimitPerMinute: number;
  aiQueryQuota: number;
};

@Injectable()
export class SpecialistAgentDirectoryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly prisma: PrismaService,
    private readonly policiesService: PoliciesService,
  ) {}

  private agentDefinition(agentKey: string) {
    const definition = SPECIALIST_AGENT_REGISTRY.find(
      (agent) => agent.agentKey === agentKey,
    );
    if (!definition) {
      throw new AppException(
        'SPECIALIST_AGENT_KEY_INVALID',
        'Configuration is only available for registered specialist agents.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return definition;
  }

  private editableConfigKeys(agentKey: string): string[] {
    const definition = this.agentDefinition(agentKey);
    return Object.keys(POLICY_DEFS)
      .filter(
        (key) =>
          key.startsWith(`agents.${definition.policyAgentKey}`) ||
          (definition.policyAgentKey === 'commerce' &&
            key === 'commerce.autonomyLevel'),
      )
      .sort();
  }

  private safeConfiguration(
    agentKey: string,
    businessConfiguration: AgentConfigBusiness,
  ) {
    const complete = specialistAgentConfiguration(
      agentKey,
      businessConfiguration,
    );
    return Object.fromEntries(
      this.editableConfigKeys(agentKey).map((key) => [key, complete[key]]),
    );
  }

  private async lockedBusinessConfig(
    tx: Prisma.TransactionClient,
    businessId: string,
  ) {
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
        'The business for this specialist configuration could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return business;
  }

  private async latestConfigVersion(
    tx: Prisma.TransactionClient,
    businessId: string,
    agentKey: string,
  ) {
    const latest = await tx.specialistAgentConfigVersion.findFirst({
      where: { businessId, agentKey },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      select: { version: true, configHash: true, createdAt: true },
    });
    if (!latest) {
      throw new AppException(
        'SPECIALIST_AGENT_CONFIG_VERSION_MISSING',
        'The current specialist configuration version could not be recorded.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return latest;
  }

  async configuration(businessId: string, agentKey: string) {
    this.agentDefinition(agentKey);
    return this.prisma.$transaction(async (tx) => {
      const business = await this.lockedBusinessConfig(tx, businessId);
      await recordSpecialistAgentConfigVersion(
        tx,
        businessId,
        agentKey,
        business,
        null,
      );
      const version = await this.latestConfigVersion(tx, businessId, agentKey);
      return {
        agentKey,
        moduleId: this.agentDefinition(agentKey).moduleId,
        configVersion: version.version,
        configHash: version.configHash,
        updatedAt: version.createdAt.toISOString(),
        settings: this.safeConfiguration(agentKey, business),
      };
    });
  }

  async updateConfiguration(
    businessId: string,
    actorUserId: string,
    agentKey: string,
    input: { expectedVersion: number; settings: Record<string, unknown> },
  ) {
    this.agentDefinition(agentKey);
    const allowed = new Set(this.editableConfigKeys(agentKey));
    const entries = Object.entries(input.settings ?? {});
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1 ||
      entries.length === 0 ||
      entries.length > allowed.size
    ) {
      throw new AppException(
        'SPECIALIST_AGENT_CONFIG_INPUT_INVALID',
        'Provide a current configuration version and one or more allowed specialist settings.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const normalized = new Map<string, boolean | number | string | null>();
    for (const [key, value] of entries) {
      if (!allowed.has(key)) {
        throw new AppException(
          'SPECIALIST_AGENT_CONFIG_KEY_NOT_ALLOWED',
          'This setting is not editable through the specialist configuration API.',
          HttpStatus.BAD_REQUEST,
        );
      }
      normalized.set(key, this.policiesService.normalize(key, value));
    }

    return this.prisma.$transaction(async (tx) => {
      const business = await this.lockedBusinessConfig(tx, businessId);
      await recordSpecialistAgentConfigVersion(
        tx,
        businessId,
        agentKey,
        business,
        null,
      );
      const currentVersion = await this.latestConfigVersion(
        tx,
        businessId,
        agentKey,
      );
      if (currentVersion.version !== input.expectedVersion) {
        throw new AppException(
          'SPECIALIST_AGENT_CONFIG_VERSION_CONFLICT',
          'This specialist configuration changed after you opened it. Refresh and review the current values before saving.',
          HttpStatus.CONFLICT,
        );
      }

      const beforeSettings = this.safeConfiguration(agentKey, business);
      const changed = [...normalized].filter(
        ([key, value]) => beforeSettings[key] !== value,
      );
      if (changed.length === 0) {
        return {
          agentKey,
          moduleId: this.agentDefinition(agentKey).moduleId,
          configVersion: currentVersion.version,
          configHash: currentVersion.configHash,
          updatedAt: currentVersion.createdAt.toISOString(),
          settings: beforeSettings,
          changed: false,
        };
      }

      const currentPolicies =
        business.policies &&
        typeof business.policies === 'object' &&
        !Array.isArray(business.policies)
          ? (business.policies as Record<string, unknown>)
          : {};
      const nextPolicies = { ...currentPolicies };
      for (const [key, value] of changed) nextPolicies[key] = value;
      await tx.business.update({
        where: { id: businessId },
        data: { policies: nextPolicies as Prisma.InputJsonValue },
      });
      const nextBusiness = {
        ...business,
        policies: nextPolicies as Prisma.JsonValue,
      };
      await recordSpecialistAgentConfigVersion(
        tx,
        businessId,
        agentKey,
        nextBusiness,
        actorUserId,
      );
      const nextVersion = await this.latestConfigVersion(
        tx,
        businessId,
        agentKey,
      );
      const afterSettings = this.safeConfiguration(agentKey, nextBusiness);
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'specialist_agent.configuration_updated',
          entity: 'Business',
          entityId: businessId,
          before: {
            agentKey,
            configVersion: currentVersion.version,
            settings: beforeSettings as Prisma.InputJsonObject,
          },
          after: {
            agentKey,
            configVersion: nextVersion.version,
            settings: afterSettings as Prisma.InputJsonObject,
          },
        },
      });
      return {
        agentKey,
        moduleId: this.agentDefinition(agentKey).moduleId,
        configVersion: nextVersion.version,
        configHash: nextVersion.configHash,
        updatedAt: nextVersion.createdAt.toISOString(),
        settings: afterSettings,
        changed: true,
      };
    });
  }

  async list(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { policies: true },
    });
    if (!business) {
      throw new AppException(
        'SPECIALIST_AGENT_BUSINESS_NOT_FOUND',
        'The business for this agent directory could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const policies = resolvePolicies(business);
    const items = await Promise.all(
      SPECIALIST_AGENT_REGISTRY.map(async (agent) => {
        const moduleEnabled = await this.agentPolicy.isModuleEnabledForBusiness(
          businessId,
          agent.policyAgentKey,
        );
        const agentEnabled = policies.bool(agent.enabledPolicy);
        return {
          agentKey: agent.agentKey,
          moduleId: agent.moduleId,
          moduleKey: agent.moduleKey,
          label: agent.label,
          allowedTriggers: [...agent.allowedTriggers],
          agentEnabled,
          moduleEnabled,
          enabled: agentEnabled && moduleEnabled,
          dailyReviewEnabled: policies.bool(agent.schedulePolicy),
        };
      }),
    );

    return { items };
  }

  async configurationHistory(
    businessId: string,
    agentKey: string,
    requestedLimit?: string,
  ) {
    if (
      !SPECIALIST_AGENT_REGISTRY.some((agent) => agent.agentKey === agentKey)
    ) {
      throw new AppException(
        'SPECIALIST_AGENT_KEY_INVALID',
        'Configuration history is only available for registered specialist agents.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const parsedLimit =
      requestedLimit === undefined ? 20 : Number(requestedLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new AppException(
        'SPECIALIST_AGENT_CONFIG_HISTORY_LIMIT_INVALID',
        'Configuration history limit must be a whole number from 1 to 50.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const items =
      await this.tenantPrisma.client.specialistAgentConfigVersion.findMany({
        where: { businessId, agentKey },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        take: parsedLimit,
        select: {
          id: true,
          agentKey: true,
          version: true,
          configHash: true,
          configuration: true,
          changedByUserId: true,
          createdAt: true,
        },
      });
    return {
      agentKey,
      items,
      limit: parsedLimit,
      hasMore: items.length === parsedLimit,
    };
  }
}
