import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { IntegrationDirectoryService } from './integration-directory.service';
import type { IntegrationsService } from '../integrations.service';
import type { ConnectorRegistry } from '../connector-registry';
import type { SocialAccountsService } from '../../social/social-accounts.service';
import {
  IntegrationProvider,
  IntegrationStatus,
  WorkflowTriggerKey,
} from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('IntegrationDirectoryService (UPD-BE-075)', () => {
  let prisma: PrismaService;
  let service: IntegrationDirectoryService;
  let businessId: string;

  const fakeOAuthRows = [
    {
      provider: IntegrationProvider.google_ads,
      status: IntegrationStatus.connected,
      updatedAt: new Date(),
    },
    {
      provider: IntegrationProvider.gmb,
      status: IntegrationStatus.not_connected,
      updatedAt: null,
    },
    {
      provider: IntegrationProvider.quickbooks,
      status: IntegrationStatus.connected,
      updatedAt: new Date(),
    },
    {
      provider: IntegrationProvider.shopify,
      status: IntegrationStatus.not_connected,
      updatedAt: null,
    },
    {
      provider: IntegrationProvider.email,
      status: IntegrationStatus.connected,
      updatedAt: new Date(),
    },
  ];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const integrations = { list: jest.fn().mockResolvedValue(fakeOAuthRows) };
    const connectors = { directoryProviders: () => [IntegrationProvider.gmb] };
    const socialAccounts = {
      list: jest.fn().mockResolvedValue([
        {
          platform: 'facebook',
          status: 'connected',
          externalAccountName: 'My Page',
          updatedAt: new Date(),
        },
      ]),
    };
    service = new IntegrationDirectoryService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      socialAccounts as unknown as SocialAccountsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Integration Directory Test Biz',
        slug: `integration-directory-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.outboundWebhook.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('categorizes real OAuth-framework providers into ads/directories/accounting/ecommerce/other correctly', async () => {
    const rows = await service.list(businessId);
    expect(rows.find((r) => r.provider === 'google_ads')?.category).toBe('ads');
    expect(rows.find((r) => r.provider === 'gmb')?.category).toBe(
      'directories',
    );
    expect(rows.find((r) => r.provider === 'quickbooks')?.category).toBe(
      'accounting',
    );
    expect(rows.find((r) => r.provider === 'shopify')?.category).toBe(
      'ecommerce',
    );
    expect(rows.find((r) => r.provider === 'email')?.category).toBe('other');
  });

  it('includes real social platform rows under category "social"', async () => {
    const rows = await service.list(businessId);
    const facebookRow = rows.find((r) => r.provider === 'facebook');
    expect(facebookRow?.category).toBe('social');
    expect(facebookRow?.status).toBe('connected');
  });

  it('reports a real automation provider as connected only when it has a real active subscription', async () => {
    await prisma.outboundWebhook.create({
      data: {
        businessId,
        provider: IntegrationProvider.zapier,
        triggerKey: WorkflowTriggerKey.sale,
        targetUrl: 'https://hooks.zapier.com/hooks/catch/1/a',
        secret: 'test-secret',
      },
    });

    const rows = await service.list(businessId);
    const zapierRow = rows.find((r) => r.provider === 'zapier');
    const makeRow = rows.find((r) => r.provider === 'make');
    expect(zapierRow?.category).toBe('automation');
    expect(zapierRow?.status).toBe(IntegrationStatus.connected);
    expect(makeRow?.status).toBe(IntegrationStatus.not_connected);
  });
});
