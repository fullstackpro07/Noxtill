import { createHash, randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  ParticipantInfo,
  AccessToken,
  RoomServiceClient,
  TrackInfo,
  TrackSource,
  WebhookEvent,
} from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceVideoRoomService } from './voice-video-room.service';
import { VoiceMediaMeteringService } from './voice-media-metering.service';

describe('Video waiting room, host controls and provider state (real MySQL; simulated LiveKit)', () => {
  const prisma = new PrismaService();
  const settings: Record<string, string> = {
    LIVEKIT_URL: 'https://livekit.example.test',
    LIVEKIT_API_KEY: 'qa-key',
    LIVEKIT_API_SECRET: 'qa-only-secret-no-external-requests',
  };
  const config = { get: (key: string) => settings[key] } as ConfigService;
  const provider = {
    listParticipants: jest.fn(),
    listRooms: jest.fn(),
    removeParticipant: jest.fn(),
    mutePublishedTrack: jest.fn(),
    deleteRoom: jest.fn(),
  };
  class LocalRooms extends VoiceVideoRoomService {
    protected override roomClient() {
      return provider as unknown as RoomServiceClient;
    }
  }
  const rooms = new LocalRooms(prisma, config);
  let businessId: string,
    otherBusinessId: string,
    userId: string,
    hostId: string,
    meetingId: string;
  let token: string, inviteId: string;
  const makeInvite = async () => {
    const secret = randomBytes(32).toString('base64url');
    const invite = await prisma.voiceMeetingInvite.create({
      data: {
        businessId,
        meetingId,
        email: 'qa-invited@example.com',
        guestName: 'QA invited guest',
        tokenHash: createHash('sha256').update(secret).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        createdByUserId: userId,
      },
    });
    return { token: secret, id: invite.id };
  };
  const requested = () =>
    prisma.voiceMeetingParticipant.findUniqueOrThrow({ where: { inviteId } });
  beforeAll(async () => {
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'QA video room rules',
          slug: `qa-video-room-${randomUUID()}`,
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'QA other video tenant',
          slug: `qa-video-other-${randomUUID()}`,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'QA assigned host',
          email: `qa-video-${randomUUID()}@example.com`,
          passwordHash: 'test-not-a-login',
        },
      })
    ).id;
    hostId = (
      await prisma.businessUser.create({
        data: { businessId, userId, role: 'owner' },
      })
    ).id;
  });
  beforeEach(async () => {
    for (const fn of Object.values(provider)) fn.mockReset();
    provider.listParticipants.mockResolvedValue([
      new ParticipantInfo({ identity: `host:${hostId}`, sid: 'PA-host' }),
    ]);
    provider.listRooms.mockResolvedValue([]);
    provider.removeParticipant.mockResolvedValue(undefined);
    provider.mutePublishedTrack.mockResolvedValue(undefined);
    provider.deleteRoom.mockResolvedValue(undefined);
    settings.LIVEKIT_API_KEY = 'qa-key';
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    meetingId = (
      await prisma.voiceVideoMeeting.create({
        data: {
          businessId,
          title: 'QA waiting room test',
          hostBusinessUserId: hostId,
          scheduledAt: new Date(Date.now() + 300000),
          durationMin: 30,
          timeZone: 'UTC',
          createdByUserId: userId,
        },
      })
    ).id;
    const invite = await makeInvite();
    token = invite.token;
    inviteId = invite.id;
  });
  afterAll(async () => {
    if (businessId) {
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
      await prisma.voiceVideoMeeting.deleteMany({ where: { businessId } });
      await prisma.businessUser.deleteMany({ where: { businessId } });
      if (userId) await prisma.user.delete({ where: { id: userId } });
      await prisma.business.deleteMany({
        where: { id: { in: [businessId, otherBusinessId].filter(Boolean) } },
      });
    }
    await prisma.$disconnect();
  });

  it('issues no guest room token before admission, deduplicates requests, and pins host/guest grants', async () => {
    const first = await rooms.guestJoinToken(token);
    const again = await rooms.guestJoinToken(token);
    expect(first).toMatchObject({ status: 'waiting' });
    expect(again).toMatchObject({ status: 'waiting' });
    expect('token' in first).toBe(false);
    expect(
      await prisma.voiceMeetingParticipant.count({ where: { meetingId } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: meetingId,
          action: 'voice.meeting.lobby_requested',
        },
      }),
    ).toBe(1);
    expect((await requested()).providerJoinedAt).toBeNull();
    const host = await rooms.hostJoinToken(businessId, userId, meetingId);
    await rooms.decide(
      businessId,
      userId,
      meetingId,
      (await requested()).id,
      'admitted',
      'QA host admitted this invitation',
    );
    const guest = await rooms.guestJoinToken(token);
    if (!('token' in guest)) throw Error('Expected admitted access');
    expect(host.screenShare).toBe(true);
    expect(guest.screenShare).toBe(false);
    for (const [access, sources] of [
      [host, ['camera', 'microphone', 'screen_share', 'screen_share_audio']],
      [guest, ['camera', 'microphone']],
    ] as const) {
      const claims = JSON.parse(
        Buffer.from(access.token.split('.')[1], 'base64url').toString(),
      ) as {
        exp: number;
        video: {
          canPublishSources: string[];
          roomAdmin: boolean;
          roomRecord: boolean;
          room: string;
        };
      };
      expect(claims.video.canPublishSources).toEqual(sources);
      expect(claims.video.roomAdmin).toBe(false);
      expect(claims.video.roomRecord).toBe(false);
      expect(claims.video.room).toBe(`voice-meeting-${meetingId}`);
      expect(claims.exp).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000) + 61,
      );
    }
    expect((await requested()).providerJoinedAt).toBeNull();
  });

  it('does not bypass a denial by repeating the personal invite request', async () => {
    await rooms.guestJoinToken(token);
    await rooms.decide(
      businessId,
      userId,
      meetingId,
      (await requested()).id,
      'denied',
      'QA host denied this invitation',
    );
    expect(await rooms.guestJoinToken(token)).toMatchObject({
      status: 'denied',
    });
    expect((await rooms.guestLobby(token)).status).toBe('denied');
  });

  it('enforces the actual assigned host, business and participant-to-meeting boundary', async () => {
    await rooms.guestJoinToken(token);
    const row = await requested();
    await expect(
      rooms.hostLobby(otherBusinessId, userId, meetingId),
    ).rejects.toMatchObject({ response: { code: 'VOICE_MEETING_NOT_FOUND' } });
    await expect(
      rooms.hostLobby(businessId, randomUUID(), meetingId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_HOST_NOT_FOUND' },
    });
    await expect(
      rooms.decide(
        businessId,
        userId,
        meetingId,
        randomUUID(),
        'admitted',
        'QA invalid participant boundary',
      ),
    ).rejects.toMatchObject({ response: { code: 'VOICE_MEETING_INVALID' } });
    expect(
      (
        await prisma.voiceMeetingParticipant.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).admission,
    ).toBe('waiting');
  });

  it('serializes concurrent admissions against the real configured seat limit', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'voice.meetingGuestLimit': 1 } },
    });
    const other = await makeInvite();
    await rooms.guestJoinToken(token);
    await rooms.guestJoinToken(other.token);
    const a = await requested();
    const b = await prisma.voiceMeetingParticipant.findUniqueOrThrow({
      where: { inviteId: other.id },
    });
    const results = await Promise.allSettled([
      rooms.decide(
        businessId,
        userId,
        meetingId,
        a.id,
        'admitted',
        'QA first seat request',
      ),
      rooms.decide(
        businessId,
        userId,
        meetingId,
        b.id,
        'admitted',
        'QA competing seat request',
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.voiceMeetingParticipant.count({
        where: { meetingId, admission: 'admitted', role: 'guest' },
      }),
    ).toBe(1);
  });

  it('requires provider-confirmed host presence before admission and each guest token', async () => {
    await rooms.guestJoinToken(token);
    provider.listParticipants.mockResolvedValue([]);
    await expect(
      rooms.decide(
        businessId,
        userId,
        meetingId,
        (await requested()).id,
        'admitted',
        'QA host not connected',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_HOST_NOT_CONNECTED' },
    });
    provider.listParticipants.mockResolvedValue([
      new ParticipantInfo({ identity: `host:${hostId}` }),
    ]);
    await rooms.decide(
      businessId,
      userId,
      meetingId,
      (await requested()).id,
      'admitted',
      'QA host now connected',
    );
    provider.listParticipants.mockResolvedValue([]);
    expect(await rooms.guestJoinToken(token)).toMatchObject({
      status: 'waiting',
    });
    provider.listParticipants.mockRejectedValue(
      new Error('simulated provider outage'),
    );
    await expect(rooms.guestJoinToken(token)).rejects.toMatchObject({
      response: { code: 'VOICE_VIDEO_PROVIDER_UNAVAILABLE' },
    });
  });

  it('refuses unconfigured media and expired or revoked invitations', async () => {
    delete settings.LIVEKIT_API_KEY;
    await expect(rooms.guestJoinToken(token)).rejects.toMatchObject({
      response: { code: 'VOICE_PROVIDER_NOT_CONFIGURED' },
    });
    settings.LIVEKIT_API_KEY = 'qa-key';
    await prisma.voiceMeetingInvite.update({
      where: { id: inviteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(rooms.guestJoinToken(token)).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_INVITE_INVALID' },
    });
    await prisma.voiceMeetingInvite.update({
      where: { id: inviteId },
      data: { expiresAt: new Date(Date.now() + 300000), revokedAt: new Date() },
    });
    await expect(rooms.guestJoinToken(token)).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_INVITE_INVALID' },
    });
  });

  it('revokes new joins even when provider removal is uncertain, without claiming disconnection', async () => {
    await rooms.guestJoinToken(token);
    const row = await requested();
    await rooms.decide(
      businessId,
      userId,
      meetingId,
      row.id,
      'admitted',
      'QA admit before removal',
    );
    provider.removeParticipant.mockRejectedValue(
      new Error('simulated provider outage'),
    );
    const removed = await rooms.moderate(
      businessId,
      userId,
      meetingId,
      row.id,
      'remove',
      'QA remove with failed provider request',
    );
    expect(removed.providerRequest).toBe('pending');
    expect(await rooms.guestJoinToken(token)).toMatchObject({
      status: 'revoked',
    });
    expect((await requested()).providerLeftAt).toBeNull();
  });

  it('mutes a published microphone through LiveKit and refuses a fake mute without a track', async () => {
    await rooms.guestJoinToken(token);
    const row = await requested();
    provider.listParticipants.mockResolvedValue([
      new ParticipantInfo({
        identity: row.identity,
        tracks: [
          new TrackInfo({ sid: 'TR-mic', source: TrackSource.MICROPHONE }),
        ],
      }),
    ]);
    expect(
      (
        await rooms.moderate(
          businessId,
          userId,
          meetingId,
          row.id,
          'mute',
          'QA host muted microphone',
        )
      ).providerRequest,
    ).toBe('accepted');
    expect(provider.mutePublishedTrack).toHaveBeenCalledWith(
      `voice-meeting-${meetingId}`,
      row.identity,
      'TR-mic',
      true,
    );
    provider.listParticipants.mockResolvedValue([
      new ParticipantInfo({ identity: row.identity }),
    ]);
    await expect(
      rooms.moderate(
        businessId,
        userId,
        meetingId,
        row.id,
        'mute',
        'QA no published microphone',
      ),
    ).rejects.toMatchObject({ response: { code: 'VOICE_MEETING_INVALID' } });
  });

  it('keeps ending pending on outage and reconciles only after the provider reports no room', async () => {
    provider.deleteRoom.mockRejectedValue(
      new Error('simulated provider outage'),
    );
    expect(
      (
        await rooms.end(
          businessId,
          userId,
          meetingId,
          'QA end room during outage',
        )
      ).status,
    ).toBe('ending');
    expect(
      (
        await prisma.voiceVideoMeeting.findUniqueOrThrow({
          where: { id: meetingId },
        })
      ).status,
    ).toBe('scheduled');
    await expect(rooms.guestJoinToken(token)).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_INVITE_INVALID' },
    });
    provider.deleteRoom.mockResolvedValue(undefined);
    provider.listRooms.mockResolvedValue([]);
    await rooms.reconcileClosures(businessId, meetingId);
    expect(
      (
        await prisma.voiceVideoMeeting.findUniqueOrThrow({
          where: { id: meetingId },
        })
      ).status,
    ).toBe('ended');
  });

  it('does not regress signed room lifecycle when older provider events arrive late', async () => {
    const now = Math.floor(Date.now() / 1000);
    const event = (kind: string, at: number) =>
      WebhookEvent.fromJsonString(
        JSON.stringify({
          id: randomUUID(),
          event: kind,
          createdAt: String(at),
          room: { name: `voice-meeting-${meetingId}` },
        }),
      );
    await rooms.providerEvent(event('room_started', now - 10));
    expect(
      (
        await prisma.voiceVideoMeeting.findUniqueOrThrow({
          where: { id: meetingId },
        })
      ).roomState,
    ).toBe('active');
    await rooms.providerEvent(event('room_finished', now));
    await rooms.providerEvent(event('room_started', now - 5));
    expect(
      (
        await prisma.voiceVideoMeeting.findUniqueOrThrow({
          where: { id: meetingId },
        })
      ).status,
    ).toBe('ended');
  });

  it('handles same-second join/leave and ignores an old participant leg leaving after reconnect', async () => {
    await rooms.guestJoinToken(token);
    const row = await requested();
    await rooms.decide(
      businessId,
      userId,
      meetingId,
      row.id,
      'admitted',
      'QA admit for lifecycle events',
    );
    const now = Math.floor(Date.now() / 1000);
    const event = (kind: string, at: number, sid: string) =>
      WebhookEvent.fromJsonString(
        JSON.stringify({
          id: randomUUID(),
          event: kind,
          createdAt: String(at),
          room: { name: `voice-meeting-${meetingId}` },
          participant: { identity: row.identity, sid },
        }),
      );
    await rooms.providerEvent(event('participant_joined', now - 4, 'PA-first'));
    await rooms.providerEvent(event('participant_left', now - 4, 'PA-first'));
    expect((await requested()).providerLeftAt).not.toBeNull();
    await rooms.providerEvent(
      event('participant_joined', now - 2, 'PA-reconnect'),
    );
    await rooms.providerEvent(event('participant_left', now - 1, 'PA-first'));
    expect((await requested()).providerSid).toBe('PA-reconnect');
    expect((await requested()).providerLeftAt).toBeNull();
  });

  it('projects lifecycle only after the real LiveKit signature and body hash verify', async () => {
    const meter = new VoiceMediaMeteringService(prisma, config, rooms);
    const body = Buffer.from(
      JSON.stringify({
        id: randomUUID(),
        event: 'room_started',
        createdAt: String(Math.floor(Date.now() / 1000)),
        room: { name: `voice-meeting-${meetingId}` },
      }),
    );
    const access = new AccessToken(
      settings.LIVEKIT_API_KEY,
      settings.LIVEKIT_API_SECRET,
      { ttl: 60 },
    );
    access.sha256 = createHash('sha256').update(body).digest('base64');
    const auth = await access.toJwt();
    await expect(
      meter.livekit(
        Buffer.from(body.toString().replace('room_started', 'room_finished')),
        auth,
      ),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_VIDEO_WEBHOOK_INVALID' },
    });
    expect(
      (
        await prisma.voiceVideoMeeting.findUniqueOrThrow({
          where: { id: meetingId },
        })
      ).roomState,
    ).toBe('not_started');
    await meter.livekit(body, auth);
    expect(
      (
        await prisma.voiceVideoMeeting.findUniqueOrThrow({
          where: { id: meetingId },
        })
      ).roomState,
    ).toBe('active');
  });
});
