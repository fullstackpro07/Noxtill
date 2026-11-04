import { HttpStatus, Injectable } from '@nestjs/common';
import { resolvePolicies } from '../common/policies/policies.service';
import { AppException } from '../common/filters/app.exception';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { SPECIALIST_AGENT_REGISTRY } from '../common/agents/specialist-agent-registry';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

@Injectable()
export class SpecialistAgentDirectoryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {}

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
