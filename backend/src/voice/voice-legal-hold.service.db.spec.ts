import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { RECORDING_RETENTION_DAYS } from './voice.constants';
import { VoiceCallWorkspaceService } from './voice-call-workspace.service';
import { VoiceHumanAgentDispatchService } from './voice-human-agent-dispatch.service';
import { VoiceLegalHoldService } from './voice-legal-hold.service';
import { VoiceRetentionProcessor } from './jobs/voice-retention.processor';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceLegalHoldService (real MySQL)', () => {
  let prisma: PrismaService;
  let holds: VoiceLegalHoldService;
  let workspace: VoiceCallWorkspaceService;
  let retention: VoiceRetentionProcessor;
  let businessId: string;
  let userId: string;
  const s3 = { delete: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    holds = new VoiceLegalHoldService(tenant, audit);
    workspace = new VoiceCallWorkspaceService(
      tenant,
      { get: () => undefined } as unknown as ConfigService,
      audit,
      s3 as unknown as S3Service,
    );
    retention = new VoiceRetentionProcessor(
      prisma,
      s3 as unknown as S3Service,
      new VoiceHumanAgentDispatchService(prisma),
    );
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Legal Hold Test', slug: `voice-hold-${suffix}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `voice-hold-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Compliance Lead',
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('blocks manual deletion and the retention purge until the hold is released', async () => {
    const expired = new Date(
      Date.now() - (RECORDING_RETENTION_DAYS + 1) * 86_400_000,
    );
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-hold-${Date.now()}`,
        fromNumber: '+14155550161',
        status: 'completed',
        startedAt: expired,
        recordingKey: 'voice-recordings/hold/call.mp3',
        transcript: [{ speaker: 'caller', text: 'Disputed order' }],
      },
    });

    await holds.place(
      businessId,
      userId,
      call.id,
      'Customer dispute pending review',
    );
    let caught: unknown;
    try {
      await workspace.deleteRecording(businessId, call.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).getResponse()).toMatchObject({
      code: 'VOICE_RECORDING_LEGAL_HOLD',
    });

    await retention.runPurge();
    const held = await prisma.phoneCall.findUnique({ where: { id: call.id } });
    expect(held?.recordingKey).toBe('voice-recordings/hold/call.mp3');
    expect(held?.legalHoldReason).toBe('Customer dispute pending review');

    await holds.release(
      businessId,
      userId,
      call.id,
      'Dispute closed, no further hold',
    );
    await retention.runPurge();
    expect(
      await prisma.phoneCall.findUnique({ where: { id: call.id } }),
    ).toBeNull();

    const actions = (
      await prisma.auditLog.findMany({
        where: { businessId, entityId: call.id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'call.legal_hold_placed',
        'call.legal_hold_released',
      ]),
    );
  });
});
