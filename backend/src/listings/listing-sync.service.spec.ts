import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MasterListingService } from './master-listing.service';
import { ListingSyncService } from './listing-sync.service';
import { AppException } from '../common/filters/app.exception';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationProvider, IntegrationStatus } from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ListingSyncService (UPD-BE-044)', () => {
  let prisma: PrismaService;
  let service: ListingSyncService;
  let masterListing: MasterListingService;
  let businessId: string;
  const pushListing = jest.fn();
  const failingPushListing = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    masterListing = new MasterListingService(tenantPrisma);

    const integrations = {
      getTokens: jest.fn().mockResolvedValue({ accessToken: 'fake-token' }),
    };
    const connectors = {
      directoryProviders: () => [
        IntegrationProvider.gmb,
        IntegrationProvider.yelp,
      ],
      get: (provider: IntegrationProvider) =>
        provider === IntegrationProvider.gmb
          ? { pushListing }
          : { pushListing: failingPushListing },
    };

    service = new ListingSyncService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      masterListing,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Listing Sync Test Biz',
        slug: `listing-sync-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    pushListing.mockReset();
    failingPushListing.mockReset();
  });

  afterAll(async () => {
    await prisma.citation.deleteMany({ where: { businessId } });
    await prisma.listingSyncLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.masterListing.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('sync() rejects when no Master Listing has been set yet', async () => {
    await expect(service.sync(businessId)).rejects.toBeInstanceOf(AppException);
  });

  it('sync() skips providers with no connected Integration row', async () => {
    await masterListing.update(businessId, {
      name: 'Synced Biz',
      phone: '+15550009999',
    });
    const results = await service.sync(businessId);
    expect(results).toEqual([]);
    expect(pushListing).not.toHaveBeenCalled();
  });

  it('sync() pushes to a connected directory, logs success, and snapshots a real Citation', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.gmb,
        status: IntegrationStatus.connected,
      },
    });
    pushListing.mockResolvedValue({ ok: true });

    const results = await service.sync(businessId);
    expect(results).toEqual([
      { provider: IntegrationProvider.gmb, status: 'success' },
    ]);
    expect(pushListing).toHaveBeenCalledTimes(1);

    const logs = await prisma.listingSyncLog.findMany({
      where: { businessId, provider: IntegrationProvider.gmb },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');

    const citation = await prisma.citation.findUnique({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    expect(citation).not.toBeNull();
    expect((citation!.snapshot as Record<string, unknown>).name).toBe(
      'Synced Biz',
    );
  });

  it('sync() logs a real failure without throwing when a connector push errors', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.yelp,
        status: IntegrationStatus.connected,
      },
    });
    failingPushListing.mockRejectedValue(new Error('Yelp API unreachable'));

    const results = await service.sync(businessId);
    const yelpResult = results.find(
      (r) => r.provider === IntegrationProvider.yelp,
    );
    expect(yelpResult).toEqual({
      provider: IntegrationProvider.yelp,
      status: 'failed',
      message: 'Yelp API unreachable',
    });

    const logs = await prisma.listingSyncLog.findMany({
      where: { businessId, provider: IntegrationProvider.yelp },
    });
    expect(logs[0].status).toBe('failed');
    expect(logs[0].message).toBe('Yelp API unreachable');
  });

  it('citationAudit() flags a real mismatch after the Master Listing changes post-sync', async () => {
    await masterListing.update(businessId, { name: 'Renamed Biz' });
    const audit = await service.citationAudit(businessId);
    const gmbAudit = audit.find((a) => a.provider === IntegrationProvider.gmb);
    expect(gmbAudit!.matches).toBe(false);
    expect(gmbAudit!.mismatchedFields).toContain('name');
  });

  it('health() reflects real connected-provider count and real mismatch count', async () => {
    const health = await service.health(businessId);
    expect(health.totalProviders).toBe(2); // gmb + yelp, per the fake registry
    expect(health.connectedProviders).toEqual(
      expect.arrayContaining([
        IntegrationProvider.gmb,
        IntegrationProvider.yelp,
      ]),
    );
    expect(health.mismatchCount).toBeGreaterThanOrEqual(1);
    expect(health.score).toBeLessThan(100);
  });
});
