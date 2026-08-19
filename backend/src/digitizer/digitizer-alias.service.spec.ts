import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DigitizerAliasService } from './digitizer-alias.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DigitizerAliasService (UPD-BE-063)', () => {
  let prisma: PrismaService;
  let service: DigitizerAliasService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new DigitizerAliasService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Digitizer Alias Test Biz',
        slug: `digitizer-alias-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.digitizerAlias.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('learns a real correction and applies it on future text', async () => {
    await service.learn(businessId, 'Sprte', 'Sprite');
    const map = await service.getMap(businessId);
    expect(map.get('Sprte')).toBe('Sprite');

    expect(service.applyAliases('2x Sprte 500ml', map)).toBe('2x Sprite 500ml');
  });

  it('updates an existing alias rather than duplicating it', async () => {
    await service.learn(businessId, 'Sprte', 'Sprite Can');
    const map = await service.getMap(businessId);
    expect(map.get('Sprte')).toBe('Sprite Can');

    const rows = await prisma.digitizerAlias.findMany({
      where: { businessId, rawText: 'Sprte' },
    });
    expect(rows).toHaveLength(1);
  });

  it('does not learn a no-op correction (raw === corrected)', async () => {
    await service.learn(businessId, 'Coke', 'Coke');
    const map = await service.getMap(businessId);
    expect(map.has('Coke')).toBe(false);
  });

  it('leaves unrelated text unchanged when no alias matches', () => {
    const map = new Map([['Sprte', 'Sprite']]);
    expect(service.applyAliases('Fanta 500ml', map)).toBe('Fanta 500ml');
  });
});
