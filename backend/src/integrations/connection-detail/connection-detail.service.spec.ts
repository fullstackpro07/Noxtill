import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import type { IntegrationsService } from '../integrations.service';
import type { ConnectorRegistry } from '../connector-registry';
import type { AccountingSyncService } from '../accounting/accounting-sync.service';
import { AccountingMappingService } from '../accounting/accounting-mapping.service';
import type { EcommerceSyncService } from '../ecommerce/ecommerce-sync.service';
import type { ListingSyncService } from '../../listings/listing-sync.service';
import type { AdStatsSyncProcessor } from '../../ads/jobs/ad-stats-sync.processor';
import type { OutboundWebhookService } from '../automation/outbound-webhook.service';
import { ConnectionDetailService } from './connection-detail.service';
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

describe('ConnectionDetailService (UPD-BE-132)', () => {
  let prisma: PrismaService;
  let service: ConnectionDetailService;
  let businessId: string;
  const getTokens = jest.fn();
  const accountingSyncSpy = jest.fn();
  const ecommerceSyncSpy = jest.fn();
  const listingSyncSpy = jest.fn();
  const syncBusinessProviderSpy = jest.fn();
  const retryFailedDeliveriesSpy = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const integrations = { getTokens };
    const connectors = {
      directoryProviders: () => [IntegrationProvider.gmb],
    };
    service = new ConnectionDetailService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      { sync: accountingSyncSpy } as unknown as AccountingSyncService,
      new AccountingMappingService(tenantPrisma),
      { sync: ecommerceSyncSpy } as unknown as EcommerceSyncService,
      { sync: listingSyncSpy } as unknown as ListingSyncService,
      {
        syncBusinessProvider: syncBusinessProviderSpy,
      } as unknown as AdStatsSyncProcessor,
      {
        retryFailedDeliveries: retryFailedDeliveriesSpy,
      } as unknown as OutboundWebhookService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Connection Detail Test Biz',
        slug: `connection-detail-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.outboundWebhookDelivery.deleteMany({
      where: { webhook: { businessId } },
    });
    await prisma.outboundWebhook.deleteMany({ where: { businessId } });
    await prisma.accountingMapping.deleteMany({ where: { businessId } });
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.listingSyncLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('rejects an unknown provider', async () => {
    await expect(
      service.detail(businessId, 'not_a_real_provider'),
    ).rejects.toThrow();
  });

  describe('detail() — OAuth-shaped categories', () => {
    it('returns a real default-empty view for a never-connected accounting provider', async () => {
      const result = await service.detail(businessId, IntegrationProvider.xero);
      expect(result.category).toBe('accounting');
      expect(result.status).toBe(IntegrationStatus.not_connected);
      expect(result.connectedAt).toBeNull();
      expect(result.tokenExpiresAt).toBeNull();
      expect(result.syncLog).toEqual([]);
    });

    it('returns real connectedAt/tokenExpiresAt/syncLog/fieldMapping for a connected accounting provider', async () => {
      await prisma.integration.create({
        data: {
          businessId,
          provider: IntegrationProvider.quickbooks,
          status: IntegrationStatus.connected,
          connectedAt: new Date('2026-01-01T00:00:00Z'),
          lastSyncAt: new Date('2026-01-02T00:00:00Z'),
        },
      });
      getTokens.mockResolvedValue({
        accessToken: 'tok',
        expiresAt: '2026-06-01T00:00:00Z',
      });
      await prisma.integrationSyncLog.create({
        data: {
          businessId,
          provider: IntegrationProvider.quickbooks,
          success: true,
          recordsProcessed: 3,
          message: 'Pushed 3 invoice(s)',
        },
      });
      await prisma.accountingMapping.create({
        data: {
          businessId,
          provider: IntegrationProvider.quickbooks,
          externalAccountCode: 'ACC-1',
        },
      });

      const result = await service.detail(
        businessId,
        IntegrationProvider.quickbooks,
      );
      expect(result.category).toBe('accounting');
      expect(result.status).toBe(IntegrationStatus.connected);
      expect(result.connectedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(result.lastSyncAt).toEqual(new Date('2026-01-02T00:00:00Z'));
      expect(result.tokenExpiresAt).toBe('2026-06-01T00:00:00Z');
      expect(result.syncLog).toHaveLength(1);
      expect(result.syncLog![0].success).toBe(true);
      expect(result.fieldMapping).toHaveLength(1);
    });

    it('reads real ListingSyncLog rows (not a duplicated log) for a directory provider', async () => {
      await prisma.integration.create({
        data: {
          businessId,
          provider: IntegrationProvider.gmb,
          status: IntegrationStatus.connected,
        },
      });
      await prisma.listingSyncLog.create({
        data: {
          businessId,
          provider: IntegrationProvider.gmb,
          status: 'failed',
          message: 'token expired',
        },
      });

      const result = await service.detail(businessId, IntegrationProvider.gmb);
      expect(result.category).toBe('directory');
      expect(result.syncLog).toHaveLength(1);
      expect(result.syncLog![0].success).toBe(false);
      expect(result.syncLog![0].message).toBe('token expired');
      expect(result.fieldMapping).toBeNull();
    });

    it('returns null fieldMapping and empty syncLog for an ad-platform provider', async () => {
      const result = await service.detail(
        businessId,
        IntegrationProvider.meta_ads,
      );
      expect(result.category).toBe('ads');
      expect(result.fieldMapping).toBeNull();
      expect(result.syncLog).toEqual([]);
    });
  });

  describe('detail() — automation category (no OAuth connection)', () => {
    it('returns real subscriptions with their own real delivery history, not an OAuth-shaped view', async () => {
      const sub = await prisma.outboundWebhook.create({
        data: {
          businessId,
          provider: IntegrationProvider.zapier,
          triggerKey: WorkflowTriggerKey.sale,
          targetUrl: 'https://hooks.zapier.com/x',
          secret: 'shh',
        },
      });
      await prisma.outboundWebhookDelivery.create({
        data: { webhookId: sub.id, payload: { a: 1 }, status: 'success' },
      });

      const result = await service.detail(
        businessId,
        IntegrationProvider.zapier,
      );
      expect(result.category).toBe('automation');
      expect(result.subscriptions).toHaveLength(1);
      expect(result.subscriptions![0].recentDeliveries).toHaveLength(1);
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('connectedAt');
    });
  });

  describe('triggerSync()', () => {
    it('dispatches to AccountingSyncService for an accounting provider', async () => {
      await service.triggerSync(businessId, IntegrationProvider.quickbooks);
      expect(accountingSyncSpy).toHaveBeenCalledWith(businessId);
      expect(ecommerceSyncSpy).not.toHaveBeenCalled();
      expect(listingSyncSpy).not.toHaveBeenCalled();
    });

    it('dispatches to EcommerceSyncService for an e-commerce provider', async () => {
      await service.triggerSync(businessId, IntegrationProvider.shopify);
      expect(ecommerceSyncSpy).toHaveBeenCalledWith(businessId);
    });

    it('dispatches to ListingSyncService for a directory provider', async () => {
      await service.triggerSync(businessId, IntegrationProvider.gmb);
      expect(listingSyncSpy).toHaveBeenCalledWith(businessId);
    });

    it('dispatches to a real on-demand stats refresh, scoped to this business+provider, for an ad-platform provider', async () => {
      await service.triggerSync(businessId, IntegrationProvider.meta_ads);
      expect(syncBusinessProviderSpy).toHaveBeenCalledWith(
        businessId,
        IntegrationProvider.meta_ads,
      );
      expect(accountingSyncSpy).not.toHaveBeenCalled();
    });

    it('dispatches to a real retry of failed deliveries for an automation provider, not a fabricated no-op', async () => {
      await service.triggerSync(businessId, IntegrationProvider.zapier);
      expect(retryFailedDeliveriesSpy).toHaveBeenCalledWith(
        businessId,
        IntegrationProvider.zapier,
      );
    });
  });
});
