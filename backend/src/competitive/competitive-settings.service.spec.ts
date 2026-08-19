import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CompetitiveSettingsService } from './competitive-settings.service';
import { DEFAULT_COMPETITIVE_SETTINGS } from './competitive.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CompetitiveSettingsService (UPD-BE-055)', () => {
  let prisma: PrismaService;
  let service: CompetitiveSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CompetitiveSettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Competitive Settings Test Biz',
        slug: `competitive-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.competitiveSettings.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('defaults to the standard scan/alert thresholds before any row exists', async () => {
    const settings = await service.get(businessId);
    expect(settings).toMatchObject(DEFAULT_COMPETITIVE_SETTINGS);
  });

  it('persists a partial update and preserves the other defaults', async () => {
    const updated = await service.update(businessId, {
      keywordRankAlertThreshold: 5,
    });
    expect(updated.keywordRankAlertThreshold).toBe(5);
    expect(updated.scanFrequencyDays).toBe(
      DEFAULT_COMPETITIVE_SETTINGS.scanFrequencyDays,
    );

    const reread = await service.get(businessId);
    expect(reread.keywordRankAlertThreshold).toBe(5);
  });
});
