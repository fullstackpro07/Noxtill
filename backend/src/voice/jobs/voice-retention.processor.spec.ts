import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
import { VoiceRetentionProcessor } from './voice-retention.processor';
import { RECORDING_RETENTION_DAYS } from '../voice.constants';
import { VoiceHumanAgentDispatchService } from '../voice-human-agent-dispatch.service';
import { VoiceUsageMeteringService } from '../voice-usage-metering.service';
import { VoiceCallReconciliationService } from '../voice-call-reconciliation.service';
import { VoiceProviderWebhookEventsService } from '../voice-provider-webhook-events.service';
import { Job } from 'bullmq';

describe('VoiceRetentionProcessor (UPD-BE-059)', () => {
  let prisma: PrismaService;
  let processor: VoiceRetentionProcessor;
  let businessId: string;
  const s3 = { delete: jest.fn() };
  const providerWebhookEvents = { retryDue: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new VoiceRetentionProcessor(
      prisma,
      s3 as unknown as S3Service,
      new VoiceHumanAgentDispatchService(prisma),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new VoiceUsageMeteringService(prisma),
      providerWebhookEvents as unknown as VoiceProviderWebhookEventsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Voice Retention Test Biz',
        slug: `voice-retention-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    s3.delete.mockReset();
  });

  afterAll(async () => {
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('purges a real expired call and its recording, but keeps a recent one', async () => {
    s3.delete.mockResolvedValue(undefined);
    const expiredDate = new Date(
      Date.now() - (RECORDING_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    );

    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-expired',
        fromNumber: '+15550004001',
        status: 'completed',
        startedAt: expiredDate,
        recordingKey: 'voice-recordings/x/expired.mp3',
        transcript: [
          { speaker: 'caller', recordingKey: 'voice-recordings/x/expired.mp3' },
        ],
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-expired-root-only',
        fromNumber: '+15550004003',
        status: 'completed',
        startedAt: expiredDate,
        recordingKey: 'voice-recordings/x/root-only.mp3',
        transcript: [],
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-recent',
        fromNumber: '+15550004002',
        status: 'completed',
        startedAt: new Date(),
        transcript: [],
      },
    });

    await processor.runPurge();

    const expired = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-expired' },
    });
    const recent = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-recent' },
    });
    expect(expired).toBeNull();
    expect(recent).not.toBeNull();

    expect(s3.delete).toHaveBeenCalledWith('voice-recordings/x/expired.mp3');
    expect(s3.delete).toHaveBeenCalledWith('voice-recordings/x/root-only.mp3');
    expect(s3.delete).toHaveBeenCalledTimes(2);
  });

  it('runs the provider webhook retry job through the retention queue worker', async () => {
    providerWebhookEvents.retryDue.mockResolvedValue({
      attempted: 2,
      deadLettered: 1,
    });

    await processor.process({ name: 'retry-provider-webhook-events' } as Job);

    expect(providerWebhookEvents.retryDue).toHaveBeenCalledTimes(1);
  });

  it('records actual stored byte-days when a metered call recording is deleted', async () => {
    s3.delete.mockResolvedValue(undefined);
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-metered-retention',
        fromNumber: '+15550004014',
        status: 'completed',
        startedAt: new Date(
          Date.now() - (RECORDING_RETENTION_DAYS + 2) * 86400000,
        ),
        recordingKey: 'voice-recordings/qa/retention-metering.mp3',
        transcript: [],
      },
    });
    const metering = new VoiceUsageMeteringService(prisma);
    await metering.recordUpload(
      businessId,
      call.callSid,
      call.recordingKey!,
      4096,
    );
    const upload = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { businessId, callId: call.id, unit: 'recording_uploaded_bytes' },
    });
    const storedFrom = new Date(Date.now() - 2 * 86400000);
    await prisma.voiceUsageRecord.update({
      where: { id: upload.id },
      data: { measuredAt: storedFrom },
    });

    await processor.runPurge();

    const retention = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: {
        businessId,
        eventKey: upload.eventKey.replace(
          'storage:upload:',
          'storage:byte-days:',
        ),
      },
    });
    const evidence = retention.evidence as {
      storedFrom: string;
      deletedAt: string;
    };
    const expectedByteDays =
      (4096 *
        (new Date(evidence.deletedAt).getTime() -
          new Date(evidence.storedFrom).getTime())) /
      86400000;
    expect(Number(retention.quantity)).toBeCloseTo(expectedByteDays, 4);
    expect(retention).toMatchObject({
      unit: 'recording_storage_byte_days',
      provider: 'storage',
      state: 'unpriced',
      cost: null,
      callId: null,
    });
  });

  it('dispatches the orphaned-call job to provider reconciliation', async () => {
    const reconciliation = {
      reconcileStaleCalls: jest.fn().mockResolvedValue({
        checked: 1,
        reconciled: 0,
        failed: 0,
        notConfigured: false,
      }),
    };
    const worker = new VoiceRetentionProcessor(
      prisma,
      s3 as unknown as S3Service,
      new VoiceHumanAgentDispatchService(prisma),
      undefined,
      undefined,
      reconciliation as unknown as VoiceCallReconciliationService,
    );

    await worker.process({ name: 'reconcile-orphaned-calls' } as Job);

    expect(reconciliation.reconcileStaleCalls).toHaveBeenCalledTimes(1);
  });

  it('does not abort the whole run when one row fails to purge', async () => {
    s3.delete.mockRejectedValueOnce(new Error('S3 unavailable'));
    const expiredDate = new Date(
      Date.now() - (RECORDING_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    );

    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: 'CA-expired-fails',
          fromNumber: '+15550004003',
          status: 'completed',
          startedAt: expiredDate,
          transcript: [
            { speaker: 'caller', recordingKey: 'voice-recordings/x/fails.mp3' },
          ],
        },
        {
          businessId,
          callSid: 'CA-expired-succeeds',
          fromNumber: '+15550004004',
          status: 'completed',
          startedAt: expiredDate,
          transcript: [],
        },
      ],
    });

    await processor.runPurge();

    const failed = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-expired-fails' },
    });
    const succeeded = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-expired-succeeds' },
    });
    // The failing row's S3 delete threw before the DB delete ran, so it's still there — real, honest behavior, not silently dropped.
    expect(failed).not.toBeNull();
    expect(succeeded).toBeNull();
  });

  it('uses each completed call policy expiry and never purges a live call', async () => {
    s3.delete.mockResolvedValue(undefined);
    const agedDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: 'CA-policy-expired',
          fromNumber: '+15550004011',
          status: 'completed',
          startedAt: agedDate,
          recordingRetentionDays: 30,
          recordingExpiresAt: new Date(Date.now() - 1000),
          recordingKey: 'voice-recordings/x/policy-expired.mp3',
          transcript: [],
        },
        {
          businessId,
          callSid: 'CA-policy-retained',
          fromNumber: '+15550004012',
          status: 'completed',
          startedAt: agedDate,
          recordingRetentionDays: 365,
          recordingExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          recordingKey: 'voice-recordings/x/policy-retained.mp3',
          transcript: [],
        },
        {
          businessId,
          callSid: 'CA-live-old',
          fromNumber: '+15550004013',
          status: 'in_progress',
          startedAt: agedDate,
          recordingKey: 'voice-recordings/x/live.mp3',
          transcript: [],
        },
      ],
    });

    await processor.runPurge();

    expect(
      await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-policy-expired' },
      }),
    ).toBeNull();
    expect(
      await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-policy-retained' },
      }),
    ).not.toBeNull();
    expect(
      await prisma.phoneCall.findUnique({ where: { callSid: 'CA-live-old' } }),
    ).not.toBeNull();
    expect(s3.delete).toHaveBeenCalledWith(
      'voice-recordings/x/policy-expired.mp3',
    );
    expect(s3.delete).not.toHaveBeenCalledWith(
      'voice-recordings/x/policy-retained.mp3',
    );
    expect(s3.delete).not.toHaveBeenCalledWith('voice-recordings/x/live.mp3');
  });

  it('processes the minute tick for expired human-agent reservations', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-reservation-expired',
        fromNumber: '+15550004005',
        status: 'in_progress',
      },
    });
    const staffUser = await prisma.user.create({
      data: {
        email: `voice-reservation-expiry-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'Reservation Agent',
        phone: '+15550004006',
      },
    });
    const businessUser = await prisma.businessUser.create({
      data: { businessId, userId: staffUser.id, role: 'staff' },
    });
    const profile = await prisma.voiceHumanAgentProfile.create({
      data: {
        businessId,
        staffUserId: businessUser.id,
        maxConcurrentCalls: 1,
      },
    });
    const assignment = await prisma.voiceHumanAgentAssignment.create({
      data: {
        businessId,
        callId: call.id,
        staffUserId: businessUser.id,
        profileId: profile.id,
        status: 'offered',
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    await processor.process({ name: 'expire-agent-reservations' } as never);

    const released = await prisma.voiceHumanAgentAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(released).toMatchObject({
      status: 'released',
      providerStatus: 'reservation_timeout',
    });
    await prisma.voiceHumanAgentAssignment.delete({
      where: { id: assignment.id },
    });
    await prisma.voiceHumanAgentProfile.delete({ where: { id: profile.id } });
    await prisma.businessUser.delete({ where: { id: businessUser.id } });
    await prisma.user.delete({ where: { id: staffUser.id } });
  });
});
