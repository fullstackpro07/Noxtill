import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SegmentsService } from './segments.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SegmentsService (BE-041)', () => {
  let prisma: PrismaService;
  let segmentsService: SegmentsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    segmentsService = new SegmentsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Segments Test Biz', slug: `segments-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.createMany({
      data: [
        {
          businessId,
          phone: '+10000000001',
          name: 'VIP Customer',
          tags: ['VIP'],
        },
        {
          businessId,
          phone: '+10000000002',
          name: 'Lapsed Customer',
          tags: ['Lapsed'],
        },
        {
          businessId,
          phone: '+10000000003',
          name: 'Regular Customer',
          tags: [],
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('returns VIP-tagged customers for the vip segment', async () => {
    const segment = await segmentsService.getSegment('vip');
    expect(segment.count).toBe(1);
    expect(segment.members[0].name).toBe('VIP Customer');
  });

  it('returns Lapsed-tagged customers for the lapsed segment', async () => {
    const segment = await segmentsService.getSegment('lapsed');
    expect(segment.count).toBe(1);
    expect(segment.members[0].name).toBe('Lapsed Customer');
  });

  it('returns all recently-created customers for the new segment', async () => {
    const segment = await segmentsService.getSegment('new');
    expect(segment.count).toBe(3);
  });

  it('treats any other key as a custom tag filter', async () => {
    const segment = await segmentsService.getSegment('VIP');
    expect(segment.count).toBe(1);
  });
});
