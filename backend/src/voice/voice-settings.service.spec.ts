import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceSettingsService } from './voice-settings.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceSettingsService (Receptionist Settings depth fix, UPD-FE-051e)', () => {
  let prisma: PrismaService;
  let service: VoiceSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceSettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Voice Settings Test Biz',
        slug: `voice-settings-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.voiceSettings.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('get() returns a real default-empty view before any row exists', async () => {
    const result = await service.get(businessId);
    expect(result.id).toBeNull();
    expect(result.voiceId).toBeNull();
    expect(result.responseTimeoutSeconds).toBe(5);
    expect(result.customIntents).toEqual([]);
  });

  it('update() upserts a real row and persists every field', async () => {
    const updated = await service.update(businessId, {
      voiceId: 'Polly.Matthew',
      responseTimeoutSeconds: 10,
      queueHoldMessage: 'We will call you back soon.',
      customIntents: [{ name: 'complaint', priority: 1 }],
    });
    expect(updated.voiceId).toBe('Polly.Matthew');
    expect(updated.responseTimeoutSeconds).toBe(10);
    expect(updated.queueHoldMessage).toBe('We will call you back soon.');
    expect(updated.customIntents).toEqual([{ name: 'complaint', priority: 1 }]);

    const fetched = await service.get(businessId);
    expect(fetched.id).not.toBeNull();
    expect(fetched.voiceId).toBe('Polly.Matthew');
  });
});
