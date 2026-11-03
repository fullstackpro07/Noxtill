import { randomUUID } from 'crypto';
import { PhoneCallStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceProviderWebhookEventsService } from './voice-provider-webhook-events.service';

describe('VoiceProviderWebhookEventsService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceProviderWebhookEventsService;
  let businessId: string;
  const handleStatus = jest.fn<Promise<void>, [string, string, number?]>();
  const recordTransferProviderStatus = jest.fn<
    Promise<void>,
    [string, number, string, string?, number?]
  >();
  const recordConferenceUsage = jest.fn<
    Promise<void>,
    [Record<string, string>]
  >();
  const queueRecording = jest.fn<Promise<void>, [string, string]>();
  const handleDialStatus = jest.fn<
    Promise<void>,
    [string, string, number?, string?, number?]
  >();
  const projector = {
    handleStatus,
    recordTransferProviderStatus,
    handleDialStatus,
  } as unknown as VoiceCallService;
  const mediaMetering = {
    conference: recordConferenceUsage,
  };
  const realtimeVoice = { queueRecording };

  const createCall = () =>
    prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA${randomUUID().replaceAll('-', '').slice(0, 32)}`,
        fromNumber: '+14155550120',
        status: PhoneCallStatus.in_progress,
        transcript: [],
      },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Voice Webhook Event Test Biz',
        slug: `voice-webhook-events-${randomUUID()}`,
      },
    });
    businessId = business.id;
    service = new VoiceProviderWebhookEventsService(
      prisma,
      projector,
      mediaMetering as never,
      realtimeVoice as never,
    );
  });

  beforeEach(() => {
    handleStatus.mockReset().mockResolvedValue(undefined);
    recordTransferProviderStatus.mockReset().mockResolvedValue(undefined);
    recordConferenceUsage.mockReset().mockResolvedValue(undefined);
    queueRecording.mockReset().mockResolvedValue(undefined);
    handleDialStatus.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.voiceProviderWebhookEvent.deleteMany({
      where: { businessId },
    });
    await prisma.auditLog.deleteMany({
      where: { businessId, entity: 'VoiceProviderWebhookEvent' },
    });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('stores only allowlisted status fields and projects duplicate callbacks once', async () => {
    const call = await createCall();

    await service.receiveCallStatus(call.callSid, 'completed', 7);
    await service.receiveCallStatus(call.callSid, 'completed', 7);

    const events = await prisma.voiceProviderWebhookEvent.findMany({
      where: { businessId, callSid: call.callSid },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'call.status',
      sequenceNumber: 7,
      state: 'processed',
      attemptCount: 1,
    });
    expect(events[0].payload).toEqual({
      callSid: call.callSid,
      callStatus: 'completed',
      sequenceNumber: 7,
    });
    expect(handleStatus).toHaveBeenCalledTimes(1);
    expect(handleStatus).toHaveBeenCalledWith(call.callSid, 'completed', 7);
  });

  it('stores and deduplicates destination-leg transfer status callbacks', async () => {
    const call = await createCall();
    const transfer = await prisma.voiceCallTransfer.create({
      data: {
        businessId,
        callId: call.id,
        attemptNumber: 1,
        destination: '+14155550121',
      },
    });
    const providerCallSid = `CA${randomUUID().replaceAll('-', '').slice(0, 32)}`;

    await service.receiveTransferStatus(
      call.id,
      transfer.attemptNumber,
      'ringing',
      providerCallSid,
      2,
    );
    await service.receiveTransferStatus(
      call.id,
      transfer.attemptNumber,
      'ringing',
      providerCallSid,
      2,
    );

    const event = await prisma.voiceProviderWebhookEvent.findFirstOrThrow({
      where: {
        businessId,
        eventType: 'transfer.status',
        callSid: call.callSid,
      },
    });
    expect(event.state).toBe('processed');
    expect(event.sequenceNumber).toBe(2);
    expect(recordTransferProviderStatus).toHaveBeenCalledTimes(1);
    expect(recordTransferProviderStatus).toHaveBeenCalledWith(
      call.id,
      1,
      'ringing',
      providerCallSid,
      2,
    );
  });

  it('persists agent-leg callback identity and projects a duplicate once', async () => {
    const call = await createCall();
    const providerCallSid = `CA${randomUUID().replaceAll('-', '')}`;
    await service.receiveAgentStatus(
      call.callSid,
      'no-answer',
      2,
      providerCallSid,
      4,
    );
    await service.receiveAgentStatus(
      call.callSid,
      'no-answer',
      2,
      providerCallSid,
      4,
    );
    const events = await prisma.voiceProviderWebhookEvent.findMany({
      where: { businessId, callSid: call.callSid },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'agent.status',
      state: 'processed',
      attemptCount: 1,
    });
    expect(events[0].payload).toEqual({
      callSid: call.callSid,
      callStatus: 'no-answer',
      attemptNumber: 2,
      providerCallSid,
      sequenceNumber: 4,
    });
    expect(handleDialStatus).toHaveBeenCalledTimes(1);
    expect(handleDialStatus).toHaveBeenCalledWith(
      call.callSid,
      'no-answer',
      2,
      providerCallSid,
      4,
    );
  });

  it('stores allowlisted conference usage fields and projects duplicate provider events once', async () => {
    const call = await createCall();
    const body = {
      AccountSid: 'AC-provider-account',
      StatusCallbackEvent: 'participant-join',
      FriendlyName: call.callSid,
      ConferenceSid: `CF${randomUUID().replaceAll('-', '').slice(0, 32)}`,
      CallSid: `CA${randomUUID().replaceAll('-', '').slice(0, 32)}`,
      SequenceNumber: '4',
      Timestamp: new Date().toISOString(),
      RecordingUrl: 'https://provider.example/never-store-this',
    };

    await service.receiveConferenceUsage(body);
    await service.receiveConferenceUsage(body);

    const event = await prisma.voiceProviderWebhookEvent.findFirstOrThrow({
      where: {
        businessId,
        callSid: call.callSid,
        eventType: 'conference.usage',
      },
    });
    expect(event.state).toBe('processed');
    expect(event.payload).toEqual({
      AccountSid: body.AccountSid,
      StatusCallbackEvent: body.StatusCallbackEvent,
      FriendlyName: body.FriendlyName,
      ConferenceSid: body.ConferenceSid,
      CallSid: body.CallSid,
      SequenceNumber: body.SequenceNumber,
      Timestamp: body.Timestamp,
    });
    expect(recordConferenceUsage).toHaveBeenCalledTimes(1);
    expect(recordConferenceUsage).toHaveBeenCalledWith(event.payload);
  });

  it('durably retries and audits a completed realtime recording callback', async () => {
    const call = await createCall();
    const recordingSid = `RE${randomUUID().replaceAll('-', '').slice(0, 32)}`;
    queueRecording
      .mockRejectedValueOnce(new Error('media queue temporarily unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.receiveRealtimeRecording(call.callSid, recordingSid),
    ).rejects.toThrow('media queue temporarily unavailable');

    const failed = await prisma.voiceProviderWebhookEvent.findFirstOrThrow({
      where: {
        businessId,
        callSid: call.callSid,
        eventType: 'realtime.recording.completed',
      },
    });
    expect(failed.state).toBe('failed');
    expect(failed.payload).toEqual({ callSid: call.callSid, recordingSid });

    const replayed = await service.replay(
      businessId,
      'operator-user-id',
      failed.id,
    );
    expect(replayed).toMatchObject({ state: 'processed', replayCount: 1 });
    expect(queueRecording).toHaveBeenCalledTimes(2);
    expect(queueRecording).toHaveBeenLastCalledWith(call.callSid, recordingSid);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'VoiceProviderWebhookEvent',
          entityId: failed.id,
          action: 'voice.provider_webhook.replayed',
        },
      }),
    ).toBe(1);
  });

  it('keeps a failed callback retryable and audits an operator replay', async () => {
    const call = await createCall();
    handleStatus
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.receiveCallStatus(call.callSid, 'completed', 8),
    ).rejects.toThrow('temporary database failure');

    const failed = await prisma.voiceProviderWebhookEvent.findFirstOrThrow({
      where: { businessId, callSid: call.callSid },
    });
    expect(failed.state).toBe('failed');
    expect(failed.attemptCount).toBe(1);
    expect(failed.consecutiveFailures).toBe(1);
    expect(failed.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());

    const replayed = await service.replay(
      businessId,
      'operator-user-id',
      failed.id,
    );
    expect(replayed).toMatchObject({
      state: 'processed',
      attemptCount: 2,
      consecutiveFailures: 0,
      replayCount: 1,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        businessId,
        entity: 'VoiceProviderWebhookEvent',
        entityId: failed.id,
        action: 'voice.provider_webhook.replayed',
      },
    });
    expect(audit.actorUserId).toBe('operator-user-id');
  });

  it('dead-letters after five consecutive failures and exposes the record to operators', async () => {
    const call = await createCall();
    handleStatus.mockRejectedValue(
      new Error('provider projection unavailable'),
    );

    await expect(
      service.receiveCallStatus(call.callSid, 'completed', 9),
    ).rejects.toThrow('provider projection unavailable');

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await prisma.voiceProviderWebhookEvent.updateMany({
        where: { businessId, callSid: call.callSid },
        data: { nextAttemptAt: new Date(Date.now() - 1_000) },
      });
      await service.retryDue();
    }

    const events = await service.listFailures(businessId);
    const event = events.find((row) => row.callSid === call.callSid);
    expect(event).toMatchObject({
      state: 'dead_letter',
      attemptCount: 5,
      consecutiveFailures: 5,
    });
    expect(event?.lastError).toContain('provider projection unavailable');
  });
});
