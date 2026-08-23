import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SegmentsService } from '../customers/segments.service';
import type { AiInfraService } from '../ai/ai-infra.service';
import { AdAudiencesService } from './ad-audiences.service';
import { IntegrationProvider } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdAudiencesService (UPD-BE-070)', () => {
  let prisma: PrismaService;
  let service: AdAudiencesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const segments = new SegmentsService(tenantPrisma, {
      complete: jest.fn(),
    } as unknown as AiInfraService);
    service = new AdAudiencesService(tenantPrisma, segments);

    const business = await prisma.business.create({
      data: {
        name: 'Ad Audiences Test Biz',
        slug: `ad-audiences-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.createMany({
      data: [
        {
          businessId,
          name: 'Consented VIP',
          phone: '+14155551001',
          tags: ['VIP'],
        },
        {
          businessId,
          name: 'Opted-out VIP',
          phone: '+14155551002',
          tags: ['VIP'],
          optedOut: true,
        },
        {
          businessId,
          name: 'Another Consented VIP',
          phone: '+14155551003',
          tags: ['VIP'],
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.adAudience.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('syncs a real audience from a real CRM segment, excluding opted-out customers (real consent check)', async () => {
    const audience = await service.syncFromSegment(businessId, {
      segmentKey: 'vip',
      provider: IntegrationProvider.meta_ads,
    });

    expect(audience.size).toBe(2); // 3 VIPs minus 1 opted-out
    expect(audience.segmentKey).toBe('vip');
    expect(audience.status).toBe('local');

    const listed = await service.list();
    expect(listed.some((a) => a.id === audience.id)).toBe(true);
  });

  it('rejects a segment key with no real members (a likely typo, not silently 0)', async () => {
    await expect(
      service.syncFromSegment(businessId, {
        segmentKey: 'lapsed',
        provider: IntegrationProvider.meta_ads,
      }),
    ).rejects.toThrow();
  });

  it('removes a real audience', async () => {
    const audience = await service.syncFromSegment(businessId, {
      segmentKey: 'vip',
      provider: IntegrationProvider.google_ads,
      name: 'Removable',
    });
    await service.remove(audience.id);
    await expect(service.findOne(audience.id)).rejects.toThrow();
  });
});
