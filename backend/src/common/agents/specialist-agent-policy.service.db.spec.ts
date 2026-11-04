import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../tenancy/tenant.constants';
import { SpecialistAgentPolicyService } from './specialist-agent-policy.service';
import { PrismaService } from '../../prisma/prisma.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SpecialistAgentPolicyService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SpecialistAgentPolicyService;
  let businessId: string;
  let disabledBusinessId: string;
  const cls = new FakeClsService();
  const stamp = Date.now();
  const keys = ['inventory', 'finance', 'customer', 'seo', 'commerce'] as const;
  const policyKeys = {
    inventory: 'agents.inventoryEnabled',
    finance: 'agents.financeEnabled',
    customer: 'agents.customerEnabled',
    seo: 'agents.seoEnabled',
    commerce: 'agents.commerceEnabled',
  } as const;
  const moduleKeys = {
    inventory: 'inventory',
    finance: 'profit',
    customer: 'customers',
    seo: 'marketing',
    commerce: 'autonomous-commerce',
  } as const;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new SpecialistAgentPolicyService(
      prisma,
      cls as unknown as ClsService,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Agent Policy QA',
          slug: `specialist-agent-policy-${stamp}`,
        },
      })
    ).id;
    disabledBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Agent Policy Disabled QA',
          slug: `specialist-agent-policy-disabled-${stamp}`,
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

  it('preserves the enabled default for every specialist agent', async () => {
    for (const key of keys) {
      await expect(
        service.assertEnabled(businessId, key),
      ).resolves.toBeUndefined();
    }
  });

  it('blocks each agent when its own business policy is disabled', async () => {
    for (const key of keys) {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: { [policyKeys[key]]: false } },
      });

      await expect(
        service.assertEnabled(businessId, key),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_AGENT_DISABLED' },
      });
    }
  });

  it('blocks a specialist when its canonical module is disabled for the business', async () => {
    for (const key of keys) {
      await prisma.business.update({
        where: { id: businessId },
        data: { disabledModules: [moduleKeys[key]] },
      });

      await expect(
        service.assertEnabled(businessId, key),
      ).rejects.toMatchObject({
        response: { code: 'BUSINESS_MODULE_DISABLED' },
      });
    }
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: [] },
    });
  });

  it('resolves module selection through the active branch root', async () => {
    const root = await prisma.business.create({
      data: {
        name: 'Specialist Agent Module Root QA',
        slug: `specialist-agent-module-root-${stamp}`,
        disabledModules: ['inventory'],
      },
    });
    const branch = await prisma.business.create({
      data: {
        name: 'Specialist Agent Module Branch QA',
        slug: `specialist-agent-module-branch-${stamp}`,
        parentId: root.id,
      },
    });
    try {
      cls.set(CLS_KEY_BUSINESS_ID, branch.id);
      await expect(
        service.assertEnabled(branch.id, 'inventory'),
      ).rejects.toMatchObject({
        response: { code: 'BUSINESS_MODULE_DISABLED' },
      });
      await expect(
        service.assertEnabled(branch.id, 'finance'),
      ).resolves.toBeUndefined();
    } finally {
      cls.set(CLS_KEY_BUSINESS_ID, businessId);
      await prisma.business.deleteMany({ where: { id: branch.id } });
      await prisma.business.deleteMany({ where: { id: root.id } });
    }
  });

  it('uses the active tenant scope instead of a caller-supplied business id', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, disabledBusinessId);

    await expect(
      service.assertEnabled(businessId, 'inventory'),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_DISABLED' },
    });
  });

  it('returns a typed not-found error for an unknown scoped business', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, null);

    await expect(
      service.assertEnabled('missing-specialist-agent-business', 'inventory'),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_BUSINESS_NOT_FOUND' },
    });
  });
});
