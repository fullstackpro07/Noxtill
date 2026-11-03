import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  EgressClient,
  EgressStatus,
  type WebhookEvent,
} from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { VoiceVideoRecordingService } from './voice-video-recording.service';

describe('VoiceVideoRecordingService (real MySQL; simulated LiveKit and S3)', () => {
  const prisma = new PrismaService();
  const configValues: Record<string, string | undefined> = {
    LIVEKIT_URL: 'https://livekit.example.test',
    LIVEKIT_API_KEY: 'qa-livekit-key',
    LIVEKIT_API_SECRET: 'qa-livekit-secret-not-used-outside-this-test',
    S3_BUCKET: 'qa-private-media',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'qa-access-key',
    S3_SECRET_ACCESS_KEY: 'qa-secret-not-used-outside-this-test',
  };
  const config = { get: (key: string) => configValues[key] } as ConfigService;
  const provider = {
    listParticipants: jest.fn(),
    startRoomCompositeEgress: jest.fn(),
    stopEgress: jest.fn(),
    listEgress: jest.fn(),
  };
  let objectExists = false;
  const storage = {
    storageMode: () => 's3',
    headObject: jest.fn(() =>
      Promise.resolve(
        objectExists ? { sizeBytes: 4096, contentType: 'video/mp4' } : null,
      ),
    ),
    getSignedDownloadUrl: jest.fn(() =>
      Promise.resolve('https://storage.example.test/short-lived'),
    ),
    delete: jest.fn(() => Promise.resolve()),
  };
  class LocalRecordingService extends VoiceVideoRecordingService {
    protected override roomClient() {
      return provider as never;
    }
    protected override egressClient() {
      return provider as unknown as EgressClient;
    }
  }
  const service = new LocalRecordingService(
    prisma,
    config,
    storage as unknown as S3Service,
  );
  let businessId = '';
  let userId = '';
  let hostId = '';
  let meetingId = '';
  let policyVersionId = '';
  let inviteId = '';
  let inviteToken = '';
  let guestParticipantId = '';
  let egressId = '';
  const hostIdentity = () => `host:${hostId}`;
  const guestIdentity = () => `guest:${inviteId}`;

  beforeAll(async () => {
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'QA meeting recording',
        slug: `qa-meeting-recording-${randomUUID()}`,
      },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        name: 'QA meeting host',
        email: `qa-meeting-recording-${randomUUID()}@example.com`,
        passwordHash: 'not-a-login',
      },
    });
    userId = user.id;
    const host = await prisma.businessUser.create({
      data: { businessId, userId, role: 'owner' },
    });
    hostId = host.id;
  });

  beforeEach(async () => {
    objectExists = false;
    egressId = `EG${randomUUID().replaceAll('-', '')}`;
    jest.clearAllMocks();
    storage.headObject.mockImplementation(() =>
      Promise.resolve(
        objectExists ? { sizeBytes: 4096, contentType: 'video/mp4' } : null,
      ),
    );
    storage.getSignedDownloadUrl.mockResolvedValue(
      'https://storage.example.test/short-lived',
    );
    provider.startRoomCompositeEgress.mockResolvedValue({ egressId });
    provider.stopEgress.mockResolvedValue({ egressId });
    provider.listEgress.mockResolvedValue([]);
    const pack = await prisma.voiceCompliancePolicyPack.create({
      data: {
        businessId,
        countryCode: 'US',
        purpose: 'meeting_recording',
        callerType: 'live_agent',
        versions: {
          create: {
            businessId,
            version: 1,
            aiDisclosureText: 'This is a QA meeting.',
            recordingAllowed: true,
            recordingNoticeText:
              'This meeting may be recorded for QA. You can decline.',
            recordingRetentionDays: 30,
            status: 'published',
            publishedAt: new Date(),
          },
        },
      },
      include: { versions: true },
    });
    policyVersionId = pack.versions[0].id;
    const meeting = await prisma.voiceVideoMeeting.create({
      data: {
        businessId,
        title: 'QA consent gated meeting',
        scheduledAt: new Date(Date.now() + 60_000),
        durationMin: 30,
        timeZone: 'UTC',
        hostBusinessUserId: hostId,
        createdByUserId: userId,
        recordingPolicyVersionId: policyVersionId,
        roomState: 'active',
      },
    });
    meetingId = meeting.id;
    const token = randomBytes(32).toString('base64url');
    inviteToken = token;
    const invite = await prisma.voiceMeetingInvite.create({
      data: {
        businessId,
        meetingId,
        email: 'qa-guest@example.com',
        guestName: 'QA invited guest',
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
        createdByUserId: userId,
      },
    });
    inviteId = invite.id;
    await prisma.voiceMeetingParticipant.create({
      data: {
        businessId,
        meetingId,
        identity: hostIdentity(),
        role: 'host',
        admission: 'admitted',
        admittedAt: new Date(),
      },
    });
    const guest = await prisma.voiceMeetingParticipant.create({
      data: {
        businessId,
        meetingId,
        inviteId,
        identity: guestIdentity(),
        role: 'guest',
        admission: 'admitted',
        admittedAt: new Date(),
      },
    });
    guestParticipantId = guest.id;
    provider.listParticipants.mockResolvedValue([
      { identity: hostIdentity() },
      { identity: guestIdentity() },
    ]);
  });

  afterEach(async () => {
    if (meetingId)
      await prisma.voiceVideoMeeting.deleteMany({
        where: { id: meetingId, businessId },
      });
    await prisma.voiceCompliancePolicyPack.deleteMany({
      where: { businessId },
    });
    if (businessId)
      await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    meetingId = '';
    policyVersionId = '';
    inviteId = '';
    inviteToken = '';
    guestParticipantId = '';
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
      await prisma.voiceVideoMeeting.deleteMany({ where: { businessId } });
      await prisma.voiceCompliancePolicyPack.deleteMany({
        where: { businessId },
      });
      await prisma.businessUser.deleteMany({ where: { businessId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  it('requires consent from every connected person and never calls Egress before consent', async () => {
    await expect(
      service.start(businessId, userId, meetingId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_INVALID' },
    });
    expect(provider.startRoomCompositeEgress).not.toHaveBeenCalled();

    const pending = await service.startConsent(
      businessId,
      userId,
      meetingId,
      true,
    );
    expect(pending).toMatchObject({
      status: 'consent_pending',
      pendingConsentCount: 1,
    });
    expect(
      await prisma.voiceVideoRecordingConsent.findUniqueOrThrow({
        where: {
          recordingId_identity: {
            recordingId: pending.id,
            identity: hostIdentity(),
          },
        },
      }),
    ).toMatchObject({ decision: 'granted', source: 'host_confirmation' });
    expect(
      await prisma.voiceVideoRecordingConsent.findUniqueOrThrow({
        where: {
          recordingId_identity: {
            recordingId: pending.id,
            identity: guestIdentity(),
          },
        },
      }),
    ).toMatchObject({ decision: 'pending' });
    await expect(
      service.start(businessId, userId, meetingId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_INVALID' },
    });
    expect(provider.startRoomCompositeEgress).not.toHaveBeenCalled();

    await service.guestConsent(inviteToken, pending.id, true);
    expect(
      await service.canGuestJoin(businessId, meetingId, inviteId),
    ).toMatchObject({
      allowed: true,
      consent: { status: 'granted' },
    });
    expect(guestParticipantId).toBeTruthy();
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: meetingId,
          action: 'voice.meeting.recording_consent_granted',
        },
      }),
    ).toBe(1);
  });

  it('shows artifacts only after provider completion and a verified private object exists', async () => {
    const consent = await service.startConsent(
      businessId,
      userId,
      meetingId,
      true,
    );
    await service.guestConsent(inviteToken, consent.id, true);
    const started = await service.start(businessId, userId, meetingId);
    expect(started).toMatchObject({ id: consent.id, status: 'starting' });
    expect(started.message).toContain('must still be confirmed');
    expect(provider.startRoomCompositeEgress).toHaveBeenCalledTimes(1);
    expect(
      (
        await prisma.voiceVideoRecording.findUniqueOrThrow({
          where: { id: consent.id },
        })
      ).status,
    ).toBe('starting');
    expect(
      (await service.artifacts(businessId, meetingId)).recordings[0]
        .downloadUrl,
    ).toBeNull();

    const event = (
      name: string,
      info: Record<string, unknown>,
      eventId: string,
    ): WebhookEvent =>
      ({
        event: name,
        id: eventId,
        createdAt: Math.floor(Date.now() / 1000),
        egressInfo: info,
      }) as unknown as WebhookEvent;
    await service.providerEvent(
      event(
        'egress_started',
        {
          egressId,
          roomName: `voice-meeting-${meetingId}`,
          status: EgressStatus.EGRESS_ACTIVE,
        },
        'evt-start',
      ),
    );
    expect(
      (
        await prisma.voiceVideoRecording.findUniqueOrThrow({
          where: { id: consent.id },
        })
      ).status,
    ).toBe('recording');

    await service.providerEvent(
      event(
        'egress_ended',
        {
          egressId,
          roomName: `voice-meeting-${meetingId}`,
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [
            {
              filename: `voice-video/${businessId}/${meetingId}/${consent.id}.mp4`,
            },
          ],
        },
        'evt-end',
      ),
    );
    expect(
      (
        await prisma.voiceVideoRecording.findUniqueOrThrow({
          where: { id: consent.id },
        })
      ).status,
    ).toBe('processing');
    expect(
      (await service.artifacts(businessId, meetingId)).recordings[0]
        .downloadUrl,
    ).toBeNull();

    objectExists = true;
    await service.providerEvent(
      event(
        'egress_ended',
        {
          egressId,
          roomName: `voice-meeting-${meetingId}`,
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [
            {
              filename: `voice-video/${businessId}/${meetingId}/${consent.id}.mp4`,
            },
          ],
        },
        'evt-end-retry',
      ),
    );
    expect(
      await prisma.voiceVideoRecording.findUniqueOrThrow({
        where: { id: consent.id },
      }),
    ).toMatchObject({
      status: 'ready',
      sizeBytes: BigInt(4096),
    });
    expect(
      (await service.artifacts(businessId, meetingId)).recordings[0],
    ).toMatchObject({
      status: 'ready',
      downloadUrl: 'https://storage.example.test/short-lived',
      sizeBytes: '4096',
    });
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
      `voice-video/${businessId}/${meetingId}/${consent.id}.mp4`,
      300,
    );
  });

  it('stops when a guest withdraws consent after provider recording begins', async () => {
    const consent = await service.startConsent(
      businessId,
      userId,
      meetingId,
      true,
    );
    await service.guestConsent(inviteToken, consent.id, true);
    await service.start(businessId, userId, meetingId);
    const event = {
      event: 'egress_started',
      id: 'evt-withdraw-start',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: { egressId, roomName: `voice-meeting-${meetingId}` },
    } as unknown as WebhookEvent;
    await service.providerEvent(event);
    expect(
      await service.guestConsent(inviteToken, consent.id, false),
    ).toMatchObject({ status: 'stopping' });
    expect(provider.stopEgress).toHaveBeenCalledWith(egressId);
    expect(
      await prisma.voiceVideoRecordingConsent.findUniqueOrThrow({
        where: {
          recordingId_identity: {
            recordingId: consent.id,
            identity: guestIdentity(),
          },
        },
      }),
    ).toMatchObject({ decision: 'revoked', source: 'guest_withdrawal' });
    expect(
      (
        await prisma.voiceVideoRecording.findUniqueOrThrow({
          where: { id: consent.id },
        })
      ).status,
    ).toBe('stopping');
  });

  it('does not start after a guest declines and deletes expired verified recordings', async () => {
    const consent = await service.startConsent(
      businessId,
      userId,
      meetingId,
      true,
    );
    await service.guestConsent(inviteToken, consent.id, false);
    expect(
      await prisma.voiceVideoRecording.findUniqueOrThrow({
        where: { id: consent.id },
      }),
    ).toMatchObject({ status: 'declined' });
    await expect(
      service.start(businessId, userId, meetingId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_INVALID' },
    });
    expect(provider.startRoomCompositeEgress).not.toHaveBeenCalled();

    const storageKey = `voice-video/${businessId}/${meetingId}/${consent.id}.mp4`;
    const finalizedAt = new Date(Date.now() - 2 * 86_400_000);
    await prisma.voiceVideoRecording.update({
      where: { id: consent.id },
      data: {
        status: 'ready',
        storageKey,
        retentionExpiresAt: new Date(Date.now() - 60_000),
        sizeBytes: BigInt(4096),
        finalizedAt,
      },
    });
    const artifacts = await service.artifacts(businessId, meetingId);
    expect(artifacts.recordings[0]).toMatchObject({
      status: 'ready',
      downloadUrl: null,
      sizeBytes: '4096',
    });
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();

    expect(await service.expireReadyRecordings()).toMatchObject({
      checked: 1,
      deleted: 1,
    });
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
    expect(
      await prisma.voiceVideoRecording.findUniqueOrThrow({
        where: { id: consent.id },
      }),
    ).toMatchObject({ status: 'deleted', storageKey: null });
    const storageUsage = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: {
          businessId,
          eventKey: `recording-storage:${consent.id}`,
        },
      },
    });
    expect(storageUsage).toMatchObject({
      provider: 'storage',
      unit: 'recording_storage_byte_days',
      state: 'unpriced',
      cost: null,
    });
    expect(Number(storageUsage.quantity)).toBeGreaterThan(8191);
    expect(Number(storageUsage.quantity)).toBeLessThan(8193);
  });

  it('expires a consent request after its meeting has ended', async () => {
    const consent = await service.startConsent(
      businessId,
      userId,
      meetingId,
      true,
    );
    await prisma.voiceVideoMeeting.update({
      where: { id: meetingId },
      data: { roomState: 'ended', endedAt: new Date() },
    });
    expect(await service.expireStaleConsentSessions()).toMatchObject({
      checked: 1,
      cancelled: 1,
    });
    expect(
      await prisma.voiceVideoRecording.findUniqueOrThrow({
        where: { id: consent.id },
      }),
    ).toMatchObject({
      status: 'cancelled',
      failureCode: 'CONSENT_SESSION_EXPIRED',
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: meetingId,
          action: 'voice.meeting.recording_consent_expired',
        },
      }),
    ).toBe(1);
  });
});
