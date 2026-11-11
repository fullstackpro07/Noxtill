import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SpecialistAgentDirectoryService } from './specialist-agent-directory.service';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';

jest.setTimeout(30_000);

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SpecialistAgentDirectoryService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SpecialistAgentDirectoryService;
  let cls: FakeClsService;
  let businessId: string;
  let disabledBusinessId: string;
  let ownerUserId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const staleFixtures = await prisma.business.findMany({
      where: { slug: { startsWith: 'specialist-agent-directory-' } },
      select: { id: true },
    });
    const staleIds = staleFixtures.map((business) => business.id);
    if (staleIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { businessId: { in: staleIds } },
      });
      await prisma.businessUser.deleteMany({
        where: { businessId: { in: staleIds } },
      });
      await prisma.business.deleteMany({ where: { id: { in: staleIds } } });
    }
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'specialist-agent-config-owner-' } },
    });
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SpecialistAgentDirectoryService(
      tenant,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
      prisma,
      new PoliciesService(
        prisma,
        cls as unknown as ClsService,
        new CapabilitiesService(prisma),
      ),
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Agent Directory QA',
          slug: `specialist-agent-directory-${stamp}`,
          policies: {
            'agents.inventoryEnabled': true,
            'agents.inventoryDailyReviewEnabled': true,
          },
        },
      })
    ).id;
    const owner = await prisma.user.create({
      data: {
        name: 'Specialist Agent Config Owner',
        email: `specialist-agent-config-owner-${stamp}@example.test`,
        passwordHash: 'not-used-by-this-spec',
      },
    });
    ownerUserId = owner.id;
    await prisma.businessUser.create({
      data: { businessId, userId: ownerUserId, role: Role.owner },
    });
    disabledBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Agent Directory Disabled QA',
          slug: `specialist-agent-directory-disabled-${stamp}`,
          disabledModules: ['inventory'],
          policies: { 'agents.inventoryEnabled': false },
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    const fixtureIds = [businessId, disabledBusinessId].filter(
      (id): id is string => Boolean(id),
    );
    await prisma.auditLog.deleteMany({
      where: { businessId: { in: fixtureIds } },
    });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: fixtureIds } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: fixtureIds } },
    });
    if (ownerUserId) {
      await prisma.user.deleteMany({ where: { id: ownerUserId } });
    }
    await prisma.$disconnect();
  });

  it('lists the five registered agents with resolved, safe tenant settings', async () => {
    const result = await service.list(businessId);

    expect(result.items).toHaveLength(5);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentKey: 'inventory_intelligence',
          moduleId: '13',
          moduleKey: 'inventory',
          agentEnabled: true,
          moduleEnabled: true,
          enabled: true,
          dailyReviewEnabled: true,
          allowedTriggers: ['manual', 'event', 'scheduled'],
        }),
        expect.objectContaining({
          agentKey: 'financial_intelligence',
          agentEnabled: true,
          moduleEnabled: true,
          enabled: true,
          dailyReviewEnabled: false,
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.items[0]).not.toHaveProperty('policies');
    expect(result.items[0]).not.toHaveProperty('provider');
  });

  it('resolves disabled module and agent switches independently per business', async () => {
    const result = await service.list(disabledBusinessId);
    const inventory = result.items.find(
      (agent) => agent.agentKey === 'inventory_intelligence',
    );

    expect(inventory).toMatchObject({
      agentEnabled: false,
      moduleEnabled: false,
      enabled: false,
    });
    expect(
      result.items.find((agent) => agent.agentKey === 'financial_intelligence'),
    ).toMatchObject({
      agentEnabled: true,
      moduleEnabled: true,
      enabled: true,
    });
  });

  it('returns only the requested business and agent configuration history', async () => {
    await ensureSpecialistAgentConfigVersion(
      prisma,
      businessId,
      'inventory_intelligence',
    );
    const history = await service.configurationHistory(
      businessId,
      'inventory_intelligence',
    );

    expect(history.items).toHaveLength(1);
    expect(history.items[0].agentKey).toBe('inventory_intelligence');
    expect(history.items[0].version).toBe(1);
    expect(
      (history.items[0].configuration as Record<string, unknown>)[
        'agents.inventoryEnabled'
      ],
    ).toBe(true);
    await expect(
      service.configurationHistory(businessId, 'not_a_specialist'),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_KEY_INVALID' },
    });
    await expect(
      service.configurationHistory(businessId, 'inventory_intelligence', '51'),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_CONFIG_HISTORY_LIMIT_INVALID' },
    });
  });

  it('returns only safe agent-owned configuration values and a current version', async () => {
    const result = await service.configuration(
      businessId,
      'inventory_intelligence',
    );

    expect(result).toMatchObject({
      agentKey: 'inventory_intelligence',
      moduleId: '13',
      configVersion: 1,
      settings: {
        'agents.inventoryEnabled': true,
        'agents.inventoryDailyReviewEnabled': true,
        'agents.inventoryMaxRequestsPerMonth': null,
      },
    });
    expect(result.settings).not.toHaveProperty('ai.monthlyCostCapUsd');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(
      await prisma.specialistAgentConfigVersion.count({
        where: { businessId },
      }),
    ).toBe(1);
  });

  it('updates allowlisted config with optimistic versioning, immutable history and audit', async () => {
    const current = await service.configuration(
      businessId,
      'inventory_intelligence',
    );
    const updated = await service.updateConfiguration(
      businessId,
      ownerUserId,
      'inventory_intelligence',
      {
        expectedVersion: current.configVersion,
        settings: {
          'agents.inventoryEnabled': false,
          'agents.inventoryMaxRequestsPerMonth': 12,
        },
      },
    );

    expect(updated).toMatchObject({
      configVersion: current.configVersion + 1,
      changed: true,
      settings: {
        'agents.inventoryEnabled': false,
        'agents.inventoryMaxRequestsPerMonth': 12,
      },
    });
    const history = await prisma.specialistAgentConfigVersion.findMany({
      where: { businessId, agentKey: 'inventory_intelligence' },
      orderBy: { version: 'asc' },
      select: { version: true, changedByUserId: true },
    });
    expect(history).toEqual([
      { version: 1, changedByUserId: null },
      { version: 2, changedByUserId: ownerUserId },
    ]);
    await expect(
      service.updateConfiguration(
        businessId,
        ownerUserId,
        'inventory_intelligence',
        {
          expectedVersion: current.configVersion,
          settings: { 'agents.inventoryEnabled': true },
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_CONFIG_VERSION_CONFLICT' },
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          actorUserId: ownerUserId,
          action: 'specialist_agent.configuration_updated',
        },
      }),
    ).toBe(1);
  });

  it('refuses global, unknown and out-of-range settings', async () => {
    const current = await service.configuration(
      businessId,
      'inventory_intelligence',
    );
    await expect(
      service.updateConfiguration(
        businessId,
        ownerUserId,
        'inventory_intelligence',
        {
          expectedVersion: current.configVersion,
          settings: { 'ai.monthlyCostCapUsd': 5 },
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_CONFIG_KEY_NOT_ALLOWED' },
    });
    await expect(
      service.updateConfiguration(
        businessId,
        ownerUserId,
        'inventory_intelligence',
        {
          expectedVersion: current.configVersion,
          settings: { 'agents.inventoryMaxRequestsPerMonth': -1 },
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'SETTING_INVALID' } });
  });
});
