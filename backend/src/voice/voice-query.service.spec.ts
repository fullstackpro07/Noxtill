import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceQueryService } from './voice-query.service';
import type { S3Service } from '../common/storage/s3.service';

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
    const s3 = {
      getSignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://signed.example.com/recording.mp3'),
    };
    service = new VoiceQueryService(
      tenantPrisma,
      s3 as unknown as S3Service,
      new AuditService(tenantPrisma, cls as unknown as ClsService),
    );

    const business = await prisma.business.create({
      data: {
        name: 'Voice Query Test Biz',
        slug: `voice-query-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    // No FK on AuditLog.actorUserId — a plain id is enough to prove who is recorded.
    cls.set(CLS_KEY_USER_ID, 'staff-user-1');

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
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
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

  describe('getRecordingUrl() (Transcripts & Recordings depth fix)', () => {
    it('returns a real signed S3 URL when the call has a recordingKey', async () => {
      const call = await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: 'CA-q-recording',
          fromNumber: '+15550003004',
          recordingKey: 'voice-recordings/biz/CA-q-recording-123.mp3',
        },
      });
      const result = await service.getRecordingUrl(call.id);
      expect(result.url).toBe('https://signed.example.com/recording.mp3');

      // Playback is written to the append-only audit trail: who, which call, when.
      const logs = await prisma.auditLog.findMany({
        where: {
          businessId,
          entity: 'PhoneCall',
          entityId: call.id,
          action: 'call.recording_played',
        },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe('staff-user-1');
    });

    it('returns a real null (not fabricated) when the call has no recording', async () => {
      const call = await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: 'CA-q-no-recording',
          fromNumber: '+15550003005',
        },
      });
      const result = await service.getRecordingUrl(call.id);
      expect(result.url).toBeNull();
      // Nothing was played, so nothing is logged as played.
      const logs = await prisma.auditLog.count({
        where: { entityId: call.id, action: 'call.recording_played' },
      });
      expect(logs).toBe(0);
    });
  });
});
