import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SocialSettingsService } from './social-settings.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SocialSettingsService (UPD-BE-051)', () => {
  let prisma: PrismaService;
  let service: SocialSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SocialSettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Social Settings Test Biz',
        slug: `social-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.socialSettings.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('get() returns a default empty view before any settings exist', async () => {
    const view = await service.get(businessId);
    expect(view.id).toBeNull();
    expect(view.autoPostRules).toEqual({});
    expect(view.brandVoice).toBeNull();
  });

  it('update() creates a real row on first PATCH, then upserts in place on the next', async () => {
    const first = await service.update(businessId, {
      brandVoice: 'Friendly and upbeat',
      hashtagSets: { promo: ['#sale', '#deal'] },
    });
    expect(first.brandVoice).toBe('Friendly and upbeat');

    await service.update(businessId, { brandVoice: 'Professional' });
    const rows = await prisma.socialSettings.findMany({
      where: { businessId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].brandVoice).toBe('Professional');
    // Untouched field from the first PATCH survives the second, partial PATCH.
    expect(rows[0].hashtagSets).toEqual({ promo: ['#sale', '#deal'] });
  });
});
