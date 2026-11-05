import { ClsService } from 'nestjs-cls';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../tenancy/tenant.constants';
import { PoliciesService } from '../policies/policies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiSettingsService } from '../../ai/ai-settings.service';
import { ensureSpecialistAgentConfigVersion } from './specialist-agent-config.util';
import { createOrReuseSpecialistAgentRun } from './specialist-agent-run-idempotency.util';

jest.setTimeout(30_000);

class FakeClsService {
  private values: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.values[key] as T;
  }

  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('specialist agent configuration history (MySQL)', () => {
  let prisma: PrismaService;
  let policies: PoliciesService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    policies = new PoliciesService(
      prisma,
      cls as unknown as ClsService,
      {} as CapabilitiesService,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Config History QA',
          slug: `specialist-config-history-${stamp}`,
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Config History Other QA',
          slug: `specialist-config-history-other-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'specialist-config-history-owner');
  });

  afterAll(async () => {
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('pins immutable, business-scoped versions and records owner policy changes', async () => {
    const version1 = await ensureSpecialistAgentConfigVersion(
      prisma,
      businessId,
      'inventory_intelligence',
    );
    expect(version1).toBe(1);

    const initial = await prisma.specialistAgentConfigVersion.findUniqueOrThrow(
      {
        where: {
          businessId_agentKey_version: {
            businessId,
            agentKey: 'inventory_intelligence',
            version: 1,
          },
        },
      },
    );
    expect(initial.configuration).toMatchObject({
      'agents.inventoryEnabled': true,
      'agents.maxMaterialActionsPerRun': 10,
    });

    await policies.set(businessId, 'agents.inventoryEnabled', false);
    const version2 = await ensureSpecialistAgentConfigVersion(
      prisma,
      businessId,
      'inventory_intelligence',
    );
    expect(version2).toBe(2);

    const versions = await prisma.specialistAgentConfigVersion.findMany({
      where: { businessId, agentKey: 'inventory_intelligence' },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0].configHash).not.toBe(versions[1].configHash);
    expect(versions[1].configuration).toMatchObject({
      'agents.inventoryEnabled': false,
    });
    expect(versions[1].changedByUserId).toBe('specialist-config-history-owner');

    const runRequest = () =>
      createOrReuseSpecialistAgentRun(
        (data) => prisma.specialistAgentRun.create({ data }),
        (keyBusinessId, agentKey, idempotencyKeyHash) =>
          prisma.specialistAgentRun.findFirst({
            where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
          }),
        {
          businessId,
          agentKey: 'inventory_intelligence',
          agentVersion: '1.8.0',
          moduleId: '13',
          triggerType: 'manual',
          status: 'completed',
        },
        'config-history-pin-run',
        { qa: 'pinned-version' },
        (configBusinessId, agentKey) =>
          ensureSpecialistAgentConfigVersion(
            prisma,
            configBusinessId,
            agentKey,
          ),
      );
    const createdRun = await runRequest();
    expect(createdRun.run.agentConfigVersion).toBe(2);

    await policies.set(businessId, 'agents.inventoryEnabled', true);
    const reusedRun = await runRequest();
    expect(reusedRun.reused).toBe(true);
    expect(reusedRun.run.id).toBe(createdRun.run.id);
    expect(reusedRun.run.agentConfigVersion).toBe(2);
    expect(
      await ensureSpecialistAgentConfigVersion(
        prisma,
        businessId,
        'inventory_intelligence',
      ),
    ).toBe(3);

    const aiSettings = new AiSettingsService(prisma);
    await aiSettings.updateSettings(
      businessId,
      { featureToggles: { inventoryAgent: false } },
      'specialist-config-history-owner',
    );
    expect(
      await ensureSpecialistAgentConfigVersion(
        prisma,
        businessId,
        'inventory_intelligence',
      ),
    ).toBe(4);
    const toggleVersion =
      await prisma.specialistAgentConfigVersion.findUniqueOrThrow({
        where: {
          businessId_agentKey_version: {
            businessId,
            agentKey: 'inventory_intelligence',
            version: 4,
          },
        },
      });
    expect(toggleVersion.configuration).toMatchObject({
      'ai.featureToggles.inventoryAgent': false,
      'agents.inventoryEnabled': true,
    });
    expect(toggleVersion.changedByUserId).toBe(
      'specialist-config-history-owner',
    );

    const secondBusinessVersion = await ensureSpecialistAgentConfigVersion(
      prisma,
      otherBusinessId,
      'inventory_intelligence',
    );
    expect(secondBusinessVersion).toBe(1);
    const otherConfig =
      await prisma.specialistAgentConfigVersion.findUniqueOrThrow({
        where: {
          businessId_agentKey_version: {
            businessId: otherBusinessId,
            agentKey: 'inventory_intelligence',
            version: 1,
          },
        },
      });
    expect(otherConfig.configuration).toMatchObject({
      'agents.inventoryEnabled': true,
    });
  });
});
