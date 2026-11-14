import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../filters/app.exception';
import { resolvePolicies } from '../policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../tenancy/tenant.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessModulesService } from '../../business-modules/business-modules.service';
import {
  SPECIALIST_AGENT_REGISTRY,
  specialistAgentByPolicyKey,
  type SpecialistAgentPersistedKey,
  type SpecialistAgentPolicyKey,
} from './specialist-agent-registry';

export type SpecialistAgentKey = SpecialistAgentPolicyKey;

export function isSpecialistSourceModuleDisabledError(
  error: unknown,
): error is AppException {
  if (!(error instanceof AppException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'BUSINESS_MODULE_DISABLED'
  );
}

@Injectable()
export class SpecialistAgentPolicyService {
  private readonly businessModules: BusinessModulesService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @Optional() businessModules?: BusinessModulesService,
  ) {
    // Direct service specs can instantiate this class without Nest. Production injects the shared
    // module-selection service so specialist jobs follow the same root/branch selection rules as
    // authenticated API requests.
    this.businessModules =
      businessModules ?? new BusinessModulesService(prisma);
  }

  async disabledModulesFor(businessId: string): Promise<string[]> {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    return this.businessModules.disabledFor(scopedBusinessId);
  }

  disabledModulesForBusiness(businessId: string): Promise<string[]> {
    return this.businessModules.disabledFor(businessId);
  }

  async isModuleEnabled(
    businessId: string,
    agentKey: SpecialistAgentKey,
  ): Promise<boolean> {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    return this.businessModules.isEnabled(
      scopedBusinessId,
      specialistAgentByPolicyKey(agentKey).moduleKey,
    );
  }

  isModuleEnabledForBusiness(
    businessId: string,
    agentKey: SpecialistAgentKey,
  ): Promise<boolean> {
    return this.businessModules.isEnabled(
      businessId,
      specialistAgentByPolicyKey(agentKey).moduleKey,
    );
  }

  async assertEnabled(businessId: string, agentKey: SpecialistAgentKey) {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    const business = await this.prisma.business.findUnique({
      where: { id: scopedBusinessId },
      select: { policies: true },
    });
    if (!business) {
      throw new AppException(
        'SPECIALIST_AGENT_BUSINESS_NOT_FOUND',
        'The business for this agent run could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const definition = specialistAgentByPolicyKey(agentKey);
    await this.businessModules.assertEnabled(
      scopedBusinessId,
      definition.moduleKey,
    );
    if (!resolvePolicies(business).bool(definition.enabledPolicy)) {
      throw new AppException(
        'SPECIALIST_AGENT_DISABLED',
        `${definition.label} is turned off in Settings → AI & Governance.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async assertSourceModulesEnabledForBusiness(
    businessId: string,
    moduleKeys: readonly string[],
  ): Promise<void> {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    for (const moduleKey of new Set(moduleKeys)) {
      await this.businessModules.assertEnabled(scopedBusinessId, moduleKey);
    }
  }

  assertSourceModulesEnabledInTransaction(
    tx: Prisma.TransactionClient,
    businessId: string,
    moduleKeys: readonly string[],
  ): Promise<void> {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    return this.businessModules.assertEnabledInTransaction(
      tx,
      scopedBusinessId,
      moduleKeys,
    );
  }

  async assertAgentEnabledInTransaction(
    tx: Prisma.TransactionClient,
    businessId: string,
    agentKey: SpecialistAgentKey,
  ): Promise<void> {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    const definition = specialistAgentByPolicyKey(agentKey);
    const rows = await tx.$queryRaw<Array<{ policies: Prisma.JsonValue }>>`
      SELECT policies
      FROM businesses
      WHERE id = ${scopedBusinessId}
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new AppException(
        'SPECIALIST_AGENT_BUSINESS_NOT_FOUND',
        'The business for this agent run could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.businessModules.assertEnabledInTransaction(
      tx,
      scopedBusinessId,
      [definition.moduleKey],
    );
    if (
      !resolvePolicies({ policies: rows[0].policies }).bool(
        definition.enabledPolicy,
      )
    ) {
      throw new AppException(
        'SPECIALIST_AGENT_DISABLED',
        `${definition.label} is turned off in Settings → AI & Governance.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async assertAgentEnabled(
    businessId: string,
    agentKey: SpecialistAgentPersistedKey,
  ) {
    const definition = SPECIALIST_AGENT_REGISTRY.find(
      (agent) => agent.agentKey === agentKey,
    );
    if (!definition) {
      throw new AppException(
        'SPECIALIST_AGENT_KEY_INVALID',
        'This specialist agent is not registered for actions.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertEnabled(businessId, definition.policyAgentKey);
  }
}
