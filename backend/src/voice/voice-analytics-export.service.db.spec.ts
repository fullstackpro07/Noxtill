import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceAnalyticsExportService } from './voice-analytics-export.service';
import { TRACKING_NUMBER_ATTRIBUTION_REASON } from './voice-tracking-numbers.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceAnalyticsExportService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceAnalyticsExportService;
  let businessId: string;
  let otherBusinessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceAnalyticsExportService(
      tenant,
      new AuditService(tenant, cls as unknown as ClsService),
    );
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Export Test', slug: `voice-export-${suffix}` },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: { name: 'Other Export Test', slug: `voice-export-o-${suffix}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'export-tester');

    const day = new Date('2026-09-10T10:00:00.000Z');
    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: `CA-exp-1-${suffix}`,
          fromNumber: '+14155550171',
          status: 'completed',
          outcome: 'custom',
          customIntentName: '=HYPERLINK("http://x")',
          startedAt: day,
          endedAt: new Date(day.getTime() + 95_000),
          transcript: [],
          attributionSource: 'google_ads',
          attributionChannel: 'paid_search',
          attributionReason: TRACKING_NUMBER_ATTRIBUTION_REASON,
        },
        {
          businessId,
          callSid: `CA-exp-2-${suffix}`,
          fromNumber: '+14155550172',
          status: 'missed',
          startedAt: new Date('2026-09-11T10:00:00.000Z'),
          transcript: [],
        },
        {
          businessId,
          callSid: `CA-exp-3-${suffix}`,
          fromNumber: '+14155550173',
          status: 'completed',
          startedAt: new Date('2026-08-01T10:00:00.000Z'),
          transcript: [],
        },
        {
          businessId: otherBusinessId,
          callSid: `CA-exp-4-${suffix}`,
          fromNumber: '+14155550174',
          status: 'completed',
          startedAt: day,
          transcript: [],
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({
        where: { businessId: { in: [businessId, otherBusinessId] } },
      });
      await tx.business.deleteMany({
        where: { id: { in: [businessId, otherBusinessId] } },
      });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('exports only this business’s calls in range, masked and injection-safe', async () => {
    const result = await service.exportCalls(
      businessId,
      '2026-09-01',
      '2026-09-30',
    );
    expect(result.rowCount).toBe(2);
    expect(result.filename).toBe('calls_2026-09-01_2026-09-30.csv');
    const lines = result.csv.split('\n');
    expect(lines[0].split(',')).toEqual([...result.columns]);
    expect(result.csv).not.toContain('4155550171');
    expect(result.csv).toContain('•••• 0171');
    expect(result.csv).not.toContain('0174');
    expect(lines[1]).toContain('"\'=HYPERLINK(""http://x"")"');
    expect(lines[1]).toContain(',95,');
    expect(lines[1]).toContain('google_ads,paid_search,tracking_number');
    expect(lines[2]).toContain(',missed,');
    expect(lines[2]).toContain(',unknown,');
  });

  it('rejects ranges over 92 days', async () => {
    let caught: unknown;
    try {
      await service.exportCalls(businessId, '2026-01-01', '2026-09-30');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
  });
});
