import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SpecialistAgentDirectoryService } from './specialist-agent-directory.service';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';

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
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SpecialistAgentDirectoryService(
      tenant,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
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
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, disabledBusinessId] } },
    });
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
});
