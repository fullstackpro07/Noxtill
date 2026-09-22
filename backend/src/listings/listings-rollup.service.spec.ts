import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { ListingsRollupService } from './listings-rollup.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

describe('ListingsRollupService', () => {
  let prisma: PrismaService;
  let service: ListingsRollupService;
  let rootId: string;
  let childId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const branchScope = new BranchScopeService(prisma);
    const connectors = {
      directoryProviders: () => [
        IntegrationProvider.gmb,
        IntegrationProvider.bing_places,
      ],
    };
    service = new ListingsRollupService(
      prisma,
      branchScope,
      connectors as unknown as ConnectorRegistry,
    );

    const root = await prisma.business.create({
      data: {
        name: 'Rollup Test Root',
        slug: `listings-rollup-root-${Date.now()}`,
      },
    });
    rootId = root.id;
    const child = await prisma.business.create({
      data: {
        name: 'Rollup Test Branch',
        slug: `listings-rollup-child-${Date.now()}`,
        parentId: rootId,
      },
    });
    childId = child.id;

    // Root: a fully complete, connected, matching gmb listing; bing_places never connected.
    await prisma.masterListing.create({
      data: {
        businessId: rootId,
        name: 'Rollup Test Root',
        phone: '+1 555 0001',
        website: 'https://root.example.com',
        addressLine1: '1 Main St',
        city: 'Metropolis',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
        description: 'A real business.',
        categories: ['Salon'],
        hours: { mon: [['09:00', '17:00']] },
      },
    });
    await prisma.integration.create({
      data: {
        businessId: rootId,
        provider: IntegrationProvider.gmb,
        status: IntegrationStatus.connected,
      },
    });
    await prisma.citation.create({
      data: {
        businessId: rootId,
        provider: IntegrationProvider.gmb,
        snapshot: {
          name: 'Rollup Test Root',
          phone: '+1 555 0001',
          website: 'https://root.example.com',
          addressLine1: '1 Main St',
          city: 'Metropolis',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        syncedAt: new Date(),
      },
    });
    await prisma.listingSyncLog.create({
      data: { businessId: rootId, provider: IntegrationProvider.gmb, status: 'success' },
    });
    await prisma.listingPhoto.create({
      data: { businessId: rootId, url: 'https://cdn.example.com/a.jpg', category: 'exterior' },
    });

    // Child branch: no Master Listing at all yet, no integrations — a real, honest "not set up" case.
  });

  afterAll(async () => {
    await prisma.listingPhoto.deleteMany({ where: { businessId: { in: [rootId, childId] } } });
    await prisma.citation.deleteMany({ where: { businessId: { in: [rootId, childId] } } });
    await prisma.listingSyncLog.deleteMany({ where: { businessId: { in: [rootId, childId] } } });
    await prisma.integration.deleteMany({ where: { businessId: { in: [rootId, childId] } } });
    await prisma.masterListing.deleteMany({ where: { businessId: { in: [rootId, childId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [childId, rootId] } } });
    await prisma.$disconnect();
  });

  it('returns one row per branch x directory provider across the real branch group', async () => {
    const items = await service.overview(rootId);
    expect(items).toHaveLength(4); // 2 branches x 2 providers
    expect(new Set(items.map((i) => i.branchId))).toEqual(new Set([rootId, childId]));
  });

  it('marks a connected, matching listing as Connected with full completeness', async () => {
    const items = await service.overview(rootId);
    const rootGmb = items.find((i) => i.branchId === rootId && i.provider === 'gmb');
    expect(rootGmb?.status).toBe('Connected');
    expect(rootGmb?.mismatchedFields).toEqual([]);
    expect(rootGmb?.completenessPercent).toBe(100);
    expect(rootGmb?.lastSyncStatus).toBe('success');
    expect(rootGmb?.nextAction).toMatch(/Nothing to do/);
  });

  it('marks the never-connected provider as Not connected, not fabricated', async () => {
    const items = await service.overview(rootId);
    const rootBing = items.find((i) => i.branchId === rootId && i.provider === 'bing_places');
    expect(rootBing?.status).toBe('Not connected');
    expect(rootBing?.verification).toBe('Not tracked');
  });

  it('reports a branch with no Master Listing honestly, with no fabricated completeness', async () => {
    const items = await service.overview(rootId);
    const childGmb = items.find((i) => i.branchId === childId && i.provider === 'gmb');
    expect(childGmb?.hasMasterListing).toBe(false);
    expect(childGmb?.completenessPercent).toBeNull();
    expect(childGmb?.status).toBe('Not connected');
    expect(childGmb?.nextAction).toMatch(/Set up your Master Business Record/);
  });

  it('detects a real field mismatch between the current listing and the last citation snapshot', async () => {
    await prisma.masterListing.update({
      where: { businessId: rootId },
      data: { phone: '+1 555 9999' },
    });
    const items = await service.overview(rootId);
    const rootGmb = items.find((i) => i.branchId === rootId && i.provider === 'gmb');
    expect(rootGmb?.status).toBe('Needs attention');
    expect(rootGmb?.mismatchedFields).toContain('phone');

    // restore for summary() test below
    await prisma.masterListing.update({
      where: { businessId: rootId },
      data: { phone: '+1 555 0001' },
    });
  });

  it('summarises real counts across the branch group', async () => {
    const summary = await service.summary(rootId);
    expect(summary.totalListings).toBe(4);
    expect(summary.connected).toBe(1);
    expect(summary.notConnected).toBe(3);
    expect(summary.branchesWithoutMasterListing).toBe(1);
    expect(summary.averageCompleteness).toBe(100);
  });
});
