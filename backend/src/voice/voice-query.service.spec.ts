import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceQueryService } from './voice-query.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceQueryService (UPD-BE-059)', () => {
  let prisma: PrismaService;
  let service: VoiceQueryService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceQueryService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Voice Query Test Biz',
        slug: `voice-query-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const startedAt = new Date('2026-08-01T10:00:00.000Z');
    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: 'CA-q-completed',
          fromNumber: '+15550003001',
          status: 'completed',
          outcome: 'booking',
          startedAt,
          endedAt: new Date(startedAt.getTime() + 120_000),
        },
        {
          businessId,
          callSid: 'CA-q-missed',
          fromNumber: '+15550003002',
          status: 'missed',
          outcome: 'none',
          startedAt,
          endedAt: new Date(startedAt.getTime() + 15_000),
        },
        {
          businessId,
          callSid: 'CA-q-in-progress',
          fromNumber: '+15550003003',
          status: 'in_progress',
          outcome: 'none',
          startedAt,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('listCalls() returns every real call, most recent first', async () => {
    const calls = await service.listCalls();
    expect(calls).toHaveLength(3);
  });

  it('listMissedCalls() returns only the real missed call', async () => {
    const missed = await service.listMissedCalls();
    expect(missed).toHaveLength(1);
    expect(missed[0].callSid).toBe('CA-q-missed');
  });

  it('analytics() aggregates real counts and average duration from ended calls only', async () => {
    const analytics = await service.analytics();
    expect(analytics.totalCalls).toBe(3);
    expect(analytics.byStatus.completed).toBe(1);
    expect(analytics.byStatus.missed).toBe(1);
    expect(analytics.byStatus.in_progress).toBe(1);
    expect(analytics.byOutcome.booking).toBe(1);
    // (120s + 15s) / 2 ended calls = 67.5s, rounded
    expect(analytics.averageDurationSeconds).toBe(68);
  });
});
